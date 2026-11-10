-- Business records change only through the RPCs, never by writing a table directly.
--
-- Several permissive policies are FOR ALL (approvals_requester_own, the manager and
-- owner approval policies, stock_requests_rep_own, payments_rep_own, ...), so a
-- signed-in user could skip approve_requests / reject_request and, for example,
-- set their own approval request to 'approved' with a plain UPDATE. The RPCs are
-- SECURITY DEFINER and keep working; only direct writes from the API stop.
--
-- The app still writes these directly, so they keep the privilege they need:
--   branches       INSERT, UPDATE  (Owner; branches_*_owner_* policies)
--   onboardings    INSERT, UPDATE, DELETE  (Owner; onboardings_owner_all)
--   notifications  UPDATE  (marking one's own notification read)
--   sales          INSERT  (rep/owner, list price only: guard_direct_sale)
--   activities     INSERT  (one's own entries: activities_insert_own; create_audit_log
--                           and the sale audit trigger run as the caller)
-- Anonymous visitors (invite links) use RPCs only and get no table writes at all.
--
-- A table added later is granted ALL by Supabase's default privileges: revoke its
-- writes here too unless the app writes it directly.

DO $$
DECLARE
  v_table TEXT;
BEGIN
  -- Anonymous: no direct writes anywhere in public.
  FOR v_table IN SELECT c.oid::regclass::TEXT FROM pg_catalog.pg_class c
                  WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'v', 'p') LOOP
    EXECUTE pg_catalog.format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON %s FROM anon', v_table);
  END LOOP;

  -- Signed in: read-only tables (every change goes through an RPC).
  FOREACH v_table IN ARRAY ARRAY[
    'approval_requests', 'stock_requests', 'payments', 'customer_payments', 'expenses',
    'manager_remittances', 'owner_remittances', 'stock_batches', 'inventory_records',
    'inventory_movements', 'targets', 'customers', 'products', 'tenants', 'users',
    'user_preferences', 'onboarding_files', 'low_stock_items', 'expiring_stock'
  ] LOOP
    IF pg_catalog.to_regclass('public.' || v_table) IS NOT NULL THEN
      EXECUTE pg_catalog.format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.%I FROM authenticated', v_table);
    END IF;
  END LOOP;

  -- Signed in: only the writes the app makes.
  REVOKE UPDATE, DELETE, TRUNCATE ON public.sales FROM authenticated;
  REVOKE DELETE, TRUNCATE ON public.branches FROM authenticated;
  REVOKE INSERT, DELETE, TRUNCATE ON public.notifications FROM authenticated;
  REVOKE UPDATE, DELETE, TRUNCATE ON public.activities FROM authenticated;
  REVOKE TRUNCATE ON public.onboardings FROM authenticated;
END;
$$;

NOTIFY pgrst, 'reload schema';
