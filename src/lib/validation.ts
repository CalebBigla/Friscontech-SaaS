/**
 * Client-side input checks, run before a write is sent to Supabase.
 *
 * Same rules and messages the app has always shown. The database (RPCs and
 * CHECK constraints) enforces them again; this only gives faster feedback.
 */
import type { ApprovalRequest, Db, InventoryRecord, StockRequest } from "@/data/mock-db";
import { canReviewApproval } from "@/lib/approvals";
import { findInventory, getAvailable, getRequestOutstanding } from "@/lib/inventory-calculations";
import type { AccessScope } from "@/lib/session";

export const FIELD_NAMES = [
  "expiryDate",
  "name",
  "code",
  "location",
  "email",
  "address",
  "phone",
  "managerId",
  "form",
  "branchId",
  "salesRepId",
  "productId",
  "quantity",
  "unitPrice",
  "saleDate",
  "expenseDate",
  "note",
  "sku",
  "category",
  "unit",
  "unitCost",
  "threshold",
  "description",
  "repId",
  "month",
  "amount",
  "role",
  "status",
  "items",
  "emergencyReason",
  "cashAmount",
  "transferAmount",
  "transferReference",
  "period",
  "reason",
  "payeeName",
  "purpose",
  "paymentMethod",
  "remittanceDate",
  "reference",
  "payeeType",
  "customerId",
  "walkInName",
  "contactPerson",
  "creditLimit",
  "method",
  "paymentDate",
  "proof",
] as const;
export type FieldName = (typeof FIELD_NAMES)[number];
export type FieldErrors = Partial<Record<FieldName, string>> & {
  itemErrors?: Record<number, Partial<Record<"productId" | "quantity", string>>>;
};

const isDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);
const hasErrors = (errors: FieldErrors) => Object.keys(errors).length > 0;

// ---------- inventory ----------

export type AddStockInput = {
  branchId: string;
  productId: string;
  quantity: number;
  note: string;
  emergency?: boolean;
  emergencyReason?: string;
  batchNumber?: string;
  expiryDate?: string;
};

/** Storekeeper stock addition. */
export function validateAddStock(db: Db, scope: AccessScope, input: AddStockInput): FieldErrors | null {
  if (!scope.canManageStock) return { form: "Only storekeepers can add stock" };
  const errors: FieldErrors = {};
  const branch = db.branches.find((b) => b.id === input.branchId);
  if (!branch) errors.branchId = "Select a branch";
  else if (branch.status !== "active") errors.branchId = "Stock can only be added to active branches";
  else if (scope.branchIds && !scope.branchIds.includes(branch.id)) errors.branchId = "You can only add stock to your branch";
  const product = db.products.find((p) => p.id === input.productId);
  if (!product) errors.productId = "Select a product";
  else if (product.status !== "active") errors.productId = "This product is inactive — reactivate it before adding stock";
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) errors.quantity = "Enter a whole number greater than zero";
  if (input.expiryDate && !isDate(input.expiryDate)) errors.expiryDate = "Enter a valid date";
  if (input.batchNumber?.trim() && !input.expiryDate) errors.expiryDate = "Add the batch's expiry date";
  if (input.emergency && (input.emergencyReason ?? "").trim().length < 5)
    errors.emergencyReason = "Explain why this addition can't wait for approval";
  return hasErrors(errors) ? errors : null;
}

/** Stock count correction. */
export function validateAdjustStock(scope: AccessScope, record: InventoryRecord, counted: number, reason: string): FieldErrors | null {
  if (!scope.canManageStock || (scope.branchIds && !scope.branchIds.includes(record.branchId)))
    return { form: "You cannot adjust this stock record" };
  if (!Number.isInteger(counted) || counted < 0) return { quantity: "Enter a whole number of zero or more" };
  if (counted < record.quantityReserved) return { quantity: `Cannot go below the ${record.quantityReserved} reserved units` };
  if (counted === record.quantityOnHand) return { quantity: "Counted quantity matches current stock" };
  if (!reason.trim()) return { reason: "Give a reason for the adjustment" };
  return null;
}

// ---------- stock requests ----------

export type StockRequestItem = { productId: string; quantity: number };

/** Sales rep request for their own branch; one row per product. */
export function validateStockRequests(db: Db, scope: AccessScope, input: { branchId: string; items: StockRequestItem[] }): FieldErrors | null {
  if (!scope.canCreateRequests) return { form: "Only sales representatives can submit stock requests" };
  const errors: FieldErrors = {};
  const itemErrors: NonNullable<FieldErrors["itemErrors"]> = {};
  const branch = db.branches.find((b) => b.id === input.branchId);
  if (!branch || branch.status !== "active") errors.branchId = "Select an active branch";
  else if (scope.user.branchId !== branch.id) errors.branchId = "You can only request stock for your own branch";
  if (!input.items.length) errors.items = "Add at least one product";
  const seen = new Set<string>();
  input.items.forEach((it, i) => {
    const e: Partial<Record<"productId" | "quantity", string>> = {};
    const product = db.products.find((p) => p.id === it.productId);
    if (!product) e.productId = "Select a product";
    else if (product.status !== "active") e.productId = "This product is inactive and cannot be requested";
    else if (seen.has(it.productId)) e.productId = "This product is already in the request";
    else if (branch && !findInventory(db, branch.id, it.productId)) e.productId = "This branch does not stock this product";
    if (it.productId) seen.add(it.productId);
    if (!Number.isInteger(it.quantity) || it.quantity <= 0) e.quantity = "Enter a whole number greater than zero";
    if (Object.keys(e).length) itemErrors[i] = e;
  });
  if (Object.keys(itemErrors).length) {
    errors.itemErrors = itemErrors;
    errors.items = "Fix the highlighted items";
  }
  return hasErrors(errors) ? errors : null;
}

function reviewError(scope: AccessScope, req: StockRequest, perm: "canReviewRequests" | "canFulfillRequests"): FieldErrors | null {
  return !scope[perm] || (scope.branchIds && !scope.branchIds.includes(req.branchId))
    ? { form: "You don't have permission for this action" }
    : null;
}

export function validateApproveStockRequest(scope: AccessScope, req: StockRequest): FieldErrors | null {
  return reviewError(scope, req, "canReviewRequests")
    ?? (req.status !== "pending" ? { form: "Only pending requests can be approved" } : null);
}

export function validateRejectStockRequest(scope: AccessScope, req: StockRequest, reason: string): FieldErrors | null {
  return reviewError(scope, req, "canReviewRequests")
    ?? (req.status !== "pending" ? { form: "Only pending requests can be rejected" } : null)
    ?? (!reason.trim() ? { reason: "A rejection reason is required" } : null);
}

export function validateFulfilStockRequest(db: Db, scope: AccessScope, req: StockRequest, quantity: number): FieldErrors | null {
  const denied = reviewError(scope, req, "canFulfillRequests");
  if (denied) return denied;
  if (req.status !== "approved" && req.status !== "partially_fulfilled") return { form: "Only approved requests can be fulfilled" };
  const inv = findInventory(db, req.branchId, req.productId);
  const available = inv ? getAvailable(inv) : 0;
  const outstanding = getRequestOutstanding(req);
  if (!Number.isInteger(quantity) || quantity <= 0) return { quantity: "Enter a whole number greater than zero" };
  if (quantity > available) return { quantity: "Insufficient stock. Quantity cannot exceed available stock." };
  if (quantity > outstanding) return { quantity: `Only ${outstanding} units are outstanding on this request` };
  return null;
}

export function validateAcknowledgeStockRequest(scope: AccessScope, req: StockRequest): FieldErrors | null {
  if (!scope.canAcknowledgeStock || req.repId !== scope.user.id) return { form: "Only the requesting sales rep can acknowledge receipt" };
  if (req.status !== "fulfilled") return { form: "Only fulfilled requests can be acknowledged" };
  if (req.acknowledgedAt) return { form: "Receipt was already acknowledged" };
  return null;
}

// ---------- approvals ----------

/** Why a pending request can't be approved right now, or null. */
function approvalBlocker(db: Db, actorId: string, a: ApprovalRequest): string | null {
  if (a.status !== "pending" || !canReviewApproval(db, actorId, a)) return "is no longer eligible for approval";
  const product = db.products.find((p) => p.id === a.productId);
  if (a.type === "product_deactivation" && product?.status !== "active") return "product is already inactive";
  if (a.type === "team_member" && db.users.some((u) => u.email.toLowerCase() === a.member?.email.toLowerCase()))
    return "email is already in use";
  if (a.type === "stock_addition" && !a.emergency && product?.status !== "active") return "product is inactive";
  return null;
}

/** All-or-nothing: every selected request must be approvable. */
export function validateApproveRequests(db: Db, actorId: string, requests: ApprovalRequest[]): FieldErrors | null {
  if (!requests.length) return { form: "Select at least one pending approval" };
  for (const a of requests) {
    const blocker = approvalBlocker(db, actorId, a);
    if (blocker) return { form: requests.length === 1 ? `This request ${blocker}` : `${a.id}: ${blocker}` };
  }
  return null;
}

export function validateRejectRequest(db: Db, actorId: string, a: ApprovalRequest, reason: string): FieldErrors | null {
  if (!canReviewApproval(db, actorId, a)) return { form: "You can't review this request" };
  if (a.status !== "pending") return { form: "This request was already reviewed" };
  if (reason.trim().length < 3) return { reason: "A rejection reason is required" };
  return null;
}
