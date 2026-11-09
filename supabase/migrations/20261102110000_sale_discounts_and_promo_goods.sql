-- Discounts and promo goods.
--   * Each sale line can carry a discount, entered as a percentage or an amount.
--     unit_price stays the list price; line_total is what revenue, targets, customer
--     balances and rep remittances count.
--   * Promo goods are products with product_type 'promo': their own stock, price 0.
--     They go out as ₦0 lines on a sale, so stock falls and revenue does not.
--   * record_sale() is now how the app records sales. The server reads the price,
--     works out the discount and enforces the rep's limit.

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS discount_type TEXT CHECK (discount_type IN ('percent', 'amount')),
  ADD COLUMN IF NOT EXISTS discount_value NUMERIC(12,2) CHECK (discount_value > 0),
  ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  ADD COLUMN IF NOT EXISTS is_promo BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS line_total NUMERIC(14,2) GENERATED ALWAYS AS (quantity * unit_price - discount_amount) STORED;
ALTER TABLE public.sales
  ADD CONSTRAINT sales_discount_within_line CHECK (discount_amount <= quantity * unit_price),
  ADD CONSTRAINT sales_promo_is_free CHECK (NOT is_promo OR (unit_price = 0 AND discount_amount = 0));
COMMENT ON COLUMN public.sales.unit_price IS 'List price per unit; 0 on promo lines';
COMMENT ON COLUMN public.sales.discount_value IS 'The discount as entered: a percentage or a naira amount, per discount_type';
COMMENT ON COLUMN public.sales.discount_amount IS 'Naira taken off the whole line';
COMMENT ON COLUMN public.sales.line_total IS 'quantity * unit_price - discount_amount: the amount that counts as revenue';

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS product_type TEXT NOT NULL DEFAULT 'regular' CHECK (product_type IN ('regular', 'promo'));
ALTER TABLE public.products
  ADD CONSTRAINT products_promo_is_free CHECK (product_type <> 'promo' OR unit_price = 0);
COMMENT ON COLUMN public.products.product_type IS 'regular = sold; promo = given away free on a sale. Set when the product is created.';

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS max_rep_discount_percent NUMERIC(5,2) CHECK (max_rep_discount_percent BETWEEN 0 AND 100);
COMMENT ON COLUMN public.tenants.max_rep_discount_percent IS 'Largest discount a sales rep may give on a line. NULL = no limit. The owner is never limited.';

ALTER TABLE public.inventory_movements DROP CONSTRAINT IF EXISTS inventory_movements_type_check;
ALTER TABLE public.inventory_movements
  ADD CONSTRAINT inventory_movements_type_check CHECK (type IN ('stock_added', 'stock_issued', 'sale', 'adjustment', 'promo'));

-- ----------------------------------------------------------------------------
-- Everything that adds up sales counts line_total.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_private.rep_total_sales(p_tenant_id UUID, p_rep_id UUID, p_period TEXT)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
  SELECT COALESCE(SUM(s.line_total), 0)
    FROM public.sales s
   WHERE s.tenant_id = p_tenant_id AND s.sales_rep_id = p_rep_id AND s.customer_id IS NULL
     AND s.status = 'completed' AND pg_catalog.to_char(s.sale_date, 'YYYY-MM') = p_period;
$$;

CREATE OR REPLACE FUNCTION get_customer_balance(p_customer_id UUID)
RETURNS NUMERIC AS $$
DECLARE
  total_sales NUMERIC;
  total_payments NUMERIC;
BEGIN
  -- Sum completed customer sales
  SELECT COALESCE(SUM(line_total), 0)
  INTO total_sales
  FROM sales
  WHERE customer_id = p_customer_id
    AND status = 'completed';

  -- Sum confirmed customer payments
  SELECT COALESCE(SUM(amount), 0)
  INTO total_payments
  FROM customer_payments
  WHERE customer_id = p_customer_id
    AND status = 'confirmed';

  RETURN total_sales - total_payments;
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION get_rep_total_sales(
  p_rep_id UUID,
  p_period TEXT, -- 'YYYY-MM'
  p_include_customer_sales BOOLEAN DEFAULT false
)
RETURNS NUMERIC AS $$
  SELECT COALESCE(SUM(line_total), 0)
  FROM sales
  WHERE sales_rep_id = p_rep_id
    AND status = 'completed'
    AND TO_CHAR(sale_date, 'YYYY-MM') = p_period
    AND (p_include_customer_sales OR customer_id IS NULL); -- Walk-in only unless flag set
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION get_target_achievement(
  p_target_id UUID
)
RETURNS NUMERIC AS $$
DECLARE
  target_record RECORD;
  achieved_amount NUMERIC;
BEGIN
  -- Get target details
  SELECT * INTO target_record
  FROM targets
  WHERE id = p_target_id;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  -- Calculate achieved sales
  IF target_record.scope = 'branch' THEN
    -- Branch target: sum all sales in branch
    SELECT COALESCE(SUM(line_total), 0)
    INTO achieved_amount
    FROM sales
    WHERE branch_id = target_record.branch_id
      AND status = 'completed'
      AND TO_CHAR(sale_date, 'YYYY-MM') = target_record.month;
  ELSE
    -- Rep target: sum rep's sales
    SELECT COALESCE(SUM(line_total), 0)
    INTO achieved_amount
    FROM sales
    WHERE sales_rep_id = target_record.user_id
      AND status = 'completed'
      AND TO_CHAR(sale_date, 'YYYY-MM') = target_record.month;
  END IF;

  -- Return percentage
  IF target_record.amount = 0 THEN
    RETURN 0;
  END IF;

  RETURN (achieved_amount / target_record.amount) * 100;
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION auto_audit_sale()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'completed' THEN
    PERFORM create_audit_log(
      NEW.tenant_id,
      NEW.sales_rep_id,
      CASE WHEN NEW.is_promo THEN 'Promo item given' ELSE 'Sale recorded' END,
      NEW.code || ' · ' || (SELECT name FROM products WHERE id = NEW.product_id),
      'sale',
      NEW.id::TEXT,
      false,
      jsonb_build_object(
        'branchId', NEW.branch_id,
        'productId', NEW.product_id,
        'quantity', NEW.quantity,
        'amount', NEW.line_total,
        'discount', NEW.discount_amount
      )
    );
  ELSIF TG_OP = 'UPDATE' AND NEW.status = 'voided' AND OLD.status != 'voided' THEN
    PERFORM create_audit_log(
      NEW.tenant_id,
      auth.uid(),
      'Sale voided',
      NEW.code || ' · Cancelled',
      'sale',
      NEW.id::TEXT,
      false,
      jsonb_build_object('reason', 'Status changed to voided')
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Promo lines get their own movement type, so giveaways are told apart from sales.
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
      CASE WHEN NEW.is_promo THEN 'promo' ELSE 'sale' END, 'sale', NEW.id::TEXT, NEW.sales_rep_id);
  END IF;
  RETURN NEW;
END;
$$;
ALTER FUNCTION public.process_sale_inventory() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.process_sale_inventory() FROM PUBLIC;

-- ----------------------------------------------------------------------------
-- Inserting into sales directly stays possible for a browser tab still running the
-- previous app version, but only at the list price, with no discount or promo.
-- record_sale() runs as the function owner, so this does not apply to it.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_direct_sale()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_price NUMERIC;
  v_type TEXT;
BEGIN
  IF current_user <> 'authenticated' THEN RETURN NEW; END IF;
  SELECT unit_price, product_type INTO v_price, v_type FROM public.products WHERE id = NEW.product_id;
  IF NEW.is_promo OR NEW.discount_amount <> 0 OR NEW.discount_type IS NOT NULL OR NEW.discount_value IS NOT NULL
     OR v_type = 'promo' OR NEW.unit_price IS DISTINCT FROM v_price THEN
    RAISE EXCEPTION 'Please refresh the app and record this sale again.' USING ERRCODE = '42501', HINT = 'form';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_direct_sale() FROM PUBLIC;
DROP TRIGGER IF EXISTS guard_direct_sale ON public.sales;
CREATE TRIGGER guard_direct_sale
  BEFORE INSERT ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.guard_direct_sale();

-- ----------------------------------------------------------------------------
-- record_sale: one order, all lines or none. Stock is deducted by the sales trigger.
-- p_items: [{ product_id, quantity, is_promo, discount_type, discount_value }]
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
  v_customer public.customers;
  v_limit NUMERIC;
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
  IF v_actor.role NOT IN ('owner', 'sales_rep') THEN PERFORM app_private.deny('You cannot record sales'); END IF;

  SELECT * INTO v_branch FROM public.branches WHERE id = p_branch_id AND tenant_id = v_actor.tenant_id;
  IF NOT FOUND OR v_branch.status <> 'active' THEN PERFORM app_private.fail('Choose an active branch', 'branchId'); END IF;
  IF v_actor.role = 'sales_rep' AND v_branch.id IS DISTINCT FROM v_actor.branch_id THEN
    PERFORM app_private.fail('You can only record sales for your own branch', 'branchId');
  END IF;
  IF p_sale_date IS NULL OR p_sale_date > app_private.today(v_actor.tenant_id) THEN
    PERFORM app_private.fail('Enter a valid sale date (not in the future)', 'saleDate');
  END IF;

  IF p_customer_id IS NOT NULL THEN
    SELECT * INTO v_customer FROM public.customers WHERE id = p_customer_id AND tenant_id = v_actor.tenant_id;
    IF NOT FOUND OR v_customer.assigned_rep_id IS DISTINCT FROM v_actor.id THEN
      PERFORM app_private.fail('Choose one of your customers', 'customerId');
    END IF;
    IF v_customer.status <> 'active' THEN PERFORM app_private.fail('This customer is inactive', 'customerId'); END IF;
  ELSIF TRIM(COALESCE(p_walk_in_name, '')) = '' THEN
    PERFORM app_private.fail('Enter the walk-in customer''s name', 'walkInName');
  END IF;

  IF p_items IS NULL OR pg_catalog.jsonb_typeof(p_items) <> 'array' OR pg_catalog.jsonb_array_length(p_items) = 0 THEN
    PERFORM app_private.fail('Add at least one product', 'items');
  END IF;
  SELECT max_rep_discount_percent INTO v_limit FROM public.tenants WHERE id = v_actor.tenant_id;

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
      IF v_actor.role = 'sales_rep' AND v_limit IS NOT NULL AND v_amount > ROUND(v_gross * v_limit / 100, 2) THEN
        PERFORM app_private.fail('Your discount limit is ' || pg_catalog.trim_scale(v_limit)::TEXT || '% of the line total. Lower the discount on ' || v_product.name, 'items');
      END IF;
    END IF;
    IF NOT v_is_promo THEN v_paid_lines := v_paid_lines + 1; END IF;

    INSERT INTO public.sales (tenant_id, code, branch_id, sales_rep_id, product_id, customer_id, order_id, quantity, unit_price,
                              sale_date, walk_in_name, walk_in_phone, status, discount_type, discount_value, discount_amount, is_promo)
    VALUES (v_actor.tenant_id, 'SAL-' || gen_random_uuid()::TEXT, v_branch.id, v_actor.id, v_product.id, p_customer_id, v_order,
            v_qty, v_product.unit_price, p_sale_date,
            CASE WHEN p_customer_id IS NULL THEN TRIM(p_walk_in_name) END,
            CASE WHEN p_customer_id IS NULL THEN NULLIF(TRIM(p_walk_in_phone), '') END,
            'completed', v_type, v_value, v_amount, v_is_promo)
    RETURNING * INTO v_row;
    v_rows := v_rows || pg_catalog.to_jsonb(v_row);
  END LOOP;

  IF v_paid_lines = 0 THEN PERFORM app_private.fail('Promo items go out with a sale: add a product being sold', 'items'); END IF;

  PERFORM app_private.remember(p_idempotency_key, 'record_sale', v_rows);
  RETURN QUERY SELECT * FROM pg_catalog.jsonb_populate_recordset(NULL::public.sales, v_rows);
END;
$$;

-- Owner: the most a rep may discount a line. NULL removes the limit.
CREATE OR REPLACE FUNCTION public.set_max_rep_discount(p_percent NUMERIC)
RETURNS public.tenants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
DECLARE
  v_actor public.users := app_private.actor();
  v_row public.tenants;
BEGIN
  IF v_actor.role <> 'owner' THEN PERFORM app_private.deny('Only the business owner can change these settings.'); END IF;
  IF p_percent IS NOT NULL AND (p_percent < 0 OR p_percent > 100) THEN
    PERFORM app_private.fail('Enter a percentage from 0 to 100', 'form');
  END IF;
  UPDATE public.tenants SET max_rep_discount_percent = p_percent, updated_at = pg_catalog.now()
   WHERE id = v_actor.tenant_id RETURNING * INTO v_row;
  PERFORM app_private.audit(v_actor, 'Discount limit setting updated',
    CASE WHEN p_percent IS NULL THEN 'No limit' ELSE pg_catalog.trim_scale(p_percent)::TEXT || '% of the line total' END,
    'settings', v_actor.tenant_id::TEXT, NULL);
  RETURN v_row;
END;
$$;

-- ----------------------------------------------------------------------------
-- Promo products: price 0, no cost-against-price rule. import_products keeps calling
-- check_product without a type, so a promo item can't be repriced through an import.
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS app_private.check_product(public.users, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, INTEGER, UUID);
CREATE FUNCTION app_private.check_product(
  p_actor public.users, p_name TEXT, p_sku TEXT, p_category TEXT, p_unit TEXT,
  p_unit_price NUMERIC, p_unit_cost NUMERIC, p_threshold INTEGER, p_editing UUID,
  p_product_type TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
DECLARE
  v_type TEXT := COALESCE(p_product_type, (SELECT product_type FROM public.products WHERE id = p_editing), 'regular');
BEGIN
  IF TRIM(COALESCE(p_name, '')) = '' THEN PERFORM app_private.fail('Enter a product name', 'name'); END IF;
  IF TRIM(COALESCE(p_sku, '')) = '' THEN PERFORM app_private.fail('Enter a SKU', 'sku'); END IF;
  IF EXISTS (SELECT 1 FROM public.products WHERE tenant_id = p_actor.tenant_id AND id IS DISTINCT FROM p_editing
                                              AND UPPER(sku) = UPPER(TRIM(p_sku))) THEN
    PERFORM app_private.fail('This SKU is already used by another product', 'sku');
  END IF;
  IF TRIM(COALESCE(p_category, '')) = '' THEN PERFORM app_private.fail('Enter a category', 'category'); END IF;
  IF TRIM(COALESCE(p_unit, '')) = '' THEN PERFORM app_private.fail('Select a unit', 'unit'); END IF;
  IF p_unit_cost IS NULL OR p_unit_cost < 0 THEN PERFORM app_private.fail('Enter a unit cost of zero or more', 'unitCost'); END IF;
  IF v_type = 'promo' THEN
    IF p_unit_price IS DISTINCT FROM 0 THEN PERFORM app_private.fail('Promo items are free: their selling price stays at zero', 'unitPrice'); END IF;
  ELSE
    IF p_unit_price IS NULL OR p_unit_price <= 0 THEN PERFORM app_private.fail('Enter a selling price above zero', 'unitPrice'); END IF;
    IF p_unit_cost > p_unit_price THEN PERFORM app_private.fail('Unit cost cannot exceed selling price', 'unitCost'); END IF;
  END IF;
  IF p_threshold IS NULL OR p_threshold < 0 THEN PERFORM app_private.fail('Enter a whole number of zero or more', 'threshold'); END IF;
END;
$$;

DROP FUNCTION IF EXISTS public.create_product(TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, INTEGER, TEXT);
CREATE FUNCTION public.create_product(
  p_name TEXT, p_sku TEXT, p_category TEXT, p_unit TEXT, p_unit_price NUMERIC, p_unit_cost NUMERIC,
  p_low_stock_threshold INTEGER, p_description TEXT, p_product_type TEXT DEFAULT 'regular'
)
RETURNS public.products
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
DECLARE
  v_actor public.users := app_private.actor();
  v_row public.products;
BEGIN
  IF v_actor.role NOT IN ('owner', 'storekeeper') THEN PERFORM app_private.deny('You cannot add products'); END IF;
  IF p_product_type NOT IN ('regular', 'promo') THEN PERFORM app_private.fail('Choose a valid product type', 'form'); END IF;
  PERFORM app_private.check_product(v_actor, p_name, p_sku, p_category, p_unit, p_unit_price, p_unit_cost, p_low_stock_threshold, NULL, p_product_type);
  -- insert_product opens the inventory records. The type constraint allows a regular row at any price.
  v_row := app_private.insert_product(v_actor, p_name, p_sku, p_category, p_unit, p_unit_price, p_unit_cost, p_low_stock_threshold, p_description);
  UPDATE public.products SET product_type = p_product_type WHERE id = v_row.id RETURNING * INTO v_row;
  PERFORM app_private.audit(v_actor, CASE WHEN p_product_type = 'promo' THEN 'Product created (promo item)' ELSE 'Product created' END,
    v_row.name || ' · ' || v_row.sku, 'product', v_row.id::TEXT, pg_catalog.jsonb_build_object('productId', v_row.id));
  RETURN v_row;
END;
$$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA app_private FROM PUBLIC, anon, authenticated;
DO $$
DECLARE
  v_fn TEXT;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.record_sale(UUID, DATE, UUID, TEXT, TEXT, JSONB, UUID)',
    'public.set_max_rep_discount(NUMERIC)',
    'public.create_product(TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, INTEGER, TEXT, TEXT)'
  ] LOOP
    EXECUTE pg_catalog.format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', v_fn);
    EXECUTE pg_catalog.format('GRANT EXECUTE ON FUNCTION %s TO authenticated', v_fn);
  END LOOP;
END;
$$;
