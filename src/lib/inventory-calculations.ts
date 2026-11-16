/**
 * Inventory + stock-request business logic. Pure selectors over the shared dataset;
 * no component computes stock, status, value or availability on its own.
 */
import type { Branch, Db, InventoryMovement, InventoryRecord, Product, StockRequest, StockRequestStatus } from "@/data/mock-db";
import { addDays } from "@/lib/dates";

export type InventoryStatus = "in_stock" | "low_stock" | "out_of_stock";
export const inventoryStatusLabel: Record<InventoryStatus, string> = { in_stock: "In Stock", low_stock: "Low Stock", out_of_stock: "Out of Stock" };
export const requestStatusLabel: Record<StockRequestStatus, string> = { pending: "Pending", approved: "Approved", partially_fulfilled: "Partially Fulfilled", fulfilled: "Fulfilled", rejected: "Rejected" };
export const movementTypeLabel: Record<InventoryMovement["type"], string> = { order_void: "Returned (order voided)", exchange_return: "Returned (exchange)", exchange_issue: "Replacement (exchange)", stock_added: "Stock Added", stock_issued: "Stock Issued", sale: "Sale", adjustment: "Adjustment", promo: "Promo Given" };

export const getAvailable = (inv: Pick<InventoryRecord, "quantityOnHand" | "quantityReserved">) => Math.max(inv.quantityOnHand - inv.quantityReserved, 0);
export function getInventoryStatus(inv: InventoryRecord): InventoryStatus {
  const available = getAvailable(inv);
  if (available <= 0) return "out_of_stock";
  if (available <= inv.lowStockThreshold) return "low_stock";
  return "in_stock";
}

export const findInventory = (db: Db, branchId: string, productId: string) => db.inventory.find((i) => i.branchId === branchId && i.productId === productId) ?? null;
export function getAvailableStock(db: Db, productId: string, branchId: string) {
  const inv = findInventory(db, branchId, productId);
  return inv ? getAvailable(inv) : 0;
}

export type InventoryScope = { branchIds?: string[] | null | undefined; branchId?: string | undefined; category?: string | undefined };
export const getInventoryByBranch = (db: Db, s: InventoryScope = {}) =>
  db.inventory.filter((i) => (!s.branchId || i.branchId === s.branchId) && (!s.branchIds || s.branchIds.includes(i.branchId)) &&
    (!s.category || db.products.find((p) => p.id === i.productId)?.category === s.category));

/**
 * What the stock that can still be sold is worth at today's selling prices:
 * available units (on hand minus reserved) x the product's selling price.
 * Promo items are free, so they add nothing.
 */
export const inventoryLineValue = (record: Pick<InventoryRecord, "quantityOnHand" | "quantityReserved">, product: Pick<Product, "unitPrice"> | undefined) =>
  getAvailable(record) * (product?.unitPrice ?? 0);

export type InventoryRow = { record: InventoryRecord; product: Product; branch: Branch; available: number; status: InventoryStatus; value: number };
export function resolveInventory(db: Db, record: InventoryRecord): InventoryRow | null {
  const product = db.products.find((p) => p.id === record.productId);
  const branch = db.branches.find((b) => b.id === record.branchId);
  if (!product || !branch) return null;
  return { record, product, branch, available: getAvailable(record), status: getInventoryStatus(record), value: inventoryLineValue(record, product) };
}
export const getInventoryRows = (db: Db, s: InventoryScope = {}) => getInventoryByBranch(db, s).map((r) => resolveInventory(db, r)).filter((r): r is InventoryRow => !!r);

export const getLowStockItems = (db: Db, s: InventoryScope = {}) => getInventoryByBranch(db, s).filter((i) => getInventoryStatus(i) === "low_stock");
export const getOutOfStockItems = (db: Db, s: InventoryScope = {}) => getInventoryByBranch(db, s).filter((i) => getInventoryStatus(i) === "out_of_stock");
export const getInventoryValue = (db: Db, s: InventoryScope = {}) =>
  getInventoryByBranch(db, s).reduce((sum, i) => sum + inventoryLineValue(i, db.products.find((p) => p.id === i.productId)), 0);

export function getInventorySummary(db: Db, s: InventoryScope = {}) {
  const items = getInventoryByBranch(db, s);
  return {
    products: new Set(items.map((i) => i.productId)).size,
    units: items.reduce((sum, i) => sum + i.quantityOnHand, 0),
    low: getLowStockItems(db, s).length,
    out: getOutOfStockItems(db, s).length,
    value: getInventoryValue(db, s),
  };
}

/** Healthy / low / out mix for dashboards and branch pages. */
export function getBranchInventoryHealth(db: Db, branchId?: string, branchIds?: string[] | null) {
  const items = getInventoryByBranch(db, { branchId, branchIds });
  const out = items.filter((i) => getInventoryStatus(i) === "out_of_stock").length;
  const low = items.filter((i) => getInventoryStatus(i) === "low_stock").length;
  const healthy = items.length - out - low;
  const pct = (n: number) => (items.length ? (n / items.length) * 100 : 0);
  const healthPct = pct(healthy);
  return {
    total: items.length, healthy, low, out, healthPct, lowPct: pct(low), outPct: pct(out),
    units: items.reduce((sum, i) => sum + i.quantityOnHand, 0), value: getInventoryValue(db, { branchId, branchIds }),
    status: healthPct >= 80 ? "Healthy" : healthPct >= 60 ? "Watch" : "At risk",
  };
}

export function getInventoryMovements(db: Db, f: { productId?: string | undefined; branchId?: string | undefined; branchIds?: string[] | null | undefined; type?: InventoryMovement["type"] | undefined; referenceId?: string | undefined } = {}) {
  return db.inventoryMovements.filter((m) => (!f.productId || m.productId === f.productId) && (!f.branchId || m.branchId === f.branchId) &&
    (!f.branchIds || f.branchIds.includes(m.branchId)) && (!f.type || m.type === f.type) && (!f.referenceId || m.referenceId === f.referenceId))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export type TimelineStep = { key: string; label: string; detail?: string | undefined; at?: string | undefined; state: "done" | "current" | "upcoming" | "failed" };
export const withinDays = (iso: string, today: string, days: number) => iso.slice(0, 10) >= addDays(today, -(days - 1)) && iso.slice(0, 10) <= today;

/** Display state layered on the stored status: fulfilled requests await the rep's acknowledgement. */
export type RequestDisplayStatus = StockRequestStatus | "awaiting_ack" | "acknowledged";
export const requestDisplayLabel: Record<RequestDisplayStatus, string> = { ...requestStatusLabel, awaiting_ack: "Fulfilled — Awaiting Acknowledgement", acknowledged: "Acknowledged" };
export const getRequestDisplayStatus = (r: StockRequest): RequestDisplayStatus => r.status !== "fulfilled" ? r.status : r.acknowledgedAt ? "acknowledged" : "awaiting_ack";
