-- Branch reads are limited to the Owner's tenant-wide view or the active
-- user's own branch. Owner updates remain tenant-scoped. INSERT authorization
-- is handled by 20261020110000_secure_branch_rls.sql.

DO $preflight$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'branches' AND column_name = 'tenant_id'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'branches' AND column_name = 'manager_id'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'branches' AND column_name = 'status'
  ) THEN
    RAISE EXCEPTION 'Branch policy migration aborted: expected public.branches columns are missing.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid = 'public.branches'::regclass AND relrowsecurity) THEN
    RAISE EXCEPTION 'Branch policy migration aborted: RLS must remain enabled on public.branches.';
  END IF;
  IF to_regprocedure('public.get_user_role()') IS NULL
     OR to_regprocedure('public.get_user_tenant_id()') IS NULL
     OR to_regprocedure('public.get_user_branch_id()') IS NULL THEN
    RAISE EXCEPTION 'Branch policy migration aborted: active-user authorization helpers are missing.';
  END IF;
END;
$preflight$;

DROP POLICY IF EXISTS branches_select_tenant ON public.branches;
DROP POLICY IF EXISTS branches_select_tenant_guard ON public.branches;
DROP POLICY IF EXISTS branches_update_owner_tenant ON public.branches;
DROP POLICY IF EXISTS branches_update_owner_tenant_guard ON public.branches;
DROP POLICY IF EXISTS branches_select_owner_or_own_branch ON public.branches;
DROP POLICY IF EXISTS branches_select_owner_or_own_branch_guard ON public.branches;
DROP POLICY IF EXISTS branches_update_owner_tenant_only ON public.branches;
DROP POLICY IF EXISTS branches_update_owner_tenant_only_guard ON public.branches;

CREATE POLICY branches_select_owner_or_own_branch
  ON public.branches AS PERMISSIVE
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id()
    AND (
      public.get_user_role() = 'owner'
      OR id = public.get_user_branch_id()
    )
  );

CREATE POLICY branches_select_owner_or_own_branch_guard
  ON public.branches AS RESTRICTIVE
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id()
    AND (
      public.get_user_role() = 'owner'
      OR id = public.get_user_branch_id()
    )
  );

CREATE POLICY branches_update_owner_tenant_only
  ON public.branches AS PERMISSIVE
  FOR UPDATE TO authenticated
  USING (
    public.get_user_role() = 'owner'
    AND tenant_id = public.get_user_tenant_id()
  )
  WITH CHECK (
    public.get_user_role() = 'owner'
    AND tenant_id = public.get_user_tenant_id()
  );

CREATE POLICY branches_update_owner_tenant_only_guard
  ON public.branches AS RESTRICTIVE
  FOR UPDATE TO authenticated
  USING (
    public.get_user_role() = 'owner'
    AND tenant_id = public.get_user_tenant_id()
  )
  WITH CHECK (
    public.get_user_role() = 'owner'
    AND tenant_id = public.get_user_tenant_id()
  );

DROP POLICY IF EXISTS branches_delete_guard ON public.branches;
CREATE POLICY branches_delete_guard
  ON public.branches AS RESTRICTIVE
  FOR DELETE TO authenticated
  USING (false);

COMMENT ON POLICY branches_select_owner_or_own_branch ON public.branches IS
  'Active Owners can read tenant branches; other active users can read only their assigned branch.';
COMMENT ON POLICY branches_update_owner_tenant_only ON public.branches IS
  'Only an active Owner can update a branch in the Owner tenant.';
