-- ============================================================================
-- RPC FOUNDATION
-- ============================================================================
-- Shared internals for the app's write RPCs (see src/lib/rpc.ts):
--   * app_private schema: not exposed through the Data API, so nothing here is
--     reachable from the browser except through the public RPCs.
--   * caller checks, field-aware errors (form field name in HINT), audit rows,
--     notifications, text id generation, idempotency.
--   * apply_stock(): the ONLY path that changes quantity_on_hand. Writes the
--     movement, opens/extends lots on receipt and drains lots first-expiry-first-out
--     on removal. Stock is never reserved.
-- Also replaces triggers that conflict with the app rules:
--   * stock_request_fulfillment: skipped repeat partial issues and decremented
--     quantity_reserved, which approval never increments. Fulfilment is now done
--     by fulfil_stock_request().
--   * stock_request_status_notification / payment_status_notification: the payment
--     one read the dropped users.name column (every payments insert failed), both
--     notified a single recipient. Notifications are now written by the RPCs.
--   * process_sale_inventory: now drains lots FEFO through apply_stock().
-- No RLS policy, RLS setting or table GRANT is changed.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS app_private;
REVOKE ALL ON SCHEMA app_private FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------------------
-- Single owner: the owner bootstrap in handle_new_user() checks for an existing
-- owner, but two simultaneous sign-ups could both pass that check.
-- ----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS users_single_owner_idx
  ON public.users ((role)) WHERE role = 'owner';

-- ----------------------------------------------------------------------------
-- Lots are per branch and product. The old UNIQUE(tenant_id, batch_number)
-- refused the same supplier lot number in two branches or for two products.
-- ----------------------------------------------------------------------------
ALTER TABLE public.stock_batches DROP CONSTRAINT IF EXISTS stock_batches_tenant_batch_unique;
ALTER TABLE public.stock_batches DROP CONSTRAINT IF EXISTS stock_batches_lot_unique;
ALTER TABLE public.stock_batches
  ADD CONSTRAINT stock_batches_lot_unique UNIQUE (branch_id, product_id, batch_number, expiry_date);

-- ----------------------------------------------------------------------------
-- Triggers replaced by RPCs
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS stock_request_fulfillment ON public.stock_requests;
DROP TRIGGER IF EXISTS stock_request_status_notification ON public.stock_requests;
DROP TRIGGER IF EXISTS payment_status_notification ON public.payments;

-- ----------------------------------------------------------------------------
-- Errors
-- ----------------------------------------------------------------------------
-- Invalid input: the message is shown to the user; HINT names the form field.
CREATE OR REPLACE FUNCTION app_private.fail(p_message TEXT, p_field TEXT DEFAULT 'form')
RETURNS VOID
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION '%', p_message USING ERRCODE = 'P0001', HINT = COALESCE(p_field, 'form');
END;
$$;

-- Not allowed for this caller.
CREATE OR REPLACE FUNCTION app_private.deny(p_message TEXT)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION '%', p_message USING ERRCODE = '42501', HINT = 'form';
END;
$$;

-- ----------------------------------------------------------------------------
-- Caller
-- ----------------------------------------------------------------------------
-- The signed-in, active profile with a role. Pending/inactive profiles are refused.
CREATE OR REPLACE FUNCTION app_private.actor()
RETURNS public.users
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
DECLARE
  v_user public.users;
BEGIN
  IF auth.uid() IS NULL THEN
    PERFORM app_private.deny('Sign in to continue.');
  END IF;
  SELECT * INTO v_user FROM public.users
   WHERE id = auth.uid() AND status = 'active' AND role IS NOT NULL;
  IF NOT FOUND THEN
    PERFORM app_private.deny('Your account is not active.');
  END IF;
  RETURN v_user;
END;
$$;

-- Today's business date in the tenant's timezone.
CREATE OR REPLACE FUNCTION app_private.today(p_tenant_id UUID)
RETURNS DATE
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
  SELECT (pg_catalog.now() AT TIME ZONE COALESCE(
    (SELECT t.timezone FROM public.tenants t WHERE t.id = p_tenant_id), 'Africa/Lagos'))::DATE;
$$;

CREATE OR REPLACE FUNCTION app_private.full_name(p_user_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
  SELECT COALESCE(NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.last_name)), ''), u.email, 'User')
    FROM public.users u WHERE u.id = p_user_id;
$$;

-- ----------------------------------------------------------------------------
-- Audit and notifications
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_private.audit(
  p_actor public.users,
  p_action TEXT,
  p_subject TEXT,
  p_entity TEXT,
  p_entity_id TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL,
  p_emergency BOOLEAN DEFAULT FALSE
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
  INSERT INTO public.activities (tenant_id, action, subject, actor_id, entity, entity_id, emergency, metadata)
  VALUES (p_actor.tenant_id, p_action, p_subject, p_actor.id, p_entity, p_entity_id, p_emergency, p_metadata);
$$;

CREATE OR REPLACE FUNCTION app_private.notify(
  p_tenant_id UUID,
  p_recipient_id UUID,
  p_type TEXT,
  p_entity_type TEXT,
  p_entity_id TEXT,
  p_message TEXT
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
  INSERT INTO public.notifications (tenant_id, recipient_id, type, entity_type, entity_id, message)
  SELECT p_tenant_id, p_recipient_id, p_type, p_entity_type, p_entity_id, p_message
   WHERE p_recipient_id IS NOT NULL;
$$;

-- Every active owner of the tenant.
CREATE OR REPLACE FUNCTION app_private.notify_owners(
  p_tenant_id UUID, p_type TEXT, p_entity_type TEXT, p_entity_id TEXT, p_message TEXT
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
  INSERT INTO public.notifications (tenant_id, recipient_id, type, entity_type, entity_id, message)
  SELECT p_tenant_id, u.id, p_type, p_entity_type, p_entity_id, p_message
    FROM public.users u
   WHERE u.tenant_id = p_tenant_id AND u.role = 'owner' AND u.status = 'active';
$$;

-- ----------------------------------------------------------------------------
-- Text ids (payments, expenses, stock_requests, owner_remittances have no default)
-- ----------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS app_private.stock_request_seq START 1001;
CREATE SEQUENCE IF NOT EXISTS app_private.payment_seq START 3001;
CREATE SEQUENCE IF NOT EXISTS app_private.expense_seq START 4201;
CREATE SEQUENCE IF NOT EXISTS app_private.owner_remittance_seq START 5001;

CREATE OR REPLACE FUNCTION app_private.next_id(p_prefix TEXT, p_seq REGCLASS, p_table REGCLASS)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
DECLARE
  v_id TEXT;
  v_taken BOOLEAN;
BEGIN
  LOOP
    v_id := p_prefix || '-' || pg_catalog.nextval(p_seq)::TEXT;
    EXECUTE pg_catalog.format('SELECT EXISTS (SELECT 1 FROM %s WHERE id = $1)', p_table)
      INTO v_taken USING v_id;
    EXIT WHEN NOT v_taken;
  END LOOP;
  RETURN v_id;
END;
$$;

-- ----------------------------------------------------------------------------
-- Idempotency: a create RPC called twice with the same key returns the first
-- result instead of applying again (e.g. a retried form submit).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app_private.rpc_requests (
  key UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  fn TEXT NOT NULL,
  result JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now()
);

-- Serialises calls with the same key and returns the stored result, if any.
CREATE OR REPLACE FUNCTION app_private.replay(p_key UUID, p_fn TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  IF p_key IS NULL THEN
    RETURN NULL;
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_key::TEXT, 0));
  SELECT r.result INTO v_result FROM app_private.rpc_requests r
   WHERE r.key = p_key AND r.user_id = auth.uid() AND r.fn = p_fn;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION app_private.remember(p_key UUID, p_fn TEXT, p_result JSONB)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  INSERT INTO app_private.rpc_requests (key, user_id, fn, result)
  SELECT p_key, auth.uid(), p_fn, p_result WHERE p_key IS NOT NULL
  ON CONFLICT (key) DO NOTHING;
$$;

-- ----------------------------------------------------------------------------
-- apply_stock: the single path that changes stock
-- ----------------------------------------------------------------------------
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

  -- Stock is never reserved: available = on hand.
  UPDATE public.inventory_records
     SET quantity_on_hand = quantity_on_hand + p_delta,
         quantity_reserved = 0,
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

-- ----------------------------------------------------------------------------
-- Sales deduct stock through apply_stock (FEFO lots). Same checks as before.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_sale_inventory()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
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

    PERFORM app_private.apply_stock(
      NEW.tenant_id, NEW.branch_id, NEW.product_id, -NEW.quantity,
      'sale', 'sale', NEW.id::TEXT, NEW.sales_rep_id);
  END IF;
  RETURN NEW;
END;
$$;
ALTER FUNCTION public.process_sale_inventory() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.process_sale_inventory() FROM PUBLIC;

-- ----------------------------------------------------------------------------
-- Internal functions are never callable directly by clients.
-- ----------------------------------------------------------------------------
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA app_private FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA app_private FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA app_private FROM PUBLIC, anon, authenticated;
