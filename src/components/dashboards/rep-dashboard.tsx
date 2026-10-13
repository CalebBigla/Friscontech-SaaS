import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  Banknote,
  CircleDollarSign,
  ClipboardList,
  Flag,
  Landmark,
  Plus,
  ShoppingCart,
} from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  EmptyState,
  MetricCard,
  Panel,
  ProgressBar,
  RequestStatusBadge,
} from "@/components/shared";
import { RecordSaleDialog } from "@/components/sales/record-sale-dialog";
import { NewRequestDialog } from "@/components/stock-requests/new-request-dialog";
import { useDb } from "@/services/mock-store";
import { getAccessScope, useCurrentUserId } from "@/lib/session";
import {
  filterSales,
  getRepTargetProgress,
  getSalesRevenue,
  saleTotal,
} from "@/lib/calculations";
import { getPendingStockRequests, getStockRequests } from "@/lib/inventory-calculations";
import { getRepPaymentSummary, getPaymentsForScope } from "@/lib/payment-calculations";
import { monthOf } from "@/lib/dates";
import { formatDayTime, formatMonth, formatNaira, formatNumber, formatPercent } from "@/lib/format";

export function RepDashboard() {
  const db = useDb();
  const scope = getAccessScope(db, useCurrentUserId());
  const [saleOpen, setSaleOpen] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);
  const repId = scope.user.id;
  const branchId = scope.user.branchId ?? "";
  const today = db.tenant.referenceDate;
  const month = monthOf(today);
  const todayRevenue = getSalesRevenue(db, { repId, range: { from: today, to: today } });
  const todayCount = filterSales(db, { repId, range: { from: today, to: today } }).length;
  const progress = getRepTargetProgress(db, repId, month);
  const pendingRequests = getPendingStockRequests(db, { repId }).length;
  const payment = getRepPaymentSummary(db, repId, month);
  const latestPayment = getPaymentsForScope(db, scope, { period: month })[0];
  const recentSales = filterSales(db, { repId, includeNonCompleted: true })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 6);
  const recentRequests = getStockRequests(db, { repId }).slice(0, 6);
  const recentActivity = db.activities
    .filter((event) => event.tenantId === scope.user.tenantId && event.actorId === repId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 6);
  const product = (id: string) => db.products.find((item) => item.id === id)?.name ?? "—";
  const branchName = db.branches.find((branch) => branch.id === branchId)?.name;

  return (
    <AppShell
      title="My workspace"
      subtitle={branchName ? `Current branch: ${branchName}` : undefined}
      actions={
        <div className="flex gap-2">
          <Button variant="outline" className="min-h-10" onClick={() => setRequestOpen(true)}>
            <ClipboardList className="size-4" />
            <span className="hidden sm:inline">Request Stock</span>
          </Button>
          <Button className="min-h-10" onClick={() => setSaleOpen(true)}>
            <Plus className="size-4" />
            <span className="hidden sm:inline">Record Sale</span>
          </Button>
        </div>
      }
    >
      <div className="mb-4">
        <h1 className="text-xl font-bold">Good day, {scope.user.name.split(" ")[0]}</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          Your sales, target, payment and stock for {formatMonth(month)}.
        </p>
      </div>

      <MetricCard
        icon={CircleDollarSign}
        tone="success"
        label="Today's sales"
        value={formatNaira(todayRevenue)}
        detail={`${todayCount} completed today`}
      />

      <section className="mt-4 rounded-lg border border-border bg-card p-4 shadow-panel sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <p className="panel-title flex items-center gap-2">
              <Flag className="size-4 text-primary" />
              Target progress
            </p>
            <p className="mt-3 text-2xl font-bold sm:text-3xl">
              {formatNaira(progress.revenue)}{" "}
              <span className="text-base font-medium text-muted-foreground sm:text-lg">
                / {formatNaira(progress.target)}
              </span>
            </p>
            <div className="mt-4">
              <ProgressBar value={progress.achievement} band={progress.band} />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {formatPercent(progress.achievement)} of your monthly target achieved
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:w-64">
            <div className="rounded-md bg-muted p-3 sm:p-4">
              <p className="text-[11px] text-muted-foreground">Remaining</p>
              <p className="mt-1 text-base font-bold sm:text-lg">
                {formatNaira(progress.remaining)}
              </p>
            </div>
            <div className="rounded-md bg-muted p-3 sm:p-4">
              <p className="text-[11px] text-muted-foreground">Achievement</p>
              <p className="mt-1 text-base font-bold sm:text-lg">
                {formatPercent(progress.achievement)}
              </p>
            </div>
          </div>
        </div>
      </section>

      <Panel
        title="Payment"
        subtitle={`${formatMonth(month)} collection and submission status`}
        className="mt-4"
        action={
          <Button asChild variant="ghost" size="sm">
            <Link to="/payment">Payment history</Link>
          </Button>
        }
      >
        <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4 sm:p-5">
          <Amount
            label="Cash"
            amount={payment.cash}
            icon={<Banknote className="size-4 text-success" />}
          />
          <Amount
            label="Transfer"
            amount={payment.transfer}
            icon={<Landmark className="size-4 text-primary" />}
          />
          <Amount
            label="Outstanding"
            amount={payment.outstanding}
            icon={<CircleDollarSign className="size-4 text-warning" />}
          />
          <div className="rounded-md border border-border p-3">
            <p className="text-[11px] text-muted-foreground">Latest submission</p>
            <div className="mt-1 flex items-center gap-2">
              {latestPayment ? (
                <>
                  <Badge variant="outline" className="capitalize">
                    {latestPayment.status}
                  </Badge>
                  <span className="truncate text-[11px] text-muted-foreground">
                    {formatDayTime(latestPayment.submittedAt, today)}
                  </span>
                </>
              ) : (
                <span className="text-sm font-semibold">None yet</span>
              )}
            </div>
          </div>
        </div>
      </Panel>

      <Panel
        title="Stock Requests"
        subtitle={`${pendingRequests} awaiting action`}
        className="mt-4"
        action={
          <Button size="sm" className="min-h-10" onClick={() => setRequestOpen(true)}>
            <Plus className="size-4" />
            New request
          </Button>
        }
      >
        {recentRequests.length ? (
          <div className="divide-y divide-border">
            {recentRequests.map((request) => (
              <Link
                key={request.id}
                to="/stock-requests/$requestId"
                params={{ requestId: request.id }}
                className="flex min-h-14 items-center justify-between gap-3 px-4 py-3 hover:bg-muted/30 sm:px-5"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">
                    {product(request.productId)}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    Qty {request.quantityRequested} · {formatDayTime(request.requestedAt, today)}
                  </span>
                </span>
                <RequestStatusBadge request={request} />
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState title="No requests yet" detail="Request stock when you run low." />
        )}
      </Panel>

      <Panel title="Recent Activity" subtitle="Recent actions from your account" className="mt-4">
        {recentActivity.length ? (
          <div className="divide-y divide-border">
            {recentActivity.map((event) => (
              <div
                key={event.id}
                className="flex items-start justify-between gap-3 px-4 py-3 sm:px-5"
              >
                <div className="min-w-0">
                  <p className="text-xs font-semibold">{event.action.replaceAll("_", " ")}</p>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{event.subject}</p>
                </div>
                <span className="shrink-0 text-[10px] text-muted-foreground">
                  {formatDayTime(event.createdAt, today)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No recent activity"
            detail="Your sales and payment activity will appear here."
          />
        )}
      </Panel>

      <Panel
        title="Recent Sales"
        subtitle="Your latest recorded sales"
        className="mt-4"
        action={
          <Button asChild variant="ghost" size="sm">
            <Link to="/sales">View all</Link>
          </Button>
        }
      >
        {recentSales.length ? (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[620px] text-left">
                <thead>
                  <tr className="text-[10px] uppercase text-muted-foreground">
                    <th className="px-5 py-3">Product</th>
                    <th className="px-5 py-3 text-right">Qty</th>
                    <th className="px-5 py-3 text-right">Revenue</th>
                    <th className="px-5 py-3 text-right">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {recentSales.map((sale) => (
                    <tr key={sale.id} className="border-t border-border text-xs hover:bg-muted/30">
                      <td className="px-5 py-3 font-semibold">{product(sale.productId)}</td>
                      <td className="px-5 py-3 text-right">{sale.quantity}</td>
                      <td className="px-5 py-3 text-right font-bold">
                        {formatNaira(saleTotal(sale))}
                      </td>
                      <td className="px-5 py-3 text-right text-muted-foreground">
                        {formatDayTime(sale.createdAt, today)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="divide-y divide-border md:hidden">
              {recentSales.map((sale) => (
                <div
                  key={sale.id}
                  className="flex min-h-16 items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{product(sale.productId)}</p>
                    <p className="text-[11px] text-muted-foreground">
                      Qty {sale.quantity} · {formatDayTime(sale.createdAt, today)}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-bold">{formatNaira(saleTotal(sale))}</span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <EmptyState title="No sales yet" detail="Record your first sale to see it here." />
        )}
      </Panel>
      <p className="mt-4 flex items-center gap-2 text-[11px] text-muted-foreground">
        <ShoppingCart className="size-3" />
        Figures include completed sales only.
      </p>
      <RecordSaleDialog open={saleOpen} onOpenChange={setSaleOpen} scope={scope} />
      <NewRequestDialog open={requestOpen} onOpenChange={setRequestOpen} scope={scope} />
    </AppShell>
  );
}

function Amount({ label, amount, icon }: { label: string; amount: number; icon: ReactNode }) {
  return (
    <div className="rounded-md border border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-muted-foreground">{label}</p>
        {icon}
      </div>
      <p className="mt-1 truncate text-base font-bold sm:text-lg">{formatNaira(amount)}</p>
    </div>
  );
}
