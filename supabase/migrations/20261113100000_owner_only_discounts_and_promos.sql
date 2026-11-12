-- Discounts and promo items are the Owner's to give.
--
-- A rep records sales at list price: record_sale refuses a discount or a promo line
-- from a rep (a BEFORE INSERT guard, so record_sale itself is unchanged). The Owner
-- can then, on any completed sale:
--   apply_sale_discount  set, change or clear the discount on one sold line
--   add_sale_promo       add promo items to that sale's order
-- Both keep the sale with its rep, so the rep's target counts the line total after
-- the discount, and promo lines stay out of revenue as before. Stock for promo lines
-- moves through the existing sale trigger (rep's issued stock first, then branch).

-- ----------------------------------------------------------------------------
-- Reps: list price only
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_private.guard_rep_discount()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
BEGIN
  IF (COALESCE(NEW.discount_amount, 0) > 0 OR NEW.is_promo)
     AND EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'sales_rep') THEN
    PERFORM app_private.fail('Only the Owner can give discounts and promo items. Record the sale at list price.', 'items');
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION app_private.guard_rep_discount() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_rep_discount ON public.sales;
CREATE TRIGGER guard_rep_discount
  BEFORE INSERT ON public.sales
  FOR EACH ROW EXECUTE FUNCTION app_private.guard_rep_discount();

-- ----------------------------------------------------------------------------
-- Owner: discount on a sold line
-- ----------------------------------------------------------------------------
-- p_discount_value NULL or 0 clears the discount.
CREATE OR REPLACE FUNCTION public.apply_sale_discount(p_sale_id UUID, p_discount_type TEXT, p_discount_value NUMERIC)
RETURNS public.sales
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
DECLARE
  v_actor public.users := app_private.actor();
  v_sale public.sales;
  v_gross NUMERIC;
  v_type TEXT := NULLIF(p_discount_type, '');
  v_value NUMERIC := NULLIF(p_discount_value, 0);
  v_amount NUMERIC := 0;
BEGIN
  IF v_actor.role <> 'owner' THEN PERFORM app_private.deny('Only the Owner can give discounts'); END IF;
  SELECT * INTO v_sale FROM public.sales WHERE id = p_sale_id AND tenant_id = v_actor.tenant_id FOR UPDATE;
  IF NOT FOUND THEN PERFORM app_private.fail('Sale not found', 'form'); END IF;
  IF v_sale.status <> 'completed' THEN PERFORM app_private.fail('Only a completed sale can be discounted', 'form'); END IF;
  IF v_sale.is_promo THEN PERFORM app_private.fail('Promo items are already free', 'form'); END IF;

  v_gross := v_sale.quantity * v_sale.unit_price;
  IF v_value < 0 THEN PERFORM app_private.fail('A discount cannot be negative', 'discount'); END IF;
  IF v_value IS NULL THEN
    v_type := NULL;
  ELSIF v_type = 'percent' THEN
    IF v_value > 100 THEN PERFORM app_private.fail('A discount cannot be more than 100%', 'discount'); END IF;
    v_amount := ROUND(v_gross * v_value / 100, 2);
  ELSIF v_type = 'amount' THEN
    v_amount := ROUND(v_value, 2);
    IF v_amount > v_gross THEN PERFORM app_private.fail('The discount is more than the line total', 'discount'); END IF;
  ELSE
    PERFORM app_private.fail('Choose a percentage or an amount for the discount', 'discountType');
  END IF;

  UPDATE public.sales
     SET discount_type = v_type, discount_value = v_value, discount_amount = v_amount, updated_at = pg_catalog.now()
   WHERE id = v_sale.id RETURNING * INTO v_sale;
  PERFORM app_private.audit(v_actor,
    CASE WHEN v_amount > 0 THEN 'Sale discount applied' ELSE 'Sale discount removed' END,
    (SELECT name FROM public.products WHERE id = v_sale.product_id) || ' · ' || app_private.full_name(v_sale.sales_rep_id)
      || CASE WHEN v_amount > 0 THEN ' · ₦' || pg_catalog.to_char(v_amount, 'FM999,999,999,990.00') || ' off' ELSE '' END,
    'sale', v_sale.id::TEXT, pg_catalog.jsonb_build_object('saleId', v_sale.id, 'repId', v_sale.sales_rep_id));
  RETURN v_sale;
END;
$$;

-- ----------------------------------------------------------------------------
-- Owner: promo items on a sale's order
-- ----------------------------------------------------------------------------
-- p_items: [{ "product_id": uuid, "quantity": int }], promo products only.
CREATE OR REPLACE FUNCTION public.add_sale_promo(p_sale_id UUID, p_items JSONB)
RETURNS SETOF public.sales
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
DECLARE
  v_actor public.users := app_private.actor();
  v_sale public.sales;
  v_order UUID;
  v_item JSONB;
  v_product public.products;
  v_qty INTEGER;
  v_row public.sales;
  v_rows JSONB := '[]'::JSONB;
BEGIN
  IF v_actor.role <> 'owner' THEN PERFORM app_private.deny('Only the Owner can give promo items'); END IF;
  SELECT * INTO v_sale FROM public.sales WHERE id = p_sale_id AND tenant_id = v_actor.tenant_id FOR UPDATE;
  IF NOT FOUND THEN PERFORM app_private.fail('Sale not found', 'form'); END IF;
  IF v_sale.status <> 'completed' OR v_sale.is_promo THEN
    PERFORM app_private.fail('Add promo items to a completed sale of a product', 'form');
  END IF;
  IF p_items IS NULL OR pg_catalog.jsonb_typeof(p_items) <> 'array' OR pg_catalog.jsonb_array_length(p_items) = 0 THEN
    PERFORM app_private.fail('Add at least one promo item', 'items');
  END IF;
  -- Sales recorded before orders existed get one now, shared with the promo lines.
  v_order := v_sale.order_id;
  IF v_order IS NULL THEN
    v_order := gen_random_uuid();
    UPDATE public.sales SET order_id = v_order WHERE id = v_sale.id;
  END IF;

  FOR v_item IN SELECT * FROM pg_catalog.jsonb_array_elements(p_items) LOOP
    SELECT * INTO v_product FROM public.products
     WHERE id = NULLIF(v_item ->> 'product_id', '')::UUID AND tenant_id = v_actor.tenant_id;
    IF NOT FOUND THEN PERFORM app_private.fail('Select a promo item for every line', 'items'); END IF;
    IF v_product.product_type <> 'promo' THEN PERFORM app_private.fail(v_product.name || ' is not a promo item', 'items'); END IF;
    IF v_product.status <> 'active' THEN PERFORM app_private.fail(v_product.name || ' is inactive', 'items'); END IF;
    v_qty := (v_item ->> 'quantity')::INTEGER;
    IF v_qty IS NULL OR v_qty <= 0 OR (v_item ->> 'quantity')::NUMERIC <> v_qty THEN
      PERFORM app_private.fail('Enter a whole quantity above zero for ' || v_product.name, 'items');
    END IF;
    INSERT INTO public.sales (tenant_id, code, branch_id, sales_rep_id, product_id, customer_id, order_id, quantity, unit_price,
                              sale_date, walk_in_name, walk_in_phone, status, is_promo)
    VALUES (v_sale.tenant_id, 'SAL-' || gen_random_uuid()::TEXT, v_sale.branch_id, v_sale.sales_rep_id, v_product.id,
            v_sale.customer_id, v_order, v_qty, 0, v_sale.sale_date, v_sale.walk_in_name, v_sale.walk_in_phone, 'completed', TRUE)
    RETURNING * INTO v_row;
    v_rows := v_rows || pg_catalog.to_jsonb(v_row);
  END LOOP;

  PERFORM app_private.audit(v_actor, 'Promo items added to a sale',
    pg_catalog.jsonb_array_length(v_rows) || ' item(s) · ' || app_private.full_name(v_sale.sales_rep_id),
    'sale', v_sale.id::TEXT, pg_catalog.jsonb_build_object('saleId', v_sale.id, 'repId', v_sale.sales_rep_id));
  RETURN QUERY SELECT * FROM pg_catalog.jsonb_populate_recordset(NULL::public.sales, v_rows);
END;
$$;

REVOKE ALL ON FUNCTION public.apply_sale_discount(UUID, TEXT, NUMERIC) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.add_sale_promo(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_sale_discount(UUID, TEXT, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_sale_promo(UUID, JSONB) TO authenticated;

NOTIFY pgrst, 'reload schema';
