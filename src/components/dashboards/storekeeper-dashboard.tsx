import { ExpiringSoonPanel } from "@/components/expiry/expiry-widgets";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, ArrowRight, ClipboardList, Layers, Package, PackageX } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { DataGate, EmptyState, MetricCard, Panel, StockStatusBadge } from "@/components/shared";
import { useLiveWorkspace } from "@/hooks/use-live-workspace";
import { useCustomerOrders } from "@/hooks/use-orders";
import { getAccessScope, useCurrentUserId } from "@/lib/session";
import { getInventoryRows, getInventorySummary } from "@/lib/inventory-calculations";
import { formatDayTime, formatNumber } from "@/lib/format";

/** Stock situation + action queue for the storekeeper's operational branch. */
export function StorekeeperDashboard() {
  // Lots feed the expiry panel.
  const { db, isLoading, error } = useLiveWorkspace({ batches: true });
  const { data: orders = [], isLoading: loadingOrders, error: ordersError } = useCustomerOrders();
  const scope = getAccessScope(db, useCurrentUserId());
  const today = db.tenant.referenceDate;
  const summary = getInventorySummary(db, { branchIds: scope.branchIds });
  const pending = orders.filter((o) => o.status === "pending" && (!scope.branchIds || scope.branchIds.includes(o.branchId)))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const attention = getInventoryRows(db, { branchIds: scope.branchIds }).filter((r) => r.status !== "in_stock").sort((a, b) => a.available - b.available).slice(0, 8);
  const available = getInventoryRows(db, { branchIds: scope.branchIds }).reduce((s, r) => s + r.available, 0);
  const name = (id: string) => db.users.find((u) => u.id === id)?.name ?? "—";
  const product = (id: string) => db.products.find((p) => p.id === id)?.name ?? "—";
  const branchName = db.branches.find((b) => b.id === scope.user.branchId)?.name;

  return (
    <AppShell title="Stock control" subtitle={branchName ? `Operational branch: ${branchName}` : undefined}>
      <div className="mb-5"><h1 className="text-xl font-bold">Stock situation</h1><p className="mt-1 text-xs text-muted-foreground">What needs your attention right now.</p></div>

      <DataGate isLoading={isLoading || loadingOrders} error={error ?? ordersError}>
      <section className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-5">
        <MetricCard icon={Package} tone="brand" label="Total products" value={formatNumber(summary.products)} detail="Managed at this branch" />
        <MetricCard icon={Layers} tone="violet" label="Total stock units" value={formatNumber(available)} detail="Available (not held for orders)" />
        <MetricCard icon={AlertTriangle} tone="warning" label="Low stock" value={formatNumber(summary.low)} detail="At or below threshold" badge={summary.low ? "Review" : undefined} />
        <MetricCard icon={PackageX} tone="warning" label="Out of stock" value={formatNumber(summary.out)} detail="Zero available units" />
        <MetricCard icon={ClipboardList} tone="success" label="Orders to fulfil" value={formatNumber(pending.length)} detail="Raised by sales reps" badge={pending.length ? "Action" : undefined} />
      </section>

      <Panel className="mt-4 overflow-hidden border-primary/40" title="Orders to fulfil" subtitle="Oldest first. The stock is already held for each order."
        action={<Button variant="ghost" size="sm" asChild><Link to="/orders" search={{ status: "pending" }}>Open orders<ArrowRight className="size-3" /></Link></Button>}>
        {pending.length ? <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left">
          <thead><tr className="text-[10px] uppercase text-muted-foreground"><th className="px-5 py-3">Order</th><th className="px-5 py-3">Customer</th><th className="px-5 py-3">Sales rep</th><th className="px-5 py-3">Items</th><th className="px-5 py-3">Raised</th><th className="px-5 py-3 text-right">Action</th></tr></thead>
          <tbody>{pending.slice(0, 8).map((o) => (
            <tr key={o.id} className="border-t border-border text-xs">
              <td className="px-5 py-3 font-mono text-[11px] font-bold">{o.code}</td><td className="px-5 py-3 font-semibold">{o.customerName}</td><td className="px-5 py-3">{name(o.repId)}</td>
              <td className="px-5 py-3">{o.lines.map((l) => `${product(l.productId)} × ${formatNumber(l.quantity)}`).join(", ")}</td>
              <td className="px-5 py-3 text-muted-foreground">{formatDayTime(o.createdAt, today)}</td>
              <td className="px-5 py-2 text-right"><Button size="sm" asChild><Link to="/orders" search={{ status: "pending" }}>Fulfil</Link></Button></td>
            </tr>))}</tbody></table></div>
          : <EmptyState title="You're all caught up." detail="Orders raised by sales reps appear here." />}
      </Panel>

      <Panel className="mt-4 overflow-hidden" title="Low stock" subtitle="Products at or below threshold"
        action={<Button variant="outline" size="sm" asChild><Link to="/inventory">View Inventory</Link></Button>}>
        {attention.length ? <table className="w-full text-left"><thead><tr className="text-[10px] uppercase text-muted-foreground"><th className="px-5 py-3">Product</th><th className="px-5 py-3 text-right">Available</th><th className="px-5 py-3 text-right">Threshold</th><th className="px-5 py-3 text-right">Status</th></tr></thead>
          <tbody>{attention.map((r) => <tr key={r.record.id} className="border-t border-border text-xs"><td className="px-5 py-3 font-semibold"><Link to="/inventory/$inventoryId" params={{ inventoryId: r.record.id }} className="hover:text-primary">{r.product.name}</Link></td><td className="px-5 py-3 text-right font-bold">{formatNumber(r.available)}</td><td className="px-5 py-3 text-right text-muted-foreground">{r.record.lowStockThreshold}</td><td className="px-5 py-3 text-right"><StockStatusBadge status={r.status} /></td></tr>)}</tbody></table>
          : <EmptyState title="All products are above their thresholds." />}
      </Panel>
      <ExpiringSoonPanel db={db} branchIds={scope.branchIds} />
      </DataGate>
    </AppShell>
  );
}
