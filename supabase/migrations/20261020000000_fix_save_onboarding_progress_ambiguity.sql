-- Fix ambiguous references between RETURNS TABLE output parameters (id, status,
-- step) and columns from public.onboardings in save_onboarding_progress().

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
  IF v_onb.user_id IS NOT NULL THEN RAISE EXCEPTION 'This onboarding invitation has already been used.'; END IF;
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

COMMENT ON FUNCTION public.save_onboarding_progress IS 'Public: save onboarding form progress by raw token (hashed); table columns are qualified to avoid RETURNS TABLE variable ambiguity.';
