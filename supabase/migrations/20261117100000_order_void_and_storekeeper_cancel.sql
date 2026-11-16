-- Orders: the storekeeper can cancel, and the Owner can void a fulfilled order.
--
-- 1. cancel_customer_order: the branch storekeeper may now cancel an order that is
--    waiting (besides the rep who raised it and the Owner). The units go back.
-- 2. void_customer_order (Owner only): undoes an order raised by mistake after the
--    storekeeper fulfilled it. Every line becomes 'voided', so it leaves the
--    customer's ledger, the rep's target and revenue; the units go back on hand and
--    into their batches, written as 'order_void' stock movements. The order stays on
--    record as 'voided' with who, when and why. Refused when part of the order was
--    exchanged. Customer payments are untouched: anything paid stays as credit.

ALTER TABLE public.customer_orders DROP CONSTRAINT IF EXISTS customer_orders_status_check;
ALTER TABLE public.customer_orders ADD CONSTRAINT customer_orders_status_check
  CHECK (status IN ('pending', 'fulfilled', 'acknowledged', 'cancelled', 'voided'));
ALTER TABLE public.customer_orders DROP CONSTRAINT IF EXISTS customer_orders_status_logic;
ALTER TABLE public.customer_orders ADD CONSTRAINT customer_orders_status_logic CHECK (
  (status = 'pending' AND fulfilled_at IS NULL AND acknowledged_at IS NULL AND cancelled_at IS NULL)
  OR (status = 'fulfilled' AND fulfilled_at IS NOT NULL AND acknowledged_at IS NULL AND cancelled_at IS NULL)
  OR (status = 'acknowledged' AND fulfilled_at IS NOT NULL AND acknowledged_at IS NOT NULL AND cancelled_at IS NULL)
  OR (status = 'cancelled' AND cancelled_at IS NOT NULL AND fulfilled_at IS NULL)
  OR (status = 'voided' AND cancelled_at IS NOT NULL AND fulfilled_at IS NOT NULL));
COMMENT ON COLUMN public.customer_orders.cancelled_at IS 'When the order was cancelled (before fulfilment) or voided (after); cancelled_by and cancel_reason go with it';

ALTER TABLE public.inventory_movements DROP CONSTRAINT IF EXISTS inventory_movements_type_check;
ALTER TABLE public.inventory_movements ADD CONSTRAINT inventory_movements_type_check
  CHECK (type IN ('stock_added', 'stock_issued', 'sale', 'adjustment', 'promo', 'exchange_return', 'exchange_issue', 'order_void'));

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
    'order_submitted', 'order_fulfilled', 'order_cancelled', 'order_voided'
  ));

-- ----------------------------------------------------------------------------
-- 1. Cancel: the rep who raised it, the branch storekeeper, or the Owner
-- ----------------------------------------------------------------------------
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
  IF NOT (v_actor.role = 'owner'
          OR (v_actor.role = 'sales_rep' AND v_order.rep_id = v_actor.id)
          OR (v_actor.role = 'storekeeper' AND v_actor.branch_id = v_order.branch_id)) THEN
    PERFORM app_private.deny('Only the sales rep who raised the order, the branch storekeeper or the Owner can cancel it');
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
         v_order.code || ' was cancelled by ' || app_private.full_name(v_actor.id) || ': ' || v_order.cancel_reason
    FROM public.users u
   WHERE u.tenant_id = v_order.tenant_id AND u.status = 'active' AND u.id <> v_actor.id
     AND ((u.role = 'storekeeper' AND u.branch_id = v_order.branch_id) OR u.id = v_order.rep_id);
  PERFORM app_private.audit(v_actor, 'Order cancelled', v_order.code || ' · ' || v_order.cancel_reason,
    'order', v_order.id::TEXT, pg_catalog.jsonb_build_object('branchId', v_order.branch_id, 'customerId', v_order.customer_id,
      'salesRepId', v_order.rep_id, 'orderId', v_order.id));
  RETURN v_order;
END;
$$;

-- ----------------------------------------------------------------------------
-- 2. Void a fulfilled order (Owner)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.void_customer_order(p_order_id UUID, p_reason TEXT)
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
  v_lot RECORD;
  v_left INTEGER;
  v_add INTEGER;
  v_back INTEGER;
  v_total NUMERIC := 0;
  v_customer TEXT;
BEGIN
  IF v_actor.role <> 'owner' THEN PERFORM app_private.deny('Only the Owner can void a fulfilled order'); END IF;
  SELECT * INTO v_order FROM public.customer_orders WHERE id = p_order_id AND tenant_id = v_actor.tenant_id FOR UPDATE;
  IF NOT FOUND THEN PERFORM app_private.fail('Order not found'); END IF;
  IF v_order.status = 'voided' THEN PERFORM app_private.fail(v_order.code || ' was already voided'); END IF;
  IF v_order.status NOT IN ('fulfilled', 'acknowledged') THEN
    PERFORM app_private.fail('Only a fulfilled order can be voided. Cancel an order that is still waiting.');
  END IF;
  IF TRIM(COALESCE(p_reason, '')) = '' THEN PERFORM app_private.fail('Say why the order is voided', 'reason'); END IF;
  IF EXISTS (SELECT 1 FROM public.sales s WHERE s.order_id = v_order.id AND s.quantity_returned > 0)
     OR EXISTS (SELECT 1 FROM public.stock_exchanges e JOIN public.sales s ON s.id = e.sale_id
                 WHERE s.order_id = v_order.id AND e.status <> 'rejected') THEN
    PERFORM app_private.fail('Part of ' || v_order.code || ' was exchanged, so it can''t be voided');
  END IF;

  FOR v_line IN
    SELECT * FROM public.sales WHERE order_id = v_order.id AND status = 'completed' AND exchange_id IS NULL
     ORDER BY product_id FOR UPDATE
  LOOP
    v_total := v_total + v_line.line_total;
    v_back := v_line.quantity - v_line.quantity_returned;
    IF v_back > 0 THEN
      PERFORM app_private.apply_stock(v_line.tenant_id, v_line.branch_id, v_line.product_id, v_back,
        'order_void', 'sale', v_line.id::TEXT, v_actor.id, 'Order ' || v_order.code || ' voided: ' || TRIM(p_reason));
      -- Back into the batches the units most likely came from (soonest expiry first).
      v_left := v_back;
      FOR v_lot IN
        SELECT id, quantity_received - quantity_remaining AS room FROM public.stock_batches
         WHERE branch_id = v_line.branch_id AND product_id = v_line.product_id AND quantity_remaining < quantity_received
         ORDER BY expiry_date
         FOR UPDATE
      LOOP
        EXIT WHEN v_left <= 0;
        v_add := LEAST(v_lot.room, v_left);
        UPDATE public.stock_batches SET quantity_remaining = quantity_remaining + v_add WHERE id = v_lot.id;
        v_left := v_left - v_add;
      END LOOP;
    END IF;
    UPDATE public.sales SET status = 'voided', updated_at = pg_catalog.now() WHERE id = v_line.id;
  END LOOP;

  UPDATE public.customer_orders
     SET status = 'voided', cancelled_at = pg_catalog.now(), cancelled_by = v_actor.id, cancel_reason = TRIM(p_reason),
         updated_at = pg_catalog.now()
   WHERE id = v_order.id RETURNING * INTO v_order;

  SELECT name INTO v_customer FROM public.customers WHERE id = v_order.customer_id;
  INSERT INTO public.notifications (tenant_id, recipient_id, type, entity_type, entity_id, message)
  SELECT v_order.tenant_id, u.id, 'order_voided', 'customer_order', v_order.id::TEXT,
         v_order.code || ' for ' || v_customer || ' was voided by the Owner: ' || v_order.cancel_reason
           || '. The items are back in stock.'
    FROM public.users u
   WHERE u.tenant_id = v_order.tenant_id AND u.status = 'active'
     AND ((u.role = 'storekeeper' AND u.branch_id = v_order.branch_id) OR u.id = v_order.rep_id);
  PERFORM app_private.audit(v_actor, 'Order voided',
    v_order.code || ' · ' || v_customer || ' · ₦' || pg_catalog.to_char(v_total, 'FM999,999,999,990.00') || ' · ' || v_order.cancel_reason,
    'order', v_order.id::TEXT, pg_catalog.jsonb_build_object('branchId', v_order.branch_id, 'customerId', v_order.customer_id,
      'salesRepId', v_order.rep_id, 'orderId', v_order.id, 'amount', v_total));
  RETURN v_order;
END;
$$;

REVOKE ALL ON FUNCTION public.void_customer_order(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.void_customer_order(UUID, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
