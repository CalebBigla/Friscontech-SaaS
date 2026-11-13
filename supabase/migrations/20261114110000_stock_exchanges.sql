-- Stock exchanges: a customer returns part of a sale for another product.
--
-- Same pattern as stock requests:
--   request_exchange      rep, for one of their customers' sales
--   approve_exchange      storekeeper of the rep's branch, after checking the
--   reject_exchange         replacement is in stock (or rejects with a reason)
--   fulfil_exchange       storekeeper: returned units go back into branch stock,
--                         the replacement leaves branch stock as a new sale line
--   acknowledge_exchange  rep confirms the customer has the replacement
--
-- The customer's ledger follows on its own: the returned units come off the
-- original line (sales.quantity_returned, so line_total drops) and the replacement
-- is a new line for the same customer. A cheaper replacement leaves them in credit,
-- a dearer one adds to what they owe, an equal one leaves the balance unchanged.
-- Revenue and targets use line_total too, so they follow the same way.

-- ----------------------------------------------------------------------------
-- Returned units on a sale line
-- ----------------------------------------------------------------------------
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS quantity_returned INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.sales DROP CONSTRAINT IF EXISTS sales_returned_within_quantity;
ALTER TABLE public.sales ADD CONSTRAINT sales_returned_within_quantity CHECK (quantity_returned >= 0 AND quantity_returned <= quantity);
COMMENT ON COLUMN public.sales.quantity_returned IS 'Units of this line the customer returned in an exchange; they no longer count';

-- line_total counts only the units kept; the discount shrinks in proportion.
ALTER TABLE public.sales DROP COLUMN IF EXISTS line_total;
ALTER TABLE public.sales ADD COLUMN line_total NUMERIC(14,2) GENERATED ALWAYS AS (
  ROUND((quantity - quantity_returned) * unit_price - discount_amount * (quantity - quantity_returned)::NUMERIC / quantity, 2)
) STORED;
COMMENT ON COLUMN public.sales.line_total IS 'Units kept (quantity - quantity_returned) x unit_price, less their share of the discount: what counts as revenue';

-- ----------------------------------------------------------------------------
-- Exchanges
-- ----------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS app_private.stock_exchange_seq;

CREATE TABLE IF NOT EXISTS public.stock_exchanges (
  id TEXT PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES public.branches(id),
  customer_id UUID NOT NULL REFERENCES public.customers(id),
  rep_id UUID NOT NULL REFERENCES public.users(id),
  sale_id UUID NOT NULL REFERENCES public.sales(id),
  -- Storekeepers can't read sales, so the returned product is kept here as well.
  returned_product_id UUID NOT NULL REFERENCES public.products(id),
  return_quantity INTEGER NOT NULL CHECK (return_quantity > 0),
  replacement_product_id UUID NOT NULL REFERENCES public.products(id),
  replacement_quantity INTEGER NOT NULL CHECK (replacement_quantity > 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'fulfilled')),
  reason TEXT NOT NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_by UUID REFERENCES public.users(id),
  approved_at TIMESTAMPTZ,
  rejected_by UUID REFERENCES public.users(id),
  rejected_at TIMESTAMPTZ,
  rejection_reason TEXT,
  fulfilled_by UUID REFERENCES public.users(id),
  fulfilled_at TIMESTAMPTZ,
  acknowledged_at TIMESTAMPTZ,
  -- Fixed when fulfilled: what the returned units and the replacement were worth.
  returned_value NUMERIC(14,2),
  replacement_value NUMERIC(14,2),
  replacement_sale_id UUID REFERENCES public.sales(id)
);
CREATE INDEX IF NOT EXISTS idx_exchanges_tenant_requested ON public.stock_exchanges (tenant_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_exchanges_branch_status ON public.stock_exchanges (branch_id, status);
CREATE INDEX IF NOT EXISTS idx_exchanges_rep ON public.stock_exchanges (rep_id);
CREATE INDEX IF NOT EXISTS idx_exchanges_sale ON public.stock_exchanges (sale_id);
COMMENT ON TABLE public.stock_exchanges IS 'Customer exchanges: requested by the rep, approved and fulfilled by the branch storekeeper, acknowledged by the rep';

ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS exchange_id TEXT REFERENCES public.stock_exchanges(id);
COMMENT ON COLUMN public.sales.exchange_id IS 'Set on the replacement line an exchange created';

-- Only the RPCs write these; a direct insert can't claim to be an exchange line
-- or mark units returned.
REVOKE INSERT ON public.sales FROM authenticated;
DO $$
DECLARE
  v_cols TEXT;
BEGIN
  SELECT pg_catalog.string_agg(pg_catalog.quote_ident(attname), ', ' ORDER BY attnum) INTO v_cols
    FROM pg_catalog.pg_attribute
   WHERE attrelid = 'public.sales'::regclass AND attnum > 0 AND NOT attisdropped
     AND attname NOT IN ('exchange_id', 'quantity_returned', 'line_total');
  EXECUTE pg_catalog.format('GRANT INSERT (%s) ON public.sales TO authenticated', v_cols);
END;
$$;

ALTER TABLE public.stock_exchanges ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.stock_exchanges FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.stock_exchanges TO authenticated;
DROP POLICY IF EXISTS stock_exchanges_read ON public.stock_exchanges;
CREATE POLICY stock_exchanges_read ON public.stock_exchanges AS PERMISSIVE FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.get_user_tenant_id())
         AND ((SELECT public.get_user_role()) = 'owner'
              OR ((SELECT public.get_user_role()) IN ('storekeeper', 'manager') AND branch_id = (SELECT public.get_user_branch_id()))
              OR rep_id = (SELECT auth.uid())));

-- Movements, notifications and audit entries for exchanges.
ALTER TABLE public.inventory_movements DROP CONSTRAINT IF EXISTS inventory_movements_type_check;
ALTER TABLE public.inventory_movements ADD CONSTRAINT inventory_movements_type_check
  CHECK (type IN ('stock_added', 'stock_issued', 'sale', 'adjustment', 'promo', 'exchange_return', 'exchange_issue'));

ALTER TABLE public.inventory_movements DROP CONSTRAINT IF EXISTS inventory_movements_reference_type_check;
ALTER TABLE public.inventory_movements ADD CONSTRAINT inventory_movements_reference_type_check
  CHECK (reference_type IN ('stock_request', 'sale', 'manual', 'exchange'));

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
    'exchange_requested', 'exchange_approved', 'exchange_rejected', 'exchange_fulfilled'
  ));
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_entity_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_entity_type_check
  CHECK (entity_type IN ('payment', 'customer_payment', 'onboarding', 'stock_request', 'approval_request', 'report_request', 'stock_exchange'));

ALTER TABLE public.activities DROP CONSTRAINT IF EXISTS activities_entity_check;
ALTER TABLE public.activities ADD CONSTRAINT activities_entity_check
  CHECK (entity IN ('product', 'sale', 'payment', 'expense', 'remittance', 'stock_request', 'target',
                    'team_member', 'branch', 'inventory', 'settings', 'session', 'customer', 'report', 'exchange'));

-- ----------------------------------------------------------------------------
-- Sale stock trigger: an exchange's replacement line comes from branch stock and
-- is written by the branch storekeeper inside fulfil_exchange. Everything else is
-- as in 20261102120000.
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
-- Helpers
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_private.exchange_label(p_ex public.stock_exchanges)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT p_ex.id || ' · ' || (SELECT name FROM public.customers WHERE id = p_ex.customer_id)
         || ' · ' || p_ex.return_quantity || ' × ' || (SELECT name FROM public.products WHERE id = p_ex.returned_product_id)
         || ' for ' || p_ex.replacement_quantity || ' × ' || (SELECT name FROM public.products WHERE id = p_ex.replacement_product_id)
$$;

CREATE OR REPLACE FUNCTION app_private.notify_exchange(p_ex public.stock_exchanges, p_type TEXT, p_recipients UUID[], p_message TEXT)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  INSERT INTO public.notifications (tenant_id, recipient_id, type, entity_type, entity_id, message)
  SELECT p_ex.tenant_id, r, p_type, 'stock_exchange', p_ex.id, p_message FROM pg_catalog.unnest(p_recipients) r
$$;

-- The storekeeper acting on an exchange must work at its branch.
CREATE OR REPLACE FUNCTION app_private.exchange_for_storekeeper(p_actor public.users, p_id TEXT)
RETURNS public.stock_exchanges
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
DECLARE
  v_ex public.stock_exchanges;
BEGIN
  IF p_actor.role <> 'storekeeper' THEN PERFORM app_private.deny('Only the branch storekeeper handles exchanges'); END IF;
  SELECT * INTO v_ex FROM public.stock_exchanges WHERE id = p_id AND tenant_id = p_actor.tenant_id FOR UPDATE;
  IF NOT FOUND THEN PERFORM app_private.fail('Exchange not found', 'form'); END IF;
  IF v_ex.branch_id IS DISTINCT FROM p_actor.branch_id THEN PERFORM app_private.deny('This exchange belongs to another branch'); END IF;
  RETURN v_ex;
END;
$$;

-- ----------------------------------------------------------------------------
-- Rep: request
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.request_exchange(
  p_sale_id UUID, p_return_quantity INTEGER, p_replacement_product_id UUID, p_replacement_quantity INTEGER, p_reason TEXT
)
RETURNS public.stock_exchanges
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
DECLARE
  v_actor public.users := app_private.actor();
  v_sale public.sales;
  v_customer public.customers;
  v_product public.products;
  v_open INTEGER;
  v_left INTEGER;
  v_row public.stock_exchanges;
BEGIN
  IF v_actor.role <> 'sales_rep' THEN PERFORM app_private.deny('Only a sales rep requests an exchange for their customer'); END IF;
  IF v_actor.branch_id IS NULL THEN PERFORM app_private.fail('You are not assigned to a branch', 'form'); END IF;
  SELECT * INTO v_sale FROM public.sales WHERE id = p_sale_id AND tenant_id = v_actor.tenant_id;
  IF NOT FOUND THEN PERFORM app_private.fail('Choose the sale being exchanged', 'saleId'); END IF;
  IF v_sale.customer_id IS NULL THEN PERFORM app_private.fail('Only a sale to a registered customer can be exchanged', 'saleId'); END IF;
  SELECT * INTO v_customer FROM public.customers WHERE id = v_sale.customer_id;
  IF v_customer.assigned_rep_id IS DISTINCT FROM v_actor.id THEN PERFORM app_private.fail('Choose a sale to one of your customers', 'saleId'); END IF;
  IF v_sale.status <> 'completed' OR v_sale.is_promo THEN PERFORM app_private.fail('Only a completed sale of a product can be exchanged', 'saleId'); END IF;

  v_open := COALESCE((SELECT SUM(return_quantity) FROM public.stock_exchanges
                       WHERE sale_id = v_sale.id AND status IN ('pending', 'approved')), 0);
  v_left := v_sale.quantity - v_sale.quantity_returned - v_open;
  IF p_return_quantity IS NULL OR p_return_quantity <= 0 THEN PERFORM app_private.fail('Enter how many units the customer is returning', 'returnQuantity'); END IF;
  IF p_return_quantity > v_left THEN
    PERFORM app_private.fail(CASE WHEN v_left <= 0 THEN 'Every unit of this sale is already returned or in an open exchange'
                                  ELSE 'At most ' || v_left || ' unit' || CASE WHEN v_left = 1 THEN '' ELSE 's' END || ' of this sale can be returned' END, 'returnQuantity');
  END IF;

  SELECT * INTO v_product FROM public.products WHERE id = p_replacement_product_id AND tenant_id = v_actor.tenant_id;
  IF NOT FOUND OR v_product.status <> 'active' THEN PERFORM app_private.fail('Choose an active product as the replacement', 'replacementProductId'); END IF;
  IF v_product.product_type = 'promo' THEN PERFORM app_private.fail('A promo item can not be a replacement', 'replacementProductId'); END IF;
  IF p_replacement_quantity IS NULL OR p_replacement_quantity <= 0 THEN PERFORM app_private.fail('Enter how many units the customer takes instead', 'replacementQuantity'); END IF;
  IF LENGTH(TRIM(COALESCE(p_reason, ''))) < 3 THEN PERFORM app_private.fail('Say why the customer is exchanging', 'reason'); END IF;

  INSERT INTO public.stock_exchanges (id, tenant_id, branch_id, customer_id, rep_id, sale_id, returned_product_id, return_quantity,
                                      replacement_product_id, replacement_quantity, reason)
  VALUES (app_private.next_id('EX', 'app_private.stock_exchange_seq', 'public.stock_exchanges'), v_actor.tenant_id, v_actor.branch_id,
          v_customer.id, v_actor.id, v_sale.id, v_sale.product_id, p_return_quantity, v_product.id, p_replacement_quantity, TRIM(p_reason))
  RETURNING * INTO v_row;

  PERFORM app_private.notify_exchange(v_row, 'exchange_requested',
    ARRAY(SELECT id FROM public.users WHERE tenant_id = v_actor.tenant_id AND branch_id = v_row.branch_id AND role = 'storekeeper' AND status = 'active'),
    app_private.full_name(v_actor.id) || ' requested exchange ' || app_private.exchange_label(v_row));
  PERFORM app_private.audit(v_actor, 'Exchange requested', app_private.exchange_label(v_row), 'exchange', v_row.id,
    pg_catalog.jsonb_build_object('branchId', v_row.branch_id, 'saleId', v_row.sale_id));
  RETURN v_row;
END;
$$;

-- ----------------------------------------------------------------------------
-- Storekeeper: approve (replacement in stock) or reject
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_exchange(p_exchange_id TEXT)
RETURNS public.stock_exchanges
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
DECLARE
  v_actor public.users := app_private.actor();
  v_ex public.stock_exchanges := app_private.exchange_for_storekeeper(v_actor, p_exchange_id);
  v_on_hand INTEGER;
BEGIN
  IF v_ex.status <> 'pending' THEN PERFORM app_private.fail('Only a pending exchange can be approved', 'form'); END IF;
  v_on_hand := COALESCE((SELECT quantity_on_hand - quantity_reserved FROM public.inventory_records
                          WHERE branch_id = v_ex.branch_id AND product_id = v_ex.replacement_product_id), 0);
  IF v_on_hand < v_ex.replacement_quantity THEN
    PERFORM app_private.fail('Only ' || v_on_hand || ' of the replacement in stock; ' || v_ex.replacement_quantity || ' needed', 'quantity');
  END IF;
  UPDATE public.stock_exchanges SET status = 'approved', approved_by = v_actor.id, approved_at = pg_catalog.now()
   WHERE id = v_ex.id RETURNING * INTO v_ex;
  PERFORM app_private.notify_exchange(v_ex, 'exchange_approved', ARRAY[v_ex.rep_id],
    'Exchange ' || v_ex.id || ' approved: the replacement is in stock and being prepared');
  PERFORM app_private.audit(v_actor, 'Exchange approved', app_private.exchange_label(v_ex), 'exchange', v_ex.id,
    pg_catalog.jsonb_build_object('branchId', v_ex.branch_id));
  RETURN v_ex;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_exchange(p_exchange_id TEXT, p_reason TEXT)
RETURNS public.stock_exchanges
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
DECLARE
  v_actor public.users := app_private.actor();
  v_ex public.stock_exchanges := app_private.exchange_for_storekeeper(v_actor, p_exchange_id);
BEGIN
  IF v_ex.status NOT IN ('pending', 'approved') THEN PERFORM app_private.fail('This exchange can no longer be rejected', 'form'); END IF;
  IF LENGTH(TRIM(COALESCE(p_reason, ''))) < 3 THEN PERFORM app_private.fail('Give the rep a reason', 'reason'); END IF;
  UPDATE public.stock_exchanges
     SET status = 'rejected', rejected_by = v_actor.id, rejected_at = pg_catalog.now(), rejection_reason = TRIM(p_reason)
   WHERE id = v_ex.id RETURNING * INTO v_ex;
  PERFORM app_private.notify_exchange(v_ex, 'exchange_rejected', ARRAY[v_ex.rep_id],
    'Exchange ' || v_ex.id || ' rejected: ' || TRIM(p_reason));
  PERFORM app_private.audit(v_actor, 'Exchange rejected', app_private.exchange_label(v_ex) || ' · ' || TRIM(p_reason), 'exchange', v_ex.id,
    pg_catalog.jsonb_build_object('branchId', v_ex.branch_id));
  RETURN v_ex;
END;
$$;

-- ----------------------------------------------------------------------------
-- Storekeeper: fulfil. Returned units back into stock, replacement out, ledger
-- moves by the difference. All or nothing.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fulfil_exchange(p_exchange_id TEXT)
RETURNS public.stock_exchanges
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
DECLARE
  v_actor public.users := app_private.actor();
  v_ex public.stock_exchanges := app_private.exchange_for_storekeeper(v_actor, p_exchange_id);
  v_sale public.sales;
  v_product public.products;
  v_lot RECORD;
  v_returned NUMERIC;
  v_new public.sales;
BEGIN
  IF v_ex.status <> 'approved' THEN PERFORM app_private.fail('Approve the exchange before fulfilling it', 'form'); END IF;
  SELECT * INTO v_sale FROM public.sales WHERE id = v_ex.sale_id FOR UPDATE;
  IF v_sale.quantity - v_sale.quantity_returned < v_ex.return_quantity THEN
    PERFORM app_private.fail('The sale no longer has ' || v_ex.return_quantity || ' units left to return', 'form');
  END IF;
  SELECT * INTO v_product FROM public.products WHERE id = v_ex.replacement_product_id;
  IF v_product.status <> 'active' THEN PERFORM app_private.fail(v_product.name || ' is no longer active', 'form'); END IF;

  -- What the returned units were worth on the original line.
  v_returned := ROUND(v_ex.return_quantity * v_sale.unit_price - v_sale.discount_amount * v_ex.return_quantity::NUMERIC / v_sale.quantity, 2);
  UPDATE public.sales SET quantity_returned = quantity_returned + v_ex.return_quantity, updated_at = pg_catalog.now()
   WHERE id = v_sale.id;

  -- Back into stock, in the batch most likely to have supplied them (the soonest
  -- expiry not yet past), so batch totals stay equal to stock on hand.
  SELECT batch_number, expiry_date INTO v_lot FROM public.stock_batches
   WHERE branch_id = v_ex.branch_id AND product_id = v_ex.returned_product_id
   ORDER BY (expiry_date >= app_private.today(v_ex.tenant_id)) DESC, expiry_date ASC
   LIMIT 1;
  PERFORM app_private.apply_stock(v_ex.tenant_id, v_ex.branch_id, v_ex.returned_product_id, v_ex.return_quantity,
    'exchange_return', 'exchange', v_ex.id, v_actor.id, 'Returned by the customer in exchange ' || v_ex.id,
    v_lot.batch_number, v_lot.expiry_date);

  -- The replacement: a new line for the same customer and rep, from branch stock.
  INSERT INTO public.sales (tenant_id, code, branch_id, sales_rep_id, product_id, customer_id, order_id, quantity, unit_price,
                            sale_date, status, exchange_id)
  VALUES (v_ex.tenant_id, 'SAL-' || gen_random_uuid()::TEXT, v_ex.branch_id, v_ex.rep_id, v_product.id, v_ex.customer_id,
          gen_random_uuid(), v_ex.replacement_quantity, v_product.unit_price, app_private.today(v_ex.tenant_id), 'completed', v_ex.id)
  RETURNING * INTO v_new;

  UPDATE public.stock_exchanges
     SET status = 'fulfilled', fulfilled_by = v_actor.id, fulfilled_at = pg_catalog.now(),
         returned_value = v_returned, replacement_value = v_new.line_total, replacement_sale_id = v_new.id
   WHERE id = v_ex.id RETURNING * INTO v_ex;

  PERFORM app_private.notify_exchange(v_ex, 'exchange_fulfilled', ARRAY[v_ex.rep_id],
    'Exchange ' || v_ex.id || ' is ready: collect the replacement and confirm the customer has it');
  PERFORM app_private.audit(v_actor, 'Exchange fulfilled',
    app_private.exchange_label(v_ex) || ' · returned ₦' || pg_catalog.to_char(v_returned, 'FM999,999,999,990.00')
      || ', replacement ₦' || pg_catalog.to_char(v_new.line_total, 'FM999,999,999,990.00'),
    'exchange', v_ex.id, pg_catalog.jsonb_build_object('branchId', v_ex.branch_id, 'saleId', v_ex.sale_id, 'replacementSaleId', v_new.id));
  RETURN v_ex;
END;
$$;

-- ----------------------------------------------------------------------------
-- Rep: confirm the customer has the replacement
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.acknowledge_exchange(p_exchange_id TEXT)
RETURNS public.stock_exchanges
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
DECLARE
  v_actor public.users := app_private.actor();
  v_ex public.stock_exchanges;
BEGIN
  SELECT * INTO v_ex FROM public.stock_exchanges WHERE id = p_exchange_id AND tenant_id = v_actor.tenant_id FOR UPDATE;
  IF NOT FOUND THEN PERFORM app_private.fail('Exchange not found', 'form'); END IF;
  IF v_ex.rep_id <> v_actor.id THEN PERFORM app_private.deny('Only the rep who requested it confirms an exchange'); END IF;
  IF v_ex.status <> 'fulfilled' THEN PERFORM app_private.fail('The exchange is not fulfilled yet', 'form'); END IF;
  IF v_ex.acknowledged_at IS NOT NULL THEN PERFORM app_private.fail('You already confirmed this exchange', 'form'); END IF;
  UPDATE public.stock_exchanges SET acknowledged_at = pg_catalog.now() WHERE id = v_ex.id RETURNING * INTO v_ex;
  PERFORM app_private.audit(v_actor, 'Exchange acknowledged', app_private.exchange_label(v_ex), 'exchange', v_ex.id,
    pg_catalog.jsonb_build_object('branchId', v_ex.branch_id));
  RETURN v_ex;
END;
$$;

REVOKE ALL ON FUNCTION app_private.exchange_label(public.stock_exchanges) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app_private.notify_exchange(public.stock_exchanges, TEXT, UUID[], TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app_private.exchange_for_storekeeper(public.users, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.request_exchange(UUID, INTEGER, UUID, INTEGER, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.approve_exchange(TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reject_exchange(TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fulfil_exchange(TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.acknowledge_exchange(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_exchange(UUID, INTEGER, UUID, INTEGER, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_exchange(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_exchange(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fulfil_exchange(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.acknowledge_exchange(TEXT) TO authenticated;

-- Supervisor reports: units kept after exchanges (as line_total), and lines fully
-- returned left out. Otherwise as in 20261113110000.
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
                           'is_customer_sale', s.customer_id IS NOT NULL, 'quantity', s.quantity - s.quantity_returned, 'unit_price', s.unit_price,
                           'discount_amount', s.discount_amount, 'line_total', s.line_total, 'is_promo', s.is_promo)
                           ORDER BY s.created_at DESC)
                          FROM public.sales s
                         WHERE s.tenant_id = v_row.tenant_id AND s.status = 'completed' AND s.branch_id = ANY (v_branches)
                           AND s.sale_date BETWEEN v_row.period_from AND v_row.period_to
                           AND s.quantity > s.quantity_returned), '[]'::JSONB) END,
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

NOTIFY pgrst, 'reload schema';
