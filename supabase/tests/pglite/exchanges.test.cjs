// Exchanges: rep requests for a customer, storekeeper approves and fulfils, rep
// acknowledges; the customer's ledger moves by the value difference.
module.exports = async function exchanges(db, { ID, tenantA }) {
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
  const close = (a, b) => Math.abs(Number(a) - Number(b)) < 0.005;
  const onHand = async (productId) => (await one(`SELECT quantity_on_hand q FROM public.inventory_records WHERE branch_id=$1 AND product_id=$2`, [ID.brA1, productId]))?.q;
  const batches = async (productId) => Number((await one(`SELECT COALESCE(sum(quantity_remaining),0) n FROM public.stock_batches WHERE branch_id=$1 AND product_id=$2`, [ID.brA1, productId])).n);
  // What the customer owes: positive = owes, negative = in credit (get_customer_balance).
  const balance = async (customerId) => Number((await one(`SELECT public.get_customer_balance($1) b`, [customerId])).b);
  const ex = async (id) => one(`SELECT * FROM public.stock_exchanges WHERE id=$1`, [id]);

  // Setup: three products at different prices, stock with batches, one customer.
  const mk = async (name, sku, price) => ok(`setup: ${name}`, await as(ID.owner, `SELECT * FROM public.create_product($1,$2,'Home','Piece',$3,1,1,null)`, [name, sku, price]));
  const shirt = await mk("Shirt", "ex-shirt", 1000);
  const shirtL = await mk("Shirt L", "ex-shirt-l", 1000);
  const jacket = await mk("Jacket", "ex-jacket", 3000);
  const sock = await mk("Sock", "ex-sock", 200);
  for (const p of [shirt, shirtL, jacket, sock]) {
    ok(`setup: stock ${p.name}`, await as(ID.owner, `SELECT public.add_stock($1,$2,50,null,'LOT-EX','2028-01-01',false,null,null)`, [ID.brA1, p.id]));
  }
  // Reps sell only stock issued to them: request, approve, issue.
  for (const [p, n] of [[shirt, 20], [jacket, 5]]) {
    const r = (await as(ID.repA1, `SELECT * FROM public.create_stock_requests($1,$2::jsonb,null,null)`, [ID.brA1, JSON.stringify([{ product_id: p.id, quantity: n }])])).rows?.[0];
    await as(ID.skA1, `SELECT public.approve_stock_request($1)`, [r?.id]);
    ok(`setup: ${n} ${p.name} issued to the rep`, await as(ID.skA1, `SELECT public.fulfil_stock_request($1,$2)`, [r?.id, n]));
  }
  const cust = ok("setup: customer", await as(ID.repA1, `SELECT * FROM public.create_customer('Exchange Co','Eze','0805 111 0001',null,'Ikeja')`));
  const sell = async (productId, quantity, extra = {}) => (await as(ID.repA1,
    `SELECT * FROM public.record_sale($1,CURRENT_DATE,$2,null,null,$3::jsonb,null)`,
    [ID.brA1, cust.id, JSON.stringify([{ product_id: productId, quantity, ...extra }])])).rows?.[0];
  const sale = await sell(shirt.id, 4);
  check("setup: customer sale of 4 shirts", sale?.quantity === 4 && close(sale?.line_total, 4000));
  check("setup: owes 4,000", close(await balance(cust.id), 4000));
  const shirtsBefore = await onHand(shirt.id);

  // ---------------- request ----------------
  const req = (userId, saleId, ret, prodId, qty, reason = "Wrong size") => as(userId,
    `SELECT * FROM public.request_exchange($1,$2,$3,$4,$5)`, [saleId, ret, prodId, qty, reason]);
  err("request: storekeeper cannot", await req(ID.skA1, sale.id, 1, shirtL.id, 1), DENY);
  err("request: owner cannot", await req(ID.owner, sale.id, 1, shirtL.id, 1), DENY);
  err("request: another rep's customer", await req(ID.repA2, sale.id, 1, shirtL.id, 1), { hint: "saleId" });
  err("request: more than was sold", await req(ID.repA1, sale.id, 5, shirtL.id, 1), { hint: "returnQuantity" });
  err("request: no reason", await req(ID.repA1, sale.id, 1, shirtL.id, 1, " "), { hint: "reason" });
  const walkIn = (await as(ID.repA1, `SELECT * FROM public.record_sale($1,CURRENT_DATE,null,'W','',$2::jsonb,null)`, [ID.brA1, JSON.stringify([{ product_id: shirt.id, quantity: 1 }])])).rows?.[0];
  err("request: walk-in sales have no account", await req(ID.repA1, walkIn?.id, 1, shirtL.id, 1), { hint: "saleId" });

  const same = ok("request: 2 shirts for 2 larger shirts", await req(ID.repA1, sale.id, 2, shirtL.id, 2));
  check("request: pending, numbered EX-", same?.status === "pending" && /^EX-\d+$/.test(same?.id ?? ""), JSON.stringify(same));
  check("request: storekeeper notified", (await one(`SELECT count(*)::int n FROM public.notifications WHERE recipient_id=$1 AND entity_id=$2`, [ID.skA1, same?.id])).n === 1);
  err("request: units already in an open exchange", await req(ID.repA1, sale.id, 3, shirtL.id, 1), { hint: "returnQuantity" });

  // ---------------- visibility ----------------
  const sees = async (userId, id) => ((await as(userId, `SELECT id FROM public.stock_exchanges WHERE id=$1`, [id])).rows ?? []).length === 1;
  check("visible: the rep", await sees(ID.repA1, same.id));
  check("visible: the branch storekeeper", await sees(ID.skA1, same.id));
  check("visible: the branch manager", await sees(ID.mgrA1, same.id));
  check("visible: the Owner", await sees(ID.owner, same.id));
  check("hidden: another rep", !(await sees(ID.repA2, same.id)));
  check("hidden: another branch's storekeeper", !(await sees(ID.skA2, same.id)));
  check("direct write refused", (await as(ID.skA1, `UPDATE public.stock_exchanges SET status='fulfilled' WHERE id=$1`, [same.id])).error?.code === "42501");

  // ---------------- approve / fulfil / acknowledge ----------------
  err("fulfil: not before approval", await as(ID.skA1, `SELECT * FROM public.fulfil_exchange($1)`, [same.id]), { hint: "form" });
  err("approve: the rep cannot", await as(ID.repA1, `SELECT * FROM public.approve_exchange($1)`, [same.id]), DENY);
  err("approve: another branch's storekeeper cannot", await as(ID.skA2, `SELECT * FROM public.approve_exchange($1)`, [same.id]), DENY);
  ok("approve: branch storekeeper", await as(ID.skA1, `SELECT * FROM public.approve_exchange($1)`, [same.id]));
  check("approve: rep notified", (await one(`SELECT count(*)::int n FROM public.notifications WHERE recipient_id=$1 AND entity_id=$2 AND type='exchange_approved'`, [ID.repA1, same.id])).n === 1);
  err("acknowledge: not before fulfilment", await as(ID.repA1, `SELECT * FROM public.acknowledge_exchange($1)`, [same.id]), { hint: "form" });
  const shirtsAtFulfil = await onHand(shirt.id);
  const larger = await onHand(shirtL.id);
  const done = ok("fulfil: storekeeper", await as(ID.skA1, `SELECT * FROM public.fulfil_exchange($1)`, [same.id]));
  check("fulfil: returned shirts back in stock", (await onHand(shirt.id)) === shirtsAtFulfil + 2, `${await onHand(shirt.id)} vs ${shirtsAtFulfil}+2`);
  check("fulfil: larger shirts leave stock", (await onHand(shirtL.id)) === larger - 2);
  check("fulfil: batches still match stock on hand", (await batches(shirt.id)) === (await onHand(shirt.id)) && (await batches(shirtL.id)) === (await onHand(shirtL.id)),
    `shirt ${await batches(shirt.id)}/${await onHand(shirt.id)}`);
  const orig = await one(`SELECT quantity_returned r, line_total t FROM public.sales WHERE id=$1`, [sale.id]);
  check("fulfil: original line keeps 2 units", orig.r === 2 && close(orig.t, 2000), JSON.stringify(orig));
  check("fulfil: equal value, balance unchanged", close(await balance(cust.id), 4000), String(await balance(cust.id)));
  check("fulfil: values recorded", close(done?.returned_value, 2000) && close(done?.replacement_value, 2000), JSON.stringify(done));
  const repl = await one(`SELECT * FROM public.sales WHERE id=$1`, [done?.replacement_sale_id]);
  check("fulfil: replacement is the customer's, rep's, linked to the exchange",
    repl?.customer_id === cust.id && repl?.sales_rep_id === ID.repA1 && repl?.exchange_id === same.id && repl?.quantity_from_rep_stock === 0);
  check("fulfil: movements typed", (await one(`SELECT count(*)::int n FROM public.inventory_movements WHERE type IN ('exchange_return','exchange_issue') AND (reference_id=$1 OR reference_id=$2)`, [same.id, repl?.id])).n === 2);
  err("fulfil: only once", await as(ID.skA1, `SELECT * FROM public.fulfil_exchange($1)`, [same.id]), { hint: "form" });
  err("acknowledge: another rep", await as(ID.repA2, `SELECT * FROM public.acknowledge_exchange($1)`, [same.id]), DENY);
  const ack = ok("acknowledge: the requesting rep", await as(ID.repA1, `SELECT * FROM public.acknowledge_exchange($1)`, [same.id]));
  check("acknowledge: recorded", !!ack?.acknowledged_at);
  err("acknowledge: only once", await as(ID.repA1, `SELECT * FROM public.acknowledge_exchange($1)`, [same.id]), { hint: "form" });

  // ---------------- value differences go to the ledger ----------------
  const dearer = ok("request: 1 shirt for 1 jacket", await req(ID.repA1, sale.id, 1, jacket.id, 1));
  await as(ID.skA1, `SELECT * FROM public.approve_exchange($1)`, [dearer.id]);
  ok("fulfil: dearer replacement", await as(ID.skA1, `SELECT * FROM public.fulfil_exchange($1)`, [dearer.id]));
  check("ledger: owes the 2,000 difference more", close(await balance(cust.id), 6000), String(await balance(cust.id)));

  const cheaper = ok("request: 1 shirt for 1 sock", await req(ID.repA1, sale.id, 1, sock.id, 1));
  await as(ID.skA1, `SELECT * FROM public.approve_exchange($1)`, [cheaper.id]);
  ok("fulfil: cheaper replacement", await as(ID.skA1, `SELECT * FROM public.fulfil_exchange($1)`, [cheaper.id]));
  check("ledger: owes 800 less", close(await balance(cust.id), 5200), String(await balance(cust.id)));
  err("request: nothing left to return", await req(ID.repA1, sale.id, 1, sock.id, 1), { hint: "returnQuantity" });

  // A paid-up customer who takes a cheaper replacement ends in credit.
  const paidSale = await sell(jacket.id, 1);
  const pay = ok("setup: payment for the jacket", await as(ID.repA1, `SELECT * FROM public.record_customer_payment($1,8200,'cash',null,CURRENT_DATE,null,null,null)`, [cust.id]));
  check("setup: payment credited at once", pay?.status === "confirmed");
  check("setup: settled", close(await balance(cust.id), 0), String(await balance(cust.id)));
  const credit = ok("request: jacket for 1 shirt", await req(ID.repA1, paidSale.id, 1, shirt.id, 1));
  await as(ID.skA1, `SELECT * FROM public.approve_exchange($1)`, [credit.id]);
  ok("fulfil: credit case", await as(ID.skA1, `SELECT * FROM public.fulfil_exchange($1)`, [credit.id]));
  check("ledger: customer in credit by 2,000", close(await balance(cust.id), -2000), String(await balance(cust.id)));

  // ---------------- discounts, stock checks, rejection ----------------
  const discounted = (await as(ID.owner, `SELECT * FROM public.apply_sale_discount($1,'amount',300)`, [(await sell(shirt.id, 3)).id])).rows?.[0];
  const dEx = ok("request: from a discounted line", await req(ID.repA1, discounted.id, 1, shirtL.id, 1));
  await as(ID.skA1, `SELECT * FROM public.approve_exchange($1)`, [dEx.id]);
  const dDone = ok("fulfil: discounted line", await as(ID.skA1, `SELECT * FROM public.fulfil_exchange($1)`, [dEx.id]));
  check("discount: returned unit worth its share (1,000 - 100)", close(dDone?.returned_value, 900), JSON.stringify(dDone));
  check("discount: line keeps 2 units and 200 discount", close((await one(`SELECT line_total t FROM public.sales WHERE id=$1`, [discounted.id])).t, 1800));

  const big = ok("request: more jackets than in stock", await req(ID.repA1, (await sell(shirt.id, 1)).id, 1, jacket.id, 500));
  err("approve: replacement not in stock", await as(ID.skA1, `SELECT * FROM public.approve_exchange($1)`, [big.id]), { hint: "quantity" });
  err("reject: needs a reason", await as(ID.skA1, `SELECT * FROM public.reject_exchange($1,'')`, [big.id]), { hint: "reason" });
  ok("reject: storekeeper", await as(ID.skA1, `SELECT * FROM public.reject_exchange($1,'Not enough jackets')`, [big.id]));
  check("reject: rep told why", (await one(`SELECT message FROM public.notifications WHERE recipient_id=$1 AND entity_id=$2 AND type='exchange_rejected'`, [ID.repA1, big.id]))?.message?.includes("Not enough jackets"));
  check("reject: stock untouched", (await ex(big.id)).status === "rejected");

  // A direct sale can't pose as an exchange line or mark units returned.
  check("direct sale: exchange_id refused", (await as(ID.repA1,
    `INSERT INTO public.sales (tenant_id, code, branch_id, sales_rep_id, product_id, quantity, unit_price, sale_date, walk_in_name, exchange_id)
     VALUES ($1,'SAL-fake-ex',$2,$3,$4,1,1000,CURRENT_DATE,'W',$5)`, [tenantA, ID.brA1, ID.repA1, shirt.id, same.id])).error?.code === "42501");
  check("direct sale: quantity_returned refused", (await as(ID.repA1,
    `INSERT INTO public.sales (tenant_id, code, branch_id, sales_rep_id, product_id, quantity, unit_price, sale_date, walk_in_name, quantity_returned)
     VALUES ($1,'SAL-fake-rt',$2,$3,$4,1,1000,CURRENT_DATE,'W',1)`, [tenantA, ID.brA1, ID.repA1, shirt.id])).error?.code === "42501");

  console.log(`\nExchange tests: ${passed} passed, ${failures.length} failed`);
  for (const f of failures) console.log("  FAIL " + f);
  module.exports.result = { passed, failed: failures.length };
};
