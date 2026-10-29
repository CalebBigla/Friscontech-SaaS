-- ============================================================================
-- CUSTOMER, PAYMENT CHAIN, EXPENSE AND REMITTANCE RPCs
-- ============================================================================
-- Contract: src/lib/rpc.ts. Payment chain: submitted → acknowledged (branch
-- manager) → confirmed / declined (owner). Totals follow the app's
-- calculations (src/lib/payment-calculations.ts, remittance-calculations.ts).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Customers (sales reps manage their branch's customers; owner sets credit)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_private.check_customer(
  p_actor public.users, p_name TEXT, p_phone TEXT, p_email TEXT, p_editing UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
BEGIN
  IF TRIM(COALESCE(p_name, '')) = '' THEN PERFORM app_private.fail('Customer or business name is required', 'name'); END IF;
  IF TRIM(COALESCE(p_phone, '')) = '' THEN PERFORM app_private.fail('Phone number is required', 'phone'); END IF;
  IF TRIM(p_phone) !~ '^[+0-9][0-9 -]{6,}$' THEN PERFORM app_private.fail('Enter a valid phone number', 'phone'); END IF;
  IF TRIM(COALESCE(p_email, '')) <> '' AND TRIM(p_email) !~ '^\S+@\S+\.\S+$' THEN
    PERFORM app_private.fail('Enter a valid email', 'email');
  END IF;
  IF EXISTS (SELECT 1 FROM public.customers c
              WHERE c.tenant_id = p_actor.tenant_id AND c.id IS DISTINCT FROM p_editing
                AND REPLACE(c.phone, ' ', '') = REPLACE(TRIM(p_phone), ' ', '')) THEN
    PERFORM app_private.fail('A customer with this phone number already exists', 'phone');
  END IF;
END;
$$;

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
  IF p_actor.role <> 'sales_rep' OR (v_row.branch_id IS NOT NULL AND v_row.branch_id IS DISTINCT FROM p_actor.branch_id) THEN
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
  INSERT INTO public.customers (tenant_id, branch_id, name, contact_person, phone, email, address, status, created_by)
  VALUES (v_actor.tenant_id, v_actor.branch_id, TRIM(p_name), TRIM(COALESCE(p_contact_person, '')), TRIM(p_phone),
          NULLIF(TRIM(p_email), ''), TRIM(COALESCE(p_address, '')), 'active', v_actor.id)
  RETURNING * INTO v_row;
  PERFORM app_private.audit(v_actor, 'Customer created', v_row.name, 'customer', v_row.id::TEXT,
    pg_catalog.jsonb_build_object('branchId', v_row.branch_id, 'customerId', v_row.id));
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_customer(
  p_customer_id UUID, p_name TEXT, p_contact_person TEXT, p_phone TEXT, p_email TEXT, p_address TEXT
)
RETURNS public.customers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
DECLARE
  v_actor public.users := app_private.actor();
  v_row public.customers := app_private.managed_customer(v_actor, p_customer_id, 'You cannot edit this customer');
BEGIN
  PERFORM app_private.check_customer(v_actor, p_name, p_phone, p_email, v_row.id);
  UPDATE public.customers
     SET name = TRIM(p_name), contact_person = TRIM(COALESCE(p_contact_person, '')), phone = TRIM(p_phone),
         email = NULLIF(TRIM(p_email), ''), address = TRIM(COALESCE(p_address, '')), updated_at = pg_catalog.now()
   WHERE id = v_row.id RETURNING * INTO v_row;
  PERFORM app_private.audit(v_actor, 'Customer updated', v_row.name, 'customer', v_row.id::TEXT,
    pg_catalog.jsonb_build_object('branchId', v_row.branch_id, 'customerId', v_row.id));
  RETURN v_row;
END;
$$;

-- Soft (de)activation; customers are never deleted.
CREATE OR REPLACE FUNCTION public.set_customer_status(p_customer_id UUID, p_status TEXT)
RETURNS public.customers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
DECLARE
  v_actor public.users := app_private.actor();
  v_row public.customers := app_private.managed_customer(v_actor, p_customer_id, 'You cannot change this customer');
BEGIN
  IF p_status NOT IN ('active', 'inactive') THEN PERFORM app_private.fail('Choose a valid status', 'status'); END IF;
  UPDATE public.customers SET status = p_status, updated_at = pg_catalog.now() WHERE id = v_row.id RETURNING * INTO v_row;
  PERFORM app_private.audit(v_actor, CASE WHEN p_status = 'active' THEN 'Customer activated' ELSE 'Customer deactivated' END,
    v_row.name, 'customer', v_row.id::TEXT, pg_catalog.jsonb_build_object('branchId', v_row.branch_id, 'customerId', v_row.id));
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_customer_credit_limit(p_customer_id UUID, p_credit_limit NUMERIC)
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
  IF v_actor.role <> 'owner' THEN PERFORM app_private.deny('Only the owner can set credit limits'); END IF;
  SELECT * INTO v_row FROM public.customers WHERE id = p_customer_id AND tenant_id = v_actor.tenant_id FOR UPDATE;
  IF NOT FOUND THEN PERFORM app_private.fail('Customer not found'); END IF;
  IF p_credit_limit IS NOT NULL AND p_credit_limit < 0 THEN PERFORM app_private.fail('Enter a valid credit limit', 'creditLimit'); END IF;
  UPDATE public.customers SET credit_limit = NULLIF(p_credit_limit, 0), updated_at = pg_catalog.now()
   WHERE id = v_row.id RETURNING * INTO v_row;
  PERFORM app_private.audit(v_actor, 'Customer credit limit updated', v_row.name, 'customer', v_row.id::TEXT,
    pg_catalog.jsonb_build_object('branchId', v_row.branch_id, 'customerId', v_row.id, 'creditLimit', v_row.credit_limit));
  RETURN v_row;
END;
$$;

-- ----------------------------------------------------------------------------
-- Payment chain helpers
-- ----------------------------------------------------------------------------
-- The assigned branch manager may act on a payment.
CREATE OR REPLACE FUNCTION app_private.is_payment_manager(p_actor public.users, p_manager_id UUID, p_branch_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $$
  -- COALESCE: a NULL comparison must mean "no", never "unknown".
  SELECT COALESCE(p_actor.role = 'manager' AND p_manager_id = p_actor.id AND p_branch_id = p_actor.branch_id, FALSE);
$$;

-- Walk-in completed sales of a rep in a YYYY-MM month (credit orders never count).
CREATE OR REPLACE FUNCTION app_private.rep_total_sales(p_tenant_id UUID, p_rep_id UUID, p_period TEXT)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
  SELECT COALESCE(SUM(s.quantity * s.unit_price), 0)
    FROM public.sales s
   WHERE s.tenant_id = p_tenant_id AND s.sales_rep_id = p_rep_id AND s.customer_id IS NULL
     AND s.status = 'completed' AND pg_catalog.to_char(s.sale_date, 'YYYY-MM') = p_period;
$$;

CREATE OR REPLACE FUNCTION app_private.valid_period(p_period TEXT, p_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT COALESCE(p_period ~ '^\d{4}-(0[1-9]|1[0-2])$', FALSE)
     AND p_period <= pg_catalog.to_char(app_private.today(p_tenant_id), 'YYYY-MM');
$$;

-- ----------------------------------------------------------------------------
-- Customer payments
-- ----------------------------------------------------------------------------
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
  IF NOT FOUND OR (v_customer.branch_id IS NOT NULL AND v_customer.branch_id <> v_actor.branch_id) THEN
    PERFORM app_private.fail('Choose a customer from your branch', 'customerId');
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

CREATE OR REPLACE FUNCTION public.acknowledge_customer_payment(
  p_payment_id UUID, p_transfer_reference TEXT, p_proof_name TEXT
)
RETURNS public.customer_payments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
DECLARE
  v_actor public.users := app_private.actor();
  v_row public.customer_payments;
  v_reference TEXT;
BEGIN
  SELECT * INTO v_row FROM public.customer_payments WHERE id = p_payment_id AND tenant_id = v_actor.tenant_id FOR UPDATE;
  IF NOT FOUND THEN PERFORM app_private.fail('Payment not found'); END IF;
  IF NOT app_private.is_payment_manager(v_actor, v_row.manager_id, v_row.branch_id) THEN
    PERFORM app_private.deny('This payment is outside your branch scope');
  END IF;
  IF v_row.status <> 'submitted' THEN PERFORM app_private.fail('Only submitted payments can be acknowledged'); END IF;
  v_reference := COALESCE(NULLIF(TRIM(p_transfer_reference), ''), v_row.reference);
  IF v_row.method = 'transfer' AND v_reference IS NULL THEN
    PERFORM app_private.fail('Enter the transfer reference before acknowledging', 'transferReference');
  END IF;
  UPDATE public.customer_payments
     SET reference = v_reference, proof_name = COALESCE(NULLIF(TRIM(p_proof_name), ''), proof_name),
         status = 'acknowledged', acknowledged_at = pg_catalog.now(), acknowledged_by = v_actor.id, updated_at = pg_catalog.now()
   WHERE id = v_row.id RETURNING * INTO v_row;
  PERFORM app_private.notify_owners(v_row.tenant_id, 'payment_awaiting_confirmation', 'customer_payment', v_row.id::TEXT,
    'Customer payment acknowledged by manager · awaiting your confirmation');
  PERFORM app_private.audit(v_actor, 'Customer payment acknowledged', v_row.id::TEXT, 'payment', v_row.id::TEXT,
    pg_catalog.jsonb_build_object('branchId', v_row.branch_id, 'customerId', v_row.customer_id, 'amount', v_row.amount));
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_customer_payment(p_payment_id UUID)
RETURNS public.customer_payments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
DECLARE
  v_actor public.users := app_private.actor();
  v_row public.customer_payments;
BEGIN
  IF v_actor.role <> 'owner' THEN PERFORM app_private.deny('Only the business owner can confirm payments'); END IF;
  SELECT * INTO v_row FROM public.customer_payments WHERE id = p_payment_id AND tenant_id = v_actor.tenant_id FOR UPDATE;
  IF NOT FOUND THEN PERFORM app_private.fail('Payment not found'); END IF;
  IF v_row.status NOT IN ('submitted', 'acknowledged') THEN PERFORM app_private.fail('Only pending payments can be confirmed'); END IF;
  UPDATE public.customer_payments
     SET status = 'confirmed', confirmed_at = pg_catalog.now(), confirmed_by = v_actor.id, updated_at = pg_catalog.now()
   WHERE id = v_row.id RETURNING * INTO v_row;
  PERFORM app_private.notify(v_row.tenant_id, v_row.received_by, 'payment_confirmed', 'customer_payment', v_row.id::TEXT,
    'Your customer payment was confirmed by the owner');
  PERFORM app_private.audit(v_actor, 'Customer payment confirmed', v_row.id::TEXT, 'payment', v_row.id::TEXT,
    pg_catalog.jsonb_build_object('branchId', v_row.branch_id, 'customerId', v_row.customer_id, 'amount', v_row.amount));
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.decline_customer_payment(p_payment_id UUID, p_reason TEXT)
RETURNS public.customer_payments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
DECLARE
  v_actor public.users := app_private.actor();
  v_row public.customer_payments;
BEGIN
  SELECT * INTO v_row FROM public.customer_payments WHERE id = p_payment_id AND tenant_id = v_actor.tenant_id FOR UPDATE;
  IF NOT FOUND THEN PERFORM app_private.fail('Payment not found'); END IF;
  IF v_actor.role = 'owner' THEN
    IF v_row.status NOT IN ('submitted', 'acknowledged') THEN
      PERFORM app_private.fail('Only pending payments can be declined by the owner');
    END IF;
  ELSIF app_private.is_payment_manager(v_actor, v_row.manager_id, v_row.branch_id) THEN
    IF v_row.status <> 'submitted' THEN PERFORM app_private.fail('Only submitted payments can be declined by a manager'); END IF;
  ELSE
    PERFORM app_private.deny('You cannot decline this payment');
  END IF;
  IF TRIM(COALESCE(p_reason, '')) = '' THEN PERFORM app_private.fail('A decline reason is required', 'reason'); END IF;
  UPDATE public.customer_payments
     SET status = 'declined', declined_at = pg_catalog.now(), declined_by = v_actor.id,
         decline_reason = TRIM(p_reason), updated_at = pg_catalog.now()
   WHERE id = v_row.id RETURNING * INTO v_row;
  PERFORM app_private.notify(v_row.tenant_id, v_row.received_by, 'payment_declined', 'customer_payment', v_row.id::TEXT,
    'Your customer payment was declined: ' || v_row.decline_reason);
  PERFORM app_private.audit(v_actor, 'Customer payment declined', v_row.decline_reason, 'payment', v_row.id::TEXT,
    pg_catalog.jsonb_build_object('branchId', v_row.branch_id, 'customerId', v_row.customer_id, 'declineReason', v_row.decline_reason));
  RETURN v_row;
END;
$$;

-- ----------------------------------------------------------------------------
-- Rep payments
-- ----------------------------------------------------------------------------
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
  IF app_private.rep_total_sales(v_actor.tenant_id, v_actor.id, p_period) - v_previous - p_cash_amount - p_transfer_amount < 0 THEN
    PERFORM app_private.fail('Cash and transfer cannot exceed total sales', 'transferAmount');
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

CREATE OR REPLACE FUNCTION public.acknowledge_payment(
  p_payment_id TEXT, p_transfer_reference TEXT, p_proof_name TEXT
)
RETURNS public.payments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
DECLARE
  v_actor public.users := app_private.actor();
  v_row public.payments;
  v_reference TEXT;
BEGIN
  SELECT * INTO v_row FROM public.payments WHERE id = p_payment_id AND tenant_id = v_actor.tenant_id FOR UPDATE;
  IF NOT FOUND THEN PERFORM app_private.fail('Payment not found'); END IF;
  IF NOT app_private.is_payment_manager(v_actor, v_row.manager_id, v_row.branch_id) THEN
    PERFORM app_private.deny('This payment is outside your branch scope');
  END IF;
  IF v_row.status <> 'submitted' THEN PERFORM app_private.fail('Only submitted payments can be acknowledged'); END IF;
  v_reference := COALESCE(NULLIF(TRIM(p_transfer_reference), ''), v_row.transfer_reference);
  IF v_row.transfer_amount > 0 AND v_reference IS NULL THEN
    PERFORM app_private.fail('Enter the transfer reference before acknowledging', 'transferReference');
  END IF;
  UPDATE public.payments
     SET transfer_reference = v_reference, proof_name = COALESCE(NULLIF(TRIM(p_proof_name), ''), proof_name),
         status = 'acknowledged', acknowledged_at = pg_catalog.now(), acknowledged_by = v_actor.id, updated_at = pg_catalog.now()
   WHERE id = v_row.id RETURNING * INTO v_row;
  PERFORM app_private.notify_owners(v_row.tenant_id, 'payment_awaiting_confirmation', 'payment', v_row.id,
    v_row.id || ' acknowledged by manager · awaiting your confirmation');
  PERFORM app_private.audit(v_actor, 'PAYMENT_ACKNOWLEDGED', v_row.id || ' · ' || v_row.period || ' payment acknowledged',
    'payment', v_row.id, pg_catalog.jsonb_build_object('branchId', v_row.branch_id, 'salesRepId', v_row.sales_rep_id, 'period', v_row.period));
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_payment(p_payment_id TEXT)
RETURNS public.payments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
DECLARE
  v_actor public.users := app_private.actor();
  v_row public.payments;
BEGIN
  IF v_actor.role <> 'owner' THEN PERFORM app_private.deny('Only the business owner can confirm payments'); END IF;
  SELECT * INTO v_row FROM public.payments WHERE id = p_payment_id AND tenant_id = v_actor.tenant_id FOR UPDATE;
  IF NOT FOUND THEN PERFORM app_private.fail('Payment not found'); END IF;
  IF v_row.status NOT IN ('submitted', 'acknowledged') THEN PERFORM app_private.fail('Only pending payments can be confirmed'); END IF;
  UPDATE public.payments
     SET status = 'confirmed', confirmed_at = pg_catalog.now(), confirmed_by = v_actor.id, updated_at = pg_catalog.now()
   WHERE id = v_row.id RETURNING * INTO v_row;
  PERFORM app_private.notify(v_row.tenant_id, v_row.sales_rep_id, 'payment_confirmed', 'payment', v_row.id,
    v_row.id || ' was confirmed by the owner');
  PERFORM app_private.audit(v_actor, 'PAYMENT_CONFIRMED', v_row.id || ' · owner confirmed payment', 'payment', v_row.id,
    pg_catalog.jsonb_build_object('branchId', v_row.branch_id, 'salesRepId', v_row.sales_rep_id, 'period', v_row.period));
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.decline_payment(p_payment_id TEXT, p_reason TEXT)
RETURNS public.payments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
DECLARE
  v_actor public.users := app_private.actor();
  v_row public.payments;
BEGIN
  SELECT * INTO v_row FROM public.payments WHERE id = p_payment_id AND tenant_id = v_actor.tenant_id FOR UPDATE;
  IF NOT FOUND THEN PERFORM app_private.fail('Payment not found'); END IF;
  IF v_actor.role = 'owner' THEN
    IF v_row.status NOT IN ('submitted', 'acknowledged') THEN
      PERFORM app_private.fail('Only pending payments can be declined by the owner');
    END IF;
  ELSIF app_private.is_payment_manager(v_actor, v_row.manager_id, v_row.branch_id) THEN
    IF v_row.status <> 'submitted' THEN PERFORM app_private.fail('Only submitted payments can be declined by a manager'); END IF;
  ELSE
    PERFORM app_private.deny('You cannot decline this payment');
  END IF;
  IF TRIM(COALESCE(p_reason, '')) = '' THEN PERFORM app_private.fail('A decline reason is required', 'reason'); END IF;
  UPDATE public.payments
     SET status = 'declined', declined_at = pg_catalog.now(), declined_by = v_actor.id,
         decline_reason = TRIM(p_reason), updated_at = pg_catalog.now()
   WHERE id = v_row.id RETURNING * INTO v_row;
  PERFORM app_private.notify(v_row.tenant_id, v_row.sales_rep_id, 'payment_declined', 'payment', v_row.id,
    v_row.id || ' was declined: ' || v_row.decline_reason);
  PERFORM app_private.audit(v_actor, 'PAYMENT_DECLINED', v_row.id || ' · ' || v_row.decline_reason, 'payment', v_row.id,
    pg_catalog.jsonb_build_object('branchId', v_row.branch_id, 'salesRepId', v_row.sales_rep_id, 'declineReason', v_row.decline_reason));
  RETURN v_row;
END;
$$;

-- ----------------------------------------------------------------------------
-- Expenses: owner (company, optional branch) or the branch's assigned manager.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_private.managed_branch(p_actor public.users)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
  SELECT b.id FROM public.branches b
   WHERE p_actor.role = 'manager' AND b.id = p_actor.branch_id AND b.tenant_id = p_actor.tenant_id
     AND b.manager_id = p_actor.id;
$$;

CREATE OR REPLACE FUNCTION app_private.check_expense(
  p_actor public.users, p_category TEXT, p_amount NUMERIC, p_date DATE, p_description TEXT, p_branch_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
BEGIN
  IF p_date IS NULL THEN PERFORM app_private.fail('Enter a valid expense date', 'expenseDate'); END IF;
  IF p_date > app_private.today(p_actor.tenant_id) THEN PERFORM app_private.fail('Expense date cannot be in the future', 'expenseDate'); END IF;
  IF p_category NOT IN ('transport', 'logistics', 'office', 'communication', 'maintenance', 'other') THEN
    PERFORM app_private.fail('Choose an expense category', 'category');
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN PERFORM app_private.fail('Amount must be greater than zero', 'amount'); END IF;
  IF TRIM(COALESCE(p_description, '')) = '' THEN PERFORM app_private.fail('Description is required', 'description'); END IF;
  IF p_branch_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.branches WHERE id = p_branch_id AND tenant_id = p_actor.tenant_id) THEN
    PERFORM app_private.fail('Choose a valid branch', 'branchId');
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_expense(
  p_category TEXT, p_amount NUMERIC, p_expense_date DATE, p_description TEXT, p_note TEXT, p_branch_id UUID,
  p_idempotency_key UUID DEFAULT NULL
)
RETURNS public.expenses
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
DECLARE
  v_actor public.users := app_private.actor();
  v_branch UUID;
  v_row public.expenses;
  v_prior JSONB := app_private.replay(p_idempotency_key, 'create_expense');
BEGIN
  IF v_prior IS NOT NULL THEN
    RETURN pg_catalog.jsonb_populate_record(NULL::public.expenses, v_prior);
  END IF;
  IF v_actor.role = 'owner' THEN
    v_branch := p_branch_id;
  ELSE
    v_branch := app_private.managed_branch(v_actor);
    IF v_branch IS NULL THEN PERFORM app_private.deny('Only an active Owner or branch Manager can record expenses'); END IF;
  END IF;
  PERFORM app_private.check_expense(v_actor, p_category, p_amount, p_expense_date, p_description, v_branch);
  INSERT INTO public.expenses (id, tenant_id, branch_id, manager_id, owner_id, category, amount, expense_date,
                               description, note, status)
  VALUES (app_private.next_id('EXP', 'app_private.expense_seq', 'public.expenses'), v_actor.tenant_id, v_branch,
          CASE WHEN v_actor.role = 'manager' THEN v_actor.id END, CASE WHEN v_actor.role = 'owner' THEN v_actor.id END,
          p_category, p_amount, p_expense_date, TRIM(p_description), NULLIF(TRIM(p_note), ''), 'recorded')
  RETURNING * INTO v_row;
  PERFORM app_private.audit(v_actor, 'EXPENSE_CREATED', v_row.id || ' · ' || v_row.description, 'expense', v_row.id,
    pg_catalog.jsonb_build_object('branchId', v_row.branch_id, 'managerId', v_row.manager_id, 'expenseId', v_row.id,
      'amount', v_row.amount, 'category', v_row.category, 'period', pg_catalog.to_char(v_row.expense_date, 'YYYY-MM')));
  PERFORM app_private.remember(p_idempotency_key, 'create_expense', pg_catalog.to_jsonb(v_row));
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION app_private.own_expense(p_actor public.users, p_expense_id TEXT, p_message TEXT)
RETURNS public.expenses
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
DECLARE
  v_row public.expenses;
BEGIN
  SELECT * INTO v_row FROM public.expenses WHERE id = p_expense_id AND tenant_id = p_actor.tenant_id FOR UPDATE;
  IF NOT FOUND THEN PERFORM app_private.fail('Expense not found'); END IF;
  -- Owners manage their own expenses, managers their branch's. NULL must mean "no".
  IF NOT COALESCE((p_actor.role = 'owner' AND v_row.owner_id = p_actor.id)
       OR (v_row.manager_id = p_actor.id AND v_row.branch_id = app_private.managed_branch(p_actor)), FALSE) THEN
    PERFORM app_private.deny(p_message);
  END IF;
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_expense(
  p_expense_id TEXT, p_category TEXT, p_amount NUMERIC, p_expense_date DATE, p_description TEXT, p_note TEXT, p_branch_id UUID
)
RETURNS public.expenses
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
DECLARE
  v_actor public.users := app_private.actor();
  v_row public.expenses := app_private.own_expense(v_actor, p_expense_id, 'You cannot edit this expense');
  v_branch UUID;
BEGIN
  IF v_row.status <> 'recorded' THEN PERFORM app_private.fail('Voided expenses cannot be edited'); END IF;
  v_branch := CASE WHEN v_actor.role = 'owner' THEN p_branch_id ELSE v_row.branch_id END;
  PERFORM app_private.check_expense(v_actor, p_category, p_amount, p_expense_date, p_description, v_branch);
  UPDATE public.expenses
     SET branch_id = v_branch, category = p_category, amount = p_amount, expense_date = p_expense_date,
         description = TRIM(p_description), note = NULLIF(TRIM(p_note), ''), updated_at = pg_catalog.now()
   WHERE id = v_row.id RETURNING * INTO v_row;
  PERFORM app_private.audit(v_actor, 'EXPENSE_UPDATED', v_row.id || ' · ' || v_row.description, 'expense', v_row.id,
    pg_catalog.jsonb_build_object('branchId', v_row.branch_id, 'managerId', v_row.manager_id, 'expenseId', v_row.id,
      'amount', v_row.amount, 'category', v_row.category, 'period', pg_catalog.to_char(v_row.expense_date, 'YYYY-MM')));
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.void_expense(p_expense_id TEXT, p_reason TEXT)
RETURNS public.expenses
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
DECLARE
  v_actor public.users := app_private.actor();
  v_row public.expenses := app_private.own_expense(v_actor, p_expense_id, 'You cannot void this expense');
BEGIN
  IF v_row.status <> 'recorded' THEN PERFORM app_private.fail('This expense is already voided'); END IF;
  IF TRIM(COALESCE(p_reason, '')) = '' THEN PERFORM app_private.fail('A void reason is required', 'reason'); END IF;
  UPDATE public.expenses SET status = 'voided', updated_at = pg_catalog.now() WHERE id = v_row.id RETURNING * INTO v_row;
  PERFORM app_private.audit(v_actor, 'EXPENSE_VOIDED', v_row.id || ' · ' || TRIM(p_reason), 'expense', v_row.id,
    pg_catalog.jsonb_build_object('branchId', v_row.branch_id, 'managerId', v_row.manager_id, 'expenseId', v_row.id,
      'amount', v_row.amount, 'reason', TRIM(p_reason), 'period', pg_catalog.to_char(v_row.expense_date, 'YYYY-MM')));
  RETURN v_row;
END;
$$;

-- ----------------------------------------------------------------------------
-- Manager remittances (branch manager → owner)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_manager_remittance(
  p_period TEXT, p_cash_amount NUMERIC, p_transfer_amount NUMERIC, p_transfer_reference TEXT, p_note TEXT
)
RETURNS public.manager_remittances
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
DECLARE
  v_actor public.users := app_private.actor();
  v_branch UUID := app_private.managed_branch(v_actor);
  v_payment_ids JSONB;
  v_expense_ids JSONB;
  v_walk_in NUMERIC;
  v_customer NUMERIC;
  v_received NUMERIC;
  v_expenses NUMERIC;
  v_previous NUMERIC;
  v_net NUMERIC;
  v_outstanding NUMERIC;
  v_row public.manager_remittances;
BEGIN
  IF v_branch IS NULL THEN PERFORM app_private.deny('Only an active branch manager can submit remittance'); END IF;
  IF NOT app_private.valid_period(p_period, v_actor.tenant_id) THEN
    PERFORM app_private.fail('Choose a valid current or past month', 'period');
  END IF;
  IF p_cash_amount IS NULL OR p_cash_amount < 0 THEN PERFORM app_private.fail('Cash cannot be negative', 'cashAmount'); END IF;
  IF p_transfer_amount IS NULL OR p_transfer_amount < 0 THEN PERFORM app_private.fail('Transfer cannot be negative', 'transferAmount'); END IF;
  IF p_transfer_amount > 0 AND TRIM(COALESCE(p_transfer_reference, '')) = '' THEN
    PERFORM app_private.fail('A transfer reference is required when transfer is greater than zero', 'transferReference');
  END IF;
  -- Serialise submissions for this manager and period.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_actor.id::TEXT || p_period, 0));
  IF EXISTS (SELECT 1 FROM public.manager_remittances WHERE manager_id = v_actor.id AND period = p_period AND status = 'submitted') THEN
    PERFORM app_private.fail('A remittance for this period is already awaiting Owner review');
  END IF;

  -- Acknowledged/confirmed rep payments of the manager's branch.
  SELECT COALESCE(pg_catalog.jsonb_agg(p.id), '[]'::JSONB) INTO v_payment_ids
    FROM public.payments p
   WHERE p.tenant_id = v_actor.tenant_id AND p.manager_id = v_actor.id AND p.branch_id = v_branch
     AND p.period = p_period AND p.status IN ('acknowledged', 'confirmed');
  IF pg_catalog.jsonb_array_length(v_payment_ids) = 0 THEN
    PERFORM app_private.fail('There are no acknowledged Sales Rep payments for this period');
  END IF;

  -- Walk-in sales of those reps + owner-confirmed customer payments.
  SELECT COALESCE(SUM(app_private.rep_total_sales(v_actor.tenant_id, rep_id, p_period)), 0) INTO v_walk_in
    FROM (SELECT DISTINCT p.sales_rep_id AS rep_id FROM public.payments p
           WHERE p.id IN (SELECT pg_catalog.jsonb_array_elements_text(v_payment_ids))) reps;
  SELECT COALESCE(SUM(c.amount), 0) INTO v_customer
    FROM public.customer_payments c
   WHERE c.tenant_id = v_actor.tenant_id AND c.manager_id = v_actor.id AND c.status = 'confirmed'
     AND pg_catalog.to_char(c.payment_date, 'YYYY-MM') = p_period;
  v_received := v_walk_in + v_customer;

  SELECT COALESCE(SUM(e.amount), 0), COALESCE(pg_catalog.jsonb_agg(e.id), '[]'::JSONB) INTO v_expenses, v_expense_ids
    FROM public.expenses e
   WHERE e.tenant_id = v_actor.tenant_id AND e.manager_id = v_actor.id AND e.branch_id = v_branch
     AND e.status = 'recorded' AND pg_catalog.to_char(e.expense_date, 'YYYY-MM') = p_period;

  SELECT COALESCE(SUM(r.cash_amount + r.transfer_amount), 0) INTO v_previous
    FROM public.manager_remittances r
   WHERE r.tenant_id = v_actor.tenant_id AND r.manager_id = v_actor.id AND r.branch_id = v_branch
     AND r.period = p_period AND r.status <> 'declined';

  v_net := v_received - v_expenses - v_previous;
  IF v_net < 0 THEN
    PERFORM app_private.fail('Recorded expenses exceed the eligible payment position for this period');
  END IF;
  v_outstanding := v_net - p_cash_amount - p_transfer_amount;
  IF v_outstanding < 0 THEN
    PERFORM app_private.fail('Cash and transfer cannot exceed net remittance due', 'transferAmount');
  END IF;

  INSERT INTO public.manager_remittances (tenant_id, branch_id, manager_id, period, total_received, expense_amount,
    net_remittance_due, cash_amount, transfer_amount, outstanding_amount, transfer_reference, status, submitted_at,
    note, payment_ids, expense_ids)
  VALUES (v_actor.tenant_id, v_branch, v_actor.id, p_period, v_received, v_expenses, v_net, p_cash_amount,
          p_transfer_amount, v_outstanding, NULLIF(TRIM(p_transfer_reference), ''), 'submitted', pg_catalog.now(),
          NULLIF(TRIM(p_note), ''), v_payment_ids, v_expense_ids)
  RETURNING * INTO v_row;

  PERFORM app_private.audit(v_actor, 'REMITTANCE_SUBMITTED', v_row.period || ' remittance submitted', 'remittance', v_row.id::TEXT,
    pg_catalog.jsonb_build_object('branchId', v_branch, 'managerId', v_actor.id, 'remittanceId', v_row.id, 'period', v_row.period,
      'totalReceived', v_received, 'expenseAmount', v_expenses, 'netRemittanceDue', v_net, 'cashAmount', p_cash_amount,
      'transferAmount', p_transfer_amount, 'outstandingAmount', v_outstanding));
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION app_private.reviewable_remittance(p_actor public.users, p_remittance_id UUID)
RETURNS public.manager_remittances
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
DECLARE
  v_row public.manager_remittances;
BEGIN
  IF p_actor.role <> 'owner' THEN PERFORM app_private.deny('Only the active business owner can review this remittance'); END IF;
  SELECT * INTO v_row FROM public.manager_remittances WHERE id = p_remittance_id AND tenant_id = p_actor.tenant_id FOR UPDATE;
  IF NOT FOUND THEN PERFORM app_private.fail('Remittance not found'); END IF;
  IF NOT EXISTS (SELECT 1 FROM public.branches WHERE id = v_row.branch_id AND manager_id = v_row.manager_id) THEN
    PERFORM app_private.fail('This remittance is not linked to a valid branch manager');
  END IF;
  IF v_row.status <> 'submitted' THEN PERFORM app_private.fail('Only submitted remittances can be reviewed'); END IF;
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_manager_remittance(p_remittance_id UUID)
RETURNS public.manager_remittances
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
DECLARE
  v_actor public.users := app_private.actor();
  v_row public.manager_remittances := app_private.reviewable_remittance(v_actor, p_remittance_id);
BEGIN
  UPDATE public.manager_remittances
     SET status = 'confirmed', confirmed_at = pg_catalog.now(), confirmed_by = v_actor.id, updated_at = pg_catalog.now()
   WHERE id = v_row.id RETURNING * INTO v_row;
  PERFORM app_private.audit(v_actor, 'REMITTANCE_CONFIRMED', v_row.period || ' remittance confirmed', 'remittance', v_row.id::TEXT,
    pg_catalog.jsonb_build_object('branchId', v_row.branch_id, 'managerId', v_row.manager_id, 'remittanceId', v_row.id,
      'period', v_row.period, 'netRemittanceDue', v_row.net_remittance_due));
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.decline_manager_remittance(p_remittance_id UUID, p_reason TEXT)
RETURNS public.manager_remittances
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
DECLARE
  v_actor public.users := app_private.actor();
  v_row public.manager_remittances := app_private.reviewable_remittance(v_actor, p_remittance_id);
BEGIN
  IF TRIM(COALESCE(p_reason, '')) = '' THEN PERFORM app_private.fail('A decline reason is required', 'reason'); END IF;
  UPDATE public.manager_remittances
     SET status = 'declined', declined_at = pg_catalog.now(), declined_by = v_actor.id,
         decline_reason = TRIM(p_reason), updated_at = pg_catalog.now()
   WHERE id = v_row.id RETURNING * INTO v_row;
  PERFORM app_private.audit(v_actor, 'REMITTANCE_DECLINED', v_row.period || ' · ' || v_row.decline_reason, 'remittance', v_row.id::TEXT,
    pg_catalog.jsonb_build_object('branchId', v_row.branch_id, 'managerId', v_row.manager_id, 'remittanceId', v_row.id,
      'period', v_row.period, 'reason', v_row.decline_reason));
  RETURN v_row;
END;
$$;

-- ----------------------------------------------------------------------------
-- Owner remittances: money paid out of the business (not part of the chain).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_owner_remittance(
  p_payee_type TEXT, p_payee_name TEXT, p_amount NUMERIC, p_payment_method TEXT, p_reference TEXT,
  p_remittance_date DATE, p_purpose TEXT, p_note TEXT, p_idempotency_key UUID DEFAULT NULL
)
RETURNS public.owner_remittances
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
DECLARE
  v_actor public.users := app_private.actor();
  v_row public.owner_remittances;
  v_prior JSONB := app_private.replay(p_idempotency_key, 'create_owner_remittance');
BEGIN
  IF v_prior IS NOT NULL THEN
    RETURN pg_catalog.jsonb_populate_record(NULL::public.owner_remittances, v_prior);
  END IF;
  IF v_actor.role <> 'owner' THEN PERFORM app_private.deny('Only the active business owner can create remittances'); END IF;
  IF p_payee_type NOT IN ('supplier', 'landlord', 'utility', 'contractor', 'other') THEN
    PERFORM app_private.fail('Choose a payee type', 'payeeType');
  END IF;
  IF TRIM(COALESCE(p_payee_name, '')) = '' THEN PERFORM app_private.fail('Payee name is required', 'payeeName'); END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN PERFORM app_private.fail('Amount must be greater than zero', 'amount'); END IF;
  IF p_payment_method NOT IN ('cash', 'transfer') THEN PERFORM app_private.fail('Choose a payment method', 'paymentMethod'); END IF;
  IF p_remittance_date IS NULL THEN PERFORM app_private.fail('Enter a valid remittance date', 'remittanceDate'); END IF;
  IF p_remittance_date > app_private.today(v_actor.tenant_id) THEN
    PERFORM app_private.fail('Date cannot be in the future', 'remittanceDate');
  END IF;
  IF TRIM(COALESCE(p_purpose, '')) = '' THEN PERFORM app_private.fail('Purpose is required', 'purpose'); END IF;
  IF p_payment_method = 'transfer' AND TRIM(COALESCE(p_reference, '')) = '' THEN
    PERFORM app_private.fail('A transfer reference is required', 'reference');
  END IF;
  INSERT INTO public.owner_remittances (id, tenant_id, payee_type, payee_name, amount, payment_method, reference,
                                        purpose, remittance_date, note, created_by)
  VALUES (app_private.next_id('ORM', 'app_private.owner_remittance_seq', 'public.owner_remittances'), v_actor.tenant_id,
          p_payee_type, TRIM(p_payee_name), p_amount, p_payment_method, NULLIF(TRIM(p_reference), ''), TRIM(p_purpose),
          p_remittance_date, NULLIF(TRIM(p_note), ''), v_actor.id)
  RETURNING * INTO v_row;
  PERFORM app_private.audit(v_actor, 'REMITTANCE_RECORDED', v_row.id || ' · ' || v_row.payee_name, 'remittance', v_row.id,
    pg_catalog.jsonb_build_object('remittanceId', v_row.id, 'amount', v_row.amount, 'payeeName', v_row.payee_name,
      'paymentMethod', v_row.payment_method, 'purpose', v_row.purpose));
  PERFORM app_private.remember(p_idempotency_key, 'create_owner_remittance', pg_catalog.to_jsonb(v_row));
  RETURN v_row;
END;
$$;

-- ----------------------------------------------------------------------------
-- Execute: signed-in users only.
-- ----------------------------------------------------------------------------
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA app_private FROM PUBLIC, anon, authenticated;
DO $$
DECLARE
  v_fn TEXT;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.create_customer(TEXT, TEXT, TEXT, TEXT, TEXT)',
    'public.update_customer(UUID, TEXT, TEXT, TEXT, TEXT, TEXT)',
    'public.set_customer_status(UUID, TEXT)',
    'public.set_customer_credit_limit(UUID, NUMERIC)',
    'public.record_customer_payment(UUID, NUMERIC, TEXT, TEXT, DATE, UUID, TEXT, UUID)',
    'public.acknowledge_customer_payment(UUID, TEXT, TEXT)',
    'public.confirm_customer_payment(UUID)',
    'public.decline_customer_payment(UUID, TEXT)',
    'public.submit_payment(TEXT, NUMERIC, NUMERIC, TEXT, TEXT, UUID)',
    'public.acknowledge_payment(TEXT, TEXT, TEXT)',
    'public.confirm_payment(TEXT)',
    'public.decline_payment(TEXT, TEXT)',
    'public.create_expense(TEXT, NUMERIC, DATE, TEXT, TEXT, UUID, UUID)',
    'public.update_expense(TEXT, TEXT, NUMERIC, DATE, TEXT, TEXT, UUID)',
    'public.void_expense(TEXT, TEXT)',
    'public.submit_manager_remittance(TEXT, NUMERIC, NUMERIC, TEXT, TEXT)',
    'public.confirm_manager_remittance(UUID)',
    'public.decline_manager_remittance(UUID, TEXT)',
    'public.create_owner_remittance(TEXT, TEXT, NUMERIC, TEXT, TEXT, DATE, TEXT, TEXT, UUID)'
  ] LOOP
    EXECUTE pg_catalog.format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', v_fn);
    EXECUTE pg_catalog.format('GRANT EXECUTE ON FUNCTION %s TO authenticated', v_fn);
  END LOOP;
END;
$$;
