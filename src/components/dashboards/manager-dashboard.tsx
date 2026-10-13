import { Link } from "@tanstack/react-router";
import { BadgeCheck, Boxes, CircleDollarSign, ClipboardList, Wallet } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { EmptyState, MetricCard, Panel } from "@/components/shared";
import { useDb } from "@/services/mock-store";
import { getAccessScope, useCurrentUserId } from "@/lib/session";
import { getApprovals } from "@/lib/approvals";
import {
  getLowStockItems,
  getOutOfStockItems,
  getBranchInventoryHealth,
} from "@/lib/inventory-calculations";
import { monthOf } from "@/lib/dates";
import { formatCompactNaira, formatPercent } from "@/lib/format";
import { getManagerPaymentSummary, getPaymentsForScope } from "@/lib/payment-calculations";
import { canReviewApproval } from "@/services/services";

/** Branch-scoped Manager overview, derived from shared sales and payment records. */
export function ManagerDashboard() {
  const db = useDb();
  const scope = getAccessScope(db, useCurrentUserId());
  const today = db.tenant.referenceDate;
  const month = monthOf(today);
  const branchId = scope.user.branchId;
  const branch = db.branches.find(
    (item) => item.id === branchId && item.tenantId === scope.user.tenantId,
  );
  const paymentRows = getPaymentsForScope(db, scope, { period: month });
  const summary = getManagerPaymentSummary(db, paymentRows, scope.user.id, month);
  const actionable = getApprovals(db, scope).filter(
    (item) => item.status === "pending" && canReviewApproval(db, scope.user.id, item),
  );
  const inventory = branchId ? getBranchInventoryHealth(db, branchId) : null;
  const low = branchId ? getLowStockItems(db, { branchId }).length : 0;
  const out = branchId ? getOutOfStockItems(db, { branchId }).length : 0;

  if (!branch || !inventory)
    return (
      <AppShell title="Dashboard">
        <EmptyState title="No branch assigned" detail="Ask the Owner to assign you to a branch." />
      </AppShell>
    );

  return (
    <AppShell
      title={`${branch.name} dashboard`}
      subtitle="Branch revenue, collections and items needing your attention"
    >
      <div className="mb-5">
        <h1 className="text-xl font-bold">Good morning, {scope.user.name.split(" ")[0]}</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          {branch.name} · {branch.location}
        </p>
      </div>
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={CircleDollarSign}
          tone="success"
          label="Revenue This Month"
          value={formatCompactNaira(summary.totalSales)}
          detail="Completed branch sales"
        />
        <MetricCard
          icon={Wallet}
          tone="brand"
          label="Total Remittance"
          value={formatCompactNaira(summary.cashPayment + summary.transferPayment)}
          detail="Cash + transfer received"
        />
        <MetricCard
          icon={CircleDollarSign}
          tone="warning"
          label="Total Outstanding"
          value={formatCompactNaira(summary.outstanding)}
          detail="Reported unpaid sales balance"
        />
        <Link
          to="/approvals"
          className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <MetricCard
            icon={BadgeCheck}
            tone="violet"
            label="Approvals"
            value={String(actionable.length)}
            detail="Items requiring your action"
            badge={actionable.length ? "Action" : undefined}
          />
        </Link>
      </section>

      <section className="mt-4 grid gap-4">
        <Panel title="Needs attention" subtitle="Approvals and stock alerts">
          <div className="space-y-2 p-4">
            {actionable.slice(0, 4).map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3 rounded-md bg-muted p-3 text-xs"
              >
                <BadgeCheck className="size-4 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">
                    {item.type === "stock_addition"
                      ? `Stock addition · +${item.quantity}`
                      : item.type === "product_deactivation"
                        ? "Product deactivation"
                        : "Team member request"}
                  </p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {item.id} ·{" "}
                    {db.products.find((product) => product.id === item.productId)?.name ??
                      "Review request"}
                  </p>
                </div>
              </div>
            ))}
            {!actionable.length && (
              <p className="p-3 text-xs text-muted-foreground">No approvals waiting.</p>
            )}
            {(low > 0 || out > 0) && (
              <Link
                to="/inventory"
                className="flex items-center justify-between rounded-md border border-border p-3 text-xs hover:bg-muted"
              >
                <span>
                  {low} low and {out} out-of-stock items
                </span>
                <span className="font-semibold text-primary">View</span>
              </Link>
            )}
            <Button variant="outline" size="sm" className="w-full" asChild>
              <Link to="/approvals">Open approvals</Link>
            </Button>
          </div>
        </Panel>
      </section>
      <section className="mt-4 grid gap-4 sm:grid-cols-2">
        <Panel
          title="Collection progress"
          subtitle="Cash and transfer collected against completed sales"
        >
          <div className="p-5">
            <div className="flex items-end justify-between gap-3">
              <strong className="text-3xl">{formatPercent(summary.collectionRate, 0)}</strong>
              <span className="text-xs text-muted-foreground">
                {formatCompactNaira(summary.cashPayment + summary.transferPayment)} collected /{" "}
                {formatCompactNaira(summary.totalSales)} sales
              </span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${Math.min(summary.collectionRate, 100)}%` }}
              />
            </div>
          </div>
        </Panel>
        <Panel title="Stock health" subtitle="Current branch inventory status">
          <div className="flex items-center gap-3 p-5">
            <Boxes className="size-5 text-primary" />
            <div>
              <p className="font-semibold">{formatPercent(inventory.healthPct, 0)} healthy</p>
              <p className="text-xs text-muted-foreground">
                {low} low · {out} out of stock
              </p>
            </div>
            <Button className="ml-auto" size="sm" variant="outline" asChild>
              <Link to="/inventory">
                <ClipboardList className="size-4" />
                Inventory
              </Link>
            </Button>
          </div>
        </Panel>
      </section>
    </AppShell>
  );
}
