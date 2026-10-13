/**
 * Product-catalogue and rep-target selectors. Pure functions over the shared Db:
 * product stock comes from inventory, product sales from sales, target achievement from sales.
 */
import type { Db, Product, Target } from "@/data/mock-db";
import { addDays, daysInMonth } from "@/lib/dates";
import { filterSales, getRepTarget, saleTotal } from "@/lib/calculations";
import { getInventoryMovements, resolveInventory } from "@/lib/inventory-calculations";

// ---------- products ----------
export const getProduct = (db: Db, id: string) => db.products.find((p) => p.id === id) ?? null;
export const getActiveProducts = (db: Db) => db.products.filter((p) => p.status === "active");
export const isProductActive = (db: Db, id: string) => getProduct(db, id)?.status === "active";
export const getProductsByCategory = (db: Db, category: string) => db.products.filter((p) => p.category === category);
export const getProductCategories = (db: Db) => [...new Set(db.products.map((p) => p.category))].sort();

export function getProductSummary(db: Db) {
  const active = db.products.filter((p) => p.status === "active").length;
  return { total: db.products.length, active, inactive: db.products.length - active, categories: getProductCategories(db).length };
}

export function getProductInventory(db: Db, productId: string, branchIds?: string[] | null) {
  return db.inventory
    .filter((i) => i.productId === productId && (!branchIds || branchIds.includes(i.branchId)))
    .map((i) => resolveInventory(db, i))
    .filter((r): r is NonNullable<typeof r> => !!r)
    .sort((a, b) => a.branch.name.localeCompare(b.branch.name));
}

export function getProductSales(db: Db, productId: string, range?: { from: string; to: string }, branchIds?: string[] | null) {
  const rows = filterSales(db, { productId, range, branchIds });
  return { rows, units: rows.reduce((s, x) => s + x.quantity, 0), revenue: rows.reduce((s, x) => s + saleTotal(x), 0), count: rows.length };
}

export const getProductStockMovements = (db: Db, productId: string, branchIds?: string[] | null) =>
  getInventoryMovements(db, { productId, branchIds });

export type ProductSortKey = "name" | "price" | "category" | "created" | "status";
export function sortProducts(list: Product[], key: ProductSortKey, dir: "asc" | "desc") {
  const m = dir === "asc" ? 1 : -1;
  return [...list].sort((a, b) => {
    const v = key === "price" ? a.unitPrice - b.unitPrice : key === "created" ? a.createdAt.localeCompare(b.createdAt)
      : key === "category" ? a.category.localeCompare(b.category) : key === "status" ? a.status.localeCompare(b.status) : a.name.localeCompare(b.name);
    return v * m;
  });
}

// ---------- targets ----------
export type TargetStatus = "not_started" | "behind" | "on_track" | "met" | "exceeded";
export const targetStatusLabel: Record<TargetStatus, string> = { not_started: "Not Started", behind: "Behind Pace", on_track: "On Track", met: "Target Met", exceeded: "Exceeded" };

export const getTarget = (db: Db, id: string) => db.targets.find((t) => t.id === id && t.scope === "rep") ?? null;
export const findRepTarget = (db: Db, repId: string, month: string) => db.targets.find((t) => t.scope === "rep" && t.userId === repId && t.month === month) ?? null;
export { getRepTarget };

const monthBounds = (month: string) => ({ from: `${month}-01`, to: `${month}-${String(daysInMonth(month)).padStart(2, "0")}` });

/** Sum of the rep's completed sales in the target month, up to the reference date. */
export function getRepAchievedSales(db: Db, repId: string, month: string) {
  const { from, to } = monthBounds(month);
  const today = db.tenant.referenceDate;
  return filterSales(db, { repId, range: { from, to: to < today ? to : today } }).reduce((s, x) => s + saleTotal(x), 0);
}
export const getTargetRemaining = (db: Db, repId: string, month: string) => Math.max(getRepTarget(db, repId, month) - getRepAchievedSales(db, repId, month), 0);

/** Share of the month elapsed as of the reference date (0 for future months, 1 for past months). */
export function getMonthElapsed(db: Db, month: string) {
  const { from, to } = monthBounds(month);
  const today = db.tenant.referenceDate;
  if (today < from) return 0;
  if (today >= to) return 1;
  return Number(today.slice(8, 10)) / daysInMonth(month);
}

export type TargetProgress = {
  target: Target; repId: string; month: string; amount: number; achieved: number; remaining: number;
  /** capped at 100 for bars */ progress: number; /** raw ratio, may exceed 100 */ achievement: number;
  expected: number; status: TargetStatus;
};
export function getTargetProgress(db: Db, target: Target): TargetProgress {
  const repId = target.userId ?? "";
  const achieved = getRepAchievedSales(db, repId, target.month);
  const achievement = target.amount > 0 ? (achieved / target.amount) * 100 : 0;
  const expected = target.amount * getMonthElapsed(db, target.month);
  return {
    target, repId, month: target.month, amount: target.amount, achieved, remaining: Math.max(target.amount - achieved, 0),
    progress: Math.min(achievement, 100), achievement, expected, status: getTargetStatusFor(achieved, target.amount, expected),
  };
}
export function getTargetStatusFor(achieved: number, amount: number, expected: number): TargetStatus {
  if (achieved <= 0) return "not_started";
  if (achieved > amount) return "exceeded";
  if (achieved >= amount) return "met";
  return achieved >= expected * 0.9 ? "on_track" : "behind";
}
export function getTargetStatus(db: Db, repId: string, month: string): TargetStatus | null {
  const t = findRepTarget(db, repId, month);
  return t ? getTargetProgress(db, t).status : null;
}
/** Progress label that never reads as a confusing >100% figure. */
export const progressLabel = (p: Pick<TargetProgress, "achievement">) => p.achievement > 100 ? "100%+" : `${Math.floor(p.achievement)}%`;

/** Active rep targets for a month, scoped to branches. */
export function getMonthTargets(db: Db, month: string, branchIds?: string[] | null) {
  return db.targets
    .filter((t) => t.scope === "rep" && t.month === month && (!branchIds || branchIds.includes(t.branchId)))
    .filter((t) => db.users.some((u) => u.id === t.userId))
    .map((t) => getTargetProgress(db, t));
}
export function getTargetSummary(rows: TargetProgress[]) {
  const total = rows.reduce((s, r) => s + r.amount, 0);
  const achieved = rows.reduce((s, r) => s + r.achieved, 0);
  return {
    count: rows.length, total, achieved, progress: total ? (achieved / total) * 100 : 0,
    onTarget: rows.filter((r) => r.status === "on_track" || r.status === "met" || r.status === "exceeded").length,
  };
}

/** Sales contributing to a target (completed sales by the rep during the month). */
export function getTargetSales(db: Db, target: Target) {
  const { from, to } = monthBounds(target.month);
  return filterSales(db, { repId: target.userId ?? "", range: { from, to } }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Daily cumulative sales vs a linear target line for the month (up to the reference date). */
export function getTargetTrend(db: Db, target: Target) {
  const { from, to } = monthBounds(target.month);
  const sales = getTargetSales(db, target);
  const days = daysInMonth(target.month);
  const today = db.tenant.referenceDate;
  const out: { label: string; cumulative: number | null; target: number }[] = [];
  let running = 0;
  for (let d = from, i = 1; d <= to; d = addDays(d, 1), i++) {
    running += sales.filter((s) => s.saleDate === d).reduce((sum, s) => sum + saleTotal(s), 0);
    out.push({ label: d.slice(8), cumulative: d <= today ? running : null, target: (target.amount * i) / days });
  }
  return out;
}

export function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}
