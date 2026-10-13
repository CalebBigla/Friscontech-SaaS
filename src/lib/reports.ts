/**
 * Reports are calculated views over existing data — they reuse the Sales, Targets, Inventory and Team
 * selectors and never store totals. Every builder takes the caller's scope and returns nothing
 * for roles without report access.
 */
import type { Db } from "@/data/mock-db";
import type { AccessScope } from "@/lib/session";
import { filterSales, getSalesRevenue, saleTotal } from "@/lib/calculations";
import type { DateRange } from "@/lib/dates";
import { getMonthTargets, getTargetSummary } from "@/lib/catalog-calculations";
import { getInventoryRows } from "@/lib/inventory-calculations";
import { getRepPerformance, getTeamMembers, getTeamSummary } from "@/lib/team";

export type ReportType = "sales" | "targets" | "inventory" | "team";
export const reportTypeLabel: Record<ReportType, string> = {
  sales: "Sales Report",
  targets: "Target Performance",
  inventory: "Inventory Report",
  team: "Team Performance",
};
export type ReportFilters = {
  range: DateRange;
  branchId?: string | undefined;
  repId?: string | undefined;
  productId?: string | undefined;
};

/** Branches the caller may report on, narrowed by the branch filter. `[]` = nothing. */
function branchScope(db: Db, scope: AccessScope, f: ReportFilters): string[] {
  if (!scope.canViewReports) return [];
  const allowed = scope.branchIds ?? db.branches.map((b) => b.id);
  return f.branchId ? allowed.filter((id) => id === f.branchId) : allowed;
}
/** Reps visible in reports for this scope. */
export function getReportReps(db: Db, scope: AccessScope, branchId?: string) {
  const ids = branchScope(db, scope, { range: { from: "", to: "" }, branchId });
  return getTeamMembers(db, scope).filter(
    (u) => u.role === "sales_rep" && !!u.branchId && ids.includes(u.branchId),
  );
}
export const reportMonth = (f: ReportFilters) => f.range.to.slice(0, 7);

export function getSalesReport(db: Db, scope: AccessScope, f: ReportFilters) {
  const branchIds = branchScope(db, scope, f);
  const rows = branchIds.length
    ? filterSales(db, { range: f.range, branchIds, repId: f.repId, productId: f.productId }).sort(
        (a, b) => b.createdAt.localeCompare(a.createdAt),
      )
    : [];
  const revenue = rows.reduce((s, x) => s + saleTotal(x), 0);
  return {
    rows,
    revenue,
    count: rows.length,
    units: rows.reduce((s, x) => s + x.quantity, 0),
    average: rows.length ? revenue / rows.length : 0,
  };
}

export function getTargetReport(db: Db, scope: AccessScope, f: ReportFilters) {
  const branchIds = branchScope(db, scope, f);
  const rows = branchIds.length
    ? getMonthTargets(db, reportMonth(f), branchIds).filter((r) => !f.repId || r.repId === f.repId)
    : [];
  return { rows, summary: getTargetSummary(rows), month: reportMonth(f) };
}

export function getInventoryReport(db: Db, scope: AccessScope, f: ReportFilters) {
  const branchIds = branchScope(db, scope, f);
  const rows = branchIds.length
    ? getInventoryRows(db, { branchIds }).filter(
        (r) => !f.productId || r.product.id === f.productId,
      )
    : [];
  return {
    rows,
    products: new Set(rows.map((r) => r.product.id)).size,
    units: rows.reduce((s, r) => s + r.record.quantityOnHand, 0),
    low: rows.filter((r) => r.status === "low_stock").length,
    out: rows.filter((r) => r.status === "out_of_stock").length,
    value: rows.reduce((s, r) => s + r.value, 0),
  };
}

export function getTeamReport(db: Db, scope: AccessScope, f: ReportFilters) {
  const branchIds = branchScope(db, scope, f);
  const members = branchIds.length
    ? getTeamMembers(db, scope).filter((u) => !f.branchId || u.branchId === f.branchId)
    : [];
  const month = reportMonth(f);
  const reps = members
    .filter(
      (u) => u.role === "sales_rep" && u.status !== "pending" && (!f.repId || u.id === f.repId),
    )
    .map((u) =>
      scope.user.role === "manager"
        ? {
            user: u,
            salesCount: filterSales(db, { repId: u.id, range: f.range }).length,
            revenue: getSalesRevenue(db, { repId: u.id, range: f.range }),
            target: null,
            progress: null,
          }
        : { user: u, ...getRepPerformance(db, u.id, month, f.range) },
    );
  return { summary: getTeamSummary(members), reps, month };
}
