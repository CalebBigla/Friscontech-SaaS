-- Rep accounts, selling from issued stock, invoice details and manager access to
-- customers.
--
-- 1. Customer payments are credited at once. A rep's recorded payment goes straight
--    onto the customer's ledger (status confirmed) without manager or Owner steps.
--    The money is the rep's to pay in: what a rep owes for a month is now their
--    walk-in sales plus the customer payments they collected (rep_amount_due), and
--    only that pay-in (submit_payment) goes through manager and Owner confirmation.
--    Payments never count as sales, so targets are unchanged. Payments still
--    waiting under the old steps are confirmed here.
-- 2. A rep sells only from stock the storekeeper issued to them (approved and
--    fulfilled stock requests): the sale trigger refuses any part a rep's held stock
--    does not cover. The Owner still sells from branch stock.
-- 3. get_business_profile: the business name and contact details for invoices,
--    readable by every active member (reps can not read the tenants row).
-- 4. Managers read their branch's customers (read-only; writes stay with reps and
--    the Owner through the RPCs).

-- ----------------------------------------------------------------------------
-- 1. Customer payments credited at once; reps owe walk-in sales + collections
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_private.rep_amount_due(p_tenant_id UUID, p_rep_id UUID, p_period TEXT)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
  SELECT app_private.rep_total_sales(p_tenant_id, p_rep_id, p_period)
       + COALESCE((SELECT SUM(c.amount) FROM public.customer_payments c
                    WHERE c.tenant_id = p_tenant_id AND c.received_by = p_rep_id AND c.status = 'confirmed'
                      AND pg_catalog.to_char(c.payment_date, 'YYYY-MM') = p_period), 0)
$$;
REVOKE ALL ON FUNCTION app_private.rep_amount_due(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;

-- Payments recorded before this change finish now instead of waiting.
UPDATE public.customer_payments
   SET status = 'confirmed', confirmed_at = COALESCE(confirmed_at, pg_catalog.now()), confirmed_by = COALESCE(confirmed_by, received_by),
       updated_at = pg_catalog.now()
 WHERE status IN ('submitted', 'acknowledged');

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
                                        received_by, order_id, payment_date, status, submitted_at, note,
                                        confirmed_at, confirmed_by)
  VALUES (v_actor.tenant_id, v_customer.id, v_actor.branch_id, v_manager, p_amount, p_method, NULLIF(TRIM(p_reference), ''),
          v_actor.id, p_order_id, p_payment_date, 'confirmed', pg_catalog.now(), NULLIF(TRIM(p_note), ''),
          pg_catalog.now(), v_actor.id)
  RETURNING * INTO v_row;

  PERFORM app_private.audit(v_actor, 'Customer payment recorded', v_customer.name, 'payment', v_row.id::TEXT,
    pg_catalog.jsonb_build_object('branchId', v_row.branch_id, 'customerId', v_row.customer_id, 'salesRepId', v_actor.id,
      'managerId', v_manager, 'amount', v_row.amount, 'paymentMethod', v_row.method));
  PERFORM app_private.remember(p_idempotency_key, 'record_customer_payment', pg_catalog.to_jsonb(v_row));
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_payment(
  p_period TEXT, p_cash_amount NUMERIC, p_transfer_amount NUMERIC, p_transfer_reference TEXT, p_note TEXT,
  p_idempotency_key UUID DEFAULT NULL
)
RETURNS public.payments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
DECLARE
  v_actor public.users := app_private.actor();
  v_manager UUID;
  v_previous NUMERIC;
  v_row public.payments;
  v_prior JSONB := app_private.replay(p_idempotency_key, 'submit_payment');
BEGIN
  IF v_prior IS NOT NULL THEN
    RETURN pg_catalog.jsonb_populate_record(NULL::public.payments, v_prior);
  END IF;
  IF v_actor.role <> 'sales_rep' THEN PERFORM app_private.deny('Only a sales representative can submit their own payment'); END IF;
  IF v_actor.branch_id IS NULL THEN PERFORM app_private.fail('An active sales representative and branch are required'); END IF;
  IF NOT app_private.valid_period(p_period, v_actor.tenant_id) THEN
    PERFORM app_private.fail('Choose a valid current or past month', 'period');
  END IF;
  IF p_cash_amount IS NULL OR p_cash_amount < 0 THEN PERFORM app_private.fail('Cash cannot be negative', 'cashAmount'); END IF;
  IF p_transfer_amount IS NULL OR p_transfer_amount < 0 THEN PERFORM app_private.fail('Transfer cannot be negative', 'transferAmount'); END IF;
  IF p_transfer_amount > 0 AND TRIM(COALESCE(p_transfer_reference, '')) = '' THEN
    PERFORM app_private.fail('A transfer reference is required when transfer is greater than zero', 'transferReference');
  END IF;
  SELECT u.id INTO v_manager FROM public.branches b JOIN public.users u ON u.id = b.manager_id
   WHERE b.id = v_actor.branch_id AND u.role = 'manager' AND u.status = 'active';
  IF v_manager IS NULL THEN PERFORM app_private.fail('A branch manager must be assigned before submitting a payment'); END IF;

  SELECT COALESCE(SUM(cash_amount + transfer_amount), 0) INTO v_previous
    FROM public.payments
   WHERE tenant_id = v_actor.tenant_id AND sales_rep_id = v_actor.id AND period = p_period AND status <> 'declined';
  IF app_private.rep_amount_due(v_actor.tenant_id, v_actor.id, p_period) - v_previous - p_cash_amount - p_transfer_amount < 0 THEN
    PERFORM app_private.fail('Cash and transfer cannot exceed what you collected (walk-in sales and customer payments)', 'transferAmount');
  END IF;

  INSERT INTO public.payments (id, tenant_id, branch_id, sales_rep_id, manager_id, period, cash_amount, transfer_amount,
                               transfer_reference, status, submitted_at, note)
  VALUES (app_private.next_id('PAY', 'app_private.payment_seq', 'public.payments'), v_actor.tenant_id, v_actor.branch_id,
          v_actor.id, v_manager, p_period, p_cash_amount, p_transfer_amount, NULLIF(TRIM(p_transfer_reference), ''),
          'submitted', pg_catalog.now(), NULLIF(TRIM(p_note), ''))
  RETURNING * INTO v_row;

  PERFORM app_private.notify(v_row.tenant_id, v_manager, 'payment_awaiting_acknowledgement', 'payment', v_row.id,
    app_private.full_name(v_actor.id) || ' submitted ' || v_row.id || ' for acknowledgement');
  PERFORM app_private.audit(v_actor, 'PAYMENT_SUBMITTED', v_row.id || ' · ' || v_row.period || ' payment submitted',
    'payment', v_row.id, pg_catalog.jsonb_build_object('branchId', v_row.branch_id, 'salesRepId', v_actor.id,
      'managerId', v_manager, 'period', v_row.period, 'cashAmount', v_row.cash_amount, 'transferAmount', v_row.transfer_amount));
  PERFORM app_private.remember(p_idempotency_key, 'submit_payment', pg_catalog.to_jsonb(v_row));
  RETURN v_row;
END;
$$;

-- ----------------------------------------------------------------------------
-- 2. Reps sell from issued stock only (otherwise as in 20261114110000)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_sale_inventory()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
DECLARE
  v_held INTEGER;
  v_from_branch INTEGER;
BEGIN
  IF NEW.status = 'completed'
     AND (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.status <> 'completed')) THEN
    IF NEW.exchange_id IS NOT NULL THEN
      IF auth.uid() IS NULL
         OR NEW.tenant_id IS DISTINCT FROM public.get_user_tenant_id()
         OR public.get_user_role() IS DISTINCT FROM 'storekeeper'
         OR NEW.branch_id IS DISTINCT FROM public.get_user_branch_id() THEN
        RAISE EXCEPTION 'Not authorized to complete this sale.' USING ERRCODE = '42501';
      END IF;
      NEW.quantity_from_rep_stock := 0;
      PERFORM app_private.apply_stock(
        NEW.tenant_id, NEW.branch_id, NEW.product_id, -NEW.quantity,
        'exchange_issue', 'sale', NEW.id::TEXT, auth.uid(), 'Replacement for exchange ' || NEW.exchange_id);
      RETURN NEW;
    END IF;

    IF auth.uid() IS NULL
       OR NEW.tenant_id IS DISTINCT FROM public.get_user_tenant_id()
       OR (public.get_user_role() = 'sales_rep'
           AND (NEW.sales_rep_id <> auth.uid()
             OR NEW.branch_id <> public.get_user_branch_id()))
       OR COALESCE(public.get_user_role() NOT IN ('owner', 'sales_rep'), TRUE) THEN
      RAISE EXCEPTION 'Not authorized to complete this sale.' USING ERRCODE = '42501';
    END IF;

    -- One sale at a time per rep and product, so two can't use the same issued units.
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(NEW.sales_rep_id::TEXT || NEW.product_id::TEXT, 0));
    v_held := COALESCE((SELECT SUM(r.quantity_fulfilled) FROM public.stock_requests r
                         WHERE r.rep_id = NEW.sales_rep_id AND r.product_id = NEW.product_id), 0)
            - COALESCE((SELECT SUM(s.quantity_from_rep_stock) FROM public.sales s
                         WHERE s.sales_rep_id = NEW.sales_rep_id AND s.product_id = NEW.product_id AND s.status = 'completed'), 0);
    NEW.quantity_from_rep_stock := LEAST(GREATEST(v_held, 0), NEW.quantity);
    v_from_branch := NEW.quantity - NEW.quantity_from_rep_stock;
    -- A rep sells only what the storekeeper has issued to them.
    IF v_from_branch > 0 AND public.get_user_role() = 'sales_rep' THEN
      PERFORM app_private.fail('You hold ' || GREATEST(v_held, 0) || ' of '
        || (SELECT name FROM public.products WHERE id = NEW.product_id)
        || '. Request stock from the storekeeper before selling more.', 'quantity');
    END IF;

    IF v_from_branch > 0 THEN
      PERFORM app_private.apply_stock(
        NEW.tenant_id, NEW.branch_id, NEW.product_id, -v_from_branch,
        CASE WHEN NEW.is_promo THEN 'promo' ELSE 'sale' END, 'sale', NEW.id::TEXT, NEW.sales_rep_id);
    END IF;
  ELSIF TG_OP = 'INSERT' THEN
    NEW.quantity_from_rep_stock := 0;
  END IF;
  RETURN NEW;
END;
$$;
ALTER FUNCTION public.process_sale_inventory() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.process_sale_inventory() FROM PUBLIC;

-- ----------------------------------------------------------------------------
-- 3. Business details for invoices
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_business_profile()
RETURNS TABLE (name TEXT, legal_name TEXT, phone TEXT, business_email TEXT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
DECLARE
  v_actor public.users := app_private.actor();
BEGIN
  RETURN QUERY SELECT t.name, t.legal_name, t.phone, t.business_email FROM public.tenants t WHERE t.id = v_actor.tenant_id;
END;
$$;
REVOKE ALL ON FUNCTION public.get_business_profile() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_business_profile() TO authenticated;

-- ----------------------------------------------------------------------------
-- 4. Managers read their branch's customers
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS core_customers_select ON public.customers;
CREATE POLICY core_customers_select ON public.customers AS PERMISSIVE FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.get_user_tenant_id())
    AND ((SELECT public.get_user_role()) = 'owner'
      OR ((SELECT public.get_user_role()) IN ('storekeeper', 'manager') AND branch_id = (SELECT public.get_user_branch_id()))
      OR ((SELECT public.get_user_role()) = 'sales_rep' AND assigned_rep_id = (SELECT auth.uid()))));
DROP POLICY IF EXISTS core_customers_select_guard ON public.customers;
CREATE POLICY core_customers_select_guard ON public.customers AS RESTRICTIVE FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.get_user_tenant_id())
    AND ((SELECT public.get_user_role()) = 'owner'
      OR ((SELECT public.get_user_role()) IN ('storekeeper', 'manager') AND branch_id = (SELECT public.get_user_branch_id()))
      OR ((SELECT public.get_user_role()) = 'sales_rep' AND assigned_rep_id = (SELECT auth.uid()))));

NOTIFY pgrst, 'reload schema';
