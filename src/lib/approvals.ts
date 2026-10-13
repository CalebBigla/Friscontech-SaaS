/** Role-scoped selectors over db.approvals (permission requests between roles). */
import type { ApprovalRequest, ApprovalType, Db } from "@/data/mock-db";
import type { AccessScope } from "@/lib/session";

export const approvalTypeLabel: Record<ApprovalType, string> = { stock_addition: "Stock addition", product_deactivation: "Product deactivation", team_member: "New team member" };

/** Owner: every request. Manager: their branch's storekeeper requests + their own team requests. Storekeeper: their own. */
export function getApprovals(db: Db, scope: AccessScope): ApprovalRequest[] {
  const r = scope.user.role;
  return db.approvals.filter((a) => {
    if (r === "owner") return true;
    if (r === "manager") return a.requestedBy === scope.user.id || (a.type !== "team_member" && !!a.branchId && !!scope.branchIds?.includes(a.branchId));
    return a.requestedBy === scope.user.id;
  }).sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
}
export function getApprovalSummary(list: ApprovalRequest[]) {
  return {
    pending: list.filter((a) => a.status === "pending" && !a.emergency).length,
    emergency: list.filter((a) => a.emergency && a.status === "pending").length,
    approved: list.filter((a) => a.status === "approved").length,
    rejected: list.filter((a) => a.status === "rejected").length,
  };
}
export function describeApproval(db: Db, a: ApprovalRequest) {
  const product = db.products.find((p) => p.id === a.productId);
  if (a.type === "stock_addition") return { title: `${product?.name ?? "Product"} · +${a.quantity}`, detail: product?.sku ?? "" };
  if (a.type === "product_deactivation") return { title: `Deactivate ${product?.name ?? "product"}`, detail: product?.sku ?? "" };
  return { title: a.member?.name ?? "New member", detail: `${a.member?.email} · ${a.member?.role.replace("_", " ")}` };
}
