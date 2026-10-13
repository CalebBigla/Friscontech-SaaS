import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  Check,
  CircleDollarSign,
  FileText,
  Landmark,
  Layers,
  Package,
  PackageX,
  ShieldCheck,
  Target,
  Users,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";

import { AppShell, RestrictedNotice } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { EmptyState, MetricCard, Panel, RequestStatusBadge } from "@/components/shared";
import { useDb } from "@/services/mock-store";
import {
  getInventorySummary,
} from "@/lib/inventory-calculations";
import { getStockRequests } from "@/lib/inventory-calculations";
import { getAccessScope, useCurrentUserId } from "@/lib/session";
import { getAuditLogs } from "@/lib/audit";
import { describeApproval, getApprovals } from "@/lib/approvals";
import {
  getBranchInventoryHealth,
  getDeadStockValue,
  getSalesRevenue,
  getTargetForRange,
  percentChange,
} from "@/lib/calculations";
import { getPeriodRange, isoWeek, previousRange, type PeriodKey } from "@/lib/dates";
import { formatCompactNaira, formatDate, formatNumber, formatPercent, formatTime } from "@/lib/format";
import { getManagerRemittances } from "@/lib/remittance-calculations";
import { canReviewApproval } from "@/services/services";

type Period = "Day" | "Week" | "Month" | "Quarter";
const periodKey: Record<Period, PeriodKey> = {
  Day: "today",
  Week: "week",
  Month: "month",
  Quarter: "quarter",
};
const metricIcons = [CircleDollarSign, Users, Target] as const;

function minutesAgo(iso: string, now: string) {
  const diff = Math.max(0, Math.round((Date.parse(`${now}:00`) - Date.parse(iso)) / 60000));
  return diff < 60 ? `${diff}m` : `${Math.round(diff / 60)}h`;
}

export function OwnerDashboard() {
  const db = useDb();
  const userId = useCurrentUserId();
  const scope = getAccessScope(db, userId);
  const [period, setPeriod] = useState<Period>("Week");

  const today = db.tenant.referenceDate;
  const nowIso = `${today}T${db.tenant.lastSyncTime}`;
  const pendingRemittances = getManagerRemittances(db, scope, { status: "submitted" });
  const pendingApprovals = getApprovals(db, scope).filter(
    (item) => item.status === "pending" && canReviewApproval(db, userId, item),
  );
  const approvalCount = pendingApprovals.length + pendingRemittances.length;
  const approvalTarget = pendingRemittances.length ? "/remittance" : "/approvals";

  const data = useMemo(() => {
    const active = db.branches.filter((b) => b.status === "active");
    const activeIds = active.map((b) => b.id);
    const range = getPeriodRange(periodKey[period], today);
    const revenue = getSalesRevenue(db, { range });
    const prevRevenue = getSalesRevenue(db, { range: previousRange(range) });
    const target = getTargetForRange(db, range, {});
    const attainment = target ? (revenue / target) * 100 : 0;
    const team = db.users.filter(
      (x) =>
        x.status === "active" && x.role !== "owner" && x.branchId && activeIds.includes(x.branchId),
    );
    const prevTarget = getTargetForRange(db, previousRange(range), {});
    const prevAttainment = prevTarget ? (prevRevenue / prevTarget) * 100 : 0;
    const change = percentChange(revenue, prevRevenue);
    const metrics = [
      {
        label: "Total revenue",
        value: formatCompactNaira(revenue),
        detail: `${formatCompactNaira(prevRevenue)} previous period`,
        change: `${change >= 0 ? "+" : ""}${change.toFixed(0)}%`,
        tone: change >= 0 ? "success" : "danger",
      },
      {
        label: "Team members",
        value: String(team.length),
        detail: `Across ${active.length} branches`,
        change: `${db.users.filter((x) => x.role === "sales_rep" && team.includes(x)).length} reps`,
        tone: "violet",
      },
      {
        label: "Target attainment",
        value: formatPercent(attainment, 0),
        detail: `${formatCompactNaira(Math.max(target - revenue, 0))} remaining`,
        change: `${attainment - prevAttainment >= 0 ? "+" : ""}${(attainment - prevAttainment).toFixed(0)}%`,
        tone: "warning",
      },
    ];
    const inv = getBranchInventoryHealth(db, undefined, activeIds);
    const inventorySummary = getInventorySummary(db, { branchIds: activeIds });
    return {
      metrics,
      inv,
      inventorySummary,
      dead: getDeadStockValue(db, activeIds),
    };
  }, [db, period, today]);

  const tenantBranchIds = db.branches
    .filter((branch) => branch.tenantId === scope.user.tenantId)
    .map((branch) => branch.id);
  const requests = getStockRequests(db, { branchIds: scope.branchIds ?? tenantBranchIds });
  const pending = requests.filter((request) => request.status === "pending").length;
  const openEscalations = db.escalations.filter((e) => e.status === "open");
  const nameOf = (id: string) => db.branches.find((b) => b.id === id)?.name ?? "—";
  const productOf = (id: string) => db.products.find((p) => p.id === id)?.name ?? "—";

  if (scope.user.role !== "owner") {
    return (
      <AppShell title="Business health overview">
        <RestrictedNotice message="The business-wide dashboard is available to Owners. Use Branches or Sales for your assigned location." />
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Business health overview"
      subtitle={`Live operations across ${db.tenant.name}`}
      actions={
        <Button
          onClick={() =>
            toast.success("Report export queued", {
              description: "You'll be notified when the file is ready.",
            })
          }
        >
          <FileText className="size-4" />
          <span className="hidden sm:inline">Export report</span>
        </Button>
      }
    >
      <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-xl font-bold">Good afternoon, {scope.user.name.split(" ")[0]}</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Updated today at {db.tenant.lastSyncTime} AM · Fiscal week W{isoWeek(today)}
          </p>
        </div>
        <div className="grid grid-cols-4 rounded-md border border-border bg-card p-1">
          {(["Day", "Week", "Month", "Quarter"] as Period[]).map((item) => (
            <Button
              key={item}
              size="sm"
              variant={period === item ? "default" : "ghost"}
              onClick={() => setPeriod(item)}
            >
              {item}
            </Button>
          ))}
        </div>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {data.metrics.map((metric, index) => {
          const Icon = metricIcons[index] ?? CircleDollarSign;
          return (
            <article
              key={metric.label}
              className="rounded-lg border border-border bg-card p-5 shadow-panel"
            >
              <div className="flex items-start justify-between">
                <span
                  className={`metric-icon metric-icon-${metric.tone === "danger" ? "warning" : metric.tone}`}
                >
                  <Icon className="size-5" />
                </span>
                <span className={`status status-${metric.tone}`}>{metric.change}</span>
              </div>
              <p className="mt-5 text-xs text-muted-foreground">
                {metric.label} · {period}
              </p>
              <p className="mt-1 text-2xl font-bold">{metric.value}</p>
              <p className="mt-2 text-[11px] text-muted-foreground">{metric.detail}</p>
            </article>
          );
        })}
        <Link to={approvalTarget} className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <MetricCard
            icon={Landmark}
            tone="warning"
            label="Approvals"
            value={String(approvalCount)}
            detail={`${pendingRemittances.length} Manager remittances · ${pendingApprovals.length} other requests`}
            badge={approvalCount ? "Action" : undefined}
          />
        </Link>
      </section>

      <section className="mt-4">
        <Panel title="Inventory summary" subtitle="Shared inventory records · on hand × unit cost">
          <div className="grid grid-cols-2 gap-3 p-4">
            <MetricCard
              icon={Package}
              tone="brand"
              label="Products"
              value={formatNumber(data.inventorySummary.products)}
              detail="Represented in inventory"
            />
            <MetricCard
              icon={Layers}
              tone="violet"
              label="Total Units"
              value={formatNumber(data.inventorySummary.units)}
              detail="On hand across active branches"
            />
            <MetricCard
              icon={Wallet}
              tone="success"
              label="Inventory Value"
              value={formatCompactNaira(data.inventorySummary.value)}
              detail="On hand × product unit cost"
            />
            <MetricCard
              icon={AlertTriangle}
              tone="warning"
              label="Low Stock"
              value={formatNumber(data.inventorySummary.low)}
              detail="At or below threshold"
            />
            <MetricCard
              icon={PackageX}
              tone="warning"
              label="Out of Stock"
              value={formatNumber(data.inventorySummary.out)}
              detail="No available units"
            />
          </div>
          <div className="border-t border-border px-5 py-3 text-[11px] text-muted-foreground">
            {data.inv.status} · dead stock value {formatCompactNaira(data.dead)}
          </div>
        </Panel>
      </section>

      <Panel title="Approvals" subtitle="Manager remittances and requests requiring Owner review" className="mt-4">
        <div className="divide-y divide-border">
          {pendingRemittances.map((remittance) => (
            <Link key={remittance.id} to="/remittance" className="flex flex-col gap-2 p-4 text-xs hover:bg-muted/50 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">
                  Manager remittance · {db.users.find((user) => user.id === remittance.managerId)?.name ?? "Manager"}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {nameOf(remittance.branchId)} · {remittance.period} · Submitted {formatDate((remittance.submittedAt ?? remittance.createdAt).slice(0, 10))} {formatTime(remittance.submittedAt ?? remittance.createdAt)}
                </p>
              </div>
              <span className="font-semibold tabular-nums">{formatCompactNaira(remittance.netRemittanceDue)}</span>
              <span className="status status-warning">Review</span>
            </Link>
          ))}
          {pendingApprovals.map((approval) => (
            <Link key={approval.id} to="/approvals" className="flex items-center justify-between gap-3 p-4 text-xs hover:bg-muted/50">
              <span className="min-w-0 truncate font-semibold">{describeApproval(db, approval).title}</span>
              <span className="status status-brand">Approval request</span>
            </Link>
          ))}
          {!approvalCount && <p className="p-4 text-xs text-muted-foreground">No approvals are waiting.</p>}
        </div>
      </Panel>

      <section className="mt-4 grid gap-4 xl:grid-cols-[1fr_1fr_0.9fr]">
        <Panel
          title="Stock requests"
          subtitle={`${requests.length} requests · ${pending} pending`}
          action={
            <Button variant="ghost" size="sm" asChild>
              <Link to="/stock-requests">View all</Link>
            </Button>
          }
        >
          {requests.length ? (
            <div className="divide-y divide-border">
              {requests.slice(0, 5).map((request) => {
                const rep = db.users.find((user) => user.id === request.repId);
                const storekeeperId =
                  request.processedBy ?? request.fulfilledBy ?? request.approvedBy;
                const storekeeper = storekeeperId
                  ? db.users.find((user) => user.id === storekeeperId)?.name
                  : db.users.find(
                      (user) =>
                        user.tenantId === scope.user.tenantId &&
                        user.branchId === request.branchId &&
                        user.role === "storekeeper" &&
                        user.status === "active",
                    )?.name;
                return (
                  <div key={request.id} className="space-y-2 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold">
                          {productOf(request.productId)} · {request.quantityRequested} units
                        </p>
                        <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                          {rep?.name ?? "Sales representative"} · {storekeeper ?? "Awaiting storekeeper"}
                        </p>
                      </div>
                      <RequestStatusBadge request={request} />
                    </div>
                    <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                      <span className="min-w-0 truncate">
                        {nameOf(request.branchId)} · {formatDate(request.requestedAt)} {formatTime(request.requestedAt)}
                      </span>
                      <Button variant="ghost" size="sm" className="h-7 shrink-0 px-2" asChild>
                        <Link to="/stock-requests/$requestId" params={{ requestId: request.id }}>
                          View
                        </Link>
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState title="No stock requests yet." />
          )}
        </Panel>
        <article className="rounded-lg border border-border bg-card p-5 shadow-panel">
          <div className="flex items-center justify-between">
            <h2 className="panel-title">Recent activity</h2>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/audit-log">View all</Link>
            </Button>
          </div>
          <div className="mt-3">
            {getAuditLogs(db, scope)
              .slice(0, 4)
              .map((item) => (
                <div key={item.id} className="flex gap-3 border-b border-border py-3 last:border-0">
                  <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-success-soft text-success">
                    <Check className="size-3" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold">{item.action}</p>
                    <p className="truncate text-[10px] text-muted-foreground">{item.subject}</p>
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    {formatTime(item.createdAt)}
                  </span>
                </div>
              ))}
          </div>
        </article>
        <article className="rounded-lg border border-border bg-card p-5 shadow-panel">
          <div className="flex items-center justify-between">
            <h2 className="panel-title">Escalations</h2>
            <span className="status status-danger">{openEscalations.length} open</span>
          </div>
          <div className="mt-4 space-y-2">
            {openEscalations.map((alert) => (
              <div key={alert.id} className={`alert alert-${alert.tone}`}>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase">{alert.type}</span>
                  <span className="text-[9px]">{minutesAgo(alert.createdAt, nowIso)} ago</span>
                </div>
                <p className="mt-1 text-xs font-bold">{nameOf(alert.branchId)}</p>
                <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
                  {alert.detail}
                </p>
              </div>
            ))}
          </div>
        </article>
      </section>

      <div className="mt-5 flex items-center gap-2 text-[10px] text-muted-foreground">
        <ShieldCheck className="size-3" />
        Viewing tenant-scoped data for {db.tenant.name}
      </div>
    </AppShell>
  );
}
