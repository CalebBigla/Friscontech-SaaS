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
  const refused = (name, r, pattern) => check(name, pattern.test(r.error ?? ""), r.error ?? "succeeded");
  const GUARANTOR = `'{"yearsKnown":"5","relationship":"Uncle","character":"Honest","signature":"G. Uncle","signedDate":"2026-10-24"}'::jsonb`;
  const onBehalf = (rawToken) => call("anon", null, `SELECT * FROM public.submit_guarantor_on_behalf($1, ${GUARANTOR})`, [rawToken]);

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
  // Invitee files in the onboarding-files bucket, as the storage API does them (anon).
  const obj = `${invite?.id}/photo/me.jpg`;
  ok("storage: invitee uploads to their onboarding folder", await call("anon", null,
    `INSERT INTO storage.objects (bucket_id, name) VALUES ('onboarding-files', $1) RETURNING id`, [obj]));
  const seen = await call("anon", null, `SELECT name FROM storage.objects WHERE name = $1`, [obj]);
  check("storage: invitee can preview their file", seen.rows?.length === 1, seen.error ?? JSON.stringify(seen.rows));
  const del = await call("anon", null, `DELETE FROM storage.objects WHERE name = $1 RETURNING id`, [obj]);
  check("storage: invitee can remove their file", del.rows?.length === 1, del.error ?? JSON.stringify(del.rows));
  const stray = await call("anon", null,
    `INSERT INTO storage.objects (bucket_id, name) VALUES ('onboarding-files', '00000000-0000-0000-0000-00000000dead/photo/x.jpg')`);
  check("storage: upload to an unknown onboarding is refused", /row-level security/.test(stray.error ?? ""), stray.error);
  const leak = await call("anon", null, `SELECT count(*)::int n FROM public.onboardings`);
  check("storage fix does not let anon read onboardings", leak.error || leak.rows?.[0]?.n === 0, JSON.stringify(leak));

  refused("submit_onboarding: refused before the guarantor responds", await call("anon", null,
    `SELECT * FROM public.submit_onboarding($1, '{"firstName":"Nia","lastName":"New","email":"nia@a.test"}'::jsonb, 'nia@a.test')`, [raw]),
    /guarantor form is not complete/);
  const gToken = ok("send_guarantor_link", await call("anon", null, `SELECT public.send_guarantor_link($1) t`, [raw]))?.t;
  if (gToken) {
    ok("get_onboarding_for_guarantor", await call("anon", null, `SELECT * FROM public.get_onboarding_for_guarantor($1)`, [gToken]));
    ok("submit_guarantor", await call("anon", null,
      `SELECT * FROM public.submit_guarantor($1, '{"yearsKnown":"5","relationship":"Uncle","character":"Honest","signature":"G. Uncle","signedDate":"2026-10-24"}'::jsonb)`, [gToken]));
  }
  refused("on behalf: refused once the guarantor responded", await onBehalf(raw), /already completed/);
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
  const late = await call("anon", null,
    `INSERT INTO storage.objects (bucket_id, name) VALUES ('onboarding-files', $1)`, [`${invite?.id}/photo/late.jpg`]);
  check("storage: no uploads once the account exists", /row-level security/.test(late.error ?? ""), late.error);
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
  refused("on behalf: incomplete answers refused", await call("anon", null,
    `SELECT * FROM public.submit_guarantor_on_behalf($1, '{"yearsKnown":"5"}'::jsonb)`, [raw2]), /answer every required/);
  ok("on behalf: applicant fills the guarantor form", await onBehalf(raw2));
  const g2 = (await db.query(`SELECT guarantor_status, guarantor_response ->> 'filledBy' AS by FROM public.onboardings WHERE id = $1`, [invite2?.id])).rows[0];
  check("on behalf: completed and marked as filled by staff", g2?.guarantor_status === "completed" && g2?.by === "staff", JSON.stringify(g2));
  refused("on behalf: second time refused", await onBehalf(raw2), /already completed/);
  ok("submit second onboarding", await call("anon", null,
    `SELECT * FROM public.submit_onboarding($1, '{"email":"x@a.test"}'::jsonb, 'x@a.test')`, [raw2]));
  ok("reject_onboarding", await call("authenticated", ID.owner,
    `SELECT * FROM public.reject_onboarding($1, 'Incomplete documents')`, [invite2?.id]));

  // Company e-mail ID: same names → first to submit keeps it, later ones get 01, 02.
  async function inviteNamed(n) {
    const rawN = `dup-token-${n}`;
    const h = (await db.query(`SELECT public.hash_token($1) h`, [rawN])).rows[0].h;
    const row = ok(`create duplicate-name invite ${n}`, await call("authenticated", ID.owner,
      `INSERT INTO public.onboardings (tenant_id, created_by, employee_id, job_title, department, start_date, status,
         token_hash, token_expires_at, step, data)
       VALUES ($1,$2,$3,'Sales Rep','Sales',CURRENT_DATE,'invited',$4, now() + interval '7 days', 0, '{}'::jsonb) RETURNING id`,
      [tenantA, ID.owner, `FT-DUP-${n}`, h]));
    ok(`duplicate-name guarantor ${n}`, await onBehalf(rawN));
    return { raw: rawN, id: row?.id };
  }
  const submitAs = (inv, email) => call("anon", null,
    `SELECT * FROM public.submit_onboarding($1, '{"firstName":"Ngozi","lastName":"Umeh","preferredEmailId":"ngozi.umeh"}'::jsonb, $2)`,
    [inv.raw, email]);
  const idOf = async (inv) => (await db.query(`SELECT data ->> 'preferredEmailId' v FROM public.onboardings WHERE id = $1`, [inv.id])).rows[0]?.v;
  const [first, second, third] = [await inviteNamed(1), await inviteNamed(2), await inviteNamed(3)];
  ok("same names: first submits", await submitAs(first, "ngozi1@a.test"));
  check("same names: first keeps ngozi.umeh", (await idOf(first)) === "ngozi.umeh", await idOf(first));
  ok("same names: second submits", await submitAs(second, "ngozi2@a.test"));
  check("same names: second gets ngozi.umeh01", (await idOf(second)) === "ngozi.umeh01", await idOf(second));
  ok("same names: second resubmits", await submitAs(second, "ngozi2@a.test"));
  check("same names: resubmit keeps ngozi.umeh01", (await idOf(second)) === "ngozi.umeh01", await idOf(second));
  ok("same names: first rejected", await call("authenticated", ID.owner,
    `SELECT * FROM public.reject_onboarding($1, 'Duplicate application')`, [first.id]));
  ok("same names: third submits", await submitAs(third, "ngozi3@a.test"));
  check("same names: a rejected onboarding frees ngozi.umeh", (await idOf(third)) === "ngozi.umeh", await idOf(third));

  console.log(`\nOnboarding tests: ${passed} passed, ${failures.length} failed`);
  for (const f of failures) console.log("  FAIL " + f);
  module.exports.result = { passed, failed: failures.length };
};
