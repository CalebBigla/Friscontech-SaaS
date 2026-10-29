-- ============================================================================
-- Fix invitee uploads to the onboarding-files bucket
-- ============================================================================
-- The anon storage policies from 20260118030000_onboarding_rpcs_and_storage.sql
-- check the folder against `SELECT o.id FROM public.onboardings o`. That
-- subquery runs as anon, and anon has no SELECT policy on onboardings since
-- 20260118020000_rls_hardening.sql, so it always returns nothing and every
-- invitee upload, preview and delete is refused ("new row violates row-level
-- security policy").
--
-- The same check now runs in a SECURITY DEFINER helper, so anon never needs to
-- read onboardings. The three anon policies are recreated with identical rules:
-- the first path segment must be an onboarding that is invited, in progress or
-- submitted, not revoked, not expired and without an account yet. The owner
-- policies, every other policy and all table grants are unchanged.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.onboarding_open_for_upload(p_folder TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.onboardings AS o
    WHERE o.id::TEXT = p_folder
      AND o.status IN ('invited', 'in_progress', 'submitted')
      AND o.token_revoked = FALSE
      AND o.token_expires_at > NOW()
      AND o.user_id IS NULL
  );
$$;

COMMENT ON FUNCTION public.onboarding_open_for_upload(TEXT) IS 'Storage policy helper: TRUE when the folder is an onboarding still open for invitee file changes. Returns only a boolean.';

REVOKE ALL ON FUNCTION public.onboarding_open_for_upload(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.onboarding_open_for_upload(TEXT) TO anon, authenticated;

DROP POLICY IF EXISTS onboarding_files_upload_anon ON storage.objects;
CREATE POLICY onboarding_files_upload_anon ON storage.objects
  FOR INSERT TO anon
  WITH CHECK (
    bucket_id = 'onboarding-files'
    AND public.onboarding_open_for_upload(split_part(name, '/', 1))
  );

DROP POLICY IF EXISTS onboarding_files_delete_anon ON storage.objects;
CREATE POLICY onboarding_files_delete_anon ON storage.objects
  FOR DELETE TO anon
  USING (
    bucket_id = 'onboarding-files'
    AND public.onboarding_open_for_upload(split_part(name, '/', 1))
  );

DROP POLICY IF EXISTS onboarding_files_read_anon ON storage.objects;
CREATE POLICY onboarding_files_read_anon ON storage.objects
  FOR SELECT TO anon
  USING (
    bucket_id = 'onboarding-files'
    AND public.onboarding_open_for_upload(split_part(name, '/', 1))
  );
