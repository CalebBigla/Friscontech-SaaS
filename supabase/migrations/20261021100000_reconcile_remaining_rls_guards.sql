-- Replace tenant-only permissive policies with restrictive tenant boundaries.
-- Add the role-scoped permissive policies required by the existing workflows.
-- This migration preserves RLS and does not modify table data.

DO $preflight$
DECLARE
  v_missing TEXT[];
  v_table RECORD;
BEGIN
  IF to_regprocedure('public.get_user_role()') IS NULL
     OR to_regprocedure('public.get_user_tenant_id()') IS NULL
     OR to_regprocedure('public.get_user_branch_id()') IS NULL THEN
    RAISE EXCEPTION 'RLS guard migration aborted: active-user authorization helpers are missing.';
  END IF;

  SELECT array_agg(required.table_name || '.' || required.column_name)
    INTO v_missing
  FROM (VALUES
    ('branches', 'tenant_id'), ('users', 'tenant_id'),
    ('products', 'tenant_id'), ('inventory_records', 'tenant_id'),
    ('inventory_movements', 'tenant_id'), ('stock_batches', 'tenant_id'),
    ('customers', 'tenant_id'), ('sales', 'tenant_id'),
    ('customer_payments', 'tenant_id'), ('payments', 'tenant_id'),
    ('expenses', 'tenant_id'), ('manager_remittances', 'tenant_id'),
    ('owner_remittances', 'tenant_id'), ('stock_requests', 'tenant_id'),
    ('targets', 'tenant_id'), ('approval_requests', 'tenant_id'),
    ('onboardings', 'tenant_id'), ('activities', 'tenant_id'),
    ('notifications', 'tenant_id'), ('tenants', 'id')
  ) AS required(table_name, column_name)
  LEFT JOIN information_schema.columns c
    ON c.table_schema = 'public'
   AND c.table_name = required.table_name
   AND c.column_name = required.column_name
  WHERE c.column_name IS NULL;

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'RLS guard migration aborted: required columns are missing: %',
      array_to_string(v_missing, ', ');
  END IF;

  FOR v_table IN
    SELECT table_name
    FROM (VALUES
      ('branches'), ('users'), ('products'), ('inventory_records'),
      ('inventory_movements'), ('stock_batches'), ('customers'), ('sales'),
      ('customer_payments'), ('payments'), ('expenses'),
      ('manager_remittances'), ('owner_remittances'), ('stock_requests'),
      ('targets'), ('approval_requests'), ('activities'),
      ('notifications'), ('tenants')
    ) AS tables(table_name)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c
      WHERE c.oid = format('public.%I', v_table.table_name)::regclass
        AND c.relrowsecurity
    ) THEN
      RAISE EXCEPTION 'RLS guard migration aborted: RLS is not enabled on public.%', v_table.table_name;
    END IF;
  END LOOP;
END;
$preflight$;

-- Remove the permissive tenant-only policies. A tenant boundary must be
-- restrictive so it is ANDed with role-specific policies for every command.
DO $tenant_guards$
DECLARE
  v_policy RECORD;
  v_tenant_expr TEXT;
BEGIN
  FOR v_policy IN
    SELECT * FROM (VALUES
      ('branches', 'tenant_isolation_branches', 'tenant_id'),
      ('users', 'tenant_isolation_users', 'tenant_id'),
      ('products', 'tenant_isolation_products', 'tenant_id'),
      ('inventory_records', 'tenant_isolation_inventory', 'tenant_id'),
      ('inventory_movements', 'tenant_isolation_movements', 'tenant_id'),
      ('stock_batches', 'tenant_isolation_batches', 'tenant_id'),
      ('customers', 'tenant_isolation_customers', 'tenant_id'),
      ('sales', 'tenant_isolation_sales', 'tenant_id'),
      ('customer_payments', 'tenant_isolation_customer_payments', 'tenant_id'),
      ('payments', 'tenant_isolation_payments', 'tenant_id'),
      ('expenses', 'tenant_isolation_expenses', 'tenant_id'),
      ('manager_remittances', 'tenant_isolation_manager_remittances', 'tenant_id'),
      ('owner_remittances', 'tenant_isolation_owner_remittances', 'tenant_id'),
      ('stock_requests', 'tenant_isolation_stock_requests', 'tenant_id'),
      ('targets', 'tenant_isolation_targets', 'tenant_id'),
      ('approval_requests', 'tenant_isolation_approvals', 'tenant_id'),
      ('activities', 'tenant_isolation_activities', 'tenant_id'),
      ('notifications', 'tenant_isolation_notifications', 'tenant_id'),
      ('tenants', 'tenant_isolation_tenants', 'id')
    ) AS policies(table_name, policy_name, tenant_column)
  LOOP
    v_tenant_expr := format('%I = public.get_user_tenant_id()', v_policy.tenant_column);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_policy.policy_name, v_policy.table_name);
    EXECUTE format('DROP POLICY IF EXISTS tenant_scope_guard ON public.%I', v_policy.table_name);
    EXECUTE format(
      'CREATE POLICY tenant_scope_guard ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (%s) WITH CHECK (%s)',
      v_policy.table_name, v_tenant_expr, v_tenant_expr
    );
  END LOOP;
END;
$tenant_guards$;

-- Pending invitees may read their own onboarding record even though the active
-- profile helpers intentionally return NULL until activation. Keep that narrow
-- self-read exception while all onboarding writes remain active-Owner scoped.
DROP POLICY IF EXISTS tenant_isolation_onboardings ON public.onboardings;
DROP POLICY IF EXISTS onboardings_select_tenant_guard ON public.onboardings;
CREATE POLICY onboardings_select_tenant_guard ON public.onboardings AS RESTRICTIVE
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id() OR user_id = auth.uid());
DROP POLICY IF EXISTS onboardings_insert_tenant_guard ON public.onboardings;
CREATE POLICY onboardings_insert_tenant_guard ON public.onboardings AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant_id());
DROP POLICY IF EXISTS onboardings_update_tenant_guard ON public.onboardings;
CREATE POLICY onboardings_update_tenant_guard ON public.onboardings AS RESTRICTIVE
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_user_tenant_id())
  WITH CHECK (tenant_id = public.get_user_tenant_id());
DROP POLICY IF EXISTS onboardings_delete_tenant_guard ON public.onboardings;
CREATE POLICY onboardings_delete_tenant_guard ON public.onboardings AS RESTRICTIVE
  FOR DELETE TO authenticated
  USING (tenant_id = public.get_user_tenant_id());

-- Owner/Manager access to organization settings.
DROP POLICY IF EXISTS tenant_owner_manage ON public.tenants;
CREATE POLICY tenant_owner_manage ON public.tenants AS PERMISSIVE
  FOR ALL TO authenticated
  USING (public.get_user_role() = 'owner' AND id = public.get_user_tenant_id())
  WITH CHECK (public.get_user_role() = 'owner' AND id = public.get_user_tenant_id());
DROP POLICY IF EXISTS tenant_manager_read ON public.tenants;
CREATE POLICY tenant_manager_read ON public.tenants AS PERMISSIVE
  FOR SELECT TO authenticated
  USING (public.get_user_role() = 'manager' AND id = public.get_user_tenant_id());

-- Preserve branch-level stock access and tenant-wide Owner reads.
DROP POLICY IF EXISTS stock_batches_owner_tenant ON public.stock_batches;
CREATE POLICY stock_batches_owner_tenant ON public.stock_batches AS PERMISSIVE
  FOR SELECT TO authenticated
  USING (public.get_user_role() = 'owner' AND tenant_id = public.get_user_tenant_id());
DROP POLICY IF EXISTS stock_batches_storekeeper_branch ON public.stock_batches;
CREATE POLICY stock_batches_storekeeper_branch ON public.stock_batches AS PERMISSIVE
  FOR ALL TO authenticated
  USING (public.get_user_role() = 'storekeeper'
    AND tenant_id = public.get_user_tenant_id()
    AND branch_id = public.get_user_branch_id())
  WITH CHECK (public.get_user_role() = 'storekeeper'
    AND tenant_id = public.get_user_tenant_id()
    AND branch_id = public.get_user_branch_id());

-- Owner and Manager access to payment workflows; reps retain their own-row policies.
DROP POLICY IF EXISTS customer_payments_manager_branch ON public.customer_payments;
CREATE POLICY customer_payments_manager_branch ON public.customer_payments AS PERMISSIVE
  FOR ALL TO authenticated
  USING (public.get_user_role() = 'manager'
    AND tenant_id = public.get_user_tenant_id()
    AND branch_id = public.get_user_branch_id())
  WITH CHECK (public.get_user_role() = 'manager'
    AND tenant_id = public.get_user_tenant_id()
    AND branch_id = public.get_user_branch_id());
DROP POLICY IF EXISTS customer_payments_owner_tenant ON public.customer_payments;
CREATE POLICY customer_payments_owner_tenant ON public.customer_payments AS PERMISSIVE
  FOR ALL TO authenticated
  USING (public.get_user_role() = 'owner' AND tenant_id = public.get_user_tenant_id())
  WITH CHECK (public.get_user_role() = 'owner' AND tenant_id = public.get_user_tenant_id());

DROP POLICY IF EXISTS payments_manager_branch ON public.payments;
CREATE POLICY payments_manager_branch ON public.payments AS PERMISSIVE
  FOR ALL TO authenticated
  USING (public.get_user_role() = 'manager'
    AND tenant_id = public.get_user_tenant_id()
    AND branch_id = public.get_user_branch_id())
  WITH CHECK (public.get_user_role() = 'manager'
    AND tenant_id = public.get_user_tenant_id()
    AND branch_id = public.get_user_branch_id());
DROP POLICY IF EXISTS payments_owner_tenant ON public.payments;
CREATE POLICY payments_owner_tenant ON public.payments AS PERMISSIVE
  FOR ALL TO authenticated
  USING (public.get_user_role() = 'owner' AND tenant_id = public.get_user_tenant_id())
  WITH CHECK (public.get_user_role() = 'owner' AND tenant_id = public.get_user_tenant_id());

DROP POLICY IF EXISTS expenses_manager_branch ON public.expenses;
CREATE POLICY expenses_manager_branch ON public.expenses AS PERMISSIVE
  FOR ALL TO authenticated
  USING (public.get_user_role() = 'manager'
    AND tenant_id = public.get_user_tenant_id()
    AND manager_id = auth.uid())
  WITH CHECK (public.get_user_role() = 'manager'
    AND tenant_id = public.get_user_tenant_id()
    AND manager_id = auth.uid());
DROP POLICY IF EXISTS expenses_owner_tenant ON public.expenses;
CREATE POLICY expenses_owner_tenant ON public.expenses AS PERMISSIVE
  FOR ALL TO authenticated
  USING (public.get_user_role() = 'owner' AND tenant_id = public.get_user_tenant_id())
  WITH CHECK (public.get_user_role() = 'owner' AND tenant_id = public.get_user_tenant_id());

DROP POLICY IF EXISTS manager_remittances_manager_own ON public.manager_remittances;
CREATE POLICY manager_remittances_manager_own ON public.manager_remittances AS PERMISSIVE
  FOR ALL TO authenticated
  USING (public.get_user_role() = 'manager'
    AND tenant_id = public.get_user_tenant_id()
    AND manager_id = auth.uid())
  WITH CHECK (public.get_user_role() = 'manager'
    AND tenant_id = public.get_user_tenant_id()
    AND manager_id = auth.uid());
DROP POLICY IF EXISTS manager_remittances_owner_tenant ON public.manager_remittances;
CREATE POLICY manager_remittances_owner_tenant ON public.manager_remittances AS PERMISSIVE
  FOR ALL TO authenticated
  USING (public.get_user_role() = 'owner' AND tenant_id = public.get_user_tenant_id())
  WITH CHECK (public.get_user_role() = 'owner' AND tenant_id = public.get_user_tenant_id());

DROP POLICY IF EXISTS owner_remittances_owner_tenant ON public.owner_remittances;
CREATE POLICY owner_remittances_owner_tenant ON public.owner_remittances AS PERMISSIVE
  FOR ALL TO authenticated
  USING (public.get_user_role() = 'owner' AND tenant_id = public.get_user_tenant_id())
  WITH CHECK (public.get_user_role() = 'owner' AND tenant_id = public.get_user_tenant_id());

-- The Owner can inspect requests in the tenant; operational write policies
-- remain role and branch scoped.
DROP POLICY IF EXISTS stock_requests_owner_read ON public.stock_requests;
CREATE POLICY stock_requests_owner_read ON public.stock_requests AS PERMISSIVE
  FOR SELECT TO authenticated
  USING (public.get_user_role() = 'owner' AND tenant_id = public.get_user_tenant_id());

-- Restore explicit scoped approval policies after the cleanup migration removes
-- the old unscoped policy names.
DROP POLICY IF EXISTS approvals_owner_tenant ON public.approval_requests;
CREATE POLICY approvals_owner_tenant ON public.approval_requests AS PERMISSIVE
  FOR ALL TO authenticated
  USING (public.get_user_role() = 'owner' AND tenant_id = public.get_user_tenant_id())
  WITH CHECK (public.get_user_role() = 'owner' AND tenant_id = public.get_user_tenant_id());
DROP POLICY IF EXISTS approvals_manager_branch ON public.approval_requests;
CREATE POLICY approvals_manager_branch ON public.approval_requests AS PERMISSIVE
  FOR ALL TO authenticated
  USING (public.get_user_role() = 'manager'
    AND tenant_id = public.get_user_tenant_id()
    AND branch_id = public.get_user_branch_id())
  WITH CHECK (public.get_user_role() = 'manager'
    AND tenant_id = public.get_user_tenant_id()
    AND branch_id = public.get_user_branch_id());
DROP POLICY IF EXISTS approvals_requester_own ON public.approval_requests;
CREATE POLICY approvals_requester_own ON public.approval_requests AS PERMISSIVE
  FOR ALL TO authenticated
  USING (requested_by = auth.uid() AND tenant_id = public.get_user_tenant_id())
  WITH CHECK (requested_by = auth.uid() AND tenant_id = public.get_user_tenant_id());

-- Recreate the hardened Owner onboarding policy removed by the cleanup script.
DROP POLICY IF EXISTS onboardings_owner_all ON public.onboardings;
CREATE POLICY onboardings_owner_all ON public.onboardings AS PERMISSIVE
  FOR ALL TO authenticated
  USING (public.get_user_role() = 'owner' AND tenant_id = public.get_user_tenant_id())
  WITH CHECK (public.get_user_role() = 'owner' AND tenant_id = public.get_user_tenant_id());

-- Audit records are append-only for clients, even if a permissive policy is
-- accidentally added later.
DROP POLICY IF EXISTS activities_update_guard ON public.activities;
CREATE POLICY activities_update_guard ON public.activities AS RESTRICTIVE
  FOR UPDATE TO authenticated USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS activities_delete_guard ON public.activities;
CREATE POLICY activities_delete_guard ON public.activities AS RESTRICTIVE
  FOR DELETE TO authenticated USING (false);

COMMENT ON POLICY tenant_scope_guard ON public.stock_batches IS
  'Restricts every authenticated stock-batch operation to the active user tenant.';
