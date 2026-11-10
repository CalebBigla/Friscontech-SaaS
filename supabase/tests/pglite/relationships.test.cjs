// End-to-end role relationships, as the app uses them:
//   rep -> storekeeper: stock request, approval, issue, acknowledgement
//   storekeeper -> manager (-> Owner): stock additions awaiting approval
// plus who can see what at each step, and that nobody can skip an RPC by
// writing a table directly.
module.exports = async function relationships(db, { ID, tenantA }) {
  let passed = 0;
  const failures = [];
  const check = (name, cond, detail = "") => { if (cond) passed++; else failures.push(`${name}${detail ? " — " + detail : ""}`); };

  async function as(userId, sql, params = []) {
    try {
      return await db.transaction(async (tx) => {
        await tx.exec(`SET LOCAL ROLE authenticated`);
        await tx.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [userId]);
        const r = await tx.query(sql, params);
        return { rows: r.rows, affected: r.affectedRows };
      });
    } catch (e) {
      return { error: { message: e.message, code: e.code, hint: e.hint } };
    }
  }
  const ok = (name, r) => { check(name, !r.error, r.error && `${r.error.code} ${r.error.message}`); return r.rows?.[0]; };
  const one = async (sql, params) => (await db.query(sql, params)).rows[0];
  const sees = async (userId, table, id) => ((await as(userId, `SELECT 1 FROM public.${table} WHERE id = $1`, [id])).rows ?? []).length === 1;
  const onHand = async (productId) => (await one(`SELECT quantity_on_hand q FROM public.inventory_records WHERE branch_id=$1 AND product_id=$2`, [ID.brA1, productId]))?.q;
  const notified = async (userId, entityId) => (await one(`SELECT count(*)::int n FROM public.notifications WHERE recipient_id=$1 AND entity_id=$2`, [userId, String(entityId)])).n;
  const DENIED = (r) => r.error?.code === "42501";

  const product = ok("setup: product", await as(ID.owner, `SELECT * FROM public.create_product('Relay Item','relay-1','Home','Piece',500,300,5,null)`));
  ok("setup: 100 in Ikeja", await as(ID.owner, `SELECT public.add_stock($1,$2,100,null,null,'2028-01-01',false,null,null)`, [ID.brA1, product.id]));

  // ---------------- rep -> storekeeper ----------------
  const request = ok("rep: raises a stock request", await as(ID.repA1,
    `SELECT * FROM public.create_stock_requests($1,$2::jsonb,'For a customer',null)`, [ID.brA1, JSON.stringify([{ product_id: product.id, quantity: 12 }])]));
  check("request: the rep sees it", await sees(ID.repA1, "stock_requests", request.id));
  check("request: their branch storekeeper sees it", await sees(ID.skA1, "stock_requests", request.id));
  check("request: the Owner sees it", await sees(ID.owner, "stock_requests", request.id));
  check("request: another rep does not", !(await sees(ID.repA2, "stock_requests", request.id)));
  check("request: another branch's storekeeper does not", !(await sees(ID.skA2, "stock_requests", request.id)));
  check("request: another business does not", !(await sees(ID.skB1, "stock_requests", request.id)));
  check("request: the storekeeper is notified", (await notified(ID.skA1, request.id)) > 0);

  ok("storekeeper: approves", await as(ID.skA1, `SELECT public.approve_stock_request($1)`, [request.id]));
  check("approve: the rep is notified", (await notified(ID.repA1, request.id)) > 0);
  check("approve: stock not moved yet", (await onHand(product.id)) === 100);
  ok("storekeeper: issues 12", await as(ID.skA1, `SELECT public.fulfil_stock_request($1,12)`, [request.id]));
  check("issue: branch stock goes down", (await onHand(product.id)) === 88);
  ok("rep: confirms receipt", await as(ID.repA1, `SELECT public.acknowledge_stock_request($1)`, [request.id]));
  const done = await one(`SELECT status, quantity_fulfilled f, acknowledged_at IS NOT NULL ack FROM public.stock_requests WHERE id=$1`, [request.id]);
  check("request: fulfilled and acknowledged", done.status === "fulfilled" && done.f === 12 && done.ack, JSON.stringify(done));
  const sale = ok("rep: sells 5 of the issued units", await as(ID.repA1,
    `SELECT * FROM public.record_sale($1,CURRENT_DATE,null,'Walk-in','',$2::jsonb,null)`, [ID.brA1, JSON.stringify([{ product_id: product.id, quantity: 5 }])]));
  check("sale: uses the issued units, not the branch", sale?.quantity_from_rep_stock === 5 && (await onHand(product.id)) === 88);

  // ---------------- storekeeper -> manager -> Owner ----------------
  const addition = ok("storekeeper: asks to add 40", await as(ID.skA1,
    `SELECT * FROM public.add_stock($1,$2,40,'Supplier','LOT-R','2028-02-01',false,null,null)`, [ID.brA1, product.id]));
  check("addition: waits for approval", addition?.status === "pending" && (await onHand(product.id)) === 88);
  check("addition: the storekeeper sees it", await sees(ID.skA1, "approval_requests", addition.id));
  check("addition: their branch manager sees it", await sees(ID.mgrA1, "approval_requests", addition.id));
  check("addition: the Owner sees it", await sees(ID.owner, "approval_requests", addition.id));
  check("addition: another branch's manager does not", !(await sees(ID.mgrA2, "approval_requests", addition.id)));
  check("addition: a rep does not", !(await sees(ID.repA1, "approval_requests", addition.id)));
  check("addition: another business does not", !(await sees(ID.mgrB1, "approval_requests", addition.id)));
  check("addition: their branch manager is notified", (await notified(ID.mgrA1, addition.id)) > 0);
  check("addition: the storekeeper can't approve it", !!(await as(ID.skA1, `SELECT * FROM public.approve_requests(ARRAY[$1]::uuid[])`, [addition.id])).error);
  check("addition: another branch's manager can't approve it", !!(await as(ID.mgrA2, `SELECT * FROM public.approve_requests(ARRAY[$1]::uuid[])`, [addition.id])).error);
  ok("manager: approves", await as(ID.mgrA1, `SELECT * FROM public.approve_requests(ARRAY[$1]::uuid[])`, [addition.id]));
  check("approve: stock added once", (await onHand(product.id)) === 128);
  const reviewed = await one(`SELECT status, reviewed_by FROM public.approval_requests WHERE id=$1`, [addition.id]);
  check("approve: recorded with the reviewer", reviewed.status === "approved" && reviewed.reviewed_by === ID.mgrA1, JSON.stringify(reviewed));
  check("approve: the storekeeper is notified", (await notified(ID.skA1, addition.id)) > 0);

  const second = ok("storekeeper: asks to add 10 more", await as(ID.skA1,
    `SELECT * FROM public.add_stock($1,$2,10,null,'LOT-S','2028-03-01',false,null,null)`, [ID.brA1, product.id]));
  ok("Owner: can reject it", await as(ID.owner, `SELECT public.reject_request($1,'Not ordered')`, [second.id]));
  check("reject: no stock added", (await onHand(product.id)) === 128);

  // ---------------- no skipping the RPCs ----------------
  const pending = ok("setup: another pending addition", await as(ID.skA1,
    `SELECT * FROM public.add_stock($1,$2,7,null,'LOT-T','2028-04-01',false,null,null)`, [ID.brA1, product.id]));
  check("direct: storekeeper can't approve their own request", DENIED(await as(ID.skA1, `UPDATE public.approval_requests SET status='approved' WHERE id=$1`, [pending.id])));
  check("direct: manager can't approve by UPDATE", DENIED(await as(ID.mgrA1, `UPDATE public.approval_requests SET status='approved' WHERE id=$1`, [pending.id])));
  check("direct: Owner can't approve by UPDATE either", DENIED(await as(ID.owner, `UPDATE public.approval_requests SET status='approved' WHERE id=$1`, [pending.id])));
  check("direct: no forged approved request", DENIED(await as(ID.skA1,
    `INSERT INTO public.approval_requests (tenant_id, type, status, branch_id, requested_by, requested_at) VALUES ($1,'stock_addition','approved',$2,$3,now())`,
    [tenantA, ID.brA1, ID.skA1])));
  check("direct: approval still pending", (await one(`SELECT status FROM public.approval_requests WHERE id=$1`, [pending.id])).status === "pending");
  const sr = ok("setup: another stock request", await as(ID.repA1,
    `SELECT * FROM public.create_stock_requests($1,$2::jsonb,null,null)`, [ID.brA1, JSON.stringify([{ product_id: product.id, quantity: 3 }])]));
  check("direct: rep can't mark their request fulfilled", DENIED(await as(ID.repA1, `UPDATE public.stock_requests SET status='fulfilled', quantity_fulfilled=3 WHERE id=$1`, [sr.id])));
  check("direct: storekeeper can't approve by UPDATE", DENIED(await as(ID.skA1, `UPDATE public.stock_requests SET status='approved' WHERE id=$1`, [sr.id])));
  check("direct: nobody deletes a request", DENIED(await as(ID.owner, `DELETE FROM public.stock_requests WHERE id=$1`, [sr.id])));
  for (const [table, who] of [["inventory_records", ID.skA1], ["stock_batches", ID.skA1], ["payments", ID.repA1], ["customer_payments", ID.repA1],
    ["expenses", ID.mgrA1], ["manager_remittances", ID.mgrA1], ["owner_remittances", ID.owner], ["targets", ID.owner], ["users", ID.owner], ["tenants", ID.owner]]) {
    check(`direct: ${table} can't be changed`, DENIED(await as(who, `UPDATE public.${table} SET id = id WHERE false`)));
  }
  check("direct: a sale can't be edited", DENIED(await as(ID.repA1, `UPDATE public.sales SET quantity = 1 WHERE id=$1`, [sale.id])));
  check("direct: a sale can't be deleted", DENIED(await as(ID.owner, `DELETE FROM public.sales WHERE id=$1`, [sale.id])));
  check("still allowed: marking one's own notification read",
    !(await as(ID.repA1, `UPDATE public.notifications SET read_at = now() WHERE recipient_id = $1`, [ID.repA1])).error);
  check("still allowed: the Owner edits a branch",
    !(await as(ID.owner, `UPDATE public.branches SET phone = phone WHERE id = $1`, [ID.brA1])).error);
  check("still readable: the rep's own requests", (await as(ID.repA1, `SELECT count(*)::int n FROM public.stock_requests`)).rows?.[0]?.n >= 2);

  console.log(`\nRelationship tests: ${passed} passed, ${failures.length} failed`);
  for (const f of failures) console.log("  FAIL " + f);
  module.exports.result = { passed, failed: failures.length };
};
