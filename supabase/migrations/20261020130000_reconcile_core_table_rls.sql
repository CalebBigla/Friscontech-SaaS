-- Reconcile the reported production policy gaps for the core operational
-- tables. This migration intentionally does not disable RLS, alter data, or
-- replace policies on public.users. It also does not restore the old broad
-- tenant-isolation FOR ALL policies: those are permissive and would OR with
-- role policies, granting every tenant member excessive write access.
--
-- Preconditions: public.get_user_role(), get_user_tenant_id(), and
-- get_user_branch_id() are the active-profile SECURITY DEFINER helpers from
-- 20261019000000_fix_rls_helper_set_scope.sql. The preflight aborts before any
-- policy changes if the expected checked-in schema is not present.

DO $preflight$
DECLARE
  v_missing TEXT[];
BEGIN
  SELECT array_agg(required.table_name || '.' || required.column_name)
    INTO v_missing
  FROM (VALUES
    ('branches', 'id'), ('branches', 'tenant_id'), ('branches', 'status'),
    ('users', 'id'), ('users', 'tenant_id'), ('users', 'role'),
    ('products', 'id'), ('products', 'tenant_id'), ('products', 'status'),
    ('customers', 'id'), ('customers', 'tenant_id'), ('customers', 'branch_id'), ('customers', 'created_by'), ('customers', 'status'),
    ('inventory_records', 'tenant_id'), ('inventory_records', 'branch_id'), ('inventory_records', 'product_id'), ('inventory_records', 'quantity_on_hand'), ('inventory_records', 'last_updated'),
    ('inventory_movements', 'tenant_id'), ('inventory_movements', 'branch_id'), ('inventory_movements', 'product_id'), ('inventory_movements', 'type'), ('inventory_movements', 'quantity'), ('inventory_movements', 'performed_by'),
    ('sales', 'id'), ('sales', 'tenant_id'), ('sales', 'branch_id'), ('sales', 'sales_rep_id'), ('sales', 'product_id'), ('sales', 'customer_id'), ('sales', 'status'), ('sales', 'quantity'),
    ('targets', 'tenant_id'), ('targets', 'scope'), ('targets', 'branch_id'), ('targets', 'user_id'), ('targets', 'month'), ('targets', 'amount')
  ) AS required(table_name, column_name)
  LEFT JOIN information_schema.columns c
    ON c.table_schema = 'public'
   AND c.table_name = required.table_name
   AND c.column_name = required.column_name
  WHERE c.column_name IS NULL;

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'RLS reconciliation aborted: required public columns are missing: %', array_to_string(v_missing, ', ');
  END IF;

  IF to_regprocedure('public.get_user_role()') IS NULL
     OR to_regprocedure('public.get_user_tenant_id()') IS NULL
     OR to_regprocedure('public.get_user_branch_id()') IS NULL THEN
    RAISE EXCEPTION 'RLS reconciliation aborted: active-user authorization helpers are missing.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid = 'public.branches'::regclass AND relrowsecurity)
     OR NOT EXISTS (SELECT 1 FROM pg_class WHERE oid = 'public.products'::regclass AND relrowsecurity)
     OR NOT EXISTS (SELECT 1 FROM pg_class WHERE oid = 'public.customers'::regclass AND relrowsecurity)
     OR NOT EXISTS (SELECT 1 FROM pg_class WHERE oid = 'public.inventory_records'::regclass AND relrowsecurity)
     OR NOT EXISTS (SELECT 1 FROM pg_class WHERE oid = 'public.inventory_movements'::regclass AND relrowsecurity)
     OR NOT EXISTS (SELECT 1 FROM pg_class WHERE oid = 'public.sales'::regclass AND relrowsecurity)
     OR NOT EXISTS (SELECT 1 FROM pg_class WHERE oid = 'public.targets'::regclass AND relrowsecurity)
     OR NOT EXISTS (SELECT 1 FROM pg_class WHERE oid = 'public.users'::regclass AND relrowsecurity) THEN
    RAISE EXCEPTION 'RLS reconciliation aborted: RLS must already be enabled on every affected table.';
  END IF;
END;
$preflight$;

-- USERS
-- Preserve the existing self/tenant SELECT and Owner INSERT/UPDATE policies,
-- while making tenant scope mandatory even if another permissive policy is
-- later added. Profiles are soft-deactivated; direct DELETE remains denied.
DROP POLICY IF EXISTS core_users_select_guard ON public.users;
DROP POLICY IF EXISTS core_users_insert_guard ON public.users;
DROP POLICY IF EXISTS core_users_update_guard ON public.users;
DROP POLICY IF EXISTS core_users_delete_guard ON public.users;
CREATE POLICY core_users_select_guard ON public.users AS RESTRICTIVE
  FOR SELECT TO public
  USING (id = auth.uid()
    OR (public.get_user_tenant_id() IS NOT NULL
      AND tenant_id = public.get_user_tenant_id()));
CREATE POLICY core_users_insert_guard ON public.users AS RESTRICTIVE
  FOR INSERT TO public
  WITH CHECK (public.get_user_role() = 'owner'
    AND tenant_id = public.get_user_tenant_id()
    AND role IS DISTINCT FROM 'owner');
CREATE POLICY core_users_update_guard ON public.users AS RESTRICTIVE
  FOR UPDATE TO public
  USING (public.get_user_role() = 'owner'
    AND tenant_id = public.get_user_tenant_id())
  WITH CHECK (public.get_user_role() = 'owner'
    AND tenant_id = public.get_user_tenant_id());
CREATE POLICY core_users_delete_guard ON public.users AS RESTRICTIVE
  FOR DELETE TO public
  USING (false);

-- PRODUCTS
-- Owner and Storekeeper manage the shared catalog; Manager and Sales Rep read
-- it for their permitted workflows. Managers change only status through the
-- narrow RPC below; table UPDATE is not granted to Managers by RLS.
DROP POLICY IF EXISTS core_products_select ON public.products;
DROP POLICY IF EXISTS core_products_select_guard ON public.products;
DROP POLICY IF EXISTS core_products_insert ON public.products;
DROP POLICY IF EXISTS core_products_insert_guard ON public.products;
DROP POLICY IF EXISTS core_products_update ON public.products;
DROP POLICY IF EXISTS core_products_update_guard ON public.products;

CREATE POLICY core_products_select ON public.products AS PERMISSIVE
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id()
    AND public.get_user_role() IN ('owner', 'manager', 'storekeeper', 'sales_rep'));
CREATE POLICY core_products_select_guard ON public.products AS RESTRICTIVE
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id()
    AND public.get_user_role() IN ('owner', 'manager', 'storekeeper', 'sales_rep'));
CREATE POLICY core_products_insert ON public.products AS PERMISSIVE
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant_id()
    AND public.get_user_role() IN ('owner', 'storekeeper'));
CREATE POLICY core_products_insert_guard ON public.products AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant_id()
    AND public.get_user_role() IN ('owner', 'storekeeper'));
CREATE POLICY core_products_update ON public.products AS PERMISSIVE
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_user_tenant_id()
    AND public.get_user_role() IN ('owner', 'storekeeper'))
  WITH CHECK (tenant_id = public.get_user_tenant_id()
    AND public.get_user_role() IN ('owner', 'storekeeper'));
CREATE POLICY core_products_update_guard ON public.products AS RESTRICTIVE
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_user_tenant_id()
    AND public.get_user_role() IN ('owner', 'storekeeper'))
  WITH CHECK (tenant_id = public.get_user_tenant_id()
    AND public.get_user_role() IN ('owner', 'storekeeper'));
DROP POLICY IF EXISTS core_products_delete_guard ON public.products;
CREATE POLICY core_products_delete_guard ON public.products AS RESTRICTIVE
  FOR DELETE TO authenticated USING (false);

-- The app permits Managers to deactivate/reactivate products, but direct
-- table UPDATE would also let a Manager alter price, cost, or SKU. This RPC
-- exposes only status and verifies the active Manager's tenant server-side.
CREATE OR REPLACE FUNCTION public.set_product_status(p_product_id UUID, p_status TEXT)
RETURNS public.products
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
DECLARE
  v_product public.products%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR public.get_user_role() <> 'manager' THEN
    RAISE EXCEPTION 'Only an authenticated active Manager can change product status.'
      USING ERRCODE = '42501';
  END IF;
  IF p_status NOT IN ('active', 'inactive') THEN
    RAISE EXCEPTION 'Invalid product status.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.products
     SET status = p_status,
         updated_at = pg_catalog.now()
   WHERE id = p_product_id
     AND tenant_id = public.get_user_tenant_id()
  RETURNING * INTO v_product;

  IF v_product.id IS NULL THEN
    RAISE EXCEPTION 'Product not found in this organization.' USING ERRCODE = 'P0002';
  END IF;
  RETURN v_product;
END;
$$;
ALTER FUNCTION public.set_product_status(UUID, TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.set_product_status(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_product_status(UUID, TEXT) TO authenticated;
COMMENT ON FUNCTION public.set_product_status(UUID, TEXT) IS
  'Manager-only status change; does not expose product price, cost, SKU, or other fields.';

-- CUSTOMERS
-- Owner reads/manages the tenant; Storekeeper reads their branch; Sales
-- Reps read their own branch or records they created and manage only records
-- attached to their branch. Managers have no Customers module in the current
-- app role model. Deletes remain unavailable; status is the soft-delete path.
DROP POLICY IF EXISTS core_customers_select ON public.customers;
DROP POLICY IF EXISTS core_customers_select_guard ON public.customers;
DROP POLICY IF EXISTS core_customers_insert ON public.customers;
DROP POLICY IF EXISTS core_customers_insert_guard ON public.customers;
DROP POLICY IF EXISTS core_customers_update ON public.customers;
DROP POLICY IF EXISTS core_customers_update_guard ON public.customers;

CREATE POLICY core_customers_select ON public.customers AS PERMISSIVE
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id()
    AND (
      public.get_user_role() = 'owner'
      OR (public.get_user_role() = 'storekeeper'
        AND branch_id = public.get_user_branch_id())
      OR (public.get_user_role() = 'sales_rep'
        AND (branch_id = public.get_user_branch_id() OR created_by = auth.uid()))
    ));
CREATE POLICY core_customers_select_guard ON public.customers AS RESTRICTIVE
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id()
    AND (
      public.get_user_role() = 'owner'
      OR (public.get_user_role() = 'storekeeper'
        AND branch_id = public.get_user_branch_id())
      OR (public.get_user_role() = 'sales_rep'
        AND (branch_id = public.get_user_branch_id() OR created_by = auth.uid()))
    ));
CREATE POLICY core_customers_insert ON public.customers AS PERMISSIVE
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant_id()
    AND created_by = auth.uid()
    AND (
      public.get_user_role() = 'owner'
      OR (public.get_user_role() = 'sales_rep'
        AND branch_id = public.get_user_branch_id())
    )
    AND (branch_id IS NULL OR EXISTS (
      SELECT 1 FROM public.branches b
       WHERE b.id = customers.branch_id AND b.tenant_id = public.get_user_tenant_id()
    ))
    AND EXISTS (
      SELECT 1 FROM public.users u
       WHERE u.id = customers.created_by
         AND u.tenant_id = public.get_user_tenant_id()
    ));
CREATE POLICY core_customers_insert_guard ON public.customers AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant_id()
    AND created_by = auth.uid()
    AND (
      public.get_user_role() = 'owner'
      OR (public.get_user_role() = 'sales_rep'
        AND branch_id = public.get_user_branch_id())
    )
    AND (branch_id IS NULL OR EXISTS (
      SELECT 1 FROM public.branches b
       WHERE b.id = customers.branch_id AND b.tenant_id = public.get_user_tenant_id()
    ))
    AND EXISTS (
      SELECT 1 FROM public.users u
       WHERE u.id = customers.created_by
         AND u.tenant_id = public.get_user_tenant_id()
    ));
CREATE POLICY core_customers_update ON public.customers AS PERMISSIVE
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_user_tenant_id()
    AND (public.get_user_role() = 'owner'
      OR (public.get_user_role() = 'sales_rep'
        AND (branch_id = public.get_user_branch_id() OR created_by = auth.uid()))))
  WITH CHECK (tenant_id = public.get_user_tenant_id()
    AND (public.get_user_role() = 'owner'
      OR (public.get_user_role() = 'sales_rep'
        AND branch_id = public.get_user_branch_id()
        AND created_by = auth.uid()))
    AND (branch_id IS NULL OR EXISTS (
      SELECT 1 FROM public.branches b
       WHERE b.id = customers.branch_id AND b.tenant_id = public.get_user_tenant_id()
    )));
CREATE POLICY core_customers_update_guard ON public.customers AS RESTRICTIVE
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_user_tenant_id()
    AND (public.get_user_role() = 'owner'
      OR (public.get_user_role() = 'sales_rep'
        AND (branch_id = public.get_user_branch_id() OR created_by = auth.uid()))))
  WITH CHECK (tenant_id = public.get_user_tenant_id()
    AND (public.get_user_role() = 'owner'
      OR (public.get_user_role() = 'sales_rep'
        AND branch_id = public.get_user_branch_id()
        AND created_by = auth.uid()))
    AND (branch_id IS NULL OR EXISTS (
      SELECT 1 FROM public.branches b
       WHERE b.id = customers.branch_id AND b.tenant_id = public.get_user_tenant_id()
    )));
DROP POLICY IF EXISTS core_customers_delete_guard ON public.customers;
CREATE POLICY core_customers_delete_guard ON public.customers AS RESTRICTIVE
  FOR DELETE TO authenticated USING (false);

-- INVENTORY RECORDS
-- All roles that use stock/sales screens may read their own branch; Owner may
-- read the whole tenant. Client writes are deliberately denied. Completed
-- sales update inventory only through the hardened trigger below; additions,
-- adjustments, and fulfillment need their own trusted workflow/RPC.
DROP POLICY IF EXISTS core_inventory_records_select ON public.inventory_records;
DROP POLICY IF EXISTS core_inventory_records_select_guard ON public.inventory_records;
CREATE POLICY core_inventory_records_select ON public.inventory_records AS PERMISSIVE
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id()
    AND (public.get_user_role() = 'owner'
      OR (public.get_user_role() IN ('manager', 'storekeeper', 'sales_rep')
        AND branch_id = public.get_user_branch_id())));
CREATE POLICY core_inventory_records_select_guard ON public.inventory_records AS RESTRICTIVE
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id()
    AND (public.get_user_role() = 'owner'
      OR (public.get_user_role() IN ('manager', 'storekeeper', 'sales_rep')
        AND branch_id = public.get_user_branch_id())));
DROP POLICY IF EXISTS core_inventory_records_insert_guard ON public.inventory_records;
DROP POLICY IF EXISTS core_inventory_records_update_guard ON public.inventory_records;
DROP POLICY IF EXISTS core_inventory_records_delete_guard ON public.inventory_records;
CREATE POLICY core_inventory_records_insert_guard ON public.inventory_records AS RESTRICTIVE
  FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY core_inventory_records_update_guard ON public.inventory_records AS RESTRICTIVE
  FOR UPDATE TO authenticated USING (false) WITH CHECK (false);
CREATE POLICY core_inventory_records_delete_guard ON public.inventory_records AS RESTRICTIVE
  FOR DELETE TO authenticated USING (false);

-- INVENTORY MOVEMENTS
-- Stock movement history is append-only and visible to Owner and the
-- Storekeeper responsible for the branch. Client INSERT/UPDATE/DELETE remain
-- denied so users cannot forge or rewrite the stock audit trail.
DROP POLICY IF EXISTS core_inventory_movements_select ON public.inventory_movements;
DROP POLICY IF EXISTS core_inventory_movements_select_guard ON public.inventory_movements;
CREATE POLICY core_inventory_movements_select ON public.inventory_movements AS PERMISSIVE
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id()
    AND (public.get_user_role() = 'owner'
      OR (public.get_user_role() = 'storekeeper'
        AND branch_id = public.get_user_branch_id())));
CREATE POLICY core_inventory_movements_select_guard ON public.inventory_movements AS RESTRICTIVE
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id()
    AND (public.get_user_role() = 'owner'
      OR (public.get_user_role() = 'storekeeper'
        AND branch_id = public.get_user_branch_id())));
DROP POLICY IF EXISTS core_inventory_movements_insert_guard ON public.inventory_movements;
DROP POLICY IF EXISTS core_inventory_movements_update_guard ON public.inventory_movements;
DROP POLICY IF EXISTS core_inventory_movements_delete_guard ON public.inventory_movements;
CREATE POLICY core_inventory_movements_insert_guard ON public.inventory_movements AS RESTRICTIVE
  FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY core_inventory_movements_update_guard ON public.inventory_movements AS RESTRICTIVE
  FOR UPDATE TO authenticated USING (false) WITH CHECK (false);
CREATE POLICY core_inventory_movements_delete_guard ON public.inventory_movements AS RESTRICTIVE
  FOR DELETE TO authenticated USING (false);

-- SALES
-- Owner and Sales Rep can read sales; Managers can read their branch only.
-- Inserts are self-attributed. Reps can sell only at their assigned branch;
-- Owners can sell within the tenant. Historical rows cannot be edited or
-- deleted directly from the client.
DROP POLICY IF EXISTS core_sales_select ON public.sales;
DROP POLICY IF EXISTS core_sales_select_guard ON public.sales;
DROP POLICY IF EXISTS core_sales_insert ON public.sales;
DROP POLICY IF EXISTS core_sales_insert_guard ON public.sales;
CREATE POLICY core_sales_select ON public.sales AS PERMISSIVE
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id()
    AND (public.get_user_role() = 'owner'
      OR (public.get_user_role() = 'manager'
        AND branch_id = public.get_user_branch_id())
      OR (public.get_user_role() = 'sales_rep'
        AND sales_rep_id = auth.uid())));
CREATE POLICY core_sales_select_guard ON public.sales AS RESTRICTIVE
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id()
    AND (public.get_user_role() = 'owner'
      OR (public.get_user_role() = 'manager'
        AND branch_id = public.get_user_branch_id())
      OR (public.get_user_role() = 'sales_rep'
        AND sales_rep_id = auth.uid())));
CREATE POLICY core_sales_insert ON public.sales AS PERMISSIVE
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant_id()
    AND sales_rep_id = auth.uid()
    AND (
      public.get_user_role() = 'owner'
      OR (public.get_user_role() = 'sales_rep'
        AND branch_id = public.get_user_branch_id())
    )
    AND EXISTS (
      SELECT 1 FROM public.branches b
       WHERE b.id = sales.branch_id
         AND b.tenant_id = public.get_user_tenant_id()
         AND b.status = 'active'
    )
    AND EXISTS (
      SELECT 1 FROM public.products p
       WHERE p.id = sales.product_id
         AND p.tenant_id = public.get_user_tenant_id()
         AND p.status = 'active'
    )
    AND (customer_id IS NULL OR EXISTS (
      SELECT 1 FROM public.customers c
       WHERE c.id = sales.customer_id
         AND c.tenant_id = public.get_user_tenant_id()
         AND c.status = 'active'
    )));
CREATE POLICY core_sales_insert_guard ON public.sales AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant_id()
    AND sales_rep_id = auth.uid()
    AND (
      public.get_user_role() = 'owner'
      OR (public.get_user_role() = 'sales_rep'
        AND branch_id = public.get_user_branch_id())
    )
    AND EXISTS (
      SELECT 1 FROM public.branches b
       WHERE b.id = sales.branch_id
         AND b.tenant_id = public.get_user_tenant_id()
         AND b.status = 'active'
    )
    AND EXISTS (
      SELECT 1 FROM public.products p
       WHERE p.id = sales.product_id
         AND p.tenant_id = public.get_user_tenant_id()
         AND p.status = 'active'
    )
    AND (customer_id IS NULL OR EXISTS (
      SELECT 1 FROM public.customers c
       WHERE c.id = sales.customer_id
         AND c.tenant_id = public.get_user_tenant_id()
         AND c.status = 'active'
    )));
DROP POLICY IF EXISTS core_sales_update_guard ON public.sales;
DROP POLICY IF EXISTS core_sales_delete_guard ON public.sales;
CREATE POLICY core_sales_update_guard ON public.sales AS RESTRICTIVE
  FOR UPDATE TO authenticated USING (false) WITH CHECK (false);
CREATE POLICY core_sales_delete_guard ON public.sales AS RESTRICTIVE
  FOR DELETE TO authenticated USING (false);

-- TARGETS
-- Owner manages targets. Manager reads targets for the assigned branch;
-- Sales Rep reads only their own. New or changed targets must reference a
-- branch and, for rep scope, an active Sales Rep in that same tenant/branch.
DROP POLICY IF EXISTS core_targets_select ON public.targets;
DROP POLICY IF EXISTS core_targets_select_guard ON public.targets;
DROP POLICY IF EXISTS core_targets_insert ON public.targets;
DROP POLICY IF EXISTS core_targets_insert_guard ON public.targets;
DROP POLICY IF EXISTS core_targets_update ON public.targets;
DROP POLICY IF EXISTS core_targets_update_guard ON public.targets;
DROP POLICY IF EXISTS core_targets_delete ON public.targets;
DROP POLICY IF EXISTS core_targets_delete_guard ON public.targets;

CREATE POLICY core_targets_select ON public.targets AS PERMISSIVE
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id()
    AND (public.get_user_role() = 'owner'
      OR (public.get_user_role() = 'manager'
        AND branch_id = public.get_user_branch_id())
      OR (public.get_user_role() = 'sales_rep'
        AND user_id = auth.uid())));
CREATE POLICY core_targets_select_guard ON public.targets AS RESTRICTIVE
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id()
    AND (public.get_user_role() = 'owner'
      OR (public.get_user_role() = 'manager'
        AND branch_id = public.get_user_branch_id())
      OR (public.get_user_role() = 'sales_rep'
        AND user_id = auth.uid())));
CREATE POLICY core_targets_insert ON public.targets AS PERMISSIVE
  FOR INSERT TO authenticated
  WITH CHECK (public.get_user_role() = 'owner'
    AND tenant_id = public.get_user_tenant_id()
    AND EXISTS (
      SELECT 1 FROM public.branches b
       WHERE b.id = targets.branch_id AND b.tenant_id = public.get_user_tenant_id()
    )
    AND (
      (scope = 'branch' AND user_id IS NULL)
      OR (scope = 'rep' AND EXISTS (
        SELECT 1 FROM public.users u
         WHERE u.id = targets.user_id
           AND u.tenant_id = public.get_user_tenant_id()
           AND u.branch_id = targets.branch_id
           AND u.role = 'sales_rep'
           AND u.status = 'active'
      ))
    ));
CREATE POLICY core_targets_insert_guard ON public.targets AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK (public.get_user_role() = 'owner'
    AND tenant_id = public.get_user_tenant_id()
    AND EXISTS (
      SELECT 1 FROM public.branches b
       WHERE b.id = targets.branch_id AND b.tenant_id = public.get_user_tenant_id()
    )
    AND (
      (scope = 'branch' AND user_id IS NULL)
      OR (scope = 'rep' AND EXISTS (
        SELECT 1 FROM public.users u
         WHERE u.id = targets.user_id
           AND u.tenant_id = public.get_user_tenant_id()
           AND u.branch_id = targets.branch_id
           AND u.role = 'sales_rep'
           AND u.status = 'active'
      ))
    ));
CREATE POLICY core_targets_update ON public.targets AS PERMISSIVE
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_user_tenant_id()
    AND public.get_user_role() = 'owner')
  WITH CHECK (public.get_user_role() = 'owner'
    AND tenant_id = public.get_user_tenant_id()
    AND EXISTS (
      SELECT 1 FROM public.branches b
       WHERE b.id = targets.branch_id AND b.tenant_id = public.get_user_tenant_id()
    )
    AND (
      (scope = 'branch' AND user_id IS NULL)
      OR (scope = 'rep' AND EXISTS (
        SELECT 1 FROM public.users u
         WHERE u.id = targets.user_id
           AND u.tenant_id = public.get_user_tenant_id()
           AND u.branch_id = targets.branch_id
           AND u.role = 'sales_rep'
           AND u.status = 'active'
      ))
    ));
CREATE POLICY core_targets_update_guard ON public.targets AS RESTRICTIVE
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_user_tenant_id()
    AND public.get_user_role() = 'owner')
  WITH CHECK (public.get_user_role() = 'owner'
    AND tenant_id = public.get_user_tenant_id()
    AND EXISTS (
      SELECT 1 FROM public.branches b
       WHERE b.id = targets.branch_id AND b.tenant_id = public.get_user_tenant_id()
    )
    AND (
      (scope = 'branch' AND user_id IS NULL)
      OR (scope = 'rep' AND EXISTS (
        SELECT 1 FROM public.users u
         WHERE u.id = targets.user_id
           AND u.tenant_id = public.get_user_tenant_id()
           AND u.branch_id = targets.branch_id
           AND u.role = 'sales_rep'
           AND u.status = 'active'
      ))
    ));
CREATE POLICY core_targets_delete ON public.targets AS PERMISSIVE
  FOR DELETE TO authenticated
  USING (tenant_id = public.get_user_tenant_id()
    AND public.get_user_role() = 'owner');
CREATE POLICY core_targets_delete_guard ON public.targets AS RESTRICTIVE
  FOR DELETE TO authenticated
  USING (tenant_id = public.get_user_tenant_id()
    AND public.get_user_role() = 'owner');

-- A completed sale must adjust stock while client-side inventory mutation
-- stays denied. Run only this fixed trigger body with the function owner's
-- privileges. The caller still needs an authorized INSERT on sales; related
-- rows are rechecked here before stock is touched.
CREATE OR REPLACE FUNCTION public.process_sale_inventory()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
DECLARE
  v_current_qty INTEGER;
BEGIN
  IF NEW.status = 'completed'
     AND (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.status <> 'completed')) THEN
    IF auth.uid() IS NULL
       OR NEW.tenant_id IS DISTINCT FROM public.get_user_tenant_id()
       OR (public.get_user_role() = 'sales_rep'
           AND (NEW.sales_rep_id <> auth.uid()
             OR NEW.branch_id <> public.get_user_branch_id()))
       OR COALESCE(public.get_user_role() NOT IN ('owner', 'sales_rep'), TRUE) THEN
      RAISE EXCEPTION 'Not authorized to complete this sale.' USING ERRCODE = '42501';
    END IF;

    SELECT i.quantity_on_hand
      INTO v_current_qty
      FROM public.inventory_records i
     WHERE i.tenant_id = NEW.tenant_id
       AND i.branch_id = NEW.branch_id
       AND i.product_id = NEW.product_id
     FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'No inventory record found for this product at this branch.';
    END IF;
    IF v_current_qty < NEW.quantity THEN
      RAISE EXCEPTION 'Insufficient stock: have %, need %', v_current_qty, NEW.quantity;
    END IF;

    UPDATE public.inventory_records
       SET quantity_on_hand = quantity_on_hand - NEW.quantity,
           last_updated = pg_catalog.now()
     WHERE tenant_id = NEW.tenant_id
       AND branch_id = NEW.branch_id
       AND product_id = NEW.product_id;

    INSERT INTO public.inventory_movements (
      tenant_id, branch_id, product_id, type, quantity,
      reference_type, reference_id, performed_by
    ) VALUES (
      NEW.tenant_id, NEW.branch_id, NEW.product_id, 'sale', -NEW.quantity,
      'sale', NEW.id::text, NEW.sales_rep_id
    );
  END IF;
  RETURN NEW;
END;
$$;
ALTER FUNCTION public.process_sale_inventory() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.process_sale_inventory() FROM PUBLIC;
COMMENT ON FUNCTION public.process_sale_inventory() IS
  'SECURITY DEFINER trigger: records inventory deductions for authorized completed sales; client inventory writes remain denied.';

-- Keep the existing sale_inventory_deduction trigger attached to the replaced
-- function. No trigger or table data is dropped or recreated.
