-- Cost price is for the Owner only.
--
-- Managers, storekeepers and reps can no longer read products.unit_cost: the column
-- is left out of their SELECT privilege, so it never reaches their browser, and
-- the product functions blank it in what they return to anyone but the Owner. The
-- Owner reads costs through get_product_costs().
--
-- Only the Owner sets cost. A product a storekeeper adds (by hand or by import)
-- has no cost (NULL) until the Owner fills it in; a storekeeper's edit or import
-- keeps the existing cost. A storekeeper can't price a product below its cost:
-- they're told to ask the Owner, without being told the cost.

ALTER TABLE public.products ALTER COLUMN unit_cost DROP NOT NULL;
COMMENT ON COLUMN public.products.unit_cost IS
  'Cost price in naira. Owner-only: not readable by other roles. NULL until the Owner sets it.';

-- Column privileges: everything but unit_cost. A column added to products later
-- must be granted here too (a table-wide grant would expose unit_cost again).
REVOKE SELECT, INSERT, UPDATE ON public.products FROM PUBLIC, anon, authenticated;
DO $$
DECLARE
  v_cols TEXT;
BEGIN
  SELECT pg_catalog.string_agg(pg_catalog.quote_ident(attname), ', ' ORDER BY attnum) INTO v_cols
    FROM pg_catalog.pg_attribute
   WHERE attrelid = 'public.products'::regclass AND attnum > 0 AND NOT attisdropped AND attname <> 'unit_cost';
  EXECUTE pg_catalog.format('GRANT SELECT (%s) ON public.products TO authenticated', v_cols);
  EXECUTE pg_catalog.format('GRANT INSERT (%s) ON public.products TO authenticated', v_cols);
  EXECUTE pg_catalog.format('GRANT UPDATE (%s) ON public.products TO authenticated', v_cols);
END;
$$;

-- What a product function returns to its caller: cost only for the Owner.
CREATE OR REPLACE FUNCTION app_private.product_for(p_actor public.users, p_row public.products)
RETURNS public.products
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF p_actor.role IS DISTINCT FROM 'owner' THEN p_row.unit_cost := NULL; END IF;
  RETURN p_row;
END;
$$;

-- Owner only: the cost of every product in the business.
CREATE OR REPLACE FUNCTION public.get_product_costs()
RETURNS TABLE (product_id UUID, unit_cost NUMERIC)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
DECLARE
  v_actor public.users := app_private.actor();
BEGIN
  IF v_actor.role <> 'owner' THEN PERFORM app_private.deny('Only the Owner can see cost prices'); END IF;
  RETURN QUERY SELECT p.id, p.unit_cost FROM public.products p WHERE p.tenant_id = v_actor.tenant_id;
END;
$$;

-- Cost may now be left empty (NULL = not set). When given, it must be zero or more
-- and, for a regular product, not above the selling price.
CREATE OR REPLACE FUNCTION app_private.check_product(
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
  IF p_unit_cost < 0 THEN PERFORM app_private.fail('Enter a unit cost of zero or more', 'unitCost'); END IF;
  IF v_type = 'promo' THEN
    IF p_unit_price IS DISTINCT FROM 0 THEN PERFORM app_private.fail('Promo items are free: their selling price stays at zero', 'unitPrice'); END IF;
  ELSE
    IF p_unit_price IS NULL OR p_unit_price <= 0 THEN PERFORM app_private.fail('Enter a selling price above zero', 'unitPrice'); END IF;
    IF p_unit_cost > p_unit_price THEN PERFORM app_private.fail('Unit cost cannot exceed selling price', 'unitCost'); END IF;
  END IF;
  IF p_threshold IS NULL OR p_threshold < 0 THEN PERFORM app_private.fail('Enter a whole number of zero or more', 'threshold'); END IF;
END;
$$;

-- A selling price a non-Owner sets must not fall below the cost the Owner set.
CREATE OR REPLACE FUNCTION app_private.check_price_above_cost(p_product public.products, p_unit_price NUMERIC)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF p_product.product_type <> 'promo' AND p_product.unit_cost > p_unit_price THEN
    PERFORM app_private.fail('This selling price is below the product''s cost price. Ask the Owner to update the product.', 'unitPrice');
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_product(
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
  -- Only the Owner sets cost; anyone else's product starts without one.
  v_cost NUMERIC := CASE WHEN v_actor.role = 'owner' THEN p_unit_cost END;
  v_row public.products;
BEGIN
  IF v_actor.role NOT IN ('owner', 'storekeeper') THEN PERFORM app_private.deny('You cannot add products'); END IF;
  IF p_product_type NOT IN ('regular', 'promo') THEN PERFORM app_private.fail('Choose a valid product type', 'form'); END IF;
  PERFORM app_private.check_product(v_actor, p_name, p_sku, p_category, p_unit, p_unit_price, v_cost, p_low_stock_threshold, NULL, p_product_type);
  v_row := app_private.insert_product(v_actor, p_name, p_sku, p_category, p_unit, p_unit_price, v_cost, p_low_stock_threshold, p_description);
  UPDATE public.products SET product_type = p_product_type WHERE id = v_row.id RETURNING * INTO v_row;
  PERFORM app_private.audit(v_actor, CASE WHEN p_product_type = 'promo' THEN 'Product created (promo item)' ELSE 'Product created' END,
    v_row.name || ' · ' || v_row.sku, 'product', v_row.id::TEXT, pg_catalog.jsonb_build_object('productId', v_row.id));
  RETURN app_private.product_for(v_actor, v_row);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_product(
  p_product_id UUID, p_name TEXT, p_sku TEXT, p_category TEXT, p_unit TEXT, p_unit_price NUMERIC, p_unit_cost NUMERIC,
  p_low_stock_threshold INTEGER, p_description TEXT
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
  v_cost NUMERIC;
  v_old_threshold INTEGER;
BEGIN
  IF v_actor.role NOT IN ('owner', 'storekeeper') THEN PERFORM app_private.deny('You cannot edit products'); END IF;
  SELECT * INTO v_row FROM public.products WHERE id = p_product_id AND tenant_id = v_actor.tenant_id FOR UPDATE;
  IF NOT FOUND THEN PERFORM app_private.fail('Product not found'); END IF;
  IF v_actor.role = 'owner' THEN
    v_cost := p_unit_cost;
    PERFORM app_private.check_product(v_actor, p_name, p_sku, p_category, p_unit, p_unit_price, v_cost, p_low_stock_threshold, v_row.id);
  ELSE
    -- The cost stays as the Owner set it, whatever was sent.
    v_cost := v_row.unit_cost;
    PERFORM app_private.check_product(v_actor, p_name, p_sku, p_category, p_unit, p_unit_price, NULL, p_low_stock_threshold, v_row.id);
    PERFORM app_private.check_price_above_cost(v_row, p_unit_price);
  END IF;
  v_old_threshold := v_row.low_stock_threshold;
  UPDATE public.products
     SET name = TRIM(p_name), sku = UPPER(TRIM(p_sku)), category = TRIM(p_category), unit = TRIM(p_unit),
         unit_price = p_unit_price, unit_cost = v_cost, low_stock_threshold = p_low_stock_threshold,
         description = NULLIF(TRIM(p_description), ''), updated_at = pg_catalog.now()
   WHERE id = v_row.id RETURNING * INTO v_row;
  -- Branch thresholds still on the old product default follow the new one.
  UPDATE public.inventory_records SET low_stock_threshold = p_low_stock_threshold
   WHERE product_id = v_row.id AND low_stock_threshold = v_old_threshold;
  PERFORM app_private.audit(v_actor, 'Product edited', v_row.name || ' · ' || v_row.sku, 'product', v_row.id::TEXT,
    pg_catalog.jsonb_build_object('productId', v_row.id));
  RETURN app_private.product_for(v_actor, v_row);
END;
$$;

CREATE OR REPLACE FUNCTION public.set_product_status(p_product_id UUID, p_status TEXT)
RETURNS public.products
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
DECLARE
  v_actor public.users := app_private.actor();
  v_product public.products;
BEGIN
  IF p_status NOT IN ('active', 'inactive') THEN
    PERFORM app_private.fail('Invalid product status.', 'status');
  END IF;
  IF p_status = 'inactive' AND v_actor.role NOT IN ('owner', 'manager') THEN
    PERFORM app_private.deny(CASE WHEN v_actor.role = 'storekeeper'
      THEN 'Deactivation needs a manager''s approval — send a request instead'
      ELSE 'You cannot change product status' END);
  END IF;
  IF p_status = 'active' AND v_actor.role NOT IN ('owner', 'manager', 'storekeeper') THEN
    PERFORM app_private.deny('You cannot change product status');
  END IF;
  UPDATE public.products SET status = p_status, updated_at = pg_catalog.now()
   WHERE id = p_product_id AND tenant_id = v_actor.tenant_id
  RETURNING * INTO v_product;
  IF v_product.id IS NULL THEN
    RAISE EXCEPTION 'Product not found in this organization.' USING ERRCODE = 'P0002', HINT = 'form';
  END IF;
  PERFORM app_private.audit(v_actor, CASE WHEN p_status = 'active' THEN 'Product activated' ELSE 'Product deactivated' END,
    v_product.name || ' · ' || v_product.sku, 'product', v_product.id::TEXT, pg_catalog.jsonb_build_object('productId', v_product.id));
  RETURN app_private.product_for(v_actor, v_product);
END;
$$;

-- Bulk import. As before (20261023130000), except that only the Owner's rows set
-- cost: a storekeeper's new product has none and an existing one keeps its cost.
CREATE OR REPLACE FUNCTION public.import_products(
  p_rows JSONB, p_mode TEXT, p_branch_id UUID, p_idempotency_key UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
DECLARE
  v_actor public.users := app_private.actor();
  v_prior JSONB := app_private.replay(p_idempotency_key, 'import_products');
  v_owner BOOLEAN;
  v_row JSONB;
  v_existing public.products;
  v_product public.products;
  v_cost NUMERIC;
  v_created INTEGER := 0;
  v_updated INTEGER := 0;
  v_skipped INTEGER := 0;
  v_failed INTEGER := 0;
  v_failures JSONB := '[]'::JSONB;
  v_qty INTEGER;
  v_result JSONB;
  v_error TEXT;
BEGIN
  IF v_prior IS NOT NULL THEN RETURN v_prior; END IF;
  IF v_actor.role NOT IN ('owner', 'storekeeper') THEN PERFORM app_private.deny('You cannot import products'); END IF;
  v_owner := v_actor.role = 'owner';
  IF p_mode NOT IN ('update', 'skip') THEN PERFORM app_private.fail('Choose how to handle existing SKUs'); END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.jsonb_array_elements(COALESCE(p_rows, '[]'::JSONB)) r WHERE (r ->> 'opening_quantity')::INTEGER > 0)
     AND NOT EXISTS (SELECT 1 FROM public.branches b WHERE b.id = p_branch_id AND b.tenant_id = v_actor.tenant_id AND b.status = 'active'
                       AND (v_actor.role = 'owner' OR b.id = v_actor.branch_id)) THEN
    PERFORM app_private.fail('Choose one of your active branches for opening stock');
  END IF;

  FOR v_row IN SELECT * FROM pg_catalog.jsonb_array_elements(COALESCE(p_rows, '[]'::JSONB)) LOOP
    v_existing := NULL;
    SELECT * INTO v_existing FROM public.products
     WHERE tenant_id = v_actor.tenant_id AND UPPER(sku) = UPPER(TRIM(v_row ->> 'sku'));
    IF FOUND AND p_mode = 'skip' THEN
      v_skipped := v_skipped + 1;
      v_failures := v_failures || pg_catalog.jsonb_build_object('row_number', v_row -> 'row_number', 'sku', v_row ->> 'sku',
        'name', v_row ->> 'name', 'reason', 'Skipped: SKU already exists');
      CONTINUE;
    END IF;
    v_qty := COALESCE((v_row ->> 'opening_quantity')::INTEGER, 0);
    BEGIN
      v_cost := CASE WHEN v_owner THEN (v_row ->> 'unit_cost')::NUMERIC ELSE v_existing.unit_cost END;
      PERFORM app_private.check_product(v_actor, v_row ->> 'name', v_row ->> 'sku', v_row ->> 'category', v_row ->> 'unit',
        (v_row ->> 'unit_price')::NUMERIC, CASE WHEN v_owner THEN v_cost END, (v_row ->> 'low_stock_threshold')::INTEGER, v_existing.id);
      IF NOT v_owner AND v_existing.id IS NOT NULL THEN
        PERFORM app_private.check_price_above_cost(v_existing, (v_row ->> 'unit_price')::NUMERIC);
      END IF;
      IF v_qty > 0 AND NULLIF(v_row ->> 'expiry_date', '') IS NULL THEN
        PERFORM app_private.fail('Opening stock needs an expiry date');
      END IF;
      IF v_existing.id IS NOT NULL THEN
        UPDATE public.products
           SET name = TRIM(v_row ->> 'name'), sku = UPPER(TRIM(v_row ->> 'sku')), category = TRIM(v_row ->> 'category'),
               unit = TRIM(v_row ->> 'unit'), unit_price = (v_row ->> 'unit_price')::NUMERIC,
               unit_cost = v_cost, low_stock_threshold = (v_row ->> 'low_stock_threshold')::INTEGER,
               description = NULLIF(TRIM(v_row ->> 'description'), ''), updated_at = pg_catalog.now()
         WHERE id = v_existing.id RETURNING * INTO v_product;
        v_updated := v_updated + 1;
        PERFORM app_private.audit(v_actor, 'Product updated', v_product.name || ' · ' || v_product.sku || ' · via import',
          'product', v_product.id::TEXT, NULL);
      ELSE
        v_product := app_private.insert_product(v_actor, v_row ->> 'name', v_row ->> 'sku', v_row ->> 'category', v_row ->> 'unit',
          (v_row ->> 'unit_price')::NUMERIC, v_cost, (v_row ->> 'low_stock_threshold')::INTEGER,
          v_row ->> 'description');
        v_created := v_created + 1;
        PERFORM app_private.audit(v_actor, 'Product created', v_product.name || ' · ' || v_product.sku || ' · via import',
          'product', v_product.id::TEXT, NULL);
      END IF;
      IF v_qty > 0 THEN
        PERFORM app_private.apply_stock(v_actor.tenant_id, p_branch_id, v_product.id, v_qty, 'stock_added', 'manual', NULL,
          v_actor.id, 'Opening stock from import', v_row ->> 'batch_number', (v_row ->> 'expiry_date')::DATE);
      END IF;
    EXCEPTION WHEN raise_exception THEN
      -- An invalid row is reported and skipped; the rest of the import continues.
      GET STACKED DIAGNOSTICS v_error = MESSAGE_TEXT;
      v_failed := v_failed + 1;
      v_failures := v_failures || pg_catalog.jsonb_build_object('row_number', v_row -> 'row_number', 'sku', v_row ->> 'sku',
        'name', v_row ->> 'name', 'reason', v_error);
    END;
  END LOOP;

  PERFORM app_private.audit(v_actor, 'Products imported',
    v_created || ' created · ' || v_updated || ' updated · ' || v_skipped || ' skipped · ' || v_failed || ' failed', 'product', NULL, NULL);
  v_result := pg_catalog.jsonb_build_object('created', v_created, 'updated', v_updated, 'skipped', v_skipped,
    'failed', v_failed, 'failures', v_failures);
  PERFORM app_private.remember(p_idempotency_key, 'import_products', v_result);
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION app_private.product_for(public.users, public.products) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app_private.check_price_above_cost(public.products, NUMERIC) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app_private.check_product(public.users, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, INTEGER, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_product_costs() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_product_costs() TO authenticated;

NOTIFY pgrst, 'reload schema';
