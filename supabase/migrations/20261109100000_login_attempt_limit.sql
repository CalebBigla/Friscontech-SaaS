-- Login attempt limit: after 5 wrong passwords for an email within 15 minutes,
-- sign-in for that email is blocked for 15 minutes. Counted per email, so it
-- holds across browsers and devices. Any email is counted, whether or not an
-- account exists, so the answer never reveals which emails are registered.
--
-- The sign-in page checks login_attempt_status before calling Supabase Auth,
-- reports each wrong password with record_login_failure, and clears the count
-- with clear_login_failures after a successful sign-in. Scripted attacks that
-- call Supabase Auth directly are limited by the project's Auth rate limits.

CREATE TABLE IF NOT EXISTS app_private.login_attempts (
  email TEXT PRIMARY KEY,
  failures INT NOT NULL DEFAULT 0,
  window_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_until TIMESTAMPTZ
);
REVOKE ALL ON app_private.login_attempts FROM PUBLIC, anon, authenticated;
-- No policies: only the functions below (which run as the table owner) touch it.
ALTER TABLE app_private.login_attempts ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION app_private.login_email(p_email TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$ SELECT NULLIF(pg_catalog.lower(pg_catalog.btrim(COALESCE(p_email, ''))), '') $$;

-- Seconds until sign-in is allowed again; 0 when it is allowed now.
CREATE OR REPLACE FUNCTION public.login_attempt_status(p_email TEXT)
RETURNS INT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT COALESCE((
    SELECT GREATEST(CEIL(EXTRACT(EPOCH FROM (a.locked_until - now())))::INT, 0)
      FROM app_private.login_attempts a
     WHERE a.email = app_private.login_email(p_email) AND a.locked_until > now()
  ), 0)
$$;

-- Records a wrong password. Returns how many attempts are left before the lock
-- and, once locked, the seconds the lock lasts.
CREATE OR REPLACE FUNCTION public.record_login_failure(p_email TEXT)
RETURNS TABLE (attempts_left INT, locked_seconds INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  c_max CONSTANT INT := 5;
  c_window CONSTANT INTERVAL := INTERVAL '15 minutes';
  c_lock CONSTANT INTERVAL := INTERVAL '15 minutes';
  v_email TEXT := app_private.login_email(p_email);
  v_row app_private.login_attempts;
BEGIN
  IF v_email IS NULL OR pg_catalog.length(v_email) > 320 THEN
    RETURN QUERY SELECT c_max, 0; RETURN;
  END IF;

  -- Rows that no longer count for anything.
  DELETE FROM app_private.login_attempts
   WHERE window_started_at < now() - INTERVAL '1 day' AND (locked_until IS NULL OR locked_until < now());

  INSERT INTO app_private.login_attempts (email) VALUES (v_email) ON CONFLICT (email) DO NOTHING;
  SELECT * INTO v_row FROM app_private.login_attempts WHERE email = v_email FOR UPDATE;

  IF v_row.locked_until > now() THEN
    -- Already locked: attempts during the lock neither count nor extend it.
    RETURN QUERY SELECT 0, GREATEST(CEIL(EXTRACT(EPOCH FROM (v_row.locked_until - now())))::INT, 0); RETURN;
  END IF;

  IF v_row.failures = 0 OR v_row.locked_until IS NOT NULL OR v_row.window_started_at < now() - c_window THEN
    v_row.failures := 1; v_row.window_started_at := now(); v_row.locked_until := NULL;
  ELSE
    v_row.failures := v_row.failures + 1;
  END IF;
  IF v_row.failures >= c_max THEN v_row.locked_until := now() + c_lock; END IF;

  UPDATE app_private.login_attempts
     SET failures = v_row.failures, window_started_at = v_row.window_started_at, locked_until = v_row.locked_until
   WHERE email = v_email;

  RETURN QUERY SELECT GREATEST(c_max - v_row.failures, 0),
                      CASE WHEN v_row.locked_until IS NULL THEN 0
                           ELSE CEIL(EXTRACT(EPOCH FROM c_lock))::INT END;
END;
$$;

-- A successful sign-in clears the count for the signed-in user's own email.
CREATE OR REPLACE FUNCTION public.clear_login_failures()
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  DELETE FROM app_private.login_attempts
   WHERE email = app_private.login_email((SELECT u.email FROM auth.users u WHERE u.id = auth.uid()))
$$;

REVOKE ALL ON FUNCTION app_private.login_email(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.login_attempt_status(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_login_failure(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.clear_login_failures() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.login_attempt_status(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_login_failure(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clear_login_failures() TO authenticated;

NOTIFY pgrst, 'reload schema';
