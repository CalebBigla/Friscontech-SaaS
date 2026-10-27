-- ============================================================================
-- Refuse an onboarding submitted with an email that already has an account
-- ============================================================================
-- Sign-up with an email that is already registered (for example the owner's)
-- returns no error but creates no account, so the onboarding stayed submitted
-- with no linked user and could never be approved. submit_onboarding now refuses
-- such an email before the form is submitted. A resubmission after corrections
-- may keep the member's own account email. Every submission now clears the
-- owner's correction note (a member without an account yet kept it, which left
-- the link open after sign-up). Otherwise identical to
-- 20261026100000_onboarding_request_corrections.sql. No RLS policy or grant is
-- changed.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.submit_onboarding(
  p_token TEXT,
  p_data JSONB,
  p_email TEXT
)
RETURNS TABLE (id UUID, status TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hash TEXT := public.hash_token(p_token);
  v_onb RECORD;
  v_email TEXT := LOWER(TRIM(p_email));
  v_base TEXT;
  v_candidate TEXT;
  v_n INTEGER := 0;
  v_data JSONB := p_data;
BEGIN
  IF v_email IS NULL OR v_email = '' OR v_email !~ '^[^@]+@[^@]+\.[^@]+$' THEN
    RAISE EXCEPTION 'A valid email is required.';
  END IF;

  SELECT o.* INTO v_onb FROM public.onboardings AS o
  WHERE o.token_hash = v_hash
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid onboarding invitation.'; END IF;
  IF v_onb.token_revoked THEN RAISE EXCEPTION 'This onboarding invitation has been revoked.'; END IF;
  IF v_onb.token_expires_at < NOW() THEN RAISE EXCEPTION 'This onboarding invitation has expired.'; END IF;
  IF v_onb.user_id IS NOT NULL AND v_onb.correction_note IS NULL THEN RAISE EXCEPTION 'This onboarding invitation has already been used.'; END IF;
  IF v_onb.status NOT IN ('invited', 'in_progress', 'submitted') THEN
    RAISE EXCEPTION 'This onboarding can no longer be submitted.';
  END IF;

  -- A resubmission after corrections keeps the account's email.
  IF v_onb.user_id IS NOT NULL AND v_email IS DISTINCT FROM v_onb.submitter_email THEN
    RAISE EXCEPTION 'Use the email you registered with (%). It cannot be changed.', v_onb.submitter_email;
  END IF;

  -- The guarantor form must be complete, filled by the guarantor through their
  -- link or by the applicant on their behalf (submit_guarantor_on_behalf).
  IF v_onb.guarantor_status IS DISTINCT FROM 'completed' THEN
    RAISE EXCEPTION 'Your guarantor form is not complete yet. Send the link to your guarantor or fill it in on their behalf, then submit.';
  END IF;

  -- Refuse if another onboarding was already submitted with the same email and is pending review,
  -- to avoid duplicate accounts.
  IF EXISTS (
    SELECT 1 FROM public.onboardings AS other
    WHERE other.submitter_email = v_email AND other.status = 'submitted' AND other.id <> v_onb.id
  ) THEN
    RAISE EXCEPTION 'An onboarding submission for this email is already awaiting review.';
  END IF;

  -- An email that already has an account (e.g. the owner's) cannot be used: sign-up
  -- would silently create nothing, leaving a submission that can never be approved.
  IF EXISTS (
    SELECT 1 FROM auth.users AS au
    WHERE LOWER(au.email) = v_email AND au.id IS DISTINCT FROM v_onb.user_id
  ) OR EXISTS (
    SELECT 1 FROM public.users AS pu
    WHERE LOWER(pu.email) = v_email AND pu.id IS DISTINCT FROM v_onb.user_id
  ) THEN
    RAISE EXCEPTION 'An account with this email already exists. Use your own email address.';
  END IF;

  -- Company e-mail ID: first to submit keeps firstname.surname, later ones get 01, 02, …
  v_base := REGEXP_REPLACE(LOWER(COALESCE(
              NULLIF(p_data ->> 'preferredEmailId', ''),
              CONCAT_WS('.', NULLIF(p_data ->> 'firstName', ''), NULLIF(p_data ->> 'lastName', '')))),
            '[^a-z0-9.]', '', 'g');
  v_base := TRIM(BOTH '.' FROM v_base);
  IF v_base <> '' THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(v_onb.tenant_id::TEXT || ':' || v_base, 0));
    LOOP
      v_candidate := v_base || CASE WHEN v_n = 0 THEN '' ELSE LPAD(v_n::TEXT, 2, '0') END;
      EXIT WHEN NOT EXISTS (
        SELECT 1 FROM public.onboardings AS other
        WHERE other.tenant_id = v_onb.tenant_id
          AND other.id <> v_onb.id
          AND other.status IN ('submitted', 'approved')
          AND other.data ->> 'preferredEmailId' = v_candidate
      );
      v_n := v_n + 1;
    END LOOP;
    v_data := jsonb_set(p_data, '{preferredEmailId}', to_jsonb(v_candidate));
  END IF;

  UPDATE public.onboardings AS o
  SET data = v_data,
      status = 'submitted',
      submitter_email = v_email,
      submitted_at = NOW(),
      -- A resubmission after corrections closes the link again.
      -- Submitting answers any corrections request.
      correction_note = NULL,
      used_at = CASE WHEN o.user_id IS NOT NULL THEN NOW() ELSE o.used_at END
  WHERE o.id = v_onb.id
  RETURNING o.id, o.status INTO v_onb.id, v_onb.status;

  -- Notify the owner(s) of the tenant.
  INSERT INTO public.notifications (tenant_id, recipient_id, type, entity_type, entity_id, message)
  SELECT v_onb.tenant_id, u.id, 'onboarding_submitted', 'onboarding', v_onb.id::TEXT,
         'New onboarding submission from ' || v_email
  FROM public.users u
  WHERE u.tenant_id = v_onb.tenant_id AND u.role = 'owner' AND u.status = 'active';

  RETURN QUERY SELECT v_onb.id, v_onb.status;
END;
$$;
