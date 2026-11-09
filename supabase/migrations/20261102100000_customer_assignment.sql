-- Customer assignment: every customer belongs to one sales rep, and the Owner can
-- move customers to another rep (for example when a rep is deactivated).
-- A new rep inherits the customer's details and ledger only. Past sales keep their
-- sales_rep_id, so each rep's revenue and targets never move with the customer.
-- created_by stays as history. A customer whose rep is no longer an active sales
-- rep waits for the Owner to reassign it.

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS assigned_rep_id UUID REFERENCES public.users(id) ON DELETE SET NULL;
COMMENT ON COLUMN public.customers.assigned_rep_id IS 'The sales rep who manages this customer. Reads and writes for reps follow this, not created_by.';
CREATE INDEX IF NOT EXISTS idx_customers_assigned_rep ON public.customers(assigned_rep_id);

UPDATE public.customers c
   SET assigned_rep_id = c.created_by
  FROM public.users u
 WHERE u.id = c.created_by AND u.role = 'sales_rep' AND c.assigned_rep_id IS NULL;

-- ----------------------------------------------------------------------------
-- Reps read and update only the customers assigned to them.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS core_customers_select ON public.customers;
DROP POLICY IF EXISTS core_customers_select_guard ON public.customers;
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
        AND assigned_rep_id = auth.uid())
    ));
CREATE POLICY core_customers_select_guard ON public.customers AS RESTRICTIVE
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id()
    AND (
      public.get_user_role() = 'owner'
      OR (public.get_user_role() = 'storekeeper'
        AND branch_id = public.get_user_branch_id())
      OR (public.get_user_role() = 'sales_rep'
        AND assigned_rep_id = auth.uid())
    ));
CREATE POLICY core_customers_update ON public.customers AS PERMISSIVE
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_user_tenant_id()
    AND (public.get_user_role() = 'owner'
      OR (public.get_user_role() = 'sales_rep'
        AND assigned_rep_id = auth.uid())))
  WITH CHECK (tenant_id = public.get_user_tenant_id()
    AND (public.get_user_role() = 'owner'
      OR (public.get_user_role() = 'sales_rep'
        AND assigned_rep_id = auth.uid()))
    AND (branch_id IS NULL OR EXISTS (
      SELECT 1 FROM public.branches b
       WHERE b.id = customers.branch_id AND b.tenant_id = public.get_user_tenant_id()
    )));
CREATE POLICY core_customers_update_guard ON public.customers AS RESTRICTIVE
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_user_tenant_id()
    AND (public.get_user_role() = 'owner'
      OR (public.get_user_role() = 'sales_rep'
        AND assigned_rep_id = auth.uid())))
  WITH CHECK (tenant_id = public.get_user_tenant_id()
    AND (public.get_user_role() = 'owner'
      OR (public.get_user_role() = 'sales_rep'
        AND assigned_rep_id = auth.uid()))
    AND (branch_id IS NULL OR EXISTS (
      SELECT 1 FROM public.branches b
       WHERE b.id = customers.branch_id AND b.tenant_id = public.get_user_tenant_id()
    )));

-- ----------------------------------------------------------------------------
-- Customer RPCs follow the assignment.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_private.managed_customer(p_actor public.users, p_customer_id UUID, p_message TEXT)
RETURNS public.customers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
DECLARE
  v_row public.customers;
BEGIN
  SELECT * INTO v_row FROM public.customers WHERE id = p_customer_id AND tenant_id = p_actor.tenant_id FOR UPDATE;
  IF NOT FOUND THEN PERFORM app_private.fail('Customer not found'); END IF;
  IF p_actor.role <> 'sales_rep' OR v_row.assigned_rep_id IS DISTINCT FROM p_actor.id THEN
    PERFORM app_private.deny(p_message);
  END IF;
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_customer(
  p_name TEXT, p_contact_person TEXT, p_phone TEXT, p_email TEXT, p_address TEXT
)
RETURNS public.customers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
DECLARE
  v_actor public.users := app_private.actor();
  v_row public.customers;
BEGIN
  IF v_actor.role <> 'sales_rep' THEN PERFORM app_private.deny('Only sales representatives can add customers'); END IF;
  PERFORM app_private.check_customer(v_actor, p_name, p_phone, p_email, NULL);
  INSERT INTO public.customers (tenant_id, branch_id, name, contact_person, phone, email, address, status, created_by, assigned_rep_id)
  VALUES (v_actor.tenant_id, v_actor.branch_id, TRIM(p_name), TRIM(COALESCE(p_contact_person, '')), TRIM(p_phone),
          NULLIF(TRIM(p_email), ''), TRIM(COALESCE(p_address, '')), 'active', v_actor.id, v_actor.id)
  RETURNING * INTO v_row;
  PERFORM app_private.audit(v_actor, 'Customer created', v_row.name, 'customer', v_row.id::TEXT,
    pg_catalog.jsonb_build_object('branchId', v_row.branch_id, 'customerId', v_row.id));
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_customer_payment(
  p_customer_id UUID, p_amount NUMERIC, p_method TEXT, p_reference TEXT, p_payment_date DATE,
  p_order_id UUID, p_note TEXT, p_idempotency_key UUID DEFAULT NULL
)
RETURNS public.customer_payments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
DECLARE
  v_actor public.users := app_private.actor();
  v_customer public.customers;
  v_manager UUID;
  v_row public.customer_payments;
  v_prior JSONB := app_private.replay(p_idempotency_key, 'record_customer_payment');
BEGIN
  IF v_prior IS NOT NULL THEN
    RETURN pg_catalog.jsonb_populate_record(NULL::public.customer_payments, v_prior);
  END IF;
  IF v_actor.role <> 'sales_rep' OR v_actor.branch_id IS NULL THEN
    PERFORM app_private.deny('Only sales representatives can record customer payments');
  END IF;
  SELECT * INTO v_customer FROM public.customers WHERE id = p_customer_id AND tenant_id = v_actor.tenant_id;
  IF NOT FOUND OR v_customer.assigned_rep_id IS DISTINCT FROM v_actor.id THEN
    PERFORM app_private.fail('Choose one of your customers', 'customerId');
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN PERFORM app_private.fail('Amount must be greater than zero', 'amount'); END IF;
  IF p_method NOT IN ('cash', 'transfer') THEN PERFORM app_private.fail('Choose a method', 'method'); END IF;
  IF p_method = 'transfer' AND TRIM(COALESCE(p_reference, '')) = '' THEN
    PERFORM app_private.fail('A transfer reference is required', 'reference');
  END IF;
  IF p_payment_date IS NULL OR p_payment_date > app_private.today(v_actor.tenant_id) THEN
    PERFORM app_private.fail('Enter a valid date (not in the future)', 'paymentDate');
  END IF;
  SELECT manager_id INTO v_manager FROM public.branches WHERE id = v_actor.branch_id;
  IF v_manager IS NULL THEN PERFORM app_private.fail('A branch manager must be assigned first'); END IF;

  INSERT INTO public.customer_payments (tenant_id, customer_id, branch_id, manager_id, amount, method, reference,
                                        received_by, order_id, payment_date, status, submitted_at, note)
  VALUES (v_actor.tenant_id, v_customer.id, v_actor.branch_id, v_manager, p_amount, p_method, NULLIF(TRIM(p_reference), ''),
          v_actor.id, p_order_id, p_payment_date, 'submitted', pg_catalog.now(), NULLIF(TRIM(p_note), ''))
  RETURNING * INTO v_row;

  PERFORM app_private.notify(v_row.tenant_id, v_manager, 'payment_awaiting_acknowledgement', 'customer_payment', v_row.id::TEXT,
    'Payment from ' || v_customer.name || ' awaits your acknowledgement');
  PERFORM app_private.audit(v_actor, 'Customer payment submitted', v_customer.name, 'payment', v_row.id::TEXT,
    pg_catalog.jsonb_build_object('branchId', v_row.branch_id, 'customerId', v_row.customer_id, 'salesRepId', v_actor.id,
      'managerId', v_manager, 'amount', v_row.amount, 'paymentMethod', v_row.method));
  PERFORM app_private.remember(p_idempotency_key, 'record_customer_payment', pg_catalog.to_jsonb(v_row));
  RETURN v_row;
END;
$$;

-- Owner moves customers to an active sales rep, all or nothing. The customer joins
-- the new rep's branch. Sales, payments and targets are not touched.
CREATE OR REPLACE FUNCTION public.reassign_customers(p_customer_ids UUID[], p_rep_id UUID)
RETURNS SETOF public.customers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
DECLARE
  v_actor public.users := app_private.actor();
  v_rep public.users;
  v_id UUID;
  v_old public.customers;
  v_row public.customers;
BEGIN
  IF v_actor.role <> 'owner' THEN PERFORM app_private.deny('Only the owner can reassign customers'); END IF;
  IF COALESCE(pg_catalog.cardinality(p_customer_ids), 0) = 0 THEN PERFORM app_private.fail('Choose at least one customer', 'customerId'); END IF;
  SELECT * INTO v_rep FROM public.users WHERE id = p_rep_id AND tenant_id = v_actor.tenant_id;
  IF NOT FOUND OR v_rep.role IS DISTINCT FROM 'sales_rep' THEN PERFORM app_private.fail('Choose a sales representative', 'repId'); END IF;
  IF v_rep.status <> 'active' THEN PERFORM app_private.fail('This sales representative is inactive', 'repId'); END IF;
  IF v_rep.branch_id IS NULL THEN PERFORM app_private.fail('This sales representative has no branch', 'repId'); END IF;

  FOREACH v_id IN ARRAY p_customer_ids LOOP
    SELECT * INTO v_old FROM public.customers WHERE id = v_id AND tenant_id = v_actor.tenant_id FOR UPDATE;
    IF NOT FOUND THEN PERFORM app_private.fail('Customer not found', 'customerId'); END IF;
    UPDATE public.customers
       SET assigned_rep_id = v_rep.id, branch_id = v_rep.branch_id, updated_at = pg_catalog.now()
     WHERE id = v_old.id RETURNING * INTO v_row;
    IF v_old.assigned_rep_id IS DISTINCT FROM v_rep.id THEN
      PERFORM app_private.audit(v_actor, 'Customer reassigned',
        v_row.name || ' · ' || COALESCE(app_private.full_name(v_old.assigned_rep_id), 'Unassigned') || ' → ' || app_private.full_name(v_rep.id),
        'customer', v_row.id::TEXT,
        pg_catalog.jsonb_build_object('branchId', v_row.branch_id, 'customerId', v_row.id,
          'fromRepId', v_old.assigned_rep_id, 'toRepId', v_rep.id));
    END IF;
    RETURN NEXT v_row;
  END LOOP;
END;
$$;

-- A rep may only load their own sales, so a customer inherited from another rep
-- would show a wrong balance. This returns the full ledger of the caller's assigned
-- customers for the customer screens only; the sales RLS stays as it is, so nothing
-- inherited can reach the rep's own revenue or target figures.
CREATE OR REPLACE FUNCTION public.get_assigned_customer_ledgers()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
DECLARE
  v_actor public.users := app_private.actor();
BEGIN
  IF v_actor.role <> 'sales_rep' THEN PERFORM app_private.deny('Only sales representatives have assigned customers'); END IF;
  RETURN pg_catalog.jsonb_build_object(
    'sales', COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(s))
        FROM public.sales s JOIN public.customers c ON c.id = s.customer_id
       WHERE c.assigned_rep_id = v_actor.id AND s.tenant_id = v_actor.tenant_id), '[]'::JSONB),
    'payments', COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(p))
        FROM public.customer_payments p JOIN public.customers c ON c.id = p.customer_id
       WHERE c.assigned_rep_id = v_actor.id AND p.tenant_id = v_actor.tenant_id), '[]'::JSONB));
END;
$$;

-- Names of customers on the rep's own past sales and payments that have since moved
-- to another rep, so that history still reads properly. Names only.
CREATE OR REPLACE FUNCTION public.get_former_customer_names()
RETURNS TABLE (id UUID, name TEXT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
DECLARE
  v_actor public.users := app_private.actor();
BEGIN
  RETURN QUERY
    SELECT c.id, c.name
      FROM public.customers c
     WHERE c.tenant_id = v_actor.tenant_id
       AND c.assigned_rep_id IS DISTINCT FROM v_actor.id
       AND (EXISTS (SELECT 1 FROM public.sales s WHERE s.customer_id = c.id AND s.sales_rep_id = v_actor.id)
         OR EXISTS (SELECT 1 FROM public.customer_payments p WHERE p.customer_id = c.id AND p.received_by = v_actor.id));
END;
$$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA app_private FROM PUBLIC, anon, authenticated;
DO $$
DECLARE
  v_fn TEXT;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.reassign_customers(UUID[], UUID)',
    'public.get_assigned_customer_ledgers()',
    'public.get_former_customer_names()'
  ] LOOP
    EXECUTE pg_catalog.format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', v_fn);
    EXECUTE pg_catalog.format('GRANT EXECUTE ON FUNCTION %s TO authenticated', v_fn);
  END LOOP;
END;
$$;
