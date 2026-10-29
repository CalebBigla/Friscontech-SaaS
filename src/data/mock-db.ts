import type { Onboarding } from "@/data/onboarding";
import type { OwnerRemittance } from "./remittances";
/**
 * Domain types for Friscontech. Data is read from Supabase; see src/hooks/.
 * Records mirror future PostgreSQL tables: every relationship is expressed through IDs.
 * Derived values (revenue, staff counts, performance) are NEVER stored here —
 * they are computed in src/lib/calculations.ts.
 */

export type Role = "owner" | "manager" | "storekeeper" | "sales_rep";
export type BranchStatus = "active" | "inactive";
export type SaleStatus = "completed" | "pending" | "voided";

/** Tenant doubles as the organization settings record (PRD tenant + editable business profile). */
export type Tenant = {
  id: string;
  name: string;
  currency: "NGN";
  referenceDate: string;
  lastSyncTime: string;
  legalName: string;
  businessEmail: string;
  phone: string;
  timezone: string;
  plan: string;
  /** Months before expiry when stock alerts start (owner-editable). */
  expiryAlertMonths: number;
  createdAt: string;
  updatedAt: string;
};
export type DateFormatPref = "MMM D, YYYY" | "DD/MM/YYYY" | "YYYY-MM-DD";
export type ReportPeriodPref = "today" | "week" | "month" | "quarter";
/** Per-user display preferences (no secrets). */
export type UserPreference = {
  userId: string;
  dateFormat: DateFormatPref;
  defaultReportPeriod: ReportPeriodPref;
  updatedAt: string;
};
export type Branch = {
  id: string;
  tenantId: string;
  name: string;
  code: string;
  location: string;
  address: string;
  phone: string;
  email: string;
  managerId: string | null;
  status: BranchStatus;
  createdAt: string;
};
export type UserStatus = "active" | "inactive" | "pending" | "rejected" | "suspended";
/** managerId = the manager this member reports to (null for owner/managers). */
export type User = {
  id: string;
  tenantId: string;
  /** Full display name. For mock users this is a single field.
   *  For Supabase-sourced users auth-context derives it from firstName + lastName. */
  name: string;
  /** Supabase DB: first_name */
  firstName?: string;
  /** Supabase DB: last_name */
  lastName?: string;
  email: string;
  /** Supabase DB: phone — not present in mock users */
  phone?: string | null;
  role: Role;
  branchId: string | null;
  managerId: string | null;
  status: UserStatus;
  /** Supabase DB: joined_at */
  joinedAt?: string;
  /** Supabase DB: deactivated_at */
  deactivatedAt?: string | null;
  /** auth.users foreign key */
  authId?: string | null;
  createdAt: string;
};
export type ProductStatus = "active" | "inactive";
/** unitPrice is the selling price (PRD: selling_price). Branch stock lives in InventoryRecord, never here. */
export type Product = {
  id: string;
  tenantId: string;
  name: string;
  sku: string;
  category: string;
  unit: string;
  unitPrice: number;
  unitCost: number;
  lowStockThreshold: number;
  description?: string;
  status: ProductStatus;
  createdAt: string;
  updatedAt: string;
};
export type Sale = {
  id: string;
  tenantId: string;
  code: string;
  branchId: string;
  salesRepId: string;
  productId: string;
  quantity: number;
  unitPrice: number;
  saleDate: string;
  createdAt: string;
  status: SaleStatus;
  /** Set = customer (account) order; empty = walk-in sale. */
  customerId?: string;
  /** Groups the lines of one multi-item order; defaults to the sale id when absent. */
  orderId?: string;
  walkInName?: string;
  walkInPhone?: string;
};
export type PaymentStatus = "submitted" | "acknowledged" | "declined" | "confirmed";
/** Cash and transfer are submitted values; total sales and outstanding are always derived. */
export type Payment = {
  id: string;
  tenantId: string;
  branchId: string;
  salesRepId: string;
  managerId: string;
  period: string;
  cashAmount: number;
  transferAmount: number;
  transferReference?: string;
  status: PaymentStatus;
  submittedAt: string;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
  confirmedAt?: string;
  confirmedBy?: string;
  declinedAt?: string;
  declinedBy?: string;
  declineReason?: string;
  /** Optional proof of transfer attached by the manager on acknowledgement (file name only). */
  proofName?: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
};
export type CustomerStatus = "active" | "inactive";
export type Customer = {
  id: string;
  tenantId: string;
  branchId: string | null;
  name: string;
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
  status: CustomerStatus;
  /** Owner-set credit ceiling in naira; undefined = no limit. */
  creditLimit?: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};
export type CustomerPaymentMethod = "cash" | "transfer";
/** A credit on a customer account. Follows the same chain as Payment. */
export type CustomerPayment = {
  id: string;
  tenantId: string;
  customerId: string;
  branchId: string;
  managerId: string;
  amount: number;
  method: CustomerPaymentMethod;
  reference?: string;
  receivedBy: string;
  orderId?: string;
  paymentDate: string;
  status: PaymentStatus;
  submittedAt: string;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
  confirmedAt?: string;
  confirmedBy?: string;
  declinedAt?: string;
  declinedBy?: string;
  declineReason?: string;
  proofName?: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
};
export type NotificationType =
  | "payment_awaiting_acknowledgement"
  | "payment_awaiting_confirmation"
  | "payment_confirmed"
  | "payment_declined"
  | "onboarding_submitted"
  | "guarantor_completed"
  | "stock_request_submitted"
  | "stock_request_approved"
  | "stock_request_rejected"
  | "stock_request_fulfilled";
/** Notifications-ready rows for the next approver; delivery is added later. */
export type AppNotification = {
  id: string;
  tenantId: string;
  recipientId: string;
  type: NotificationType;
  entityType: "payment" | "customer_payment" | "onboarding" | "stock_request";
  entityId: string;
  message: string;
  createdAt: string;
  readAt?: string;
};
export type ExpenseCategory =
  "transport" | "logistics" | "office" | "communication" | "maintenance" | "other";
export type ExpenseStatus = "recorded" | "voided";
export type Expense = {
  id: string;
  tenantId: string;
  branchId: string | null;
  managerId?: string;
  ownerId?: string;
  category: ExpenseCategory;
  amount: number;
  expenseDate: string;
  description: string;
  note?: string;
  status: ExpenseStatus;
  createdAt: string;
  updatedAt: string;
};
export type RemittanceStatus = "draft" | "submitted" | "confirmed" | "declined";
/** Amounts are computed by the service at submission and retained as the remittance snapshot. */
export type ManagerRemittance = {
  id: string;
  tenantId: string;
  branchId: string;
  managerId: string;
  period: string;
  totalReceived: number;
  expenseAmount: number;
  netRemittanceDue: number;
  cashAmount: number;
  transferAmount: number;
  outstandingAmount: number;
  transferReference?: string;
  status: RemittanceStatus;
  submittedAt?: string;
  confirmedAt?: string;
  confirmedBy?: string;
  declinedAt?: string;
  declinedBy?: string;
  declineReason?: string;
  note?: string;
  paymentIds: string[];
  expenseIds: string[];
  createdAt: string;
  updatedAt: string;
};
/** Available stock is never stored: quantityOnHand − quantityReserved (see inventory-calculations). */
export type InventoryRecord = {
  id: string;
  tenantId: string;
  branchId: string;
  productId: string;
  quantityOnHand: number;
  quantityReserved: number;
  lowStockThreshold: number;
  reorderLevel: number;
  lastUpdated: string;
};
/** A received lot of one product in one branch. quantityRemaining is reduced first-expiry-first-out. */
export type StockBatch = {
  id: string;
  tenantId: string;
  branchId: string;
  productId: string;
  batchNumber: string;
  expiryDate: string;
  quantityReceived: number;
  quantityRemaining: number;
  receivedAt: string;
};
export type MovementType = "stock_added" | "stock_issued" | "sale" | "adjustment";
/** quantity is a signed delta applied to quantityOnHand. */
export type InventoryMovement = {
  id: string;
  tenantId: string;
  branchId: string;
  productId: string;
  type: MovementType;
  quantity: number;
  referenceType?: "stock_request" | "sale" | "manual";
  referenceId?: string;
  performedBy: string;
  createdAt: string;
  note?: string;
};
/** month is "YYYY-MM" (PRD month + year). Achievement is never stored — it is computed from sales. */
export type Target = {
  id: string;
  tenantId: string;
  scope: "branch" | "rep";
  branchId: string;
  userId: string | null;
  month: string;
  amount: number;
  createdAt: string;
  updatedAt: string;
};
export type StockRequestStatus =
  "pending" | "approved" | "partially_fulfilled" | "fulfilled" | "rejected";
/** PRD core: id, tenant_id, rep_id, product_id, qty, status, fulfilled_by — extended for the branch-aware workflow. */
export type StockRequest = {
  id: string;
  tenantId: string;
  branchId: string;
  repId: string;
  productId: string;
  quantityRequested: number;
  quantityApproved?: number;
  quantityFulfilled?: number;
  status: StockRequestStatus;
  priority: "Normal" | "High";
  requestedAt: string;
  approvedAt?: string;
  fulfilledAt?: string;
  rejectedAt?: string;
  approvedBy?: string;
  fulfilledBy?: string;
  processedBy?: string;
  note?: string;
  rejectionReason?: string;
  /** set when several products were requested in one submission */
  batchId?: string;
  /** rep confirms receipt after fulfillment */
  acknowledgedAt?: string;
  acknowledgedBy?: string;
};
export type ApprovalType = "stock_addition" | "product_deactivation" | "team_member";
export type ApprovalStatus = "pending" | "approved" | "rejected";
/**
 * Permission request raised by one role for another to review (Storekeeper → Manager, Manager → Owner).
 * Emergency stock additions are applied immediately and stay "pending" until reviewed afterwards.
 */
export type ApprovalRequest = {
  id: string;
  tenantId: string;
  type: ApprovalType;
  status: ApprovalStatus;
  branchId: string | null;
  requestedBy: string;
  requestedAt: string;
  reviewedBy?: string;
  reviewedAt?: string;
  rejectionReason?: string;
  note?: string;
  emergency?: boolean;
  emergencyReason?: string;
  appliedAt?: string;
  productId?: string;
  quantity?: number;
  batchNumber?: string;
  expiryDate?: string;
  member?: { name: string; email: string; role: Role; branchId: string | null };
};
export type AuditEntity =
  | "product"
  | "sale"
  | "payment"
  | "expense"
  | "remittance"
  | "stock_request"
  | "target"
  | "team_member"
  | "branch"
  | "inventory"
  | "settings"
  | "session"
  | "customer";
/** Audit log entry (see src/data/auditLogs.ts): actorId = user_id, createdAt = timestamp, subject = description. */
export type Activity = {
  id: string;
  tenantId: string;
  action: string;
  subject: string;
  actorId: string;
  createdAt: string;
  entity: AuditEntity;
  entityId?: string;
  emergency?: boolean;
  metadata?: {
    branchId?: string;
    productId?: string;
    targetId?: string;
    requestId?: string;
    salesRepId?: string;
    managerId?: string;
    period?: string;
    amount?: number;
    cashAmount?: number;
    transferAmount?: number;
    paymentMethod?: "cash" | "transfer" | "cheque" | "cash_and_transfer" | "none";
    transferReference?: string;
    outstandingAmount?: number;
    declineReason?: string;
    expenseId?: string;
    remittanceId?: string;
    payeeName?: string;
    purpose?: string;
    reference?: string;
    category?: ExpenseCategory;
    totalReceived?: number;
    expenseAmount?: number;
    netRemittanceDue?: number;
    reason?: string;
    saleType?: "walk_in" | "customer";
    customerId?: string;
    orderId?: string;
    proofName?: string;
    creditLimit?: number;
  };
};

export type Db = {
  tenant: Tenant;
  branches: Branch[];
  users: User[];
  products: Product[];
  sales: Sale[];
  inventory: InventoryRecord[];
  inventoryMovements: InventoryMovement[];
  targets: Target[];
  stockRequests: StockRequest[];
  payments: Payment[];
  activities: Activity[];
  preferences: UserPreference[];
  approvals: ApprovalRequest[];
  expenses: Expense[];
  remittances: ManagerRemittance[];
  ownerRemittances: OwnerRemittance[];
  customers: Customer[];
  customerPayments: CustomerPayment[];
  notifications: AppNotification[];
  onboardings: Onboarding[];
  stockBatches: StockBatch[];
};
