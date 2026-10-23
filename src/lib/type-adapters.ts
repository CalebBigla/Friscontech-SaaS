/**
 * Type Adapters
 *
 * Transform between database rows (snake_case) and app objects (camelCase).
 * Column names follow supabase/migrations/, not the generated database.types.ts,
 * which is stale. Where they differ, the row type is declared locally below.
 */

import type { Row } from "@/lib/supabase-helpers";
import type {
  Activity, ApprovalRequest, AppNotification, Branch, BranchStatus,
  Customer, CustomerPayment, Expense, InventoryMovement, InventoryRecord,
  Payment, Product, ProductStatus, Sale, StockBatch, StockRequest, Target,
  User, UserPreference,
} from "@/data/mock-db";
import type { EmployeeData, Onboarding, StoredFile } from "@/data/onboarding";
import type { OwnerRemittance } from "@/data/remittances";

/** Local rows follow the migration schema where generated database.types.ts is stale. */
export interface InventoryRecordMigrationRow {
  id: string; tenant_id: string; branch_id: string; product_id: string;
  quantity_on_hand: number; quantity_reserved: number; low_stock_threshold: number;
  reorder_level: number; last_updated: string;
}
/** Column shape follows 20260114140000_create_products_and_inventory.sql. */
export interface StockBatchMigrationRow {
  id: string; tenant_id: string; branch_id: string; product_id: string;
  batch_number: string | null; expiry_date: string | null; quantity_received: number;
  quantity_remaining: number; received_at: string;
}
/** `type` is the actual column in 20260114140000_create_products_and_inventory.sql. */
export interface InventoryMovementMigrationRow {
  id: string; tenant_id: string; branch_id: string; product_id: string;
  type: InventoryMovement["type"]; quantity: number; reference_type: InventoryMovement["referenceType"] | null;
  reference_id: string | null; performed_by: string; note: string | null; created_at: string;
}
/** Columns follow 20260114170000_create_operations_tables.sql. */
export interface ApprovalRequestMigrationRow {
  id: string; tenant_id: string; type: ApprovalRequest["type"]; status: ApprovalRequest["status"];
  branch_id: string | null; requested_by: string; requested_at: string;
  reviewed_by: string | null; reviewed_at: string | null; rejection_reason: string | null;
  note: string | null; emergency: boolean | null; emergency_reason: string | null;
  applied_at: string | null; product_id: string | null; quantity: number | null;
  batch_number: string | null; expiry_date: string | null; member_data: unknown;
  created_at: string; updated_at: string;
}
/** Columns follow 20260114170000_create_operations_tables.sql. */
export interface StockRequestMigrationRow {
  id: string; tenant_id: string; branch_id: string; rep_id: string; product_id: string;
  quantity_requested: number; quantity_approved: number | null; quantity_fulfilled: number | null;
  batch_id: string | null; priority: StockRequest["priority"]; status: StockRequest["status"];
  requested_at: string; approved_at: string | null; approved_by: string | null;
  fulfilled_at: string | null; fulfilled_by: string | null; rejected_at: string | null;
  processed_by: string | null; rejection_reason: string | null; acknowledged_at: string | null;
  acknowledged_by: string | null; note: string | null; created_at: string; updated_at: string;
}
/** Column shapes follow 20260114150000_create_customers_and_sales.sql. */
export interface CustomerPaymentMigrationRow {
  id: string; tenant_id: string; customer_id: string; branch_id: string; manager_id: string;
  amount: number; method: CustomerPayment["method"]; received_by: string; order_id: string | null;
  payment_date: string; proof_name: string | null; status: CustomerPayment["status"];
  submitted_at: string; acknowledged_at: string | null; acknowledged_by: string | null;
  confirmed_at: string | null; confirmed_by: string | null; declined_at: string | null;
  declined_by: string | null; decline_reason: string | null; reference: string | null;
  note: string | null; created_at: string; updated_at: string;
}
/** Column shape follows 20260114160000_create_financial_workflows.sql. */
export interface PaymentMigrationRow {
  id: string; tenant_id: string; branch_id: string; sales_rep_id: string; manager_id: string;
  period: string; cash_amount: number; transfer_amount: number; transfer_reference: string | null;
  proof_name: string | null; status: Payment["status"]; submitted_at: string;
  acknowledged_at: string | null; acknowledged_by: string | null; confirmed_at: string | null;
  confirmed_by: string | null; declined_at: string | null; declined_by: string | null;
  decline_reason: string | null; note: string | null; created_at: string; updated_at: string;
}
/** Column shape follows 20260114160000_create_financial_workflows.sql. */
export interface ManagerRemittanceMigrationRow {
  id: string; tenant_id: string; branch_id: string; manager_id: string; period: string;
  total_received: number; expense_amount: number; net_remittance_due: number; cash_amount: number;
  transfer_amount: number; outstanding_amount: number; transfer_reference: string | null;
  status: import("@/data/mock-db").ManagerRemittance["status"]; submitted_at: string | null;
  confirmed_at: string | null; confirmed_by: string | null; declined_at: string | null;
  declined_by: string | null; decline_reason: string | null; note: string | null;
  payment_ids: string[]; expense_ids: string[]; created_at: string; updated_at: string;
}
/** Column shape follows 20260114160000_create_financial_workflows.sql. */
export interface OwnerRemittanceMigrationRow {
  id: string; tenant_id: string; payee_type: OwnerRemittance["payeeType"]; payee_name: string; amount: number;
  payment_method: OwnerRemittance["paymentMethod"]; reference: string | null; purpose: string; remittance_date: string;
  note: string | null; created_by: string; created_at: string; updated_at: string;
}
/** Column shape follows 20260114160000_create_financial_workflows.sql. */
export interface ExpenseMigrationRow {
  id: string; tenant_id: string; branch_id: string | null; manager_id: string | null;
  owner_id: string | null; category: Expense["category"]; amount: number; expense_date: string;
  description: string; note: string | null; status: Expense["status"];
  created_at: string; updated_at: string;
}
/** Columns follow 20260114150000_create_customers_and_sales.sql. */
export interface CustomerMigrationRow {
  id: string; tenant_id: string; branch_id: string | null; name: string; contact_person: string;
  phone: string | null; email: string | null; address: string | null; credit_limit: number | null;
  status: Customer["status"]; created_by: string; created_at: string; updated_at: string;
}
/** Final invite-first columns follow 20260118010000_restructure_onboardings.sql. */
export interface OnboardingMigrationRow {
  id: string; tenant_id: string; user_id: string | null; employee_id: string; job_title: string;
  department: string; start_date: string; status: Onboarding["status"]; token_expires_at: string;
  token_revoked: boolean; used_at: string | null; step: number; data: unknown;
  correction_note: string | null; guarantor_status: Onboarding["guarantorStatus"];
  guarantor_token: string | null; guarantor_response: unknown; guarantor_decision: Onboarding["guarantorDecision"] | null;
  guarantor_decision_reason: string | null; guarantor_decided_at: string | null;
  created_at: string; submitted_at: string | null; activated_at: string | null;
}
/** Column names and CHECK values follow 20260114120000_create_initial_schema.sql. */
export interface UserPreferenceMigrationRow {
  user_id: string; date_format: UserPreference["dateFormat"];
  default_report_period: UserPreference["defaultReportPeriod"]; updated_at: string;
}
/** Notification columns and CHECK values follow 20260114180000_create_system_tables.sql. */
export interface NotificationMigrationRow {
  id: string; tenant_id: string; recipient_id: string; type: AppNotification["type"];
  entity_type: AppNotification["entityType"]; entity_id: string; message: string;
  read_at: string | null; created_at: string;
}

// ─────────────────────────── BRANCHES ────────────────────────────

export function transformBranch(dbRow: { id: string; tenant_id: string; name: string; code: string; location: string; address: string; phone: string; email: string; status: BranchStatus; manager_id: string | null; created_at: string }): Branch {
  return {
    id:           dbRow['id'],
    tenantId:     dbRow['tenant_id'],
    name:         dbRow['name'],
    code:         dbRow['code'],
    location:     dbRow['location'],
    address:      dbRow['address'],
    phone:        dbRow['phone'],
    email:        dbRow['email'],
    status:       dbRow['status'] as BranchStatus,
    managerId:    dbRow['manager_id'] ?? null,
    createdAt:    dbRow['created_at'],
  };
}

export function branchToDb(branch: Partial<Branch>, tenantId: string): Record<string, unknown> {
  const r: Record<string, unknown> = { tenant_id: tenantId };
  if (branch.id)                          r['id']              = branch.id;
  if (branch.name)                        r['name']            = branch.name;
  if (branch.code)                        r['code']            = branch.code;
  if (branch.location  !== undefined)     r['location']        = branch.location;
  if (branch.address   !== undefined)     r['address']         = branch.address;
  if (branch.phone     !== undefined)     r['phone']           = branch.phone;
  if (branch.email     !== undefined)     r['email']           = branch.email;
  if (branch.status)                      r['status']          = branch.status;
  if (branch.managerId !== undefined)     r['manager_id']      = branch.managerId || null;
  return r;
}

// ─────────────────────────── USERS ───────────────────────────────
// users.id IS the auth.users id (no separate auth_id column).
// role is NULL for a pending onboarding-created profile (set at approval).
// status: active | inactive | pending | rejected | suspended.

export function transformUser(dbRow: { id: string; tenant_id: string; first_name: string | null; last_name: string | null; email: string | null; phone: string | null; role: User["role"] | null; status: User["status"]; branch_id: string | null; manager_id: string | null; joined_at: string | null; deactivated_at: string | null; created_at: string | null }): User {
  const firstName = dbRow['first_name'] ?? "";
  const lastName  = dbRow['last_name']  ?? "";
  return {
    id:            dbRow['id'],
    tenantId:      dbRow['tenant_id'],
    name:          [firstName, lastName].filter(Boolean).join(" ") || dbRow['email'] || "User",
    firstName,
    lastName,
    email:         dbRow['email']   ?? "",
    phone:         dbRow['phone']   ?? null,
    role:          (dbRow['role'] ?? "sales_rep") as User["role"],
    status:        dbRow['status'] as User["status"],
    branchId:      dbRow['branch_id'] ?? null,
    managerId:     dbRow['manager_id'] ?? null,
    ...(dbRow['joined_at'] ? { joinedAt: dbRow['joined_at'] } : {}),
    deactivatedAt: dbRow['deactivated_at'] ?? null,
    authId:        dbRow['id'], // id is the auth id
    createdAt:     dbRow['joined_at'] ?? dbRow['created_at'] ?? "",
  };
}

export function userToDb(user: Partial<User>, tenantId: string): Record<string, unknown> {
  const r: Record<string, unknown> = { tenant_id: tenantId };
  if (user.id)                          r['id']               = user.id;
  if (user.branchId  !== undefined)     r['branch_id']        = user.branchId  ?? null;
  if (user.firstName)                   r['first_name']       = user.firstName;
  if (user.lastName)                    r['last_name']        = user.lastName;
  if (user.email    !== undefined)      r['email']            = user.email;
  if (user.phone    !== undefined)      r['phone']            = user.phone     ?? null;
  if (user.role     !== undefined)      r['role']             = user.role;
  if (user.status)                      r['status']           = user.status;
  if (user.managerId !== undefined)     r['manager_id']       = user.managerId ?? null;
  if (user.joinedAt)                    r['joined_at']        = user.joinedAt;
  if (user.deactivatedAt !== undefined) r['deactivated_at']   = user.deactivatedAt ?? null;
  return r;
}

// ─────────────────────────── USER PREFERENCES ────────────────────

export function transformPreference(dbRow: UserPreferenceMigrationRow): UserPreference {
  return {
    userId:              dbRow.user_id,
    dateFormat:          dbRow.date_format,
    defaultReportPeriod: dbRow.default_report_period,
    updatedAt:           dbRow.updated_at,
  };
}

export function preferenceToDb(pref: Partial<UserPreference>, userId: string): Record<string, unknown> {
  const r: Record<string, unknown> = { user_id: userId };
  if (pref.dateFormat)          r['date_format']           = pref.dateFormat;
  if (pref.defaultReportPeriod) r['default_report_period'] = pref.defaultReportPeriod;
  return r;
}

// ─────────────────────────── PRODUCTS ────────────────────────────

export function transformProduct(dbRow: { id: string; tenant_id: string; name: string; sku: string; category: string; unit: string; unit_cost: number; unit_price: number; status: ProductStatus; low_stock_threshold: number | null; description: string | null; created_at: string; updated_at: string }): Product {
  return {
    id:                dbRow['id'],
    tenantId:          dbRow['tenant_id'],
    name:              dbRow['name'],
    sku:               dbRow['sku'],
    category:          dbRow['category'],
    unit:              dbRow['unit'],
    unitCost:          dbRow['unit_cost'],
    unitPrice:         dbRow['unit_price'],
    status:            dbRow['status'] as ProductStatus,
    lowStockThreshold: dbRow['low_stock_threshold'] ?? 0,
    description:       dbRow['description'] ?? "",
    createdAt:         dbRow['created_at'],
    updatedAt:         dbRow['updated_at'],
  };
}

export function productToDb(product: Partial<Product>, tenantId: string): Record<string, unknown> {
  const r: Record<string, unknown> = { tenant_id: tenantId };
  if (product.id)                           r['id']                  = product.id;
  if (product.name)                         r['name']                = product.name;
  if (product.sku)                          r['sku']                 = product.sku;
  if (product.category)                     r['category']            = product.category;
  if (product.unit)                         r['unit']                = product.unit;
  if (product.unitCost     !== undefined)   r['unit_cost']           = product.unitCost;
  if (product.unitPrice    !== undefined)   r['unit_price']          = product.unitPrice;
  if (product.status)                       r['status']              = product.status;
  if (product.lowStockThreshold !== undefined) r['low_stock_threshold'] = product.lowStockThreshold;
  if (product.description !== undefined)       r['description']         = product.description ?? null;
  return r;
}

// ─────────────────────────── INVENTORY ───────────────────────────

export function transformInventoryRecord(dbRow: InventoryRecordMigrationRow): InventoryRecord {
  return {
    id:               dbRow['id'],
    tenantId:         dbRow['tenant_id'],
    branchId:         dbRow['branch_id'],
    productId:        dbRow['product_id'],
    quantityOnHand:   dbRow['quantity_on_hand'],
    quantityReserved: dbRow['quantity_reserved'],
    lowStockThreshold: dbRow.low_stock_threshold,
    reorderLevel:      dbRow.reorder_level,
    lastUpdated:       dbRow.last_updated,
  };
}

export function inventoryRecordToDb(r: Partial<InventoryRecord>, tenantId: string): Record<string, unknown> {
  const out: Record<string, unknown> = { tenant_id: tenantId };
  if (r['id'])                          out['id']                = r['id'];
  if (r['branchId'])                    out['branch_id']         = r['branchId'];
  if (r['productId'])                   out['product_id']        = r['productId'];
  if (r['quantityOnHand']   !== undefined) out['quantity_on_hand']   = r['quantityOnHand'];
  if (r['quantityReserved'] !== undefined) out['quantity_reserved']  = r['quantityReserved'];
  if (r['lowStockThreshold'] !== undefined) out['low_stock_threshold'] = r['lowStockThreshold'];
  if (r['reorderLevel'] !== undefined) out['reorder_level'] = r['reorderLevel'];
  return out;
}

export function transformInventoryMovement(dbRow: InventoryMovementMigrationRow): InventoryMovement {
  return {
    id:           dbRow['id'],
    tenantId:     dbRow['tenant_id'],
    branchId:     dbRow['branch_id'],
    productId:    dbRow['product_id'],
    type:          dbRow.type,
    quantity:     dbRow['quantity'],
    // DB uses reference_type + reference_id, not a single "reference" string
    ...(dbRow['reference_type'] ? { referenceType: dbRow['reference_type'] } : {}),
    ...(dbRow['reference_id'] ? { referenceId: dbRow['reference_id'] } : {}),
    ...(dbRow['note'] ? { note: dbRow['note'] } : {}),
    performedBy:  dbRow['performed_by'],
    createdAt:    dbRow['created_at'],
  };
}

export function inventoryMovementToDb(m: Partial<InventoryMovement>, tenantId: string): Record<string, unknown> {
  const out: any = { tenant_id: tenantId };
  if (m['id'])            out.id             = m['id'];
  if (m['branchId'])      out.branch_id      = m['branchId'];
  if (m['productId'])     out.product_id     = m['productId'];
  if (m.type)             out.type           = m.type;
  if (m['quantity'] !== undefined) out.quantity = m['quantity'];
  if (m['referenceType']) out.reference_type = m['referenceType'];
  if (m['referenceId'] !== undefined) out.reference_id = m['referenceId'] ?? null;
  if (m['note']    !== undefined) out.note    = m['note'] ?? null;
  if (m['performedBy'])   out.performed_by   = m['performedBy'];
  return out;
}

export function transformStockBatch(dbRow: StockBatchMigrationRow): StockBatch {
  return {
    id:                dbRow['id'],
    tenantId:          dbRow['tenant_id'],
    branchId:          dbRow['branch_id'],
    productId:         dbRow['product_id'],
    batchNumber:       dbRow['batch_number'] ?? "",
    expiryDate:        dbRow['expiry_date']  ?? "",
    quantityReceived:  dbRow['quantity_received'],
    quantityRemaining: dbRow['quantity_remaining'],
    receivedAt:        dbRow['received_at'],
  };
}

export function stockBatchToDb(b: Partial<StockBatch>, tenantId: string): Record<string, unknown> {
  const out: any = { tenant_id: tenantId };
  if (b['id'])                           out.id                = b['id'];
  if (b['branchId'])                     out.branch_id         = b['branchId'];
  if (b['productId'])                    out.product_id        = b['productId'];
  if (b['batchNumber']    !== undefined) out.batch_number      = b['batchNumber']  ?? null;
  if (b['expiryDate']     !== undefined) out.expiry_date       = b['expiryDate']   ?? null;
  if (b['quantityReceived']  !== undefined) out.quantity_received  = b['quantityReceived'];
  if (b['quantityRemaining'] !== undefined) out.quantity_remaining = b['quantityRemaining'];
  if (b['receivedAt'])                   out.received_at       = b['receivedAt'];
  return out;
}

// ─────────────────────────── SALES ───────────────────────────────
// Column mapping follows supabase/migrations/20260114150000_create_customers_and_sales.sql.

export function transformSale(dbRow: Row<"sales">): Sale {
  return {
    id:          dbRow['id'],
    tenantId:    dbRow['tenant_id'],
    code:        dbRow['code'],
    branchId:    dbRow['branch_id'],
    salesRepId:  dbRow['sales_rep_id'],
    ...(dbRow['customer_id'] ? { customerId: dbRow['customer_id'] } : {}),
    ...(dbRow['order_id'] ? { orderId: dbRow['order_id'] } : {}),
    productId:   dbRow['product_id'],
    quantity:    dbRow['quantity'],
    unitPrice:   dbRow['unit_price'],
    saleDate:    dbRow['sale_date'],
    createdAt:   dbRow['created_at'],
    status:      dbRow['status'],
    ...(dbRow['walk_in_name'] ? { walkInName: dbRow['walk_in_name'] } : {}),
    ...(dbRow['walk_in_phone'] ? { walkInPhone: dbRow['walk_in_phone'] } : {}),
  };
}

export function saleToDb(sale: Partial<Sale>, tenantId: string): Record<string, unknown> {
  const out: any = { tenant_id: tenantId };
  if (sale['id'])                       out.id           = sale['id'];
  out.code = sale['code'] ?? `SAL-${globalThis.crypto.randomUUID()}`;
  if (sale['branchId'])                 out.branch_id    = sale['branchId'];
  if (sale['salesRepId'])               out.sales_rep_id = sale['salesRepId'];
  if (sale['customerId'] !== undefined) out.customer_id  = sale['customerId'] ?? null;
  if (sale['orderId'] !== undefined)    out.order_id     = sale['orderId'] ?? null;
  if (sale['productId'])                out.product_id   = sale['productId'];
  if (sale['quantity']   !== undefined) out.quantity     = sale['quantity'];
  if (sale['unitPrice']  !== undefined) out.unit_price   = sale['unitPrice'];
  if (sale['saleDate'])                 out.sale_date    = sale['saleDate'];
  if (sale['walkInName'] !== undefined) out.walk_in_name  = sale['walkInName'] ?? null;
  if (sale['walkInPhone'] !== undefined) out.walk_in_phone = sale['walkInPhone'] ?? null;
  if (sale['status'])                   out.status       = sale['status'];
  return out;
}

// ─────────────────────────── CUSTOMERS ───────────────────────────
// Column mapping follows supabase/migrations/20260114150000_create_customers_and_sales.sql.

export function transformCustomer(dbRow: CustomerMigrationRow): Customer {
  return {
    id:           dbRow['id'],
    tenantId:     dbRow['tenant_id'],
    branchId:     dbRow['branch_id'] ?? null,
    name:         dbRow['name'],
    contactPerson: dbRow['contact_person'],
    phone:        dbRow['phone']   ?? "",
    email:        dbRow['email']   ?? "",
    address:      dbRow['address'] ?? "",
    ...(dbRow['credit_limit'] !== null ? { creditLimit: dbRow['credit_limit'] } : {}),
    status:       dbRow['status'],
    createdBy:    dbRow['created_by'],
    createdAt:    dbRow['created_at'],
    updatedAt:    dbRow['updated_at'],
  };
}

export function customerToDb(c: Partial<Customer>, tenantId: string): Record<string, unknown> {
  const out: any = { tenant_id: tenantId };
  if (c['id'])                          out.id             = c['id'];
  if (c['branchId'])                    out.branch_id      = c['branchId'];
  if (c['name'])                        out.name           = c['name'];
  if (c['contactPerson'] !== undefined) out.contact_person = c['contactPerson'];
  if (c['phone']        !== undefined)  out.phone          = c['phone']  ?? null;
  if (c['email']        !== undefined)  out.email          = c['email']  ?? null;
  if (c['address']      !== undefined)  out.address        = c['address'] ?? null;
  if (c['creditLimit']  !== undefined)  out.credit_limit   = c['creditLimit'];
  if (c['status'])                      out.status         = c['status'];
  if (c['createdBy'])                   out.created_by     = c['createdBy'];
  return out;
}

// ─────────────────────────── CUSTOMER PAYMENTS ───────────────────
// DB schema: id, tenant_id, branch_id, customer_id, sales_rep_id,
//            amount, payment_method, reference_number, note, payment_date, created_at

export function transformCustomerPayment(dbRow: CustomerPaymentMigrationRow): CustomerPayment {
  return {
    id:            dbRow['id'],
    tenantId:      dbRow['tenant_id'],
    branchId:      dbRow['branch_id'],
    customerId:    dbRow['customer_id'],
    managerId:     dbRow['manager_id'],
    amount:        dbRow['amount'],
    method:        dbRow['method'],
    receivedBy:    dbRow['received_by'],
    ...(dbRow['order_id'] ? { orderId: dbRow['order_id'] } : {}),
    status:        dbRow['status'],
    submittedAt:   dbRow['submitted_at'],
    ...(dbRow['acknowledged_at'] ? { acknowledgedAt: dbRow['acknowledged_at'] } : {}),
    ...(dbRow['acknowledged_by'] ? { acknowledgedBy: dbRow['acknowledged_by'] } : {}),
    ...(dbRow['confirmed_at'] ? { confirmedAt: dbRow['confirmed_at'] } : {}),
    ...(dbRow['confirmed_by'] ? { confirmedBy: dbRow['confirmed_by'] } : {}),
    ...(dbRow['declined_at'] ? { declinedAt: dbRow['declined_at'] } : {}),
    ...(dbRow['declined_by'] ? { declinedBy: dbRow['declined_by'] } : {}),
    ...(dbRow['decline_reason'] ? { declineReason: dbRow['decline_reason'] } : {}),
    ...(dbRow['proof_name'] ? { proofName: dbRow['proof_name'] } : {}),
    ...(dbRow['reference'] ? { reference: dbRow['reference'] } : {}),
    ...(dbRow['note'] ? { note: dbRow['note'] } : {}),
    paymentDate:   dbRow['payment_date'],
    createdAt:     dbRow['created_at'],
    updatedAt:     dbRow['updated_at'],
  };
}

export function customerPaymentToDb(p: Partial<CustomerPayment>, tenantId: string): Record<string, unknown> {
  const out: any = { tenant_id: tenantId };
  if (p['id'])                          out.id               = p['id'];
  if (p['branchId'])                    out.branch_id        = p['branchId'];
  if (p['customerId'])                  out.customer_id      = p['customerId'];
  if (p['managerId'])                   out.manager_id       = p['managerId'];
  if (p['receivedBy'])                  out.received_by      = p['receivedBy'];
  if (p['orderId'] !== undefined)       out.order_id         = p['orderId'] ?? null;
  if (p['amount']     !== undefined)    out.amount           = p['amount'];
  if (p['method'])                      out.method           = p['method'];
  if (p['reference']  !== undefined)    out.reference        = p['reference']  ?? null;
  if (p['note']       !== undefined)    out.note             = p['note']       ?? null;
  if (p['paymentDate'])                 out.payment_date     = p['paymentDate'];
  return out;
}

// ─────────────────────────── PAYMENTS (rep) ──────────────────────
// DB schema: id, tenant_id, branch_id, sales_rep_id, period,
//            total_sales, cash_amount, transfer_amount, transfer_reference,
//            submitted_at, acknowledged_by/at, confirmed_by/at,
//            status, decline_reason, created_at

export function transformPayment(dbRow: PaymentMigrationRow): Payment {
  return {
    id:               dbRow['id'],
    tenantId:         dbRow['tenant_id'],
    branchId:         dbRow['branch_id'],
    salesRepId:       dbRow['sales_rep_id'],
    managerId:        dbRow['manager_id'],
    period:           dbRow['period'],
    cashAmount:       dbRow['cash_amount'],
    transferAmount:   dbRow['transfer_amount'],
    ...(dbRow['transfer_reference'] ? { transferReference: dbRow['transfer_reference'] } : {}),
    submittedAt:      dbRow['submitted_at'],
    ...(dbRow['acknowledged_by'] ? { acknowledgedBy: dbRow['acknowledged_by'] } : {}),
    ...(dbRow['acknowledged_at'] ? { acknowledgedAt: dbRow['acknowledged_at'] } : {}),
    ...(dbRow['confirmed_by'] ? { confirmedBy: dbRow['confirmed_by'] } : {}),
    ...(dbRow['confirmed_at'] ? { confirmedAt: dbRow['confirmed_at'] } : {}),
    status:           dbRow['status'],
    ...(dbRow['decline_reason'] ? { declineReason: dbRow['decline_reason'] } : {}),
    ...(dbRow['declined_at'] ? { declinedAt: dbRow['declined_at'] } : {}),
    ...(dbRow['declined_by'] ? { declinedBy: dbRow['declined_by'] } : {}),
    ...(dbRow['proof_name'] ? { proofName: dbRow['proof_name'] } : {}),
    ...(dbRow['note'] ? { note: dbRow['note'] } : {}),
    createdAt:        dbRow['created_at'],
    updatedAt:        dbRow['updated_at'],
  };
}

export function paymentToDb(p: Partial<Payment>, tenantId: string): Record<string, unknown> {
  const out: any = { tenant_id: tenantId };
  if (p['id'])                            out.id                 = p['id'];
  if (p['branchId'])                      out.branch_id          = p['branchId'];
  if (p['salesRepId'])                    out.sales_rep_id       = p['salesRepId'];
  if (p['period'])                        out.period             = p['period'];
  if (p['cashAmount']      !== undefined) out.cash_amount        = p['cashAmount'];
  if (p['transferAmount']  !== undefined) out.transfer_amount    = p['transferAmount'];
  if (p['transferReference'] !== undefined) out.transfer_reference = p['transferReference'] ?? null;
  if (p['submittedAt'])                   out.submitted_at       = p['submittedAt'];
  if (p['acknowledgedBy'] !== undefined)  out.acknowledged_by    = p['acknowledgedBy'] ?? null;
  if (p['acknowledgedAt'] !== undefined)  out.acknowledged_at    = p['acknowledgedAt'] ?? null;
  if (p['confirmedBy']    !== undefined)  out.confirmed_by       = p['confirmedBy']    ?? null;
  if (p['confirmedAt']    !== undefined)  out.confirmed_at       = p['confirmedAt']    ?? null;
  if (p['status'])                        out.status             = p['status'];
  if (p['declineReason'] !== undefined)   out.decline_reason     = p['declineReason']  ?? null;
  return out;
}

// ─────────────────────────── EXPENSES ────────────────────────────
// DB schema: id, tenant_id, branch_id, manager_id, category,
//            amount, description, receipt_url, expense_date, created_at

export function transformExpense(dbRow: ExpenseMigrationRow): Expense {
  return {
    id:          dbRow['id'],
    tenantId:    dbRow['tenant_id'],
    branchId:    dbRow['branch_id'],
    ...(dbRow['manager_id'] ? { managerId: dbRow['manager_id'] } : {}),
    category:    dbRow['category'],
    amount:      dbRow['amount'],
    ...(dbRow['owner_id'] ? { ownerId: dbRow['owner_id'] } : {}),
    description: dbRow['description'],
    ...(dbRow['note'] ? { note: dbRow['note'] } : {}),
    status:      dbRow['status'],
    expenseDate: dbRow['expense_date'],
    createdAt:   dbRow['created_at'],
    updatedAt:   dbRow['updated_at'],
  };
}

export function expenseToDb(e: Partial<Expense>, tenantId: string): Record<string, unknown> {
  const out: any = { tenant_id: tenantId };
  if (e['id'])                         out.id           = e['id'];
  if (e['branchId'])                   out.branch_id    = e['branchId'];
  if (e['managerId'])                  out.manager_id   = e['managerId'];
  if (e['category'])                   out.category     = e['category'];
  if (e['amount']     !== undefined)   out.amount       = e['amount'];
  if (e['description'] !== undefined)  out.description  = e['description'] ?? null;
  if (e['ownerId'])                    out.owner_id     = e['ownerId'];
  if (e['note']       !== undefined)   out.note         = e['note'] ?? null;
  if (e['status'])                     out.status       = e['status'];
  if (e['expenseDate'])                out.expense_date = e['expenseDate'];
  return out;
}

// ─────────────────────────── MANAGER REMITTANCES ─────────────────

export function transformManagerRemittance(dbRow: ManagerRemittanceMigrationRow): import("@/data/mock-db").ManagerRemittance {
  return {
    id:                dbRow['id'],
    tenantId:          dbRow['tenant_id'],
    branchId:          dbRow['branch_id'],
    managerId:         dbRow['manager_id'],
    period:            dbRow['period'],
    totalReceived:     dbRow['total_received'],
    expenseAmount:     dbRow['expense_amount'],
    netRemittanceDue:  dbRow['net_remittance_due'],
    cashAmount:        dbRow['cash_amount'],
    transferAmount:    dbRow['transfer_amount'],
    ...(dbRow['transfer_reference'] ? { transferReference: dbRow['transfer_reference'] } : {}),
    ...(dbRow['submitted_at'] ? { submittedAt: dbRow['submitted_at'] } : {}),
    ...(dbRow['confirmed_by'] ? { confirmedBy: dbRow['confirmed_by'] } : {}),
    ...(dbRow['confirmed_at'] ? { confirmedAt: dbRow['confirmed_at'] } : {}),
    status:            dbRow['status'],
    ...(dbRow['declined_at'] ? { declinedAt: dbRow['declined_at'] } : {}),
    ...(dbRow['declined_by'] ? { declinedBy: dbRow['declined_by'] } : {}),
    ...(dbRow['decline_reason'] ? { declineReason: dbRow['decline_reason'] } : {}),
    ...(dbRow['note'] ? { note: dbRow['note'] } : {}),
    outstandingAmount: dbRow['outstanding_amount'],
    paymentIds:        dbRow['payment_ids'] as string[],
    expenseIds:        dbRow['expense_ids'] as string[],
    createdAt:         dbRow['created_at'],
    updatedAt:         dbRow['updated_at'],
  };
}

// ─────────────────────────── OWNER REMITTANCES ───────────────────

export function transformOwnerRemittance(dbRow: OwnerRemittanceMigrationRow): OwnerRemittance {
  return {
    id:              dbRow.id,
    tenantId:        dbRow.tenant_id,
    payeeType:       dbRow.payee_type,
    payeeName:       dbRow.payee_name,
    amount:          dbRow.amount,
    paymentMethod:   dbRow.payment_method,
    ...(dbRow.reference ? { reference: dbRow.reference } : {}),
    purpose:         dbRow.purpose,
    remittanceDate:  dbRow.remittance_date,
    ownerId:         dbRow.created_by,
    createdAt:       dbRow.created_at,
    updatedAt:       dbRow.updated_at,
  };
}

// ─────────────────────────── STOCK REQUESTS ──────────────────────

export function transformStockRequest(dbRow: StockRequestMigrationRow): StockRequest {
  return {
    id:                dbRow.id,
    tenantId:          dbRow.tenant_id,
    branchId:          dbRow.branch_id,
    repId:              dbRow.rep_id,
    productId:         dbRow.product_id,
    quantityRequested: dbRow.quantity_requested,
    ...(dbRow.quantity_approved !== null ? { quantityApproved: dbRow.quantity_approved } : {}),
    ...(dbRow.quantity_fulfilled !== null ? { quantityFulfilled: dbRow.quantity_fulfilled } : {}),
    priority:          dbRow.priority,
    requestedAt:       dbRow.requested_at,
    ...(dbRow.approved_at ? { approvedAt: dbRow.approved_at } : {}),
    ...(dbRow.rejected_at ? { rejectedAt: dbRow.rejected_at } : {}),
    ...(dbRow.processed_by ? { processedBy: dbRow.processed_by } : {}),
    status:            dbRow.status,
    ...(dbRow.approved_by ? { approvedBy: dbRow.approved_by } : {}),
    ...(dbRow.fulfilled_by ? { fulfilledBy: dbRow.fulfilled_by } : {}),
    ...(dbRow.fulfilled_at ? { fulfilledAt: dbRow.fulfilled_at } : {}),
    ...(dbRow.rejection_reason ? { rejectionReason: dbRow.rejection_reason } : {}),
    ...(dbRow.batch_id ? { batchId: dbRow.batch_id } : {}),
    ...(dbRow.acknowledged_at ? { acknowledgedAt: dbRow.acknowledged_at } : {}),
    ...(dbRow.acknowledged_by ? { acknowledgedBy: dbRow.acknowledged_by } : {}),
    ...(dbRow.note ? { note: dbRow.note } : {}),
  };
}

export function stockRequestToDb(r: Partial<StockRequest>, tenantId: string): Record<string, unknown> {
  const out: any = { tenant_id: tenantId };
  if (r['id'])                              out.id                 = r['id'];
  if (r['branchId'])                        out.branch_id          = r['branchId'];
  if (r['repId'])                           out.rep_id              = r['repId'];
  if (r['productId'])                       out.product_id         = r['productId'];
  if (r['quantityRequested'] !== undefined) out.quantity_requested = r['quantityRequested'];
  if (r['quantityApproved']  !== undefined) out.quantity_approved  = r['quantityApproved']  ?? null;
  if (r['quantityFulfilled'] !== undefined) out.quantity_fulfilled = r['quantityFulfilled'] ?? null;
  if (r['priority'])                       out.priority            = r['priority'];
  if (r['requestedAt'])                    out.requested_at         = r['requestedAt'];
  if (r['approvedAt'] !== undefined)       out.approved_at          = r['approvedAt'] ?? null;
  if (r['rejectedAt'] !== undefined)       out.rejected_at          = r['rejectedAt'] ?? null;
  if (r['processedBy'] !== undefined)      out.processed_by         = r['processedBy'] ?? null;
  if (r['approvedBy'] !== undefined)       out.approved_by          = r['approvedBy'] ?? null;
  if (r['batchId'] !== undefined)          out.batch_id             = r['batchId'] ?? null;
  if (r['acknowledgedAt'] !== undefined)   out.acknowledged_at      = r['acknowledgedAt'] ?? null;
  if (r['acknowledgedBy'] !== undefined)   out.acknowledged_by      = r['acknowledgedBy'] ?? null;
  if (r['note'] !== undefined)             out.note                 = r['note'] ?? null;
  if (r['status'])                          out.status             = r['status'];
  if (r['fulfilledBy']  !== undefined)      out.fulfilled_by       = r['fulfilledBy']  ?? null;
  if (r['fulfilledAt']  !== undefined)      out.fulfilled_at       = r['fulfilledAt']  ?? null;
  if (r['rejectionReason'] !== undefined)   out.rejection_reason   = r['rejectionReason'] ?? null;
  return out;
}

// ─────────────────────────── TARGETS ─────────────────────────────

export function transformTarget(dbRow: Row<"targets">): Target {
  return {
    id:           dbRow['id'],
    tenantId:     dbRow['tenant_id'],
    scope:        dbRow['scope'],
    branchId:     dbRow['branch_id'],
    userId:       dbRow['user_id']     ?? null,
    month:        dbRow['month'],
    amount:       dbRow['amount'],
    createdAt:    dbRow['created_at'],
    updatedAt:    dbRow['updated_at'],
  };
}

export function targetToDb(t: Partial<Target>, tenantId: string): Record<string, unknown> {
  const out: any = { tenant_id: tenantId };
  if (t['id'])                        out.id            = t['id'];
  if (t['scope']     !== undefined)   out.scope         = t['scope'];
  if (t['branchId']  !== undefined)   out.branch_id     = t['branchId'];
  if (t['userId']    !== undefined)   out.user_id       = t['userId']    ?? null;
  if (t['month'])                     out.month         = t['month'];
  if (t['amount'] !== undefined)      out.amount        = t['amount'];
  return out;
}

// ─────────────────────────── APPROVALS ───────────────────────────

export function transformApprovalRequest(dbRow: ApprovalRequestMigrationRow): ApprovalRequest {
  return {
    id:              dbRow['id'],
    tenantId:        dbRow['tenant_id'],
    branchId:        dbRow['branch_id'],
    type:            dbRow.type,
    requestedBy:     dbRow.requested_by,
    requestedAt:     dbRow.requested_at,
    status:          dbRow['status'],
    ...(dbRow['reviewed_by'] ? { reviewedBy: dbRow['reviewed_by'] } : {}),
    ...(dbRow['reviewed_at'] ? { reviewedAt: dbRow['reviewed_at'] } : {}),
    ...(dbRow['rejection_reason'] ? { rejectionReason: dbRow['rejection_reason'] } : {}),
    ...(dbRow.note ? { note: dbRow.note } : {}),
    ...(dbRow.emergency !== null ? { emergency: dbRow.emergency } : {}),
    ...(dbRow.emergency_reason ? { emergencyReason: dbRow.emergency_reason } : {}),
    ...(dbRow.applied_at ? { appliedAt: dbRow.applied_at } : {}),
    ...(dbRow.product_id ? { productId: dbRow.product_id } : {}),
    ...(dbRow.quantity !== null ? { quantity: dbRow.quantity } : {}),
    ...(dbRow.batch_number ? { batchNumber: dbRow.batch_number } : {}),
    ...(dbRow.expiry_date ? { expiryDate: dbRow.expiry_date } : {}),
    ...(dbRow.member_data && typeof dbRow.member_data === "object" ? { member: dbRow.member_data as NonNullable<ApprovalRequest["member"]> } : {}),
  };
}

export function approvalRequestToDb(a: Partial<ApprovalRequest>, tenantId: string): Record<string, unknown> {
  const out: any = { tenant_id: tenantId };
  if (a['id'])                              out.id               = a['id'];
  if (a['branchId'])                        out.branch_id        = a['branchId'];
  if (a['requestedBy'])                     out.requested_by      = a['requestedBy'];
  if (a['type'])                            out.type              = a['type'];
  if (a['requestedAt'])                     out.requested_at      = a['requestedAt'];
  if (a['status'])                          out.status           = a['status'];
  if (a['reviewedBy']      !== undefined)   out.reviewed_by      = a['reviewedBy']       ?? null;
  if (a['reviewedAt']      !== undefined)   out.reviewed_at      = a['reviewedAt']       ?? null;
  if (a['rejectionReason'] !== undefined)   out.rejection_reason = a['rejectionReason']  ?? null;
  if (a.note !== undefined)                 out.note              = a.note ?? null;
  if (a.emergency !== undefined)            out.emergency         = a.emergency;
  if (a.emergencyReason !== undefined)      out.emergency_reason  = a.emergencyReason ?? null;
  if (a.appliedAt !== undefined)            out.applied_at        = a.appliedAt ?? null;
  if (a.productId !== undefined)            out.product_id        = a.productId ?? null;
  if (a.quantity !== undefined)             out.quantity          = a.quantity ?? null;
  if (a.batchNumber !== undefined)          out.batch_number      = a.batchNumber ?? null;
  if (a.expiryDate !== undefined)           out.expiry_date       = a.expiryDate ?? null;
  if (a.member !== undefined)               out.member_data       = a.member ?? null;
  return out;
}

// ─────────────────────────── NOTIFICATIONS ───────────────────────
// DB schema: recipient_id (not user_id), read_at (timestamp, not bool), entity_type +
// entity_id + message + type (CHECK-constrained to specific onboarding/payment/stock
// notification types). No title / action_url columns.

export function transformNotification(dbRow: NotificationMigrationRow): AppNotification {
  return {
    id:        dbRow['id'],
    tenantId:  dbRow['tenant_id'],
    recipientId: dbRow['recipient_id'],
    type:      dbRow['type'],
    entityType: dbRow['entity_type'],
    entityId: dbRow['entity_id'],
    message:   dbRow['message'],
    ...(dbRow['read_at'] ? { readAt: dbRow['read_at'] } : {}),
    createdAt: dbRow['created_at'],
  };
}

export function notificationToDb(n: Partial<AppNotification>, tenantId: string): Record<string, unknown> {
  const out: any = { tenant_id: tenantId };
  if (n['id'])                       out.id         = n['id'];
  if (n['recipientId'])              out.recipient_id = n['recipientId'];
  if (n['type'])                     out.type       = n['type'];
  if (n['entityType'])               out.entity_type = n['entityType'];
  if (n['entityId'])                 out.entity_id  = n['entityId'];
  if (n['message'])                  out.message    = n['message'];
  if (n['readAt'] !== undefined)     out.read_at    = n['readAt'] ?? null;
  return out;
}

// ─────────────────────────── ACTIVITIES (audit) ──────────────────
// DB schema: action, subject, actor_id, entity (CHECK-constrained), entity_id, emergency,
// metadata. The create_audit_log() RPC is the canonical writer.

export function transformActivity(dbRow: Row<"activities">): Activity {
  return {
    id:         dbRow['id'],
    tenantId:   dbRow['tenant_id'],
    actorId:    dbRow['actor_id'],
    action:     dbRow['action'],
    subject:    dbRow['subject'],
    entity:     dbRow['entity'],
    ...(dbRow['entity_id'] ? { entityId: dbRow['entity_id'] } : {}),
    emergency:  dbRow['emergency'] ?? false,
    ...(dbRow['metadata'] && typeof dbRow['metadata'] === "object" ? { metadata: dbRow['metadata'] as NonNullable<Activity["metadata"]> } : {}),
    createdAt:  dbRow['created_at'],
  };
}

export function activityToDb(a: Partial<Activity>, tenantId: string): Record<string, unknown> {
  const out: any = { tenant_id: tenantId };
  if (a['id'])                          out.id           = a['id'];
  if (a['actorId'])                     out.actor_id     = a['actorId'];
  if (a['action'])                     out.action       = a['action'];
  if (a['subject'])                    out.subject      = a['subject'];
  if (a['entity'])                     out.entity       = a['entity'];
  if (a['entityId'] !== undefined)     out.entity_id    = a['entityId'] ?? null;
  if (a['emergency'] !== undefined)    out.emergency    = a['emergency'] ?? null;
  if (a['metadata'] !== undefined)     out.metadata     = a['metadata'] ?? null;
  return out;
}

// ─────────────────────────── ONBOARDINGS ─────────────────────────
// Invite-first flow. token_hash holds the SHA-256 of the raw invite token (raw token is
// never stored). user_id is NULL until the invitee signs up (handle_new_user). status:
// invited | in_progress | submitted | approved | rejected.

export function transformOnboarding(dbRow: OnboardingMigrationRow): Onboarding {
  return {
    id: dbRow['id'],
    tenantId: dbRow['tenant_id'],
    userId: dbRow['user_id'] ?? "",
    employeeId: dbRow['employee_id'],
    jobTitle: dbRow['job_title'],
    department: dbRow['department'],
    startDate: dbRow['start_date'],
    status: dbRow['status'],
    token: "",
    tokenExpiresAt: dbRow['token_expires_at'],
    tokenRevoked: dbRow['token_revoked'],
    tokenUsed: dbRow['used_at'] !== null,
    step: dbRow['step'],
    data: (dbRow['data'] ?? {}) as EmployeeData,
    photo: null,
    credentials: [],
    passwordSet: dbRow['user_id'] !== null,
    correctionNote: dbRow['correction_note'] ?? undefined,
    guarantorStatus: dbRow['guarantor_status'],
    guarantorToken: dbRow['guarantor_token'],
    guarantorResponse: dbRow['guarantor_response'] as Onboarding["guarantorResponse"],
    guarantorDecision: dbRow['guarantor_decision'] ?? undefined,
    guarantorDecisionReason: dbRow['guarantor_decision_reason'] ?? undefined,
    guarantorDecidedAt: dbRow['guarantor_decided_at'] ?? undefined,
    createdAt: dbRow['created_at'],
    ...(dbRow['submitted_at'] ? { submittedAt: dbRow['submitted_at'] } : {}),
    ...(dbRow['activated_at'] ? { activatedAt: dbRow['activated_at'] } : {}),
  };
}

export function onboardingToDb(o: Partial<Onboarding>, tenantId: string): Record<string, unknown> {
  const out: any = { tenant_id: tenantId };
  if (o['id'])                         out.id               = o['id'];
  if (o['userId'] !== undefined)        out.user_id          = o['userId'] ?? null;
  if (o['employeeId'])                  out.employee_id      = o['employeeId'];
  if (o['jobTitle'] !== undefined)       out.job_title        = o['jobTitle'];
  if (o['department'] !== undefined)     out.department       = o['department'];
  if (o['startDate'] !== undefined)      out.start_date       = o['startDate'];
  if (o['status'])                       out.status           = o['status'];
  if (o['tokenExpiresAt'])              out.token_expires_at = o['tokenExpiresAt'];
  if (o['tokenRevoked'] !== undefined)   out.token_revoked    = o['tokenRevoked'];
  if (o['step'] !== undefined)           out.step             = o['step'];
  if (o['data'] !== undefined)           out.data             = o['data'];
  if (o['correctionNote'] !== undefined) out.correction_note = o['correctionNote'] ?? null;
  if (o['guarantorStatus'])              out.guarantor_status = o['guarantorStatus'];
  if (o['guarantorToken'] !== undefined) out.guarantor_token = o['guarantorToken'] ?? null;
  if (o['guarantorResponse'] !== undefined) out.guarantor_response = o['guarantorResponse'] ?? null;
  if (o['guarantorDecision'] !== undefined) out.guarantor_decision = o['guarantorDecision'] ?? null;
  if (o['guarantorDecisionReason'] !== undefined) out.guarantor_decision_reason = o['guarantorDecisionReason'] ?? null;
  if (o['guarantorDecidedAt'] !== undefined) out.guarantor_decided_at = o['guarantorDecidedAt'] ?? null;
  if (o['submittedAt'] !== undefined)    out.submitted_at    = o['submittedAt'] ?? null;
  if (o['activatedAt'] !== undefined)    out.activated_at    = o['activatedAt'] ?? null;
  return out;
}

export function transformOnboardingFile(dbRow: Row<"onboarding_files">): StoredFile {
  return {
    id:           dbRow['id'],
    name:         dbRow['file_name'],
    type:         dbRow['mime_type'],
    size:         dbRow['file_size'],
    dataUrl:      dbRow['cloudinary_url'],
    path:         dbRow['cloudinary_url'],
  };
}
