-- Limit branch inserts to the authenticated active Owner's tenant.
-- Keep existing SELECT, UPDATE and DELETE policies unchanged.
-- The restrictive guard makes this authorization mandatory even if another
-- permissive INSERT policy is present (permissive policies are OR-combined).

DROP POLICY IF EXISTS branches_insert_owner_tenant
  ON public.branches;
DROP POLICY IF EXISTS branches_insert_owner_tenant_guard
  ON public.branches;

CREATE POLICY branches_insert_owner_tenant
  ON public.branches AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (
    public.get_user_role() = 'owner'
    AND tenant_id = public.get_user_tenant_id()
  );

CREATE POLICY branches_insert_owner_tenant_guard
  ON public.branches AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (
    public.get_user_role() = 'owner'
    AND tenant_id = public.get_user_tenant_id()
  );

COMMENT ON POLICY branches_insert_owner_tenant ON public.branches IS
  'Only an authenticated active Owner can create a branch in the Owner tenant.';
