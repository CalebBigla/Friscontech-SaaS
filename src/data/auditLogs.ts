/**
 * Centralized audit log dataset (PRD AuditLogs: id, tenant_id, user_id, action, entity, entity_id, timestamp).
 * Field mapping on Activity: actorId = user_id, createdAt = timestamp, subject = human description.
 * Every module appends to this ONE dataset (db.activities) through services.createAuditLog.
 * Never put passwords, tokens, keys or credentials in an entry.
 */
import type { Activity, AuditEntity, Branch, InventoryMovement, Product, Sale, StockRequest, Target, User } from "./mock-db";

export const auditEntityLabel: Record<AuditEntity, string> = {
  product: "Product", sale: "Sale", payment: "Payment", expense: "Expense", remittance: "Remittance", stock_request: "Stock Request", target: "Target", team_member: "Team Member",
  branch: "Branch", inventory: "Inventory", settings: "Settings", session: "Session",
};

/** Infers the entity from the action text so every service call is classified the same way. */
export function entityFromAction(action: string): AuditEntity {
  const a = action.toLowerCase();
  if (a.startsWith("payment") || a.startsWith("payment_")) return "payment";
  if (a.startsWith("expense")) return "expense";
  if (a.startsWith("remittance")) return "remittance";
  if (a.startsWith("product")) return "product";
  if (a.startsWith("sale")) return "sale";
  if (a.startsWith("stock request")) return "stock_request";
  if (a.startsWith("stock") || a.includes("emergency")) return "inventory";
  if (a.includes("target")) return "target";
  if (a.startsWith("branch created") || a.startsWith("branch updated") || a.startsWith("branch deactivated") || a.startsWith("branch activated")) return "branch";
  if (a.startsWith("team") || a.startsWith("role") || a.startsWith("branch assignment") || a.includes("sales rep added")) return "team_member";
  if (a.includes("setting") || a.includes("preference") || a.includes("password")) return "settings";
  if (a === "login" || a === "logout") return "session";
  return "settings";
}

/** Short verb used by the Action filter. */
export const auditVerbs = ["Created", "Updated", "Activated", "Deactivated", "Approved", "Rejected", "Fulfilled", "Submitted", "Acknowledged", "Confirmed", "Reconciled", "Declined", "Voided", "Recorded", "Added", "Adjusted", "Login", "Logout"] as const;
export type AuditVerb = (typeof auditVerbs)[number];
export function verbFromAction(action: string): AuditVerb {
  const a = action.toLowerCase();
  if (a === "login") return "Login";
  if (a === "logout") return "Logout";
  if (a.includes("deactivated")) return "Deactivated";
  if (a.includes("activated")) return "Activated";
  if (a.includes("approved")) return "Approved";
  if (a.includes("rejected")) return "Rejected";
  if (a.includes("fulfilled")) return "Fulfilled";
  if (a.includes("acknowledged")) return "Acknowledged";
  if (a.includes("confirmed")) return "Confirmed";
  if (a.includes("reconciled")) return "Reconciled";
  if (a.includes("declined")) return "Declined";
  if (a.includes("voided")) return "Voided";
  if (a.includes("submitted") || a.includes("requested")) return "Submitted";
  if (a.includes("recorded")) return "Recorded";
  if (a.includes("adjusted")) return "Adjusted";
  if (a.includes("stock added")) return "Added";
  if (a.includes("created") || a.includes("added")) return "Created";
  return "Updated";
}

type SeedSource = { tenantId: string; branches: Branch[]; users: User[]; products: Product[]; sales: Sale[]; stockRequests: StockRequest[]; inventoryMovements: InventoryMovement[]; targets: Target[] };

/** Historical entries for the seeded records so the log starts populated and consistent with the data. */
export function seedAuditLogs(src: SeedSource, referenceDate: string): Activity[] {
  const product = (id: string) => src.products.find((p) => p.id === id)?.name ?? "Product";
  const user = (id: string | null) => src.users.find((u) => u.id === id);
  const out: Omit<Activity, "id">[] = [];
  const push = (e: Omit<Activity, "id" | "tenantId">) => out.push({ tenantId: src.tenantId, ...e });

  for (const b of src.branches) push({ actorId: "user-001", action: "Branch created", subject: `${b.name} · ${b.code}`, entity: "branch", entityId: b.id, createdAt: `${b.createdAt.slice(0, 10)}T09:00:00`, metadata: { branchId: b.id } });
  for (const u of src.users) if (u.role !== "owner") push({ actorId: "user-001", action: "Team member created", subject: `${u.name} · ${u.role.replace("_", " ")}`, entity: "team_member", entityId: u.id, createdAt: `${u.createdAt.slice(0, 10)}T10:00:00`, ...(u.branchId ? { metadata: { branchId: u.branchId } } : {}) });
  for (const s of src.sales) push({ actorId: s.salesRepId, action: s.status === "voided" ? "Sale voided" : "Sale recorded", subject: `${s.code} · ${s.quantity} × ${product(s.productId)} · ₦${(s.quantity * s.unitPrice).toLocaleString("en-NG")}`, entity: "sale", entityId: s.code, createdAt: s.createdAt, metadata: { branchId: s.branchId, productId: s.productId } });
  for (const r of src.stockRequests) {
    const meta = { branchId: r.branchId, productId: r.productId, requestId: r.id };
    push({ actorId: r.repId, action: "Stock request submitted", subject: `${r.quantityRequested} × ${product(r.productId)}`, entity: "stock_request", entityId: r.id, createdAt: r.requestedAt, metadata: meta });
    if (r.approvedAt && r.approvedBy) push({ actorId: r.approvedBy, action: "Stock request approved", subject: `${r.quantityApproved ?? r.quantityRequested} × ${product(r.productId)}`, entity: "stock_request", entityId: r.id, createdAt: r.approvedAt, metadata: meta });
    if (r.rejectedAt) push({ actorId: r.processedBy ?? r.repId, action: "Stock request rejected", subject: r.rejectionReason ?? "Rejected", entity: "stock_request", entityId: r.id, createdAt: r.rejectedAt, metadata: meta });
    if (r.fulfilledAt && r.quantityFulfilled) push({ actorId: r.fulfilledBy ?? r.processedBy ?? r.repId, action: r.status === "fulfilled" ? "Stock request fulfilled" : "Stock request partially fulfilled", subject: `${r.quantityFulfilled} units of ${product(r.productId)} to ${user(r.repId)?.name ?? "rep"}`, entity: "stock_request", entityId: r.id, createdAt: r.fulfilledAt, metadata: meta });
  }
  for (const m of src.inventoryMovements) if (m.type === "stock_added" || m.type === "adjustment")
    push({ actorId: m.performedBy, action: m.type === "stock_added" ? "Stock added" : "Stock adjusted", subject: `${product(m.productId)} · ${m.quantity > 0 ? "+" : ""}${m.quantity} units${m.note ? ` · ${m.note}` : ""}`, entity: "inventory", entityId: m.id, createdAt: m.createdAt, metadata: { branchId: m.branchId, productId: m.productId } });
  for (const t of src.targets) if (t.scope === "rep") push({ actorId: src.branches.find((b) => b.id === t.branchId)?.managerId ?? "user-001", action: "Target created", subject: `${user(t.userId)?.name ?? "Rep"} · ${t.month} · ₦${t.amount.toLocaleString("en-NG")}`, entity: "target", entityId: t.id, createdAt: t.createdAt.length > 10 ? t.createdAt : `${t.createdAt}T08:30:00`, metadata: { branchId: t.branchId, targetId: t.id } });
  const past = out.filter((e) => e.createdAt.slice(0, 10) <= referenceDate);
  return past.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((e, n) => ({ ...e, id: `aud-${String(past.length - n).padStart(5, "0")}` }));
}
