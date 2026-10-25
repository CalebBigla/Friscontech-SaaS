-- ============================================================================
-- Guarantor form required before submit; applicant may fill it on their behalf
-- ============================================================================
-- Until now submit_onboarding accepted a form whose guarantor had never
-- responded. Now:
--   * submit_guarantor_on_behalf (anon, by the onboarding token) lets the
--     applicant fill in the guarantor questions themselves. The response is
--     stored like a guarantor's, marked filledBy = 'staff' so the owner can see
--     who filled it.
--   * submit_onboarding refuses until guarantor_status = 'completed' (by link or
--     on behalf). Otherwise identical to 20261024110000_unique_company_email_id.
-- The owner still accepts or declines the guarantor response before approving.
-- No RLS policy or table grant is changed.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.submit_guarantor_on_behalf(
  p_token TEXT,
  p_response JSONB
)
RETURNS TABLE (id UUID, guarantor_status TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hash TEXT := public.hash_token(p_token);
  v_onb RECORD;
BEGIN
  IF p_response IS NULL THEN RAISE EXCEPTION 'Guarantor response is required.'; END IF;
  IF COALESCE((p_response ->> 'yearsKnown'), '') = ''
     OR COALESCE((p_response ->> 'relationship'), '') = ''
     OR COALESCE((p_response ->> 'character'), '') = ''
     OR length(COALESCE((p_response ->> 'signature'), '')) < 3
     OR COALESCE((p_response ->> 'signedDate'), '') = '' THEN
    RAISE EXCEPTION 'Please answer every required guarantor question, sign and date the form.';
  END IF;

  SELECT o.* INTO v_onb FROM public.onboardings AS o
  WHERE o.token_hash = v_hash
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid onboarding invitation.'; END IF;
  IF v_onb.token_revoked THEN RAISE EXCEPTION 'This onboarding invitation has been revoked.'; END IF;
  IF v_onb.token_expires_at < NOW() THEN RAISE EXCEPTION 'This onboarding invitation has expired.'; END IF;
  IF v_onb.user_id IS NOT NULL THEN RAISE EXCEPTION 'This onboarding invitation has already been used.'; END IF;
  IF v_onb.status NOT IN ('invited', 'in_progress', 'submitted') THEN
    RAISE EXCEPTION 'This onboarding can no longer be edited.';
  END IF;
  IF v_onb.guarantor_status = 'completed' THEN
    RAISE EXCEPTION 'The guarantor form was already completed.';
  END IF;

  UPDATE public.onboardings AS o
  SET guarantor_status = 'completed',
      guarantor_response = p_response
        || jsonb_build_object('submittedAt', NOW()::TEXT, 'filledBy', 'staff')
  WHERE o.id = v_onb.id
  RETURNING o.id, o.guarantor_status INTO v_onb.id, v_onb.guarantor_status;

  INSERT INTO public.notifications (tenant_id, recipient_id, type, entity_type, entity_id, message)
  SELECT v_onb.tenant_id, u.id, 'guarantor_completed', 'onboarding', v_onb.id::TEXT,
         'Guarantor form filled in by the applicant for ' || COALESCE(v_onb.employee_id, 'an onboarding')
  FROM public.users u
  WHERE u.tenant_id = v_onb.tenant_id AND u.role = 'owner' AND u.status = 'active';

  RETURN QUERY SELECT v_onb.id, v_onb.guarantor_status;
END;
$$;

COMMENT ON FUNCTION public.submit_guarantor_on_behalf IS 'Public: the applicant fills in the guarantor form on the guarantor''s behalf, by raw onboarding token. Stored with filledBy = staff.';

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
  IF v_onb.user_id IS NOT NULL THEN RAISE EXCEPTION 'This onboarding invitation has already been used.'; END IF;
  IF v_onb.status NOT IN ('invited', 'in_progress', 'submitted') THEN
    RAISE EXCEPTION 'This onboarding can no longer be submitted.';
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
      submitted_at = NOW()
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

COMMENT ON FUNCTION public.submit_onboarding IS 'Public: submit the onboarding form by raw token once the guarantor form is complete; assigns a unique company e-mail ID (firstname.surname, then 01, 02, … for same names). The auth account is created client-side afterwards.';
