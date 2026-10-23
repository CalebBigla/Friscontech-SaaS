// Database tests without Docker: applies supabase/migrations to an in-process
// PostgreSQL 16 (PGlite) with minimal Supabase stubs (auth, storage, roles), then
// runs the RPC tests. Every call runs as role `authenticated` with auth.uid() set.
//
//   npm run db:test:local            migrations + RPC tests
//   npm run db:test:local -- --rls   also print the per-role RLS survey
//
// 20260118010000_restructure_onboardings.sql cannot replay on a fresh database
// (it drops onboardings.token_used while a policy still depends on it). This
// runner drops that policy first, in memory only, so the later files can be
// tested; the migration files themselves are not changed.
const fs = require("fs");
const path = require("path");
const { PGlite } = require("@electric-sql/pglite");

const STUBS = `
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;

CREATE SCHEMA auth;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
CREATE TABLE auth.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT,
  raw_user_meta_data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql STABLE AS
  $$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE FUNCTION auth.role() RETURNS TEXT LANGUAGE sql STABLE AS
  $$ SELECT NULLIF(current_setting('request.jwt.claim.role', true), '') $$;
GRANT EXECUTE ON FUNCTION auth.uid(), auth.role() TO anon, authenticated, service_role;

CREATE SCHEMA storage;
GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;
CREATE TABLE storage.buckets (
  id TEXT PRIMARY KEY, name TEXT, public BOOLEAN, file_size_limit BIGINT, allowed_mime_types TEXT[]
);
CREATE TABLE storage.objects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id TEXT, name TEXT, owner UUID, metadata JSONB
);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION storage.foldername(name TEXT) RETURNS TEXT[] LANGUAGE sql IMMUTABLE AS
  $$ SELECT string_to_array(name, '/') $$;
`;

async function main() {
  const root = path.resolve(__dirname, "..", "..", "..");
  const fixTokenUsed = !process.argv.includes("--strict-replay");
  const dir = path.join(root, "supabase", "migrations");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const db = new PGlite();
  await db.exec(STUBS);
  let ok = true;
  for (const f of files) {
    let sql = fs.readFileSync(path.join(dir, f), "utf8");
    if (fixTokenUsed && f.startsWith("20260118010000")) {
      // Runner-only workaround for the known replay issue (see header).
      sql = "DROP POLICY IF EXISTS onboardings_public_by_token ON public.onboardings;\n" + sql;
    }
    try {
      await db.exec(sql);
      if (process.argv.includes("--verbose")) console.log("OK   " + f);
    } catch (e) {
      ok = false;
      console.log("FAIL " + f + "\n     " + e.message + (e.position ? ` (position ${e.position})` : ""));
      if (e.position) {
        const p = Number(e.position);
        console.log("     near: " + JSON.stringify(sql.slice(Math.max(0, p - 120), p + 80)));
      }
      break;
    }
  }
  let failed = 0;
  if (ok) {
    const tests = require(path.join(__dirname, "rpc.test.cjs"));
    await tests(db);
    failed = tests.result.failed;
    if (process.argv.includes("--rls")) await require(path.join(__dirname, "rls-survey.cjs"))(db, tests.result);
  }
  await db.close();
  process.exit(ok && failed === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(2); });
