-- Migration: Onboarding RPCs + Supabase Storage bucket
-- Created: 2026-01-18
-- Description: SECURITY DEFINER functions that form the entire onboarding state machine.
--              Anon-callable (token-validated):
--                get_onboarding_by_token, save_onboarding_progress, submit_onboarding,
--                send_guarantor_link, submit_guarantor, register_onboarding_file
--              Owner-only (role-validated):
--                approve_onboarding, reject_onboarding, review_guarantor
--              Plus: the `onboarding-files` private storage bucket with anon-upload +
--              owner-read policies, and a 4MB image / 5MB credential size cap enforced
--              in register_onboarding_file (client also enforces 4MB for UX).

-- ============================================================================
-- NOTE: No pgcrypto extension needed. Supabase Postgres 14+ provides:
--   sha256(bytea) -> bytea  (native, no extension)
--   gen_random_uuid()       (native, built-in)
-- ============================================================================

-- ============================================================================
-- 0. EXTEND notifications.type with onboarding_approved / onboarding_rejected
-- ============================================================================

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'payment_awaiting_acknowledgement', 'payment_awaiting_confirmation',
    'payment_confirmed', 'payment_declined',
    'onboarding_submitted', 'onboarding_approved', 'onboarding_rejected',
    'guarantor_completed',
    'stock_request_submitted', 'stock_request_approved',
    'stock_request_rejected', 'stock_request_fulfilled'
  ));

-- ============================================================================
-- 1. TOKEN HASHING HELPER (server-side)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.hash_token(p_token TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  -- sha256() is native in Postgres 14+; no pgcrypto extension required.
  SELECT encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
$$;

COMMENT ON FUNCTION public.hash_token IS 'SHA-256 hex hash of an onboarding token. Raw tokens are never stored.';

-- ============================================================================
-- 2. GET_ONBOARDING_BY_TOKEN (anon) — fetch the invite for the public form
-- ============================================================================
-- Returns the row only if the raw token hashes to a stored token_hash AND the invite is
-- still consumable (not revoked, not expired, status pre-approval). After approval/
-- rejection the token is dead.

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
    AND o.user_id IS NULL;  -- after sign-up the invitee is authenticated; this token route closes
END;
$$;

COMMENT ON FUNCTION public.get_onboarding_by_token IS 'Public: fetch an onboarding invite by raw token (hashed). Only valid pre-signup invites are returned.';

-- ============================================================================
-- 3. SAVE_ONBOARDING_PROGRESS (anon) — persist form data + step
-- ============================================================================

CREATE OR REPLACE FUNCTION public.save_onboarding_progress(
  p_token TEXT,
  p_data JSONB,
  p_step INTEGER,
  p_partial_files JSONB DEFAULT NULL  -- optional {photo, credentials} metadata; not enforced here
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
  SELECT * INTO v_onb FROM public.onboardings
  WHERE token_hash = v_hash
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid onboarding invitation.'; END IF;
  IF v_onb.token_revoked THEN RAISE EXCEPTION 'This onboarding invitation has been revoked.'; END IF;
  IF v_onb.token_expires_at < NOW() THEN RAISE EXCEPTION 'This onboarding invitation has expired.'; END IF;
  IF v_onb.user_id IS NOT NULL THEN RAISE EXCEPTION 'This onboarding invitation has already been used.'; END IF;
  IF v_onb.status NOT IN ('invited', 'in_progress', 'submitted') THEN
    RAISE EXCEPTION 'This onboarding can no longer be edited.';
  END IF;

  UPDATE public.onboardings
  SET data = p_data,
      step = GREATEST(step, p_step),
      status = CASE WHEN status = 'invited' THEN 'in_progress' ELSE status END
  WHERE id = v_onb.id
  RETURNING id, status, step INTO v_onb.id, v_onb.status, v_onb.step;

  RETURN QUERY SELECT v_onb.id, v_onb.status, v_onb.step;
END;
$$;

COMMENT ON FUNCTION public.save_onboarding_progress IS 'Public: save onboarding form progress by raw token (hashed).';

-- ============================================================================
-- 4. SUBMIT_ONBOARDING (anon) — mark submitted + record submitter email
-- ============================================================================
-- The auth account is created client-side via supabase.auth.signUp AFTER this RPC;
-- handle_new_user() then links the new user. submitter_email must match the signUp email.

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

  SELECT * INTO v_onb FROM public.onboardings
  WHERE token_hash = v_hash
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
    SELECT 1 FROM public.onboardings o
    WHERE o.submitter_email = v_email AND o.status = 'submitted' AND o.id <> v_onb.id
  ) THEN
    RAISE EXCEPTION 'An onboarding submission for this email is already awaiting review.';
  END IF;

  UPDATE public.onboardings
  SET data = p_data,
      status = 'submitted',
      submitter_email = v_email,
      submitted_at = NOW()
  WHERE id = v_onb.id
  RETURNING id, status INTO v_onb.id, v_onb.status;

  -- Notify the owner(s) of the tenant.
  INSERT INTO public.notifications (tenant_id, recipient_id, type, entity_type, entity_id, message)
  SELECT v_onb.tenant_id, u.id, 'onboarding_submitted', 'onboarding', v_onb.id::TEXT,
         'New onboarding submission from ' || v_email
  FROM public.users u
  WHERE u.tenant_id = v_onb.tenant_id AND u.role = 'owner' AND u.status = 'active';

  RETURN QUERY SELECT v_onb.id, v_onb.status;
END;
$$;

COMMENT ON FUNCTION public.submit_onboarding IS 'Public: submit the onboarding form by raw token. The auth account is created client-side afterwards.';

-- ============================================================================
-- 5. SEND_GUARANTOR_LINK (anon) — generate / refresh the guarantor token
-- ============================================================================

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
  IF v_onb.token_revoked OR v_onb.token_expires_at < NOW() OR v_onb.user_id IS NOT NULL THEN
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

COMMENT ON FUNCTION public.send_guarantor_link IS 'Public: create (or refresh) a guarantor link token for an onboarding.';

-- ============================================================================
-- 6. SUBMIT_GUARANTOR (anon, by guarantor token) — record the guarantor response
-- ============================================================================

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

  SELECT * INTO v_onb FROM public.onboardings
  WHERE guarantor_token = p_guarantor_token
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'This guarantor link is not valid.'; END IF;
  IF v_onb.guarantor_status = 'completed' THEN
    RAISE EXCEPTION 'This guarantor form was already submitted. Thank you.';
  END IF;

  UPDATE public.onboardings
  SET guarantor_status = 'completed',
      guarantor_response = jsonb_set(p_response, '{submittedAt}', to_jsonb(NOW()::TEXT))
  WHERE id = v_onb.id
  RETURNING id, guarantor_status INTO v_onb.id, v_onb.guarantor_status;

  -- Notify the owner(s).
  INSERT INTO public.notifications (tenant_id, recipient_id, type, entity_type, entity_id, message)
  SELECT v_onb.tenant_id, u.id, 'guarantor_completed', 'onboarding', v_onb.id::TEXT,
         'Guarantor response received for ' || COALESCE(v_onb.employee_id, 'an onboarding')
  FROM public.users u
  WHERE u.tenant_id = v_onb.tenant_id AND u.role = 'owner' AND u.status = 'active';

  RETURN QUERY SELECT v_onb.id, v_onb.guarantor_status;
END;
$$;

COMMENT ON FUNCTION public.submit_guarantor IS 'Public: submit the guarantor reference by guarantor token.';

-- ============================================================================
-- 7. REGISTER_ONBOARDING_FILE (anon) — record an uploaded file with size caps
-- ============================================================================
-- The file is uploaded to the `onboarding-files` storage bucket (anon INSERT policy
-- validates the onboarding_id path segment). This RPC validates the invite token and
-- enforces size limits: photos <= 4 MiB, credentials <= 5 MiB. Returns the file row id.

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
  IF v_onb.token_revoked OR v_onb.token_expires_at < NOW() OR v_onb.user_id IS NOT NULL THEN
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

COMMENT ON FUNCTION public.register_onboarding_file IS 'Public: record an uploaded onboarding file. Enforces 4MB photo / 5MB credential caps.';

-- Convenience: list files for an onboarding by token (anon, for the invitee to re-list).
CREATE OR REPLACE FUNCTION public.list_onboarding_files(p_token TEXT)
RETURNS TABLE (
  id UUID, file_type TEXT, file_name TEXT, cloudinary_url TEXT, file_size INTEGER, mime_type TEXT
)
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
  IF v_onb.token_revoked OR v_onb.token_expires_at < NOW() THEN
    RAISE EXCEPTION 'This onboarding invitation is no longer valid.';
  END IF;

  RETURN QUERY
  SELECT f.id, f.file_type, f.file_name, f.cloudinary_url, f.file_size, f.mime_type
  FROM public.onboarding_files f
  WHERE f.onboarding_id = v_onb.id
  ORDER BY f.uploaded_at ASC;
END;
$$;

COMMENT ON FUNCTION public.list_onboarding_files IS 'Public: list uploaded files for an onboarding by raw token.';

-- Delete an onboarding file (anon, by token + file id) — lets the invitee remove a file.
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
  IF v_onb.token_revoked OR v_onb.token_expires_at < NOW() OR v_onb.user_id IS NOT NULL THEN
    RAISE EXCEPTION 'This onboarding invitation is no longer valid.';
  END IF;

  DELETE FROM public.onboarding_files
  WHERE id = p_file_id AND onboarding_id = v_onb.id;
END;
$$;

COMMENT ON FUNCTION public.delete_onboarding_file IS 'Public: delete an uploaded onboarding file by raw token + file id.';

-- ============================================================================
-- 8. REVIEW_GUARANTOR (owner) — accept / decline the guarantor response
-- ============================================================================

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

  SELECT * INTO v_onb FROM public.onboardings
  WHERE id = p_onboarding_id AND tenant_id = public.get_user_tenant_id()
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

  UPDATE public.onboardings
  SET guarantor_decision = p_decision,
      guarantor_decision_reason = NULLIF(TRIM(p_reason), ''),
      guarantor_decided_at = NOW()
  WHERE id = v_onb.id
  RETURNING id, guarantor_decision INTO v_onb.id, v_onb.guarantor_decision;

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

COMMENT ON FUNCTION public.review_guarantor IS 'Owner: accept or decline a guarantor response.';

-- ============================================================================
-- 9. APPROVE_ONBOARDING (owner) — atomically activate the staff account
-- ============================================================================
-- Requires the guarantor to have been accepted first (matches the existing UX). Sets the
-- linked users row to status='active' with the chosen role + branch, marks the onboarding
-- approved, writes an audit log + a notification to the new user. All in one transaction.

CREATE OR REPLACE FUNCTION public.approve_onboarding(
  p_onboarding_id UUID,
  p_role TEXT,            -- 'manager' | 'storekeeper' | 'sales_rep'
  p_branch_id UUID        -- required for storekeeper/sales_rep; NULL allowed for manager
)
RETURNS TABLE (user_id UUID, onboarding_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_onb RECORD;
  v_branch RECORD;
  v_actor UUID := auth.uid();
  v_manager_id UUID;
BEGIN
  IF public.get_user_role() <> 'owner' THEN
    RAISE EXCEPTION 'Only the owner can approve staff.';
  END IF;
  IF p_role NOT IN ('manager', 'storekeeper', 'sales_rep') THEN
    RAISE EXCEPTION 'Invalid role.';
  END IF;

  SELECT * INTO v_onb FROM public.onboardings
  WHERE id = p_onboarding_id AND tenant_id = public.get_user_tenant_id()
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Onboarding not found.'; END IF;
  IF v_onb.status <> 'submitted' THEN
    RAISE EXCEPTION 'Only a submitted onboarding can be approved.';
  END IF;
  IF v_onb.user_id IS NULL THEN
    RAISE EXCEPTION 'The staff member has not created their account yet.';
  END IF;
  IF v_onb.guarantor_decision IS DISTINCT FROM 'accepted' THEN
    RAISE EXCEPTION 'Accept the guarantor response before approving.';
  END IF;

  -- Branch validation
  IF p_branch_id IS NOT NULL THEN
    SELECT * INTO v_branch FROM public.branches
    WHERE id = p_branch_id AND tenant_id = v_onb.tenant_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Branch not found in this organization.'; END IF;
    IF v_branch.status <> 'active' THEN RAISE EXCEPTION 'Branch is not active.'; END IF;
  END IF;
  IF p_role IN ('storekeeper', 'sales_rep') AND p_branch_id IS NULL THEN
    RAISE EXCEPTION 'A branch is required for this role.';
  END IF;

  -- Resolve the branch manager (reports-to) for storekeepers/sales reps.
  v_manager_id := NULL;
  IF p_role IN ('storekeeper', 'sales_rep') AND p_branch_id IS NOT NULL THEN
    SELECT manager_id INTO v_manager_id FROM public.branches WHERE id = p_branch_id;
  END IF;

  -- Activate the profile.
  UPDATE public.users
  SET status = 'active',
      role = p_role,
      branch_id = p_branch_id,
      manager_id = v_manager_id,
      joined_at = NOW()
  WHERE id = v_onb.user_id;

  -- Mark the onboarding approved.
  UPDATE public.onboardings
  SET status = 'approved',
      reviewed_by = v_actor,
      reviewed_at = NOW(),
      activated_at = NOW(),
      assigned_role = p_role,
      assigned_branch_id = p_branch_id
  WHERE id = v_onb.id;

  -- Audit log.
  PERFORM public.create_audit_log(
    v_onb.tenant_id, v_actor,
    'Team member activated after onboarding',
    v_onb.employee_id || ' · ' || p_role,
    'team_member', v_onb.id::TEXT, FALSE,
    jsonb_build_object('user_id', v_onb.user_id, 'role', p_role, 'branch_id', p_branch_id)
  );

  -- Notify the new staff member.
  INSERT INTO public.notifications (tenant_id, recipient_id, type, entity_type, entity_id, message)
  VALUES (v_onb.tenant_id, v_onb.user_id, 'onboarding_approved', 'onboarding', v_onb.id::TEXT,
          'Your account has been activated. You can now sign in.');

  RETURN QUERY SELECT v_onb.user_id, v_onb.id;
END;
$$;

COMMENT ON FUNCTION public.approve_onboarding IS 'Owner: atomically approve an onboarding and activate the linked staff account.';

-- ============================================================================
-- 10. REJECT_ONBOARDING (owner) — decline the submission
-- ============================================================================

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

  SELECT * INTO v_onb FROM public.onboardings
  WHERE id = p_onboarding_id AND tenant_id = public.get_user_tenant_id()
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Onboarding not found.'; END IF;
  IF v_onb.status NOT IN ('submitted') THEN
    RAISE EXCEPTION 'Only a submitted onboarding can be rejected.';
  END IF;

  UPDATE public.onboardings
  SET status = 'rejected',
      rejection_reason = TRIM(p_reason),
      reviewed_by = v_actor,
      reviewed_at = NOW()
  WHERE id = v_onb.id
  RETURNING id, status INTO v_onb.id, v_onb.status;

  -- If the invitee already signed up (user_id set), mark their profile rejected so they
  -- cannot sign in.
  IF v_onb.user_id IS NOT NULL THEN
    UPDATE public.users SET status = 'rejected' WHERE id = v_onb.user_id;
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

COMMENT ON FUNCTION public.reject_onboarding IS 'Owner: reject an onboarding submission.';

-- ============================================================================
-- 11. STORAGE BUCKET: onboarding-files (private)
-- ============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'onboarding-files',
  'onboarding-files',
  FALSE,
  5 * 1024 * 1024,   -- 5 MiB hard cap at the bucket level; photos further capped to 4 MiB
                    -- by register_onboarding_file() and the client.
  ARRAY[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'application/pdf'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Anon can UPLOAD (INSERT) an object whose first path segment is a valid, in-progress
-- onboarding id. This is what the invitee uses while filling the form.
DROP POLICY IF EXISTS onboarding_files_upload_anon ON storage.objects;
CREATE POLICY onboarding_files_upload_anon ON storage.objects
  FOR INSERT TO anon
  WITH CHECK (
    bucket_id = 'onboarding-files'
    AND split_part(name, '/', 1) IN (
      SELECT o.id::text FROM public.onboardings o
      WHERE o.status IN ('invited', 'in_progress', 'submitted')
        AND o.token_revoked = FALSE
        AND o.token_expires_at > NOW()
        AND o.user_id IS NULL
    )
  );

-- Anon can DELETE their own uploaded object (invitee removing a file before submit).
DROP POLICY IF EXISTS onboarding_files_delete_anon ON storage.objects;
CREATE POLICY onboarding_files_delete_anon ON storage.objects
  FOR DELETE TO anon
  USING (
    bucket_id = 'onboarding-files'
    AND split_part(name, '/', 1) IN (
      SELECT o.id::text FROM public.onboardings o
      WHERE o.status IN ('invited', 'in_progress', 'submitted')
        AND o.token_revoked = FALSE
        AND o.token_expires_at > NOW()
        AND o.user_id IS NULL
    )
  );

-- Anon can READ (for previewing their uploaded photo/credential during the form).
DROP POLICY IF EXISTS onboarding_files_read_anon ON storage.objects;
CREATE POLICY onboarding_files_read_anon ON storage.objects
  FOR SELECT TO anon
  USING (
    bucket_id = 'onboarding-files'
    AND split_part(name, '/', 1) IN (
      SELECT o.id::text FROM public.onboardings o
      WHERE o.status IN ('invited', 'in_progress', 'submitted')
        AND o.token_revoked = FALSE
        AND o.token_expires_at > NOW()
        AND o.user_id IS NULL
    )
  );

-- Authenticated owner can READ any object in their tenant's onboardings (review docs).
DROP POLICY IF EXISTS onboarding_files_read_owner ON storage.objects;
CREATE POLICY onboarding_files_read_owner ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'onboarding-files'
    AND public.get_user_role() = 'owner'
    AND split_part(name, '/', 1) IN (
      SELECT o.id::text FROM public.onboardings o
      WHERE o.tenant_id = public.get_user_tenant_id()
    )
  );

-- Authenticated owner can DELETE an object (e.g., during rejection cleanup).
DROP POLICY IF EXISTS onboarding_files_delete_owner ON storage.objects;
CREATE POLICY onboarding_files_delete_owner ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'onboarding-files'
    AND public.get_user_role() = 'owner'
    AND split_part(name, '/', 1) IN (
      SELECT o.id::text FROM public.onboardings o
      WHERE o.tenant_id = public.get_user_tenant_id()
    )
  );

-- ============================================================================
-- 12. OWNER_ACCOUNT_EXISTS (anon) — lets the login page show Sign-in vs Create-owner
-- ============================================================================
-- Anon cannot SELECT from users through RLS, so expose a minimal boolean. This leaks
-- only whether *some* owner exists (no email/identity), which is acceptable for the
-- signup gate.

CREATE OR REPLACE FUNCTION public.owner_account_exists()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.users WHERE role = 'owner');
$$;

COMMENT ON FUNCTION public.owner_account_exists IS 'Public: true if an owner profile already exists (signup gate).';

-- Also expose the tenant reference date for the client (used by date formatters).
CREATE OR REPLACE FUNCTION public.get_tenant_reference_date()
RETURNS DATE
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT reference_date FROM public.tenants WHERE id = public.get_user_tenant_id();
$$;

COMMENT ON FUNCTION public.get_tenant_reference_date IS 'Active user: the tenant reference date.';

-- ============================================================================
-- 13. GET_ONBOARDING_FOR_GUARANTOR (anon) — display info for the guarantor form
-- ============================================================================
-- The guarantor opens /guarantor/<raw_guarantor_token>. Returns only the display
-- fields needed to render the form (applicant name, job title, guarantor status).
-- No PII beyond what the guarantor needs is exposed.

CREATE OR REPLACE FUNCTION public.get_onboarding_for_guarantor(p_guarantor_token TEXT)
RETURNS TABLE (
  id UUID,
  employee_name TEXT,
  job_title TEXT,
  guarantor_first_name TEXT,
  guarantor_surname TEXT,
  guarantor_status TEXT
)
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

  SELECT * INTO v_onb FROM public.onboardings WHERE guarantor_token = p_guarantor_token;
  IF NOT FOUND THEN RAISE EXCEPTION 'This guarantor link is not valid.'; END IF;

  RETURN QUERY
  SELECT
    v_onb.id,
    COALESCE(NULLIF(v_onb.data ->> 'firstName', ''), '')
      || CASE WHEN COALESCE(NULLIF(v_onb.data ->> 'lastName', ''), '') <> ''
              THEN (' ' || (v_onb.data ->> 'lastName')) ELSE '' END AS employee_name,
    v_onb.job_title,
    COALESCE(v_onb.data ->> 'guarantorFirstName', ''),
    COALESCE(v_onb.data ->> 'guarantorSurname', ''),
    v_onb.guarantor_status;
END;
$$;

COMMENT ON FUNCTION public.get_onboarding_for_guarantor IS 'Public: display info for the guarantor form (by raw guarantor token).';
