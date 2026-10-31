/**
 * Client-side input checks, run before a write is sent to Supabase.
 *
 * Same rules and messages the app has always shown. The database (RPCs and
 * CHECK constraints) enforces them again; this only gives faster feedback.
 */
import type { ApprovalRequest, Branch, BranchStatus, Customer, CustomerPayment, CustomerPaymentMethod, Db, Expense, ExpenseCategory, InventoryRecord, ManagerRemittance, Payment, Product, ProductStatus, Role, StockRequest, Target, User, UserStatus } from "@/data/mock-db";
import { assignableRoles, canEditMember, roleNeedsBranch } from "@/lib/team";
import type { OwnerRemittancePayeeType, OwnerRemittancePaymentMethod } from "@/data/remittances";
import {
  expenseCategories,
  getManagerEligiblePayments,
  getManagerNetRemittanceDue,
  validateRemittanceReconciliation,
} from "@/lib/remittance-calculations";
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
  if (!scope.canManageStock) return { form: "Only the owner or a storekeeper can add stock" };
  const errors: FieldErrors = {};
  const branch = db.branches.find((b) => b.id === input.branchId);
  if (!branch) errors.branchId = "Select a branch";
  else if (branch.status !== "active") errors.branchId = "Stock can only be added to active branches";
  else if (scope.branchIds && !scope.branchIds.includes(branch.id)) errors.branchId = "You can only add stock to your branch";
  const product = db.products.find((p) => p.id === input.productId);
  if (!product) errors.productId = "Select a product";
  else if (product.status !== "active") errors.productId = "This product is inactive — reactivate it before adding stock";
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) errors.quantity = "Enter a whole number greater than zero";
  // Every received lot has an expiry date so FEFO issue and expiry alerts can track it.
  if (!input.expiryDate) errors.expiryDate = "Enter the expiry date";
  else if (!isValidDate(input.expiryDate)) errors.expiryDate = "Enter a valid date";
  if (input.emergency && (input.emergencyReason ?? "").trim().length < 5)
    errors.emergencyReason = "Explain why this addition can't wait for approval";
  return hasErrors(errors) ? errors : null;
}

/** Stock count correction. */
export function validateAdjustStock(scope: AccessScope, record: InventoryRecord, counted: number, reason: string): FieldErrors | null {
  if (!scope.canManageStock || (scope.branchIds && !scope.branchIds.includes(record.branchId)))
    return { form: "You cannot adjust this stock record" };
  if (!Number.isInteger(counted) || counted < 0) return { quantity: "Enter a whole number of zero or more" };
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

// ---------- expenses ----------

export type ExpenseInput = {
  category: ExpenseCategory;
  amount: number;
  expenseDate: string;
  description: string;
  note?: string;
  branchId?: string;
};

const activeOwner = (db: Db, user: User) => user.tenantId === db.tenant.id && user.role === "owner" && user.status === "active";
/** A manager acts for a branch only while assigned as that branch's manager. */
export const managedBranch = (db: Db, user: User) =>
  user.tenantId === db.tenant.id && user.role === "manager" && user.status === "active" && user.branchId
    ? db.branches.find((b) => b.id === user.branchId && b.tenantId === user.tenantId && b.managerId === user.id) ?? null
    : null;

export function validateExpense(db: Db, input: ExpenseInput): FieldErrors {
  const errors: FieldErrors = {};
  if (!isValidDate(input.expenseDate)) errors.expenseDate = "Enter a valid expense date";
  else if (input.expenseDate > db.tenant.referenceDate) errors.expenseDate = "Expense date cannot be in the future";
  if (!expenseCategories.includes(input.category)) errors.category = "Choose an expense category";
  if (!Number.isFinite(input.amount) || input.amount <= 0) errors.amount = "Amount must be greater than zero";
  if (!input.description.trim()) errors.description = "Description is required";
  if (input.branchId && !db.branches.some((b) => b.id === input.branchId && b.tenantId === db.tenant.id)) errors.branchId = "Choose a valid branch";
  return errors;
}

/** Owners record company expenses; managers record their branch's. */
export function validateExpenseCreate(db: Db, scope: AccessScope, input: ExpenseInput): FieldErrors | null {
  if (!activeOwner(db, scope.user) && !managedBranch(db, scope.user)) return { form: "Only an active Owner or branch Manager can record expenses" };
  const errors = validateExpense(db, input);
  return hasErrors(errors) ? errors : null;
}

function canManageExpense(db: Db, user: User, expense: Expense) {
  if (expense.tenantId !== db.tenant.id) return false;
  if (activeOwner(db, user)) return expense.ownerId === user.id;
  const branch = managedBranch(db, user);
  return !!branch && expense.managerId === user.id && expense.branchId === branch.id;
}

export function validateExpenseUpdate(db: Db, scope: AccessScope, expense: Expense, input: ExpenseInput): FieldErrors | null {
  if (!canManageExpense(db, scope.user, expense)) return { form: "You cannot edit this expense" };
  if (expense.status !== "recorded") return { form: "Voided expenses cannot be edited" };
  const errors = validateExpense(db, input);
  return hasErrors(errors) ? errors : null;
}

export function validateExpenseVoid(db: Db, scope: AccessScope, expense: Expense, reason: string): FieldErrors | null {
  if (!canManageExpense(db, scope.user, expense)) return { form: "You cannot void this expense" };
  if (expense.status !== "recorded") return { form: "This expense is already voided" };
  if (!reason.trim()) return { reason: "A void reason is required" };
  return null;
}

// ---------- remittances ----------

export type RemittanceInput = {
  period: string;
  cashAmount: number;
  transferAmount: number;
  transferReference?: string;
  note?: string;
};

/** Branch manager remits a month's acknowledged collections minus expenses. */
export function validateRemittanceSubmit(db: Db, scope: AccessScope, input: RemittanceInput): FieldErrors | null {
  const manager = scope.user;
  if (!managedBranch(db, manager)) return { form: "Only an active branch manager can submit remittance" };
  const errors: FieldErrors = {};
  if (!isValidPaymentPeriod(input.period) || input.period > db.tenant.referenceDate.slice(0, 7)) errors.period = "Choose a valid current or past month";
  if (!Number.isFinite(input.cashAmount) || input.cashAmount < 0) errors.cashAmount = "Cash cannot be negative";
  if (!Number.isFinite(input.transferAmount) || input.transferAmount < 0) errors.transferAmount = "Transfer cannot be negative";
  if (input.transferAmount > 0 && !input.transferReference?.trim())
    errors.transferReference = "A transfer reference is required when transfer is greater than zero";
  if (db.remittances.some((r) => r.tenantId === manager.tenantId && r.managerId === manager.id && r.period === input.period && r.status === "submitted"))
    errors.form = "A remittance for this period is already awaiting Owner review";
  if (hasErrors(errors)) return errors;
  if (!getManagerEligiblePayments(db, manager.id, input.period).length) return { form: "There are no acknowledged Sales Rep payments for this period" };
  const netRemittanceDue = getManagerNetRemittanceDue(db, manager.id, input.period);
  const reconciliation = validateRemittanceReconciliation(netRemittanceDue, input);
  if (netRemittanceDue < 0) errors.form = "Recorded expenses exceed the eligible payment position for this period";
  else if (!reconciliation.balanced) errors.form = "Cash, transfer and outstanding must reconcile to net remittance due";
  if (reconciliation.outstanding < 0) errors.transferAmount = "Cash and transfer cannot exceed net remittance due";
  return hasErrors(errors) ? errors : null;
}

function remittanceOwnerError(db: Db, scope: AccessScope, remittance: ManagerRemittance): string | null {
  if (!activeOwner(db, scope.user) || remittance.tenantId !== db.tenant.id) return "Only the active business owner can review this remittance";
  if (!db.branches.some((b) => b.id === remittance.branchId && b.tenantId === remittance.tenantId && b.managerId === remittance.managerId))
    return "This remittance is not linked to a valid branch manager";
  return null;
}

export function validateRemittanceConfirm(db: Db, scope: AccessScope, remittance: ManagerRemittance): FieldErrors | null {
  const denied = remittanceOwnerError(db, scope, remittance);
  if (denied) return { form: denied };
  if (remittance.status !== "submitted") return { form: "Only submitted remittances can be confirmed" };
  return null;
}

export function validateRemittanceDecline(db: Db, scope: AccessScope, remittance: ManagerRemittance, reason: string): FieldErrors | null {
  const denied = remittanceOwnerError(db, scope, remittance);
  if (denied) return { form: denied };
  if (remittance.status !== "submitted") return { form: "Only submitted remittances can be declined" };
  if (!reason.trim()) return { reason: "A decline reason is required" };
  return null;
}

export type OwnerRemittanceInput = {
  payeeType: OwnerRemittancePayeeType;
  payeeName: string;
  amount: number;
  paymentMethod: OwnerRemittancePaymentMethod;
  reference?: string;
  remittanceDate: string;
  purpose: string;
  note?: string;
};

const ownerPayeeTypes: OwnerRemittancePayeeType[] = ["supplier", "landlord", "utility", "contractor", "other"];

/** Owner records money paid out of the business to an external payee (not part of the payment chain). */
export function validateOwnerRemittance(db: Db, scope: AccessScope, input: OwnerRemittanceInput): FieldErrors | null {
  if (!activeOwner(db, scope.user)) return { form: "Only the active business owner can create remittances" };
  const errors: FieldErrors = {};
  if (!ownerPayeeTypes.includes(input.payeeType)) errors.payeeType = "Choose a payee type";
  if (!input.payeeName.trim()) errors.payeeName = "Payee name is required";
  if (!Number.isFinite(input.amount) || input.amount <= 0) errors.amount = "Amount must be greater than zero";
  if (input.paymentMethod !== "cash" && input.paymentMethod !== "transfer") errors.paymentMethod = "Choose a payment method";
  if (!isValidDate(input.remittanceDate)) errors.remittanceDate = "Enter a valid remittance date";
  else if (input.remittanceDate > db.tenant.referenceDate) errors.remittanceDate = "Date cannot be in the future";
  if (!input.purpose.trim()) errors.purpose = "Purpose is required";
  if (input.paymentMethod === "transfer" && !input.reference?.trim()) errors.reference = "A transfer reference is required";
  return hasErrors(errors) ? errors : null;
}

// ---------- targets ----------

export type TargetInput = { repId: string; month: string; amount: number };

export function validateTarget(db: Db, scope: AccessScope, input: TargetInput, editingId?: string): FieldErrors {
  const errors: FieldErrors = {};
  const rep = db.users.find((u) => u.id === input.repId);
  if (!rep) errors.repId = "Select a sales representative";
  else if (rep.role !== "sales_rep") errors.repId = "Targets can only be set for sales representatives";
  else if (rep.status !== "active") errors.repId = "This sales representative is inactive";
  else if (!rep.branchId) errors.repId = "This sales representative has no branch";
  else if (scope.branchIds && !scope.branchIds.includes(rep.branchId)) errors.repId = "You can only set targets for your branch";
  if (!/^\d{4}-\d{2}$/.test(input.month)) errors.month = "Select a month";
  if (!Number.isFinite(input.amount) || input.amount <= 0) errors.amount = "Enter a target above zero";
  if (!errors.repId && !errors.month
    && db.targets.some((t) => t.id !== editingId && t.scope === "rep" && t.userId === input.repId && t.month === input.month))
    errors.repId = "This rep already has a target for that month — edit it instead";
  return errors;
}

export function validateTargetCreate(db: Db, scope: AccessScope, input: TargetInput): FieldErrors | null {
  if (!scope.canManageTargets) return { form: "You cannot set targets" };
  const errors = validateTarget(db, scope, input);
  return hasErrors(errors) ? errors : null;
}

export type BranchTargetInput = { branchId: string; month: string; amount: number };

export function validateBranchTarget(db: Db, scope: AccessScope, input: BranchTargetInput, editingId?: string): FieldErrors {
  const errors: FieldErrors = {};
  const branch = db.branches.find((b) => b.id === input.branchId);
  if (!branch || branch.status !== "active") errors.branchId = "Select an active branch";
  else if (scope.branchIds && !scope.branchIds.includes(branch.id)) errors.branchId = "You can only set targets for your branch";
  if (!/^\d{4}-\d{2}$/.test(input.month)) errors.month = "Select a month";
  if (!Number.isFinite(input.amount) || input.amount <= 0) errors.amount = "Enter a target above zero";
  if (!errors.branchId && !errors.month
    && db.targets.some((t) => t.id !== editingId && t.scope === "branch" && t.branchId === input.branchId && t.month === input.month))
    errors.branchId = "This branch already has a target for that month — edit it instead";
  return errors;
}

export function validateBranchTargetCreate(db: Db, scope: AccessScope, input: BranchTargetInput): FieldErrors | null {
  if (!scope.canManageTargets) return { form: "You cannot set targets" };
  const errors = validateBranchTarget(db, scope, input);
  return hasErrors(errors) ? errors : null;
}

/** Only the amount changes; sales history is never touched. */
export function validateTargetUpdate(db: Db, scope: AccessScope, target: Target, amount: number): FieldErrors | null {
  if (!scope.canManageTargets) return { form: "You cannot edit targets" };
  const errors = target.scope === "branch"
    ? validateBranchTarget(db, scope, { branchId: target.branchId, month: target.month, amount }, target.id)
    : validateTarget(db, scope, { repId: target.userId ?? "", month: target.month, amount }, target.id);
  return hasErrors(errors) ? errors : null;
}

// ---------- products ----------

export type ProductInput = {
  name: string;
  sku: string;
  category: string;
  unit: string;
  unitPrice: number;
  unitCost: number;
  lowStockThreshold: number;
  description?: string;
};

export function validateProduct(db: Db, input: ProductInput, editingId?: string): FieldErrors {
  const errors: FieldErrors = {};
  const sku = input.sku.trim().toUpperCase();
  if (!input.name.trim()) errors.name = "Enter a product name";
  if (!sku) errors.sku = "Enter a SKU";
  else if (db.products.some((p) => p.id !== editingId && p.tenantId === db.tenant.id && p.sku.toUpperCase() === sku))
    errors.sku = "This SKU is already used by another product";
  if (!input.category.trim()) errors.category = "Enter a category";
  if (!input.unit.trim()) errors.unit = "Select a unit";
  if (!Number.isFinite(input.unitPrice) || input.unitPrice <= 0) errors.unitPrice = "Enter a selling price above zero";
  if (!Number.isFinite(input.unitCost) || input.unitCost < 0) errors.unitCost = "Enter a unit cost of zero or more";
  else if (input.unitCost > input.unitPrice) errors.unitCost = "Unit cost cannot exceed selling price";
  if (!Number.isInteger(input.lowStockThreshold) || input.lowStockThreshold < 0) errors.threshold = "Enter a whole number of zero or more";
  return errors;
}

export function validateProductWrite(db: Db, scope: AccessScope, input: ProductInput, existing?: Product): FieldErrors | null {
  if (!scope.canManageProducts) return { form: existing ? "You cannot edit products" : "You cannot add products" };
  const errors = validateProduct(db, input, existing?.id);
  return hasErrors(errors) ? errors : null;
}

/** Owners and managers deactivate; reactivation is also open to storekeepers. */
export function validateProductStatus(scope: AccessScope, status: ProductStatus): FieldErrors | null {
  const allowed = status === "inactive" ? scope.canDeactivateProducts : scope.canDeactivateProducts || scope.canManageProducts;
  if (allowed) return null;
  return { form: scope.canManageProducts ? "Deactivation needs a manager's approval — send a request instead" : "You cannot change product status" };
}

/** Storekeeper asks their manager to deactivate a product. */
export function validateDeactivationRequest(db: Db, scope: AccessScope, product: Product, reason: string): FieldErrors | null {
  if (!scope.canManageProducts || scope.canDeactivateProducts) return { form: "You cannot request product deactivation" };
  if (product.status !== "active") return { form: "This product is already inactive" };
  if (db.approvals.some((a) => a.type === "product_deactivation" && a.status === "pending" && a.productId === product.id))
    return { form: "A deactivation request for this product is already pending" };
  if (reason.trim().length < 3) return { reason: "Give a reason for the manager" };
  return null;
}

// ---------- team ----------

export type TeamMemberInput = {
  name: string;
  email: string;
  role: Role;
  branchId: string;
  status: UserStatus;
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateTeamMember(db: Db, scope: AccessScope, input: TeamMemberInput, editingId?: string): FieldErrors {
  const e: FieldErrors = {};
  const existing = editingId ? db.users.find((u) => u.id === editingId) : undefined;
  if (!scope.canManageTeam) e.form = "You don't have permission to manage the team.";
  if (existing && !canEditMember(scope, existing)) e.form = "You can't edit this team member.";
  if (input.name.trim().length < 2) e.name = "Enter the member's full name.";
  const email = input.email.trim().toLowerCase();
  if (!email) e.email = "Email is required.";
  else if (!EMAIL.test(email)) e.email = "Enter a valid email address.";
  else if (db.users.some((u) => u.email.toLowerCase() === email && u.id !== editingId)) e.email = "Someone on the team already uses this email.";
  if (!assignableRoles(scope).includes(input.role) && existing?.role !== input.role) e.role = "You can't assign this role.";
  const branch = db.branches.find((b) => b.id === input.branchId);
  if (roleNeedsBranch(input.role) && !input.branchId) e.branchId = "Select the branch this member works at.";
  if (input.branchId) {
    if (!branch || branch.tenantId !== db.tenant.id) e.branchId = "Select a valid branch.";
    else if (scope.branchIds && !scope.branchIds.includes(branch.id)) e.branchId = "You can only assign members to your own branch.";
    else if (branch.status !== "active" && input.status === "active") e.branchId = "This branch is inactive.";
    else if (input.role === "manager" && branch.managerId && branch.managerId !== editingId
      && db.users.find((u) => u.id === branch.managerId)?.status === "active")
      e.branchId = `${branch.name} already has a manager.`;
  }
  if (!["active", "inactive", "pending"].includes(input.status)) e.status = "Choose a valid status.";
  return e;
}

export function validateTeamMemberUpdate(db: Db, scope: AccessScope, member: User, input: TeamMemberInput): FieldErrors | null {
  const errors = validateTeamMember(db, scope, input, member.id);
  return hasErrors(errors) ? errors : null;
}

/** Managers propose new members; the Owner approves before they are invited. */
export function validateTeamMemberRequest(db: Db, scope: AccessScope, input: TeamMemberInput): FieldErrors | null {
  const errors = validateTeamMember(db, scope, { ...input, status: "pending" });
  const email = input.email.trim().toLowerCase();
  if (!errors.email && db.approvals.some((a) => a.type === "team_member" && a.status === "pending" && a.member?.email === email))
    errors.email = "A request for this email is already waiting for approval.";
  return hasErrors(errors) ? errors : null;
}

/** Soft (de)activation; history keeps referencing the member. */
export function validateMemberStatus(scope: AccessScope, member: User): FieldErrors | null {
  return canEditMember(scope, member) ? null : { form: "You can't change this member's status." };
}

/** users has first_name/last_name; the app edits one full-name field. */
export function splitName(name: string): { firstName: string; lastName: string } {
  const [firstName = "", ...rest] = name.trim().split(/\s+/);
  return { firstName, lastName: rest.join(" ") };
}

// ---------- branches ----------

export type BranchInput = {
  name: string;
  code: string;
  location: string;
  address: string;
  phone: string;
  email: string;
  managerId: string;
  status: BranchStatus;
};

/** Branch codes are unique; a manager runs at most one active branch. */
export function validateBranch(branches: Branch[], users: User[], input: BranchInput, editingId?: string): FieldErrors {
  const errors: FieldErrors = {};
  if (!input.name.trim()) errors.name = "Branch name is required";
  if (!input.code.trim()) errors.code = "Branch code is required";
  else if (branches.some((b) => b.id !== editingId && b.code.toLowerCase() === input.code.trim().toLowerCase()))
    errors.code = "This branch code is already in use";
  if (!input.location.trim()) errors.location = "Location is required";
  if (input.email && !/^\S+@\S+\.\S+$/.test(input.email)) errors.email = "Enter a valid email";
  if (input.managerId) {
    const manager = users.find((x) => x.id === input.managerId);
    if (!manager || manager.role !== "manager" || manager.status !== "active") errors.managerId = "Select an active manager";
    else if (branches.some((b) => b.id !== editingId && b.managerId === manager.id && b.status === "active"))
      errors.managerId = "This manager already runs another active branch";
  }
  return errors;
}
