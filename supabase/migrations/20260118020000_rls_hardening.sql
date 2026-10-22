-- Migration: RLS hardening for auth/onboarding/team
-- Created: 2026-01-18
-- Description: Tighten authorization so that:
--   * pending / rejected / suspended / inactive users are denied everywhere (the role
--     helper functions now require status = 'active');
--   * only the owner can modify users rows, and no user can change their own
--     role / status / tenant_id (anti-elevation trigger);
--   * public onboarding access no longer SELECTs rows by a raw token (the raw token is
--     gone). Anon access is via the get_onboarding_by_token() RPC (defined in migration 4)
--     which hashes the token server-side. Only the owner and the linked user read
--     onboardings directly;
--   * onboarding_files is readable by the owner and the linked user; writes go through
--     SECURITY DEFINER RPCs.

-- ============================================================================
-- 1. ROLE / TENANT / BRANCH HELPERS REQUIRE status = 'active'
-- ============================================================================
-- Every role-based policy calls these, so non-active users are automatically excluded
-- from sales, payments, inventory, approvals, targets, team, reports, etc.

CREATE OR REPLACE FUNCTION get_user_role()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT role FROM public.users WHERE id = auth.uid() AND status = 'active';
$$;

CREATE OR REPLACE FUNCTION get_user_tenant_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT tenant_id FROM public.users WHERE id = auth.uid() AND status = 'active';
$$;

CREATE OR REPLACE FUNCTION get_user_branch_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT branch_id FROM public.users WHERE id = auth.uid() AND status = 'active';
$$;

COMMENT ON FUNCTION get_user_role IS 'Returns the role only when the caller is an ACTIVE user; NULL otherwise (denies all role-based RLS).';
COMMENT ON FUNCTION get_user_tenant_id IS 'Returns the tenant_id only for ACTIVE users; NULL otherwise.';
COMMENT ON FUNCTION get_user_branch_id IS 'Returns the branch_id only for ACTIVE users; NULL otherwise.';

-- ============================================================================
-- 2. USERS — split SELECT / UPDATE, owner-only writes, anti-elevation
-- ============================================================================

DROP POLICY IF EXISTS tenant_isolation_users ON users;

-- Active tenant members can read other users in their tenant (team list, reports).
-- Pending users get NULL from get_user_tenant_id(), so this denies them.
CREATE POLICY users_select_tenant ON users
  FOR SELECT
  USING (tenant_id = get_user_tenant_id());

-- Only an active owner can UPDATE users. The approval RPC bypasses RLS (SECURITY DEFINER),
-- so activation still works; this policy covers direct client updates from the Team page.
CREATE POLICY users_update_owner ON users
  FOR UPDATE
  USING (get_user_role() = 'owner')
  WITH CHECK (get_user_role() = 'owner');

-- Only an active owner can INSERT new users directly (rare; onboarding creates profiles
-- via the trigger). The owner cannot create another owner (CHECK).
CREATE POLICY users_insert_owner ON users
  FOR INSERT
  WITH CHECK (
    get_user_role() = 'owner'
    AND role IS DISTINCT FROM 'owner'
  );

-- DELETE: owner only, never the owner row.
CREATE POLICY users_delete_owner ON users
  FOR DELETE
  USING (get_user_role() = 'owner' AND role IS DISTINCT FROM 'owner');

-- ----------------------------------------------------------------------------
-- Anti-elevation trigger: a user can never change their own role / status / tenant.
-- The approval RPC runs as the owner (auth.uid() = owner), so updating a staff row
-- (NEW.id <> owner id) is not blocked. The owner editing their own row is blocked
-- from changing these protected fields (which they should never need to).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prevent_user_self_elevation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.id = auth.uid() THEN
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION 'You cannot change your own role.';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'You cannot change your own status.';
    END IF;
    IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
      RAISE EXCEPTION 'You cannot change your own organization.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.prevent_user_self_elevation IS 'Blocks a user from changing their own role/status/tenant_id.';

DROP TRIGGER IF EXISTS prevent_user_self_elevation ON users;
CREATE TRIGGER prevent_user_self_elevation
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION public.prevent_user_self_elevation();

-- ============================================================================
-- 3. ONBOARDINGS — drop raw-token public SELECT, owner + linked-user read only
-- ============================================================================

-- The old public-by-token policy referenced the now-dropped token_used column; remove it
-- and any owner-all / user-own policies so we can redefine cleanly.
DROP POLICY IF EXISTS onboardings_public_by_token ON onboardings;
DROP POLICY IF EXISTS onboardings_owner_all ON onboardings;
DROP POLICY IF EXISTS onboardings_user_own ON onboardings;

-- Active owner: full access within their tenant.
CREATE POLICY onboardings_owner_all ON onboardings
  FOR ALL
  USING (get_user_role() = 'owner' AND tenant_id = get_user_tenant_id())
  WITH CHECK (get_user_role() = 'owner' AND tenant_id = get_user_tenant_id());

-- The linked invitee can READ their own onboarding (after sign-up, status='pending' so
-- get_user_role() is NULL — but they still need to see their submission status). Allow
-- SELECT by user_id = auth.uid() regardless of status (the profile row exists).
-- Note: this is SELECT only; they cannot modify it.
CREATE POLICY onboardings_user_own_read ON onboardings
  FOR SELECT
  USING (user_id = auth.uid());

-- No anon policy: the public form fetches via get_onboarding_by_token() RPC.

-- ============================================================================
-- 4. ONBOARDING_FILES — owner + linked-user read; writes via RPCs only
-- ============================================================================

DROP POLICY IF EXISTS onboarding_files_owner ON onboarding_files;

CREATE POLICY onboarding_files_owner_read ON onboarding_files
  FOR SELECT
  USING (
    get_user_role() = 'owner'
    AND EXISTS (
      SELECT 1 FROM onboardings o
      WHERE o.id = onboarding_files.onboarding_id
        AND o.tenant_id = get_user_tenant_id()
    )
  );

CREATE POLICY onboarding_files_user_own_read ON onboarding_files
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM onboardings o
      WHERE o.id = onboarding_files.onboarding_id
        AND o.user_id = auth.uid()
    )
  );

-- No direct INSERT/UPDATE/DELETE: the register_onboarding_file / approval RPCs
-- (SECURITY DEFINER) handle writes.

-- ============================================================================
-- 5. USER_PREFERENCES — keep self-only (already correct), but require active
-- ============================================================================
-- The existing user_preferences_own policy uses user_id = auth.uid(); that still lets a
-- pending user read/ write preferences. Tighten to active users.

DROP POLICY IF EXISTS user_preferences_own ON user_preferences;
CREATE POLICY user_preferences_own ON user_preferences
  FOR ALL
  USING (user_id = auth.uid() AND get_user_tenant_id() IS NOT NULL)
  WITH CHECK (user_id = auth.uid() AND get_user_tenant_id() IS NOT NULL);

-- ============================================================================
-- 6. NOTIFICATIONS — recipient must be active
-- ============================================================================

DROP POLICY IF EXISTS notifications_own ON notifications;
CREATE POLICY notifications_own ON notifications
  FOR SELECT
  USING (recipient_id = auth.uid() AND get_user_tenant_id() IS NOT NULL);

CREATE POLICY notifications_update_own ON notifications
  FOR UPDATE
  USING (recipient_id = auth.uid() AND get_user_tenant_id() IS NOT NULL)
  WITH CHECK (recipient_id = auth.uid() AND get_user_tenant_id() IS NOT NULL);

-- Inserts go through the create_notification() SECURITY DEFINER function (RLS-bypassed).
