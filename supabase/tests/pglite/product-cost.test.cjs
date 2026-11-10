// Cost price is Owner-only: nobody else can read it, and only the Owner sets it.
module.exports = async function productCost(db, { ID }) {
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
  const cost = async (id) => (await db.query(`SELECT unit_cost c FROM public.products WHERE id = $1`, [id])).rows[0]?.c;
  const num = (v) => (v === null || v === undefined ? v : Number(v));
  const COLS = "id, name, sku, unit_price, status, product_type";

  // Owner creates a product with a cost and reads it back.
  const owned = (await as(ID.owner, `SELECT * FROM public.create_product('Cost Item','cost-1','Home','Piece',1000,600,5,null)`)).rows?.[0];
  check("owner: create returns the cost", num(owned?.unit_cost) === 600, JSON.stringify(owned));
  const costs = await as(ID.owner, `SELECT * FROM public.get_product_costs() WHERE product_id = $1`, [owned?.id]);
  check("owner: get_product_costs has it", num(costs.rows?.[0]?.unit_cost) === 600, JSON.stringify(costs));

  // Nobody else can read the column.
  for (const [who, id] of [["storekeeper", ID.skA1], ["manager", ID.mgrA1], ["rep", ID.repA1]]) {
    check(`${who}: select * is refused`, !!(await as(id, `SELECT * FROM public.products LIMIT 1`)).error);
    check(`${who}: unit_cost is refused`, (await as(id, `SELECT unit_cost FROM public.products LIMIT 1`)).error?.code === "42501");
    const listed = await as(id, `SELECT ${COLS} FROM public.products WHERE id = $1`, [owned?.id]);
    check(`${who}: other columns still readable`, listed.rows?.[0]?.unit_price !== undefined, JSON.stringify(listed.error));
    check(`${who}: get_product_costs is refused`, (await as(id, `SELECT * FROM public.get_product_costs()`)).error?.code === "42501");
  }
  check("owner: select * is refused too (the app reads cost through get_product_costs)",
    !!(await as(ID.owner, `SELECT * FROM public.products LIMIT 1`)).error);

  // Storekeeper-created products have no cost; the function returns none.
  const sk = await as(ID.skA1, `SELECT * FROM public.create_product('SK Item','sk-cost-1','Home','Piece',800,500,5,null)`);
  const skRow = sk.rows?.[0];
  check("storekeeper: can still add a product", !!skRow?.id, JSON.stringify(sk.error));
  check("storekeeper: cost sent is ignored", skRow && (await cost(skRow.id)) === null);
  check("storekeeper: create returns no cost", skRow && skRow.unit_cost === null);

  // Storekeeper edits keep the Owner's cost.
  const edit = await as(ID.skA1, `SELECT * FROM public.update_product($1,'Cost Item 2','cost-1','Home','Piece',1200,1,5,null)`, [owned?.id]);
  check("storekeeper: can edit", !edit.error, JSON.stringify(edit.error));
  check("storekeeper: edit keeps the cost", num(await cost(owned?.id)) === 600);
  check("storekeeper: edit returns no cost", edit.rows?.[0]?.unit_cost === null);
  const below = await as(ID.skA1, `SELECT * FROM public.update_product($1,'Cost Item 2','cost-1','Home','Piece',500,null,5,null)`, [owned?.id]);
  check("storekeeper: can't price below cost", below.error?.hint === "unitPrice" && !below.error.message.includes("600"), JSON.stringify(below.error));
  const skOwn = await as(ID.skA1, `SELECT * FROM public.update_product($1,'SK Item','sk-cost-1','Home','Piece',50,null,5,null)`, [skRow?.id]);
  check("storekeeper: any price when no cost is set", !skOwn.error, JSON.stringify(skOwn.error));

  // Owner sets and changes cost; the rules still apply.
  const ownerSet = await as(ID.owner, `SELECT * FROM public.update_product($1,'SK Item','sk-cost-1','Home','Piece',900,450,5,null)`, [skRow?.id]);
  check("owner: fills in a missing cost", num(ownerSet.rows?.[0]?.unit_cost) === 450 && num(await cost(skRow?.id)) === 450, JSON.stringify(ownerSet.error));
  const tooHigh = await as(ID.owner, `SELECT * FROM public.update_product($1,'SK Item','sk-cost-1','Home','Piece',900,950,5,null)`, [skRow?.id]);
  check("owner: cost above price is refused", tooHigh.error?.hint === "unitCost", JSON.stringify(tooHigh.error));
  const blank = await as(ID.owner, `SELECT * FROM public.create_product('No Cost','cost-2','Home','Piece',100,null,5,null)`);
  check("owner: may leave cost empty", !blank.error && blank.rows?.[0]?.unit_cost === null, JSON.stringify(blank.error));

  // Status changes don't reveal cost either.
  const status = await as(ID.mgrA1, `SELECT * FROM public.set_product_status($1,'inactive')`, [owned?.id]);
  check("manager: status change returns no cost", !status.error && status.rows?.[0]?.unit_cost === null, JSON.stringify(status.error));
  await as(ID.owner, `SELECT * FROM public.set_product_status($1,'active')`, [owned?.id]);

  // Direct writes can't set cost.
  const direct = await as(ID.skA1, `UPDATE public.products SET unit_cost = 1 WHERE id = $1`, [owned?.id]);
  check("storekeeper: direct cost update is refused", direct.error?.code === "42501" && num(await cost(owned?.id)) === 600, JSON.stringify(direct.error));

  // Imports: only the Owner's rows set cost.
  const row = (sku, price, unitCost, n = 1) => ({ row_number: n, name: "Imported " + sku, sku, category: "Home", unit: "Piece",
    unit_price: price, unit_cost: unitCost, low_stock_threshold: 5, opening_quantity: 0 });
  const skImport = await as(ID.skA1, `SELECT public.import_products($1::jsonb,'update',$2)`,
    [JSON.stringify([row("imp-new", 300, 200), row("cost-1", 1300, 2, 2)]), ID.brA1]);
  const skResult = skImport.rows?.[0]?.import_products;
  check("storekeeper import: runs", skResult?.created === 1 && skResult?.updated === 1, JSON.stringify(skImport.error ?? skResult));
  const impNew = (await db.query(`SELECT unit_cost c FROM public.products WHERE sku = 'IMP-NEW'`)).rows[0];
  check("storekeeper import: new product has no cost", impNew && impNew.c === null);
  check("storekeeper import: existing product keeps its cost", num(await cost(owned?.id)) === 600);
  const skLow = await as(ID.skA1, `SELECT public.import_products($1::jsonb,'update',$2)`, [JSON.stringify([row("cost-1", 100, null)]), ID.brA1]);
  check("storekeeper import: below cost is reported", skLow.rows?.[0]?.import_products?.failed === 1, JSON.stringify(skLow.error ?? skLow.rows));
  const ownerImport = await as(ID.owner, `SELECT public.import_products($1::jsonb,'update',$2)`, [JSON.stringify([row("imp-new", 300, 120)]), ID.brA1]);
  check("owner import: sets cost", !ownerImport.error && num((await db.query(`SELECT unit_cost c FROM public.products WHERE sku = 'IMP-NEW'`)).rows[0].c) === 120,
    JSON.stringify(ownerImport.error));

  console.log(`\nProduct cost tests: ${passed} passed, ${failures.length} failed`);
  for (const f of failures) console.log("  FAIL " + f);
  module.exports.result = { passed, failed: failures.length };
};
