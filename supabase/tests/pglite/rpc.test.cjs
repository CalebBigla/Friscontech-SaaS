// RPC tests: valid call, invalid input, wrong role, wrong branch, wrong tenant,
// repeated call. Every call runs as role `authenticated` with auth.uid() set.
const U = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const ID = {
  owner: U(1), mgrA1: U(2), skA1: U(3), repA1: U(4), skA2: U(5), repA2: U(6), mgrA2: U(7),
  mgrB1: U(11), skB1: U(12), repB1: U(13),
  brA1: U(101), brA2: U(102), brB1: U(103), tenantB: U(201), prodB: U(301),
};

let passed = 0;
const failures = [];
function check(name, cond, detail = "") {
  if (cond) passed++;
  else failures.push(`${name}${detail ? " — " + detail : ""}`);
}

module.exports = async function run(db) {
  // ---------------- fixture ----------------
  await db.exec(`
    INSERT INTO auth.users (id, email, raw_user_meta_data)
    VALUES ('${ID.owner}', 'owner@a.test', '{"is_owner": true, "first_name": "Ola", "last_name": "Owner", "org_name": "Acme"}');
  `);
  const tenantA = (await db.query(`SELECT tenant_id FROM public.users WHERE id = $1`, [ID.owner])).rows[0].tenant_id;
  await db.exec(`
    ALTER TABLE auth.users DISABLE TRIGGER on_auth_user_created;
    INSERT INTO public.tenants (id, name, legal_name, business_email, phone) VALUES ('${ID.tenantB}', 'Other', 'Other Ltd', 'b@b.test', '0800');
    INSERT INTO public.branches (id, tenant_id, name, code, location, address, phone, email) VALUES
      ('${ID.brA1}', '${tenantA}', 'Ikeja', 'IKJ', 'Lagos', 'x', '1', 'a1@a.test'),
      ('${ID.brA2}', '${tenantA}', 'Lekki', 'LKK', 'Lagos', 'x', '1', 'a2@a.test'),
      ('${ID.brB1}', '${ID.tenantB}', 'Abuja', 'ABJ', 'Abuja', 'x', '1', 'b1@b.test');
    INSERT INTO auth.users (id, email) SELECT id::uuid, email FROM (VALUES
      ('${ID.mgrA1}', 'mgr1@a.test'), ('${ID.skA1}', 'sk1@a.test'), ('${ID.repA1}', 'rep1@a.test'),
      ('${ID.skA2}', 'sk2@a.test'), ('${ID.repA2}', 'rep2@a.test'), ('${ID.mgrA2}', 'mgr2@a.test'),
      ('${ID.mgrB1}', 'mgr@b.test'), ('${ID.skB1}', 'sk@b.test'), ('${ID.repB1}', 'rep@b.test')) v(id, email);
    INSERT INTO public.users (id, tenant_id, first_name, last_name, email, role, status, branch_id) VALUES
      ('${ID.mgrA1}', '${tenantA}', 'Mo', 'Manager', 'mgr1@a.test', 'manager', 'active', '${ID.brA1}'),
      ('${ID.skA1}', '${tenantA}', 'Sade', 'Store', 'sk1@a.test', 'storekeeper', 'active', '${ID.brA1}'),
      ('${ID.repA1}', '${tenantA}', 'Rita', 'Rep', 'rep1@a.test', 'sales_rep', 'active', '${ID.brA1}'),
      ('${ID.skA2}', '${tenantA}', 'Segun', 'Store', 'sk2@a.test', 'storekeeper', 'active', '${ID.brA2}'),
      ('${ID.repA2}', '${tenantA}', 'Remi', 'Rep', 'rep2@a.test', 'sales_rep', 'active', '${ID.brA2}'),
      ('${ID.mgrA2}', '${tenantA}', 'Musa', 'Manager', 'mgr2@a.test', 'manager', 'active', '${ID.brA2}'),
      ('${ID.mgrB1}', '${ID.tenantB}', 'Bola', 'Manager', 'mgr@b.test', 'manager', 'active', '${ID.brB1}'),
      ('${ID.skB1}', '${ID.tenantB}', 'Bisi', 'Store', 'sk@b.test', 'storekeeper', 'active', '${ID.brB1}'),
      ('${ID.repB1}', '${ID.tenantB}', 'Bayo', 'Rep', 'rep@b.test', 'sales_rep', 'active', '${ID.brB1}');
    UPDATE public.branches SET manager_id = '${ID.mgrA1}' WHERE id = '${ID.brA1}';
    UPDATE public.branches SET manager_id = '${ID.mgrA2}' WHERE id = '${ID.brA2}';
    UPDATE public.branches SET manager_id = '${ID.mgrB1}' WHERE id = '${ID.brB1}';
    UPDATE public.users SET manager_id = '${ID.mgrA1}' WHERE id IN ('${ID.skA1}', '${ID.repA1}');
    INSERT INTO public.products (id, tenant_id, name, sku, category, unit_price, unit_cost) VALUES
      ('${ID.prodB}', '${ID.tenantB}', 'Other rice', 'B-RICE', 'Food', 100, 50);
  `);

  // Run one statement as a signed-in user. Returns { rows } or { error }.
  async function as(userId, sql, params = []) {
    try {
      return await db.transaction(async (tx) => {
        await tx.exec(`SET LOCAL ROLE authenticated`);
        await tx.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [userId]);
        const r = await tx.query(sql, params);
        return { rows: r.rows };
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

  // ---------------- grants ----------------
  const anonCall = await (async () => {
    try {
      return await db.transaction(async (tx) => { await tx.exec(`SET LOCAL ROLE anon`); await tx.query(`SELECT public.adjust_stock(gen_random_uuid(), 1, 'x')`); return {}; });
    } catch (e) { return { error: { message: e.message, code: e.code } }; }
  })();
  err("grants: anon cannot execute RPCs", anonCall, { code: "42501", includes: "permission denied" });
  const internal = await as(ID.owner, `SELECT app_private.actor()`);
  err("grants: app_private is not callable by clients", internal, { code: "42501" });

  // ---------------- products ----------------
  const p1 = ok("create_product: owner valid", await as(ID.owner,
    `SELECT * FROM public.create_product('Rice 50kg','rice-50','Food','Bag',60000,45000,10,'Long grain')`));
  check("create_product: SKU upper-cased", p1?.sku === "RICE-50");
  const invCount = await one(`SELECT count(*)::int n FROM public.inventory_records WHERE product_id = $1`, [p1.id]);
  check("create_product: owner opens records in all active branches", invCount.n === 2, `got ${invCount.n}`);
  err("create_product: duplicate SKU", await as(ID.owner,
    `SELECT public.create_product('Rice 2','RICE-50','Food','Bag',1,1,1,null)`), { hint: "sku" });
  err("create_product: cost above price", await as(ID.owner,
    `SELECT public.create_product('Oil','oil-1','Food','Tin',10,20,1,null)`), { hint: "unitCost" });
  err("create_product: wrong role (rep)", await as(ID.repA1,
    `SELECT public.create_product('Oil','oil-1','Food','Tin',20,10,1,null)`), DENY);
  const p2 = ok("create_product: storekeeper valid", await as(ID.skA1,
    `SELECT * FROM public.create_product('Oil 5L','oil-5','Food','Tin',9000,7000,5,null)`));
  const p2inv = await one(`SELECT count(*)::int n FROM public.inventory_records WHERE product_id = $1`, [p2.id]);
  check("create_product: storekeeper opens record in own branch only", p2inv.n === 1, `got ${p2inv.n}`);
  ok("update_product: valid", await as(ID.skA1,
    `SELECT public.update_product($1,'Oil 5L','OIL-5','Food','Tin',9500,7000,8,null)`, [p2.id]));
  const thr = await one(`SELECT low_stock_threshold FROM public.inventory_records WHERE product_id = $1`, [p2.id]);
  check("update_product: branch threshold follows product default", thr.low_stock_threshold === 8);
  err("update_product: wrong tenant (row not visible)", await as(ID.skB1,
    `SELECT public.update_product($1,'X','X1','Food','Tin',2,1,1,null)`, [p2.id]), { includes: "not found" });

  // ---------------- add_stock / adjust_stock ----------------
  const key1 = "11111111-1111-1111-1111-111111111111";
  const a1 = ok("add_stock: owner applies immediately", await as(ID.owner,
    `SELECT * FROM public.add_stock($1,$2,100,'Delivery','LOT-1','2027-06-30',false,null,$3)`, [ID.brA1, p1.id, key1]));
  check("add_stock: owner approval recorded as approved", a1?.status === "approved");
  let onHand = await one(`SELECT quantity_on_hand q FROM public.inventory_records WHERE branch_id=$1 AND product_id=$2`, [ID.brA1, p1.id]);
  check("add_stock: stock +100", onHand.q === 100, `got ${onHand.q}`);
  const again = ok("add_stock: repeat with same key", await as(ID.owner,
    `SELECT * FROM public.add_stock($1,$2,100,'Delivery','LOT-1','2027-06-30',false,null,$3)`, [ID.brA1, p1.id, key1]));
  onHand = await one(`SELECT quantity_on_hand q FROM public.inventory_records WHERE branch_id=$1 AND product_id=$2`, [ID.brA1, p1.id]);
  check("add_stock: repeat does not apply twice", onHand.q === 100 && again?.id === a1?.id, `on hand ${onHand.q}`);
  const lot = await one(`SELECT count(*)::int n, sum(quantity_remaining)::int r FROM public.stock_batches WHERE branch_id=$1 AND product_id=$2`, [ID.brA1, p1.id]);
  check("add_stock: lot opened", lot.n === 1 && lot.r === 100);
  err("add_stock: expiry required", await as(ID.owner,
    `SELECT public.add_stock($1,$2,5,null,null,null,false,null,null)`, [ID.brA1, p1.id]), { hint: "expiryDate" });
  err("add_stock: quantity must be positive", await as(ID.owner,
    `SELECT public.add_stock($1,$2,0,null,null,'2027-01-01',false,null,null)`, [ID.brA1, p1.id]), { hint: "quantity" });
  err("add_stock: wrong role (rep)", await as(ID.repA1,
    `SELECT public.add_stock($1,$2,5,null,null,'2027-01-01',false,null,null)`, [ID.brA1, p1.id]), DENY);
  err("add_stock: storekeeper wrong branch", await as(ID.skA2,
    `SELECT public.add_stock($1,$2,5,null,null,'2027-01-01',false,null,null)`, [ID.brA1, p1.id]), { hint: "branchId" });
  err("add_stock: wrong tenant", await as(ID.skB1,
    `SELECT public.add_stock($1,$2,5,null,null,'2027-01-01',false,null,null)`, [ID.brA1, p1.id]), { hint: "branchId" });
  const pend = ok("add_stock: storekeeper creates pending approval", await as(ID.skA1,
    `SELECT * FROM public.add_stock($1,$2,20,null,'LOT-2','2026-12-31',false,null,null)`, [ID.brA1, p1.id]));
  onHand = await one(`SELECT quantity_on_hand q FROM public.inventory_records WHERE branch_id=$1 AND product_id=$2`, [ID.brA1, p1.id]);
  check("add_stock: pending addition does not change stock", pend?.status === "pending" && onHand.q === 100);
  err("add_stock: emergency needs a reason", await as(ID.skA1,
    `SELECT public.add_stock($1,$2,5,null,null,'2027-01-01',true,'no',null)`, [ID.brA1, p1.id]), { hint: "emergencyReason" });
  const em = ok("add_stock: storekeeper emergency applies now", await as(ID.skA1,
    `SELECT * FROM public.add_stock($1,$2,5,null,null,'2027-03-01',true,'Customer waiting',null)`, [ID.brA1, p1.id]));
  onHand = await one(`SELECT quantity_on_hand q FROM public.inventory_records WHERE branch_id=$1 AND product_id=$2`, [ID.brA1, p1.id]);
  check("add_stock: emergency +5 and stays pending for review", onHand.q === 105 && em?.status === "pending" && em?.emergency === true);

  const rec = await one(`SELECT id FROM public.inventory_records WHERE branch_id=$1 AND product_id=$2`, [ID.brA1, p1.id]);
  err("adjust_stock: same as current", await as(ID.skA1, `SELECT public.adjust_stock($1,105,'count')`, [rec.id]), { hint: "quantity" });
  err("adjust_stock: reason required", await as(ID.skA1, `SELECT public.adjust_stock($1,104,' ')`, [rec.id]), { hint: "reason" });
  err("adjust_stock: wrong role (manager)", await as(ID.mgrA1, `SELECT public.adjust_stock($1,104,'count')`, [rec.id]), DENY);
  err("adjust_stock: wrong branch", await as(ID.skA2, `SELECT public.adjust_stock($1,104,'count')`, [rec.id]), DENY);
  err("adjust_stock: wrong tenant", await as(ID.skB1, `SELECT public.adjust_stock($1,104,'count')`, [rec.id]), DENY);
  ok("adjust_stock: storekeeper valid (105 → 103)", await as(ID.skA1, `SELECT public.adjust_stock($1,103,'Damaged')`, [rec.id]));
  // FEFO: the earliest-expiring lot (2027-03-01, 5 units) is drained before LOT-1 (2027-06-30).
  const emLot = await one(`SELECT quantity_remaining r FROM public.stock_batches WHERE branch_id=$1 AND product_id=$2 AND expiry_date='2027-03-01'`, [ID.brA1, p1.id]);
  check("adjust_stock: FEFO drains earliest expiry first", emLot.r === 3, `got ${emLot.r}`);
  ok("adjust_stock: owner valid (103 → 105)", await as(ID.owner, `SELECT public.adjust_stock($1,105,'Recount')`, [rec.id]));
  const moves = await one(`SELECT count(*)::int n FROM public.inventory_movements WHERE branch_id=$1 AND product_id=$2`, [ID.brA1, p1.id]);
  check("stock: every change writes a movement", moves.n === 4, `got ${moves.n}`);

  // ---------------- approvals ----------------
  err("approve_requests: storekeeper cannot review", await as(ID.skA1, `SELECT * FROM public.approve_requests(ARRAY[$1]::uuid[])`, [pend.id]),
    { includes: "no longer eligible" });
  err("approve_requests: manager of another branch", await as(ID.mgrA2, `SELECT * FROM public.approve_requests(ARRAY[$1]::uuid[])`, [pend.id]),
    { includes: "no longer eligible" });
  err("approve_requests: wrong tenant", await as(ID.mgrB1, `SELECT * FROM public.approve_requests(ARRAY[$1]::uuid[])`, [pend.id]),
    { includes: "no longer eligible" });
  ok("approve_requests: branch manager approves", await as(ID.mgrA1, `SELECT * FROM public.approve_requests(ARRAY[$1,$2]::uuid[])`, [pend.id, em.id]));
  onHand = await one(`SELECT quantity_on_hand q FROM public.inventory_records WHERE branch_id=$1 AND product_id=$2`, [ID.brA1, p1.id]);
  check("approve_requests: approved addition applied once, emergency not re-applied", onHand.q === 125, `got ${onHand.q}`);
  err("approve_requests: repeat does not apply twice", await as(ID.mgrA1, `SELECT * FROM public.approve_requests(ARRAY[$1]::uuid[])`, [pend.id]),
    { includes: "no longer eligible" });
  const deact = ok("request_product_deactivation: storekeeper", await as(ID.skA1,
    `SELECT * FROM public.request_product_deactivation($1,'Discontinued')`, [p2.id]));
  err("request_product_deactivation: duplicate pending", await as(ID.skA1,
    `SELECT public.request_product_deactivation($1,'Again')`, [p2.id]), { includes: "already pending" });
  err("request_product_deactivation: wrong role (rep)", await as(ID.repA1,
    `SELECT public.request_product_deactivation($1,'x y z')`, [p2.id]), DENY);
  err("reject_request: reason required", await as(ID.mgrA1, `SELECT public.reject_request($1,'no')`, [deact.id]), { hint: "reason" });
  ok("reject_request: valid", await as(ID.mgrA1, `SELECT public.reject_request($1,'Still selling')`, [deact.id]));
  err("reject_request: repeat", await as(ID.mgrA1, `SELECT public.reject_request($1,'Still selling')`, [deact.id]), { includes: "already reviewed" });

  // ---------------- set_product_status ----------------
  err("set_product_status: storekeeper cannot deactivate", await as(ID.skA1, `SELECT public.set_product_status($1,'inactive')`, [p2.id]), DENY);
  ok("set_product_status: owner deactivates", await as(ID.owner, `SELECT public.set_product_status($1,'inactive')`, [p2.id]));
  ok("set_product_status: storekeeper reactivates", await as(ID.skA1, `SELECT public.set_product_status($1,'active')`, [p2.id]));
  err("set_product_status: wrong tenant", await as(ID.mgrB1, `SELECT public.set_product_status($1,'inactive')`, [p2.id]), { code: "P0002" });

  // ---------------- stock requests ----------------
  const reqKey = "22222222-2222-2222-2222-222222222222";
  const reqs = await as(ID.repA1, `SELECT * FROM public.create_stock_requests($1,$2::jsonb,'Restock',$3)`,
    [ID.brA1, JSON.stringify([{ product_id: p1.id, quantity: 30 }]), reqKey]);
  ok("create_stock_requests: rep valid", reqs);
  const sr = reqs.rows?.[0];
  check("create_stock_requests: text id generated", /^SR-\d+$/.test(sr?.id ?? ""), sr?.id);
  const reqsAgain = await as(ID.repA1, `SELECT * FROM public.create_stock_requests($1,$2::jsonb,'Restock',$3)`,
    [ID.brA1, JSON.stringify([{ product_id: p1.id, quantity: 30 }]), reqKey]);
  const srCount = await one(`SELECT count(*)::int n FROM public.stock_requests`);
  check("create_stock_requests: repeat does not create twice", srCount.n === 1 && reqsAgain.rows?.[0]?.id === sr?.id, `count ${srCount.n}`);
  err("create_stock_requests: duplicate product", await as(ID.repA1, `SELECT * FROM public.create_stock_requests($1,$2::jsonb,null,null)`,
    [ID.brA1, JSON.stringify([{ product_id: p1.id, quantity: 1 }, { product_id: p1.id, quantity: 2 }])]), { hint: "items" });
  err("create_stock_requests: wrong branch", await as(ID.repA1, `SELECT * FROM public.create_stock_requests($1,$2::jsonb,null,null)`,
    [ID.brA2, JSON.stringify([{ product_id: p1.id, quantity: 1 }])]), { hint: "branchId" });
  err("create_stock_requests: wrong role", await as(ID.skA1, `SELECT * FROM public.create_stock_requests($1,$2::jsonb,null,null)`,
    [ID.brA1, JSON.stringify([{ product_id: p1.id, quantity: 1 }])]), DENY);
  err("create_stock_requests: wrong tenant", await as(ID.repB1, `SELECT * FROM public.create_stock_requests($1,$2::jsonb,null,null)`,
    [ID.brA1, JSON.stringify([{ product_id: p1.id, quantity: 1 }])]), { hint: "branchId" });
  const skNotes = await one(`SELECT count(*)::int n FROM public.notifications WHERE recipient_id=$1 AND type='stock_request_submitted'`, [ID.skA1]);
  check("create_stock_requests: branch storekeeper notified", skNotes.n === 1, `got ${skNotes.n}`);
  const skSees = async (userId) => (await as(userId, `SELECT count(*)::int n FROM public.stock_requests WHERE id = $1`, [sr.id])).rows?.[0]?.n;
  check("stock_requests read: branch storekeeper sees the rep's request", await skSees(ID.skA1) === 1);
  check("stock_requests read: other-branch storekeeper does not", await skSees(ID.skA2) === 0);
  check("stock_requests read: other-tenant storekeeper does not", await skSees(ID.skB1) === 0);
  err("stock_requests write: storekeeper cannot approve directly", await as(ID.skA1,
    `UPDATE public.stock_requests SET status = 'approved' WHERE id = $1 RETURNING id`, [sr.id]).then((r) => (r.rows?.length === 0 ? { error: { message: "no rows" } } : r)));
  err("fulfil_stock_request: before approval", await as(ID.skA1, `SELECT public.fulfil_stock_request($1,5)`, [sr.id]), { includes: "approved" });
  err("approve_stock_request: wrong branch", await as(ID.skA2, `SELECT public.approve_stock_request($1)`, [sr.id]), DENY);
  err("approve_stock_request: wrong tenant", await as(ID.skB1, `SELECT public.approve_stock_request($1)`, [sr.id]), { includes: "not found" });
  ok("approve_stock_request: valid", await as(ID.skA1, `SELECT public.approve_stock_request($1)`, [sr.id]));
  onHand = await one(`SELECT quantity_on_hand q, quantity_reserved r FROM public.inventory_records WHERE branch_id=$1 AND product_id=$2`, [ID.brA1, p1.id]);
  check("approve_stock_request: nothing reserved, stock unchanged", onHand.q === 125 && onHand.r === 0);
  err("approve_stock_request: repeat", await as(ID.skA1, `SELECT public.approve_stock_request($1)`, [sr.id]), { includes: "pending" });
  err("fulfil_stock_request: more than outstanding", await as(ID.skA1, `SELECT public.fulfil_stock_request($1,31)`, [sr.id]), { hint: "quantity" });
  ok("fulfil_stock_request: partial 10", await as(ID.skA1, `SELECT public.fulfil_stock_request($1,10)`, [sr.id]));
  ok("fulfil_stock_request: second partial 20", await as(ID.skA1, `SELECT public.fulfil_stock_request($1,20)`, [sr.id]));
  onHand = await one(`SELECT quantity_on_hand q FROM public.inventory_records WHERE branch_id=$1 AND product_id=$2`, [ID.brA1, p1.id]);
  const srRow = await one(`SELECT status, quantity_fulfilled f FROM public.stock_requests WHERE id=$1`, [sr.id]);
  check("fulfil_stock_request: both partial issues deduct stock", onHand.q === 95, `got ${onHand.q}`);
  check("fulfil_stock_request: fulfilled after full quantity", srRow.status === "fulfilled" && srRow.f === 30);
  err("fulfil_stock_request: repeat after fulfilled", await as(ID.skA1, `SELECT public.fulfil_stock_request($1,1)`, [sr.id]), { includes: "approved" });
  err("acknowledge_stock_request: other rep", await as(ID.repA2, `SELECT public.acknowledge_stock_request($1)`, [sr.id]), DENY);
  ok("acknowledge_stock_request: requesting rep", await as(ID.repA1, `SELECT public.acknowledge_stock_request($1)`, [sr.id]));
  err("acknowledge_stock_request: repeat", await as(ID.repA1, `SELECT public.acknowledge_stock_request($1)`, [sr.id]), { includes: "already" });
  const sr2 = (await as(ID.repA1, `SELECT * FROM public.create_stock_requests($1,$2::jsonb,null,null)`,
    [ID.brA1, JSON.stringify([{ product_id: p1.id, quantity: 2 }])])).rows?.[0];
  err("reject_stock_request: reason required", await as(ID.skA1, `SELECT public.reject_stock_request($1,' ')`, [sr2.id]), { hint: "reason" });
  ok("reject_stock_request: valid", await as(ID.skA1, `SELECT public.reject_stock_request($1,'Not authorised')`, [sr2.id]));

  // ---------------- sales trigger (FEFO) ----------------
  ok("sale: rep walk-in sale", await as(ID.repA1,
    `INSERT INTO public.sales (tenant_id, code, branch_id, sales_rep_id, product_id, quantity, unit_price, sale_date, walk_in_name)
     VALUES ($1,'S-1',$2,$3,$4,5,60000,CURRENT_DATE,'Walk-in') RETURNING id`, [tenantA, ID.brA1, ID.repA1, p1.id]));
  onHand = await one(`SELECT quantity_on_hand q FROM public.inventory_records WHERE branch_id=$1 AND product_id=$2`, [ID.brA1, p1.id]);
  check("sale: deducts stock", onHand.q === 90, `got ${onHand.q}`);

  // ---------------- customers & customer payments ----------------
  const cust = ok("create_customer: rep valid", await as(ID.repA1,
    `SELECT * FROM public.create_customer('Mama Put','Ada','0803 111 2222',null,'Ikeja')`));
  err("create_customer: duplicate phone", await as(ID.repA1,
    `SELECT public.create_customer('Other','B','08031112222',null,'x')`), { hint: "phone" });
  err("create_customer: wrong role", await as(ID.owner, `SELECT public.create_customer('X','Y','0803 999 0000',null,'x')`), DENY);
  err("update_customer: wrong branch", await as(ID.repA2,
    `SELECT public.update_customer($1,'Mama Put','Ada','0803 111 2222',null,'Ikeja')`, [cust.id]), DENY);
  ok("update_customer: valid", await as(ID.repA1,
    `SELECT public.update_customer($1,'Mama Put Ltd','Ada','0803 111 2222',null,'Ikeja')`, [cust.id]));
  ok("set_customer_status: valid", await as(ID.repA1, `SELECT public.set_customer_status($1,'inactive')`, [cust.id]));
  ok("set_customer_status: reactivate", await as(ID.repA1, `SELECT public.set_customer_status($1,'active')`, [cust.id]));
  err("set_customer_credit_limit: rep cannot", await as(ID.repA1, `SELECT public.set_customer_credit_limit($1,1000)`, [cust.id]), DENY);
  ok("set_customer_credit_limit: owner", await as(ID.owner, `SELECT public.set_customer_credit_limit($1,500000)`, [cust.id]));
  err("set_customer_credit_limit: wrong tenant", await as(ID.mgrB1, `SELECT public.set_customer_credit_limit($1,1)`, [cust.id]), DENY);

  const cpKey = "33333333-3333-3333-3333-333333333333";
  const cp = ok("record_customer_payment: valid", await as(ID.repA1,
    `SELECT * FROM public.record_customer_payment($1,20000,'cash',null,CURRENT_DATE,null,null,$2)`, [cust.id, cpKey]));
  await as(ID.repA1, `SELECT * FROM public.record_customer_payment($1,20000,'cash',null,CURRENT_DATE,null,null,$2)`, [cust.id, cpKey]);
  const cpCount = await one(`SELECT count(*)::int n FROM public.customer_payments`);
  check("record_customer_payment: repeat does not create twice", cpCount.n === 1, `got ${cpCount.n}`);
  err("record_customer_payment: transfer needs reference", await as(ID.repA1,
    `SELECT public.record_customer_payment($1,100,'transfer',null,CURRENT_DATE,null,null,null)`, [cust.id]), { hint: "reference" });
  err("record_customer_payment: future date", await as(ID.repA1,
    `SELECT public.record_customer_payment($1,100,'cash',null,CURRENT_DATE + 3,null,null,null)`, [cust.id]), { hint: "paymentDate" });
  err("record_customer_payment: customer of another branch", await as(ID.repA2,
    `SELECT public.record_customer_payment($1,100,'cash',null,CURRENT_DATE,null,null,null)`, [cust.id]), { hint: "customerId" });
  err("acknowledge_customer_payment: other manager", await as(ID.mgrA2,
    `SELECT public.acknowledge_customer_payment($1,null,null)`, [cp.id]), DENY);
  err("confirm_customer_payment: manager cannot confirm", await as(ID.mgrA1, `SELECT public.confirm_customer_payment($1)`, [cp.id]), DENY);
  ok("acknowledge_customer_payment: branch manager", await as(ID.mgrA1, `SELECT public.acknowledge_customer_payment($1,null,null)`, [cp.id]));
  err("acknowledge_customer_payment: repeat", await as(ID.mgrA1, `SELECT public.acknowledge_customer_payment($1,null,null)`, [cp.id]), { includes: "submitted" });
  err("decline_customer_payment: manager after acknowledgement", await as(ID.mgrA1, `SELECT public.decline_customer_payment($1,'x')`, [cp.id]), { includes: "submitted" });
  ok("confirm_customer_payment: owner", await as(ID.owner, `SELECT public.confirm_customer_payment($1)`, [cp.id]));
  err("confirm_customer_payment: repeat", await as(ID.owner, `SELECT public.confirm_customer_payment($1)`, [cp.id]), { includes: "pending" });
  const ownerNotes = await one(`SELECT count(*)::int n FROM public.notifications WHERE recipient_id=$1 AND type='payment_awaiting_confirmation'`, [ID.owner]);
  check("acknowledge_customer_payment: owner notified", ownerNotes.n === 1);

  // ---------------- rep payments ----------------
  const period = (await one(`SELECT to_char(CURRENT_DATE,'YYYY-MM') p`)).p;
  err("submit_payment: more than sales", await as(ID.repA1,
    `SELECT public.submit_payment($1,400000,0,null,null,null)`, [period]), { hint: "transferAmount" });
  err("submit_payment: future month", await as(ID.repA1,
    `SELECT public.submit_payment('2999-01',1,0,null,null,null)`), { hint: "period" });
  err("submit_payment: wrong role", await as(ID.mgrA1, `SELECT public.submit_payment($1,1,0,null,null,null)`, [period]), DENY);
  const payKey = "44444444-4444-4444-4444-444444444444";
  const pay = ok("submit_payment: valid (sales 300,000)", await as(ID.repA1,
    `SELECT * FROM public.submit_payment($1,200000,100000,'TRX-9',null,$2)`, [period, payKey]));
  check("submit_payment: text id generated", /^PAY-\d+$/.test(pay?.id ?? ""), pay?.id);
  await as(ID.repA1, `SELECT * FROM public.submit_payment($1,200000,100000,'TRX-9',null,$2)`, [period, payKey]);
  const payCount = await one(`SELECT count(*)::int n FROM public.payments`);
  check("submit_payment: repeat does not create twice", payCount.n === 1, `got ${payCount.n}`);
  err("submit_payment: nothing outstanding", await as(ID.repA1, `SELECT public.submit_payment($1,1,0,null,null,null)`, [period]), { hint: "transferAmount" });
  err("acknowledge_payment: wrong tenant", await as(ID.mgrB1, `SELECT public.acknowledge_payment($1,null,null)`, [pay.id]), { includes: "not found" });
  ok("acknowledge_payment: branch manager", await as(ID.mgrA1, `SELECT public.acknowledge_payment($1,null,null)`, [pay.id]));
  err("decline_payment: rep cannot", await as(ID.repA1, `SELECT public.decline_payment($1,'x')`, [pay.id]), DENY);

  // ---------------- expenses ----------------
  const expKey = "55555555-5555-5555-5555-555555555555";
  const exp = ok("create_expense: branch manager", await as(ID.mgrA1,
    `SELECT * FROM public.create_expense('transport',10000,CURRENT_DATE,'Fuel',null,null,$1)`, [expKey]));
  check("create_expense: branch is the manager's", exp?.branch_id === ID.brA1 && /^EXP-\d+$/.test(exp?.id ?? ""));
  await as(ID.mgrA1, `SELECT * FROM public.create_expense('transport',10000,CURRENT_DATE,'Fuel',null,null,$1)`, [expKey]);
  check("create_expense: repeat does not create twice", (await one(`SELECT count(*)::int n FROM public.expenses`)).n === 1);
  err("create_expense: bad category", await as(ID.mgrA1, `SELECT public.create_expense('fun',1,CURRENT_DATE,'x',null,null,null)`), { hint: "category" });
  err("create_expense: wrong role", await as(ID.repA1, `SELECT public.create_expense('transport',1,CURRENT_DATE,'x',null,null,null)`), DENY);
  err("update_expense: other manager", await as(ID.mgrA2,
    `SELECT public.update_expense($1,'transport',1,CURRENT_DATE,'x',null,null)`, [exp.id]), DENY);
  // Regression: NULL comparisons in permission checks must deny.
  err("update_expense: owner cannot edit a manager's expense", await as(ID.owner,
    `SELECT public.update_expense($1,'transport',1,CURRENT_DATE,'x',null,null)`, [exp.id]), DENY);
  ok("update_expense: valid", await as(ID.mgrA1, `SELECT public.update_expense($1,'transport',12000,CURRENT_DATE,'Fuel',null,null)`, [exp.id]));

  // ---------------- manager remittance ----------------
  // received = walk-in sales of reps with eligible payments (300,000) + confirmed customer payments (20,000)
  // net due = 320,000 - 12,000 expenses = 308,000
  err("submit_manager_remittance: more than net due", await as(ID.mgrA1,
    `SELECT public.submit_manager_remittance($1,308001,0,null,null)`, [period]), { hint: "transferAmount" });
  const rem = ok("submit_manager_remittance: valid", await as(ID.mgrA1,
    `SELECT * FROM public.submit_manager_remittance($1,300000,8000,'TRX-R',null)`, [period]));
  check("submit_manager_remittance: server totals", Number(rem?.total_received) === 320000 && Number(rem?.net_remittance_due) === 308000
    && Number(rem?.outstanding_amount) === 0, JSON.stringify(rem && { r: rem.total_received, n: rem.net_remittance_due, o: rem.outstanding_amount }));
  err("submit_manager_remittance: repeat while awaiting review", await as(ID.mgrA1,
    `SELECT public.submit_manager_remittance($1,0,0,null,null)`, [period]), { includes: "already awaiting" });
  err("submit_manager_remittance: wrong role", await as(ID.repA1, `SELECT public.submit_manager_remittance($1,0,0,null,null)`, [period]), DENY);
  err("confirm_manager_remittance: manager cannot", await as(ID.mgrA1, `SELECT public.confirm_manager_remittance($1)`, [rem.id]), DENY);
  ok("confirm_manager_remittance: owner", await as(ID.owner, `SELECT public.confirm_manager_remittance($1)`, [rem.id]));
  err("decline_manager_remittance: after confirm", await as(ID.owner, `SELECT public.decline_manager_remittance($1,'x')`, [rem.id]), { includes: "submitted" });
  ok("void_expense: valid", await as(ID.mgrA1, `SELECT public.void_expense($1,'Duplicate')`, [exp.id]));
  err("void_expense: repeat", await as(ID.mgrA1, `SELECT public.void_expense($1,'Duplicate')`, [exp.id]), { includes: "already voided" });

  // ---------------- owner remittance ----------------
  const ormKey = "66666666-6666-6666-6666-666666666666";
  const orm = ok("create_owner_remittance: owner pays a supplier", await as(ID.owner,
    `SELECT * FROM public.create_owner_remittance('supplier','Dangote',500000,'transfer','TRX-O',CURRENT_DATE,'Stock purchase',null,$1)`, [ormKey]));
  check("create_owner_remittance: text id", /^ORM-\d+$/.test(orm?.id ?? ""));
  await as(ID.owner, `SELECT * FROM public.create_owner_remittance('supplier','Dangote',500000,'transfer','TRX-O',CURRENT_DATE,'Stock purchase',null,$1)`, [ormKey]);
  check("create_owner_remittance: repeat does not create twice", (await one(`SELECT count(*)::int n FROM public.owner_remittances`)).n === 1);
  err("create_owner_remittance: cheque not allowed", await as(ID.owner,
    `SELECT public.create_owner_remittance('supplier','X',1,'cheque',null,CURRENT_DATE,'x',null,null)`), { hint: "paymentMethod" });
  err("create_owner_remittance: manager cannot", await as(ID.mgrA1,
    `SELECT public.create_owner_remittance('supplier','X',1,'cash',null,CURRENT_DATE,'x',null,null)`), DENY);

  // ---------------- targets ----------------
  const tgt = ok("create_target: owner", await as(ID.owner, `SELECT * FROM public.create_target($1,$2,1500000.4)`, [ID.repA1, period]));
  check("create_target: amount rounded, branch from rep", Number(tgt?.amount) === 1500000 && tgt?.branch_id === ID.brA1);
  err("create_target: one per rep and month", await as(ID.owner, `SELECT public.create_target($1,$2,1)`, [ID.repA1, period]), { hint: "repId" });
  err("create_target: not a sales rep", await as(ID.owner, `SELECT public.create_target($1,$2,1)`, [ID.skA1, period]), { hint: "repId" });
  err("create_target: wrong tenant rep", await as(ID.owner, `SELECT public.create_target($1,$2,1)`, [ID.repB1, period]), { hint: "repId" });
  err("create_target: manager cannot", await as(ID.mgrA1, `SELECT public.create_target($1,$2,1)`, [ID.repA2, period]), DENY);
  ok("update_target_amount: owner", await as(ID.owner, `SELECT public.update_target_amount($1,2000000)`, [tgt.id]));
  err("update_target_amount: zero", await as(ID.owner, `SELECT public.update_target_amount($1,0)`, [tgt.id]), { hint: "amount" });
  const repAfter = await one(`SELECT amount FROM public.targets WHERE id=$1`, [tgt.id]);
  check("update_target_amount: rep target still edits", Number(repAfter.amount) === 2000000);

  // Branch targets
  const nextPeriod = (await one(`SELECT to_char(CURRENT_DATE + interval '1 month','YYYY-MM') p`)).p;
  const btgt = ok("create_branch_target: owner", await as(ID.owner, `SELECT * FROM public.create_branch_target($1,$2,9000000.6)`, [ID.brA1, period]));
  check("create_branch_target: branch scope, no rep, amount rounded",
    btgt?.scope === "branch" && btgt?.user_id === null && btgt?.branch_id === ID.brA1 && Number(btgt?.amount) === 9000001);
  err("create_branch_target: one per branch and month", await as(ID.owner, `SELECT public.create_branch_target($1,$2,1)`, [ID.brA1, period]), { hint: "branchId" });
  ok("create_branch_target: another branch, same month", await as(ID.owner, `SELECT public.create_branch_target($1,$2,5)`, [ID.brA2, period]));
  err("create_branch_target: wrong tenant branch", await as(ID.owner, `SELECT public.create_branch_target($1,$2,1)`, [ID.brB1, period]), { hint: "branchId" });
  err("create_branch_target: bad month", await as(ID.owner, `SELECT public.create_branch_target($1,'2026-13',1)`, [ID.brA1]), { hint: "month" });
  err("create_branch_target: zero", await as(ID.owner, `SELECT public.create_branch_target($1,$2,0)`, [ID.brA1, nextPeriod]), { hint: "amount" });
  err("create_branch_target: manager cannot", await as(ID.mgrA1, `SELECT public.create_branch_target($1,$2,1)`, [ID.brA1, nextPeriod]), DENY);
  err("create_branch_target: storekeeper cannot", await as(ID.skA1, `SELECT public.create_branch_target($1,$2,1)`, [ID.brA1, nextPeriod]), DENY);
  const bUpd = ok("update_target_amount: branch target", await as(ID.owner, `SELECT * FROM public.update_target_amount($1,12000000)`, [btgt.id]));
  check("update_target_amount: branch amount changed", Number(bUpd?.amount) === 12000000);
  err("update_target_amount: manager cannot edit branch target", await as(ID.mgrA1, `SELECT public.update_target_amount($1,1)`, [btgt.id]), DENY);
  const bLog = await one(`SELECT count(*)::int n FROM public.activities WHERE entity_id=$1 AND action IN ('Target created','Target updated')`, [btgt.id]);
  check("branch targets: create and update audited", bLog.n === 2, `got ${bLog.n}`);
  check("branch targets: manager reads own branch target",
    (await as(ID.mgrA1, `SELECT count(*)::int n FROM public.targets WHERE id=$1`, [btgt.id])).rows?.[0]?.n === 1);
  check("branch targets: rep does not read branch target",
    (await as(ID.repA1, `SELECT count(*)::int n FROM public.targets WHERE id=$1`, [btgt.id])).rows?.[0]?.n === 0);

  // ---------------- import ----------------
  const impKey = "77777777-7777-7777-7777-777777777777";
  const rows = [
    { row_number: 2, name: "Sugar", sku: "SUG-1", category: "Food", unit: "Bag", unit_price: 5000, unit_cost: 4000, low_stock_threshold: 5,
      description: null, opening_quantity: 10, batch_number: null, expiry_date: "2027-01-01" },
    { row_number: 3, name: "Bad", sku: "BAD-1", category: "Food", unit: "Bag", unit_price: 10, unit_cost: 20, low_stock_threshold: 1,
      description: null, opening_quantity: 0, batch_number: null, expiry_date: null },
  ];
  const imp = ok("import_products: owner", await as(ID.owner, `SELECT public.import_products($1::jsonb,'skip',$2,$3) r`,
    [JSON.stringify(rows), ID.brA1, impKey]));
  check("import_products: one created, one failed", imp?.r?.created === 1 && imp?.r?.failed === 1, JSON.stringify(imp?.r));
  await as(ID.owner, `SELECT public.import_products($1::jsonb,'update',$2,$3) r`, [JSON.stringify(rows), ID.brA1, impKey]);
  const sugar = await one(`SELECT i.quantity_on_hand q FROM public.inventory_records i JOIN public.products p ON p.id=i.product_id
                           WHERE p.sku='SUG-1' AND i.branch_id=$1`, [ID.brA1]);
  check("import_products: repeat does not add opening stock twice", sugar.q === 10, `got ${sugar.q}`);
  err("import_products: wrong role", await as(ID.repA1, `SELECT public.import_products('[]'::jsonb,'skip',null,null)`), DENY);

  // ---------------- team ----------------
  err("request_team_member: owner uses invites instead", await as(ID.owner,
    `SELECT public.request_team_member('New Rep','new@a.test','sales_rep',$1)`, [ID.brA1]), DENY);
  err("request_team_member: manager cannot assign manager", await as(ID.mgrA1,
    `SELECT public.request_team_member('New','new@a.test','manager',$1)`, [ID.brA1]), { hint: "role" });
  err("request_team_member: other branch", await as(ID.mgrA1,
    `SELECT public.request_team_member('New','new@a.test','sales_rep',$1)`, [ID.brA2]), { hint: "branchId" });
  err("request_team_member: email in use", await as(ID.mgrA1,
    `SELECT public.request_team_member('New','rep2@a.test','sales_rep',$1)`, [ID.brA1]), { hint: "email" });
  const tm = ok("request_team_member: valid", await as(ID.mgrA1,
    `SELECT * FROM public.request_team_member('New Rep','new@a.test','sales_rep',$1)`, [ID.brA1]));
  err("request_team_member: repeat", await as(ID.mgrA1,
    `SELECT public.request_team_member('New Rep','new@a.test','sales_rep',$1)`, [ID.brA1]), { hint: "email" });
  err("approve_requests: manager cannot approve team members", await as(ID.mgrA2,
    `SELECT * FROM public.approve_requests(ARRAY[$1]::uuid[])`, [tm.id]), { includes: "no longer eligible" });
  ok("approve_requests: owner approves team member (decision only)", await as(ID.owner,
    `SELECT * FROM public.approve_requests(ARRAY[$1]::uuid[])`, [tm.id]));
  check("team_member approval creates no user row", (await one(`SELECT count(*)::int n FROM public.users WHERE email='new@a.test'`)).n === 0);
  err("update_team_member: manager edits other branch", await as(ID.mgrA1,
    `SELECT public.update_team_member($1,'Remi','Rep','sales_rep',$2,'active')`, [ID.repA2, ID.brA2]), DENY);
  err("update_team_member: cannot edit self", await as(ID.owner,
    `SELECT public.update_team_member($1,'Ola','Owner','manager',$2,'active')`, [ID.owner, ID.brA1]), DENY);
  err("update_team_member: branch already has a manager", await as(ID.owner,
    `SELECT public.update_team_member($1,'Remi','Rep','manager',$2,'active')`, [ID.repA2, ID.brA1]), { hint: "branchId" });
  ok("update_team_member: owner moves storekeeper", await as(ID.owner,
    `SELECT public.update_team_member($1,'Segun','Store','storekeeper',$2,'active')`, [ID.skA2, ID.brA1]));
  const moved = await one(`SELECT branch_id, manager_id FROM public.users WHERE id=$1`, [ID.skA2]);
  check("update_team_member: manager_id follows the branch", moved.branch_id === ID.brA1 && moved.manager_id === ID.mgrA1);
  err("set_team_member_status: wrong tenant", await as(ID.owner, `SELECT public.set_team_member_status($1,'inactive')`, [ID.repB1]), DENY);
  ok("set_team_member_status: deactivate", await as(ID.mgrA1, `SELECT public.set_team_member_status($1,'inactive')`, [ID.repA1]));
  err("deactivated member cannot call RPCs", await as(ID.repA1, `SELECT public.create_customer('Z','Z','0809 000 0000',null,'x')`), DENY);
  ok("set_team_member_status: reactivate", await as(ID.mgrA1, `SELECT public.set_team_member_status($1,'active')`, [ID.repA1]));

  // ---------------- settings ----------------
  err("update_tenant_settings: months above 12", await as(ID.owner,
    `SELECT public.update_tenant_settings(null,null,null,null,null,13)`));
  err("update_tenant_settings: manager cannot", await as(ID.mgrA1,
    `SELECT public.update_tenant_settings('X',null,null,null,null,null)`), DENY);
  const t = ok("update_tenant_settings: owner", await as(ID.owner,
    `SELECT * FROM public.update_tenant_settings('Acme Stores',null,null,'Africa/Lagos',null,6)`));
  check("update_tenant_settings: only given fields change", t?.name === "Acme Stores" && t?.expiry_alert_months === 6 && t?.legal_name === "Acme");
  err("update_preferences: invalid format", await as(ID.repA1, `SELECT public.update_preferences('MM/DD/YYYY','month')`));
  ok("update_preferences: valid", await as(ID.repA1, `SELECT public.update_preferences('DD/MM/YYYY','week')`));
  ok("update_preferences: repeat (upsert)", await as(ID.repA1, `SELECT public.update_preferences('DD/MM/YYYY','week')`));

  // ---------------- audit ----------------
  const audits = await one(`SELECT count(*)::int n FROM public.activities WHERE tenant_id=$1`, [tenantA]);
  check("audit: rows written by RPCs", audits.n > 40, `got ${audits.n}`);
  const crossAudit = await one(`SELECT count(*)::int n FROM public.activities a JOIN public.users u ON u.id = a.actor_id WHERE a.tenant_id <> u.tenant_id`);
  check("audit: rows stay in the actor's tenant", crossAudit.n === 0);

  // ---------------- single owner ----------------
  const second = await (async () => {
    try {
      await db.exec(`ALTER TABLE auth.users ENABLE TRIGGER on_auth_user_created;
        INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES (gen_random_uuid(), 'o2@a.test', '{"is_owner": true}')`);
      return {};
    } catch (e) { return { error: { message: e.message } }; }
  })();
  err("owner sign-up closed once an owner exists", second, { includes: "Owner account already exists" });

  console.log(`\nRPC tests: ${passed} passed, ${failures.length} failed`);
  for (const f of failures) console.log("  FAIL " + f);
  module.exports.result = { passed, failed: failures.length, ID, tenantA };
};
