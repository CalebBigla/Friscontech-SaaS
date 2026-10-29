-- ============================================================================
-- Owner can send a submitted (or rejected) onboarding back for corrections
-- ============================================================================
-- request_onboarding_corrections (owner):
--   * status 'submitted' or 'rejected' -> 'in_progress', with the owner's note
--     in correction_note;
--   * issues a new invite link (returns the raw token; only its hash is stored)
--     valid for 7 days, and clears used_at so the link opens again;
--   * a rejected member's profile goes back to 'pending';
--   * when the guarantor response was declined, or the owner asks for it, the
--     guarantor form is reset so it is completed again (link or on behalf).
--
-- While correction_note is set, the invite-token functions accept the link even
-- though the member already has an account (user_id set). A resubmission keeps
-- the account's email, clears correction_note and closes the link again; the
-- app skips account creation because the account exists.
--
-- Function bodies are copied from their latest migrations with only that check
-- changed. onboarding_open_for_upload is the storage policy helper; the storage
-- policies themselves are not touched. No RLS policy or table grant is changed.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.request_onboarding_corrections(
  p_onboarding_id UUID,
  p_note TEXT,
  p_redo_guarantor BOOLEAN DEFAULT FALSE
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_onb RECORD;
  v_actor UUID := auth.uid();
  v_raw TEXT;
  v_redo BOOLEAN;
BEGIN
  IF COALESCE(public.get_user_role() = 'owner', FALSE) = FALSE THEN
    RAISE EXCEPTION 'Only the owner can request onboarding corrections.';
  END IF;
  IF COALESCE(length(TRIM(p_note)), 0) < 5 THEN
    RAISE EXCEPTION 'Describe what the staff member needs to correct.';
  END IF;

  SELECT o.* INTO v_onb FROM public.onboardings AS o
  WHERE o.id = p_onboarding_id AND o.tenant_id = public.get_user_tenant_id()
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Onboarding not found.'; END IF;
  IF v_onb.status NOT IN ('submitted', 'rejected') THEN
    RAISE EXCEPTION 'Corrections can only be requested for a submitted or rejected onboarding.';
  END IF;

  v_redo := COALESCE(p_redo_guarantor, FALSE) OR v_onb.guarantor_decision = 'declined';
  -- 64 hex characters from two random UUIDs (pgcrypto is unavailable on hosted Supabase).
  v_raw := encode(sha256(convert_to(gen_random_uuid()::TEXT || gen_random_uuid()::TEXT, 'UTF8')), 'hex');

  UPDATE public.onboardings AS o
  SET status = 'in_progress',
      correction_note = TRIM(p_note),
      token_hash = public.hash_token(v_raw),
      token_expires_at = NOW() + INTERVAL '7 days',
      token_revoked = FALSE,
      used_at = NULL,
      rejection_reason = NULL,
      reviewed_by = v_actor,
      reviewed_at = NOW(),
      guarantor_status = CASE WHEN v_redo THEN 'not_sent' ELSE o.guarantor_status END,
      guarantor_token = CASE WHEN v_redo THEN NULL ELSE o.guarantor_token END,
      guarantor_response = CASE WHEN v_redo THEN NULL ELSE o.guarantor_response END,
      guarantor_decision = CASE WHEN v_redo THEN NULL ELSE o.guarantor_decision END,
      guarantor_decision_reason = CASE WHEN v_redo THEN NULL ELSE o.guarantor_decision_reason END,
      guarantor_decided_at = CASE WHEN v_redo THEN NULL ELSE o.guarantor_decided_at END
  WHERE o.id = v_onb.id;

  IF v_onb.user_id IS NOT NULL THEN
    UPDATE public.users AS u SET status = 'pending'
    WHERE u.id = v_onb.user_id AND u.status = 'rejected';
  END IF;

  PERFORM public.create_audit_log(
    v_onb.tenant_id, v_actor,
    'Team onboarding corrections requested',
    v_onb.employee_id || ' · ' || TRIM(p_note) || CASE WHEN v_redo THEN ' · guarantor form to be redone' ELSE '' END,
    'team_member', v_onb.id::TEXT, FALSE, NULL
  );

  RETURN v_raw;
END;
$$;

COMMENT ON FUNCTION public.request_onboarding_corrections IS 'Owner: send a submitted or rejected onboarding back to the staff member with a note; returns a new raw invite token.';

CREATE OR REPLACE FUNCTION public.get_onboarding_by_token(p_token TEXT)
RETURNS TABLE (
  id UUID, tenant_id UUID, user_id UUID, employee_id TEXT, job_title TEXT,
  department TEXT, start_date DATE, status TEXT, step INTEGER, data JSONB,
  correction_note TEXT, guarantor_status TEXT, guarantor_token TEXT,
  token_expires_at TIMESTAMPTZ, token_revoked BOOLEAN, used_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ, created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hash TEXT := public.hash_token(p_token);
BEGIN
  RETURN QUERY
  SELECT o.id, o.tenant_id, o.user_id, o.employee_id, o.job_title,
         o.department, o.start_date, o.status, o.step, o.data,
         o.correction_note, o.guarantor_status, o.guarantor_token,
         o.token_expires_at, o.token_revoked, o.used_at,
         o.submitted_at, o.created_at
  FROM public.onboardings o
  WHERE o.token_hash = v_hash
    AND o.token_revoked = FALSE
    AND o.token_expires_at > NOW()
    AND o.status IN ('invited', 'in_progress', 'submitted')
    -- After sign-up the token route closes, unless the owner asked for corrections.
    AND (o.user_id IS NULL OR o.correction_note IS NOT NULL);
END;
$$;

CREATE OR REPLACE FUNCTION public.save_onboarding_progress(
  p_token TEXT,
  p_data JSONB,
  p_step INTEGER,
  p_partial_files JSONB DEFAULT NULL
)
RETURNS TABLE (id UUID, status TEXT, step INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hash TEXT := public.hash_token(p_token);
  v_onb RECORD;
BEGIN
  SELECT o.* INTO v_onb
  FROM public.onboardings AS o
  WHERE o.token_hash = v_hash
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid onboarding invitation.'; END IF;
  IF v_onb.token_revoked THEN RAISE EXCEPTION 'This onboarding invitation has been revoked.'; END IF;
  IF v_onb.token_expires_at < NOW() THEN RAISE EXCEPTION 'This onboarding invitation has expired.'; END IF;
  IF v_onb.user_id IS NOT NULL AND v_onb.correction_note IS NULL THEN RAISE EXCEPTION 'This onboarding invitation has already been used.'; END IF;
  IF v_onb.status NOT IN ('invited', 'in_progress', 'submitted') THEN
    RAISE EXCEPTION 'This onboarding can no longer be edited.';
  END IF;

  UPDATE public.onboardings AS o
  SET data = p_data,
      step = GREATEST(o.step, p_step),
      status = CASE WHEN o.status = 'invited' THEN 'in_progress' ELSE o.status END
  WHERE o.id = v_onb.id
  RETURNING o.id, o.status, o.step INTO v_onb.id, v_onb.status, v_onb.step;

  RETURN QUERY SELECT v_onb.id, v_onb.status, v_onb.step;
END;
$$;

CREATE OR REPLACE FUNCTION public.send_guarantor_link(p_token TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hash TEXT := public.hash_token(p_token);
  v_onb RECORD;
  v_gt TEXT;
BEGIN
  SELECT * INTO v_onb FROM public.onboardings
  WHERE token_hash = v_hash
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid onboarding invitation.'; END IF;
  IF v_onb.token_revoked OR v_onb.token_expires_at < NOW() OR (v_onb.user_id IS NOT NULL AND v_onb.correction_note IS NULL) THEN
    RAISE EXCEPTION 'This onboarding invitation is no longer valid.';
  END IF;
  IF v_onb.status NOT IN ('invited', 'in_progress', 'submitted') THEN
    RAISE EXCEPTION 'This onboarding can no longer be edited.';
  END IF;
  IF v_onb.guarantor_status = 'completed' THEN
    RAISE EXCEPTION 'The guarantor form has already been submitted.';
  END IF;

  -- gen_random_bytes is from pgcrypto (unavailable on Supabase hosted).
  -- Generate a 64-char hex token by hashing two random UUIDs together —
  -- entropy ≈ 256 bits, same as 32 random bytes.
  v_gt := encode(
    sha256(convert_to(gen_random_uuid()::TEXT || gen_random_uuid()::TEXT, 'UTF8')),
    'hex'
  );
  UPDATE public.onboardings
  SET guarantor_token = v_gt,
      guarantor_status = 'sent'
  WHERE id = v_onb.id;

  RETURN v_gt;
END;
$$;

CREATE OR REPLACE FUNCTION public.register_onboarding_file(
  p_token TEXT,
  p_file_type TEXT,       -- 'photo' | 'credential'
  p_file_name TEXT,
  p_storage_path TEXT,    -- '<onboarding_id>/<filename>'
  p_size BIGINT,
  p_mime TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hash TEXT := public.hash_token(p_token);
  v_onb RECORD;
  v_id UUID;
  v_photo_cap BIGINT := 4 * 1024 * 1024;    -- 4 MiB
  v_cred_cap BIGINT   := 5 * 1024 * 1024;    -- 5 MiB
BEGIN
  IF p_file_type NOT IN ('photo', 'credential') THEN
    RAISE EXCEPTION 'Invalid file type.';
  END IF;
  IF p_file_type = 'photo' AND p_size > v_photo_cap THEN
    RAISE EXCEPTION 'Photo must be 4 MB or smaller.';
  END IF;
  IF p_file_type = 'credential' AND p_size > v_cred_cap THEN
    RAISE EXCEPTION 'Credential file must be 5 MB or smaller.';
  END IF;

  SELECT * INTO v_onb FROM public.onboardings
  WHERE token_hash = v_hash
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid onboarding invitation.'; END IF;
  IF v_onb.token_revoked OR v_onb.token_expires_at < NOW() OR (v_onb.user_id IS NOT NULL AND v_onb.correction_note IS NULL) THEN
    RAISE EXCEPTION 'This onboarding invitation is no longer valid.';
  END IF;
  IF v_onb.status NOT IN ('invited', 'in_progress', 'submitted') THEN
    RAISE EXCEPTION 'Files can no longer be uploaded for this onboarding.';
  END IF;
  -- The storage path must start with this onboarding's id.
  IF p_storage_path IS NULL OR split_part(p_storage_path, '/', 1) <> v_onb.id::TEXT THEN
    RAISE EXCEPTION 'Invalid file path.';
  END IF;

  INSERT INTO public.onboarding_files
    (onboarding_id, file_type, file_name, cloudinary_public_id, cloudinary_url, file_size, mime_type)
  VALUES
    (v_onb.id, p_file_type, p_file_name, p_storage_path, p_storage_path, p_size, p_mime)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_onboarding_file(p_token TEXT, p_file_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hash TEXT := public.hash_token(p_token);
  v_onb RECORD;
BEGIN
  SELECT * INTO v_onb FROM public.onboardings
  WHERE token_hash = v_hash
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid onboarding invitation.'; END IF;
  IF v_onb.token_revoked OR v_onb.token_expires_at < NOW() OR (v_onb.user_id IS NOT NULL AND v_onb.correction_note IS NULL) THEN
    RAISE EXCEPTION 'This onboarding invitation is no longer valid.';
  END IF;

  DELETE FROM public.onboarding_files
  WHERE id = p_file_id AND onboarding_id = v_onb.id;
END;
$$;

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
  IF v_onb.user_id IS NOT NULL AND v_onb.correction_note IS NULL THEN RAISE EXCEPTION 'This onboarding invitation has already been used.'; END IF;
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
      correction_note = CASE WHEN o.user_id IS NOT NULL THEN NULL ELSE o.correction_note END,
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
      AND (o.user_id IS NULL OR o.correction_note IS NOT NULL)
  );
$$;

COMMENT ON FUNCTION public.get_onboarding_by_token IS 'Public: fetch an onboarding invite by raw token (hashed). Returned before sign-up, or after it while the owner has requested corrections.';
COMMENT ON FUNCTION public.submit_onboarding IS 'Public: submit the onboarding form by raw token once the guarantor form is complete; assigns a unique company e-mail ID. A resubmission after corrections keeps the account email and closes the link.';
