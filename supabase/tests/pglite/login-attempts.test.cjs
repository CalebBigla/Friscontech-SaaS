// Login attempt limit: 5 wrong passwords per email within 15 minutes lock that
// email for 15 minutes. Calls run as `anon` (before sign-in) or `authenticated`.
module.exports = async function loginAttempts(db, { ID }) {
  let passed = 0;
  const failures = [];
  const check = (name, cond, detail = "") => { if (cond) passed++; else failures.push(`${name}${detail ? " — " + detail : ""}`); };

  async function as(role, userId, sql, params = []) {
    try {
      return await db.transaction(async (tx) => {
        await tx.exec(`SET LOCAL ROLE ${role}`);
        if (userId) await tx.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [userId]);
        return { rows: (await tx.query(sql, params)).rows };
      });
    } catch (e) {
      return { error: { message: e.message, code: e.code } };
    }
  }
  const status = async (email) => (await as("anon", null, `SELECT public.login_attempt_status($1) s`, [email])).rows?.[0]?.s;
  const fail = async (email) => (await as("anon", null, `SELECT * FROM public.record_login_failure($1)`, [email])).rows?.[0];

  const email = "Lock.Me@Example.test";
  check("status: allowed before any failure", (await status(email)) === 0);
  const first = await fail(email);
  check("failure 1: 4 attempts left", first?.attempts_left === 4 && first?.locked_seconds === 0, JSON.stringify(first));
  await fail(" lock.me@example.test "); await fail(email);
  const fourth = await fail(email);
  check("failure 4: case and spaces count as the same email", fourth?.attempts_left === 1, JSON.stringify(fourth));
  check("status: still allowed after 4", (await status(email)) === 0);
  const fifth = await fail(email);
  check("failure 5: locks for 15 minutes", fifth?.attempts_left === 0 && fifth?.locked_seconds === 900, JSON.stringify(fifth));
  const locked = await status(email);
  check("status: locked after 5", locked > 890 && locked <= 900, `got ${locked}`);
  const during = await fail(email);
  const lockAfter = (await db.query(`SELECT locked_until FROM app_private.login_attempts WHERE email = 'lock.me@example.test'`)).rows[0];
  check("failure during the lock: does not extend it", during?.attempts_left === 0 && during?.locked_seconds <= 900 && !!lockAfter, JSON.stringify(during));
  check("status: other emails unaffected", (await status("someone.else@example.test")) === 0);

  // Lock expires: the next wrong password starts a fresh count.
  await db.query(`UPDATE app_private.login_attempts SET locked_until = now() - interval '1 second' WHERE email = 'lock.me@example.test'`);
  check("status: allowed once the lock ends", (await status(email)) === 0);
  const afterLock = await fail(email);
  check("after the lock: count starts again", afterLock?.attempts_left === 4 && afterLock?.locked_seconds === 0, JSON.stringify(afterLock));

  // Failures older than 15 minutes do not add up.
  for (let i = 0; i < 3; i++) await fail(email);
  await db.query(`UPDATE app_private.login_attempts SET window_started_at = now() - interval '16 minutes' WHERE email = 'lock.me@example.test'`);
  const fresh = await fail(email);
  check("old failures expire after 15 minutes", fresh?.attempts_left === 4, JSON.stringify(fresh));

  // A successful sign-in clears only the signed-in user's own count.
  const owner = (await db.query(`SELECT email FROM auth.users WHERE id = $1`, [ID.owner])).rows[0];
  if (!owner?.email) await db.query(`UPDATE auth.users SET email = 'owner@a.test' WHERE id = $1`, [ID.owner]);
  const ownerEmail = owner?.email ?? "owner@a.test";
  for (let i = 0; i < 5; i++) await fail(ownerEmail);
  check("owner: locked", (await status(ownerEmail)) > 0);
  check("clear: anon cannot clear", !!(await as("anon", null, `SELECT public.clear_login_failures()`)).error);
  const cleared = await as("authenticated", ID.owner, `SELECT public.clear_login_failures()`);
  check("clear: signed-in user clears their own", !cleared.error && (await status(ownerEmail)) === 0, JSON.stringify(cleared.error));
  check("clear: leaves other emails alone", (await status(email)) === 0
    && (await db.query(`SELECT failures FROM app_private.login_attempts WHERE email = 'lock.me@example.test'`)).rows[0]?.failures === 1);

  // Nothing about the counts is reachable through the API.
  check("table: anon cannot read it", !!(await as("anon", null, `SELECT * FROM app_private.login_attempts`)).error);
  check("table: authenticated cannot read it", !!(await as("authenticated", ID.owner, `SELECT * FROM app_private.login_attempts`)).error);
  const blank = await fail("   ");
  check("blank email: not stored", blank?.attempts_left === 5
    && (await db.query(`SELECT count(*)::int n FROM app_private.login_attempts WHERE email = ''`)).rows[0].n === 0);

  console.log(`
Login attempt tests: ${passed} passed, ${failures.length} failed`);
  for (const f of failures) console.log("  FAIL " + f);
  module.exports.result = { passed, failed: failures.length };
};
