/** Expiry selectors over db.stockBatches. Pure functions; day maths relative to the tenant reference date. */
import type { Db, StockBatch } from "@/data/mock-db";

export type ExpiryStatus = "ok" | "expiring" | "expired" | "none";
/** Alert tiers: months before expiry; the widest tier follows tenant.expiryAlertMonths. */
export type ExpiryTier = "expired" | "1m" | "3m" | "6m" | null;

const DAY = 864e5;
export const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(to.slice(0, 10)) - Date.parse(from.slice(0, 10))) / DAY);
export const daysToExpiry = (db: Db, expiryDate: string) => daysBetween(db.tenant.referenceDate, expiryDate);
const alertDays = (db: Db) => Math.round(db.tenant.expiryAlertMonths * 30.44);

export function expiryStatusFor(db: Db, expiryDate: string | null | undefined): ExpiryStatus {
  if (!expiryDate) return "none";
  const d = daysToExpiry(db, expiryDate);
  if (d < 0) return "expired";
  return d <= alertDays(db) ? "expiring" : "ok";
}
export function expiryTier(db: Db, expiryDate: string): ExpiryTier {
  const d = daysToExpiry(db, expiryDate);
  if (d < 0) return "expired";
  if (d <= 31) return "1m";
  if (d <= 92) return "3m";
  if (d <= alertDays(db)) return "6m";
  return null;
}
export const expiryTierLabel: Record<Exclude<ExpiryTier, null>, string> = {
  expired: "Expired", "1m": "≤ 1 month", "3m": "≤ 3 months", "6m": "Expiring soon",
};

export const liveBatches = (db: Db, branchIds: string[] | null) =>
  db.stockBatches.filter((b) => b.quantityRemaining > 0 && (!branchIds || branchIds.includes(b.branchId)));

export function nearestExpiry(db: Db, productId: string, branchIds: string[] | null, branchId?: string): StockBatch | undefined {
  return liveBatches(db, branchIds)
    .filter((b) => b.productId === productId && (!branchId || b.branchId === branchId))
    .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate))[0];
}

export type ExpiryAlert = { batch: StockBatch; productName: string; branchName: string; days: number; tier: Exclude<ExpiryTier, null> };
/** Batches inside the alert window or expired, most urgent first. */
export function getExpiryAlerts(db: Db, branchIds: string[] | null): ExpiryAlert[] {
  return liveBatches(db, branchIds)
    .map((batch) => ({ batch, tier: expiryTier(db, batch.expiryDate), days: daysToExpiry(db, batch.expiryDate) }))
    .filter((x): x is { batch: StockBatch; tier: Exclude<ExpiryTier, null>; days: number } => x.tier !== null)
    .map((x) => ({
      ...x,
      productName: db.products.find((p) => p.id === x.batch.productId)?.name ?? "Unknown product",
      branchName: db.branches.find((b) => b.id === x.batch.branchId)?.name ?? "",
    }))
    .sort((a, b) => a.days - b.days);
}
export function getExpirySummary(db: Db, branchIds: string[] | null) {
  const alerts = getExpiryAlerts(db, branchIds);
  const count = (t: ExpiryAlert["tier"]) => alerts.filter((a) => a.tier === t).length;
  const units = (t: ExpiryAlert["tier"]) => alerts.filter((a) => a.tier === t).reduce((s, a) => s + a.batch.quantityRemaining, 0);
  return { alerts, expired: count("expired"), expiredUnits: units("expired"), oneMonth: count("1m"), threeMonths: count("3m"), sixMonths: count("6m") };
}
