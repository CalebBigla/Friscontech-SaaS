/**
 * Inventory + stock-request business logic. Pure selectors over the shared dataset;
 * no component computes stock, status, value or availability on its own.
 */
import type { Branch, Db, InventoryMovement, InventoryRecord, Product, StockRequest, StockRequestStatus } from "@/data/mock-db";
import { addDays } from "@/lib/dates";

export type InventoryStatus = "in_stock" | "low_stock" | "out_of_stock";
export const inventoryStatusLabel: Record<InventoryStatus, string> = { in_stock: "In Stock", low_stock: "Low Stock", out_of_stock: "Out of Stock" };
export const requestStatusLabel: Record<StockRequestStatus, string> = { pending: "Pending", approved: "Approved", partially_fulfilled: "Partially Fulfilled", fulfilled: "Fulfilled", rejected: "Rejected" };
export const movementTypeLabel: Record<InventoryMovement["type"], string> = { stock_added: "Stock Added", stock_issued: "Stock Issued", sale: "Sale", adjustment: "Adjustment" };

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

export type InventoryRow = { record: InventoryRecord; product: Product; branch: Branch; available: number; status: InventoryStatus; value: number };
export function resolveInventory(db: Db, record: InventoryRecord): InventoryRow | null {
  const product = db.products.find((p) => p.id === record.productId);
  const branch = db.branches.find((b) => b.id === record.branchId);
  if (!product || !branch) return null;
  return { record, product, branch, available: getAvailable(record), status: getInventoryStatus(record), value: record.quantityOnHand * product.unitCost };
}
export const getInventoryRows = (db: Db, s: InventoryScope = {}) => getInventoryByBranch(db, s).map((r) => resolveInventory(db, r)).filter((r): r is InventoryRow => !!r);

export const getLowStockItems = (db: Db, s: InventoryScope = {}) => getInventoryByBranch(db, s).filter((i) => getInventoryStatus(i) === "low_stock");
export const getOutOfStockItems = (db: Db, s: InventoryScope = {}) => getInventoryByBranch(db, s).filter((i) => getInventoryStatus(i) === "out_of_stock");
export const getInventoryValue = (db: Db, s: InventoryScope = {}) =>
  getInventoryByBranch(db, s).reduce((sum, i) => sum + i.quantityOnHand * (db.products.find((p) => p.id === i.productId)?.unitCost ?? 0), 0);

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

// ---------- stock requests ----------
export type RequestScope = { branchIds?: string[] | null | undefined; branchId?: string | undefined; repId?: string | undefined };
export const getStockRequests = (db: Db, s: RequestScope = {}) =>
  db.stockRequests.filter((r) => (!s.branchId || r.branchId === s.branchId) && (!s.branchIds || s.branchIds.includes(r.branchId)) && (!s.repId || r.repId === s.repId))
    .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
export const getPendingStockRequests = (db: Db, s: RequestScope = {}) => getStockRequests(db, s).filter((r) => r.status === "pending");
export const getStockRequestsByRep = (db: Db, repId: string) => getStockRequests(db, { repId });

export function getStockRequestSummary(list: StockRequest[]) {
  const count = (st: StockRequestStatus) => list.filter((r) => r.status === st).length;
  return { total: list.length, pending: count("pending"), approved: count("approved"), partial: count("partially_fulfilled"), fulfilled: count("fulfilled"), rejected: count("rejected") };
}

/** Units still to issue: approved (or requested) minus what has already been issued. */
export const getRequestOutstanding = (r: StockRequest) => Math.max((r.quantityApproved ?? r.quantityRequested) - (r.quantityFulfilled ?? 0), 0);
export const isRequestOpen = (r: StockRequest) => r.status === "pending" || r.status === "approved" || r.status === "partially_fulfilled";

export function getStockRequestAvailability(db: Db, r: StockRequest) {
  const inv = findInventory(db, r.branchId, r.productId);
  const available = inv ? getAvailable(inv) : 0;
  const needed = getRequestOutstanding(r);
  return { inventory: inv, available, needed, shortage: Math.max(needed - available, 0), sufficient: available >= needed, status: inv ? getInventoryStatus(inv) : ("out_of_stock" as InventoryStatus) };
}

/** Units issued to a rep, traced through stock_issued movements referencing their requests. */
export function getRepIssuedStock(db: Db, repId: string) {
  const ids = new Set(db.stockRequests.filter((r) => r.repId === repId).map((r) => r.id));
  return db.inventoryMovements.filter((m) => m.type === "stock_issued" && m.referenceId && ids.has(m.referenceId)).reduce((sum, m) => sum - m.quantity, 0);
}

export type TimelineStep = { key: string; label: string; detail?: string | undefined; at?: string | undefined; state: "done" | "current" | "upcoming" | "failed" };
export function getRequestTimeline(db: Db, r: StockRequest): TimelineStep[] {
  const name = (id?: string) => db.users.find((u) => u.id === id)?.name;
  const rep = name(r.repId);
  const steps: TimelineStep[] = [{ key: "submitted", label: "Request submitted", detail: `${r.quantityRequested} units by ${rep ?? "sales rep"}`, at: r.requestedAt, state: "done" }];
  if (r.status === "rejected") {
    steps.push({ key: "rejected", label: "Rejected", detail: `${r.rejectionReason ?? "No reason given"}${r.processedBy ? ` · ${name(r.processedBy)}` : ""}`, at: r.rejectedAt, state: "failed" });
    return steps;
  }
  const reviewed = r.status !== "pending";
  steps.push({ key: "reviewed", label: "Storekeeper review", detail: reviewed ? `Reviewed by ${name(r.approvedBy) ?? "storekeeper"}` : "Awaiting review", at: r.approvedAt, state: reviewed ? "done" : "current" });
  steps.push({ key: "approved", label: "Approved", detail: reviewed ? `${r.quantityApproved ?? r.quantityRequested} units approved` : undefined, at: r.approvedAt, state: reviewed ? "done" : "upcoming" });
  const issues = getInventoryMovements(db, { referenceId: r.id, type: "stock_issued" }).reverse();
  if (issues.length) issues.forEach((m, i) => steps.push({ key: `issue-${m.id}`, label: issues.length > 1 ? `Stock issued (${i + 1})` : "Stock issued", detail: `${-m.quantity} units issued to ${rep} by ${name(m.performedBy)}`, at: m.createdAt, state: "done" }));
  else steps.push({ key: "issued", label: "Stock issued", state: r.status === "approved" ? "current" : "upcoming" });
  const total = r.quantityApproved ?? r.quantityRequested;
  if (r.status === "partially_fulfilled") steps.push({ key: "fulfilled", label: "Partially fulfilled", detail: `${r.quantityFulfilled ?? 0} / ${total} fulfilled · ${getRequestOutstanding(r)} remaining`, at: r.fulfilledAt, state: "current" });
  else steps.push({ key: "fulfilled", label: "Fulfilled", detail: r.status === "fulfilled" ? `${r.quantityFulfilled} / ${total} units issued` : undefined, at: r.status === "fulfilled" ? r.fulfilledAt : undefined, state: r.status === "fulfilled" ? "done" : "upcoming" });
  steps.push(r.acknowledgedAt
    ? { key: "acknowledged", label: "Receipt acknowledged", detail: `Confirmed by ${name(r.acknowledgedBy) ?? rep}`, at: r.acknowledgedAt, state: "done" }
    : { key: "acknowledged", label: "Receipt acknowledged", detail: r.status === "fulfilled" ? `Awaiting ${rep ?? "sales rep"}'s confirmation` : undefined, state: r.status === "fulfilled" ? "current" : "upcoming" });
  return steps;
}

export const withinDays = (iso: string, today: string, days: number) => iso.slice(0, 10) >= addDays(today, -(days - 1)) && iso.slice(0, 10) <= today;

/** Display state layered on the stored status: fulfilled requests await the rep's acknowledgement. */
export type RequestDisplayStatus = StockRequestStatus | "awaiting_ack" | "acknowledged";
export const requestDisplayLabel: Record<RequestDisplayStatus, string> = { ...requestStatusLabel, awaiting_ack: "Fulfilled — Awaiting Acknowledgement", acknowledged: "Acknowledged" };
export const getRequestDisplayStatus = (r: StockRequest): RequestDisplayStatus => r.status !== "fulfilled" ? r.status : r.acknowledgedAt ? "acknowledged" : "awaiting_ack";
export const needsAcknowledgement = (r: StockRequest) => r.status === "fulfilled" && !r.acknowledgedAt;

/** Other requests submitted together with this one (multi-product submission). */
export const getRequestBatch = (db: Db, r: StockRequest) => r.batchId ? db.stockRequests.filter((x) => x.batchId === r.batchId) : [r];

export type RepHolding = { productId: string; issued: number; sold: number; held: number; lastIssuedAt: string };
/**
 * Stock currently with each rep: units issued to them through fulfilled requests
 * minus units they have sold of that product since the first issue.
 */
export function getRepStockHoldings(db: Db, branchIds: string[] | null) {
  const reps = db.users.filter((u) => u.role === "sales_rep" && u.branchId && (!branchIds || branchIds.includes(u.branchId)));
  return reps.map((rep) => {
    const reqIds = new Map(db.stockRequests.filter((r) => r.repId === rep.id).map((r) => [r.id, r]));
    const byProduct = new Map<string, RepHolding>();
    for (const m of db.inventoryMovements) {
      if (m.type !== "stock_issued" || !m.referenceId || !reqIds.has(m.referenceId)) continue;
      const h = byProduct.get(m.productId) ?? { productId: m.productId, issued: 0, sold: 0, held: 0, lastIssuedAt: m.createdAt };
      h.issued += -m.quantity;
      if (m.createdAt > h.lastIssuedAt) h.lastIssuedAt = m.createdAt;
      byProduct.set(m.productId, h);
    }
    const holdings = [...byProduct.values()].map((h) => {
      const first = db.inventoryMovements.filter((m) => m.type === "stock_issued" && m.productId === h.productId && m.referenceId && reqIds.has(m.referenceId)).reduce((a, m) => (m.createdAt < a ? m.createdAt : a), h.lastIssuedAt);
      const sold = db.sales.filter((s) => s.salesRepId === rep.id && s.productId === h.productId && s.status === "completed" && s.createdAt >= first).reduce((a, s) => a + s.quantity, 0);
      return { ...h, sold, held: Math.max(h.issued - sold, 0) };
    }).sort((a, b) => b.lastIssuedAt.localeCompare(a.lastIssuedAt));
    const requests = [...reqIds.values()];
    return {
      rep, holdings, heldUnits: holdings.reduce((a, h) => a + h.held, 0), issuedUnits: holdings.reduce((a, h) => a + h.issued, 0),
      openRequests: requests.filter(isRequestOpen).length, awaitingAck: requests.filter(needsAcknowledgement).length,
      lastIssuedAt: holdings[0]?.lastIssuedAt,
    };
  }).sort((a, b) => b.heldUnits - a.heldUnits);
}
