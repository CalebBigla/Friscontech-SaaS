// RLS survey: what each role can read and directly write, against the data the
// RPC tests left behind. Read-only diagnostics; nothing is fixed here.
module.exports = async function rls(db, { ID, tenantA }) {
  async function as(userId, sql, params = []) {
    try {
      return await db.transaction(async (tx) => {
        await tx.exec(`SET LOCAL ROLE authenticated`);
        await tx.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [userId]);
        const r = await tx.query(sql, params);
        await tx.rollback();
        return { rows: r.rows, affected: r.affectedRows };
      });
    } catch (e) {
      if (e.message === "Transaction rolled back" || /rolled back/i.test(e.message)) return { rolledBack: true };
      return { error: `${e.code} ${e.message}` };
    }
  }
  // Reads keep their result: run them without the forced rollback.
  async function read(userId, sql, params = []) {
    try {
      return await db.transaction(async (tx) => {
        await tx.exec(`SET LOCAL ROLE authenticated`);
        await tx.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [userId]);
        const r = await tx.query(sql, params);
        return { rows: r.rows };
      });
    } catch (e) {
      return { error: `${e.code} ${e.message}` };
    }
  }

  const tables = [
    "tenants", "branches", "users", "products", "sales", "inventory_records", "inventory_movements", "stock_batches",
    "targets", "customers", "customer_payments", "stock_requests", "payments", "approval_requests", "expenses",
    "manager_remittances", "owner_remittances", "notifications", "onboardings", "user_preferences", "activities",
  ];
  const roles = [["owner", ID.owner], ["manager", ID.mgrA1], ["storekeeper", ID.skA1], ["sales_rep", ID.repA1]];

  const tenantCol = (t) => (t === "tenants" ? "id" : t === "user_preferences" ? null : "tenant_id");
  console.log("\nRLS reads (rows visible / rows in tenant A):");
  console.log("table".padEnd(22) + roles.map(([r]) => r.padStart(14)).join(""));
  for (const t of tables) {
    const col = tenantCol(t);
    const total = (await db.query(col
      ? `SELECT count(*)::int n FROM public.${t} WHERE ${col} = $1`
      : `SELECT count(*)::int n FROM public.${t} p JOIN public.users u ON u.id = p.user_id WHERE u.tenant_id = $1`, [tenantA])).rows[0].n;
    const cells = [];
    for (const [, id] of roles) {
      const r = await read(id, `SELECT count(*)::int n FROM public.${t}`);
      cells.push((r.error ? "ERR" : `${r.rows[0].n}/${total}`).padStart(14));
    }
    console.log(t.padEnd(22) + cells.join(""));
  }

  console.log("\nDirect writes the app still makes (not through RPCs):");
  const product = (await db.query(`SELECT id FROM public.products WHERE tenant_id=$1 AND status='active' LIMIT 1`, [tenantA])).rows[0].id;
  const writes = [
    ["sales_rep", ID.repA1, "INSERT sales (walk-in sale)",
      `INSERT INTO public.sales (tenant_id, code, branch_id, sales_rep_id, product_id, quantity, unit_price, sale_date, walk_in_name)
       VALUES ($1,'S-RLS',$2,$3,$4,1,60000,CURRENT_DATE,'Walk-in')`, [tenantA, ID.brA1, ID.repA1, product]],
    ["owner", ID.owner, "INSERT branches (new branch)",
      `INSERT INTO public.branches (tenant_id, name, code, location, address, phone, email)
       VALUES ($1,'Yaba','YBA','Lagos','x','1','y@a.test')`, [tenantA]],
    ["owner", ID.owner, "UPDATE branches (edit branch)",
      `UPDATE public.branches SET location = 'Lagos Mainland' WHERE id = $1`, [ID.brA2]],
    ["owner", ID.owner, "UPDATE branches (deactivate)",
      `UPDATE public.branches SET status = 'inactive' WHERE id = $1`, [ID.brA2]],
    ["storekeeper", ID.skA1, "UPDATE notifications (mark read)",
      `UPDATE public.notifications SET read_at = now() WHERE recipient_id = $1 AND read_at IS NULL`, [ID.skA1]],
    ["owner", ID.owner, "UPSERT user_preferences (direct)",
      `INSERT INTO public.user_preferences (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`, [ID.owner]],
  ];
  for (const [role, id, label, sql, params] of writes) {
    const r = await as(id, sql + " RETURNING 1", params);
    const outcome = r.error ? `DENIED ${r.error}` : "allowed";
    console.log(`  ${role.padEnd(12)} ${label.padEnd(36)} ${outcome}`);
  }
};
