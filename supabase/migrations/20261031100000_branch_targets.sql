-- Branch targets: the Owner sets a monthly sales target for a whole branch.
-- targets already allows scope 'branch' (user_id NULL, one per branch and
-- month via targets_branch_unique_idx); this adds the write path. Achievement
-- is the branch's completed sales, as for the branch performance views.

CREATE OR REPLACE FUNCTION public.create_branch_target(p_branch_id UUID, p_month TEXT, p_amount NUMERIC)
RETURNS public.targets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
DECLARE
  v_actor public.users := app_private.actor();
  v_branch public.branches;
  v_row public.targets;
BEGIN
  IF v_actor.role <> 'owner' THEN PERFORM app_private.deny('You cannot set targets'); END IF;
  SELECT * INTO v_branch FROM public.branches WHERE id = p_branch_id AND tenant_id = v_actor.tenant_id;
  IF NOT FOUND OR v_branch.status <> 'active' THEN PERFORM app_private.fail('Select an active branch', 'branchId'); END IF;
  IF COALESCE(p_month !~ '^\d{4}-(0[1-9]|1[0-2])$', TRUE) THEN PERFORM app_private.fail('Select a month', 'month'); END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN PERFORM app_private.fail('Enter a target above zero', 'amount'); END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_branch.id::TEXT || p_month, 0));
  IF EXISTS (SELECT 1 FROM public.targets WHERE scope = 'branch' AND branch_id = v_branch.id AND month = p_month) THEN
    PERFORM app_private.fail('This branch already has a target for that month — edit it instead', 'branchId');
  END IF;
  INSERT INTO public.targets (tenant_id, scope, branch_id, user_id, month, amount)
  VALUES (v_actor.tenant_id, 'branch', v_branch.id, NULL, p_month, ROUND(p_amount))
  RETURNING * INTO v_row;
  PERFORM app_private.audit(v_actor, 'Target created',
    v_branch.name || ' branch · ' || p_month || ' · ₦' || pg_catalog.to_char(v_row.amount, 'FM999,999,999,990'),
    'target', v_row.id::TEXT, pg_catalog.jsonb_build_object('branchId', v_row.branch_id));
  RETURN v_row;
END;
$$;

-- Only the amount changes; sales history is never touched. Rep targets are
-- checked exactly as before (20261023130000); branch targets need their branch
-- to be active in the Owner's tenant.
CREATE OR REPLACE FUNCTION public.update_target_amount(p_target_id UUID, p_amount NUMERIC)
RETURNS public.targets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
DECLARE
  v_actor public.users := app_private.actor();
  v_row public.targets;
  v_old NUMERIC;
  v_label TEXT;
BEGIN
  IF v_actor.role <> 'owner' THEN PERFORM app_private.deny('You cannot edit targets'); END IF;
  SELECT * INTO v_row FROM public.targets WHERE id = p_target_id AND tenant_id = v_actor.tenant_id FOR UPDATE;
  IF NOT FOUND THEN PERFORM app_private.fail('Target not found'); END IF;
  IF v_row.scope = 'rep' THEN
    PERFORM app_private.check_target_rep(v_actor, v_row.user_id);
    v_label := app_private.full_name(v_row.user_id);
  ELSE
    SELECT b.name || ' branch' INTO v_label FROM public.branches b
     WHERE b.id = v_row.branch_id AND b.tenant_id = v_actor.tenant_id AND b.status = 'active';
    IF NOT FOUND THEN PERFORM app_private.fail('This branch is inactive', 'branchId'); END IF;
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN PERFORM app_private.fail('Enter a target above zero', 'amount'); END IF;
  v_old := v_row.amount;
  UPDATE public.targets SET amount = ROUND(p_amount), updated_at = pg_catalog.now() WHERE id = v_row.id RETURNING * INTO v_row;
  PERFORM app_private.audit(v_actor, 'Target updated',
    v_label || ' · ' || v_row.month || ' · ₦' || pg_catalog.to_char(v_old, 'FM999,999,999,990')
      || ' → ₦' || pg_catalog.to_char(v_row.amount, 'FM999,999,999,990'),
    'target', v_row.id::TEXT, pg_catalog.jsonb_build_object('branchId', v_row.branch_id));
  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.create_branch_target(UUID, TEXT, NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_branch_target(UUID, TEXT, NUMERIC) TO authenticated;
