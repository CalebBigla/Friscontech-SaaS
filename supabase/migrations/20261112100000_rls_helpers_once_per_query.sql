-- RLS performance: evaluate the caller's role, tenant, branch and id once per
-- query instead of once per row.
--
-- The policies call get_user_role(), get_user_tenant_id(), get_user_branch_id()
-- (PL/pgSQL, SECURITY DEFINER, each a lookup in public.users) and auth.uid()
-- directly, so Postgres runs them for every row it checks: production showed
-- 283,105 sequential scans of the 6-row users table, and a local benchmark at a
-- few thousand rows spent 0.6-1.8 s per read on these calls. Wrapped as
-- (SELECT get_user_role()) the call becomes an InitPlan, evaluated once per
-- statement (the pattern Supabase's auth_rls_initplan advisor recommends).
--
-- The rewrite is mechanical: every policy in public and storage keeps its name,
-- command, roles and logic; only these four calls are wrapped. A call that is
-- already wrapped stays as it is. The helpers return the same value for the whole
-- statement (they read the caller's own users row), so results are unchanged.

-- Wraps each bare helper call in (SELECT ...). Calls Postgres already shows as
-- "( SELECT f() AS f)" are unwrapped first, so nothing is wrapped twice.
CREATE OR REPLACE FUNCTION app_private.wrap_rls_helpers(p_expr TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT pg_catalog.regexp_replace(
           pg_catalog.regexp_replace(p_expr,
             '\( SELECT ((public\.)?get_user_(role|tenant_id|branch_id)\(\)|auth\.uid\(\)) AS [a-z_]+\)', '\1', 'g'),
           '((public\.)?get_user_(role|tenant_id|branch_id)\(\)|auth\.uid\(\))', '(SELECT \1)', 'g')
$$;
REVOKE ALL ON FUNCTION app_private.wrap_rls_helpers(TEXT) FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  p RECORD;
  v_using TEXT;
  v_check TEXT;
  v_sql TEXT;
BEGIN
  FOR p IN
    SELECT n.nspname AS schemaname, c.relname AS tablename, pol.polname AS policyname,
           pg_catalog.pg_get_expr(pol.polqual, pol.polrelid) AS qual,
           pg_catalog.pg_get_expr(pol.polwithcheck, pol.polrelid) AS with_check
      FROM pg_catalog.pg_policy pol
      JOIN pg_catalog.pg_class c ON c.oid = pol.polrelid
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname IN ('public', 'storage')
  LOOP
    v_using := app_private.wrap_rls_helpers(p.qual);
    v_check := app_private.wrap_rls_helpers(p.with_check);
    IF v_using IS NOT DISTINCT FROM p.qual AND v_check IS NOT DISTINCT FROM p.with_check THEN CONTINUE; END IF;
    v_sql := pg_catalog.format('ALTER POLICY %I ON %I.%I', p.policyname, p.schemaname, p.tablename);
    IF v_using IS NOT NULL THEN v_sql := v_sql || ' USING (' || v_using || ')'; END IF;
    IF v_check IS NOT NULL THEN v_sql := v_sql || ' WITH CHECK (' || v_check || ')'; END IF;
    EXECUTE v_sql;
  END LOOP;
END;
$$;
