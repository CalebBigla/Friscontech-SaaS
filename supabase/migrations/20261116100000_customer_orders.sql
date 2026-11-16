-- Customer orders replace stock requests.
--
-- Old: a rep requested stock -> the storekeeper approved or rejected -> issued it to
--      the rep -> the rep acknowledged, then sold from the stock they held.
-- New: a rep raises an order from the customer's order book -> the branch
--      storekeeper fulfils it (no approve or reject step) -> the rep acknowledges.
--
--   pending ──fulfil (storekeeper)──> fulfilled ──acknowledge (the rep)──> acknowledged
--      └────cancel (the rep or the Owner)──> cancelled
--
-- Stock:
--   * Raising an order reserves its units (inventory_records.quantity_reserved),
--     with the stock row locked, so two orders can never take the same units and an
--     order beyond what is available (on hand - reserved) is refused.
--   * Fulfilling releases the reservation and deducts the units once, through the
--     sales trigger and apply_stock (FEFO batches, one movement per line).
--   * Cancelling releases the reservation; nothing was deducted.
--   * apply_stock no longer zeroes quantity_reserved, and refuses any removal that
--     would dip into reserved units.
-- Money: an order's lines are sales with status 'pending' until fulfilled, so the
--   customer's ledger, the rep's target and revenue count it from fulfilment (the
--   sale date becomes the fulfilment date). A cancelled order's lines are 'voided'.
-- Walk-in sales are recorded by the Owner or a branch manager (record_sale); reps
-- no longer record sales directly. A manager's walk-in takings join what they remit.
-- Stock requests: the RPCs are dropped; the table, its rows, movements and audit
-- entries stay for history. Requests still open are closed with a note.

-- ----------------------------------------------------------------------------
-- 1. Orders
-- ----------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS app_private.customer_order_seq;

CREATE TABLE IF NOT EXISTS public.customer_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  rep_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'fulfilled', 'acknowledged', 'cancelled')),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  fulfilled_at TIMESTAMPTZ,
  fulfilled_by UUID REFERENCES public.users(id),
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by UUID REFERENCES public.users(id),
  cancelled_at TIMESTAMPTZ,
  cancelled_by UUID REFERENCES public.users(id),
  cancel_reason TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT customer_orders_status_logic CHECK (
    (status = 'pending' AND fulfilled_at IS NULL AND acknowledged_at IS NULL AND cancelled_at IS NULL)
    OR (status = 'fulfilled' AND fulfilled_at IS NOT NULL AND acknowledged_at IS NULL AND cancelled_at IS NULL)
    OR (status = 'acknowledged' AND fulfilled_at IS NOT NULL AND acknowledged_at IS NOT NULL AND cancelled_at IS NULL)
    OR (status = 'cancelled' AND cancelled_at IS NOT NULL AND fulfilled_at IS NULL))
);
COMMENT ON TABLE public.customer_orders IS 'A rep''s order for a customer: pending -> fulfilled (storekeeper) -> acknowledged (rep), or cancelled. Lines are the sales rows with this order_id.';

CREATE INDEX IF NOT EXISTS idx_customer_orders_branch_status ON public.customer_orders (branch_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customer_orders_rep_created ON public.customer_orders (rep_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customer_orders_customer ON public.customer_orders (customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customer_orders_tenant_created ON public.customer_orders (tenant_id, created_at DESC);

-- Customer sales recorded before orders existed: every line belongs to an order, and
-- each of those orders is on record as delivered and acknowledged when it was sold.
UPDATE public.sales SET order_id = gen_random_uuid()
 WHERE customer_id IS NOT NULL AND order_id IS NULL AND exchange_id IS NULL;

INSERT INTO public.customer_orders (id, code, tenant_id, branch_id, customer_id, rep_id, status, created_at,
                                    fulfilled_at, acknowledged_at, updated_at, note)
SELECT o.order_id, 'ORD-' || pg_catalog.nextval('app_private.customer_order_seq'), o.tenant_id, o.branch_id,
       o.customer_id, o.sales_rep_id, 'acknowledged', o.created_at, o.created_at, o.created_at, o.created_at,
       'Recorded as a sale before customer orders'
  FROM (SELECT DISTINCT ON (s.order_id) s.order_id, s.tenant_id, s.branch_id, s.customer_id, s.sales_rep_id, s.created_at
          FROM public.sales s
         WHERE s.customer_id IS NOT NULL AND s.order_id IS NOT NULL AND s.exchange_id IS NULL
         ORDER BY s.order_id, s.created_at) o
 ORDER BY o.created_at
ON CONFLICT (id) DO NOTHING;

-- Read: Owner all; manager and storekeeper their branch; a rep their own orders.
-- Writes only through the RPCs below.
ALTER TABLE public.customer_orders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.customer_orders FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.customer_orders FROM authenticated;
GRANT SELECT ON public.customer_orders TO authenticated;
DROP POLICY IF EXISTS customer_orders_select ON public.customer_orders;
CREATE POLICY customer_orders_select ON public.customer_orders AS PERMISSIVE FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.get_user_tenant_id())
    AND ((SELECT public.get_user_role()) = 'owner'
      OR ((SELECT public.get_user_role()) IN ('storekeeper', 'manager') AND branch_id = (SELECT public.get_user_branch_id()))
      OR ((SELECT public.get_user_role()) = 'sales_rep' AND rep_id = (SELECT auth.uid()))));

-- Sales are written only through the RPCs now (reps no longer insert sales at all).
DROP POLICY IF EXISTS core_sales_insert ON public.sales;
DROP POLICY IF EXISTS core_sales_insert_guard ON public.sales;
CREATE POLICY core_sales_insert_guard ON public.sales AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (false);

-- Notifications and audit entries for orders.
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
    'report_requested', 'report_approved', 'report_rejected',
    'exchange_requested', 'exchange_approved', 'exchange_rejected', 'exchange_fulfilled',
    'order_submitted', 'order_fulfilled', 'order_cancelled'
  ));
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_entity_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_entity_type_check
  CHECK (entity_type IN ('payment', 'customer_payment', 'onboarding', 'stock_request', 'approval_request', 'report_request',
                         'stock_exchange', 'customer_order'));
ALTER TABLE public.activities DROP CONSTRAINT IF EXISTS activities_entity_check;
ALTER TABLE public.activities ADD CONSTRAINT activities_entity_check
  CHECK (entity IN ('product', 'sale', 'payment', 'expense', 'remittance', 'stock_request', 'target',
                    'team_member', 'branch', 'inventory', 'settings', 'session', 'customer', 'report', 'exchange', 'order'));

-- ----------------------------------------------------------------------------
-- 2. Stock: reserved units are kept and protected
-- ----------------------------------------------------------------------------
-- Reserved = the units of orders still waiting to be fulfilled (0 before this change;
-- recomputed, so running this file again keeps live reservations right).
UPDATE public.inventory_records i
   SET quantity_reserved = COALESCE((
         SELECT SUM(s.quantity) FROM public.sales s JOIN public.customer_orders o ON o.id = s.order_id
          WHERE o.status = 'pending' AND s.status = 'pending' AND s.branch_id = i.branch_id AND s.product_id = i.product_id), 0)
 WHERE i.quantity_reserved IS DISTINCT FROM COALESCE((
         SELECT SUM(s.quantity) FROM public.sales s JOIN public.customer_orders o ON o.id = s.order_id
          WHERE o.status = 'pending' AND s.status = 'pending' AND s.branch_id = i.branch_id AND s.product_id = i.product_id), 0);

CREATE OR REPLACE FUNCTION app_private.apply_stock(
  p_tenant_id UUID,
  p_branch_id UUID,
  p_product_id UUID,
  p_delta INTEGER,
  p_type TEXT,
  p_reference_type TEXT,
  p_reference_id TEXT,
  p_performed_by UUID,
  p_note TEXT DEFAULT NULL,
  p_batch_number TEXT DEFAULT NULL,
  p_expiry_date DATE DEFAULT NULL
)
RETURNS public.inventory_records
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
DECLARE
  v_record public.inventory_records;
  v_left INTEGER;
  v_take INTEGER;
  v_lot RECORD;
  v_batch TEXT;
BEGIN
  IF p_delta = 0 THEN
    PERFORM app_private.fail('The quantity cannot be zero.', 'quantity');
  END IF;

  SELECT * INTO v_record FROM public.inventory_records
   WHERE tenant_id = p_tenant_id AND branch_id = p_branch_id AND product_id = p_product_id
   FOR UPDATE;

  IF NOT FOUND THEN
    IF p_delta < 0 THEN
      PERFORM app_private.fail('This branch does not stock this product.', 'productId');
    END IF;
    INSERT INTO public.inventory_records (tenant_id, branch_id, product_id, quantity_on_hand,
                                          quantity_reserved, low_stock_threshold, reorder_level)
    SELECT p_tenant_id, p_branch_id, p_product_id, 0, 0, p.low_stock_threshold, p.low_stock_threshold * 2
      FROM public.products p WHERE p.id = p_product_id
    RETURNING * INTO v_record;
  END IF;

  IF v_record.quantity_on_hand + p_delta < 0 THEN
    PERFORM app_private.fail('Insufficient stock. Quantity cannot exceed available stock.', 'quantity');
  END IF;
  -- Units reserved for customer orders can't be taken by anything else.
  IF p_delta < 0 AND v_record.quantity_on_hand + p_delta < v_record.quantity_reserved THEN
    PERFORM app_private.fail('Only ' || GREATEST(v_record.quantity_on_hand - v_record.quantity_reserved, 0)
      || ' available: ' || v_record.quantity_reserved || ' are reserved for customer orders waiting to be fulfilled.', 'quantity');
  END IF;

  UPDATE public.inventory_records
     SET quantity_on_hand = quantity_on_hand + p_delta,
         last_updated = pg_catalog.now()
   WHERE id = v_record.id
  RETURNING * INTO v_record;

  IF p_delta > 0 AND p_expiry_date IS NOT NULL THEN
    v_batch := COALESCE(NULLIF(TRIM(p_batch_number), ''),
      'LOT-' || pg_catalog.to_char(pg_catalog.now(), 'YYYYMMDD') || '-'
      || UPPER(SUBSTRING(pg_catalog.md5(pg_catalog.random()::TEXT) FROM 1 FOR 4)));
    INSERT INTO public.stock_batches (tenant_id, branch_id, product_id, batch_number, expiry_date,
                                      quantity_received, quantity_remaining)
    VALUES (p_tenant_id, p_branch_id, p_product_id, v_batch, p_expiry_date, p_delta, p_delta)
    ON CONFLICT (branch_id, product_id, batch_number, expiry_date) DO UPDATE
       SET quantity_received = public.stock_batches.quantity_received + EXCLUDED.quantity_received,
           quantity_remaining = public.stock_batches.quantity_remaining + EXCLUDED.quantity_remaining;
  ELSIF p_delta < 0 THEN
    -- First expiry, first out.
    v_left := -p_delta;
    FOR v_lot IN
      SELECT id, quantity_remaining FROM public.stock_batches
       WHERE branch_id = p_branch_id AND product_id = p_product_id AND quantity_remaining > 0
       ORDER BY expiry_date, received_at
       FOR UPDATE
    LOOP
      EXIT WHEN v_left <= 0;
      v_take := LEAST(v_left, v_lot.quantity_remaining);
      UPDATE public.stock_batches SET quantity_remaining = quantity_remaining - v_take WHERE id = v_lot.id;
      v_left := v_left - v_take;
    END LOOP;
  END IF;

  INSERT INTO public.inventory_movements (tenant_id, branch_id, product_id, type, quantity,
                                          reference_type, reference_id, performed_by, note)
  VALUES (p_tenant_id, p_branch_id, p_product_id, p_type, p_delta,
          p_reference_type, p_reference_id, p_performed_by, NULLIF(TRIM(p_note), ''));

  RETURN v_record;
END;
$$;
REVOKE ALL ON FUNCTION app_private.apply_stock(UUID, UUID, UUID, INTEGER, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, DATE)
  FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3. Sale stock trigger
--   exchange replacement   storekeeper, inside fulfil_exchange (unchanged)
--   order line fulfilled   storekeeper of the branch, inside fulfil_customer_order
--   direct sale            Owner (any branch) or manager (own branch, walk-in)
-- Each deducts the line once from branch stock. Reps' issued stock is gone, so
-- quantity_from_rep_stock stays 0 on new lines (old lines keep their history).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_sale_inventory()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
DECLARE
  v_role TEXT := public.get_user_role();
BEGIN
  IF NEW.status = 'completed'
     AND (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.status <> 'completed')) THEN
    IF auth.uid() IS NULL OR NEW.tenant_id IS DISTINCT FROM public.get_user_tenant_id() THEN
      RAISE EXCEPTION 'Not authorized to complete this sale.' USING ERRCODE = '42501';
    END IF;
    NEW.quantity_from_rep_stock := 0;

    IF NEW.exchange_id IS NOT NULL THEN
      IF v_role IS DISTINCT FROM 'storekeeper' OR NEW.branch_id IS DISTINCT FROM public.get_user_branch_id() THEN
        RAISE EXCEPTION 'Not authorized to complete this sale.' USING ERRCODE = '42501';
      END IF;
      PERFORM app_private.apply_stock(
        NEW.tenant_id, NEW.branch_id, NEW.product_id, -NEW.quantity,
        'exchange_issue', 'sale', NEW.id::TEXT, auth.uid(), 'Replacement for exchange ' || NEW.exchange_id);
      RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' AND OLD.status = 'pending' THEN
      IF v_role IS DISTINCT FROM 'storekeeper' OR NEW.branch_id IS DISTINCT FROM public.get_user_branch_id()
         OR pg_catalog.current_setting('app.fulfilling_order', TRUE) IS DISTINCT FROM NEW.order_id::TEXT THEN
        RAISE EXCEPTION 'Not authorized to complete this sale.' USING ERRCODE = '42501';
      END IF;
      PERFORM app_private.apply_stock(
        NEW.tenant_id, NEW.branch_id, NEW.product_id, -NEW.quantity,
        CASE WHEN NEW.is_promo THEN 'promo' ELSE 'sale' END, 'sale', NEW.id::TEXT, auth.uid(),
        'Order ' || COALESCE((SELECT code FROM public.customer_orders WHERE id = NEW.order_id), '') || ' for '
          || app_private.full_name(NEW.sales_rep_id));
      RETURN NEW;
    END IF;

    IF v_role IS DISTINCT FROM 'owner'
       AND NOT (v_role = 'manager' AND NEW.branch_id = public.get_user_branch_id()
                AND NEW.customer_id IS NULL AND NEW.sales_rep_id = auth.uid()) THEN
      RAISE EXCEPTION 'Not authorized to complete this sale.' USING ERRCODE = '42501';
    END IF;
    PERFORM app_private.apply_stock(
      NEW.tenant_id, NEW.branch_id, NEW.product_id, -NEW.quantity,
      CASE WHEN NEW.is_promo THEN 'promo' ELSE 'sale' END, 'sale', NEW.id::TEXT, NEW.sales_rep_id);
  ELSIF TG_OP = 'INSERT' THEN
    NEW.quantity_from_rep_stock := 0;
  END IF;
  RETURN NEW;
END;
$$;
ALTER FUNCTION public.process_sale_inventory() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.process_sale_inventory() FROM PUBLIC;

-- Discounts and promo items stay the Owner's to give (reps and managers sell at list price).
CREATE OR REPLACE FUNCTION app_private.guard_rep_discount()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
BEGIN
  IF (COALESCE(NEW.discount_amount, 0) > 0 OR NEW.is_promo)
     AND EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('sales_rep', 'manager')) THEN
    PERFORM app_private.fail('Only the Owner can give discounts and promo items. Record the sale at list price.', 'items');
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION app_private.guard_rep_discount() FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 4. Order RPCs
-- ----------------------------------------------------------------------------
-- p_items: [{ "product_id": uuid, "quantity": int }]
CREATE OR REPLACE FUNCTION public.place_customer_order(
  p_customer_id UUID, p_items JSONB, p_note TEXT, p_idempotency_key UUID DEFAULT NULL
)
RETURNS public.customer_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
DECLARE
  v_actor public.users := app_private.actor();
  v_prior JSONB := app_private.replay(p_idempotency_key, 'place_customer_order');
  v_branch public.branches;
  v_customer public.customers;
  v_item JSONB;
  v_product public.products;
  v_qty INTEGER;
  v_seen UUID[] := '{}';
  v_stock public.inventory_records;
  v_order public.customer_orders;
  v_count INTEGER;
BEGIN
  IF v_prior IS NOT NULL THEN
    RETURN pg_catalog.jsonb_populate_record(NULL::public.customer_orders, v_prior);
  END IF;
  IF v_actor.role <> 'sales_rep' THEN
    PERFORM app_private.deny('Orders are raised by the customer''s sales representative');
  END IF;
  SELECT * INTO v_branch FROM public.branches WHERE id = v_actor.branch_id AND tenant_id = v_actor.tenant_id;
  IF NOT FOUND OR v_branch.status <> 'active' THEN PERFORM app_private.fail('You need an active branch to raise orders'); END IF;
  SELECT * INTO v_customer FROM public.customers WHERE id = p_customer_id AND tenant_id = v_actor.tenant_id;
  IF NOT FOUND OR v_customer.assigned_rep_id IS DISTINCT FROM v_actor.id THEN
    PERFORM app_private.fail('Choose one of your customers', 'customerId');
  END IF;
  IF v_customer.status <> 'active' THEN PERFORM app_private.fail('This customer is inactive', 'customerId'); END IF;
  IF p_items IS NULL OR pg_catalog.jsonb_typeof(p_items) <> 'array' OR pg_catalog.jsonb_array_length(p_items) = 0 THEN
    PERFORM app_private.fail('Add at least one product', 'items');
  END IF;

  -- Check every line first. Stock rows are locked in product order, so concurrent
  -- orders queue on the same rows instead of both seeing the same free units.
  FOR v_item IN
    SELECT e FROM pg_catalog.jsonb_array_elements(p_items) e ORDER BY e ->> 'product_id'
  LOOP
    SELECT * INTO v_product FROM public.products
     WHERE id = NULLIF(v_item ->> 'product_id', '')::UUID AND tenant_id = v_actor.tenant_id;
    IF NOT FOUND THEN PERFORM app_private.fail('Select a product for every item', 'items'); END IF;
    IF v_product.status <> 'active' THEN PERFORM app_private.fail(v_product.name || ' is inactive', 'items'); END IF;
    IF v_product.product_type = 'promo' THEN
      PERFORM app_private.fail(v_product.name || ' is a promo item: only the Owner adds promo items', 'items');
    END IF;
    IF v_product.id = ANY (v_seen) THEN PERFORM app_private.fail(v_product.name || ' is already in the order', 'items'); END IF;
    v_seen := v_seen || v_product.id;
    v_qty := (v_item ->> 'quantity')::INTEGER;
    IF v_qty IS NULL OR v_qty <= 0 OR (v_item ->> 'quantity')::NUMERIC <> v_qty THEN
      PERFORM app_private.fail('Enter a whole quantity above zero for ' || v_product.name, 'items');
    END IF;
    SELECT * INTO v_stock FROM public.inventory_records
     WHERE branch_id = v_branch.id AND product_id = v_product.id FOR UPDATE;
    IF NOT FOUND OR v_stock.quantity_on_hand - v_stock.quantity_reserved <= 0 THEN
      PERFORM app_private.fail(v_product.name || ' is out of stock', 'items');
    END IF;
    IF v_qty > v_stock.quantity_on_hand - v_stock.quantity_reserved THEN
      PERFORM app_private.fail('Only ' || (v_stock.quantity_on_hand - v_stock.quantity_reserved) || ' of '
        || v_product.name || ' available', 'items');
    END IF;
  END LOOP;

  INSERT INTO public.customer_orders (code, tenant_id, branch_id, customer_id, rep_id, note)
  VALUES ('ORD-' || pg_catalog.nextval('app_private.customer_order_seq'), v_actor.tenant_id, v_branch.id, v_customer.id,
          v_actor.id, NULLIF(TRIM(p_note), ''))
  RETURNING * INTO v_order;

  FOR v_item IN SELECT * FROM pg_catalog.jsonb_array_elements(p_items) LOOP
    SELECT * INTO v_product FROM public.products WHERE id = (v_item ->> 'product_id')::UUID;
    v_qty := (v_item ->> 'quantity')::INTEGER;
    UPDATE public.inventory_records SET quantity_reserved = quantity_reserved + v_qty, last_updated = pg_catalog.now()
     WHERE branch_id = v_branch.id AND product_id = v_product.id;
    INSERT INTO public.sales (tenant_id, code, branch_id, sales_rep_id, product_id, customer_id, order_id, quantity,
                              unit_price, sale_date, status, discount_amount, is_promo)
    VALUES (v_actor.tenant_id, 'SAL-' || gen_random_uuid()::TEXT, v_branch.id, v_actor.id, v_product.id, v_customer.id,
            v_order.id, v_qty, v_product.unit_price, app_private.today(v_actor.tenant_id), 'pending', 0, FALSE);
  END LOOP;

  v_count := pg_catalog.array_length(v_seen, 1);
  INSERT INTO public.notifications (tenant_id, recipient_id, type, entity_type, entity_id, message)
  SELECT v_actor.tenant_id, u.id, 'order_submitted', 'customer_order', v_order.id::TEXT,
         app_private.full_name(v_actor.id) || ' raised ' || v_order.code || ' for ' || v_customer.name || ' · '
         || v_count || ' item' || CASE WHEN v_count > 1 THEN 's' ELSE '' END || ' to fulfil'
    FROM public.users u
   WHERE u.tenant_id = v_actor.tenant_id AND u.branch_id = v_branch.id AND u.role = 'storekeeper' AND u.status = 'active';

  PERFORM app_private.audit(v_actor, 'Order raised',
    v_order.code || ' · ' || v_customer.name || ' · ' || v_count || ' item' || CASE WHEN v_count > 1 THEN 's' ELSE '' END,
    'order', v_order.id::TEXT, pg_catalog.jsonb_build_object('branchId', v_branch.id, 'customerId', v_customer.id,
      'salesRepId', v_actor.id, 'orderId', v_order.id));
  PERFORM app_private.remember(p_idempotency_key, 'place_customer_order', pg_catalog.to_jsonb(v_order));
  RETURN v_order;
END;
$$;

-- The storekeeper of the order's branch releases every line at once.
CREATE OR REPLACE FUNCTION public.fulfil_customer_order(p_order_id UUID)
RETURNS public.customer_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
DECLARE
  v_actor public.users := app_private.actor();
  v_order public.customer_orders;
  v_line public.sales;
  v_today DATE := app_private.today(v_actor.tenant_id);
BEGIN
  SELECT * INTO v_order FROM public.customer_orders WHERE id = p_order_id AND tenant_id = v_actor.tenant_id FOR UPDATE;
  IF NOT FOUND THEN PERFORM app_private.fail('Order not found'); END IF;
  IF v_actor.role <> 'storekeeper' OR v_actor.branch_id IS DISTINCT FROM v_order.branch_id THEN
    PERFORM app_private.deny('Only the storekeeper of this branch can fulfil the order');
  END IF;
  IF v_order.status <> 'pending' THEN
    PERFORM app_private.fail(CASE v_order.status WHEN 'cancelled' THEN v_order.code || ' was cancelled'
                                                 ELSE v_order.code || ' was already fulfilled' END);
  END IF;

  PERFORM pg_catalog.set_config('app.fulfilling_order', v_order.id::TEXT, TRUE);
  FOR v_line IN
    SELECT * FROM public.sales WHERE order_id = v_order.id AND status = 'pending' ORDER BY product_id FOR UPDATE
  LOOP
    -- Release the reservation, then the trigger deducts the units once.
    UPDATE public.inventory_records SET quantity_reserved = quantity_reserved - v_line.quantity
     WHERE branch_id = v_line.branch_id AND product_id = v_line.product_id;
    UPDATE public.sales SET status = 'completed', sale_date = v_today, updated_at = pg_catalog.now() WHERE id = v_line.id;
  END LOOP;
  PERFORM pg_catalog.set_config('app.fulfilling_order', '', TRUE);

  UPDATE public.customer_orders
     SET status = 'fulfilled', fulfilled_at = pg_catalog.now(), fulfilled_by = v_actor.id, updated_at = pg_catalog.now()
   WHERE id = v_order.id RETURNING * INTO v_order;
  PERFORM app_private.notify(v_order.tenant_id, v_order.rep_id, 'order_fulfilled', 'customer_order', v_order.id::TEXT,
    v_order.code || ' for ' || (SELECT name FROM public.customers WHERE id = v_order.customer_id)
      || ' is fulfilled. Confirm once you have it.');
  PERFORM app_private.audit(v_actor, 'Order fulfilled',
    v_order.code || ' · ' || (SELECT name FROM public.customers WHERE id = v_order.customer_id) || ' · for '
      || app_private.full_name(v_order.rep_id),
    'order', v_order.id::TEXT, pg_catalog.jsonb_build_object('branchId', v_order.branch_id, 'customerId', v_order.customer_id,
      'salesRepId', v_order.rep_id, 'orderId', v_order.id));
  RETURN v_order;
END;
$$;

CREATE OR REPLACE FUNCTION public.acknowledge_customer_order(p_order_id UUID)
RETURNS public.customer_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
DECLARE
  v_actor public.users := app_private.actor();
  v_order public.customer_orders;
BEGIN
  SELECT * INTO v_order FROM public.customer_orders WHERE id = p_order_id AND tenant_id = v_actor.tenant_id FOR UPDATE;
  IF NOT FOUND THEN PERFORM app_private.fail('Order not found'); END IF;
  IF v_actor.role <> 'sales_rep' OR v_order.rep_id <> v_actor.id THEN
    PERFORM app_private.deny('Only the sales rep who raised the order can acknowledge it');
  END IF;
  IF v_order.status = 'acknowledged' THEN PERFORM app_private.fail(v_order.code || ' was already acknowledged'); END IF;
  IF v_order.status <> 'fulfilled' THEN PERFORM app_private.fail('You can acknowledge an order once the storekeeper fulfils it'); END IF;
  UPDATE public.customer_orders
     SET status = 'acknowledged', acknowledged_at = pg_catalog.now(), acknowledged_by = v_actor.id, updated_at = pg_catalog.now()
   WHERE id = v_order.id RETURNING * INTO v_order;
  PERFORM app_private.audit(v_actor, 'Order acknowledged',
    v_order.code || ' · ' || (SELECT name FROM public.customers WHERE id = v_order.customer_id),
    'order', v_order.id::TEXT, pg_catalog.jsonb_build_object('branchId', v_order.branch_id, 'customerId', v_order.customer_id,
      'salesRepId', v_order.rep_id, 'orderId', v_order.id));
  RETURN v_order;
END;
$$;

-- Before fulfilment, the rep who raised it or the Owner can cancel; the units go back.
CREATE OR REPLACE FUNCTION public.cancel_customer_order(p_order_id UUID, p_reason TEXT)
RETURNS public.customer_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
DECLARE
  v_actor public.users := app_private.actor();
  v_order public.customer_orders;
  v_line public.sales;
BEGIN
  SELECT * INTO v_order FROM public.customer_orders WHERE id = p_order_id AND tenant_id = v_actor.tenant_id FOR UPDATE;
  IF NOT FOUND THEN PERFORM app_private.fail('Order not found'); END IF;
  IF NOT (v_actor.role = 'owner' OR (v_actor.role = 'sales_rep' AND v_order.rep_id = v_actor.id)) THEN
    PERFORM app_private.deny('Only the sales rep who raised the order or the Owner can cancel it');
  END IF;
  IF v_order.status <> 'pending' THEN PERFORM app_private.fail('Only an order waiting to be fulfilled can be cancelled'); END IF;
  IF TRIM(COALESCE(p_reason, '')) = '' THEN PERFORM app_private.fail('Say why the order is cancelled', 'reason'); END IF;

  FOR v_line IN
    SELECT * FROM public.sales WHERE order_id = v_order.id AND status = 'pending' ORDER BY product_id FOR UPDATE
  LOOP
    UPDATE public.inventory_records SET quantity_reserved = quantity_reserved - v_line.quantity, last_updated = pg_catalog.now()
     WHERE branch_id = v_line.branch_id AND product_id = v_line.product_id;
    UPDATE public.sales SET status = 'voided', updated_at = pg_catalog.now() WHERE id = v_line.id;
  END LOOP;

  UPDATE public.customer_orders
     SET status = 'cancelled', cancelled_at = pg_catalog.now(), cancelled_by = v_actor.id, cancel_reason = TRIM(p_reason),
         updated_at = pg_catalog.now()
   WHERE id = v_order.id RETURNING * INTO v_order;

  INSERT INTO public.notifications (tenant_id, recipient_id, type, entity_type, entity_id, message)
  SELECT v_order.tenant_id, u.id, 'order_cancelled', 'customer_order', v_order.id::TEXT,
         v_order.code || ' was cancelled: ' || v_order.cancel_reason
    FROM public.users u
   WHERE u.tenant_id = v_order.tenant_id AND u.status = 'active' AND u.id <> v_actor.id
     AND ((u.role = 'storekeeper' AND u.branch_id = v_order.branch_id) OR u.id = v_order.rep_id);
  PERFORM app_private.audit(v_actor, 'Order cancelled', v_order.code || ' · ' || v_order.cancel_reason,
    'order', v_order.id::TEXT, pg_catalog.jsonb_build_object('branchId', v_order.branch_id, 'customerId', v_order.customer_id,
      'salesRepId', v_order.rep_id, 'orderId', v_order.id));
  RETURN v_order;
END;
$$;

-- Orders with their lines, for everyone who can read the order. The storekeeper
-- can't read sales, so the lines come from here (product and quantity, plus price).
CREATE OR REPLACE FUNCTION public.get_customer_orders()
RETURNS TABLE (
  id UUID, code TEXT, branch_id UUID, customer_id UUID, customer_name TEXT, rep_id UUID, status TEXT, note TEXT,
  created_at TIMESTAMPTZ, fulfilled_at TIMESTAMPTZ, fulfilled_by UUID, acknowledged_at TIMESTAMPTZ, acknowledged_by UUID,
  cancelled_at TIMESTAMPTZ, cancelled_by UUID, cancel_reason TEXT, lines JSONB
)
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
  SELECT o.id, o.code, o.branch_id, o.customer_id, c.name, o.rep_id, o.status, o.note, o.created_at, o.fulfilled_at,
         o.fulfilled_by, o.acknowledged_at, o.acknowledged_by, o.cancelled_at, o.cancelled_by, o.cancel_reason,
         COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
                    'sale_id', s.id, 'product_id', s.product_id, 'quantity', s.quantity, 'unit_price', s.unit_price,
                    'line_total', s.line_total, 'is_promo', s.is_promo, 'status', s.status) ORDER BY s.created_at)
                     FROM public.sales s WHERE s.order_id = o.id AND s.exchange_id IS NULL), '[]'::JSONB)
    FROM public.customer_orders o
    JOIN public.customers c ON c.id = o.customer_id
   WHERE o.tenant_id = v_actor.tenant_id
     AND (v_actor.role = 'owner'
       OR (v_actor.role IN ('storekeeper', 'manager') AND o.branch_id = v_actor.branch_id)
       OR (v_actor.role = 'sales_rep' AND o.rep_id = v_actor.id))
   ORDER BY o.created_at DESC
   LIMIT 1000;
END;
$$;

-- ----------------------------------------------------------------------------
-- 5. Walk-in sales: the Owner or a branch manager
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_sale(
  p_branch_id UUID,
  p_sale_date DATE,
  p_customer_id UUID,
  p_walk_in_name TEXT,
  p_walk_in_phone TEXT,
  p_items JSONB,
  p_idempotency_key UUID DEFAULT NULL
)
RETURNS SETOF public.sales
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
DECLARE
  v_actor public.users := app_private.actor();
  v_prior JSONB := app_private.replay(p_idempotency_key, 'record_sale');
  v_branch public.branches;
  v_order UUID := gen_random_uuid();
  v_item JSONB;
  v_product public.products;
  v_is_promo BOOLEAN;
  v_qty INTEGER;
  v_gross NUMERIC;
  v_type TEXT;
  v_value NUMERIC;
  v_amount NUMERIC;
  v_paid_lines INTEGER := 0;
  v_row public.sales;
  v_rows JSONB := '[]'::JSONB;
BEGIN
  IF v_prior IS NOT NULL THEN
    RETURN QUERY SELECT * FROM pg_catalog.jsonb_populate_recordset(NULL::public.sales, v_prior);
    RETURN;
  END IF;
  IF v_actor.role = 'sales_rep' THEN
    PERFORM app_private.deny('Raise an order from the customer''s order book. Walk-in sales are recorded by the Owner or a manager.');
  END IF;
  IF v_actor.role NOT IN ('owner', 'manager') THEN PERFORM app_private.deny('You cannot record sales'); END IF;

  SELECT * INTO v_branch FROM public.branches WHERE id = p_branch_id AND tenant_id = v_actor.tenant_id;
  IF NOT FOUND OR v_branch.status <> 'active' THEN PERFORM app_private.fail('Choose an active branch', 'branchId'); END IF;
  IF v_actor.role = 'manager' AND v_branch.id IS DISTINCT FROM v_actor.branch_id THEN
    PERFORM app_private.fail('You can only record sales for your own branch', 'branchId');
  END IF;
  IF p_sale_date IS NULL OR p_sale_date > app_private.today(v_actor.tenant_id) THEN
    PERFORM app_private.fail('Enter a valid sale date (not in the future)', 'saleDate');
  END IF;
  IF p_customer_id IS NOT NULL THEN
    PERFORM app_private.fail('Customer orders are raised by the customer''s sales rep from their order book', 'customerId');
  END IF;
  IF TRIM(COALESCE(p_walk_in_name, '')) = '' THEN
    PERFORM app_private.fail('Enter the walk-in customer''s name', 'walkInName');
  END IF;
  IF p_items IS NULL OR pg_catalog.jsonb_typeof(p_items) <> 'array' OR pg_catalog.jsonb_array_length(p_items) = 0 THEN
    PERFORM app_private.fail('Add at least one product', 'items');
  END IF;

  FOR v_item IN SELECT * FROM pg_catalog.jsonb_array_elements(p_items) LOOP
    SELECT * INTO v_product FROM public.products
     WHERE id = NULLIF(v_item ->> 'product_id', '')::UUID AND tenant_id = v_actor.tenant_id;
    IF NOT FOUND THEN PERFORM app_private.fail('Select a product for every item', 'items'); END IF;
    IF v_product.status <> 'active' THEN PERFORM app_private.fail(v_product.name || ' is inactive', 'items'); END IF;

    v_is_promo := COALESCE((v_item ->> 'is_promo')::BOOLEAN, FALSE);
    IF v_is_promo <> (v_product.product_type = 'promo') THEN
      PERFORM app_private.fail(CASE WHEN v_is_promo
        THEN v_product.name || ' is not a promo item'
        ELSE v_product.name || ' is a promo item: add it as a promo item' END, 'items');
    END IF;

    v_qty := (v_item ->> 'quantity')::INTEGER;
    IF v_qty IS NULL OR v_qty <= 0 OR (v_item ->> 'quantity')::NUMERIC <> v_qty THEN
      PERFORM app_private.fail('Enter a whole quantity above zero for ' || v_product.name, 'items');
    END IF;

    v_gross := v_qty * v_product.unit_price;
    v_type := NULLIF(v_item ->> 'discount_type', '');
    v_value := NULLIF(v_item ->> 'discount_value', '')::NUMERIC;
    IF v_value < 0 THEN PERFORM app_private.fail('A discount cannot be negative', 'items'); END IF;
    IF v_value IS NULL OR v_value = 0 THEN
      v_type := NULL;
      v_value := NULL;
    END IF;
    v_amount := 0;
    IF v_value IS NOT NULL THEN
      IF v_is_promo THEN PERFORM app_private.fail('Promo items are already free: remove the discount', 'items'); END IF;
      IF v_type = 'percent' THEN
        IF v_value > 100 THEN PERFORM app_private.fail('A discount cannot be more than 100%', 'items'); END IF;
        v_amount := ROUND(v_gross * v_value / 100, 2);
      ELSIF v_type = 'amount' THEN
        v_amount := ROUND(v_value, 2);
        IF v_amount > v_gross THEN PERFORM app_private.fail('The discount on ' || v_product.name || ' is more than the line total', 'items'); END IF;
      ELSE
        PERFORM app_private.fail('Choose a percentage or an amount for the discount', 'items');
      END IF;
    END IF;
    IF NOT v_is_promo THEN v_paid_lines := v_paid_lines + 1; END IF;

    INSERT INTO public.sales (tenant_id, code, branch_id, sales_rep_id, product_id, customer_id, order_id, quantity, unit_price,
                              sale_date, walk_in_name, walk_in_phone, status, discount_type, discount_value, discount_amount, is_promo)
    VALUES (v_actor.tenant_id, 'SAL-' || gen_random_uuid()::TEXT, v_branch.id, v_actor.id, v_product.id, NULL, v_order,
            v_qty, v_product.unit_price, p_sale_date, TRIM(p_walk_in_name), NULLIF(TRIM(p_walk_in_phone), ''),
            'completed', v_type, v_value, v_amount, v_is_promo)
    RETURNING * INTO v_row;
    v_rows := v_rows || pg_catalog.to_jsonb(v_row);
  END LOOP;

  IF v_paid_lines = 0 THEN PERFORM app_private.fail('Promo items go out with a sale: add a product being sold', 'items'); END IF;

  PERFORM app_private.remember(p_idempotency_key, 'record_sale', v_rows);
  RETURN QUERY SELECT * FROM pg_catalog.jsonb_populate_recordset(NULL::public.sales, v_rows);
END;
$$;

-- A manager's own walk-in takings are part of what they remit (as in 20261023120000
-- otherwise). The rep payments are no longer required when the manager sold walk-ins.
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
  v_own NUMERIC;
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
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_actor.id::TEXT || p_period, 0));
  IF EXISTS (SELECT 1 FROM public.manager_remittances WHERE manager_id = v_actor.id AND period = p_period AND status = 'submitted') THEN
    PERFORM app_private.fail('A remittance for this period is already awaiting Owner review');
  END IF;

  SELECT COALESCE(pg_catalog.jsonb_agg(p.id), '[]'::JSONB) INTO v_payment_ids
    FROM public.payments p
   WHERE p.tenant_id = v_actor.tenant_id AND p.manager_id = v_actor.id AND p.branch_id = v_branch
     AND p.period = p_period AND p.status IN ('acknowledged', 'confirmed');
  v_own := app_private.rep_total_sales(v_actor.tenant_id, v_actor.id, p_period);
  IF pg_catalog.jsonb_array_length(v_payment_ids) = 0 AND v_own = 0 THEN
    PERFORM app_private.fail('There are no acknowledged Sales Rep payments or walk-in sales for this period');
  END IF;

  SELECT COALESCE(SUM(app_private.rep_total_sales(v_actor.tenant_id, rep_id, p_period)), 0) INTO v_walk_in
    FROM (SELECT DISTINCT p.sales_rep_id AS rep_id FROM public.payments p
           WHERE p.id IN (SELECT pg_catalog.jsonb_array_elements_text(v_payment_ids))) reps;
  SELECT COALESCE(SUM(c.amount), 0) INTO v_customer
    FROM public.customer_payments c
   WHERE c.tenant_id = v_actor.tenant_id AND c.manager_id = v_actor.id AND c.status = 'confirmed'
     AND pg_catalog.to_char(c.payment_date, 'YYYY-MM') = p_period;
  v_received := v_walk_in + v_own + v_customer;

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
      'transferAmount', p_transfer_amount, 'outstandingAmount', v_outstanding, 'managerWalkInSales', v_own));
  RETURN v_row;
END;
$$;

-- ----------------------------------------------------------------------------
-- 6. Stock requests retired (history kept)
-- ----------------------------------------------------------------------------
UPDATE public.stock_requests
   SET status = 'rejected', rejected_at = pg_catalog.now(),
       rejection_reason = 'Closed: stock requests were replaced by customer orders'
 WHERE status IN ('pending', 'approved');
-- A request issued in part keeps what was issued and is closed at that amount.
UPDATE public.stock_requests
   SET status = 'fulfilled', quantity_approved = quantity_fulfilled
 WHERE status = 'partially_fulfilled';

DROP FUNCTION IF EXISTS public.create_stock_requests(UUID, JSONB, TEXT, UUID);
DROP FUNCTION IF EXISTS public.approve_stock_request(TEXT);
DROP FUNCTION IF EXISTS public.reject_stock_request(TEXT, TEXT);
DROP FUNCTION IF EXISTS public.fulfil_stock_request(TEXT, INTEGER);
DROP FUNCTION IF EXISTS public.acknowledge_stock_request(TEXT);
DROP FUNCTION IF EXISTS app_private.reviewable_request(public.users, TEXT);
-- Reps keep read access to their own old requests, but can no longer write them.
DROP POLICY IF EXISTS stock_requests_rep_own ON public.stock_requests;
CREATE POLICY stock_requests_rep_own ON public.stock_requests AS PERMISSIVE FOR SELECT TO authenticated
  USING ((SELECT public.get_user_role()) = 'sales_rep' AND rep_id = (SELECT auth.uid()));

-- ----------------------------------------------------------------------------
-- 7. Business name
-- ----------------------------------------------------------------------------
UPDATE public.tenants SET name = 'Friscon Tech LTD', updated_at = pg_catalog.now()
 WHERE name ~* '^\s*friscon\s*tech' AND name <> 'Friscon Tech LTD';

-- ----------------------------------------------------------------------------
-- Grants
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.place_customer_order(UUID, JSONB, TEXT, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fulfil_customer_order(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.acknowledge_customer_order(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_customer_order(UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_customer_orders() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.place_customer_order(UUID, JSONB, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fulfil_customer_order(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.acknowledge_customer_order(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_customer_order(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_customer_orders() TO authenticated;

NOTIFY pgrst, 'reload schema';
