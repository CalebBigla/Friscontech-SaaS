-- ============================================================================
-- TARGET, PRODUCT, TEAM AND SETTINGS RPCs
-- ============================================================================
-- Contract: src/lib/rpc.ts. set_product_status keeps its signature but now
-- follows the app rules: owner or manager may deactivate, owner, manager or
-- storekeeper may reactivate, and an audit row is written.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Targets (owner)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_private.check_target_rep(p_actor public.users, p_rep_id UUID)
RETURNS public.users
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
DECLARE
  v_rep public.users;
BEGIN
  SELECT * INTO v_rep FROM public.users WHERE id = p_rep_id AND tenant_id = p_actor.tenant_id;
  IF NOT FOUND THEN PERFORM app_private.fail('Select a sales representative', 'repId'); END IF;
  IF v_rep.role IS DISTINCT FROM 'sales_rep' THEN PERFORM app_private.fail('Targets can only be set for sales representatives', 'repId'); END IF;
  IF v_rep.status <> 'active' THEN PERFORM app_private.fail('This sales representative is inactive', 'repId'); END IF;
  IF v_rep.branch_id IS NULL THEN PERFORM app_private.fail('This sales representative has no branch', 'repId'); END IF;
  RETURN v_rep;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_target(p_rep_id UUID, p_month TEXT, p_amount NUMERIC)
RETURNS public.targets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
DECLARE
  v_actor public.users := app_private.actor();
  v_rep public.users;
  v_row public.targets;
BEGIN
  IF v_actor.role <> 'owner' THEN PERFORM app_private.deny('You cannot set targets'); END IF;
  v_rep := app_private.check_target_rep(v_actor, p_rep_id);
  IF COALESCE(p_month !~ '^\d{4}-(0[1-9]|1[0-2])$', TRUE) THEN PERFORM app_private.fail('Select a month', 'month'); END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN PERFORM app_private.fail('Enter a target above zero', 'amount'); END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_rep.id::TEXT || p_month, 0));
  IF EXISTS (SELECT 1 FROM public.targets WHERE scope = 'rep' AND user_id = v_rep.id AND month = p_month) THEN
    PERFORM app_private.fail('This rep already has a target for that month — edit it instead', 'repId');
  END IF;
  INSERT INTO public.targets (tenant_id, scope, branch_id, user_id, month, amount)
  VALUES (v_actor.tenant_id, 'rep', v_rep.branch_id, v_rep.id, p_month, ROUND(p_amount))
  RETURNING * INTO v_row;
  PERFORM app_private.audit(v_actor, 'Target created',
    app_private.full_name(v_rep.id) || ' · ' || p_month || ' · ₦' || pg_catalog.to_char(v_row.amount, 'FM999,999,999,990'),
    'target', v_row.id::TEXT, pg_catalog.jsonb_build_object('branchId', v_row.branch_id));
  RETURN v_row;
END;
$$;

-- Only the amount changes; sales history is never touched.
CREATE OR REPLACE FUNCTION public.update_target_amount(p_target_id UUID, p_amount NUMERIC)
RETURNS public.targets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
DECLARE
  v_actor public.users := app_private.actor();
  v_row public.targets;
  v_old NUMERIC;
BEGIN
  IF v_actor.role <> 'owner' THEN PERFORM app_private.deny('You cannot edit targets'); END IF;
  SELECT * INTO v_row FROM public.targets WHERE id = p_target_id AND tenant_id = v_actor.tenant_id AND scope = 'rep' FOR UPDATE;
  IF NOT FOUND THEN PERFORM app_private.fail('Target not found'); END IF;
  PERFORM app_private.check_target_rep(v_actor, v_row.user_id);
  IF p_amount IS NULL OR p_amount <= 0 THEN PERFORM app_private.fail('Enter a target above zero', 'amount'); END IF;
  v_old := v_row.amount;
  UPDATE public.targets SET amount = ROUND(p_amount), updated_at = pg_catalog.now() WHERE id = v_row.id RETURNING * INTO v_row;
  PERFORM app_private.audit(v_actor, 'Target updated',
    app_private.full_name(v_row.user_id) || ' · ' || v_row.month || ' · ₦' || pg_catalog.to_char(v_old, 'FM999,999,999,990')
      || ' → ₦' || pg_catalog.to_char(v_row.amount, 'FM999,999,999,990'),
    'target', v_row.id::TEXT, pg_catalog.jsonb_build_object('branchId', v_row.branch_id));
  RETURN v_row;
END;
$$;

-- ----------------------------------------------------------------------------
-- Products (owner and storekeeper manage the catalogue)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_private.check_product(
  p_actor public.users, p_name TEXT, p_sku TEXT, p_category TEXT, p_unit TEXT,
  p_unit_price NUMERIC, p_unit_cost NUMERIC, p_threshold INTEGER, p_editing UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
BEGIN
  IF TRIM(COALESCE(p_name, '')) = '' THEN PERFORM app_private.fail('Enter a product name', 'name'); END IF;
  IF TRIM(COALESCE(p_sku, '')) = '' THEN PERFORM app_private.fail('Enter a SKU', 'sku'); END IF;
  IF EXISTS (SELECT 1 FROM public.products WHERE tenant_id = p_actor.tenant_id AND id IS DISTINCT FROM p_editing
                                              AND UPPER(sku) = UPPER(TRIM(p_sku))) THEN
    PERFORM app_private.fail('This SKU is already used by another product', 'sku');
  END IF;
  IF TRIM(COALESCE(p_category, '')) = '' THEN PERFORM app_private.fail('Enter a category', 'category'); END IF;
  IF TRIM(COALESCE(p_unit, '')) = '' THEN PERFORM app_private.fail('Select a unit', 'unit'); END IF;
  IF p_unit_price IS NULL OR p_unit_price <= 0 THEN PERFORM app_private.fail('Enter a selling price above zero', 'unitPrice'); END IF;
  IF p_unit_cost IS NULL OR p_unit_cost < 0 THEN PERFORM app_private.fail('Enter a unit cost of zero or more', 'unitCost'); END IF;
  IF p_unit_cost > p_unit_price THEN PERFORM app_private.fail('Unit cost cannot exceed selling price', 'unitCost'); END IF;
  IF p_threshold IS NULL OR p_threshold < 0 THEN PERFORM app_private.fail('Enter a whole number of zero or more', 'threshold'); END IF;
END;
$$;

-- New product: zero-stock records in the caller's branches (owner: all active).
CREATE OR REPLACE FUNCTION app_private.insert_product(
  p_actor public.users, p_name TEXT, p_sku TEXT, p_category TEXT, p_unit TEXT,
  p_unit_price NUMERIC, p_unit_cost NUMERIC, p_threshold INTEGER, p_description TEXT
)
RETURNS public.products
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
DECLARE
  v_row public.products;
BEGIN
  INSERT INTO public.products (tenant_id, name, sku, category, unit, unit_price, unit_cost, low_stock_threshold, description, status)
  VALUES (p_actor.tenant_id, TRIM(p_name), UPPER(TRIM(p_sku)), TRIM(p_category), TRIM(p_unit), p_unit_price, p_unit_cost,
          p_threshold, NULLIF(TRIM(p_description), ''), 'active')
  RETURNING * INTO v_row;
  INSERT INTO public.inventory_records (tenant_id, branch_id, product_id, quantity_on_hand, quantity_reserved,
                                        low_stock_threshold, reorder_level)
  SELECT p_actor.tenant_id, b.id, v_row.id, 0, 0, p_threshold, p_threshold * 2
    FROM public.branches b
   WHERE b.tenant_id = p_actor.tenant_id
     AND ((p_actor.role = 'owner' AND b.status = 'active') OR (p_actor.role <> 'owner' AND b.id = p_actor.branch_id))
  ON CONFLICT (branch_id, product_id) DO NOTHING;
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_product(
  p_name TEXT, p_sku TEXT, p_category TEXT, p_unit TEXT, p_unit_price NUMERIC, p_unit_cost NUMERIC,
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
BEGIN
  IF v_actor.role NOT IN ('owner', 'storekeeper') THEN PERFORM app_private.deny('You cannot add products'); END IF;
  PERFORM app_private.check_product(v_actor, p_name, p_sku, p_category, p_unit, p_unit_price, p_unit_cost, p_low_stock_threshold, NULL);
  v_row := app_private.insert_product(v_actor, p_name, p_sku, p_category, p_unit, p_unit_price, p_unit_cost, p_low_stock_threshold, p_description);
  PERFORM app_private.audit(v_actor, 'Product created', v_row.name || ' · ' || v_row.sku, 'product', v_row.id::TEXT,
    pg_catalog.jsonb_build_object('productId', v_row.id));
  RETURN v_row;
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
  v_old_threshold INTEGER;
BEGIN
  IF v_actor.role NOT IN ('owner', 'storekeeper') THEN PERFORM app_private.deny('You cannot edit products'); END IF;
  SELECT * INTO v_row FROM public.products WHERE id = p_product_id AND tenant_id = v_actor.tenant_id FOR UPDATE;
  IF NOT FOUND THEN PERFORM app_private.fail('Product not found'); END IF;
  PERFORM app_private.check_product(v_actor, p_name, p_sku, p_category, p_unit, p_unit_price, p_unit_cost, p_low_stock_threshold, v_row.id);
  v_old_threshold := v_row.low_stock_threshold;
  UPDATE public.products
     SET name = TRIM(p_name), sku = UPPER(TRIM(p_sku)), category = TRIM(p_category), unit = TRIM(p_unit),
         unit_price = p_unit_price, unit_cost = p_unit_cost, low_stock_threshold = p_low_stock_threshold,
         description = NULLIF(TRIM(p_description), ''), updated_at = pg_catalog.now()
   WHERE id = v_row.id RETURNING * INTO v_row;
  -- Branch thresholds still on the old product default follow the new one.
  UPDATE public.inventory_records SET low_stock_threshold = p_low_stock_threshold
   WHERE product_id = v_row.id AND low_stock_threshold = v_old_threshold;
  PERFORM app_private.audit(v_actor, 'Product edited', v_row.name || ' · ' || v_row.sku, 'product', v_row.id::TEXT,
    pg_catalog.jsonb_build_object('productId', v_row.id));
  RETURN v_row;
END;
$$;

-- Same signature as 20261020130000_reconcile_core_table_rls.sql; widened to the app rules.
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
  RETURN v_product;
END;
$$;
ALTER FUNCTION public.set_product_status(UUID, TEXT) OWNER TO postgres;
COMMENT ON FUNCTION public.set_product_status(UUID, TEXT) IS
  'Owner/manager deactivate; owner/manager/storekeeper reactivate. Status only; price, cost and SKU are not exposed.';

-- Storekeeper asks their manager to deactivate a product.
CREATE OR REPLACE FUNCTION public.request_product_deactivation(p_product_id UUID, p_reason TEXT)
RETURNS public.approval_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
DECLARE
  v_actor public.users := app_private.actor();
  v_product public.products;
  v_row public.approval_requests;
BEGIN
  IF v_actor.role <> 'storekeeper' THEN PERFORM app_private.deny('You cannot request product deactivation'); END IF;
  SELECT * INTO v_product FROM public.products WHERE id = p_product_id AND tenant_id = v_actor.tenant_id FOR UPDATE;
  IF NOT FOUND THEN PERFORM app_private.fail('Product not found'); END IF;
  IF v_product.status <> 'active' THEN PERFORM app_private.fail('This product is already inactive'); END IF;
  IF EXISTS (SELECT 1 FROM public.approval_requests
              WHERE type = 'product_deactivation' AND status = 'pending' AND product_id = v_product.id) THEN
    PERFORM app_private.fail('A deactivation request for this product is already pending');
  END IF;
  IF LENGTH(TRIM(COALESCE(p_reason, ''))) < 3 THEN PERFORM app_private.fail('Give a reason for the manager', 'reason'); END IF;
  INSERT INTO public.approval_requests (tenant_id, type, status, branch_id, requested_by, requested_at, product_id, note)
  VALUES (v_actor.tenant_id, 'product_deactivation', 'pending', v_actor.branch_id, v_actor.id, pg_catalog.now(),
          v_product.id, TRIM(p_reason))
  RETURNING * INTO v_row;
  PERFORM app_private.audit(v_actor, 'Product deactivation requested', v_product.name || ' · ' || v_row.note, 'product',
    v_row.id::TEXT, pg_catalog.jsonb_build_object('productId', v_product.id, 'branchId', v_actor.branch_id));
  RETURN v_row;
END;
$$;

-- Bulk import in one transaction. Rows: see src/lib/rpc.ts.
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
  v_row JSONB;
  v_existing public.products;
  v_product public.products;
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
  IF p_mode NOT IN ('update', 'skip') THEN PERFORM app_private.fail('Choose how to handle existing SKUs'); END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.jsonb_array_elements(COALESCE(p_rows, '[]'::JSONB)) r WHERE (r ->> 'opening_quantity')::INTEGER > 0)
     AND NOT EXISTS (SELECT 1 FROM public.branches b WHERE b.id = p_branch_id AND b.tenant_id = v_actor.tenant_id AND b.status = 'active'
                       AND (v_actor.role = 'owner' OR b.id = v_actor.branch_id)) THEN
    PERFORM app_private.fail('Choose one of your active branches for opening stock');
  END IF;

  FOR v_row IN SELECT * FROM pg_catalog.jsonb_array_elements(COALESCE(p_rows, '[]'::JSONB)) LOOP
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
      PERFORM app_private.check_product(v_actor, v_row ->> 'name', v_row ->> 'sku', v_row ->> 'category', v_row ->> 'unit',
        (v_row ->> 'unit_price')::NUMERIC, (v_row ->> 'unit_cost')::NUMERIC, (v_row ->> 'low_stock_threshold')::INTEGER, v_existing.id);
      IF v_qty > 0 AND NULLIF(v_row ->> 'expiry_date', '') IS NULL THEN
        PERFORM app_private.fail('Opening stock needs an expiry date');
      END IF;
      IF v_existing.id IS NOT NULL THEN
        UPDATE public.products
           SET name = TRIM(v_row ->> 'name'), sku = UPPER(TRIM(v_row ->> 'sku')), category = TRIM(v_row ->> 'category'),
               unit = TRIM(v_row ->> 'unit'), unit_price = (v_row ->> 'unit_price')::NUMERIC,
               unit_cost = (v_row ->> 'unit_cost')::NUMERIC, low_stock_threshold = (v_row ->> 'low_stock_threshold')::INTEGER,
               description = NULLIF(TRIM(v_row ->> 'description'), ''), updated_at = pg_catalog.now()
         WHERE id = v_existing.id RETURNING * INTO v_product;
        v_updated := v_updated + 1;
        PERFORM app_private.audit(v_actor, 'Product updated', v_product.name || ' · ' || v_product.sku || ' · via import',
          'product', v_product.id::TEXT, NULL);
      ELSE
        v_product := app_private.insert_product(v_actor, v_row ->> 'name', v_row ->> 'sku', v_row ->> 'category', v_row ->> 'unit',
          (v_row ->> 'unit_price')::NUMERIC, (v_row ->> 'unit_cost')::NUMERIC, (v_row ->> 'low_stock_threshold')::INTEGER,
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

-- ----------------------------------------------------------------------------
-- Team (owner: everyone but themselves; manager: their branch's storekeepers and reps)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_private.can_edit_member(p_actor public.users, p_member public.users)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $$
  -- COALESCE: a NULL comparison (e.g. no manager_id) must mean "no", never "unknown".
  SELECT COALESCE(
       p_member.tenant_id = p_actor.tenant_id
       AND p_member.id <> p_actor.id
       AND COALESCE(p_member.role, '') <> 'owner'
       AND (p_actor.role = 'owner'
            OR (p_actor.role = 'manager' AND p_member.role IN ('storekeeper', 'sales_rep')
                AND (COALESCE(p_member.manager_id = p_actor.id, FALSE)
                     OR COALESCE(p_member.branch_id = p_actor.branch_id, FALSE)))),
     FALSE);
$$;

CREATE OR REPLACE FUNCTION app_private.check_member_assignment(
  p_actor public.users, p_role TEXT, p_branch_id UUID, p_status TEXT, p_editing public.users
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
DECLARE
  v_branch public.branches;
BEGIN
  IF p_role IS NULL OR NOT COALESCE(p_role = ANY (CASE p_actor.role WHEN 'owner' THEN ARRAY['manager', 'storekeeper', 'sales_rep']
                                          WHEN 'manager' THEN ARRAY['storekeeper', 'sales_rep']
                                          ELSE ARRAY[]::TEXT[] END)
          OR p_role IS NOT DISTINCT FROM p_editing.role, FALSE) THEN
    PERFORM app_private.fail('You can''t assign this role.', 'role');
  END IF;
  IF p_branch_id IS NULL THEN
    PERFORM app_private.fail('Select the branch this member works at.', 'branchId');
  END IF;
  SELECT * INTO v_branch FROM public.branches WHERE id = p_branch_id AND tenant_id = p_actor.tenant_id;
  IF NOT FOUND THEN PERFORM app_private.fail('Select a valid branch.', 'branchId'); END IF;
  IF p_actor.role = 'manager' AND v_branch.id IS DISTINCT FROM p_actor.branch_id THEN
    PERFORM app_private.fail('You can only assign members to your own branch.', 'branchId');
  END IF;
  IF v_branch.status <> 'active' AND p_status = 'active' THEN PERFORM app_private.fail('This branch is inactive.', 'branchId'); END IF;
  IF p_role = 'manager' AND v_branch.manager_id IS NOT NULL AND v_branch.manager_id IS DISTINCT FROM p_editing.id
     AND EXISTS (SELECT 1 FROM public.users WHERE id = v_branch.manager_id AND status = 'active') THEN
    PERFORM app_private.fail(v_branch.name || ' already has a manager.', 'branchId');
  END IF;
END;
$$;

-- Manager proposes a member; the owner approves, then sends an onboarding invite.
CREATE OR REPLACE FUNCTION public.request_team_member(p_name TEXT, p_email TEXT, p_role TEXT, p_branch_id UUID)
RETURNS public.approval_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
DECLARE
  v_actor public.users := app_private.actor();
  v_email TEXT := LOWER(TRIM(COALESCE(p_email, '')));
  v_row public.approval_requests;
BEGIN
  IF v_actor.role <> 'manager' THEN PERFORM app_private.deny('You don''t have permission to manage the team.'); END IF;
  IF LENGTH(TRIM(COALESCE(p_name, ''))) < 2 THEN PERFORM app_private.fail('Enter the member''s full name.', 'name'); END IF;
  IF v_email = '' THEN PERFORM app_private.fail('Email is required.', 'email'); END IF;
  IF v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' THEN PERFORM app_private.fail('Enter a valid email address.', 'email'); END IF;
  IF EXISTS (SELECT 1 FROM public.users WHERE LOWER(email) = v_email) THEN
    PERFORM app_private.fail('Someone on the team already uses this email.', 'email');
  END IF;
  IF EXISTS (SELECT 1 FROM public.approval_requests
              WHERE type = 'team_member' AND status = 'pending' AND LOWER(member_data ->> 'email') = v_email) THEN
    PERFORM app_private.fail('A request for this email is already waiting for approval.', 'email');
  END IF;
  PERFORM app_private.check_member_assignment(v_actor, p_role, p_branch_id, 'pending', NULL::public.users);
  INSERT INTO public.approval_requests (tenant_id, type, status, branch_id, requested_by, requested_at, member_data)
  VALUES (v_actor.tenant_id, 'team_member', 'pending', p_branch_id, v_actor.id, pg_catalog.now(),
          pg_catalog.jsonb_build_object('name', TRIM(p_name), 'email', v_email, 'role', p_role, 'branchId', p_branch_id))
  RETURNING * INTO v_row;
  PERFORM app_private.audit(v_actor, 'Team member request submitted', TRIM(p_name) || ' · ' || REPLACE(p_role, '_', ' '),
    'team_member', v_row.id::TEXT, pg_catalog.jsonb_build_object('branchId', p_branch_id));
  RETURN v_row;
END;
$$;

-- Email is verified at sign-up and never changes here.
CREATE OR REPLACE FUNCTION public.update_team_member(
  p_user_id UUID, p_first_name TEXT, p_last_name TEXT, p_role TEXT, p_branch_id UUID, p_status TEXT
)
RETURNS public.users
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
DECLARE
  v_actor public.users := app_private.actor();
  v_prev public.users;
  v_row public.users;
  v_manager UUID;
  v_name TEXT;
BEGIN
  SELECT * INTO v_prev FROM public.users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN PERFORM app_private.fail('Team member not found.'); END IF;
  IF NOT app_private.can_edit_member(v_actor, v_prev) THEN PERFORM app_private.deny('You can''t edit this team member.'); END IF;
  IF LENGTH(TRIM(CONCAT_WS(' ', p_first_name, p_last_name))) < 2 THEN
    PERFORM app_private.fail('Enter the member''s full name.', 'name');
  END IF;
  IF p_status NOT IN ('active', 'inactive', 'pending') THEN PERFORM app_private.fail('Choose a valid status.', 'status'); END IF;
  PERFORM app_private.check_member_assignment(v_actor, p_role, p_branch_id, p_status, v_prev);

  SELECT manager_id INTO v_manager FROM public.branches WHERE id = p_branch_id;
  UPDATE public.users
     SET first_name = TRIM(COALESCE(p_first_name, '')), last_name = TRIM(COALESCE(p_last_name, '')),
         role = p_role, branch_id = p_branch_id, status = p_status,
         manager_id = CASE WHEN p_role IN ('storekeeper', 'sales_rep') THEN v_manager END,
         deactivated_at = CASE WHEN p_status = 'inactive' THEN COALESCE(deactivated_at, pg_catalog.now()) END,
         updated_at = pg_catalog.now()
   WHERE id = v_prev.id RETURNING * INTO v_row;

  -- Keep branches.manager_id in sync with manager (re)assignment.
  IF v_prev.role = 'manager' AND (v_row.role <> 'manager' OR v_row.branch_id IS DISTINCT FROM v_prev.branch_id) THEN
    UPDATE public.branches SET manager_id = NULL WHERE manager_id = v_row.id;
    UPDATE public.users SET manager_id = NULL WHERE manager_id = v_row.id;
  END IF;
  IF v_row.role = 'manager' THEN
    UPDATE public.branches SET manager_id = v_row.id WHERE id = v_row.branch_id AND manager_id IS NULL;
    UPDATE public.users SET manager_id = v_row.id
     WHERE branch_id = v_row.branch_id AND role IN ('storekeeper', 'sales_rep')
       AND EXISTS (SELECT 1 FROM public.branches WHERE id = v_row.branch_id AND manager_id = v_row.id);
  END IF;

  v_name := app_private.full_name(v_row.id);
  PERFORM app_private.audit(v_actor, 'Team member edited', v_name, 'team_member', v_row.id::TEXT, NULL);
  IF v_prev.role IS DISTINCT FROM v_row.role THEN
    PERFORM app_private.audit(v_actor, 'Role changed',
      v_name || ' · ' || REPLACE(COALESCE(v_prev.role, 'none'), '_', ' ') || ' → ' || REPLACE(v_row.role, '_', ' '),
      'team_member', v_row.id::TEXT, NULL);
  END IF;
  IF v_prev.branch_id IS DISTINCT FROM v_row.branch_id THEN
    PERFORM app_private.audit(v_actor, 'Branch assignment changed',
      v_name || ' · ' || COALESCE((SELECT name FROM public.branches WHERE id = v_prev.branch_id), 'Unassigned')
        || ' → ' || COALESCE((SELECT name FROM public.branches WHERE id = v_row.branch_id), 'Unassigned'),
      'team_member', v_row.id::TEXT, NULL);
  END IF;
  IF v_prev.status IS DISTINCT FROM v_row.status THEN
    PERFORM app_private.audit(v_actor, CASE WHEN v_row.status = 'active' THEN 'Team member activated' ELSE 'Team member deactivated' END,
      v_name, 'team_member', v_row.id::TEXT, NULL);
  END IF;
  RETURN v_row;
END;
$$;

-- Soft (de)activation: sales, targets, requests and movements keep referencing the member.
CREATE OR REPLACE FUNCTION public.set_team_member_status(p_user_id UUID, p_status TEXT)
RETURNS public.users
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
DECLARE
  v_actor public.users := app_private.actor();
  v_row public.users;
BEGIN
  SELECT * INTO v_row FROM public.users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND OR NOT app_private.can_edit_member(v_actor, v_row) THEN
    PERFORM app_private.deny('You can''t change this member''s status.');
  END IF;
  IF p_status NOT IN ('active', 'inactive') THEN PERFORM app_private.fail('Choose a valid status.', 'status'); END IF;
  UPDATE public.users
     SET status = p_status,
         deactivated_at = CASE WHEN p_status = 'inactive' THEN pg_catalog.now() END,
         updated_at = pg_catalog.now()
   WHERE id = v_row.id RETURNING * INTO v_row;
  PERFORM app_private.audit(v_actor, CASE WHEN p_status = 'active' THEN 'Team member activated' ELSE 'Team member deactivated' END,
    app_private.full_name(v_row.id), 'team_member', v_row.id::TEXT, NULL);
  RETURN v_row;
END;
$$;

-- ----------------------------------------------------------------------------
-- Settings
-- ----------------------------------------------------------------------------
-- Owner: business profile. NULL leaves a field unchanged. Expiry alerts 1–12 months.
CREATE OR REPLACE FUNCTION public.update_tenant_settings(
  p_name TEXT, p_business_email TEXT, p_phone TEXT, p_timezone TEXT, p_legal_name TEXT, p_expiry_alert_months INTEGER
)
RETURNS public.tenants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
DECLARE
  v_actor public.users := app_private.actor();
  v_old public.tenants;
  v_row public.tenants;
  v_changed TEXT[] := '{}';
BEGIN
  IF v_actor.role <> 'owner' THEN PERFORM app_private.deny('Only the business owner can change these settings.'); END IF;
  IF p_name IS NOT NULL AND TRIM(p_name) = '' THEN PERFORM app_private.fail('Business name is required', 'name'); END IF;
  IF p_business_email IS NOT NULL AND TRIM(p_business_email) !~ '^\S+@\S+\.\S+$' THEN
    PERFORM app_private.fail('Enter a valid email', 'businessEmail');
  END IF;
  IF p_phone IS NOT NULL AND TRIM(p_phone) !~ '^\+?[0-9 -]{7,}$' THEN PERFORM app_private.fail('Enter a valid phone number', 'phone'); END IF;
  IF p_timezone IS NOT NULL AND p_timezone NOT IN ('Africa/Lagos', 'Africa/Accra', 'Africa/Nairobi', 'Africa/Johannesburg', 'Europe/London') THEN
    PERFORM app_private.fail('Select a timezone', 'timezone');
  END IF;
  IF p_legal_name IS NOT NULL AND TRIM(p_legal_name) = '' THEN PERFORM app_private.fail('Organization name is required', 'legalName'); END IF;
  IF p_expiry_alert_months IS NOT NULL AND (p_expiry_alert_months < 1 OR p_expiry_alert_months > 12) THEN
    PERFORM app_private.fail('Enter a whole number of months between 1 and 12');
  END IF;

  SELECT * INTO v_old FROM public.tenants WHERE id = v_actor.tenant_id FOR UPDATE;
  UPDATE public.tenants
     SET name = COALESCE(TRIM(p_name), name), business_email = COALESCE(TRIM(p_business_email), business_email),
         phone = COALESCE(TRIM(p_phone), phone), timezone = COALESCE(p_timezone, timezone),
         legal_name = COALESCE(TRIM(p_legal_name), legal_name),
         expiry_alert_months = COALESCE(p_expiry_alert_months, expiry_alert_months), updated_at = pg_catalog.now()
   WHERE id = v_actor.tenant_id RETURNING * INTO v_row;

  IF v_row.name IS DISTINCT FROM v_old.name THEN v_changed := v_changed || 'business name'::TEXT; END IF;
  IF v_row.business_email IS DISTINCT FROM v_old.business_email THEN v_changed := v_changed || 'business email'::TEXT; END IF;
  IF v_row.phone IS DISTINCT FROM v_old.phone THEN v_changed := v_changed || 'phone number'::TEXT; END IF;
  IF v_row.timezone IS DISTINCT FROM v_old.timezone THEN v_changed := v_changed || 'timezone'::TEXT; END IF;
  IF v_row.legal_name IS DISTINCT FROM v_old.legal_name THEN v_changed := v_changed || 'organization name'::TEXT; END IF;
  IF v_row.expiry_alert_months IS DISTINCT FROM v_old.expiry_alert_months THEN
    v_changed := v_changed || ('expiry alerts (' || v_row.expiry_alert_months || ' months)')::TEXT;
  END IF;
  IF pg_catalog.array_length(v_changed, 1) > 0 THEN
    PERFORM app_private.audit(v_actor, 'Settings updated', 'Updated ' || pg_catalog.array_to_string(v_changed, ', '),
      'settings', v_row.id::TEXT, NULL);
  END IF;
  RETURN v_row;
END;
$$;

-- The caller's own display preferences.
CREATE OR REPLACE FUNCTION public.update_preferences(p_date_format TEXT, p_default_report_period TEXT)
RETURNS public.user_preferences
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
DECLARE
  v_actor public.users := app_private.actor();
  v_row public.user_preferences;
BEGIN
  IF p_date_format NOT IN ('MMM D, YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD') THEN PERFORM app_private.fail('Choose a date format'); END IF;
  IF p_default_report_period NOT IN ('today', 'week', 'month', 'quarter') THEN PERFORM app_private.fail('Choose a report period'); END IF;
  INSERT INTO public.user_preferences (user_id, date_format, default_report_period)
  VALUES (v_actor.id, p_date_format, p_default_report_period)
  ON CONFLICT (user_id) DO UPDATE
     SET date_format = EXCLUDED.date_format, default_report_period = EXCLUDED.default_report_period, updated_at = pg_catalog.now()
  RETURNING * INTO v_row;
  PERFORM app_private.audit(v_actor, 'Preferences updated', 'Updated date format and default report period',
    'settings', v_actor.id::TEXT, NULL);
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
    'public.create_target(UUID, TEXT, NUMERIC)',
    'public.update_target_amount(UUID, NUMERIC)',
    'public.create_product(TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, INTEGER, TEXT)',
    'public.update_product(UUID, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, INTEGER, TEXT)',
    'public.set_product_status(UUID, TEXT)',
    'public.request_product_deactivation(UUID, TEXT)',
    'public.import_products(JSONB, TEXT, UUID, UUID)',
    'public.request_team_member(TEXT, TEXT, TEXT, UUID)',
    'public.update_team_member(UUID, TEXT, TEXT, TEXT, UUID, TEXT)',
    'public.set_team_member_status(UUID, TEXT)',
    'public.update_tenant_settings(TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER)',
    'public.update_preferences(TEXT, TEXT)'
  ] LOOP
    EXECUTE pg_catalog.format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', v_fn);
    EXECUTE pg_catalog.format('GRANT EXECUTE ON FUNCTION %s TO authenticated', v_fn);
  END LOOP;
END;
$$;
