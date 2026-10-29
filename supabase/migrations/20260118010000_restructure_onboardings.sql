-- Migration: Restructure onboardings for the invite-first flow
-- Created: 2026-01-18
-- Description: The old flow created a `users` row first, then linked an onboarding to it.
--              The new flow is invite-first: the owner creates an onboarding INVITE with a
--              hashed token; the invitee fills the form and submits (status='submitted');
--              the invitee's auth account is created via supabase.auth.signUp, which fires
--              handle_new_user to create a PENDING profile linked to the onboarding; the
--              owner then approves (or rejects). The `users` row therefore only exists
--              after the invitee signs up, and is only 'active' after approval.
--
--              This migration also defines handle_new_user() (moved here from migration 1
--              so all referenced onboardings columns exist when the function is created).

-- ============================================================================
-- 1. MAKE user_id NULLABLE (no users row until the invitee signs up)
-- ============================================================================

ALTER TABLE onboardings ALTER COLUMN user_id DROP NOT NULL;
COMMENT ON COLUMN onboardings.user_id IS 'NULL until the invitee signs up (handle_new_user sets it).';

-- ============================================================================
-- 2. ADD created_by, submitter_email, token_hash, used_at, review columns, assignment
-- ============================================================================

ALTER TABLE onboardings ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE onboardings ADD COLUMN IF NOT EXISTS submitter_email TEXT;
ALTER TABLE onboardings ADD COLUMN IF NOT EXISTS token_hash TEXT;
ALTER TABLE onboardings ADD COLUMN IF NOT EXISTS used_at TIMESTAMPTZ;
ALTER TABLE onboardings ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE onboardings ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE onboardings ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
ALTER TABLE onboardings ADD COLUMN IF NOT EXISTS assigned_role TEXT;
ALTER TABLE onboardings ADD COLUMN IF NOT EXISTS assigned_branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;

COMMENT ON COLUMN onboardings.created_by IS 'The owner who created the invite.';
COMMENT ON COLUMN onboardings.submitter_email IS 'Email the invitee entered on submit; must match the auth.signUp email.';
COMMENT ON COLUMN onboardings.token_hash IS 'SHA-256 hash of the raw invite token. Raw token is never stored.';
COMMENT ON COLUMN onboardings.used_at IS 'When the invite token was consumed (sign-up). NULL until then.';
COMMENT ON COLUMN onboardings.reviewed_by IS 'Owner who approved or rejected.';
COMMENT ON COLUMN onboardings.reviewed_at IS 'When the owner reviewed.';
COMMENT ON COLUMN onboardings.rejection_reason IS 'Reason, when status = rejected.';
COMMENT ON COLUMN onboardings.assigned_role IS 'Role chosen by the owner at approval (applied to the users row).';
COMMENT ON COLUMN onboardings.assigned_branch_id IS 'Branch chosen by the owner at approval (applied to the users row).';

-- Backfill token_hash from existing raw tokens (pre-launch: likely no rows; hash what exists).
-- We cannot reverse a raw token to a hash later, so any pre-existing rows keep their raw
-- token as the hash — acceptable because the DB is pre-launch and those invites are invalid.
UPDATE onboardings SET token_hash = token WHERE token_hash IS NULL AND token IS NOT NULL;

-- Make token_hash NOT NULL and unique. New invites always set token_hash.
ALTER TABLE onboardings ALTER COLUMN token_hash SET NOT NULL;

-- Drop the old raw-token unique constraint + column.
ALTER TABLE onboardings DROP CONSTRAINT IF EXISTS onboardings_token_key;
DROP INDEX IF EXISTS idx_onboardings_token;
ALTER TABLE onboardings DROP COLUMN IF EXISTS token;

-- Unique index on token_hash for lookups.
CREATE UNIQUE INDEX IF NOT EXISTS onboardings_token_hash_unique_idx ON onboardings(token_hash);

-- ============================================================================
-- 3. REPLACE token_used (bool) WITH used_at (timestamp)
-- ============================================================================

-- Backfill used_at from token_used where applicable.
UPDATE onboardings SET used_at = NOW() WHERE used_at IS NULL AND token_used = TRUE;

ALTER TABLE onboardings DROP COLUMN IF EXISTS token_used;
COMMENT ON COLUMN onboardings.used_at IS 'When the invite token was consumed (sign-up). NULL until then.';

-- ============================================================================
-- 4. EXTEND status ENUM: drop 'active', add 'approved' and 'rejected'
-- ============================================================================

ALTER TABLE onboardings DROP CONSTRAINT IF EXISTS onboardings_status_check;
ALTER TABLE onboardings ADD CONSTRAINT onboardings_status_check
  CHECK (status IN ('invited', 'in_progress', 'submitted', 'approved', 'rejected'));

-- Any legacy 'active' rows become 'approved' (activation now means approval).
UPDATE onboardings SET status = 'approved' WHERE status = 'active';

COMMENT ON COLUMN onboardings.status IS 'invited=link created, in_progress=form being filled, submitted=awaiting review, approved/rejected=owner decision.';

-- ============================================================================
-- 5. DROP password_set (the auth account is created by handle_new_user, not stored here)
-- ============================================================================

ALTER TABLE onboardings DROP COLUMN IF EXISTS password_set;

-- ============================================================================
-- 6. INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_onboardings_created_by ON onboardings(created_by);
CREATE INDEX IF NOT EXISTS idx_onboardings_status ON onboardings(status);
CREATE INDEX IF NOT EXISTS idx_onboardings_tenant_status ON onboardings(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_onboardings_user ON onboardings(user_id) WHERE user_id IS NOT NULL;

-- ============================================================================
-- 7. HANDLE_NEW_USER TRIGGER FUNCTION (moved from migration 1)
-- ============================================================================
-- Runs AFTER a row is inserted into auth.users (supabase.auth.signUp). Reads
-- raw_user_meta_data and creates the matching public.users profile. Two valid paths:
--   (A) is_owner = true AND no owner exists  -> create tenant + owner (status='active')
--   (B) onboarding_id + onboarding_token_hash present and valid -> create pending profile
-- Any other signup raises, rolling back the auth.users insert (sign-up is closed).

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_is_owner        BOOLEAN;
  v_onboarding_id   UUID;
  v_token_hash      TEXT;
  v_first_name      TEXT;
  v_last_name       TEXT;
  v_org_name        TEXT;
  v_org_legal_name  TEXT;
  v_org_phone       TEXT;
  v_tenant_id       UUID;
  v_onb             RECORD;
BEGIN
  v_is_owner       := COALESCE((NEW.raw_user_meta_data ->> 'is_owner')::BOOLEAN, FALSE);
  v_onboarding_id  := NULLIF(NEW.raw_user_meta_data ->> 'onboarding_id', '')::UUID;
  v_token_hash     := NEW.raw_user_meta_data ->> 'onboarding_token_hash';
  v_first_name      := COALESCE(NEW.raw_user_meta_data ->> 'first_name', '');
  v_last_name       := COALESCE(NEW.raw_user_meta_data ->> 'last_name', '');
  v_org_name        := NEW.raw_user_meta_data ->> 'org_name';
  v_org_legal_name  := NEW.raw_user_meta_data ->> 'org_legal_name';
  v_org_phone       := NEW.raw_user_meta_data ->> 'org_phone';

  ------------------------------------------------------------------
  -- Path A: first-owner bootstrap
  ------------------------------------------------------------------
  IF v_is_owner THEN
    IF EXISTS (SELECT 1 FROM public.users WHERE role = 'owner') THEN
      RAISE EXCEPTION 'Owner account already exists. Sign-up is closed.';
    END IF;

    INSERT INTO public.tenants (name, legal_name, business_email, phone)
    VALUES (
      COALESCE(NULLIF(v_org_name, ''), 'My Organization'),
      COALESCE(NULLIF(v_org_legal_name, ''), COALESCE(NULLIF(v_org_name, ''), 'My Organization')),
      COALESCE(NEW.email, ''),
      COALESCE(NULLIF(v_org_phone, ''), '')
    )
    RETURNING id INTO v_tenant_id;

    INSERT INTO public.users (id, tenant_id, first_name, last_name, email, phone, role, status, joined_at)
    VALUES (NEW.id, v_tenant_id, v_first_name, v_last_name, NEW.email, NULL, 'owner', 'active', NOW());

    RETURN NEW;
  END IF;

  ------------------------------------------------------------------
  -- Path B: staff onboarding signup
  ------------------------------------------------------------------
  IF v_onboarding_id IS NOT NULL THEN
    SELECT * INTO v_onb FROM public.onboardings
    WHERE id = v_onboarding_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Invalid onboarding invitation.';
    END IF;

    IF v_onb.token_hash IS DISTINCT FROM v_token_hash THEN
      RAISE EXCEPTION 'Invalid onboarding invitation token.';
    END IF;
    IF v_onb.status <> 'submitted' THEN
      RAISE EXCEPTION 'The onboarding form must be submitted before creating an account.';
    END IF;
    IF v_onb.user_id IS NOT NULL THEN
      RAISE EXCEPTION 'This onboarding invitation has already been used.';
    END IF;
    IF v_onb.token_revoked THEN
      RAISE EXCEPTION 'This onboarding invitation has been revoked.';
    END IF;
    IF v_onb.token_expires_at < NOW() THEN
      RAISE EXCEPTION 'This onboarding invitation has expired.';
    END IF;
    IF v_onb.submitter_email IS NOT NULL AND v_onb.submitter_email <> LOWER(NEW.email) THEN
      RAISE EXCEPTION 'The email does not match the onboarding submission.';
    END IF;

    -- Create a PENDING profile. role is NULL -> get_user_role() returns NULL -> all
    -- role-based RLS policies deny. The owner assigns role + branch at approval.
    INSERT INTO public.users (id, tenant_id, first_name, last_name, email, phone, role, status)
    VALUES (NEW.id, v_onb.tenant_id, v_first_name, v_last_name, NEW.email, NULL, NULL, 'pending');

    -- Link the onboarding to the new user and consume the token.
    UPDATE public.onboardings
    SET user_id = NEW.id,
        used_at = NOW()
    WHERE id = v_onboarding_id;

    RETURN NEW;
  END IF;

  ------------------------------------------------------------------
  -- Path C: anything else -> closed
  ------------------------------------------------------------------
  RAISE EXCEPTION 'Sign-up is closed. Ask your organization owner for an invite.';
END;
$$;

COMMENT ON FUNCTION public.handle_new_user IS 'Auto-creates a public.users profile on auth.users insert. Bootstraps the first owner, or validates an onboarding invite and creates a pending staff profile. Rejects all other signups.';

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
