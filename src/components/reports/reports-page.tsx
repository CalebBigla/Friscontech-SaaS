import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  BarChart3,
  Boxes,
  CircleDollarSign,
  Download,
  Flag,
  Package,
  PackageX,
  ShoppingCart,
  Target as TargetIcon,
  TrendingUp,
  UserCheck,
  Users,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ALL,
  EmptyState,
  FilterSelect,
  MetricCard,
  Panel,
  StockStatusBadge,
} from "@/components/shared";
import { TargetProgressBar, TargetStatusBadge } from "@/components/targets/target-shared";
import { useDb } from "@/services/mock-store";
import { getAccessScope, useCurrentUserId } from "@/lib/session";
import { getPreferences } from "@/services/services";
import { getPeriodRange, type PeriodKey } from "@/lib/dates";
import { saleTotal } from "@/lib/calculations";
import { formatDate, formatMonth, formatNaira, formatNumber, formatPercent } from "@/lib/format";
import { progressLabel, targetStatusLabel } from "@/lib/catalog-calculations";
import { inventoryStatusLabel } from "@/lib/inventory-calculations";
import {
  getInventoryReport,
  getReportReps,
  getSalesReport,
  getTargetReport,
  getTeamReport,
  reportMonth,
  reportTypeLabel,
  type ReportFilters,
  type ReportType,
} from "@/lib/reports";

type Draft = {
  type: ReportType;
  period: PeriodKey;
  from: string;
  to: string;
  branchId: string;
  repId: string;
  productId: string;
};
const periods: { value: PeriodKey; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
  { value: "quarter", label: "This quarter" },
  { value: "custom", label: "Custom range" },
];

function downloadCsv(name: string, header: string[], rows: (string | number)[][]) {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const blob = new Blob([[header, ...rows].map((r) => r.map(esc).join(",")).join("\n")], {
    type: "text/csv",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function ReportsPage() {
  const db = useDb();
  const scope = getAccessScope(db, useCurrentUserId());
  const today = db.tenant.referenceDate;
  const init: Draft = {
    type: "sales",
    period: getPreferences(db, scope.user.id).defaultReportPeriod,
    from: `${today.slice(0, 7)}-01`,
    to: today,
    branchId: ALL,
    repId: ALL,
    productId: ALL,
  };
  const [draft, setDraft] = useState(init);
  const [applied, setApplied] = useState(init);
  const [loading, setLoading] = useState(false);
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  const branches = db.branches.filter((b) => !scope.branchIds || scope.branchIds.includes(b.id));
  const reps = getReportReps(db, scope, draft.branchId === ALL ? undefined : draft.branchId);
  const rangeOf = (d: Draft) => getPeriodRange(d.period, today, { from: d.from, to: d.to });
  const invalidRange =
    draft.period === "custom" &&
    (!draft.from || !draft.to || draft.from > draft.to || draft.to > today);

  const generate = () => {
    if (invalidRange) {
      toast.error("Choose a valid date range up to today.");
      return;
    }
    setLoading(true);
    setTimeout(() => {
      setApplied(draft);
      setLoading(false);
    }, 300);
  };
  const opt = (v: string) => (v === ALL ? undefined : v);
  const filters: ReportFilters = {
    range: rangeOf(applied),
    branchId: opt(applied.branchId),
    repId: opt(applied.repId),
    productId: opt(applied.productId),
  };
  const name = (id: string | null | undefined) => db.users.find((u) => u.id === id)?.name ?? "—";
  const bname = (id: string) => db.branches.find((b) => b.id === id)?.name ?? "—";
  const pname = (id: string) => db.products.find((p) => p.id === id)?.name ?? "—";
  const rangeLabel = `${formatDate(filters.range.from)} – ${formatDate(filters.range.to)}`;

  const sales = getSalesReport(db, scope, filters);
  const targets: ReturnType<typeof getTargetReport> =
    scope.user.role === "manager"
      ? {
          rows: [],
          summary: { count: 0, total: 0, achieved: 0, progress: 0, onTarget: 0 },
          month: reportMonth(filters),
        }
      : getTargetReport(db, scope, filters);
  const inventory = getInventoryReport(db, scope, filters);
  const team = getTeamReport(db, scope, filters);

  const exportCsv = () => {
    if (scope.user.role === "manager" && applied.type === "targets") {
      toast.error("Target reports are not available to Managers.");
      return;
    }
    const file = `${applied.type}-report-${filters.range.from}-${filters.range.to}.csv`;
    if (applied.type === "sales")
      downloadCsv(
        file,
        ["Date", "Sales Rep", "Branch", "Product", "Quantity", "Revenue"],
        sales.rows.map((s) => [
          s.saleDate,
          name(s.salesRepId),
          bname(s.branchId),
          pname(s.productId),
          s.quantity,
          saleTotal(s),
        ]),
      );
    if (applied.type === "targets")
      downloadCsv(
        file,
        ["Sales Rep", "Branch", "Target", "Achieved", "Remaining", "Progress", "Status"],
        targets.rows.map((r) => [
          name(r.repId),
          bname(r.target.branchId),
          r.amount,
          r.achieved,
          r.remaining,
          progressLabel(r),
          targetStatusLabel[r.status],
        ]),
      );
    if (applied.type === "inventory")
      downloadCsv(
        file,
        ["Product", "SKU", "Branch", "On Hand", "Reserved", "Available", "Threshold", "Status"],
        inventory.rows.map((r) => [
          r.product.name,
          r.product.sku,
          r.branch.name,
          r.record.quantityOnHand,
          r.record.quantityReserved,
          r.available,
          r.record.lowStockThreshold,
          inventoryStatusLabel[r.status],
        ]),
      );
    if (applied.type === "team")
      downloadCsv(
        file,
        scope.user.role === "manager"
          ? ["Sales Rep", "Branch", "Sales Count", "Revenue"]
          : [
              "Sales Rep",
              "Branch",
              "Monthly Target",
              "Achieved",
              "Progress",
              "Sales Count",
              "Status",
            ],
        team.reps.map((r) =>
          scope.user.role === "manager"
            ? [r.user.name, bname(r.user.branchId ?? ""), r.salesCount, r.revenue]
            : [
                r.user.name,
                bname(r.user.branchId ?? ""),
                r.progress?.amount ?? 0,
                r.progress?.achieved ?? 0,
                r.progress ? progressLabel(r.progress) : "—",
                r.salesCount,
                r.progress ? targetStatusLabel[r.progress.status] : "No target",
              ],
        ),
      );
    toast.success("Report exported", { description: file });
  };

  const th = "px-5 py-3",
    td = "px-5 py-3";
  return (
    <AppShell
      title="Reports"
      subtitle={
        scope.user.role === "manager"
          ? "Analyze branch sales, inventory and team activity."
          : "Analyze sales, targets, inventory and team performance."
      }
      actions={
        <Button size="sm" variant="outline" onClick={exportCsv} disabled={loading}>
          <Download className="size-4" />
          <span className="hidden sm:inline">Export</span>
        </Button>
      }
    >
      <section className="mb-5 rounded-lg border border-border bg-card p-4 shadow-panel sm:p-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <Ctl label="Report type">
            <FilterSelect
              label="Report type"
              className="w-full"
              value={draft.type}
              onChange={(v) => set({ type: v as ReportType })}
              options={(Object.keys(reportTypeLabel) as ReportType[])
                .filter((t) => scope.user.role !== "manager" || t !== "targets")
                .map((t) => ({
                  value: t,
                  label:
                    scope.user.role === "manager" && t === "team"
                      ? "Team activity"
                      : reportTypeLabel[t],
                }))}
            />
          </Ctl>
          <Ctl label="Date range">
            <FilterSelect
              label="Date range"
              className="w-full"
              value={draft.period}
              onChange={(v) => set({ period: v as PeriodKey })}
              options={periods}
            />
          </Ctl>
          {branches.length > 1 ? (
            <Ctl label="Branch">
              <FilterSelect
                label="Branch"
                className="w-full"
                value={draft.branchId}
                onChange={(v) => set({ branchId: v, repId: ALL })}
                options={[
                  { value: ALL, label: "All branches" },
                  ...branches.map((b) => ({ value: b.id, label: b.name })),
                ]}
              />
            </Ctl>
          ) : (
            <Ctl label="Branch">
              <p className="flex h-9 items-center truncate rounded-md border border-border bg-muted px-3 text-xs">
                {branches[0]?.name ?? "No branch"}
              </p>
            </Ctl>
          )}
          <Ctl label="Sales representative">
            <FilterSelect
              label="Sales representative"
              className="w-full"
              value={draft.repId}
              onChange={(v) => set({ repId: v })}
              options={[
                { value: ALL, label: "All reps" },
                ...reps.map((r) => ({ value: r.id, label: r.name })),
              ]}
            />
          </Ctl>
          <Ctl label="Product">
            <FilterSelect
              label="Product"
              className="w-full"
              value={draft.productId}
              onChange={(v) => set({ productId: v })}
              options={[
                { value: ALL, label: "All products" },
                ...db.products.map((p) => ({ value: p.id, label: p.name })),
              ]}
            />
          </Ctl>
          <div className="flex items-end">
            <Button className="w-full" onClick={generate} disabled={loading}>
              <BarChart3 className="size-4" />
              {loading ? "Generating…" : "Generate Report"}
            </Button>
          </div>
        </div>
        {draft.period === "custom" && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:max-w-md">
            <Ctl label="From">
              <Input
                type="date"
                value={draft.from}
                max={today}
                onChange={(e) => set({ from: e.target.value })}
                className="h-9 text-xs"
              />
            </Ctl>
            <Ctl label="To">
              <Input
                type="date"
                value={draft.to}
                max={today}
                onChange={(e) => set({ to: e.target.value })}
                className="h-9 text-xs"
              />
            </Ctl>
          </div>
        )}
        {invalidRange && (
          <p className="mt-2 text-[11px] font-medium text-destructive">
            The start date must be before the end date, and neither can be after today.
          </p>
        )}
      </section>

      {loading ? (
        <ReportSkeleton />
      ) : (
        <>
          {applied.type === "sales" && (
            <>
              <Kpis>
                <MetricCard
                  icon={CircleDollarSign}
                  tone="success"
                  label="Total revenue"
                  value={formatNaira(sales.revenue)}
                  detail={rangeLabel}
                />
                <MetricCard
                  icon={ShoppingCart}
                  tone="brand"
                  label="Total sales"
                  value={formatNumber(sales.count)}
                />
                <MetricCard
                  icon={Package}
                  tone="violet"
                  label="Units sold"
                  value={formatNumber(sales.units)}
                />
                <MetricCard
                  icon={TrendingUp}
                  tone="warning"
                  label="Average sale value"
                  value={formatNaira(sales.average)}
                />
              </Kpis>
              <Panel
                className="overflow-hidden"
                title="Sales Report"
                subtitle={`${formatNumber(sales.count)} sales · ${rangeLabel}`}
              >
                <Table
                  empty={sales.rows.length ? null : "No sales recorded for this period."}
                  head={["Date", "Sales Representative", "Branch", "Product", "Qty|r", "Revenue|r"]}
                >
                  {sales.rows.slice(0, 200).map((s) => (
                    <tr key={s.id} className="border-t border-border text-xs">
                      <td className={td}>{formatDate(s.saleDate)}</td>
                      <td className={`${td} font-semibold`}>{name(s.salesRepId)}</td>
                      <td className={td}>{bname(s.branchId)}</td>
                      <td className={td}>{pname(s.productId)}</td>
                      <td className={`${td} text-right`}>{s.quantity}</td>
                      <td className={`${td} text-right font-semibold`}>
                        {formatNaira(saleTotal(s))}
                      </td>
                    </tr>
                  ))}
                </Table>
                {sales.rows.length > 200 && (
                  <p className="border-t border-border px-5 py-3 text-[11px] text-muted-foreground">
                    Showing the latest 200 of {formatNumber(sales.rows.length)} sales. Export
                    includes all rows.
                  </p>
                )}
              </Panel>
            </>
          )}

          {scope.user.role !== "manager" && applied.type === "targets" && (
            <>
              <Kpis>
                <MetricCard
                  icon={TargetIcon}
                  tone="brand"
                  label="Total target"
                  value={formatNaira(targets.summary.total)}
                  detail={formatMonth(targets.month)}
                />
                <MetricCard
                  icon={CircleDollarSign}
                  tone="success"
                  label="Total achieved"
                  value={formatNaira(targets.summary.achieved)}
                />
                <MetricCard
                  icon={TrendingUp}
                  tone="violet"
                  label="Overall progress"
                  value={formatPercent(targets.summary.progress)}
                />
                <MetricCard
                  icon={Flag}
                  tone="warning"
                  label="Reps on target"
                  value={`${targets.summary.onTarget} / ${targets.summary.count}`}
                />
              </Kpis>
              <Panel
                className="overflow-hidden"
                title="Target Performance"
                subtitle={`Monthly targets for ${formatMonth(targets.month)} (month of the end date)`}
              >
                <Table
                  empty={targets.rows.length ? null : "No data available for the selected filters."}
                  head={[
                    "Sales Representative",
                    "Branch",
                    "Target|r",
                    "Achieved|r",
                    "Remaining|r",
                    "Progress",
                    "Status",
                  ]}
                >
                  {targets.rows.map((r) => (
                    <tr key={r.target.id} className="border-t border-border text-xs">
                      <td className={`${td} font-semibold`}>
                        <Link
                          to="/targets/$targetId"
                          params={{ targetId: r.target.id }}
                          className="hover:text-primary"
                        >
                          {name(r.repId)}
                        </Link>
                      </td>
                      <td className={td}>{bname(r.target.branchId)}</td>
                      <td className={`${td} text-right`}>{formatNaira(r.amount)}</td>
                      <td className={`${td} text-right font-semibold`}>
                        {formatNaira(r.achieved)}
                      </td>
                      <td className={`${td} text-right text-muted-foreground`}>
                        {formatNaira(r.remaining)}
                      </td>
                      <td className={`${td} min-w-40`}>
                        <TargetProgressBar p={r} />
                      </td>
                      <td className={td}>
                        <TargetStatusBadge status={r.status} />
                      </td>
                    </tr>
                  ))}
                </Table>
              </Panel>
            </>
          )}

          {applied.type === "inventory" && (
            <>
              <Kpis five>
                <MetricCard
                  icon={Boxes}
                  tone="brand"
                  label="Total products"
                  value={formatNumber(inventory.products)}
                />
                <MetricCard
                  icon={Package}
                  tone="violet"
                  label="Total units"
                  value={formatNumber(inventory.units)}
                />
                <MetricCard
                  icon={AlertTriangle}
                  tone="warning"
                  label="Low stock"
                  value={formatNumber(inventory.low)}
                />
                <MetricCard
                  icon={PackageX}
                  tone="warning"
                  label="Out of stock"
                  value={formatNumber(inventory.out)}
                />
                <MetricCard
                  icon={Wallet}
                  tone="success"
                  label="Inventory value"
                  value={formatNaira(inventory.value)}
                  detail="On hand × unit cost"
                />
              </Kpis>
              <Panel
                className="overflow-hidden"
                title="Inventory Report"
                subtitle="Current stock position"
              >
                <Table
                  empty={inventory.rows.length ? null : "No inventory data available."}
                  head={[
                    "Product",
                    "SKU",
                    "Branch",
                    "On Hand|r",
                    "Reserved|r",
                    "Available|r",
                    "Threshold|r",
                    "Status",
                  ]}
                >
                  {inventory.rows.map((r) => (
                    <tr key={r.record.id} className="border-t border-border text-xs">
                      <td className={`${td} font-semibold`}>
                        <Link
                          to="/inventory/$inventoryId"
                          params={{ inventoryId: r.record.id }}
                          className="hover:text-primary"
                        >
                          {r.product.name}
                        </Link>
                      </td>
                      <td className={`${td} text-muted-foreground`}>{r.product.sku}</td>
                      <td className={td}>{r.branch.name}</td>
                      <td className={`${td} text-right`}>
                        {formatNumber(r.record.quantityOnHand)}
                      </td>
                      <td className={`${td} text-right`}>
                        {formatNumber(r.record.quantityReserved)}
                      </td>
                      <td className={`${td} text-right font-semibold`}>
                        {formatNumber(r.available)}
                      </td>
                      <td className={`${td} text-right text-muted-foreground`}>
                        {r.record.lowStockThreshold}
                      </td>
                      <td className={td}>
                        <StockStatusBadge status={r.status} />
                      </td>
                    </tr>
                  ))}
                </Table>
              </Panel>
            </>
          )}

          {applied.type === "team" && (
            <>
              <Kpis>
                <MetricCard
                  icon={Users}
                  tone="brand"
                  label="Total team members"
                  value={formatNumber(team.summary.total)}
                />
                <MetricCard
                  icon={UserCheck}
                  tone="success"
                  label="Active members"
                  value={formatNumber(team.summary.active)}
                />
                <MetricCard
                  icon={TrendingUp}
                  tone="violet"
                  label="Sales representatives"
                  value={formatNumber(team.summary.reps)}
                />
                <MetricCard
                  icon={Boxes}
                  tone="warning"
                  label="Storekeepers"
                  value={formatNumber(team.summary.storekeepers)}
                />
              </Kpis>
              <Panel
                className="overflow-hidden"
                title={scope.user.role === "manager" ? "Team activity" : "Team Performance"}
                subtitle={
                  scope.user.role === "manager"
                    ? `Sales activity for ${rangeLabel}`
                    : `Targets for ${formatMonth(team.month)} · sales count for ${rangeLabel}`
                }
              >
                <Table
                  empty={team.reps.length ? null : "No data available for the selected filters."}
                  head={
                    scope.user.role === "manager"
                      ? ["Sales Representative", "Branch", "Sales|r", "Revenue|r"]
                      : [
                          "Sales Representative",
                          "Branch",
                          "Monthly Target|r",
                          "Achieved|r",
                          "Progress",
                          "Sales|r",
                          "Status",
                        ]
                  }
                >
                  {team.reps.map((r) => (
                    <tr key={r.user.id} className="border-t border-border text-xs">
                      <td className={`${td} font-semibold`}>
                        <Link
                          to="/team/$userId"
                          params={{ userId: r.user.id }}
                          className="hover:text-primary"
                        >
                          {r.user.name}
                        </Link>
                        {r.user.status === "inactive" && (
                          <span className="ml-2 text-[10px] text-muted-foreground">Inactive</span>
                        )}
                      </td>
                      <td className={td}>{bname(r.user.branchId ?? "")}</td>
                      {scope.user.role === "manager" ? (
                        <>
                          <td className={`${td} text-right`}>{formatNumber(r.salesCount)}</td>
                          <td className={`${td} text-right font-semibold`}>
                            {formatNaira(r.revenue)}
                          </td>
                        </>
                      ) : (
                        <>
                          <td className={`${td} text-right`}>
                            {r.progress ? formatNaira(r.progress.amount) : "—"}
                          </td>
                          <td className={`${td} text-right font-semibold`}>
                            {r.progress ? formatNaira(r.progress.achieved) : "—"}
                          </td>
                          <td className={`${td} min-w-40`}>
                            {r.progress ? (
                              <TargetProgressBar p={r.progress} />
                            ) : (
                              <span className="text-muted-foreground">No target</span>
                            )}
                          </td>
                          <td className={`${td} text-right`}>{formatNumber(r.salesCount)}</td>
                          <td className={td}>
                            {r.progress ? <TargetStatusBadge status={r.progress.status} /> : "—"}
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </Table>
              </Panel>
            </>
          )}
        </>
      )}
    </AppShell>
  );
  function Table({
    head,
    empty,
    children,
  }: {
    head: string[];
    empty: string | null;
    children: React.ReactNode;
  }) {
    if (empty)
      return (
        <EmptyState title={empty} detail="Adjust the filters and generate the report again." />
      );
    return (
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-left">
          <thead>
            <tr className="text-[10px] uppercase text-muted-foreground">
              {head.map((h) => {
                const [l, a] = h.split("|");
                return (
                  <th key={h} className={`${th} ${a ? "text-right" : ""}`}>
                    {l}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
    );
  }
}

function Ctl({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}
function Kpis({ children, five }: { children: React.ReactNode; five?: boolean }) {
  return (
    <div
      className={`mb-5 grid grid-cols-2 gap-3 sm:gap-4 ${five ? "lg:grid-cols-5" : "xl:grid-cols-4"}`}
    >
      {children}
    </div>
  );
}
function ReportSkeleton() {
  return (
    <div aria-busy="true" aria-label="Generating report">
      <div className="mb-5 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-32 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-80 rounded-lg" />
    </div>
  );
}
