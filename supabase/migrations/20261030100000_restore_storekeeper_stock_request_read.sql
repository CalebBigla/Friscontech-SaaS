-- Storekeepers read their branch's stock requests again.
--
-- stock_requests_storekeeper_branch (20260114190000) is missing on the live
-- database, so a storekeeper saw none of the reps' requests. It comes back
-- read-only and tenant scoped: approve, reject and fulfil already go through
-- the SECURITY DEFINER RPCs (20261023110000), which check the same branch.
DROP POLICY IF EXISTS stock_requests_storekeeper_branch ON public.stock_requests;
CREATE POLICY stock_requests_storekeeper_branch ON public.stock_requests AS PERMISSIVE
  FOR SELECT TO authenticated
  USING (public.get_user_role() = 'storekeeper'
    AND tenant_id = public.get_user_tenant_id()
    AND branch_id = public.get_user_branch_id());
