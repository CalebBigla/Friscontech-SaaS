-- Migration: Fix RLS recursion on the users table
-- Created: 2026-01-19
-- Problem: get_user_tenant_id() / get_user_role() / get_user_branch_id() query
--          public.users, which is protected by the users_select_tenant policy,
--          which itself calls get_user_tenant_id() → infinite recursion → 400.
-- Fix: The SECURITY DEFINER helpers bypass RLS via SET row_security = off so they
--      can read the users table without triggering the policy they are used inside.
--      A dedicated self-read policy lets every authenticated user see their own row
--      without going through get_user_tenant_id(), breaking the cycle.

-- ============================================================================
-- 1. REBUILD THE THREE HELPER FUNCTIONS WITH row_security = off
-- ============================================================================
-- SECURITY DEFINER runs as the function owner (postgres / service role).
-- SET row_security = off inside the function bypasses RLS for that one query,
-- so the function can read users without hitting the policy that calls it.

CREATE OR REPLACE FUNCTION public.get_user_tenant_id()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_tenant_id UUID;
BEGIN
  -- Bypass RLS so this helper doesn't re-enter the policy that calls it.
  SET LOCAL row_security = off;
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
AS $$
DECLARE
  v_role TEXT;
BEGIN
  SET LOCAL row_security = off;
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
AS $$
DECLARE
  v_branch_id UUID;
BEGIN
  SET LOCAL row_security = off;
  SELECT branch_id INTO v_branch_id
  FROM public.users
  WHERE id = auth.uid() AND status = 'active';
  RETURN v_branch_id;
END;
$$;

COMMENT ON FUNCTION public.get_user_tenant_id IS 'Returns tenant_id for the authenticated active user. Bypasses RLS internally to avoid recursion.';
COMMENT ON FUNCTION public.get_user_role IS 'Returns role for the authenticated active user. Bypasses RLS internally to avoid recursion.';
COMMENT ON FUNCTION public.get_user_branch_id IS 'Returns branch_id for the authenticated active user. Bypasses RLS internally to avoid recursion.';

-- ============================================================================
-- 2. ADD A SELF-READ POLICY SO EVERY USER CAN SEE THEIR OWN ROW
-- ============================================================================
-- This is the policy auth-context uses to load the profile on sign-in.
-- It must NOT call get_user_tenant_id() (that would recurse); it simply checks
-- id = auth.uid() which is a direct auth reference with no table lookup.

DROP POLICY IF EXISTS users_select_self ON users;
CREATE POLICY users_select_self ON users
  FOR SELECT
  USING (id = auth.uid());

-- The existing users_select_tenant policy stays for listing team members
-- (owner/manager browsing the team list). It now works because get_user_tenant_id()
-- no longer triggers recursion.

-- ============================================================================
-- 3. ALSO FIX owner_account_exists() — currently anon can't call it if the
--    function itself hits any user table policy (it uses SET row_security = off
--    already but let's make it explicit).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.owner_account_exists()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exists BOOLEAN;
BEGIN
  SET LOCAL row_security = off;
  SELECT EXISTS(SELECT 1 FROM public.users WHERE role = 'owner') INTO v_exists;
  RETURN v_exists;
END;
$$;

COMMENT ON FUNCTION public.owner_account_exists IS 'Public: true if an owner profile already exists (sign-up gate). Safe for anon callers.';
