-- Fix: the RLS helper functions used SET LOCAL row_security = off in their
-- bodies. PostgreSQL rejects SET inside STABLE functions with SQLSTATE 0A000,
-- which caused profile SELECTs to return HTTP 400 when users_select_tenant
-- evaluated get_user_tenant_id(). Attach row_security as a function-level
-- setting instead; PostgreSQL restores it when each function exits.

CREATE OR REPLACE FUNCTION public.get_user_tenant_id()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_tenant_id UUID;
BEGIN
  SELECT tenant_id INTO v_tenant_id
  FROM public.users
  WHERE id = auth.uid() AND status = 'active';
  RETURN v_tenant_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_role TEXT;
BEGIN
  SELECT role INTO v_role
  FROM public.users
  WHERE id = auth.uid() AND status = 'active';
  RETURN v_role;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_user_branch_id()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_branch_id UUID;
BEGIN
  SELECT branch_id INTO v_branch_id
  FROM public.users
  WHERE id = auth.uid() AND status = 'active';
  RETURN v_branch_id;
END;
$$;

COMMENT ON FUNCTION public.get_user_tenant_id IS 'Returns tenant_id for the authenticated active user. Uses SECURITY DEFINER and function-scoped row_security=off to avoid users policy recursion.';
COMMENT ON FUNCTION public.get_user_role IS 'Returns role for the authenticated active user. Uses SECURITY DEFINER and function-scoped row_security=off to avoid users policy recursion.';
COMMENT ON FUNCTION public.get_user_branch_id IS 'Returns branch_id for the authenticated active user. Uses SECURITY DEFINER and function-scoped row_security=off to avoid users policy recursion.';
