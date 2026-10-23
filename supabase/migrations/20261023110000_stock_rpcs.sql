-- ============================================================================
-- STOCK, STOCK REQUEST AND APPROVAL RPCs
-- ============================================================================
-- Contract: src/lib/rpc.ts. Each function runs in one transaction, checks the
-- caller's active profile (role, tenant, branch) with the app's rules, raises
-- invalid input with the form field in HINT, and writes the audit row.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- add_stock: owner applies at once; storekeeper needs manager approval unless
-- it is an emergency (applied now, reviewed afterwards).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.add_stock(
  p_branch_id UUID,
  p_product_id UUID,
  p_quantity INTEGER,
  p_note TEXT,
  p_batch_number TEXT,
  p_expiry_date DATE,
  p_emergency BOOLEAN,
  p_emergency_reason TEXT,
  p_idempotency_key UUID DEFAULT NULL
)
RETURNS public.approval_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
DECLARE
  v_actor public.users := app_private.actor();
  v_branch public.branches;
  v_product public.products;
  v_owner BOOLEAN := v_actor.role = 'owner';
  v_emergency BOOLEAN := COALESCE(p_emergency, FALSE) AND v_actor.role = 'storekeeper';
  v_apply BOOLEAN;
  v_row public.approval_requests;
  v_prior JSONB := app_private.replay(p_idempotency_key, 'add_stock');
  v_label TEXT;
BEGIN
  IF v_prior IS NOT NULL THEN
    RETURN pg_catalog.jsonb_populate_record(NULL::public.approval_requests, v_prior);
  END IF;
  IF v_actor.role NOT IN ('owner', 'storekeeper') THEN
    PERFORM app_private.deny('Only the owner or a storekeeper can add stock');
  END IF;

  SELECT * INTO v_branch FROM public.branches WHERE id = p_branch_id AND tenant_id = v_actor.tenant_id;
  IF NOT FOUND THEN PERFORM app_private.fail('Select a branch', 'branchId'); END IF;
  IF v_branch.status <> 'active' THEN PERFORM app_private.fail('Stock can only be added to active branches', 'branchId'); END IF;
  IF NOT v_owner AND v_branch.id IS DISTINCT FROM v_actor.branch_id THEN
    PERFORM app_private.fail('You can only add stock to your branch', 'branchId');
  END IF;

  SELECT * INTO v_product FROM public.products WHERE id = p_product_id AND tenant_id = v_actor.tenant_id;
  IF NOT FOUND THEN PERFORM app_private.fail('Select a product', 'productId'); END IF;
  IF v_product.status <> 'active' THEN
    PERFORM app_private.fail('This product is inactive — reactivate it before adding stock', 'productId');
  END IF;
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    PERFORM app_private.fail('Enter a whole number greater than zero', 'quantity');
  END IF;
  IF p_expiry_date IS NULL THEN PERFORM app_private.fail('Enter the expiry date', 'expiryDate'); END IF;
  IF v_emergency AND LENGTH(TRIM(COALESCE(p_emergency_reason, ''))) < 5 THEN
    PERFORM app_private.fail('Explain why this addition can''t wait for approval', 'emergencyReason');
  END IF;

  v_apply := v_owner OR v_emergency;
  v_label := v_branch.name || ' · ' || v_product.name;

  INSERT INTO public.approval_requests (
    tenant_id, type, status, branch_id, requested_by, requested_at, reviewed_by, reviewed_at,
    note, emergency, emergency_reason, applied_at, product_id, quantity, batch_number, expiry_date
  ) VALUES (
    v_actor.tenant_id, 'stock_addition', CASE WHEN v_owner THEN 'approved' ELSE 'pending' END,
    v_branch.id, v_actor.id, pg_catalog.now(),
    CASE WHEN v_owner THEN v_actor.id END, CASE WHEN v_owner THEN pg_catalog.now() END,
    NULLIF(TRIM(p_note), ''), v_emergency, CASE WHEN v_emergency THEN TRIM(p_emergency_reason) END,
    CASE WHEN v_apply THEN pg_catalog.now() END, v_product.id, p_quantity,
    NULLIF(TRIM(p_batch_number), ''), p_expiry_date
  ) RETURNING * INTO v_row;

  IF v_apply THEN
    PERFORM app_private.apply_stock(
      v_actor.tenant_id, v_branch.id, v_product.id, p_quantity, 'stock_added', 'manual', v_row.id::TEXT,
      v_actor.id,
      CASE WHEN v_emergency THEN 'EMERGENCY: ' || TRIM(p_emergency_reason) ELSE p_note END,
      p_batch_number, p_expiry_date);
  END IF;

  PERFORM app_private.audit(
    v_actor,
    CASE WHEN v_owner THEN 'Stock added' WHEN v_emergency THEN 'Emergency stock added' ELSE 'Stock addition submitted' END,
    v_label || ' · +' || p_quantity || CASE WHEN v_owner OR v_emergency THEN '' ELSE ' awaiting manager approval' END,
    'inventory', v_row.id::TEXT,
    pg_catalog.jsonb_build_object('branchId', v_branch.id, 'productId', v_product.id),
    v_emergency);

  PERFORM app_private.remember(p_idempotency_key, 'add_stock', pg_catalog.to_jsonb(v_row));
  RETURN v_row;
END;
$$;

-- ----------------------------------------------------------------------------
-- adjust_stock: count correction to the counted quantity.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.adjust_stock(
  p_inventory_id UUID,
  p_counted_quantity INTEGER,
  p_reason TEXT
)
RETURNS public.inventory_records
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
DECLARE
  v_actor public.users := app_private.actor();
  v_record public.inventory_records;
  v_label TEXT;
BEGIN
  SELECT * INTO v_record FROM public.inventory_records
   WHERE id = p_inventory_id AND tenant_id = v_actor.tenant_id FOR UPDATE;
  IF NOT FOUND
     OR v_actor.role NOT IN ('owner', 'storekeeper')
     OR (v_actor.role = 'storekeeper' AND v_record.branch_id IS DISTINCT FROM v_actor.branch_id) THEN
    PERFORM app_private.deny('You cannot adjust this stock record');
  END IF;
  IF p_counted_quantity IS NULL OR p_counted_quantity < 0 THEN
    PERFORM app_private.fail('Enter a whole number of zero or more', 'quantity');
  END IF;
  IF p_counted_quantity = v_record.quantity_on_hand THEN
    PERFORM app_private.fail('Counted quantity matches current stock', 'quantity');
  END IF;
  IF TRIM(COALESCE(p_reason, '')) = '' THEN
    PERFORM app_private.fail('Give a reason for the adjustment', 'reason');
  END IF;

  SELECT b.name || ' · ' || p.name INTO v_label
    FROM public.branches b, public.products p
   WHERE b.id = v_record.branch_id AND p.id = v_record.product_id;

  PERFORM app_private.audit(v_actor, 'Stock adjusted',
    v_label || ' · ' || v_record.quantity_on_hand || ' → ' || p_counted_quantity,
    'inventory', v_record.id::TEXT,
    pg_catalog.jsonb_build_object('branchId', v_record.branch_id, 'productId', v_record.product_id, 'reason', TRIM(p_reason)));

  RETURN app_private.apply_stock(
    v_record.tenant_id, v_record.branch_id, v_record.product_id,
    p_counted_quantity - v_record.quantity_on_hand, 'adjustment', 'manual', NULL, v_actor.id, TRIM(p_reason));
END;
$$;

-- ----------------------------------------------------------------------------
-- create_stock_requests: sales rep requests one or more products.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_stock_requests(
  p_branch_id UUID,
  p_items JSONB,
  p_note TEXT,
  p_idempotency_key UUID DEFAULT NULL
)
RETURNS SETOF public.stock_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
DECLARE
  v_actor public.users := app_private.actor();
  v_branch public.branches;
  v_item JSONB;
  v_product public.products;
  v_qty INTEGER;
  v_seen UUID[] := '{}';
  v_batch UUID;
  v_row public.stock_requests;
  v_rows JSONB := '[]'::JSONB;
  v_prior JSONB := app_private.replay(p_idempotency_key, 'create_stock_requests');
  v_count INTEGER;
BEGIN
  IF v_prior IS NOT NULL THEN
    RETURN QUERY SELECT * FROM pg_catalog.jsonb_populate_recordset(NULL::public.stock_requests, v_prior);
    RETURN;
  END IF;
  IF v_actor.role <> 'sales_rep' THEN
    PERFORM app_private.deny('Only sales representatives can submit stock requests');
  END IF;
  SELECT * INTO v_branch FROM public.branches WHERE id = p_branch_id AND tenant_id = v_actor.tenant_id;
  IF NOT FOUND OR v_branch.status <> 'active' THEN PERFORM app_private.fail('Select an active branch', 'branchId'); END IF;
  IF v_branch.id IS DISTINCT FROM v_actor.branch_id THEN
    PERFORM app_private.fail('You can only request stock for your own branch', 'branchId');
  END IF;
  IF p_items IS NULL OR pg_catalog.jsonb_typeof(p_items) <> 'array' OR pg_catalog.jsonb_array_length(p_items) = 0 THEN
    PERFORM app_private.fail('Add at least one product', 'items');
  END IF;

  -- Validate every item before writing anything.
  FOR v_item IN SELECT * FROM pg_catalog.jsonb_array_elements(p_items) LOOP
    SELECT * INTO v_product FROM public.products
     WHERE id = NULLIF(v_item ->> 'product_id', '')::UUID AND tenant_id = v_actor.tenant_id;
    IF NOT FOUND THEN PERFORM app_private.fail('Select a product for every item', 'items'); END IF;
    IF v_product.status <> 'active' THEN
      PERFORM app_private.fail(v_product.name || ' is inactive and cannot be requested', 'items');
    END IF;
    IF v_product.id = ANY (v_seen) THEN
      PERFORM app_private.fail(v_product.name || ' is already in the request', 'items');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.inventory_records WHERE branch_id = v_branch.id AND product_id = v_product.id) THEN
      PERFORM app_private.fail('This branch does not stock ' || v_product.name, 'items');
    END IF;
    v_qty := (v_item ->> 'quantity')::INTEGER;
    IF v_qty IS NULL OR v_qty <= 0 OR (v_item ->> 'quantity')::NUMERIC <> v_qty THEN
      PERFORM app_private.fail('Enter a whole number greater than zero for ' || v_product.name, 'items');
    END IF;
    v_seen := v_seen || v_product.id;
  END LOOP;

  v_count := pg_catalog.array_length(v_seen, 1);
  IF v_count > 1 THEN v_batch := gen_random_uuid(); END IF;

  FOR v_item IN SELECT * FROM pg_catalog.jsonb_array_elements(p_items) LOOP
    INSERT INTO public.stock_requests (id, tenant_id, branch_id, rep_id, product_id, quantity_requested,
                                       batch_id, priority, status, requested_at, note)
    VALUES (app_private.next_id('SR', 'app_private.stock_request_seq', 'public.stock_requests'),
            v_actor.tenant_id, v_branch.id, v_actor.id, (v_item ->> 'product_id')::UUID,
            (v_item ->> 'quantity')::INTEGER, v_batch, 'Normal', 'pending', pg_catalog.now(),
            NULLIF(TRIM(p_note), ''))
    RETURNING * INTO v_row;
    v_rows := v_rows || pg_catalog.to_jsonb(v_row);
    PERFORM app_private.audit(v_actor, 'Stock request submitted',
      v_row.id || ' · ' || v_branch.name || ' · ' || (SELECT name FROM public.products WHERE id = v_row.product_id)
        || ' · ' || v_row.quantity_requested || ' units',
      'stock_request', v_row.id, pg_catalog.jsonb_build_object('branchId', v_branch.id, 'productId', v_row.product_id));
  END LOOP;

  INSERT INTO public.notifications (tenant_id, recipient_id, type, entity_type, entity_id, message)
  SELECT v_actor.tenant_id, u.id, 'stock_request_submitted', 'stock_request', (v_rows -> 0 ->> 'id'),
         app_private.full_name(v_actor.id) || ' requested ' || v_count || ' item' || CASE WHEN v_count > 1 THEN 's' ELSE '' END
         || ' · ' || (v_rows -> 0 ->> 'id')
    FROM public.users u
   WHERE u.tenant_id = v_actor.tenant_id AND u.branch_id = v_branch.id
     AND u.role = 'storekeeper' AND u.status = 'active';

  PERFORM app_private.remember(p_idempotency_key, 'create_stock_requests', v_rows);
  RETURN QUERY SELECT * FROM pg_catalog.jsonb_populate_recordset(NULL::public.stock_requests, v_rows);
END;
$$;

-- Shared check: the storekeeper of the request's branch.
CREATE OR REPLACE FUNCTION app_private.reviewable_request(p_actor public.users, p_request_id TEXT)
RETURNS public.stock_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
DECLARE
  v_row public.stock_requests;
BEGIN
  SELECT * INTO v_row FROM public.stock_requests
   WHERE id = p_request_id AND tenant_id = p_actor.tenant_id FOR UPDATE;
  IF NOT FOUND THEN PERFORM app_private.fail('Stock request not found'); END IF;
  IF p_actor.role <> 'storekeeper' OR v_row.branch_id IS DISTINCT FROM p_actor.branch_id THEN
    PERFORM app_private.deny('You don''t have permission for this action');
  END IF;
  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION app_private.reviewable_request(public.users, TEXT) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.approve_stock_request(p_request_id TEXT)
RETURNS public.stock_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
DECLARE
  v_actor public.users := app_private.actor();
  v_row public.stock_requests := app_private.reviewable_request(v_actor, p_request_id);
BEGIN
  IF v_row.status <> 'pending' THEN PERFORM app_private.fail('Only pending requests can be approved'); END IF;
  -- Approval never touches stock (nothing is reserved).
  UPDATE public.stock_requests
     SET status = 'approved', quantity_approved = quantity_requested, approved_at = pg_catalog.now(),
         approved_by = v_actor.id, processed_by = v_actor.id
   WHERE id = v_row.id RETURNING * INTO v_row;
  PERFORM app_private.notify(v_row.tenant_id, v_row.rep_id, 'stock_request_approved', 'stock_request', v_row.id,
    v_row.id || ' was approved and is waiting to be issued');
  PERFORM app_private.audit(v_actor, 'Stock request approved', v_row.id, 'stock_request', v_row.id,
    pg_catalog.jsonb_build_object('branchId', v_row.branch_id, 'productId', v_row.product_id));
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_stock_request(p_request_id TEXT, p_reason TEXT)
RETURNS public.stock_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
DECLARE
  v_actor public.users := app_private.actor();
  v_row public.stock_requests := app_private.reviewable_request(v_actor, p_request_id);
BEGIN
  IF v_row.status <> 'pending' THEN PERFORM app_private.fail('Only pending requests can be rejected'); END IF;
  IF TRIM(COALESCE(p_reason, '')) = '' THEN PERFORM app_private.fail('A rejection reason is required', 'reason'); END IF;
  UPDATE public.stock_requests
     SET status = 'rejected', rejected_at = pg_catalog.now(), processed_by = v_actor.id,
         rejection_reason = TRIM(p_reason)
   WHERE id = v_row.id RETURNING * INTO v_row;
  PERFORM app_private.notify(v_row.tenant_id, v_row.rep_id, 'stock_request_rejected', 'stock_request', v_row.id,
    v_row.id || ' was rejected: ' || v_row.rejection_reason);
  PERFORM app_private.audit(v_actor, 'Stock request rejected', v_row.id || ' · ' || v_row.rejection_reason,
    'stock_request', v_row.id, pg_catalog.jsonb_build_object('branchId', v_row.branch_id));
  RETURN v_row;
END;
$$;

-- The only step that deducts stock for a request.
CREATE OR REPLACE FUNCTION public.fulfil_stock_request(p_request_id TEXT, p_quantity INTEGER)
RETURNS public.stock_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
DECLARE
  v_actor public.users := app_private.actor();
  v_row public.stock_requests := app_private.reviewable_request(v_actor, p_request_id);
  v_target INTEGER;
  v_outstanding INTEGER;
  v_fulfilled INTEGER;
  v_rep TEXT;
BEGIN
  IF v_row.status NOT IN ('approved', 'partially_fulfilled') THEN
    PERFORM app_private.fail('Only approved requests can be fulfilled');
  END IF;
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    PERFORM app_private.fail('Enter a whole number greater than zero', 'quantity');
  END IF;
  v_target := COALESCE(v_row.quantity_approved, v_row.quantity_requested);
  v_outstanding := v_target - COALESCE(v_row.quantity_fulfilled, 0);
  IF p_quantity > v_outstanding THEN
    PERFORM app_private.fail('Only ' || v_outstanding || ' units are outstanding on this request', 'quantity');
  END IF;

  v_rep := app_private.full_name(v_row.rep_id);
  PERFORM app_private.apply_stock(v_row.tenant_id, v_row.branch_id, v_row.product_id, -p_quantity,
    'stock_issued', 'stock_request', v_row.id, v_actor.id, 'Issued to ' || v_rep);

  v_fulfilled := COALESCE(v_row.quantity_fulfilled, 0) + p_quantity;
  UPDATE public.stock_requests
     SET quantity_fulfilled = v_fulfilled,
         status = CASE WHEN v_fulfilled >= v_target THEN 'fulfilled' ELSE 'partially_fulfilled' END,
         fulfilled_at = pg_catalog.now(), fulfilled_by = v_actor.id, processed_by = v_actor.id
   WHERE id = v_row.id RETURNING * INTO v_row;

  PERFORM app_private.notify(v_row.tenant_id, v_row.rep_id, 'stock_request_fulfilled', 'stock_request', v_row.id,
    CASE WHEN v_row.status = 'fulfilled' THEN v_row.id || ' is ready: ' || p_quantity || ' units issued to you'
         ELSE v_row.id || ': ' || p_quantity || ' units issued, more to follow' END);
  PERFORM app_private.audit(v_actor,
    CASE WHEN v_row.status = 'fulfilled' THEN 'Stock request fulfilled' ELSE 'Stock request partially fulfilled' END,
    v_row.id || ' · ' || p_quantity || ' units to ' || v_rep, 'stock_request', v_row.id,
    pg_catalog.jsonb_build_object('branchId', v_row.branch_id, 'productId', v_row.product_id, 'quantity', p_quantity));
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.acknowledge_stock_request(p_request_id TEXT)
RETURNS public.stock_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
DECLARE
  v_actor public.users := app_private.actor();
  v_row public.stock_requests;
BEGIN
  SELECT * INTO v_row FROM public.stock_requests
   WHERE id = p_request_id AND tenant_id = v_actor.tenant_id FOR UPDATE;
  IF NOT FOUND THEN PERFORM app_private.fail('Stock request not found'); END IF;
  IF v_actor.role <> 'sales_rep' OR v_row.rep_id <> v_actor.id THEN
    PERFORM app_private.deny('Only the requesting sales rep can acknowledge receipt');
  END IF;
  IF v_row.status <> 'fulfilled' THEN PERFORM app_private.fail('Only fulfilled requests can be acknowledged'); END IF;
  IF v_row.acknowledged_at IS NOT NULL THEN PERFORM app_private.fail('Receipt was already acknowledged'); END IF;
  UPDATE public.stock_requests SET acknowledged_at = pg_catalog.now(), acknowledged_by = v_actor.id
   WHERE id = v_row.id RETURNING * INTO v_row;
  PERFORM app_private.audit(v_actor, 'Stock request acknowledged',
    v_row.id || ' · ' || COALESCE(v_row.quantity_fulfilled, 0) || ' units received', 'stock_request', v_row.id,
    pg_catalog.jsonb_build_object('branchId', v_row.branch_id));
  RETURN v_row;
END;
$$;

-- ----------------------------------------------------------------------------
-- Approvals: owner reviews everything; a manager reviews stock additions and
-- product deactivations of their branch. Nobody reviews their own request.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_private.can_review(p_actor public.users, p_request public.approval_requests)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $$
  -- COALESCE: a NULL comparison must mean "no", never "unknown".
  SELECT COALESCE(
       p_request.tenant_id = p_actor.tenant_id
       AND p_request.requested_by <> p_actor.id
       AND (p_actor.role = 'owner'
            OR (p_actor.role = 'manager' AND p_request.type <> 'team_member'
                AND p_request.branch_id IS NOT NULL AND p_request.branch_id = p_actor.branch_id)),
     FALSE);
$$;
REVOKE ALL ON FUNCTION app_private.can_review(public.users, public.approval_requests) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.approve_requests(p_request_ids UUID[])
RETURNS SETOF public.approval_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
DECLARE
  v_actor public.users := app_private.actor();
  v_ids UUID[];
  v_row public.approval_requests;
  v_product public.products;
  v_label TEXT;
BEGIN
  SELECT pg_catalog.array_agg(DISTINCT x) INTO v_ids FROM pg_catalog.unnest(p_request_ids) x;
  IF v_ids IS NULL THEN PERFORM app_private.fail('Select at least one pending approval'); END IF;
  IF (SELECT pg_catalog.count(*) FROM public.approval_requests WHERE id = ANY (v_ids)) <> pg_catalog.array_length(v_ids, 1) THEN
    PERFORM app_private.fail('One or more requests no longer exist');
  END IF;

  -- Check every request before applying any (all or nothing).
  FOR v_row IN SELECT * FROM public.approval_requests WHERE id = ANY (v_ids) ORDER BY requested_at FOR UPDATE LOOP
    IF v_row.status <> 'pending' OR NOT app_private.can_review(v_actor, v_row) THEN
      PERFORM app_private.fail('A selected request is no longer eligible for approval');
    END IF;
    SELECT * INTO v_product FROM public.products WHERE id = v_row.product_id;
    IF v_row.type = 'product_deactivation' AND v_product.status IS DISTINCT FROM 'active' THEN
      PERFORM app_private.fail('A selected product is already inactive');
    END IF;
    IF v_row.type = 'stock_addition' AND NOT COALESCE(v_row.emergency, FALSE) AND v_product.status IS DISTINCT FROM 'active' THEN
      PERFORM app_private.fail('A selected product is inactive — stock can''t be added');
    END IF;
    IF v_row.type = 'team_member' AND EXISTS (
      SELECT 1 FROM public.users u WHERE LOWER(u.email) = LOWER(v_row.member_data ->> 'email')) THEN
      PERFORM app_private.fail('Someone on the team already uses this email');
    END IF;
  END LOOP;

  FOR v_row IN SELECT * FROM public.approval_requests WHERE id = ANY (v_ids) ORDER BY requested_at LOOP
    v_label := COALESCE((SELECT name FROM public.products WHERE id = v_row.product_id), v_row.member_data ->> 'name', '');

    IF v_row.type = 'stock_addition' AND NOT COALESCE(v_row.emergency, FALSE) THEN
      PERFORM app_private.apply_stock(v_row.tenant_id, v_row.branch_id, v_row.product_id, v_row.quantity,
        'stock_added', 'manual', v_row.id::TEXT, v_row.requested_by,
        COALESCE(v_row.note || ' · approved', 'Approved stock addition'), v_row.batch_number, v_row.expiry_date);
    ELSIF v_row.type = 'product_deactivation' THEN
      UPDATE public.products SET status = 'inactive', updated_at = pg_catalog.now() WHERE id = v_row.product_id;
    END IF;
    -- team_member: the decision only. The member joins through an onboarding
    -- invite (users.id must be an auth account).

    UPDATE public.approval_requests
       SET status = 'approved', reviewed_by = v_actor.id, reviewed_at = pg_catalog.now(),
           applied_at = CASE WHEN type = 'stock_addition' AND NOT COALESCE(emergency, FALSE) THEN pg_catalog.now() ELSE applied_at END
     WHERE id = v_row.id RETURNING * INTO v_row;

    PERFORM app_private.audit(v_actor,
      CASE v_row.type
        WHEN 'stock_addition' THEN CASE WHEN v_row.emergency THEN 'Emergency stock addition reviewed' ELSE 'Stock addition approved' END
        WHEN 'product_deactivation' THEN 'Product deactivation approved'
        ELSE 'Team member request approved' END,
      v_label || CASE WHEN v_row.type = 'stock_addition' THEN ' · +' || v_row.quantity ELSE '' END,
      CASE v_row.type WHEN 'stock_addition' THEN 'inventory' WHEN 'product_deactivation' THEN 'product' ELSE 'team_member' END,
      v_row.id::TEXT,
      pg_catalog.jsonb_build_object('branchId', v_row.branch_id, 'productId', v_row.product_id),
      COALESCE(v_row.emergency, FALSE));
    RETURN NEXT v_row;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_request(p_request_id UUID, p_reason TEXT)
RETURNS public.approval_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
DECLARE
  v_actor public.users := app_private.actor();
  v_row public.approval_requests;
BEGIN
  SELECT * INTO v_row FROM public.approval_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN PERFORM app_private.fail('Request not found'); END IF;
  IF NOT app_private.can_review(v_actor, v_row) THEN PERFORM app_private.deny('You can''t review this request'); END IF;
  IF v_row.status <> 'pending' THEN PERFORM app_private.fail('This request was already reviewed'); END IF;
  IF LENGTH(TRIM(COALESCE(p_reason, ''))) < 3 THEN PERFORM app_private.fail('A rejection reason is required', 'reason'); END IF;
  UPDATE public.approval_requests
     SET status = 'rejected', reviewed_by = v_actor.id, reviewed_at = pg_catalog.now(), rejection_reason = TRIM(p_reason)
   WHERE id = v_row.id RETURNING * INTO v_row;
  PERFORM app_private.audit(v_actor,
    CASE v_row.type
      WHEN 'stock_addition' THEN CASE WHEN v_row.emergency THEN 'Emergency stock addition rejected' ELSE 'Stock addition rejected' END
      WHEN 'product_deactivation' THEN 'Product deactivation rejected'
      ELSE 'Team member request rejected' END,
    v_row.rejection_reason,
    CASE v_row.type WHEN 'stock_addition' THEN 'inventory' WHEN 'product_deactivation' THEN 'product' ELSE 'team_member' END,
    v_row.id::TEXT, pg_catalog.jsonb_build_object('branchId', v_row.branch_id), COALESCE(v_row.emergency, FALSE));
  RETURN v_row;
END;
$$;

-- ----------------------------------------------------------------------------
-- Execute: signed-in users only (Supabase grants new functions to anon too).
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_fn TEXT;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.add_stock(UUID, UUID, INTEGER, TEXT, TEXT, DATE, BOOLEAN, TEXT, UUID)',
    'public.adjust_stock(UUID, INTEGER, TEXT)',
    'public.create_stock_requests(UUID, JSONB, TEXT, UUID)',
    'public.approve_stock_request(TEXT)',
    'public.reject_stock_request(TEXT, TEXT)',
    'public.fulfil_stock_request(TEXT, INTEGER)',
    'public.acknowledge_stock_request(TEXT)',
    'public.approve_requests(UUID[])',
    'public.reject_request(UUID, TEXT)'
  ] LOOP
    EXECUTE pg_catalog.format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', v_fn);
    EXECUTE pg_catalog.format('GRANT EXECUTE ON FUNCTION %s TO authenticated', v_fn);
  END LOOP;
END;
$$;
