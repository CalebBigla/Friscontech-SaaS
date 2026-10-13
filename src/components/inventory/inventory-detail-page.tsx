import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Plus, SlidersHorizontal } from "lucide-react";

import { AppShell, RestrictedNotice } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { DetailItem, EmptyState, Panel, RequestStatusBadge, StockStatusBadge } from "@/components/shared";
import { AddStockDialog } from "@/components/inventory/add-stock-dialog";
import { AdjustStockDialog } from "@/components/inventory/adjust-stock-dialog";
import { MovementList } from "@/components/inventory/movement-list";
import { useDb } from "@/services/mock-store";
import { canSeeBranch, getAccessScope, useCurrentUserId } from "@/lib/session";
import { getInventoryMovements, getInventoryRows, getStockRequests, isRequestOpen, resolveInventory } from "@/lib/inventory-calculations";
import { formatDayTime, formatNaira, formatNumber, formatUnits } from "@/lib/format";

export function InventoryDetailPage({ inventoryId }: { inventoryId: string }) {
  const db = useDb();
  const userId = useCurrentUserId();
  const scope = getAccessScope(db, userId);
  const [addOpen, setAddOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const record = db.inventory.find((i) => i.id === inventoryId);
  const row = record ? resolveInventory(db, record) : null;

  if (!row || !canSeeBranch(scope, row.branch.id)) {
    return <AppShell title="Inventory item"><RestrictedNotice message={row ? "This inventory belongs to a branch outside your access." : "This inventory record does not exist."} /><div className="mt-4 text-center"><Button variant="outline" asChild><Link to="/inventory"><ArrowLeft className="size-4" />Back to inventory</Link></Button></div></AppShell>;
  }
  const { product, branch, available, status } = row;
  const movements = getInventoryMovements(db, { productId: product.id, branchId: branch.id });
  const openRequests = getStockRequests(db, { branchId: branch.id, repId: scope.repId }).filter((r) => r.productId === product.id && isRequestOpen(r));
  const otherBranches = getInventoryRows(db, { branchIds: scope.branchIds }).filter((r) => r.product.id === product.id);

  return (
    <AppShell title={product.name} subtitle={`${branch.name} · ${product.sku}`}
      actions={scope.canManageStock && <div className="flex gap-2">
        <Button variant="outline" onClick={() => setAdjustOpen(true)}><SlidersHorizontal className="size-4" /><span className="hidden sm:inline">Adjust</span></Button>
        <Button onClick={() => setAddOpen(true)}><Plus className="size-4" /><span className="hidden sm:inline">Add Stock</span></Button>
      </div>}>
      <Link to="/inventory" className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground"><ArrowLeft className="size-3.5" />Inventory</Link>
      <div className="mb-5 mt-2 flex flex-wrap items-center gap-3"><h1 className="text-xl font-bold">{product.name}</h1><StockStatusBadge status={status} /></div>

      <section className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
        <Panel title="Current stock" subtitle={`Last updated ${formatDayTime(row.record.lastUpdated, db.tenant.referenceDate)}`}>
          <div className="grid grid-cols-2 gap-5 p-5 sm:grid-cols-4">
            <DetailItem label="On hand"><span className="text-2xl font-bold">{formatNumber(row.record.quantityOnHand)}</span></DetailItem>
            <DetailItem label="Reserved"><span className="text-2xl font-bold text-muted-foreground">{row.record.quantityReserved}</span></DetailItem>
            <DetailItem label="Available"><span className="text-2xl font-bold text-primary">{formatNumber(available)}</span></DetailItem>
            <DetailItem label="Low-stock threshold"><span className="text-2xl font-bold">{row.record.lowStockThreshold}</span></DetailItem>
          </div>
          <div className="mx-5 mb-5 h-2 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full ${status === "in_stock" ? "bg-success" : status === "low_stock" ? "bg-warning" : "bg-destructive"}`} style={{ width: `${Math.min((available / Math.max(row.record.reorderLevel * 2, 1)) * 100, 100)}%` }} /></div>
          <p className="mx-5 -mt-3 mb-5 text-[11px] text-muted-foreground">Reorder level {row.record.reorderLevel} · stock value {formatNaira(row.value)} at cost</p>
        </Panel>
        <Panel title="Product information">
          <div className="grid grid-cols-2 gap-5 p-5">
            <DetailItem label="Product">{product.name}</DetailItem>
            <DetailItem label="SKU"><span className="font-mono text-xs">{product.sku}</span></DetailItem>
            <DetailItem label="Category">{product.category}</DetailItem>
            <DetailItem label="Unit">{product.unit}</DetailItem>
            <DetailItem label="Selling price">{formatNaira(product.unitPrice)}</DetailItem>
            <DetailItem label="Unit cost">{formatNaira(product.unitCost)}</DetailItem>
            <DetailItem label="Branch"><Link to="/branches/$branchId" params={{ branchId: branch.id }} className="hover:text-primary">{branch.name}</Link></DetailItem>
            <DetailItem label="Location">{branch.location}</DetailItem>
          </div>
        </Panel>
      </section>

      <section className="mt-4 grid gap-4 xl:grid-cols-[1.3fr_1fr]">
        <Panel title="Stock movement history" subtitle={`${movements.length} movements recorded`}>
          <MovementList db={db} movements={movements.slice(0, 40)} />
        </Panel>
        <div className="space-y-4">
          <Panel title="Open stock requests" subtitle="Awaiting approval or issue">
            {openRequests.length ? <div className="divide-y divide-border">{openRequests.map((r) => (
              <Link key={r.id} to="/stock-requests/$requestId" params={{ requestId: r.id }} className="flex items-center justify-between gap-3 px-5 py-3 text-xs hover:bg-muted/60">
                <div className="min-w-0"><p className="font-semibold">{r.id} · {db.users.find((u) => u.id === r.repId)?.name}</p><p className="text-[11px] text-muted-foreground">{formatUnits(r.quantityRequested)} · {formatDayTime(r.requestedAt, db.tenant.referenceDate)}</p></div>
                <RequestStatusBadge request={r} />
              </Link>))}</div> : <EmptyState title="You're all caught up." detail="No open requests for this product." />}
          </Panel>
          {otherBranches.length > 1 && <Panel title="Stock across branches">
            <div className="divide-y divide-border">{otherBranches.map((r) => (
              <Link key={r.record.id} to="/inventory/$inventoryId" params={{ inventoryId: r.record.id }} className={`flex items-center justify-between px-5 py-3 text-xs hover:bg-muted/60 ${r.record.id === inventoryId ? "bg-muted" : ""}`}>
                <span className="font-semibold">{r.branch.name}</span><span className="flex items-center gap-2"><strong>{formatUnits(r.available)}</strong><StockStatusBadge status={r.status} /></span>
              </Link>))}</div>
          </Panel>}
        </div>
      </section>

      <AddStockDialog open={addOpen} onOpenChange={setAddOpen} scope={scope} defaults={{ branchId: branch.id, productId: product.id }} />
      <AdjustStockDialog record={adjustOpen ? row.record : null} productName={product.name} onClose={() => setAdjustOpen(false)} actorId={userId} />
    </AppShell>
  );
}
