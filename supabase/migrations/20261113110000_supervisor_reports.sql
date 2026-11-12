-- Supervisor role: generates reports, each one approved by the Owner first.
--
-- A Supervisor joins through onboarding like other staff (the Owner assigns the
-- role and a home branch). They read no business tables directly: the policies
-- name the roles that may read each table, and supervisor is not among them
-- (checked by the who-sees-what test). Instead:
--   request_report          Supervisor asks for a sales or inventory report
--   review_report_request   Owner approves (open for 7 days) or rejects with a reason
--   get_report_data         the approved report's data only, never cost prices
-- Each step notifies the other side and is written to the audit log.

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.users ADD CONSTRAINT users_role_check
  CHECK (role IS NULL OR role IN ('owner', 'manager', 'storekeeper', 'sales_rep', 'supervisor'));

-- Onboarding approval and team edits may assign the new role (Owner only).

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
  IF p_role NOT IN ('manager', 'storekeeper', 'sales_rep', 'supervisor') THEN
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

CREATE OR REPLACE FUNCTION app_private.check_member_assignment(
  p_actor public.users, p_role TEXT, p_branch_id UUID, p_status TEXT, p_editing public.users
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
DECLARE
  v_branch public.branches;
BEGIN
  IF p_role IS NULL OR NOT COALESCE(p_role = ANY (CASE p_actor.role WHEN 'owner' THEN ARRAY['manager', 'storekeeper', 'sales_rep', 'supervisor']
                                          WHEN 'manager' THEN ARRAY['storekeeper', 'sales_rep']
                                          ELSE ARRAY[]::TEXT[] END)
          OR p_role IS NOT DISTINCT FROM p_editing.role, FALSE) THEN
    PERFORM app_private.fail('You can''t assign this role.', 'role');
  END IF;
  IF p_branch_id IS NULL THEN
    PERFORM app_private.fail('Select the branch this member works at.', 'branchId');
  END IF;
  SELECT * INTO v_branch FROM public.branches WHERE id = p_branch_id AND tenant_id = p_actor.tenant_id;
  IF NOT FOUND THEN PERFORM app_private.fail('Select a valid branch.', 'branchId'); END IF;
  IF p_actor.role = 'manager' AND v_branch.id IS DISTINCT FROM p_actor.branch_id THEN
    PERFORM app_private.fail('You can only assign members to your own branch.', 'branchId');
  END IF;
  IF v_branch.status <> 'active' AND p_status = 'active' THEN PERFORM app_private.fail('This branch is inactive.', 'branchId'); END IF;
  IF p_role = 'manager' AND v_branch.manager_id IS NOT NULL AND v_branch.manager_id IS DISTINCT FROM p_editing.id
     AND EXISTS (SELECT 1 FROM public.users WHERE id = v_branch.manager_id AND status = 'active') THEN
    PERFORM app_private.fail(v_branch.name || ' already has a manager.', 'branchId');
  END IF;
END;
$$;

-- ----------------------------------------------------------------------------
-- What a Supervisor may read directly: their own profile, their own audit entries,
-- branch names (to choose one in a request), their notifications and their own
-- report requests. The users and activities policies are tenant-wide, so these
-- restrictive policies narrow them for the supervisor role only.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS supervisor_own_profile_only ON public.users;
CREATE POLICY supervisor_own_profile_only ON public.users AS RESTRICTIVE FOR SELECT TO authenticated
  USING ((SELECT public.get_user_role()) IS DISTINCT FROM 'supervisor' OR id = (SELECT auth.uid()));
DROP POLICY IF EXISTS supervisor_own_activity_only ON public.activities;
CREATE POLICY supervisor_own_activity_only ON public.activities AS RESTRICTIVE FOR SELECT TO authenticated
  USING ((SELECT public.get_user_role()) IS DISTINCT FROM 'supervisor' OR actor_id = (SELECT auth.uid()));

-- Audit entries for report requests.
ALTER TABLE public.activities DROP CONSTRAINT IF EXISTS activities_entity_check;
ALTER TABLE public.activities ADD CONSTRAINT activities_entity_check
  CHECK (entity IN ('product', 'sale', 'payment', 'expense', 'remittance', 'stock_request', 'target',
                    'team_member', 'branch', 'inventory', 'settings', 'session', 'customer', 'report'));

-- ----------------------------------------------------------------------------
-- Report requests
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.report_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  report_type TEXT NOT NULL CHECK (report_type IN ('sales', 'inventory')),
  branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL, -- NULL: all branches
  period_from DATE NOT NULL,
  period_to DATE NOT NULL,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT,
  expires_at TIMESTAMPTZ, -- the Supervisor can open an approved report until then
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT report_requests_period CHECK (period_from <= period_to)
);
CREATE INDEX IF NOT EXISTS idx_report_requests_tenant ON public.report_requests (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_report_requests_requester ON public.report_requests (requested_by);
COMMENT ON TABLE public.report_requests IS 'Supervisor report requests; the Owner approves each one before it can be opened.';

ALTER TABLE public.report_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.report_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.report_requests TO authenticated;
DROP POLICY IF EXISTS report_requests_read ON public.report_requests;
CREATE POLICY report_requests_read ON public.report_requests AS PERMISSIVE FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.get_user_tenant_id())
         AND (requested_by = (SELECT auth.uid()) OR (SELECT public.get_user_role()) = 'owner'));

-- Notifications for the request and its outcome.
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'payment_awaiting_acknowledgement', 'payment_awaiting_confirmation',
    'payment_confirmed', 'payment_declined',
    'onboarding_submitted', 'onboarding_approved', 'onboarding_rejected',
    'guarantor_completed',
    'stock_request_submitted', 'stock_request_approved',
    'stock_request_rejected', 'stock_request_fulfilled',
    'approval_requested', 'approval_approved', 'approval_rejected',
    'report_requested', 'report_approved', 'report_rejected'
  ));
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_entity_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_entity_type_check
  CHECK (entity_type IN ('payment', 'customer_payment', 'onboarding', 'stock_request', 'approval_request', 'report_request'));

CREATE OR REPLACE FUNCTION app_private.report_label(p_request public.report_requests)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT CASE p_request.report_type WHEN 'sales' THEN 'Sales report' ELSE 'Inventory report' END
         || ' · ' || COALESCE((SELECT name FROM public.branches WHERE id = p_request.branch_id), 'All branches')
         || CASE WHEN p_request.report_type = 'sales'
                 THEN ' · ' || pg_catalog.to_char(p_request.period_from, 'DD Mon YYYY') || ' to ' || pg_catalog.to_char(p_request.period_to, 'DD Mon YYYY')
                 ELSE '' END
$$;

-- Supervisor asks for a report. Inventory is the current stock position, so its
-- period is today.
CREATE OR REPLACE FUNCTION public.request_report(
  p_report_type TEXT, p_branch_id UUID, p_period_from DATE, p_period_to DATE, p_note TEXT
)
RETURNS public.report_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
DECLARE
  v_actor public.users := app_private.actor();
  v_today DATE;
  v_row public.report_requests;
BEGIN
  IF v_actor.role <> 'supervisor' THEN PERFORM app_private.deny('Only a Supervisor requests reports'); END IF;
  IF p_report_type IS NULL OR p_report_type NOT IN ('sales', 'inventory') THEN PERFORM app_private.fail('Choose a report', 'reportType'); END IF;
  IF p_branch_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.branches WHERE id = p_branch_id AND tenant_id = v_actor.tenant_id) THEN
    PERFORM app_private.fail('Choose a branch, or all branches', 'branchId');
  END IF;
  v_today := app_private.today(v_actor.tenant_id);
  IF p_report_type = 'inventory' THEN
    p_period_from := v_today;
    p_period_to := v_today;
  ELSE
    IF p_period_from IS NULL OR p_period_to IS NULL THEN PERFORM app_private.fail('Choose the dates the report covers', 'period'); END IF;
    IF p_period_from > p_period_to THEN PERFORM app_private.fail('The start date is after the end date', 'period'); END IF;
    IF p_period_to > v_today THEN PERFORM app_private.fail('The report can not cover future dates', 'period'); END IF;
    IF p_period_to - p_period_from > 366 THEN PERFORM app_private.fail('A report can cover at most one year', 'period'); END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM public.report_requests
              WHERE requested_by = v_actor.id AND status = 'pending' AND report_type = p_report_type
                AND branch_id IS NOT DISTINCT FROM p_branch_id AND period_from = p_period_from AND period_to = p_period_to) THEN
    PERFORM app_private.fail('You already asked for this report; it is waiting for the Owner', 'form');
  END IF;

  INSERT INTO public.report_requests (tenant_id, requested_by, report_type, branch_id, period_from, period_to, note)
  VALUES (v_actor.tenant_id, v_actor.id, p_report_type, p_branch_id, p_period_from, p_period_to, NULLIF(TRIM(p_note), ''))
  RETURNING * INTO v_row;

  INSERT INTO public.notifications (tenant_id, recipient_id, type, entity_type, entity_id, message)
  SELECT v_actor.tenant_id, u.id, 'report_requested', 'report_request', v_row.id::TEXT,
         app_private.full_name(v_actor.id) || ' asked for a ' || pg_catalog.lower(app_private.report_label(v_row))
    FROM public.users u
   WHERE u.tenant_id = v_actor.tenant_id AND u.role = 'owner' AND u.status = 'active';
  PERFORM app_private.audit(v_actor, 'Report requested', app_private.report_label(v_row), 'report', v_row.id::TEXT, NULL);
  RETURN v_row;
END;
$$;

-- Owner approves (open for 7 days) or rejects with a reason.
CREATE OR REPLACE FUNCTION public.review_report_request(p_request_id UUID, p_approve BOOLEAN, p_reason TEXT)
RETURNS public.report_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
DECLARE
  v_actor public.users := app_private.actor();
  v_row public.report_requests;
BEGIN
  IF v_actor.role <> 'owner' THEN PERFORM app_private.deny('Only the Owner approves report requests'); END IF;
  SELECT * INTO v_row FROM public.report_requests WHERE id = p_request_id AND tenant_id = v_actor.tenant_id FOR UPDATE;
  IF NOT FOUND THEN PERFORM app_private.fail('Report request not found', 'form'); END IF;
  IF v_row.status <> 'pending' THEN PERFORM app_private.fail('This request was already reviewed', 'form'); END IF;
  IF p_approve IS NULL THEN PERFORM app_private.fail('Approve or reject the request', 'form'); END IF;
  IF NOT p_approve AND LENGTH(TRIM(COALESCE(p_reason, ''))) < 3 THEN
    PERFORM app_private.fail('Give the Supervisor a reason', 'reason');
  END IF;

  UPDATE public.report_requests
     SET status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
         reviewed_by = v_actor.id,
         reviewed_at = pg_catalog.now(),
         rejection_reason = CASE WHEN p_approve THEN NULL ELSE TRIM(p_reason) END,
         expires_at = CASE WHEN p_approve THEN pg_catalog.now() + INTERVAL '7 days' END
   WHERE id = v_row.id RETURNING * INTO v_row;

  INSERT INTO public.notifications (tenant_id, recipient_id, type, entity_type, entity_id, message)
  VALUES (v_row.tenant_id, v_row.requested_by,
          CASE WHEN p_approve THEN 'report_approved' ELSE 'report_rejected' END, 'report_request', v_row.id::TEXT,
          CASE WHEN p_approve
               THEN 'The Owner approved your ' || pg_catalog.lower(app_private.report_label(v_row)) || '. Open it within 7 days.'
               ELSE 'The Owner declined your ' || pg_catalog.lower(app_private.report_label(v_row)) || ': ' || TRIM(p_reason) END);
  PERFORM app_private.audit(v_actor, CASE WHEN p_approve THEN 'Report request approved' ELSE 'Report request rejected' END,
    app_private.report_label(v_row) || ' · ' || app_private.full_name(v_row.requested_by), 'report', v_row.id::TEXT, NULL);
  RETURN v_row;
END;
$$;

-- The data for one approved report, and nothing else: the Supervisor reads no
-- tables directly. Cost prices are never included.
CREATE OR REPLACE FUNCTION public.get_report_data(p_request_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
DECLARE
  v_actor public.users := app_private.actor();
  v_row public.report_requests;
  v_branches UUID[];
  v_result JSONB;
BEGIN
  SELECT * INTO v_row FROM public.report_requests WHERE id = p_request_id AND tenant_id = v_actor.tenant_id;
  IF NOT FOUND OR NOT (v_row.requested_by = v_actor.id OR v_actor.role = 'owner') THEN
    PERFORM app_private.deny('You can not open this report');
  END IF;
  IF v_row.status <> 'approved' THEN PERFORM app_private.fail('The Owner has not approved this report', 'form'); END IF;
  IF v_actor.role <> 'owner' AND v_row.expires_at < pg_catalog.now() THEN
    PERFORM app_private.fail('Access to this report has ended. Request it again.', 'form');
  END IF;

  SELECT pg_catalog.array_agg(id) INTO v_branches FROM public.branches
   WHERE tenant_id = v_row.tenant_id AND (v_row.branch_id IS NULL OR id = v_row.branch_id);

  v_result := pg_catalog.jsonb_build_object(
    'request', pg_catalog.to_jsonb(v_row),
    'branches', COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id', b.id, 'name', b.name) ORDER BY b.name)
                            FROM public.branches b WHERE b.id = ANY (v_branches)), '[]'::JSONB),
    'products', COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
                              'id', p.id, 'name', p.name, 'sku', p.sku, 'category', p.category, 'unit', p.unit,
                              'unit_price', p.unit_price, 'product_type', p.product_type, 'status', p.status) ORDER BY p.name)
                            FROM public.products p WHERE p.tenant_id = v_row.tenant_id), '[]'::JSONB),
    'people', COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
                            'id', u.id, 'name', TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')), 'role', u.role))
                          FROM public.users u WHERE u.tenant_id = v_row.tenant_id AND u.role IN ('owner', 'sales_rep')), '[]'::JSONB),
    'sales', CASE WHEN v_row.report_type <> 'sales' THEN '[]'::JSONB ELSE
               COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
                           'id', s.id, 'code', s.code, 'sale_date', s.sale_date, 'created_at', s.created_at,
                           'branch_id', s.branch_id, 'sales_rep_id', s.sales_rep_id, 'product_id', s.product_id,
                           'is_customer_sale', s.customer_id IS NOT NULL, 'quantity', s.quantity, 'unit_price', s.unit_price,
                           'discount_amount', s.discount_amount, 'line_total', s.line_total, 'is_promo', s.is_promo)
                           ORDER BY s.created_at DESC)
                          FROM public.sales s
                         WHERE s.tenant_id = v_row.tenant_id AND s.status = 'completed' AND s.branch_id = ANY (v_branches)
                           AND s.sale_date BETWEEN v_row.period_from AND v_row.period_to), '[]'::JSONB) END,
    'inventory', CASE WHEN v_row.report_type <> 'inventory' THEN '[]'::JSONB ELSE
               COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
                           'branch_id', i.branch_id, 'product_id', i.product_id, 'quantity_on_hand', i.quantity_on_hand,
                           'quantity_reserved', i.quantity_reserved, 'low_stock_threshold', i.low_stock_threshold))
                          FROM public.inventory_records i
                         WHERE i.tenant_id = v_row.tenant_id AND i.branch_id = ANY (v_branches)), '[]'::JSONB) END
  );
  PERFORM app_private.audit(v_actor, 'Report opened', app_private.report_label(v_row), 'report', v_row.id::TEXT, NULL);
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION app_private.report_label(public.report_requests) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.request_report(TEXT, UUID, DATE, DATE, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.review_report_request(UUID, BOOLEAN, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_report_data(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_report(TEXT, UUID, DATE, DATE, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_report_request(UUID, BOOLEAN, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_report_data(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
