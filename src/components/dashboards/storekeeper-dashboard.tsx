import { Link } from "@tanstack/react-router";
import { AlertTriangle, ArrowRight, ClipboardList, Layers, Package, PackageX } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { EmptyState, MetricCard, Panel, StockStatusBadge } from "@/components/shared";
import { useDb } from "@/services/mock-store";
import { RepHoldingsPanel } from "@/components/dashboards/rep-holdings-panel";
import { getAccessScope, useCurrentUserId } from "@/lib/session";
import { getInventoryRows, getInventorySummary, getPendingStockRequests, getStockRequestAvailability } from "@/lib/inventory-calculations";
import { formatDayTime, formatNumber } from "@/lib/format";

/** Stock situation + action queue for the storekeeper's operational branch. */
export function StorekeeperDashboard() {
  const db = useDb();
  const scope = getAccessScope(db, useCurrentUserId());
  const today = db.tenant.referenceDate;
  const summary = getInventorySummary(db, { branchIds: scope.branchIds });
  const pending = getPendingStockRequests(db, { branchIds: scope.branchIds }).sort((a, b) => a.requestedAt.localeCompare(b.requestedAt));
  const attention = getInventoryRows(db, { branchIds: scope.branchIds }).filter((r) => r.status !== "in_stock").sort((a, b) => a.available - b.available).slice(0, 8);
  const available = getInventoryRows(db, { branchIds: scope.branchIds }).reduce((s, r) => s + r.available, 0);
  const name = (id: string) => db.users.find((u) => u.id === id)?.name ?? "—";
  const product = (id: string) => db.products.find((p) => p.id === id)?.name ?? "—";
  const branchName = db.branches.find((b) => b.id === scope.user.branchId)?.name;

  return (
    <AppShell title="Stock control" subtitle={branchName ? `Operational branch: ${branchName}` : undefined}>
      <div className="mb-5"><h1 className="text-xl font-bold">Stock situation</h1><p className="mt-1 text-xs text-muted-foreground">What needs your attention right now.</p></div>

      <section className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-5">
        <MetricCard icon={Package} tone="brand" label="Total products" value={formatNumber(summary.products)} detail="Managed at this branch" />
        <MetricCard icon={Layers} tone="violet" label="Total stock units" value={formatNumber(available)} detail="Available to issue" />
        <MetricCard icon={AlertTriangle} tone="warning" label="Low stock" value={formatNumber(summary.low)} detail="At or below threshold" badge={summary.low ? "Review" : undefined} />
        <MetricCard icon={PackageX} tone="warning" label="Out of stock" value={formatNumber(summary.out)} detail="Zero available units" />
        <MetricCard icon={ClipboardList} tone="success" label="Pending requests" value={formatNumber(pending.length)} detail="Awaiting your review" badge={pending.length ? "Action" : undefined} />
      </section>

      <Panel className="mt-4 overflow-hidden border-primary/40" title="Pending stock requests" subtitle="Oldest first — review to approve, reject or fulfil"
        action={<Button variant="ghost" size="sm" asChild><Link to="/stock-requests" search={{ status: "pending" }}>Open queue<ArrowRight className="size-3" /></Link></Button>}>
        {pending.length ? <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left">
          <thead><tr className="text-[10px] uppercase text-muted-foreground"><th className="px-5 py-3">Request</th><th className="px-5 py-3">Sales rep</th><th className="px-5 py-3">Product</th><th className="px-5 py-3 text-right">Qty</th><th className="px-5 py-3 text-right">Available</th><th className="px-5 py-3">Date</th><th className="px-5 py-3 text-right">Action</th></tr></thead>
          <tbody>{pending.map((r) => { const a = getStockRequestAvailability(db, r); return (
            <tr key={r.id} className="border-t border-border text-xs">
              <td className="px-5 py-3 font-mono text-[11px]">{r.id}</td><td className="px-5 py-3 font-semibold">{name(r.repId)}</td><td className="px-5 py-3">{product(r.productId)}</td>
              <td className="px-5 py-3 text-right font-bold">{r.quantityRequested}</td><td className={`px-5 py-3 text-right font-semibold ${a.sufficient ? "" : "text-destructive"}`}>{formatNumber(a.available)}</td>
              <td className="px-5 py-3 text-muted-foreground">{formatDayTime(r.requestedAt, today)}</td>
              <td className="px-5 py-2 text-right"><Button size="sm" asChild><Link to="/stock-requests/$requestId" params={{ requestId: r.id }}>Review Request</Link></Button></td>
            </tr>); })}</tbody></table></div>
          : <EmptyState title="You're all caught up." detail="New requests from sales reps will appear here." />}
      </Panel>

      <Panel className="mt-4 overflow-hidden" title="Low stock" subtitle="Products at or below threshold"
        action={<Button variant="outline" size="sm" asChild><Link to="/inventory">View Inventory</Link></Button>}>
        {attention.length ? <table className="w-full text-left"><thead><tr className="text-[10px] uppercase text-muted-foreground"><th className="px-5 py-3">Product</th><th className="px-5 py-3 text-right">Available</th><th className="px-5 py-3 text-right">Threshold</th><th className="px-5 py-3 text-right">Status</th></tr></thead>
          <tbody>{attention.map((r) => <tr key={r.record.id} className="border-t border-border text-xs"><td className="px-5 py-3 font-semibold"><Link to="/inventory/$inventoryId" params={{ inventoryId: r.record.id }} className="hover:text-primary">{r.product.name}</Link></td><td className="px-5 py-3 text-right font-bold">{formatNumber(r.available)}</td><td className="px-5 py-3 text-right text-muted-foreground">{r.record.lowStockThreshold}</td><td className="px-5 py-3 text-right"><StockStatusBadge status={r.status} /></td></tr>)}</tbody></table>
          : <EmptyState title="All products are above their thresholds." />}
      </Panel>
      <RepHoldingsPanel db={db} branchIds={scope.branchIds} />
    </AppShell>
  );
}
