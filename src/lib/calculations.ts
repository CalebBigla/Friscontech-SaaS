/**
 * Single business-calculation layer shared by Dashboard, Branches, Sales, Targets and Reports.
 * Every function is pure: it receives the dataset and returns derived values.
 */
import type { Branch, Db, Sale, User } from "@/data/mock-db";
import { addDays, daysBetween, daysInMonth, isoWeek, monthOf, type DateRange } from "@/lib/dates";

export type SalesFilters = {
  range?: DateRange | undefined;
  branchId?: string | undefined;
  branchIds?: string[] | null | undefined; // access scope
  repId?: string | undefined;
  productId?: string | undefined;
  includeNonCompleted?: boolean;
};
export type PerformanceBand = "exceeding" | "on_track" | "behind";

export const saleTotal = (sale: Pick<Sale, "quantity" | "unitPrice">) =>
  sale.quantity * sale.unitPrice;
export const inRange = (date: string, range?: DateRange) =>
  !range || (date >= range.from && date <= range.to);

export function filterSales(db: Db, f: SalesFilters = {}): Sale[] {
  return db.sales.filter(
    (s) =>
      s.tenantId === db.tenant.id &&
      (f.includeNonCompleted || s.status === "completed") &&
      inRange(s.saleDate, f.range) &&
      (!f.branchId || s.branchId === f.branchId) &&
      (!f.branchIds || f.branchIds.includes(s.branchId)) &&
      (!f.repId || s.salesRepId === f.repId) &&
      (!f.productId || s.productId === f.productId),
  );
}
export const getSalesRevenue = (db: Db, f: SalesFilters = {}) =>
  filterSales(db, f).reduce((sum, s) => sum + saleTotal(s), 0);
export const getSalesCount = (db: Db, f: SalesFilters = {}) => filterSales(db, f).length;
export function getAverageSale(db: Db, f: SalesFilters = {}) {
  const count = getSalesCount(db, f);
  return count ? getSalesRevenue(db, f) / count : 0;
}
export const getRepRevenue = (db: Db, repId: string, f: SalesFilters = {}) =>
  getSalesRevenue(db, { ...f, repId });
export function getRepRevenueTrend(db: Db, repId: string, throughDate: string, days = 7) {
  const first = addDays(throughDate, -(days - 1));
  return Array.from({ length: days }, (_, index) => {
    const date = addDays(first, index);
    return {
      date,
      revenue: getRepRevenue(db, repId, { range: { from: date, to: date } }),
    };
  });
}
export const getProductRevenue = (db: Db, productId: string, f: SalesFilters = {}) =>
  getSalesRevenue(db, { ...f, productId });
export const getBranchRevenue = (db: Db, branchId: string, range?: DateRange) =>
  getSalesRevenue(db, { branchId, range });

export const monthRange = (month: string, today: string): DateRange => {
  const end = `${month}-${String(daysInMonth(month)).padStart(2, "0")}`;
  return { from: `${month}-01`, to: end < today ? end : today };
};

export function getBranchTarget(db: Db, branchId: string, month: string) {
  return (
    db.targets.find((t) => t.scope === "branch" && t.branchId === branchId && t.month === month)
      ?.amount ?? 0
  );
}
export function getRepTarget(db: Db, repId: string, month: string) {
  return (
    db.targets.find((t) => t.scope === "rep" && t.userId === repId && t.month === month)?.amount ??
    0
  );
}

export function performanceBand(achievement: number): PerformanceBand {
  if (achievement >= 100) return "exceeding";
  if (achievement >= 85) return "on_track";
  return "behind";
}
export const bandLabel: Record<PerformanceBand, string> = {
  exceeding: "Exceeding",
  on_track: "On track",
  behind: "Behind",
};

function progress(revenue: number, target: number) {
  const achievement = target > 0 ? (revenue / target) * 100 : 0;
  return {
    revenue,
    target,
    achievement,
    remaining: Math.max(target - revenue, 0),
    band: performanceBand(achievement),
  };
}
/** Monthly Target Remaining = Target − Cumulative Sales (PRD). */
export function getBranchPerformance(db: Db, branchId: string, month: string) {
  return progress(
    getBranchRevenue(db, branchId, monthRange(month, db.tenant.referenceDate)),
    getBranchTarget(db, branchId, month),
  );
}
export function getRepTargetProgress(db: Db, repId: string, month: string) {
  return progress(
    getRepRevenue(db, repId, { range: monthRange(month, db.tenant.referenceDate) }),
    getRepTarget(db, repId, month),
  );
}

/** Target for an arbitrary range, prorated daily from monthly targets. */
export function getTargetForRange(
  db: Db,
  range: DateRange,
  scope: {
    branchIds?: string[] | null | undefined;
    branchId?: string | undefined;
    repId?: string | undefined;
  },
) {
  let total = 0;
  for (let date = range.from; date <= range.to; date = addDays(date, 1)) {
    const month = monthOf(date);
    const monthly = db.targets
      .filter(
        (t) =>
          t.month === month &&
          (scope.repId ? t.scope === "rep" && t.userId === scope.repId : t.scope === "branch") &&
          (!scope.branchId || t.branchId === scope.branchId) &&
          (!scope.branchIds || scope.branchIds.includes(t.branchId)) &&
          (scope.repId || scope.branchId || scope.branchIds || isActiveBranch(db, t.branchId)),
      )
      .reduce((sum, t) => sum + t.amount, 0);
    total += monthly / daysInMonth(month);
  }
  return total;
}
const isActiveBranch = (db: Db, id: string) =>
  db.branches.find((b) => b.id === id)?.status === "active";

export const getBranchStaff = (db: Db, branchId: string): User[] =>
  db.users.filter((x) => x.branchId === branchId && x.status === "active" && x.role !== "owner");
export const getBranchManager = (db: Db, branch: Branch) =>
  db.users.find((x) => x.id === branch.managerId) ?? null;

export { getBranchInventoryHealth } from "@/lib/inventory-calculations";
/** Stock value of items with zero completed sales in the last 30 days. */
export function getDeadStockValue(db: Db, branchIds: string[]) {
  const since = { from: addDays(db.tenant.referenceDate, -29), to: db.tenant.referenceDate };
  return db.inventory
    .filter(
      (i) =>
        branchIds.includes(i.branchId) &&
        i.quantityOnHand > 0 &&
        !db.sales.some(
          (s) =>
            s.status === "completed" &&
            s.branchId === i.branchId &&
            s.productId === i.productId &&
            inRange(s.saleDate, since),
        ),
    )
    .reduce(
      (sum, i) =>
        sum + i.quantityOnHand * (db.products.find((pr) => pr.id === i.productId)?.unitCost ?? 0),
      0,
    );
}

/** Weekly revenue buckets (oldest → newest) ending on the reference date. */
export function getWeeklyRevenueSeries(db: Db, weeks: number, f: SalesFilters = {}) {
  const today = db.tenant.referenceDate;
  return Array.from({ length: weeks }, (_, i) => {
    const to = addDays(today, -7 * (weeks - 1 - i));
    const from = addDays(to, -6);
    return {
      label: `W${isoWeek(to)}`,
      from,
      to,
      revenue: getSalesRevenue(db, { ...f, range: { from, to } }),
    };
  });
}
/** Daily revenue buckets for a range (used for sales charts). Collapses to weekly beyond 45 days. */
export function getRevenueSeries(db: Db, range: DateRange, f: SalesFilters = {}) {
  const len = daysBetween(range.from, range.to) + 1;
  const step = len > 45 ? 7 : 1;
  const out: { label: string; from: string; to: string; revenue: number }[] = [];
  for (let from = range.from; from <= range.to; from = addDays(from, step)) {
    const end = addDays(from, step - 1);
    const to = end > range.to ? range.to : end;
    out.push({
      label: from.slice(5),
      from,
      to,
      revenue: getSalesRevenue(db, { ...f, range: { from, to } }),
    });
  }
  return out;
}

export const percentChange = (current: number, previous: number) =>
  previous ? ((current - previous) / previous) * 100 : 0;
