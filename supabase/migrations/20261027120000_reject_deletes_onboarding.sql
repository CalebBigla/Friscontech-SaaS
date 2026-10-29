-- ============================================================================
-- Reject deletes the submission and the staff member's login
-- ============================================================================
-- The owner reviews and approves only onboardings that are linked to a real
-- account (auth.users + public.users). Rejecting is final and removes the data:
--   * the onboarding row (its file rows cascade);
--   * the staff member's login: auth.users, which cascades to their pending
--     public.users profile and notifications. Only a pending (or legacy
--     'rejected') profile without a role is ever deleted.
-- The audit log keeps who rejected whom and why. Uploaded files are removed
-- from storage by the app before this call (Storage API; SQL cannot).
-- The email can be invited again afterwards. Corrections are unchanged.
--
-- approve_onboarding is restored exactly as in
-- 20261020100000_require_branch_for_onboarding.sql (it requires the linked
-- account), in case the reverted 20261027110000 version was applied.
-- No RLS policy or grant is changed.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.reject_onboarding(
  p_onboarding_id UUID,
  p_reason TEXT
)
RETURNS TABLE (id UUID, status TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_onb RECORD;
  v_actor UUID := auth.uid();
BEGIN
  IF COALESCE(public.get_user_role() = 'owner', FALSE) = FALSE THEN
    RAISE EXCEPTION 'Only the owner can reject onboarding submissions.';
  END IF;
  IF COALESCE(length(TRIM(p_reason)), 0) < 5 THEN
    RAISE EXCEPTION 'Give a reason for rejecting.';
  END IF;

  SELECT o.* INTO v_onb FROM public.onboardings AS o
  WHERE o.id = p_onboarding_id AND o.tenant_id = public.get_user_tenant_id()
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Onboarding not found.'; END IF;
  IF v_onb.status NOT IN ('submitted') THEN
    RAISE EXCEPTION 'Only a submitted onboarding can be rejected.';
  END IF;

  PERFORM public.create_audit_log(
    v_onb.tenant_id, v_actor,
    'Team onboarding rejected and deleted',
    CONCAT_WS(' · ', v_onb.employee_id,
      NULLIF(TRIM(CONCAT_WS(' ', v_onb.data ->> 'firstName', v_onb.data ->> 'lastName')), ''),
      v_onb.submitter_email, TRIM(p_reason)),
    'team_member', v_onb.id::TEXT, FALSE, NULL
  );

  DELETE FROM public.onboardings AS o WHERE o.id = v_onb.id;

  IF v_onb.user_id IS NOT NULL THEN
    -- Deleting the login cascades to the pending profile and its notifications.
    DELETE FROM auth.users AS au
    WHERE au.id = v_onb.user_id
      AND EXISTS (
        SELECT 1 FROM public.users AS u
        WHERE u.id = au.id AND u.role IS NULL AND u.status IN ('pending', 'rejected')
      );
  END IF;

  RETURN QUERY SELECT v_onb.id, 'rejected'::TEXT;
END;
$$;

COMMENT ON FUNCTION public.reject_onboarding IS 'Owner: reject a submitted onboarding. Deletes the onboarding and the pending staff login (auth.users -> users); the audit log keeps the record.';

CREATE OR REPLACE FUNCTION public.approve_onboarding(
  p_onboarding_id UUID,
  p_role TEXT,
  p_branch_id UUID
)
RETURNS TABLE (user_id UUID, onboarding_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_onb RECORD;
  v_branch RECORD;
  v_actor UUID := auth.uid();
  v_manager_id UUID;
BEGIN
  IF public.get_user_role() <> 'owner' THEN
    RAISE EXCEPTION 'Only the owner can approve staff.';
  END IF;
  IF p_role NOT IN ('manager', 'storekeeper', 'sales_rep') THEN
    RAISE EXCEPTION 'Invalid role.';
  END IF;

  SELECT * INTO v_onb
  FROM public.onboardings
  WHERE id = p_onboarding_id AND tenant_id = public.get_user_tenant_id()
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Onboarding not found.'; END IF;
  IF v_onb.status <> 'submitted' THEN
    RAISE EXCEPTION 'Only a submitted onboarding can be approved.';
  END IF;
  IF v_onb.user_id IS NULL THEN
    RAISE EXCEPTION 'The staff member has not created their account yet.';
  END IF;
  IF v_onb.guarantor_decision IS DISTINCT FROM 'accepted' THEN
    RAISE EXCEPTION 'Accept the guarantor response before approving.';
  END IF;
  IF p_branch_id IS NULL THEN
    RAISE EXCEPTION 'Select an active branch for this staff member.';
  END IF;

  SELECT * INTO v_branch
  FROM public.branches
  WHERE id = p_branch_id AND tenant_id = v_onb.tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Branch not found in this organization.'; END IF;
  IF v_branch.status <> 'active' THEN RAISE EXCEPTION 'Branch is not active.'; END IF;

  IF p_role = 'manager' THEN
    IF v_branch.manager_id IS NOT NULL AND v_branch.manager_id <> v_onb.user_id THEN
      RAISE EXCEPTION 'This branch already has a manager.';
    END IF;
    v_manager_id := NULL;
    UPDATE public.branches
    SET manager_id = v_onb.user_id
    WHERE id = v_branch.id;
  ELSE
    v_manager_id := v_branch.manager_id;
  END IF;

  UPDATE public.users
  SET status = 'active',
      role = p_role,
      branch_id = p_branch_id,
      manager_id = v_manager_id,
      joined_at = NOW()
  WHERE id = v_onb.user_id AND tenant_id = v_onb.tenant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'The staff profile was not found in this organization.'; END IF;

  UPDATE public.onboardings
  SET status = 'approved',
      reviewed_by = v_actor,
      reviewed_at = NOW(),
      activated_at = NOW(),
      assigned_role = p_role,
      assigned_branch_id = p_branch_id
  WHERE id = v_onb.id;

  PERFORM public.create_audit_log(
    v_onb.tenant_id, v_actor,
    'Team member activated after onboarding',
    v_onb.employee_id || ' · ' || p_role,
    'team_member', v_onb.id::TEXT, FALSE,
    jsonb_build_object('user_id', v_onb.user_id, 'role', p_role, 'branch_id', p_branch_id)
  );

  INSERT INTO public.notifications (tenant_id, recipient_id, type, entity_type, entity_id, message)
  VALUES (v_onb.tenant_id, v_onb.user_id, 'onboarding_approved', 'onboarding', v_onb.id::TEXT,
          'Your account has been activated. You can now sign in.' );

  RETURN QUERY SELECT v_onb.user_id, v_onb.id;
END;
$$;
