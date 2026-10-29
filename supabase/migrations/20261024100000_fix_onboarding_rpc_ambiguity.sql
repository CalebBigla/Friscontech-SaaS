-- ============================================================================
-- Fix "column reference "id" is ambiguous" in the onboarding RPCs
-- ============================================================================
-- Same fix as 20261020000000_fix_save_onboarding_progress_ambiguity.sql: table
-- columns are qualified with an alias. Logic, messages and side effects are
-- unchanged from 20260118030000_onboarding_rpcs_and_storage.sql. CREATE OR
-- REPLACE keeps the existing grants. No RLS policy or grant is changed.
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

  UPDATE public.onboardings AS o
  SET data = p_data,
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

COMMENT ON FUNCTION public.submit_onboarding IS 'Public: submit the onboarding form by raw token. The auth account is created client-side afterwards. Table columns are qualified to avoid RETURNS TABLE variable ambiguity.';

CREATE OR REPLACE FUNCTION public.submit_guarantor(
  p_guarantor_token TEXT,
  p_response JSONB
)
RETURNS TABLE (id UUID, guarantor_status TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_onb RECORD;
BEGIN
  IF p_guarantor_token IS NULL OR p_guarantor_token = '' THEN
    RAISE EXCEPTION 'Invalid guarantor link.';
  END IF;
  IF p_response IS NULL THEN RAISE EXCEPTION 'Guarantor response is required.'; END IF;
  IF COALESCE((p_response ->> 'yearsKnown'), '') = ''
     OR COALESCE((p_response ->> 'relationship'), '') = ''
     OR COALESCE((p_response ->> 'character'), '') = ''
     OR length(COALESCE((p_response ->> 'signature'), '')) < 3
     OR COALESCE((p_response ->> 'signedDate'), '') = '' THEN
    RAISE EXCEPTION 'Please answer every required question, sign and date the form.';
  END IF;

  SELECT o.* INTO v_onb FROM public.onboardings AS o
  WHERE o.guarantor_token = p_guarantor_token
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'This guarantor link is not valid.'; END IF;
  IF v_onb.guarantor_status = 'completed' THEN
    RAISE EXCEPTION 'This guarantor form was already submitted. Thank you.';
  END IF;

  UPDATE public.onboardings AS o
  SET guarantor_status = 'completed',
      guarantor_response = jsonb_set(p_response, '{submittedAt}', to_jsonb(NOW()::TEXT))
  WHERE o.id = v_onb.id
  RETURNING o.id, o.guarantor_status INTO v_onb.id, v_onb.guarantor_status;

  -- Notify the owner(s).
  INSERT INTO public.notifications (tenant_id, recipient_id, type, entity_type, entity_id, message)
  SELECT v_onb.tenant_id, u.id, 'guarantor_completed', 'onboarding', v_onb.id::TEXT,
         'Guarantor response received for ' || COALESCE(v_onb.employee_id, 'an onboarding')
  FROM public.users u
  WHERE u.tenant_id = v_onb.tenant_id AND u.role = 'owner' AND u.status = 'active';

  RETURN QUERY SELECT v_onb.id, v_onb.guarantor_status;
END;
$$;

COMMENT ON FUNCTION public.submit_guarantor IS 'Public: submit the guarantor reference by guarantor token. Table columns are qualified to avoid RETURNS TABLE variable ambiguity.';

CREATE OR REPLACE FUNCTION public.review_guarantor(
  p_onboarding_id UUID,
  p_decision TEXT,    -- 'accepted' | 'declined'
  p_reason TEXT
)
RETURNS TABLE (id UUID, guarantor_decision TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_onb RECORD;
  v_actor UUID := auth.uid();
BEGIN
  IF public.get_user_role() <> 'owner' THEN
    RAISE EXCEPTION 'Only the owner can review guarantor responses.';
  END IF;

  SELECT o.* INTO v_onb FROM public.onboardings AS o
  WHERE o.id = p_onboarding_id AND o.tenant_id = public.get_user_tenant_id()
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Onboarding not found.'; END IF;
  IF v_onb.guarantor_status <> 'completed' THEN
    RAISE EXCEPTION 'The guarantor has not submitted the form yet.';
  END IF;
  IF v_onb.guarantor_decision IS NOT NULL THEN
    RAISE EXCEPTION 'This guarantor response was already reviewed.';
  END IF;
  IF p_decision = 'declined' AND COALESCE(length(TRIM(p_reason)), 0) < 5 THEN
    RAISE EXCEPTION 'Give a reason for declining.';
  END IF;
  IF p_decision NOT IN ('accepted', 'declined') THEN
    RAISE EXCEPTION 'Invalid decision.';
  END IF;

  UPDATE public.onboardings AS o
  SET guarantor_decision = p_decision,
      guarantor_decision_reason = NULLIF(TRIM(p_reason), ''),
      guarantor_decided_at = NOW()
  WHERE o.id = v_onb.id
  RETURNING o.id, o.guarantor_decision INTO v_onb.id, v_onb.guarantor_decision;

  PERFORM public.create_audit_log(
    v_onb.tenant_id, v_actor,
    CASE WHEN p_decision = 'accepted' THEN 'Team onboarding guarantor accepted'
         ELSE 'Team onboarding guarantor declined' END,
    v_onb.employee_id || COALESCE(' · ' || NULLIF(TRIM(p_reason), ''), ''),
    'team_member', v_onb.id::TEXT, FALSE, NULL
  );

  RETURN QUERY SELECT v_onb.id, v_onb.guarantor_decision;
END;
$$;

COMMENT ON FUNCTION public.review_guarantor IS 'Owner: accept or decline a guarantor response. Table columns are qualified to avoid RETURNS TABLE variable ambiguity.';

CREATE OR REPLACE FUNCTION public.reject_onboarding(
  p_onboarding_id UUID,
  p_reason TEXT
)
RETURNS TABLE (id UUID, status TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_onb RECORD;
  v_actor UUID := auth.uid();
BEGIN
  IF public.get_user_role() <> 'owner' THEN
    RAISE EXCEPTION 'Only the owner can reject onboarding submissions.';
  END IF;
  IF COALESCE(length(TRIM(p_reason)), 0) < 5 THEN
    RAISE EXCEPTION 'Give a reason for rejecting.';
  END IF;

  SELECT o.* INTO v_onb FROM public.onboardings AS o
  WHERE o.id = p_onboarding_id AND o.tenant_id = public.get_user_tenant_id()
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Onboarding not found.'; END IF;
  IF v_onb.status NOT IN ('submitted') THEN
    RAISE EXCEPTION 'Only a submitted onboarding can be rejected.';
  END IF;

  UPDATE public.onboardings AS o
  SET status = 'rejected',
      rejection_reason = TRIM(p_reason),
      reviewed_by = v_actor,
      reviewed_at = NOW()
  WHERE o.id = v_onb.id
  RETURNING o.id, o.status INTO v_onb.id, v_onb.status;

  -- If the invitee already signed up (user_id set), mark their profile rejected so they
  -- cannot sign in.
  IF v_onb.user_id IS NOT NULL THEN
    UPDATE public.users AS u SET status = 'rejected' WHERE u.id = v_onb.user_id;
  END IF;

  PERFORM public.create_audit_log(
    v_onb.tenant_id, v_actor,
    'Team onboarding rejected',
    v_onb.employee_id || ' · ' || TRIM(p_reason),
    'team_member', v_onb.id::TEXT, FALSE, NULL
  );

  IF v_onb.user_id IS NOT NULL THEN
    INSERT INTO public.notifications (tenant_id, recipient_id, type, entity_type, entity_id, message)
    VALUES (v_onb.tenant_id, v_onb.user_id, 'onboarding_rejected', 'onboarding', v_onb.id::TEXT,
            'Your onboarding was declined: ' || TRIM(p_reason));
  END IF;

  RETURN QUERY SELECT v_onb.id, v_onb.status;
END;
$$;

COMMENT ON FUNCTION public.reject_onboarding IS 'Owner: reject an onboarding submission. Table columns are qualified to avoid RETURNS TABLE variable ambiguity.';
