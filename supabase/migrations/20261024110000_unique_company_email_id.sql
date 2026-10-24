-- ============================================================================
-- Unique company e-mail ID on onboarding submit
-- ============================================================================
-- The form generates data.preferredEmailId as firstname.surname. When two people
-- share the same names, the first to submit keeps it and later ones get a
-- two-digit suffix: ngozi.umeh, ngozi.umeh01, ngozi.umeh02, …
-- Only submitted and approved onboardings hold an ID (a rejected or unfinished
-- one does not). A resubmit of the same onboarding keeps its own ID. An advisory
-- lock per tenant and base ID stops two simultaneous submits taking the same one.
--
-- Same function as 20261024100000_fix_onboarding_rpc_ambiguity.sql plus the ID
-- assignment; checks, messages and grants are unchanged.
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
  IF v_onb.user_id IS NOT NULL THEN RAISE EXCEPTION 'This onboarding invitation has already been used.'; END IF;
  IF v_onb.status NOT IN ('invited', 'in_progress', 'submitted') THEN
    RAISE EXCEPTION 'This onboarding can no longer be submitted.';
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

COMMENT ON FUNCTION public.submit_onboarding IS 'Public: submit the onboarding form by raw token and assign a unique company e-mail ID (firstname.surname, then 01, 02, … for same names). The auth account is created client-side afterwards.';
