// Customer assignment, discounts and promo goods. Runs after the RPC tests and uses
// their fixture. Every call runs as role `authenticated` with auth.uid() set.
module.exports = async function customersSales(db, { ID, tenantA }) {
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
  const period = (await one(`SELECT to_char(CURRENT_DATE,'YYYY-MM') p`)).p;

  // A second rep in Ikeja, so reassignment can stay within a branch.
  const repA3 = "00000000-0000-0000-0000-000000000021";
  await db.exec(`
    ALTER TABLE auth.users DISABLE TRIGGER on_auth_user_created;
    UPDATE public.users SET branch_id = '${ID.brA2}' WHERE id = '${ID.skA2}'; -- the RPC tests moved this storekeeper
    INSERT INTO auth.users (id, email) VALUES ('${repA3}', 'rep3@a.test');
    INSERT INTO public.users (id, tenant_id, first_name, last_name, email, role, status, branch_id, manager_id)
    VALUES ('${repA3}', '${tenantA}', 'Tola', 'Rep', 'rep3@a.test', 'sales_rep', 'active', '${ID.brA1}', '${ID.mgrA1}');
  `);

  const product = ok("setup: regular product", await as(ID.owner,
    `SELECT * FROM public.create_product('Soap Carton','soap-c','Home','Carton',1000,600,5,null)`));
  const onHand = async (productId, branchId = ID.brA1) =>
    (await one(`SELECT quantity_on_hand q FROM public.inventory_records WHERE branch_id=$1 AND product_id=$2`, [branchId, productId]))?.q;
  ok("setup: stock in Ikeja", await as(ID.owner,
    `SELECT public.add_stock($1,$2,500,null,null,'2028-01-01',false,null,null)`, [ID.brA1, product.id]));
  ok("setup: stock in Lekki", await as(ID.owner,
    `SELECT public.add_stock($1,$2,100,null,null,'2028-01-01',false,null,null)`, [ID.brA2, product.id]));

  const items = (...lines) => JSON.stringify(lines);
  // Reps sell only stock issued to them (20261115100000): request, approve, issue.
  const issue = async (repId, productId, quantity, branch = ID.brA1, keeper = ID.skA1) => {
    const req = (await as(repId, `SELECT * FROM public.create_stock_requests($1,$2::jsonb,null,null)`, [branch, JSON.stringify([{ product_id: productId, quantity }])])).rows?.[0];
    await as(keeper, `SELECT public.approve_stock_request($1)`, [req?.id]);
    return as(keeper, `SELECT public.fulfil_stock_request($1,$2)`, [req?.id, quantity]);
  };
  ok("setup: 150 soap issued to repA1", await issue(ID.repA1, product.id, 150));
  ok("setup: 60 soap issued to the second rep", await issue(repA3, product.id, 60));
  const line = (extra = {}) => ({ product_id: product.id, quantity: 2, ...extra });
  const walkIn = (userId, itemsJson, key = null, branch = ID.brA1) => as(userId,
    `SELECT * FROM public.record_sale($1,CURRENT_DATE,null,'Walk-in','',$2::jsonb,$3)`, [branch, itemsJson, key]);

  // ---------------- discounts ----------------
  const plain = ok("record_sale: no discount", await walkIn(ID.repA1, items(line())));
  check("record_sale: server sets the list price", close(plain.unit_price, 1000) && close(plain.line_total, 2000), JSON.stringify(plain));
  const pct = ok("record_sale: percentage discount", await walkIn(ID.owner, items(line({ discount_type: "percent", discount_value: 10 }))));
  check("discount: 10% of a 2,000 line is 200", close(pct.discount_amount, 200) && close(pct.line_total, 1800), JSON.stringify(pct));
  check("discount: entered value is kept", pct.discount_type === "percent" && close(pct.discount_value, 10));
  const amt = ok("record_sale: amount discount", await walkIn(ID.owner, items(line({ discount_type: "amount", discount_value: 150 }))));
  check("discount: amount comes off the line, not each unit", close(amt.discount_amount, 150) && close(amt.line_total, 1850), JSON.stringify(amt));
  const rounded = ok("record_sale: percentage rounds to kobo", await walkIn(ID.owner,
    items({ product_id: product.id, quantity: 1, discount_type: "percent", discount_value: 33.33 })));
  check("discount: 33.33% of 1,000", close(rounded.line_total, 666.7), JSON.stringify(rounded));
  const zero = ok("record_sale: a zero discount is no discount", await walkIn(ID.owner, items(line({ discount_type: "amount", discount_value: 0 }))));
  check("discount: zero stores nothing", zero.discount_type === null && zero.discount_value === null && close(zero.discount_amount, 0));

  err("discount: percentage above 100", await walkIn(ID.owner, items(line({ discount_type: "percent", discount_value: 101 }))), { hint: "items" });
  err("discount: amount above the line", await walkIn(ID.owner, items(line({ discount_type: "amount", discount_value: 2001 }))), { hint: "items" });
  err("discount: negative", await walkIn(ID.owner, items(line({ discount_type: "amount", discount_value: -5 }))), { hint: "items" });
  err("discount: unknown type", await walkIn(ID.owner, items(line({ discount_type: "free", discount_value: 5 }))), { hint: "items" });

  // Rep limit: the owner sets it, reps are held to it, the owner is not.
  err("set_max_rep_discount: rep cannot", await as(ID.repA1, `SELECT public.set_max_rep_discount(50)`), DENY);
  err("set_max_rep_discount: above 100", await as(ID.owner, `SELECT public.set_max_rep_discount(101)`));
  ok("set_max_rep_discount: owner", await as(ID.owner, `SELECT public.set_max_rep_discount(10)`));
  err("rep discount: percentage refused", await walkIn(ID.repA1, items(line({ discount_type: "percent", discount_value: 5 }))), { includes: "Only the Owner" });
  err("rep discount: amount refused", await walkIn(ID.repA1, items(line({ discount_type: "amount", discount_value: 1 }))), { includes: "Only the Owner" });
  ok("rep discount: a zero discount is still list price", await walkIn(ID.repA1, items(line({ discount_type: "amount", discount_value: 0 }))));
  ok("discount: owner up to 100%", await walkIn(ID.owner, items(line({ discount_type: "percent", discount_value: 100 }))));
  ok("set_max_rep_discount: remove the limit", await as(ID.owner, `SELECT public.set_max_rep_discount(null)`));

  // The Owner discounts a rep's sale afterwards; it stays the rep's sale.
  err("apply_sale_discount: rep cannot", await as(ID.repA1, `SELECT * FROM public.apply_sale_discount($1,'percent',10)`, [plain.id]), DENY);
  err("apply_sale_discount: manager cannot", await as(ID.mgrA1, `SELECT * FROM public.apply_sale_discount($1,'percent',10)`, [plain.id]), DENY);
  err("apply_sale_discount: above 100%", await as(ID.owner, `SELECT * FROM public.apply_sale_discount($1,'percent',101)`, [plain.id]), { hint: "discount" });
  err("apply_sale_discount: above the line", await as(ID.owner, `SELECT * FROM public.apply_sale_discount($1,'amount',2001)`, [plain.id]), { hint: "discount" });
  err("apply_sale_discount: no type", await as(ID.owner, `SELECT * FROM public.apply_sale_discount($1,null,5)`, [plain.id]), { hint: "discountType" });
  const disc = ok("apply_sale_discount: owner, 10% on a rep's sale", await as(ID.owner, `SELECT * FROM public.apply_sale_discount($1,'percent',10)`, [plain.id]));
  check("apply_sale_discount: line total after discount", close(disc?.discount_amount, 200) && close(disc?.line_total, 1800) && disc?.sales_rep_id === ID.repA1, JSON.stringify(disc));
  const changed = ok("apply_sale_discount: change to an amount", await as(ID.owner, `SELECT * FROM public.apply_sale_discount($1,'amount',500)`, [plain.id]));
  check("apply_sale_discount: amount replaces percentage", changed?.discount_type === "amount" && close(changed?.line_total, 1500), JSON.stringify(changed));
  const cleared = ok("apply_sale_discount: clear", await as(ID.owner, `SELECT * FROM public.apply_sale_discount($1,null,0)`, [plain.id]));
  check("apply_sale_discount: cleared back to list price", cleared?.discount_type === null && close(cleared?.line_total, 2000), JSON.stringify(cleared));
  ok("apply_sale_discount: final 10%", await as(ID.owner, `SELECT * FROM public.apply_sale_discount($1,'percent',10)`, [plain.id]));
  check("apply_sale_discount: audited", (await one(`SELECT count(*)::int n FROM public.activities WHERE entity_id=$1 AND action LIKE 'Sale discount%'`, [plain.id])).n === 4);

  // Everything that adds up sales counts the discounted figure.
  const repLines = await one(`SELECT sum(quantity * unit_price)::numeric gross, sum(line_total)::numeric net FROM public.sales
     WHERE sales_rep_id=$1 AND product_id=$2`, [ID.repA1, product.id]);
  check("discount: reduces rep sales", Number(repLines.net) < Number(repLines.gross));
  const remit = await one(`SELECT app_private.rep_total_sales($1,$2,$3) n, public.get_rep_total_sales($2,$3) m`, [tenantA, ID.repA1, period]);
  const allNet = await one(`SELECT sum(line_total)::numeric n FROM public.sales WHERE sales_rep_id=$1 AND customer_id IS NULL AND to_char(sale_date,'YYYY-MM')=$2`, [ID.repA1, period]);
  check("discount: rep remittance total is net of discounts", close(remit.n, allNet.n) && close(remit.m, allNet.n), `${remit.n} vs ${allNet.n}`);

  // Server rules
  const repHeld = async () => Number((await one(`SELECT (SELECT COALESCE(sum(quantity_fulfilled),0) FROM public.stock_requests WHERE rep_id='${ID.repA1}' AND product_id=$1) - (SELECT COALESCE(sum(quantity_from_rep_stock),0) FROM public.sales WHERE sales_rep_id='${ID.repA1}' AND product_id=$1 AND status='completed') n`, [product.id])).n);
  const before = await repHeld();
  const key = "abcdabcd-5555-4555-8555-abcdabcdabcd";
  ok("record_sale: first call with a key", await walkIn(ID.repA1, items(line()), key));
  const replay = ok("record_sale: repeat with the same key", await walkIn(ID.repA1, items(line()), key));
  const afterRepeat = await repHeld(); check("record_sale: repeat does not sell twice", afterRepeat === before - 2 && close(replay?.line_total, 2000), `before ${before} after ${afterRepeat} replay ${JSON.stringify(replay)}`);
  const multi = await walkIn(ID.repA1, items(line(), line({ quantity: 1 })));
  check("record_sale: lines of one order share an order id", multi.rows?.length === 2 && multi.rows[0].order_id === multi.rows[1].order_id);
  err("record_sale: wrong role", await walkIn(ID.mgrA1, items(line())), DENY);
  err("record_sale: rep at another branch", await walkIn(ID.repA1, items(line()), null, ID.brA2), { hint: "branchId" });
  err("record_sale: walk-in name required", await as(ID.repA1,
    `SELECT * FROM public.record_sale($1,CURRENT_DATE,null,' ',null,$2::jsonb,null)`, [ID.brA1, items(line())]), { hint: "walkInName" });
  err("record_sale: future date", await as(ID.repA1,
    `SELECT * FROM public.record_sale($1,CURRENT_DATE + 3,null,'W',null,$2::jsonb,null)`, [ID.brA1, items(line())]), { hint: "saleDate" });
  err("record_sale: other tenant's product", await walkIn(ID.repA1, items({ product_id: ID.prodB, quantity: 1 })), { hint: "items" });
  const stockBefore = await onHand(product.id);
  err("record_sale: not enough stock", await walkIn(ID.repA1, items(line(), { product_id: product.id, quantity: 99999 })), { hint: "quantity" });
  check("record_sale: a failed line undoes the whole order", (await onHand(product.id)) === stockBefore);

  // Direct inserts (a tab on the previous app version) stay honest.
  const direct = (price, extra = "", vals = "") => as(ID.repA1,
    `INSERT INTO public.sales (tenant_id, code, branch_id, sales_rep_id, product_id, quantity, unit_price, sale_date, walk_in_name${extra})
     VALUES ($1,'SAL-direct-'||gen_random_uuid(),$2,$3,$4,1,$5,CURRENT_DATE,'W'${vals}) RETURNING id`, [tenantA, ID.brA1, ID.repA1, product.id, price]);
  ok("direct sale: at list price still works", await direct(1000));
  err("direct sale: cannot change the price", await direct(1), DENY);
  err("direct sale: cannot apply a discount", await direct(1000, ", discount_amount", ", 500"), DENY);
  err("direct sale: cannot mark a line as promo", await direct(0, ", is_promo", ", true"), DENY);

  // ---------------- promo goods ----------------
  const promo = ok("promo: owner adds a promo item", await as(ID.owner,
    `SELECT * FROM public.create_product('Branded Cap','cap-1','Promo','Piece',0,300,5,null,'promo')`));
  check("promo: stored as promo at no price", promo.product_type === "promo" && close(promo.unit_price, 0));
  ok("promo: storekeeper adds a promo item", await as(ID.skA1,
    `SELECT * FROM public.create_product('Branded Pen','pen-1','Promo','Piece',0,50,5,null,'promo')`));
  err("promo: must have no price", await as(ID.owner,
    `SELECT public.create_product('Bad','bad-1','Promo','Piece',100,50,5,null,'promo')`), { hint: "unitPrice" });
  err("regular products still need a price", await as(ID.owner,
    `SELECT public.create_product('Bad','bad-2','Home','Piece',0,0,5,null)`), { hint: "unitPrice" });
  err("promo: rep cannot add", await as(ID.repA1,
    `SELECT public.create_product('Bad','bad-3','Promo','Piece',0,0,5,null,'promo')`), DENY);
  ok("promo: can be edited", await as(ID.owner,
    `SELECT public.update_product($1,'Branded Cap','CAP-1','Promo','Piece',0,350,5,null)`, [promo.id]));
  err("promo: an edit cannot give it a price", await as(ID.owner,
    `SELECT public.update_product($1,'Branded Cap','CAP-1','Promo','Piece',100,50,5,null)`, [promo.id]), { hint: "unitPrice" });
  const imported = ok("promo: import cannot reprice it", await as(ID.owner,
    `SELECT public.import_products($1::jsonb,'update',null,null) r`, [JSON.stringify([{ row_number: 1, name: "Cap", sku: "CAP-1", category: "Promo", unit: "Piece", unit_price: 500, unit_cost: 100, low_stock_threshold: 5, description: null, opening_quantity: 0 }])]));
  check("promo: import reports the row as failed", imported?.r?.failed === 1 && imported?.r?.updated === 0, JSON.stringify(imported));
  check("promo: price unchanged after import", close((await one(`SELECT unit_price p FROM public.products WHERE id=$1`, [promo.id])).p, 0));

  // Promo stock uses the normal inventory flow.
  ok("promo: stock added like any product", await as(ID.owner,
    `SELECT public.add_stock($1,$2,50,null,null,'2028-01-01',false,null,null)`, [ID.brA1, promo.id]));
  const promoRequest = await as(ID.repA1, `SELECT * FROM public.create_stock_requests($1,$2::jsonb,null,null)`,
    [ID.brA1, JSON.stringify([{ product_id: promo.id, quantity: 1 }])]);
  check("promo: can be requested like any product", !promoRequest.error, promoRequest.error?.message);

  const salesBefore = (await one(`SELECT COALESCE(sum(line_total),0)::numeric n FROM public.sales WHERE sales_rep_id=$1`, [ID.repA1])).n;
  err("promo: rep can't add a promo item", await walkIn(ID.repA1, items(line(), { product_id: promo.id, quantity: 3, is_promo: true })), { includes: "Only the Owner" });
  const repSale = ok("promo: rep records the sale at list price", await walkIn(ID.repA1, items(line())));
  err("add_sale_promo: rep cannot", await as(ID.repA1, `SELECT * FROM public.add_sale_promo($1,$2::jsonb)`, [repSale?.id, items({ product_id: promo.id, quantity: 1 })]), DENY);
  err("add_sale_promo: only promo products", await as(ID.owner, `SELECT * FROM public.add_sale_promo($1,$2::jsonb)`, [repSale?.id, items({ product_id: product.id, quantity: 1 })]), { includes: "not a promo item" });
  const promoAdd = await as(ID.owner, `SELECT * FROM public.add_sale_promo($1,$2::jsonb)`, [repSale?.id, items({ product_id: promo.id, quantity: 3 })]);
  const order = { rows: [repSale, ...(promoAdd.rows ?? [])].filter(Boolean), error: promoAdd.error };
  check("promo: goes out on a sale", !order.error && order.rows?.length === 2, order.error?.message);
  check("promo: added to the rep's order", promoAdd.rows?.[0]?.sales_rep_id === ID.repA1 && promoAdd.rows?.[0]?.order_id === repSale?.order_id && promoAdd.rows?.[0]?.is_promo === true,
    JSON.stringify(promoAdd.rows?.[0]));
  const promoLine = order.rows?.find((r) => r.is_promo);
  check("promo: line has no value", close(promoLine?.unit_price, 0) && close(promoLine?.line_total, 0), JSON.stringify(promoLine));
  check("promo: stock falls", (await onHand(promo.id)) === 47);
  const salesAfter = (await one(`SELECT COALESCE(sum(line_total),0)::numeric n FROM public.sales WHERE sales_rep_id=$1`, [ID.repA1])).n;
  check("promo: adds nothing to revenue", close(Number(salesAfter) - Number(salesBefore), 2000), `${salesBefore} → ${salesAfter}`);
  const move = await one(`SELECT type, quantity FROM public.inventory_movements WHERE reference_type='sale' AND reference_id=$1`, [promoLine?.id]);
  check("promo: has its own movement type", move?.type === "promo" && move?.quantity === -3, JSON.stringify(move));
  const paidMove = await one(`SELECT type FROM public.inventory_movements WHERE reference_type='sale' AND reference_id=$1`, [order.rows?.find((r) => !r.is_promo)?.id]);
  check("promo: the rep's sold line moves no branch stock (it was issued earlier)", paidMove === undefined, JSON.stringify(paidMove));

  err("promo: needs a sold product alongside", await walkIn(ID.owner, items({ product_id: promo.id, quantity: 1, is_promo: true })), { hint: "items" });
  err("promo: cannot be sold as a normal line", await walkIn(ID.owner, items({ product_id: promo.id, quantity: 1 })), { includes: "is a promo item" });
  err("promo: a regular product cannot be given as promo", await walkIn(ID.owner, items({ product_id: product.id, quantity: 1, is_promo: true })), { includes: "not a promo item" });
  err("promo: cannot take a discount", await walkIn(ID.owner, items(line(), { product_id: promo.id, quantity: 1, is_promo: true, discount_type: "amount", discount_value: 1 })), { includes: "already free" });

  // ---------------- stock issued to a rep is not deducted again when sold ----------------
  const held = ok("setup: product for issued stock", await as(ID.owner,
    `SELECT * FROM public.create_product('Issued Item','issued-1','Home','Piece',100,50,1,null)`));
  ok("setup: 100 in the branch", await as(ID.owner, `SELECT public.add_stock($1,$2,100,null,null,'2028-01-01',false,null,null)`, [ID.brA1, held.id]));
  const heldLine = (quantity) => items({ product_id: held.id, quantity });
  const request = (await as(repA3, `SELECT * FROM public.create_stock_requests($1,$2::jsonb,null,null)`, [ID.brA1, heldLine(10)])).rows[0];
  ok("issued stock: approved", await as(ID.skA1, `SELECT public.approve_stock_request($1)`, [request.id]));
  ok("issued stock: issued", await as(ID.skA1, `SELECT public.fulfil_stock_request($1,10)`, [request.id]));
  check("issued stock: issuing deducts the branch", (await onHand(held.id)) === 90);
  const sold6 = (await walkIn(repA3, heldLine(6))).rows?.[0];
  check("issued stock: selling issued units leaves the branch alone", (await onHand(held.id)) === 90, `on hand ${await onHand(held.id)}`);
  check("issued stock: split recorded", sold6?.quantity_from_rep_stock === 6);
  check("issued stock: no movement when branch stock did not change",
    (await one(`SELECT count(*)::int n FROM public.inventory_movements WHERE reference_type='sale' AND reference_id=$1`, [sold6?.id])).n === 0);
  err("issued stock: a rep can't sell more than was issued to them", await walkIn(repA3, heldLine(7)), { hint: "quantity", includes: "You hold 4" });
  check("issued stock: a refused sale leaves the branch alone", (await onHand(held.id)) === 90);
  const sold4 = (await walkIn(repA3, heldLine(4))).rows?.[0];
  check("issued stock: the rest of the issued units sell", sold4?.quantity_from_rep_stock === 4 && (await onHand(held.id)) === 90, JSON.stringify(sold4));
  err("issued stock: another rep holds none of it", await walkIn(ID.repA1, heldLine(1)), { hint: "quantity", includes: "Request stock" });
  ok("issued stock: owner sells from the branch", await walkIn(ID.owner, heldLine(1)));
  check("issued stock: owner sale deducts the branch", (await onHand(held.id)) === 89);
  err("issued stock: nothing left, so the rep must request more", await walkIn(repA3, heldLine(1)), { hint: "quantity" });
  const req2 = (await as(repA3, `SELECT * FROM public.create_stock_requests($1,$2::jsonb,null,null)`, [ID.brA1, heldLine(5)])).rows[0];
  await as(ID.skA1, `SELECT public.approve_stock_request($1)`, [req2.id]);
  await as(ID.skA1, `SELECT public.fulfil_stock_request($1,5)`, [req2.id]);
  check("issued stock: a second issue deducts the branch", (await onHand(held.id)) === 84);
  err("issued stock: one order can't use more than is held", await walkIn(repA3, items({ product_id: held.id, quantity: 3 }, { product_id: held.id, quantity: 3 })), { hint: "quantity" });
  const split = await walkIn(repA3, items({ product_id: held.id, quantity: 3 }, { product_id: held.id, quantity: 2 }));
  check("issued stock: lines of one order share the held units",
    split.rows?.[0]?.quantity_from_rep_stock === 3 && split.rows?.[1]?.quantity_from_rep_stock === 2 && (await onHand(held.id)) === 84, JSON.stringify(split.rows ?? split.error));
  ok("setup: one unit issued to repA1", await issue(ID.repA1, held.id, 1));
  const forged = await as(ID.repA1,
    `INSERT INTO public.sales (tenant_id, code, branch_id, sales_rep_id, product_id, quantity, unit_price, sale_date, walk_in_name, quantity_from_rep_stock)
     VALUES ($1,'SAL-forged',$2,$3,$4,1,100,CURRENT_DATE,'W',0) RETURNING quantity_from_rep_stock q`, [tenantA, ID.brA1, ID.repA1, held.id]);
  check("issued stock: the split can't be set by the caller", forged.rows?.[0]?.q === 1 && (await onHand(held.id)) === 83, JSON.stringify(forged.rows ?? forged.error));
  const noStock = await walkIn(repA3, heldLine(99999));
  err("issued stock: far more than issued", noStock, { hint: "quantity" });

  // ---------------- customer assignment ----------------
  const c1 = ok("create_customer: assigned to the rep who added it", await as(ID.repA1,
    `SELECT * FROM public.create_customer('Assign One','Ada','0805 000 0001',null,'Ikeja')`));
  check("assignment: creator is the assigned rep", c1.assigned_rep_id === ID.repA1 && c1.created_by === ID.repA1);
  const c2 = ok("setup: second customer", await as(ID.repA1,
    `SELECT * FROM public.create_customer('Assign Two','Bola','0805 000 0002',null,'Ikeja')`));
  const sees = async (userId, customerId) => (await as(userId, `SELECT id FROM public.customers WHERE id=$1`, [customerId])).rows?.length === 1;

  check("visibility: assigned rep sees the customer", await sees(ID.repA1, c1.id));
  check("visibility: another rep in the branch does not", !(await sees(repA3, c1.id)));
  check("visibility: storekeeper of the branch does", await sees(ID.skA1, c1.id));
  check("visibility: owner does", await sees(ID.owner, c1.id));
  check("visibility: other tenant does not", !(await sees(ID.repB1, c1.id)));

  err("update_customer: another rep in the branch", await as(repA3,
    `SELECT public.update_customer($1,'X','X','0805 000 0001',null,'x')`, [c1.id]), DENY);
  err("record_customer_payment: not their customer", await as(repA3,
    `SELECT public.record_customer_payment($1,100,'cash',null,CURRENT_DATE,null,null,null)`, [c1.id]), { hint: "customerId" });
  const customerSale = (userId, customerId, itemsJson, branch = ID.brA1) => as(userId,
    `SELECT * FROM public.record_sale($1,CURRENT_DATE,$2,null,null,$3::jsonb,null)`, [branch, customerId, itemsJson]);
  err("record_sale: not their customer", await customerSale(repA3, c1.id, items(line())), { hint: "customerId" });
  err("record_sale: owner cannot sell on a rep's account", await customerSale(ID.owner, c1.id, items(line())), { hint: "customerId" });
  const directCustomer = await as(repA3,
    `INSERT INTO public.sales (tenant_id, code, branch_id, sales_rep_id, product_id, customer_id, quantity, unit_price, sale_date)
     VALUES ($1,'SAL-direct-c',$2,$3,$4,$5,1,1000,CURRENT_DATE) RETURNING id`, [tenantA, ID.brA1, repA3, product.id, c1.id]);
  err("direct sale: not their customer", directCustomer);

  // The old rep builds some history on the account.
  const oldSale = await customerSale(ID.repA1, c1.id, items(line({ quantity: 10 })));
  ok("customer sale: owner discounts it", await as(ID.owner, `SELECT * FROM public.apply_sale_discount($1,'amount',1000)`, [oldSale.rows?.[0]?.id]));
  check("customer sale: recorded with discount", close((await one(`SELECT line_total FROM public.sales WHERE id=$1`, [oldSale.rows?.[0]?.id])).line_total, 9000), oldSale.error?.message);
  const pay = ok("customer payment by old rep", await as(ID.repA1,
    `SELECT * FROM public.record_customer_payment($1,4000,'cash',null,CURRENT_DATE,null,null,null)`, [c1.id]));
  check("customer payment credited at once", pay?.status === "confirmed");
  check("balance: counts the discounted order", close((await one(`SELECT public.get_customer_balance($1) b`, [c1.id])).b, 5000));

  const repOwnSales = async (userId) => (await as(userId, `SELECT COALESCE(sum(line_total),0)::numeric n FROM public.sales`)).rows[0].n;
  const oldBefore = await repOwnSales(ID.repA1);
  const newBefore = await repOwnSales(repA3);
  const target = ok("setup: new rep has a target", await as(ID.owner, `SELECT * FROM public.create_target($1,$2,100000)`, [repA3, period]));
  const achieved = async (id) => Number((await one(`SELECT public.get_target_achievement($1) a`, [id])).a);
  const targetBefore = await achieved(target.id);

  err("reassign_customers: rep cannot", await as(ID.repA1, `SELECT * FROM public.reassign_customers($1,$2)`, [[c1.id], repA3]), DENY);
  err("reassign_customers: manager cannot", await as(ID.mgrA1, `SELECT * FROM public.reassign_customers($1,$2)`, [[c1.id], repA3]), DENY);
  err("reassign_customers: not a sales rep", await as(ID.owner, `SELECT * FROM public.reassign_customers($1,$2)`, [[c1.id], ID.skA1]), { hint: "repId" });
  err("reassign_customers: other tenant's rep", await as(ID.owner, `SELECT * FROM public.reassign_customers($1,$2)`, [[c1.id], ID.repB1]), { hint: "repId" });
  err("reassign_customers: no customers", await as(ID.owner, `SELECT * FROM public.reassign_customers($1,$2)`, [[], repA3]), { hint: "customerId" });
  err("reassign_customers: unknown customer undoes the rest", await as(ID.owner, `SELECT * FROM public.reassign_customers($1,$2)`,
    [[c1.id, "00000000-0000-0000-0000-00000000beef"], repA3]), { hint: "customerId" });
  check("reassign_customers: a failed call moves nothing", (await one(`SELECT assigned_rep_id a FROM public.customers WHERE id=$1`, [c1.id])).a === ID.repA1);

  const moved = ok("reassign_customers: owner, same branch", await as(ID.owner, `SELECT * FROM public.reassign_customers($1,$2)`, [[c1.id], repA3]));
  check("reassign_customers: new rep assigned, creator kept", moved?.assigned_rep_id === repA3 && moved?.created_by === ID.repA1);
  const audited = await one(`SELECT count(*)::int n FROM public.activities WHERE action='Customer reassigned' AND entity_id=$1`, [c1.id]);
  check("reassign_customers: audited", audited.n === 1);

  check("after move: old rep can no longer see the customer", !(await sees(ID.repA1, c1.id)));
  check("after move: new rep can", await sees(repA3, c1.id));
  err("after move: old rep cannot edit", await as(ID.repA1, `SELECT public.update_customer($1,'X','X','0805 000 0001',null,'x')`, [c1.id]), DENY);
  err("after move: old rep cannot take payment", await as(ID.repA1,
    `SELECT public.record_customer_payment($1,100,'cash',null,CURRENT_DATE,null,null,null)`, [c1.id]), { hint: "customerId" });

  // What each rep keeps: the rule is that only the customer and ledger move.
  check("after move: old rep keeps their sales", close(await repOwnSales(ID.repA1), oldBefore));
  check("after move: new rep inherits no sales", close(await repOwnSales(repA3), newBefore));
  check("after move: new rep's target does not move", close(await achieved(target.id), targetBefore));
  const owned = await as(ID.repA1, `SELECT id FROM public.sales WHERE customer_id=$1`, [c1.id]);
  check("after move: old rep still reads their past sale", owned.rows?.length === 1);
  const hidden = await as(repA3, `SELECT id FROM public.sales WHERE customer_id=$1`, [c1.id]);
  check("after move: new rep's sales list excludes it", hidden.rows?.length === 0);

  const ledger = ok("get_assigned_customer_ledgers: new rep", await as(repA3, `SELECT public.get_assigned_customer_ledgers() l`));
  check("ledger: new rep gets the full history",
    ledger?.l.sales.some((s) => s.customer_id === c1.id) && ledger?.l.payments.some((p) => p.customer_id === c1.id), JSON.stringify(ledger));
  const oldLedger = ok("get_assigned_customer_ledgers: old rep", await as(ID.repA1, `SELECT public.get_assigned_customer_ledgers() l`));
  check("ledger: old rep no longer gets it", !oldLedger?.l.sales.some((s) => s.customer_id === c1.id));
  check("ledger: old rep keeps other customers", oldLedger?.l !== undefined);
  err("get_assigned_customer_ledgers: not a rep", await as(ID.owner, `SELECT public.get_assigned_customer_ledgers()`), DENY);

  const names = await as(ID.repA1, `SELECT * FROM public.get_former_customer_names()`);
  check("former names: old rep gets the name for their history", names.rows?.some((n) => n.id === c1.id && n.name === "Assign One"), JSON.stringify(names));
  const newRepNames = await as(repA3, `SELECT * FROM public.get_former_customer_names()`);
  check("former names: excludes current customers", !newRepNames.rows?.some((n) => n.id === c1.id));
  const otherRepNames = await as(ID.repA2, `SELECT * FROM public.get_former_customer_names()`);
  check("former names: nothing for a rep who never dealt with them", !otherRepNames.rows?.some((n) => n.id === c1.id));

  // New activity after the move belongs to the new rep.
  const newSale = await customerSale(repA3, c1.id, items(line({ quantity: 5 })));
  check("new sale: recorded by the new rep", newSale.rows?.[0]?.sales_rep_id === repA3, newSale.error?.message);
  check("new sale: counts toward the new rep's target", (await achieved(target.id)) > targetBefore);
  const newPay = ok("new rep collects on the old debt", await as(repA3,
    `SELECT * FROM public.record_customer_payment($1,1000,'cash',null,CURRENT_DATE,null,null,null)`, [c1.id]));
  check("collection: recorded against the new rep", newPay?.received_by === repA3);
  const targetAfterSale = await achieved(target.id);
  check("collection: credited at once", newPay?.status === "confirmed");
  check("collection: does not count toward the sales target", close(await achieved(target.id), targetAfterSale));
  check("collection: reduces the customer's balance", close((await one(`SELECT public.get_customer_balance($1) b`, [c1.id])).b, 9000));

  // Across branches, and a deactivated rep's customers.
  const cross = ok("reassign_customers: to another branch", await as(ID.owner, `SELECT * FROM public.reassign_customers($1,$2)`, [[c2.id], ID.repA2]));
  check("reassign_customers: customer joins the new rep's branch", cross?.branch_id === ID.brA2);
  check("after cross-branch move: old branch's storekeeper loses it", !(await sees(ID.skA1, c2.id)));
  check("after cross-branch move: new branch's storekeeper sees it", await sees(ID.skA2, c2.id));
  ok("deactivate the rep", await as(ID.owner, `SELECT public.set_team_member_status($1,'inactive')`, [ID.repA2]));
  const stays = await one(`SELECT assigned_rep_id a FROM public.customers WHERE id=$1`, [c2.id]);
  check("deactivation: the customer stays until the owner moves it", stays.a === ID.repA2);
  err("reassign_customers: not to an inactive rep", await as(ID.owner, `SELECT * FROM public.reassign_customers($1,$2)`, [[c1.id], ID.repA2]), { hint: "repId" });
  ok("reassign_customers: from a deactivated rep", await as(ID.owner, `SELECT * FROM public.reassign_customers($1,$2)`, [[c2.id], repA3]));
  ok("reactivate the rep", await as(ID.owner, `SELECT public.set_team_member_status($1,'active')`, [ID.repA2]));
  check("reactivation: customers do not return automatically", !(await sees(ID.repA2, c2.id)));

  console.log(`\nCustomer and sale tests: ${passed} passed, ${failures.length} failed`);
  for (const f of failures) console.log("  FAIL " + f);
  module.exports.result = { passed, failed: failures.length };
};
