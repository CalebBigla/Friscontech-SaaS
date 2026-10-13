import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";

import { AppShell, RoleGate } from "@/components/app-shell";
import { ALL, FilterSelect, Panel } from "@/components/shared";
import { MovementList } from "@/components/inventory/movement-list";
import type { MovementType } from "@/data/mock-db";
import { useDb } from "@/services/mock-store";
import { getAccessScope, useCurrentUserId } from "@/lib/session";
import { getInventoryMovements, movementTypeLabel } from "@/lib/inventory-calculations";

export const Route = createFileRoute("/stock-movements")({
  head: () => ({
    meta: [
      { title: "Stock Movements — SalesFlow Pro" },
      { name: "description", content: "Every stock addition, issue, sale and adjustment at your branch." },
      { property: "og:title", content: "Stock Movements — SalesFlow Pro" },
      { property: "og:description", content: "A traceable history of every inventory change." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <RoleGate allow={(s) => s.canViewInventoryAdmin} title="Stock Movements" message="Stock movements are not part of your role."><MovementsPage /></RoleGate>,
});

function MovementsPage() {
  const db = useDb();
  const scope = getAccessScope(db, useCurrentUserId());
  const [type, setType] = useState(ALL);
  const [limit, setLimit] = useState(50);
  const hideSales = scope.user.role === "storekeeper";
  const list = getInventoryMovements(db, { branchIds: scope.branchIds, type: type === ALL ? undefined : (type as MovementType) }).filter((m) => !hideSales || m.type !== "sale");
  return (
    <AppShell title="Stock Movements" subtitle="Traceable inventory history">
      <div className="mb-5"><h1 className="text-xl font-bold">Stock Movements</h1><p className="mt-1 text-xs text-muted-foreground">Every change to on-hand stock, newest first.</p></div>
      <Panel title="Movements" subtitle={`${list.length} movements`} action={<FilterSelect label="Movement type" value={type} onChange={(v) => { setType(v); setLimit(50); }} options={[{ value: ALL, label: "All types" }, ...Object.entries(movementTypeLabel).filter(([k]) => !hideSales || k !== "sale").map(([value, label]) => ({ value, label }))]} />}>
        <MovementList db={db} movements={list.slice(0, limit)} showItem />
        {list.length > limit && <div className="border-t border-border p-3 text-center"><button className="text-xs font-semibold text-primary" onClick={() => setLimit((l) => l + 50)}>Show more</button></div>}
      </Panel>
    </AppShell>
  );
}
