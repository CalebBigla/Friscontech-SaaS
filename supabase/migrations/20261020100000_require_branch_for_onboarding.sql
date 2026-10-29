-- Branches are created independently of staff. During approval, every staff role
-- must be assigned to an active branch; approving a manager also sets that
-- branch's manager_id in the same transaction.

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

COMMENT ON FUNCTION public.approve_onboarding(UUID, TEXT, UUID) IS
  'Owner: approve onboarding only after assigning an active branch; manager approval also assigns that branch manager.';
