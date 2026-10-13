import { useMemo, useState } from "react";
import { getRouteApi } from "@tanstack/react-router";
import {
  BarChart3,
  CircleDollarSign,
  Eye,
  Plus,
  Receipt,
  SlidersHorizontal,
  Target,
} from "lucide-react";

import { AppShell, RestrictedNotice } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ALL, EmptyState, FilterSelect, MetricCard, Panel } from "@/components/shared";
import { RecordSaleDialog } from "@/components/sales/record-sale-dialog";
import type { Sale } from "@/data/mock-db";
import { useDb } from "@/services/mock-store";
import { getAccessScope, useCurrentUserId } from "@/lib/session";
import {
  filterSales,
  getRepTargetProgress,
  getRevenueSeries,
  getSalesCount,
  getSalesRevenue,
  getTargetForRange,
  saleTotal,
  type SalesFilters,
} from "@/lib/calculations";
import { getPeriodRange, monthOf, type PeriodKey } from "@/lib/dates";
import {
  formatCompactNaira,
  formatDate,
  formatMonth,
  formatNaira,
  formatPercent,
  formatShortDate,
  formatTime,
} from "@/lib/format";

const route = getRouteApi("/sales");
const periods: { key: PeriodKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "week", label: "This Week" },
  { key: "month", label: "This Month" },
  { key: "custom", label: "Custom" },
];
const statusClass = {
  completed: "status-success",
  pending: "status-warning",
  voided: "status-danger",
} as const;
const PAGE = 25;

export function SalesPage() {
  const db = useDb();
  const userId = useCurrentUserId();
  const scope = getAccessScope(db, userId);
  const search = route.useSearch();
  const navigate = route.useNavigate();
  const [recordOpen, setRecordOpen] = useState(false);
  const [selected, setSelected] = useState<Sale | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [limit, setLimit] = useState(PAGE);

  const update = (patch: Partial<typeof search>) => {
    setLimit(PAGE);
    void navigate({ to: ".", search: (prev) => ({ ...prev, ...patch }), replace: true });
  };
  const today = db.tenant.referenceDate;
  const period = search.period ?? "month";
  const range = getPeriodRange(period, today, { from: search.from, to: search.to });

  const branchOptions = db.branches.filter(
    (b) => !scope.branchIds || scope.branchIds.includes(b.id),
  );
  const branchId =
    search.branch && branchOptions.some((b) => b.id === search.branch) ? search.branch : undefined;
  const repOptions = db.users.filter(
    (x) =>
      x.role === "sales_rep" &&
      (!branchId || x.branchId === branchId) &&
      (!scope.branchIds || (x.branchId && scope.branchIds.includes(x.branchId))) &&
      (!scope.repId || x.id === scope.repId),
  );
  const repId =
    scope.repId ??
    (scope.user.role === "owner"
      ? undefined
      : search.rep && repOptions.some((r) => r.id === search.rep)
        ? search.rep
        : undefined);
  const productId = search.product;

  const filters: SalesFilters = { range, branchId, branchIds: scope.branchIds, repId, productId };
  const data = useMemo(() => {
    const revenue = getSalesRevenue(db, filters);
    const count = getSalesCount(db, filters);
    const target =
      scope.user.role === "manager"
        ? 0
        : getTargetForRange(
            db,
            range,
            repId ? { repId } : { branchId, branchIds: scope.branchIds },
          );
    const rows = filterSales(db, { ...filters, includeNonCompleted: true }).sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
    return {
      revenue,
      count,
      avg: count ? revenue / count : 0,
      target,
      achievement: target ? (revenue / target) * 100 : 0,
      rows,
      series: getRevenueSeries(db, range, filters),
    };
  }, [db, range.from, range.to, branchId, repId, productId, scope.branchIds, scope.user.role]); // eslint-disable-line react-hooks/exhaustive-deps

  const repProgress = scope.repId ? getRepTargetProgress(db, scope.repId, monthOf(today)) : null;
  const ownerMySales =
    scope.user.role === "owner" ? getSalesRevenue(db, { range, repId: userId }) : 0;
  const showTargets = scope.user.role !== "manager";
  const maxBar = Math.max(...data.series.map((s) => s.revenue), 1);
  const name = (id: string) => db.users.find((x) => x.id === id)?.name ?? "—";
  const branchName = (id: string) =>
    db.branches.find((b) => b.id === id)?.name.replace(" Branch", "") ?? "—";
  const product = (id: string) => db.products.find((x) => x.id === id);
  const rangeLabel =
    range.from === range.to
      ? formatDate(range.from)
      : `${formatShortDate(range.from)} – ${formatDate(range.to)}`;

  if (!scope.canViewSales)
    return (
      <AppShell title="Sales">
        <RestrictedNotice message="Sales records are not available for your role." />
      </AppShell>
    );

  const filterControls = (
    <div className="grid gap-2 sm:grid-cols-3 lg:flex">
      {!scope.repId && (
        <FilterSelect
          label="Branch filter"
          value={branchId ?? ALL}
          onChange={(v) => update({ branch: v === ALL ? undefined : v, rep: undefined })}
          options={[
            ...(scope.branchIds ? [] : [{ value: ALL, label: "All Branches" }]),
            ...branchOptions.map((b) => ({ value: b.id, label: b.name })),
          ]}
        />
      )}
      {!scope.repId && (
        <FilterSelect
          label="Sales rep filter"
          value={repId ?? ALL}
          onChange={(v) => update({ rep: v === ALL ? undefined : v })}
          options={[
            { value: ALL, label: "All Sales Reps" },
            ...repOptions.map((r) => ({ value: r.id, label: r.name })),
          ]}
        />
      )}
      <FilterSelect
        label="Product filter"
        value={productId ?? ALL}
        onChange={(v) => update({ product: v === ALL ? undefined : v })}
        options={[
          { value: ALL, label: "All Products" },
          ...db.products.map((p) => ({ value: p.id, label: p.name })),
        ]}
      />
    </div>
  );

  return (
    <AppShell
      title={scope.repId ? "My Sales" : "Sales"}
      subtitle={
        scope.repId
          ? "Your personal sales record."
          : "Track sales activity, revenue and sales performance across your business."
      }
      actions={
        scope.canRecordSales && (
          <Button onClick={() => setRecordOpen(true)}>
            <Plus className="size-4" />
            <span className="hidden sm:inline">Record Sale</span>
          </Button>
        )
      }
    >
      <div className="mb-5 flex flex-col justify-between gap-3 lg:flex-row lg:items-end">
        <div>
          <h1 className="text-xl font-bold">{scope.repId ? "My Sales" : "Sales"}</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            {scope.repId
              ? "Only sales you recorded"
              : "Track sales activity, revenue and sales performance across your business"}{" "}
            · {rangeLabel}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="grid grid-cols-4 rounded-md border border-border bg-card p-1">
            {periods.map((p) => (
              <Button
                key={p.key}
                size="sm"
                variant={period === p.key ? "default" : "ghost"}
                onClick={() =>
                  update({
                    period: p.key === "month" ? undefined : p.key,
                    ...(p.key === "custom"
                      ? { from: search.from ?? range.from, to: search.to ?? range.to }
                      : { from: undefined, to: undefined }),
                  })
                }
              >
                {p.label}
              </Button>
            ))}
          </div>
          {period === "custom" && (
            <div className="flex items-center gap-2">
              <Input
                type="date"
                aria-label="From date"
                max={today}
                value={range.from}
                onChange={(e) => update({ from: e.target.value })}
                className="h-9 bg-card text-xs"
              />
              <span className="text-xs text-muted-foreground">to</span>
              <Input
                type="date"
                aria-label="To date"
                max={today}
                value={range.to}
                onChange={(e) => update({ to: e.target.value })}
                className="h-9 bg-card text-xs"
              />
            </div>
          )}
        </div>
      </div>

      <section
        className={`grid grid-cols-2 gap-3 sm:gap-4 ${showTargets ? "xl:grid-cols-4" : "xl:grid-cols-3"}`}
      >
        <MetricCard
          icon={CircleDollarSign}
          tone="success"
          label="Total revenue"
          value={formatNaira(data.revenue)}
          detail="Completed sales in period"
        />
        {scope.user.role === "owner" ? (
          <MetricCard
            icon={CircleDollarSign}
            tone="brand"
            label="My Sales"
            value={formatNaira(ownerMySales)}
            detail="Revenue from sales you personally recorded"
          />
        ) : (
          <MetricCard
            icon={Receipt}
            tone="brand"
            label="Total sales"
            value={String(data.count)}
            detail={`${data.rows.length - data.count} pending or voided`}
          />
        )}
        <MetricCard
          icon={BarChart3}
          tone="violet"
          label="Average sale"
          value={formatNaira(Math.round(data.avg))}
          detail="Revenue ÷ completed sales"
        />
        {showTargets && (
          <MetricCard
            icon={Target}
            tone="warning"
            label="Target achievement"
            value={formatPercent(data.achievement, 1)}
            detail={`${formatCompactNaira(Math.max(data.target - data.revenue, 0))} remaining of ${formatCompactNaira(data.target)}`}
          />
        )}
      </section>

      {repProgress && (
        <div className="mt-4 rounded-lg border border-border bg-card p-5 text-xs shadow-panel">
          <div className="flex flex-wrap gap-6">
            <span className="panel-title">My target · {formatMonth(monthOf(today))}</span>
            <span>
              Target <strong>{formatNaira(repProgress.target)}</strong>
            </span>
            <span>
              Sales <strong>{formatNaira(repProgress.revenue)}</strong>
            </span>
            <span>
              Remaining <strong>{formatNaira(repProgress.remaining)}</strong>
            </span>
            <span>
              Achievement <strong>{formatPercent(repProgress.achievement)}</strong>
            </span>
          </div>
        </div>
      )}

      <Panel
        className="mt-4"
        title="Revenue over time"
        subtitle={
          data.series.length > 1 && data.series[0]?.to !== data.series[0]?.from
            ? "Weekly completed revenue"
            : "Daily completed revenue"
        }
      >
        <div className="p-5">
          <div className="flex h-40 items-end gap-1 border-b border-border sm:gap-2">
            {data.series.map((s) => (
              <div
                key={s.from}
                className="group flex h-full flex-1 items-end"
                title={`${formatShortDate(s.from)}: ${formatNaira(s.revenue)}`}
              >
                <div
                  className="w-full rounded-t-sm bg-chart transition-colors group-hover:bg-primary"
                  style={{ height: `${(s.revenue / maxBar) * 100}%` }}
                />
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
            <span>{formatShortDate(range.from)}</span>
            <span>{formatShortDate(range.to)}</span>
          </div>
        </div>
      </Panel>

      <Panel
        className="mt-4 overflow-hidden"
        title="Sales records"
        subtitle={`${data.rows.length} records`}
        action={
          <>
            <div className="hidden lg:block">{filterControls}</div>
            <Button
              variant="outline"
              size="sm"
              className="lg:hidden"
              onClick={() => setShowFilters((s) => !s)}
            >
              <SlidersHorizontal className="size-3" />
              Filters
            </Button>
          </>
        }
      >
        {showFilters && (
          <div className="border-b border-border p-4 lg:hidden">{filterControls}</div>
        )}
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[900px] text-left">
            <thead>
              <tr className="text-[10px] uppercase text-muted-foreground">
                {[
                  "Sale ID",
                  "Date",
                  scope.user.role === "owner" ? "Seller" : "Sales rep",
                  "Branch",
                  "Product",
                  "Qty",
                  "Revenue",
                  "Status",
                  "",
                ].map((h) => (
                  <th key={h} className="px-4 py-3">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rows.slice(0, limit).map((s) => (
                <tr
                  key={s.id}
                  className="cursor-pointer border-t border-border text-xs hover:bg-muted/50"
                  onClick={() => setSelected(s)}
                >
                  <td className="px-4 py-3 font-mono text-[11px] font-bold">#{s.code}</td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDate(s.saleDate)}</td>
                  <td className="px-4 py-3 font-semibold">{name(s.salesRepId)}</td>
                  <td className="px-4 py-3">{branchName(s.branchId)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{product(s.productId)?.name}</td>
                  <td className="px-4 py-3">{s.quantity}</td>
                  <td className="px-4 py-3 font-bold">{formatNaira(saleTotal(s))}</td>
                  <td className="px-4 py-3">
                    <span className={`status ${statusClass[s.status]}`}>{s.status}</span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Button variant="ghost" size="icon" aria-label={`View sale ${s.code}`}>
                      <Eye className="size-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="divide-y divide-border md:hidden">
          {data.rows.slice(0, limit).map((s) => (
            <button
              key={s.id}
              onClick={() => setSelected(s)}
              className="flex w-full items-start justify-between gap-3 p-4 text-left"
            >
              <div className="min-w-0">
                <p className="text-xs font-bold">
                  {product(s.productId)?.name} × {s.quantity}
                </p>
                <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                  #{s.code} · {name(s.salesRepId)} · {branchName(s.branchId)}
                </p>
                <p className="text-[11px] text-muted-foreground">{formatDate(s.saleDate)}</p>
              </div>
              <div className="text-right">
                <p className="text-xs font-bold">{formatNaira(saleTotal(s))}</p>
                <span className={`status mt-1 ${statusClass[s.status]}`}>{s.status}</span>
              </div>
            </button>
          ))}
        </div>
        {data.rows.length === 0 && (
          <EmptyState
            title="No sales match these filters"
            detail="Try a wider date range or different filters."
          />
        )}
        {data.rows.length > limit && (
          <div className="border-t border-border p-3 text-center">
            <Button variant="ghost" size="sm" onClick={() => setLimit((l) => l + PAGE)}>
              Show more ({data.rows.length - limit} remaining)
            </Button>
          </div>
        )}
      </Panel>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Sale #{selected?.code}</DialogTitle>
          </DialogHeader>
          {selected && (
            <dl className="divide-y divide-border text-xs">
              {[
                ["Date", formatDate(selected.saleDate)],
                ["Time", formatTime(selected.createdAt)],
                ["Branch", db.branches.find((b) => b.id === selected.branchId)?.name ?? "—"],
                [
                  scope.user.role === "owner" ? "Seller" : "Sales representative",
                  name(selected.salesRepId),
                ],
                ["Product", product(selected.productId)?.name ?? "—"],
                ["Quantity", String(selected.quantity)],
                ["Unit price", formatNaira(selected.unitPrice)],
                ["Status", selected.status],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between py-2.5">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="font-semibold capitalize">{v}</dd>
                </div>
              ))}
              <div className="flex justify-between py-3">
                <dt className="font-bold">Total revenue</dt>
                <dd className="text-base font-bold">{formatNaira(saleTotal(selected))}</dd>
              </div>
            </dl>
          )}
        </DialogContent>
      </Dialog>
      <RecordSaleDialog
        open={recordOpen}
        onOpenChange={setRecordOpen}
        scope={scope}
        defaultBranchId={branchId}
      />
    </AppShell>
  );
}
