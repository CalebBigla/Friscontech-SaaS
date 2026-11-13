-- Indexes that match how the app reads, fewer duplicate ones, and one duplicated
-- fact kept in sync.
--
-- Indexes (from live pg_stat_user_indexes, 13 Nov 2026):
--  * Dropped: four single-column indexes that repeat the first column of a unique
--    index on the same table, which already serves those lookups.
--      idx_inventory_branch  (branch_id)  ~ inventory_branch_product_unique (branch_id, product_id)
--      idx_batches_branch    (branch_id)  ~ stock_batches_lot_unique        (branch_id, product_id, ...)
--      idx_products_sku      (sku)        ~ products_tenant_sku_unique      (tenant_id, sku)
--      idx_sales_code        (code)       ~ sales_tenant_code_unique        (tenant_id, code)
--  * Replaced by composites for the app's actual queries (filter + newest first);
--    the single-column versions had 0 scans or are a prefix of the new one, so
--    they are dropped (the composite serves the same lookups):
--      activities          (tenant_id, created_at DESC)  audit log
--      sales               (tenant_id, sale_date DESC)   sales lists and reports
--      sales               (sales_rep_id, sale_date)     rep totals and targets by month
--      notifications       (recipient_id, created_at DESC) the bell, polled every 30 s
--      inventory_movements (tenant_id, created_at DESC)  stock movement history
--
-- Manager sync: users.manager_id repeats branches.manager_id for the branch's
-- storekeepers and reps. Appointing a manager updated the branch only, so staff
-- already in the branch kept no manager (one live record). A trigger now keeps
-- them in step, and existing records are corrected once.

DROP INDEX IF EXISTS public.idx_inventory_branch;
DROP INDEX IF EXISTS public.idx_batches_branch;
DROP INDEX IF EXISTS public.idx_products_sku;
DROP INDEX IF EXISTS public.idx_sales_code;

CREATE INDEX IF NOT EXISTS idx_activities_tenant_created ON public.activities (tenant_id, created_at DESC);
DROP INDEX IF EXISTS public.idx_activities_tenant;

CREATE INDEX IF NOT EXISTS idx_sales_tenant_date ON public.sales (tenant_id, sale_date DESC);
DROP INDEX IF EXISTS public.idx_sales_date;
DROP INDEX IF EXISTS public.idx_sales_tenant; -- a prefix of idx_sales_tenant_date

CREATE INDEX IF NOT EXISTS idx_sales_rep_date ON public.sales (sales_rep_id, sale_date);
DROP INDEX IF EXISTS public.idx_sales_rep;

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_created ON public.notifications (recipient_id, created_at DESC);
DROP INDEX IF EXISTS public.idx_notifications_recipient;

CREATE INDEX IF NOT EXISTS idx_movements_tenant_created ON public.inventory_movements (tenant_id, created_at DESC);
DROP INDEX IF EXISTS public.idx_movements_date;
DROP INDEX IF EXISTS public.idx_movements_tenant; -- a prefix of idx_movements_tenant_created

-- ----------------------------------------------------------------------------
-- Staff follow their branch's manager
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_private.sync_branch_staff_manager()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
BEGIN
  UPDATE public.users
     SET manager_id = NEW.manager_id
   WHERE branch_id = NEW.id AND role IN ('storekeeper', 'sales_rep')
     AND manager_id IS DISTINCT FROM NEW.manager_id;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION app_private.sync_branch_staff_manager() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS sync_branch_staff_manager ON public.branches;
CREATE TRIGGER sync_branch_staff_manager
  AFTER UPDATE OF manager_id ON public.branches
  FOR EACH ROW WHEN (OLD.manager_id IS DISTINCT FROM NEW.manager_id)
  EXECUTE FUNCTION app_private.sync_branch_staff_manager();

-- A storekeeper or rep who moves branch takes that branch's manager.
CREATE OR REPLACE FUNCTION app_private.staff_manager_from_branch()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
BEGIN
  IF NEW.role IN ('storekeeper', 'sales_rep') AND NEW.branch_id IS NOT NULL THEN
    NEW.manager_id := (SELECT manager_id FROM public.branches WHERE id = NEW.branch_id);
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION app_private.staff_manager_from_branch() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS staff_manager_from_branch ON public.users;
CREATE TRIGGER staff_manager_from_branch
  BEFORE INSERT OR UPDATE OF branch_id, role ON public.users
  FOR EACH ROW EXECUTE FUNCTION app_private.staff_manager_from_branch();

-- One-time correction of records that drifted before the triggers existed.
UPDATE public.users u
   SET manager_id = b.manager_id
  FROM public.branches b
 WHERE b.id = u.branch_id AND u.role IN ('storekeeper', 'sales_rep')
   AND u.manager_id IS DISTINCT FROM b.manager_id;
