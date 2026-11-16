// End-to-end role relationships, as the app uses them:
//   rep -> storekeeper: customer order, fulfilment, acknowledgement
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
  const DENY = { code: "42501" };
  const err = (name, r, { code, hint, includes } = {}) => {
    const e = r.error;
    check(name, !!e && (!code || e.code === code) && (!hint || e.hint === hint) && (!includes || e.message.includes(includes)),
      e ? `${e.code} [${e.hint}] ${e.message}` : "expected an error, call succeeded");
  };

  const product = ok("setup: product", await as(ID.owner, `SELECT * FROM public.create_product('Relay Item','relay-1','Home','Piece',500,300,5,null)`));
  ok("setup: 100 in Ikeja", await as(ID.owner, `SELECT public.add_stock($1,$2,100,null,null,'2028-01-01',false,null,null)`, [ID.brA1, product.id]));

  // ---------------- rep -> storekeeper: customer orders (20261116100000) ----------------
  const reserved = async (productId) => (await one(`SELECT quantity_reserved r FROM public.inventory_records WHERE branch_id=$1 AND product_id=$2`, [ID.brA1, productId]))?.r;
  const buyer = ok("setup: a customer of the rep", await as(ID.repA1, `SELECT * FROM public.create_customer('Relay Stores','Uche','0805 333 0001',null,'Ikeja')`));
  const lines = (q) => JSON.stringify([{ product_id: product.id, quantity: q }]);
  const place = (rep, customer, q, key = null) => as(rep, `SELECT * FROM public.place_customer_order($1,$2::jsonb,'Deliver Monday',$3)`, [customer, lines(q), key]);

  const orderKey = "77777777-7777-4777-8777-777777777777";
  const order = ok("rep: raises an order from the customer's order book", await place(ID.repA1, buyer.id, 12, orderKey));
  check("order: waits for the storekeeper, no approval step", order?.status === "pending" && /^ORD-\d+$/.test(order?.code ?? ""), JSON.stringify(order));
  await place(ID.repA1, buyer.id, 12, orderKey);
  check("order: a repeated submit does not raise it twice", (await one(`SELECT count(*)::int n FROM public.customer_orders WHERE customer_id=$1`, [buyer.id])).n === 1);
  check("order: the units are reserved, not yet deducted", (await onHand(product.id)) === 100 && (await reserved(product.id)) === 12);
  const pendingLine = await one(`SELECT status, sale_date FROM public.sales WHERE order_id=$1`, [order.id]);
  check("order: its line waits, so it is not a sale yet", pendingLine?.status === "pending", JSON.stringify(pendingLine));
  check("order: not on the customer's ledger before fulfilment", Number((await one(`SELECT public.get_customer_balance($1) b`, [buyer.id])).b) === 0);
  check("order: the rep sees it", await sees(ID.repA1, "customer_orders", order.id));
  check("order: their branch storekeeper sees it", await sees(ID.skA1, "customer_orders", order.id));
  check("order: their branch manager sees it", await sees(ID.mgrA1, "customer_orders", order.id));
  check("order: the Owner sees it", await sees(ID.owner, "customer_orders", order.id));
  check("order: another rep does not", !(await sees(ID.repA2, "customer_orders", order.id)));
  check("order: another branch's storekeeper does not", !(await sees(ID.skA2, "customer_orders", order.id)));
  check("order: another business does not", !(await sees(ID.skB1, "customer_orders", order.id)));
  check("order: the storekeeper is notified", (await notified(ID.skA1, order.id)) > 0);
  const listed = (await as(ID.skA1, `SELECT * FROM public.get_customer_orders()`)).rows ?? [];
  const mine = listed.find((o) => o.id === order.id);
  check("order list: the storekeeper gets the customer, rep and lines", mine?.customer_name === "Relay Stores" && mine?.rep_id === ID.repA1
    && mine?.lines?.[0]?.product_id === product.id && mine?.lines?.[0]?.quantity === 12, JSON.stringify(mine));
  check("order list: another rep gets none of it", !((await as(ID.repA2, `SELECT * FROM public.get_customer_orders()`)).rows ?? []).some((o) => o.id === order.id));

  // Stock checks happen on the server, against what is left after reservations.
  err("order: more than is available", await place(ID.repA1, buyer.id, 89), { hint: "items", includes: "Only 88" });
  ok("order: exactly what is left", await place(ID.repA1, buyer.id, 88));
  check("order: everything is now reserved", (await reserved(product.id)) === 100);
  err("order: out of stock", await place(ID.repA1, buyer.id, 1), { hint: "items", includes: "out of stock" });
  err("walk-in: the Owner can't sell reserved units", await as(ID.owner,
    `SELECT * FROM public.record_sale($1,CURRENT_DATE,null,'Walk-in','',$2::jsonb,null)`, [ID.brA1, lines(1)]), { hint: "quantity", includes: "reserved" });
  const rec = await one(`SELECT id FROM public.inventory_records WHERE branch_id=$1 AND product_id=$2`, [ID.brA1, product.id]);
  err("count: a recount can't drop below reserved units", await as(ID.skA1, `SELECT public.adjust_stock($1,50,'Recount')`, [rec.id]), { hint: "quantity" });
  err("order: storekeepers don't raise orders", await place(ID.skA1, buyer.id, 1), DENY);
  err("order: not for another rep's customer", await place(ID.repA2, buyer.id, 1), { hint: "customerId" });
  err("order: a promo or unknown product", await as(ID.repA1, `SELECT * FROM public.place_customer_order($1,$2::jsonb,null,null)`,
    [buyer.id, JSON.stringify([{ product_id: ID.prodB, quantity: 1 }])]), { hint: "items" });
  err("order: the same product twice", await as(ID.repA1, `SELECT * FROM public.place_customer_order($1,$2::jsonb,null,null)`,
    [buyer.id, JSON.stringify([{ product_id: product.id, quantity: 1 }, { product_id: product.id, quantity: 1 }])]), { hint: "items" });

  // Cancel the 88 so they're free again.
  const big = (await one(`SELECT id FROM public.customer_orders WHERE customer_id=$1 AND status='pending' AND id<>$2`, [buyer.id, order.id])).id;
  err("cancel: another rep can't", await as(ID.repA2, `SELECT public.cancel_customer_order($1,'x')`, [big]), DENY);
  err("cancel: the manager can't", await as(ID.mgrA1, `SELECT public.cancel_customer_order($1,'x')`, [big]), DENY);
  err("cancel: needs a reason", await as(ID.repA1, `SELECT public.cancel_customer_order($1,' ')`, [big]), { hint: "reason" });
  ok("cancel: the rep cancels before fulfilment", await as(ID.repA1, `SELECT public.cancel_customer_order($1,'Customer changed their mind')`, [big]));
  check("cancel: the units are free again", (await reserved(product.id)) === 12 && (await onHand(product.id)) === 100);
  check("cancel: its line is voided", (await one(`SELECT status FROM public.sales WHERE order_id=$1`, [big])).status === "voided");
  check("cancel: the storekeeper is told", (await notified(ID.skA1, big)) > 0);
  err("cancel: can't be fulfilled afterwards", await as(ID.skA1, `SELECT public.fulfil_customer_order($1)`, [big]), { includes: "cancelled" });

  // Fulfilment: the storekeeper of the branch, once.
  err("acknowledge: not before fulfilment", await as(ID.repA1, `SELECT public.acknowledge_customer_order($1)`, [order.id]), { includes: "fulfils" });
  err("fulfil: the rep can't", await as(ID.repA1, `SELECT public.fulfil_customer_order($1)`, [order.id]), DENY);
  err("fulfil: another branch's storekeeper can't", await as(ID.skA2, `SELECT public.fulfil_customer_order($1)`, [order.id]), DENY);
  err("fulfil: another business can't see it", await as(ID.skB1, `SELECT public.fulfil_customer_order($1)`, [order.id]), { includes: "not found" });
  err("fulfil: the manager can't", await as(ID.mgrA1, `SELECT public.fulfil_customer_order($1)`, [order.id]), DENY);
  check("no approve or reject step exists", (await one(`SELECT count(*)::int n FROM pg_proc WHERE proname IN ('approve_customer_order','reject_customer_order')`)).n === 0);
  const fulfilled = ok("storekeeper: fulfils", await as(ID.skA1, `SELECT * FROM public.fulfil_customer_order($1)`, [order.id]));
  check("fulfil: recorded with who and when", fulfilled?.status === "fulfilled" && fulfilled?.fulfilled_by === ID.skA1 && !!fulfilled?.fulfilled_at, JSON.stringify(fulfilled));
  check("fulfil: stock deducted once, reservation released", (await onHand(product.id)) === 88 && (await reserved(product.id)) === 0);
  const sold = await one(`SELECT id, status, quantity_from_rep_stock f FROM public.sales WHERE order_id=$1`, [order.id]);
  check("fulfil: the line becomes a completed sale", sold?.status === "completed" && sold?.f === 0, JSON.stringify(sold));
  check("fulfil: one stock movement for the line",
    (await one(`SELECT count(*)::int n, sum(quantity)::int q FROM public.inventory_movements WHERE reference_type='sale' AND reference_id=$1`, [sold.id])).q === -12);
  check("fulfil: now on the customer's ledger", Number((await one(`SELECT public.get_customer_balance($1) b`, [buyer.id])).b) === 6000);
  check("fulfil: the rep is notified", (await notified(ID.repA1, order.id)) > 0);
  err("fulfil: not twice", await as(ID.skA1, `SELECT public.fulfil_customer_order($1)`, [order.id]), { includes: "already fulfilled" });
  check("fulfil: a second attempt deducts nothing", (await onHand(product.id)) === 88);
  err("cancel: not after fulfilment", await as(ID.owner, `SELECT public.cancel_customer_order($1,'late')`, [order.id]), { includes: "waiting" });

  // Acknowledgement: only the rep who raised it, once.
  err("acknowledge: another rep can't", await as(ID.repA2, `SELECT public.acknowledge_customer_order($1)`, [order.id]), DENY);
  err("acknowledge: the Owner can't", await as(ID.owner, `SELECT public.acknowledge_customer_order($1)`, [order.id]), DENY);
  const acked = ok("rep: acknowledges", await as(ID.repA1, `SELECT * FROM public.acknowledge_customer_order($1)`, [order.id]));
  check("acknowledge: recorded with who and when", acked?.status === "acknowledged" && acked?.acknowledged_by === ID.repA1 && !!acked?.acknowledged_at);
  err("acknowledge: not twice", await as(ID.repA1, `SELECT public.acknowledge_customer_order($1)`, [order.id]), { includes: "already acknowledged" });
  const trail = (await db.query(`SELECT action FROM public.activities WHERE entity='order' AND entity_id=$1 ORDER BY created_at`, [order.id])).rows.map((r) => r.action);
  check("audit: raised, fulfilled and acknowledged are on record", ["Order raised", "Order fulfilled", "Order acknowledged"].every((a) => trail.includes(a)), trail.join(", "));
  const sale = sold;

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
  // Old stock requests stay readable; nobody writes them any more.
  await db.query(`INSERT INTO public.stock_requests (id, tenant_id, branch_id, rep_id, product_id, quantity_requested, quantity_approved,
                    quantity_fulfilled, status, requested_at, priority) VALUES ('SR-OLD',$1,$2,$3,$4,5,5,5,'fulfilled',now(),'Normal')`,
    [tenantA, ID.brA1, ID.repA1, product.id]);
  check("history: the rep still reads their old request", await sees(ID.repA1, "stock_requests", "SR-OLD"));
  check("history: the branch storekeeper too", await sees(ID.skA1, "stock_requests", "SR-OLD"));
  check("direct: a rep can't raise a stock request any more", !!(await as(ID.repA1,
    `INSERT INTO public.stock_requests (id, tenant_id, branch_id, rep_id, product_id, quantity_requested, status, requested_at, priority)
     VALUES ('SR-NEW',$1,$2,$3,$4,1,'pending',now(),'Normal')`, [tenantA, ID.brA1, ID.repA1, product.id])).error);
  const srTouched = await as(ID.repA1, `UPDATE public.stock_requests SET status='pending' WHERE id='SR-OLD' RETURNING id`);
  check("direct: a rep can't change an old request", !!srTouched.error || srTouched.rows.length === 0);
  check("direct: nobody deletes a request", DENIED(await as(ID.owner, `DELETE FROM public.stock_requests WHERE id='SR-OLD'`)));
  check("direct: an order can't be marked fulfilled by UPDATE", DENIED(await as(ID.skA1, `UPDATE public.customer_orders SET status='fulfilled' WHERE id=$1`, [big])));
  check("direct: nor created by INSERT", DENIED(await as(ID.repA1,
    `INSERT INTO public.customer_orders (code, tenant_id, branch_id, customer_id, rep_id) VALUES ('ORD-X',$1,$2,$3,$4)`, [tenantA, ID.brA1, buyer.id, ID.repA1])));
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
  check("still readable: the rep's own requests", (await as(ID.repA1, `SELECT count(*)::int n FROM public.stock_requests`)).rows?.[0]?.n >= 1);

  // ---------------- managers read their branch's customers; invoices read the business ----------------
  const custA1 = ok("setup: a customer in Ikeja", await as(ID.repA1, `SELECT * FROM public.create_customer('Branch Co','Bisi','0805 222 0001',null,'Ikeja')`));
  check("customers: the branch manager reads them", (await as(ID.mgrA1, `SELECT id FROM public.customers WHERE id=$1`, [custA1.id])).rows?.length === 1);
  check("customers: another branch's manager does not", (await as(ID.mgrA2, `SELECT id FROM public.customers WHERE id=$1`, [custA1.id])).rows?.length === 0);
  check("customers: managers can't edit them", !!(await as(ID.mgrA1, `SELECT public.update_customer($1,'X','X','0805 222 0001',null,'x')`, [custA1.id])).error);
  const profile = (await as(ID.repA1, `SELECT * FROM public.get_business_profile()`)).rows?.[0];
  check("invoice: a rep reads the business name", !!profile?.name, JSON.stringify(profile));
  check("invoice: anonymous visitors can't", !!(await (async () => { try { await db.transaction(async (tx) => { await tx.exec("SET LOCAL ROLE anon"); await tx.query("SELECT * FROM public.get_business_profile()"); }); return null; } catch (e) { return e; } })()));

  // ---------------- staff follow their branch manager ----------------
  await db.query(`UPDATE public.branches SET manager_id = NULL WHERE id=$1`, [ID.brA1]);
  check("manager sync: staff lose the manager with the branch", (await one(`SELECT manager_id FROM public.users WHERE id=$1`, [ID.repA1])).manager_id === null);
  await db.query(`UPDATE public.branches SET manager_id = $2 WHERE id=$1`, [ID.brA1, ID.mgrA1]);
  check("manager sync: staff get the new manager", (await one(`SELECT manager_id FROM public.users WHERE id=$1`, [ID.repA1])).manager_id === ID.mgrA1);
  check("manager sync: other branches untouched", (await one(`SELECT count(*)::int n FROM public.users WHERE branch_id=$1 AND manager_id=$2`, [ID.brA2, ID.mgrA1])).n === 0);

  // ---------------- the main reads use the matching indexes ----------------
  const plan = async (sql) => (await db.query(`EXPLAIN ${sql}`)).rows.map((r) => r["QUERY PLAN"]).join(" ");
  await db.exec("SET enable_seqscan = off");
  check("index: audit log by business, newest first", (await plan(`SELECT * FROM public.activities WHERE tenant_id = '${tenantA}' ORDER BY created_at DESC LIMIT 50`)).includes("idx_activities_tenant_created"));
  // Which of the sales indexes the planner picks depends on the data; what matters
  // is that the composite exists and the read never scans the whole table.
  check("index: sales by business and date exists",
    (await one(`SELECT indexdef FROM pg_indexes WHERE indexname = 'idx_sales_tenant_date'`))?.indexdef?.includes("(tenant_id, sale_date DESC)"));
  check("index: sales by business and date avoids a full scan", !(await plan(`SELECT * FROM public.sales WHERE tenant_id = '${tenantA}' AND sale_date >= CURRENT_DATE - 30`)).includes("Seq Scan"));
  check("index: a rep's sales in a month", (await plan(`SELECT sum(line_total) FROM public.sales WHERE sales_rep_id = '${ID.repA1}' AND sale_date BETWEEN CURRENT_DATE - 30 AND CURRENT_DATE`)).includes("idx_sales_rep_date"));
  check("index: notifications for one person", (await plan(`SELECT * FROM public.notifications WHERE recipient_id = '${ID.repA1}' ORDER BY created_at DESC`)).includes("idx_notifications_recipient_created"));
  await db.exec("RESET enable_seqscan");

  // ---------------- storekeeper cancels; the Owner voids a fulfilled order (20261117100000) ----------------
  const item = ok("setup: product for voids", await as(ID.owner, `SELECT * FROM public.create_product('Void Item','void-1','Home','Piece',1000,500,1,null)`));
  ok("setup: 40 with a batch", await as(ID.owner, `SELECT public.add_stock($1,$2,40,null,'LOT-V','2028-01-01',false,null,null)`, [ID.brA1, item.id]));
  const vHand = async () => (await one(`SELECT quantity_on_hand q, quantity_reserved r FROM public.inventory_records WHERE branch_id=$1 AND product_id=$2`, [ID.brA1, item.id]));
  const vLot = async () => (await one(`SELECT sum(quantity_remaining)::int n FROM public.stock_batches WHERE branch_id=$1 AND product_id=$2`, [ID.brA1, item.id])).n;
  const vOrder = (q) => as(ID.repA1, `SELECT * FROM public.place_customer_order($1,$2::jsonb,null,null)`, [buyer.id, JSON.stringify([{ product_id: item.id, quantity: q }])]);
  const balanceOf = async () => Number((await one(`SELECT public.get_customer_balance($1) b`, [buyer.id])).b);

  const waiting = ok("cancel: an order waiting", await vOrder(5));
  err("cancel: another branch's storekeeper can't", await as(ID.skA2, `SELECT public.cancel_customer_order($1,'No stock')`, [waiting.id]), DENY);
  const skCancel = ok("cancel: the branch storekeeper can", await as(ID.skA1, `SELECT * FROM public.cancel_customer_order($1,'Damaged on the shelf')`, [waiting.id]));
  check("cancel: by the storekeeper, units free again", skCancel?.status === "cancelled" && skCancel?.cancelled_by === ID.skA1 && (await vHand()).r === 0);
  check("cancel: the rep is told", (await notified(ID.repA1, waiting.id)) > 0);

  const before = await balanceOf();
  const mistake = ok("void: an order raised by mistake", await vOrder(8));
  ok("void: fulfilled", await as(ID.skA1, `SELECT public.fulfil_customer_order($1)`, [mistake.id]));
  check("void: fulfilment took the stock and charged the customer", (await vHand()).q === 32 && (await vLot()) === 32 && (await balanceOf()) === before + 8000);
  err("void: the rep can't", await as(ID.repA1, `SELECT public.void_customer_order($1,'x')`, [mistake.id]), DENY);
  err("void: the storekeeper can't", await as(ID.skA1, `SELECT public.void_customer_order($1,'x')`, [mistake.id]), DENY);
  err("void: the manager can't", await as(ID.mgrA1, `SELECT public.void_customer_order($1,'x')`, [mistake.id]), DENY);
  err("void: needs a reason", await as(ID.owner, `SELECT public.void_customer_order($1,' ')`, [mistake.id]), { hint: "reason" });
  err("void: not for an order still waiting", await as(ID.owner, `SELECT public.void_customer_order($1,'x')`, [(ok("setup: another waiting order", await vOrder(1))).id]), { includes: "Cancel" });
  const voided = ok("void: the Owner voids it", await as(ID.owner, `SELECT * FROM public.void_customer_order($1,'Raised for the wrong customer')`, [mistake.id]));
  check("void: recorded with who, when and why", voided?.status === "voided" && voided?.cancelled_by === ID.owner && voided?.cancel_reason === "Raised for the wrong customer");
  check("void: the units are back on hand and in the batch", (await vHand()).q === 40 && (await vLot()) === 40, JSON.stringify(await vHand()));
  check("void: off the customer's ledger", (await balanceOf()) === before);
  check("void: lines voided, so no target or revenue",
    (await one(`SELECT count(*) FILTER (WHERE status='voided')::int v, count(*)::int n FROM public.sales WHERE order_id=$1`, [mistake.id])).v === 1);
  check("void: a stock movement for the return",
    (await one(`SELECT sum(quantity)::int q FROM public.inventory_movements WHERE type='order_void' AND reference_id IN (SELECT id::text FROM public.sales WHERE order_id=$1)`, [mistake.id])).q === 8);
  check("void: the rep and storekeeper are told", (await notified(ID.repA1, mistake.id)) > 0 && (await notified(ID.skA1, mistake.id)) > 0);
  check("void: audited", (await one(`SELECT count(*)::int n FROM public.activities WHERE action='Order voided' AND entity_id=$1`, [mistake.id])).n === 1);
  err("void: not twice", await as(ID.owner, `SELECT public.void_customer_order($1,'again')`, [mistake.id]), { includes: "already voided" });
  check("void: a second attempt returns nothing more", (await vHand()).q === 40);

  console.log(`\nRelationship tests: ${passed} passed, ${failures.length} failed`);
  for (const f of failures) console.log("  FAIL " + f);
  module.exports.result = { passed, failed: failures.length };
};
