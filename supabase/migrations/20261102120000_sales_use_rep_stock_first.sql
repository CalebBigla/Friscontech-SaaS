-- Stock was deducted twice: once when a storekeeper issued units to a rep and again
-- when the rep sold them. Issued units have already left the branch, so a sale now
-- uses the rep's issued units first and takes only the rest from the branch.
-- quantity_from_rep_stock records the split, so held stock is issued minus used.
-- A sale taken wholly from the rep's units writes no movement: branch stock did not
-- change, and the stock_issued movement already recorded those units leaving.

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS quantity_from_rep_stock INTEGER NOT NULL DEFAULT 0 CHECK (quantity_from_rep_stock >= 0);
ALTER TABLE public.sales
  ADD CONSTRAINT sales_rep_stock_within_quantity CHECK (quantity_from_rep_stock <= quantity);
COMMENT ON COLUMN public.sales.quantity_from_rep_stock IS 'Units of this line taken from stock already issued to the rep; the rest came from the branch';

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

-- BEFORE, so the split is stored on the row and can't be set by the caller.
DROP TRIGGER IF EXISTS sale_inventory_deduction ON public.sales;
CREATE TRIGGER sale_inventory_deduction
  BEFORE INSERT OR UPDATE ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.process_sale_inventory();
