// Onboarding flow tests: every onboarding RPC the app calls, in the order a real
// invite goes through, as the role the app uses (anon for the invitee and
// guarantor, authenticated for the owner).
module.exports = async function onboarding(db, { ID, tenantA }) {
  let passed = 0;
  const failures = [];
  const check = (name, cond, detail = "") => { if (cond) passed++; else failures.push(`${name}${detail ? " — " + detail : ""}`); };

  async function call(role, userId, sql, params = []) {
    try {
      return await db.transaction(async (tx) => {
        await tx.exec(`SET LOCAL ROLE ${role}`);
        if (userId) await tx.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [userId]);
        return { rows: (await tx.query(sql, params)).rows };
      });
    } catch (e) {
      return { error: `${e.code} ${e.message}` };
    }
  }
  const ok = (name, r) => { check(name, !r.error, r.error); return r.rows?.[0]; };

  // Invite exactly as onboardingService.createInvite does (direct insert by the owner).
  const raw = "invite-token-raw-0001";
  const hash = (await db.query(`SELECT public.hash_token($1) h`, [raw])).rows[0].h;
  const invite = ok("create invite (owner insert)", await call("authenticated", ID.owner,
    `INSERT INTO public.onboardings (tenant_id, created_by, employee_id, job_title, department, start_date, status,
       token_hash, token_expires_at, step, data)
     VALUES ($1,$2,'FT-000001','Sales Rep','Sales',CURRENT_DATE,'invited',$3, now() + interval '7 days', 0,
       '{"firstName":"Nia","lastName":"New","email":"nia@a.test"}'::jsonb) RETURNING id`, [tenantA, ID.owner, hash]));

  ok("get_onboarding_by_token", await call("anon", null, `SELECT * FROM public.get_onboarding_by_token($1)`, [raw]));
  ok("save_onboarding_progress", await call("anon", null,
    `SELECT * FROM public.save_onboarding_progress($1, '{"firstName":"Nia","lastName":"New","email":"nia@a.test"}'::jsonb, 2, NULL)`, [raw]));
  ok("register_onboarding_file", await call("anon", null,
    `SELECT public.register_onboarding_file($1, 'photo', 'me.jpg', $2 || '/me.jpg', 1000, 'image/jpeg')`, [raw, invite?.id]));
  const files = ok("list_onboarding_files", await call("anon", null, `SELECT * FROM public.list_onboarding_files($1)`, [raw]));
  if (files) ok("delete_onboarding_file", await call("anon", null, `SELECT public.delete_onboarding_file($1, $2)`, [raw, files.id]));
  const gToken = ok("send_guarantor_link", await call("anon", null, `SELECT public.send_guarantor_link($1) t`, [raw]))?.t;
  if (gToken) {
    ok("get_onboarding_for_guarantor", await call("anon", null, `SELECT * FROM public.get_onboarding_for_guarantor($1)`, [gToken]));
    ok("submit_guarantor", await call("anon", null,
      `SELECT * FROM public.submit_guarantor($1, '{"yearsKnown":"5","relationship":"Uncle","character":"Honest","signature":"G. Uncle","signedDate":"2026-10-24"}'::jsonb)`, [gToken]));
  }
  ok("submit_onboarding", await call("anon", null,
    `SELECT * FROM public.submit_onboarding($1, '{"firstName":"Nia","lastName":"New","email":"nia@a.test"}'::jsonb, 'nia@a.test')`, [raw]));
  ok("submit_onboarding: retry before sign-up", await call("anon", null,
    `SELECT * FROM public.submit_onboarding($1, '{"firstName":"Nia","lastName":"New","email":"nia@a.test"}'::jsonb, 'nia@a.test')`, [raw]));

  // Sign-up: the handle_new_user trigger links a pending profile to the invite.
  const newUser = "00000000-0000-0000-0000-000000000099";
  await db.exec(`ALTER TABLE auth.users ENABLE TRIGGER on_auth_user_created`);
  ok("sign-up creates pending profile", await call("postgres", null,
    `INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES ($1, 'nia@a.test',
       jsonb_build_object('onboarding_id', $2::text, 'onboarding_token_hash', $3::text, 'first_name', 'Nia', 'last_name', 'New')) RETURNING id`,
    [newUser, invite?.id, hash]));
  const profile = (await db.query(`SELECT status, role FROM public.users WHERE id = $1`, [newUser])).rows[0];
  check("pending until the owner approves", profile?.status === "pending" && profile?.role === null, JSON.stringify(profile));

  ok("review_guarantor", await call("authenticated", ID.owner,
    `SELECT * FROM public.review_guarantor($1, 'accepted', NULL)`, [invite?.id]));
  ok("approve_onboarding", await call("authenticated", ID.owner,
    `SELECT * FROM public.approve_onboarding($1, 'sales_rep', $2)`, [invite?.id, ID.brA1]));
  const approved = (await db.query(`SELECT status, role FROM public.users WHERE id = $1`, [newUser])).rows[0];
  check("approved member is active with a role", approved?.status === "active" && approved?.role === "sales_rep", JSON.stringify(approved));

  // A second invite, rejected.
  const raw2 = "invite-token-raw-0002";
  const hash2 = (await db.query(`SELECT public.hash_token($1) h`, [raw2])).rows[0].h;
  const invite2 = ok("create second invite", await call("authenticated", ID.owner,
    `INSERT INTO public.onboardings (tenant_id, created_by, employee_id, job_title, department, start_date, status,
       token_hash, token_expires_at, step, data)
     VALUES ($1,$2,'FT-000002','Storekeeper','Ops',CURRENT_DATE,'invited',$3, now() + interval '7 days', 0, '{}'::jsonb) RETURNING id`,
    [tenantA, ID.owner, hash2]));
  ok("submit second onboarding", await call("anon", null,
    `SELECT * FROM public.submit_onboarding($1, '{"email":"x@a.test"}'::jsonb, 'x@a.test')`, [raw2]));
  ok("reject_onboarding", await call("authenticated", ID.owner,
    `SELECT * FROM public.reject_onboarding($1, 'Incomplete documents')`, [invite2?.id]));

  console.log(`\nOnboarding tests: ${passed} passed, ${failures.length} failed`);
  for (const f of failures) console.log("  FAIL " + f);
  module.exports.result = { passed, failed: failures.length };
};
