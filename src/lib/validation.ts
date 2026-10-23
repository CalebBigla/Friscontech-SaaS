/**
 * Client-side input checks, run before a write is sent to Supabase.
 *
 * Same rules and messages the app has always shown. The database (RPCs and
 * CHECK constraints) enforces them again; this only gives faster feedback.
 */
import type { ApprovalRequest, Customer, CustomerPayment, CustomerPaymentMethod, Db, InventoryRecord, Payment, StockRequest } from "@/data/mock-db";
import { getRepTotalSales, isValidPaymentPeriod } from "@/lib/payment-calculations";
import { fieldErrorsFrom } from "@/lib/supabase-helpers";
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

export type Result<T> = { ok: true; data: T } | { ok: false; errors: FieldErrors };

/**
 * Run a write: client checks first, then the Supabase call. Database errors come
 * back as field errors (RPC HINT) or a form error, in the same Result shape the
 * screens already handle.
 */
export async function runWrite<T>(invalid: FieldErrors | null, write: () => Promise<T>): Promise<Result<T>> {
  if (invalid) return { ok: false, errors: invalid };
  try {
    return { ok: true, data: await write() };
  } catch (error) {
    return { ok: false, errors: fieldErrorsFrom(error, FIELD_NAMES) };
  }
}

const isDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);
/** A real calendar date in YYYY-MM-DD form. */
export const isValidDate = (value: string) => {
  if (!isDate(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
};
const hasErrors = (errors: FieldErrors) => Object.keys(errors).length > 0;
/** The acting profile must be active and in this tenant. */
const isActiveActor = (db: Db, scope: AccessScope) => scope.user.status === "active" && scope.user.tenantId === db.tenant.id;

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

// ---------- customers ----------

export type CustomerInput = {
  name: string;
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
};

export function validateCustomer(db: Db, input: CustomerInput, editingId?: string): FieldErrors {
  const errors: FieldErrors = {};
  if (!input.name.trim()) errors.name = "Customer or business name is required";
  if (!input.phone.trim()) errors.phone = "Phone number is required";
  else if (!/^[+\d][\d\s-]{6,}$/.test(input.phone.trim())) errors.phone = "Enter a valid phone number";
  if (input.email.trim() && !/^\S+@\S+\.\S+$/.test(input.email.trim())) errors.email = "Enter a valid email";
  if (!errors.phone && db.customers.some((c) => c.id !== editingId && c.tenantId === db.tenant.id
    && c.phone.replace(/\s/g, "") === input.phone.trim().replace(/\s/g, "")))
    errors.phone = "A customer with this phone number already exists";
  return errors;
}

/** Sales reps create and edit customers of their own branch. */
export function validateCustomerWrite(db: Db, scope: AccessScope, input: CustomerInput, existing?: Customer): FieldErrors | null {
  if (!isActiveActor(db, scope) || !scope.canManageCustomers)
    return { form: existing ? "You cannot edit this customer" : "Only sales representatives can add customers" };
  if (existing?.branchId && !scope.branchIds?.includes(existing.branchId)) return { form: "You cannot edit this customer" };
  const errors = validateCustomer(db, input, existing?.id);
  return hasErrors(errors) ? errors : null;
}

/** Soft (de)activation only — customers are never deleted. */
export function validateCustomerStatus(db: Db, scope: AccessScope, existing: Customer): FieldErrors | null {
  if (!isActiveActor(db, scope) || !scope.canManageCustomers || (existing.branchId && !scope.branchIds?.includes(existing.branchId)))
    return { form: "You cannot change this customer" };
  return null;
}

export function validateCreditLimit(db: Db, scope: AccessScope, limit: number | null): FieldErrors | null {
  if (!isActiveActor(db, scope) || !scope.canSetCreditLimit) return { form: "Only the owner can set credit limits" };
  if (limit !== null && (!Number.isFinite(limit) || limit < 0)) return { creditLimit: "Enter a valid credit limit" };
  return null;
}

export type CustomerPaymentInput = {
  customerId: string;
  amount: number;
  method: CustomerPaymentMethod;
  reference?: string;
  paymentDate: string;
  orderId?: string;
  note?: string;
};

/** Sales rep records a customer payment; it goes to the branch manager to acknowledge. */
export function validateCustomerPayment(db: Db, scope: AccessScope, input: CustomerPaymentInput): FieldErrors | null {
  if (!isActiveActor(db, scope) || !scope.canManageCustomers || !scope.user.branchId)
    return { form: "Only sales representatives can record customer payments" };
  const errors: FieldErrors = {};
  const customer = db.customers.find((c) => c.id === input.customerId && c.tenantId === db.tenant.id);
  if (!customer || (customer.branchId && customer.branchId !== scope.user.branchId)) errors.customerId = "Choose a customer from your branch";
  if (!Number.isFinite(input.amount) || input.amount <= 0) errors.amount = "Amount must be greater than zero";
  if (input.method !== "cash" && input.method !== "transfer") errors.method = "Choose a method";
  if (input.method === "transfer" && !input.reference?.trim()) errors.reference = "A transfer reference is required";
  if (!isValidDate(input.paymentDate) || input.paymentDate > db.tenant.referenceDate) errors.paymentDate = "Enter a valid date (not in the future)";
  if (!db.branches.find((b) => b.id === scope.user.branchId)?.managerId) errors.form = "A branch manager must be assigned first";
  return hasErrors(errors) ? errors : null;
}

// ---------- payment chain (rep payments and customer payments) ----------
// submitted → acknowledged (branch manager) → confirmed / declined (owner)

export type PaymentSubmission = {
  period: string;
  cashAmount: number;
  transferAmount: number;
  transferReference?: string;
  note?: string;
};
export type PaymentAcknowledgement = { transferReference?: string; proofName?: string };

/** Sales rep submits cash/transfer collected against their sales for a month. */
export function validatePaymentSubmission(db: Db, scope: AccessScope, input: PaymentSubmission): FieldErrors | null {
  const errors: FieldErrors = {};
  const rep = scope.user;
  if (rep.role !== "sales_rep" || scope.repId !== rep.id) errors.form = "Only a sales representative can submit their own payment";
  if (rep.tenantId !== db.tenant.id || rep.status !== "active" || !rep.branchId) errors.form = "An active sales representative and branch are required";
  if (!isValidPaymentPeriod(input.period) || input.period > db.tenant.referenceDate.slice(0, 7)) errors.period = "Choose a valid current or past month";
  if (!Number.isFinite(input.cashAmount) || input.cashAmount < 0) errors.cashAmount = "Cash cannot be negative";
  if (!Number.isFinite(input.transferAmount) || input.transferAmount < 0) errors.transferAmount = "Transfer cannot be negative";
  if (input.transferAmount > 0 && !input.transferReference?.trim())
    errors.transferReference = "A transfer reference is required when transfer is greater than zero";
  if (rep.branchId) {
    const branch = db.branches.find((b) => b.id === rep.branchId && b.tenantId === rep.tenantId);
    const manager = branch?.managerId
      ? db.users.find((u) => u.id === branch.managerId && u.role === "manager" && u.status === "active" && u.tenantId === rep.tenantId)
      : null;
    if (!branch || !manager) errors.form = "A branch manager must be assigned before submitting a payment";
    const previouslyCollected = db.payments
      .filter((p) => p.tenantId === rep.tenantId && p.salesRepId === rep.id && p.period === input.period && p.status !== "declined")
      .reduce((sum, p) => sum + p.cashAmount + p.transferAmount, 0);
    if (getRepTotalSales(db, rep.id, input.period) - previouslyCollected - input.cashAmount - input.transferAmount < 0)
      errors.transferAmount = "Cash and transfer cannot exceed total sales";
  }
  return hasErrors(errors) ? errors : null;
}

type ChainPayment = (Payment | CustomerPayment) & { status: Payment["status"] };

/** Who may act on a payment: the assigned branch manager, or the owner. */
function paymentScopeError(db: Db, scope: AccessScope, payment: ChainPayment, role: "manager" | "owner"): string | null {
  if (scope.user.tenantId !== db.tenant.id || payment.tenantId !== db.tenant.id) return "This payment is outside your organization";
  if (scope.user.status !== "active") return "Your account is inactive";
  if (role === "manager" && (!scope.canAcknowledgePayments || payment.managerId !== scope.user.id || !scope.branchIds?.includes(payment.branchId)))
    return "This payment is outside your branch scope";
  if (role === "owner" && !scope.canConfirmPayments) return "Only the business owner can confirm payments";
  return null;
}

/** Step 2: the assigned manager acknowledges; a transfer needs its reference. */
export function validateAcknowledgePayment(db: Db, scope: AccessScope, payment: ChainPayment, existingReference: string | undefined, details: PaymentAcknowledgement): FieldErrors | null {
  const denied = paymentScopeError(db, scope, payment, "manager");
  if (denied) return { form: denied };
  if (payment.status !== "submitted") return { form: "Only submitted payments can be acknowledged" };
  const isTransfer = "transferAmount" in payment ? payment.transferAmount > 0 : payment.method === "transfer";
  if (isTransfer && !(details.transferReference?.trim() || existingReference))
    return { transferReference: "Enter the transfer reference before acknowledging" };
  return null;
}

/** Step 3: the owner confirms a submitted or acknowledged payment. */
export function validateConfirmPayment(db: Db, scope: AccessScope, payment: ChainPayment): FieldErrors | null {
  const denied = paymentScopeError(db, scope, payment, "owner");
  if (denied) return { form: denied };
  if (payment.status !== "acknowledged" && payment.status !== "submitted") return { form: "Only pending payments can be confirmed" };
  return null;
}

/** A manager declines while submitted; the owner while submitted or acknowledged. */
export function validateDeclinePayment(db: Db, scope: AccessScope, payment: ChainPayment, reason: string): FieldErrors | null {
  const role = scope.canConfirmPayments ? "owner" : "manager";
  if (scope.user.role !== "manager" && scope.user.role !== "owner") return { form: "You cannot decline this payment" };
  const denied = paymentScopeError(db, scope, payment, role);
  if (denied) return { form: denied };
  if (role === "manager" && payment.status !== "submitted") return { form: "Only submitted payments can be declined by a manager" };
  if (role === "owner" && payment.status !== "acknowledged" && payment.status !== "submitted")
    return { form: "Only pending payments can be declined by the owner" };
  if (!reason.trim()) return { reason: "A decline reason is required" };
  return null;
}
