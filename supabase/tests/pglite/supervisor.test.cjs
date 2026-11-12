// Supervisor: requests reports, the Owner approves each one, and the Supervisor
// reads nothing else. Runs after the other suites and uses the RPC fixture.
module.exports = async function supervisor(db, { ID, tenantA }) {
  let passed = 0;
  const failures = [];
  const check = (name, cond, detail = "") => { if (cond) passed++; else failures.push(`${name}${detail ? " — " + detail : ""}`); };

  async function as(userId, sql, params = []) {
    try {
      return await db.transaction(async (tx) => {
        await tx.exec(`SET LOCAL ROLE authenticated`);
        await tx.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [userId]);
        return { rows: (await tx.query(sql, params)).rows };
      });
    } catch (e) {
      return { error: { message: e.message, code: e.code, hint: e.hint } };
    }
  }
  const ok = (name, r) => { check(name, !r.error, r.error && `${r.error.code} ${r.error.message}`); return r.rows?.[0]; };
  const err = (name, r, { code, hint, includes } = {}) => {
    const e = r.error;
    check(name, !!e && (!code || e.code === code) && (!hint || e.hint === hint) && (!includes || e.message.includes(includes)),
      e ? `${e.code} [${e.hint}] ${e.message}` : "expected an error, call succeeded");
  };
  const one = async (sql, params) => (await db.query(sql, params)).rows[0];
  const DENY = { code: "42501" };

  const sup = "00000000-0000-0000-0000-000000000031";
  const sup2 = "00000000-0000-0000-0000-000000000032";
  await db.exec(`
    ALTER TABLE auth.users DISABLE TRIGGER on_auth_user_created;
    INSERT INTO auth.users (id, email) VALUES ('${sup}', 'sup@a.test'), ('${sup2}', 'sup2@a.test');
    INSERT INTO public.users (id, tenant_id, first_name, last_name, email, role, status, branch_id) VALUES
      ('${sup}', '${tenantA}', 'Sade', 'Supervisor', 'sup@a.test', 'supervisor', 'active', '${ID.brA1}'),
      ('${sup2}', '${tenantA}', 'Bayo', 'Supervisor', 'sup2@a.test', 'supervisor', 'active', '${ID.brA1}');
  `);

  // ---------------- reads nothing directly ----------------
  const tables = (await db.query(`SELECT c.relname t FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r' ORDER BY 1`)).rows.map((r) => r.t);
  const seen = {};
  for (const t of tables) {
    const r = await as(sup, `SELECT count(*)::int n FROM public."${t}"`);
    seen[t] = r.error ? "denied" : r.rows[0].n;
  }
  // Branch names are visible so a Supervisor can choose one; everything else is theirs only.
  const allowed = { users: 1, branches: null, activities: null, notifications: null, report_requests: null, user_preferences: null };
  const leaks = Object.entries(seen).filter(([t, n]) => n !== "denied" && n > 0 && !(t in allowed));
  check("reads: no business table is visible", leaks.length === 0, JSON.stringify(Object.fromEntries(leaks)));
  check("reads: only their own user row", seen.users === 1, `users=${seen.users}`);
  check("reads: only their own audit entries", seen.activities === 0, `activities=${seen.activities}`);
  check("reads: no cost prices", (await as(sup, `SELECT unit_cost FROM public.products LIMIT 1`)).error?.code === "42501");

  // ---------------- request ----------------
  err("request_report: a rep cannot", await as(ID.repA1, `SELECT * FROM public.request_report('sales',null,CURRENT_DATE - 30,CURRENT_DATE,null)`), DENY);
  err("request_report: the owner does not need to", await as(ID.owner, `SELECT * FROM public.request_report('sales',null,CURRENT_DATE - 30,CURRENT_DATE,null)`), DENY);
  err("request_report: future dates", await as(sup, `SELECT * FROM public.request_report('sales',null,CURRENT_DATE,CURRENT_DATE + 3,null)`), { hint: "period" });
  err("request_report: backwards dates", await as(sup, `SELECT * FROM public.request_report('sales',null,CURRENT_DATE,CURRENT_DATE - 3,null)`), { hint: "period" });
  err("request_report: unknown report", await as(sup, `SELECT * FROM public.request_report('payroll',null,CURRENT_DATE - 3,CURRENT_DATE,null)`), { hint: "reportType" });
  err("request_report: another business's branch", await as(sup, `SELECT * FROM public.request_report('sales',$1,CURRENT_DATE - 3,CURRENT_DATE,null)`, [ID.brB1]), { hint: "branchId" });
  const salesReq = ok("request_report: sales, Ikeja, last 30 days", await as(sup,
    `SELECT * FROM public.request_report('sales',$1,CURRENT_DATE - 30,CURRENT_DATE,'Monthly review')`, [ID.brA1]));
  check("request: pending", salesReq?.status === "pending" && salesReq?.expires_at === null);
  err("request_report: the same request twice", await as(sup, `SELECT * FROM public.request_report('sales',$1,CURRENT_DATE - 30,CURRENT_DATE,null)`, [ID.brA1]), { hint: "form" });
  check("request: the Owner is notified", (await one(`SELECT count(*)::int n FROM public.notifications WHERE recipient_id=$1 AND entity_id=$2 AND type='report_requested'`, [ID.owner, salesReq?.id])).n === 1);
  check("request: the Supervisor sees it", ((await as(sup, `SELECT id FROM public.report_requests`)).rows ?? []).length === 1);
  check("request: the Owner sees it", ((await as(ID.owner, `SELECT id FROM public.report_requests WHERE id=$1`, [salesReq?.id])).rows ?? []).length === 1);
  check("request: another Supervisor does not", ((await as(sup2, `SELECT id FROM public.report_requests`)).rows ?? []).length === 0);
  check("request: a manager does not", ((await as(ID.mgrA1, `SELECT id FROM public.report_requests`)).rows ?? []).length === 0);
  check("request: no direct approval", (await as(sup, `UPDATE public.report_requests SET status='approved' WHERE id=$1`, [salesReq?.id])).error?.code === "42501");
  err("get_report_data: not before approval", await as(sup, `SELECT public.get_report_data($1)`, [salesReq?.id]), { hint: "form" });

  // ---------------- review ----------------
  err("review: the Supervisor cannot approve", await as(sup, `SELECT * FROM public.review_report_request($1,true,null)`, [salesReq?.id]), DENY);
  err("review: a manager cannot approve", await as(ID.mgrA1, `SELECT * FROM public.review_report_request($1,true,null)`, [salesReq?.id]), DENY);
  const approved = ok("review: the Owner approves", await as(ID.owner, `SELECT * FROM public.review_report_request($1,true,null)`, [salesReq?.id]));
  check("review: open for 7 days", approved?.status === "approved" && !!approved?.expires_at);
  check("review: the Supervisor is notified", (await one(`SELECT count(*)::int n FROM public.notifications WHERE recipient_id=$1 AND entity_id=$2 AND type='report_approved'`, [sup, salesReq?.id])).n === 1);
  err("review: only once", await as(ID.owner, `SELECT * FROM public.review_report_request($1,false,'Changed my mind')`, [salesReq?.id]), { hint: "form" });

  // ---------------- the report ----------------
  const data = (await as(sup, `SELECT public.get_report_data($1) d`, [salesReq?.id])).rows?.[0]?.d;
  const expected = await one(`SELECT count(*)::int n FROM public.sales WHERE tenant_id=$1 AND branch_id=$2 AND status='completed' AND sale_date >= CURRENT_DATE - 30`, [tenantA, ID.brA1]);
  check("report: every sale in scope", Array.isArray(data?.sales) && data.sales.length === expected.n && expected.n > 0, `${data?.sales?.length} vs ${expected.n}`);
  check("report: only the requested branch", data?.sales?.every((s) => s.branch_id === ID.brA1) && data?.branches?.length === 1);
  check("report: no cost prices anywhere", !JSON.stringify(data ?? {}).includes("unit_cost"));
  check("report: no customer names", !JSON.stringify(data ?? {}).includes("customer_id"));
  check("report: opening is audited", (await one(`SELECT count(*)::int n FROM public.activities WHERE entity_id=$1 AND action='Report opened'`, [salesReq?.id])).n === 1);
  err("get_report_data: another Supervisor cannot", await as(sup2, `SELECT public.get_report_data($1)`, [salesReq?.id]), DENY);
  err("get_report_data: a rep cannot", await as(ID.repA1, `SELECT public.get_report_data($1)`, [salesReq?.id]), DENY);
  ok("get_report_data: the Owner can", await as(ID.owner, `SELECT public.get_report_data($1)`, [salesReq?.id]));
  await db.query(`UPDATE public.report_requests SET expires_at = now() - interval '1 minute' WHERE id = $1`, [salesReq?.id]);
  err("get_report_data: closed after 7 days", await as(sup, `SELECT public.get_report_data($1)`, [salesReq?.id]), { includes: "ended" });

  const inv = ok("request_report: inventory, all branches", await as(sup, `SELECT * FROM public.request_report('inventory',null,null,null,null)`));
  check("inventory: period is today", String(inv?.period_from) === String(inv?.period_to) && !!inv?.period_from);
  err("review: rejecting needs a reason", await as(ID.owner, `SELECT * FROM public.review_report_request($1,false,'')`, [inv?.id]), { hint: "reason" });
  ok("review: the Owner rejects", await as(ID.owner, `SELECT * FROM public.review_report_request($1,false,'Not this week')`, [inv?.id]));
  check("reject: the Supervisor is told why", (await one(`SELECT message FROM public.notifications WHERE recipient_id=$1 AND entity_id=$2 AND type='report_rejected'`, [sup, inv?.id]))?.message?.includes("Not this week"));
  err("get_report_data: not when rejected", await as(sup, `SELECT public.get_report_data($1)`, [inv?.id]), { hint: "form" });
  const inv2 = ok("request_report: inventory again", await as(sup, `SELECT * FROM public.request_report('inventory',$1,null,null,null)`, [ID.brA1]));
  ok("review: approved", await as(ID.owner, `SELECT * FROM public.review_report_request($1,true,null)`, [inv2?.id]));
  const invData = (await as(sup, `SELECT public.get_report_data($1) d`, [inv2?.id])).rows?.[0]?.d;
  check("inventory report: stock rows for the branch, no sales", invData?.inventory?.length > 0 && invData?.sales?.length === 0 && invData.inventory.every((r) => r.branch_id === ID.brA1));

  // ---------------- other roles cannot touch the supervisor flow ----------------
  check("role: the constraint accepts supervisor", (await one(`SELECT role FROM public.users WHERE id=$1`, [sup])).role === "supervisor");

  console.log(`\nSupervisor tests: ${passed} passed, ${failures.length} failed`);
  for (const f of failures) console.log("  FAIL " + f);
  module.exports.result = { passed, failed: failures.length };
};
