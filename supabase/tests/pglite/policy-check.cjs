// Prints a read-only SQL query that compares a live database's RLS policies with
// the ones these migrations produce. Run it in the Supabase SQL Editor: every
// row it returns is a difference (missing, extra, or defined differently).
module.exports = async function policyCheck(db) {
  const { rows } = await db.query(`
    SELECT schemaname, tablename, policyname, permissive, cmd,
           array_to_string(roles, ',') AS roles, coalesce(qual, '') AS qual, coalesce(with_check, '') AS with_check
    FROM pg_policies WHERE schemaname IN ('public', 'storage')
    ORDER BY schemaname, tablename, policyname`);
  const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;
  const values = rows.map((r) => `  (${[r.schemaname, r.tablename, r.policyname, r.permissive, r.cmd, r.roles, r.qual, r.with_check].map(lit).join(", ")})`).join(",\n");
  const sql = `-- Expected policies: ${rows.length} (generated from supabase/migrations)
WITH expected (schemaname, tablename, policyname, permissive, cmd, roles, qual, with_check) AS (VALUES
${values}
), live AS (
  SELECT schemaname::text, tablename::text, policyname::text, permissive, cmd,
         array_to_string(roles, ',') AS roles, coalesce(qual, '') AS qual, coalesce(with_check, '') AS with_check
  FROM pg_policies WHERE schemaname IN ('public', 'storage')
)
SELECT coalesce(e.schemaname, l.schemaname) AS schema, coalesce(e.tablename, l.tablename) AS table_name,
       coalesce(e.policyname, l.policyname) AS policy,
       CASE WHEN l.policyname IS NULL THEN 'MISSING on live'
            WHEN e.policyname IS NULL THEN 'EXTRA on live'
            WHEN (e.permissive, e.cmd, e.roles) IS DISTINCT FROM (l.permissive, l.cmd, l.roles) THEN 'different type/command/roles'
            ELSE 'different condition' END AS difference,
       l.cmd AS live_cmd, l.qual AS live_condition, e.qual AS expected_condition
FROM expected e
FULL JOIN live l USING (schemaname, tablename, policyname)
WHERE l.policyname IS NULL OR e.policyname IS NULL
   OR (e.permissive, e.cmd, e.roles, regexp_replace(e.qual, '\\s+', '', 'g'), regexp_replace(e.with_check, '\\s+', '', 'g'))
      IS DISTINCT FROM (l.permissive, l.cmd, l.roles, regexp_replace(l.qual, '\\s+', '', 'g'), regexp_replace(l.with_check, '\\s+', '', 'g'))
ORDER BY 1, 2, 3;`;
  // Against the database it came from, the query must find no differences.
  const self = await db.query(sql);
  if (self.rows.length) throw new Error(`policy check is broken: ${self.rows.length} differences against its own source`);
  console.log(sql);
};
