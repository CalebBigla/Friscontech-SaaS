/**
 * Type Adapters
 *
 * Transform between database rows (snake_case) and app objects (camelCase).
 * Every transformer references only columns that actually exist in database.types.ts.
 */

import type { Row } from "@/lib/supabase-helpers";
import type { Branch, BranchStatus, User, Product, ProductStatus } from "@/data/mock-db";

// ─────────────────────────── BRANCHES ────────────────────────────

export function transformBranch(dbRow: Row<"branches">): Branch {
  return {
    id:           dbRow.id,
    tenantId:     dbRow.tenant_id,
    name:         dbRow.name,
    code:         dbRow.code,
    location:     dbRow.location,
    address:      dbRow.address,
    phone:        dbRow.phone,
    email:        dbRow.email,
    status:       dbRow.status as BranchStatus,
    managerId:    dbRow.manager_id ?? null,
    createdAt:    dbRow.created_at,
  };
}

export function branchToDb(branch: Partial<Branch>, tenantId: string): any {
  const r: any = { tenant_id: tenantId };
  if (branch.id)                          r.id              = branch.id;
  if (branch.name)                        r.name            = branch.name;
  if (branch.code)                        r.code            = branch.code;
  if (branch.location  !== undefined)     r.location        = branch.location;
  if (branch.address   !== undefined)     r.address         = branch.address;
  if (branch.phone     !== undefined)     r.phone           = branch.phone;
  if (branch.email     !== undefined)     r.email           = branch.email;
  if (branch.status)                      r.status          = branch.status;
  if (branch.managerId !== undefined)     r.manager_id      = branch.managerId || null;
  return r;
}

// ─────────────────────────── USERS ───────────────────────────────
// users.id IS the auth.users id (no separate auth_id column).
// role is NULL for a pending onboarding-created profile (set at approval).
// status: active | inactive | pending | rejected | suspended.

export function transformUser(dbRow: Row<"users">): User {
  const firstName = dbRow.first_name ?? "";
  const lastName  = dbRow.last_name  ?? "";
  return {
    id:            dbRow.id,
    tenantId:      dbRow.tenant_id,
    name:          [firstName, lastName].filter(Boolean).join(" ") || dbRow.email || "User",
    firstName,
    lastName,
    email:         dbRow.email   ?? "",
    phone:         dbRow.phone   ?? null,
    role:          (dbRow.role ?? "sales_rep") as any,
    status:        dbRow.status  as any,
    branchId:      dbRow.branch_id ?? null,
    managerId:     dbRow.manager_id ?? null,
    joinedAt:      dbRow.joined_at,
    deactivatedAt: dbRow.deactivated_at ?? null,
    authId:        dbRow.id, // id is the auth id
    createdAt:     dbRow.joined_at ?? dbRow.created_at ?? "",
  };
}

export function userToDb(user: Partial<User>, tenantId: string): any {
  const r: any = { tenant_id: tenantId };
  if (user.id)                          r.id               = user.id;
  if (user.branchId  !== undefined)     r.branch_id        = user.branchId  ?? null;
  if (user.firstName)                   r.first_name       = user.firstName;
  if (user.lastName)                    r.last_name        = user.lastName;
  if (user.email    !== undefined)      r.email            = user.email;
  if (user.phone    !== undefined)      r.phone            = user.phone     ?? null;
  if (user.role     !== undefined)      r.role             = user.role;
  if (user.status)                      r.status           = user.status;
  if (user.managerId !== undefined)     r.manager_id       = user.managerId ?? null;
  if (user.joinedAt)                    r.joined_at        = user.joinedAt;
  if (user.deactivatedAt !== undefined) r.deactivated_at   = user.deactivatedAt ?? null;
  return r;
}

// ─────────────────────────── USER PREFERENCES ────────────────────

export function transformPreference(dbRow: Row<"user_preferences">): any {
  return {
    userId:              dbRow['user_id'],
    dateFormat:          dbRow['date_format'],
    defaultReportPeriod: dbRow['report_period'],
    updatedAt:           dbRow['updated_at'],
  };
}

export function preferenceToDb(pref: Partial<any>, userId: string): any {
  const r: any = { user_id: userId };
  if (pref['dateFormat'])          r.date_format   = pref['dateFormat'];
  if (pref['reportPeriod'])        r.report_period = pref['reportPeriod'];
  if (pref['defaultReportPeriod']) r.report_period = pref['defaultReportPeriod'];
  return r;
}

// ─────────────────────────── PRODUCTS ────────────────────────────

export function transformProduct(dbRow: Row<"products">): Product {
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

export function productToDb(product: Partial<Product>, tenantId: string): any {
  const r: any = { tenant_id: tenantId };
  if (product.id)                           r.id                  = product.id;
  if (product.name)                         r.name                = product.name;
  if (product.sku)                          r.sku                 = product.sku;
  if (product.category)                     r.category            = product.category;
  if (product.unit)                         r.unit                = product.unit;
  if (product.unitCost     !== undefined)   r.unit_cost           = product.unitCost;
  if (product.unitPrice    !== undefined)   r.unit_price          = product.unitPrice;
  if (product.status)                       r.status              = product.status;
  if ((product as any).lowStockThreshold !== undefined) r.low_stock_threshold = (product as any).lowStockThreshold ?? null;
  if ((product as any).description !== undefined)       r.description         = (product as any).description ?? null;
  return r;
}

// ─────────────────────────── INVENTORY ───────────────────────────

export function transformInventoryRecord(dbRow: Row<"inventory_records">): any {
  return {
    id:               dbRow['id'],
    tenantId:         dbRow['tenant_id'],
    branchId:         dbRow['branch_id'],
    productId:        dbRow['product_id'],
    quantityOnHand:   dbRow['quantity_on_hand'],
    quantityReserved: dbRow['quantity_reserved'],
    updatedAt:        dbRow['last_updated'],
  };
}

export function inventoryRecordToDb(r: Partial<any>, tenantId: string): any {
  const out: any = { tenant_id: tenantId };
  if (r['id'])                          out.id                = r['id'];
  if (r['branchId'])                    out.branch_id         = r['branchId'];
  if (r['productId'])                   out.product_id        = r['productId'];
  if (r['quantityOnHand']   !== undefined) out.quantity_on_hand   = r['quantityOnHand'];
  if (r['quantityReserved'] !== undefined) out.quantity_reserved  = r['quantityReserved'];
  return out;
}

export function transformInventoryMovement(dbRow: Row<"inventory_movements">): any {
  return {
    id:           dbRow['id'],
    tenantId:     dbRow['tenant_id'],
    branchId:     dbRow['branch_id'],
    productId:    dbRow['product_id'],
    movementType: dbRow['movement_type'],
    quantity:     dbRow['quantity'],
    // DB uses reference_type + reference_id, not a single "reference" string
    referenceType: dbRow['reference_type'] ?? undefined,
    referenceId:   dbRow['reference_id']   ?? undefined,
    note:          dbRow['note']           ?? undefined,
    performedBy:  dbRow['performed_by'],
    createdAt:    dbRow['created_at'],
  };
}

export function inventoryMovementToDb(m: Partial<any>, tenantId: string): any {
  const out: any = { tenant_id: tenantId };
  if (m['id'])            out.id             = m['id'];
  if (m['branchId'])      out.branch_id      = m['branchId'];
  if (m['productId'])     out.product_id     = m['productId'];
  if (m['movementType'])  out.movement_type  = m['movementType'];
  if (m['quantity'] !== undefined) out.quantity = m['quantity'];
  if (m['referenceType']) out.reference_type = m['referenceType'];
  if (m['referenceId'] !== undefined) out.reference_id = m['referenceId'] ?? null;
  if (m['note']    !== undefined) out.note    = m['note'] ?? null;
  if (m['performedBy'])   out.performed_by   = m['performedBy'];
  return out;
}

export function transformStockBatch(dbRow: Row<"stock_batches">): any {
  return {
    id:                dbRow['id'],
    tenantId:          dbRow['tenant_id'],
    branchId:          dbRow['branch_id'],
    productId:         dbRow['product_id'],
    batchNumber:       dbRow['batch_number'] ?? undefined,
    expiryDate:        dbRow['expiry_date']  ?? undefined,
    quantityReceived:  dbRow['quantity_received'],
    quantityRemaining: dbRow['quantity_remaining'],
    receivedAt:        dbRow['received_at'],
  };
}

export function stockBatchToDb(b: Partial<any>, tenantId: string): any {
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

export function transformSale(dbRow: Row<"sales">): any {
  return {
    id:          dbRow['id'],
    tenantId:    dbRow['tenant_id'],
    code:        dbRow['code'],
    branchId:    dbRow['branch_id'],
    salesRepId:  dbRow['sales_rep_id'],
    customerId:  dbRow['customer_id'] ?? undefined,
    orderId:     dbRow['order_id'] ?? undefined,
    productId:   dbRow['product_id'],
    quantity:    dbRow['quantity'],
    unitPrice:   dbRow['unit_price'],
    saleDate:    dbRow['sale_date'],
    createdAt:   dbRow['created_at'],
    status:      dbRow['status'],
    walkInName:  dbRow['walk_in_name'] ?? undefined,
    walkInPhone: dbRow['walk_in_phone'] ?? undefined,
  };
}

export function saleToDb(sale: Partial<any>, tenantId: string): any {
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

export function transformCustomer(dbRow: Row<"customers">): any {
  return {
    id:           dbRow['id'],
    tenantId:     dbRow['tenant_id'],
    branchId:     dbRow['branch_id'] ?? null,
    name:         dbRow['name'],
    contactPerson: dbRow['contact_person'],
    phone:        dbRow['phone']   ?? "",
    email:        dbRow['email']   ?? "",
    address:      dbRow['address'] ?? "",
    creditLimit:  dbRow['credit_limit'] ?? undefined,
    status:       dbRow['status'],
    createdBy:    dbRow['created_by'],
    createdAt:    dbRow['created_at'],
  };
}

export function customerToDb(c: Partial<any>, tenantId: string): any {
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

export function transformCustomerPayment(dbRow: Row<"customer_payments">): any {
  return {
    id:            dbRow['id'],
    tenantId:      dbRow['tenant_id'],
    branchId:      dbRow['branch_id'],
    customerId:    dbRow['customer_id'],
    salesRepId:    dbRow['sales_rep_id'],
    amount:        dbRow['amount'],
    paymentMethod: dbRow['payment_method'],
    reference:     dbRow['reference_number'] ?? undefined,
    note:          dbRow['note']             ?? undefined,
    paymentDate:   dbRow['payment_date'],
    createdAt:     dbRow['created_at'],
  };
}

export function customerPaymentToDb(p: Partial<any>, tenantId: string): any {
  const out: any = { tenant_id: tenantId };
  if (p['id'])                          out.id               = p['id'];
  if (p['branchId'])                    out.branch_id        = p['branchId'];
  if (p['customerId'])                  out.customer_id      = p['customerId'];
  if (p['salesRepId'])                  out.sales_rep_id     = p['salesRepId'];
  if (p['amount']     !== undefined)    out.amount           = p['amount'];
  if (p['paymentMethod'])               out.payment_method   = p['paymentMethod'];
  if (p['reference']  !== undefined)    out.reference_number = p['reference']  ?? null;
  if (p['note']       !== undefined)    out.note             = p['note']       ?? null;
  if (p['paymentDate'])                 out.payment_date     = p['paymentDate'];
  return out;
}

// ─────────────────────────── PAYMENTS (rep) ──────────────────────
// DB schema: id, tenant_id, branch_id, sales_rep_id, period,
//            total_sales, cash_amount, transfer_amount, transfer_reference,
//            submitted_at, acknowledged_by/at, confirmed_by/at,
//            status, decline_reason, created_at

export function transformPayment(dbRow: Row<"payments">): any {
  return {
    id:               dbRow['id'],
    tenantId:         dbRow['tenant_id'],
    branchId:         dbRow['branch_id'],
    salesRepId:       dbRow['sales_rep_id'],
    period:           dbRow['period'],
    totalSales:       dbRow['total_sales'],
    cashAmount:       dbRow['cash_amount'],
    transferAmount:   dbRow['transfer_amount'],
    transferReference: dbRow['transfer_reference'] ?? undefined,
    submittedAt:      dbRow['submitted_at'],
    acknowledgedBy:   dbRow['acknowledged_by'] ?? undefined,
    acknowledgedAt:   dbRow['acknowledged_at'] ?? undefined,
    confirmedBy:      dbRow['confirmed_by']    ?? undefined,
    confirmedAt:      dbRow['confirmed_at']    ?? undefined,
    status:           dbRow['status'],
    declineReason:    dbRow['decline_reason']  ?? undefined,
    createdAt:        dbRow['created_at'],
  };
}

export function paymentToDb(p: Partial<any>, tenantId: string): any {
  const out: any = { tenant_id: tenantId };
  if (p['id'])                            out.id                 = p['id'];
  if (p['branchId'])                      out.branch_id          = p['branchId'];
  if (p['salesRepId'])                    out.sales_rep_id       = p['salesRepId'];
  if (p['period'])                        out.period             = p['period'];
  if (p['totalSales']      !== undefined) out.total_sales        = p['totalSales'];
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

export function transformExpense(dbRow: Row<"expenses">): any {
  return {
    id:          dbRow['id'],
    tenantId:    dbRow['tenant_id'],
    branchId:    dbRow['branch_id'],
    managerId:   dbRow['manager_id'],
    category:    dbRow['category'],
    amount:      dbRow['amount'],
    description: dbRow['description'] ?? undefined,
    receiptUrl:  dbRow['receipt_url']  ?? undefined,
    expenseDate: dbRow['expense_date'],
    createdAt:   dbRow['created_at'],
  };
}

export function expenseToDb(e: Partial<any>, tenantId: string): any {
  const out: any = { tenant_id: tenantId };
  if (e['id'])                         out.id           = e['id'];
  if (e['branchId'])                   out.branch_id    = e['branchId'];
  if (e['managerId'])                  out.manager_id   = e['managerId'];
  if (e['category'])                   out.category     = e['category'];
  if (e['amount']     !== undefined)   out.amount       = e['amount'];
  if (e['description'] !== undefined)  out.description  = e['description'] ?? null;
  if (e['receiptUrl']  !== undefined)  out.receipt_url  = e['receiptUrl']  ?? null;
  if (e['expenseDate'])                out.expense_date = e['expenseDate'];
  return out;
}

// ─────────────────────────── MANAGER REMITTANCES ─────────────────

export function transformManagerRemittance(dbRow: Row<"manager_remittances">): any {
  return {
    id:                dbRow['id'],
    tenantId:          dbRow['tenant_id'],
    branchId:          dbRow['branch_id'],
    managerId:         dbRow['manager_id'],
    period:            dbRow['period'],
    totalReceived:     dbRow['total_received'],
    totalExpenses:     dbRow['total_expenses'],
    netRemittance:     dbRow['net_remittance'],
    cashAmount:        dbRow['cash_amount'],
    transferAmount:    dbRow['transfer_amount'],
    transferReference: dbRow['transfer_reference'] ?? undefined,
    submittedAt:       dbRow['submitted_at'],
    reviewedBy:        dbRow['reviewed_by']  ?? undefined,
    reviewedAt:        dbRow['reviewed_at']  ?? undefined,
    status:            dbRow['status'],
    rejectReason:      dbRow['reject_reason'] ?? undefined,
    createdAt:         dbRow['created_at'],
  };
}

// ─────────────────────────── OWNER REMITTANCES ───────────────────

export function transformOwnerRemittance(dbRow: Row<"owner_remittances">): any {
  return {
    id:              dbRow.id,
    tenantId:        dbRow.tenant_id,
    payeeType:       dbRow.payee_type,
    payeeName:       dbRow.payee_name,
    amount:          dbRow.amount,
    paymentMethod:   dbRow.payment_method,
    referenceNumber: dbRow.reference_number ?? undefined,
    description:     dbRow.description      ?? undefined,
    paymentDate:     dbRow.payment_date,
    createdBy:       dbRow.created_by,
    createdAt:       dbRow.created_at,
  };
}

// ─────────────────────────── STOCK REQUESTS ──────────────────────

export function transformStockRequest(dbRow: Row<"stock_requests">): any {
  return {
    id:                dbRow.id,
    tenantId:          dbRow.tenant_id,
    branchId:          dbRow.branch_id,
    requesterId:       dbRow.requester_id,
    productId:         dbRow.product_id,
    quantityRequested: dbRow.quantity_requested,
    quantityApproved:  dbRow.quantity_approved  ?? undefined,
    quantityIssued:    dbRow.quantity_issued     ?? undefined,
    requestReason:     dbRow.request_reason      ?? undefined,
    status:            dbRow.status,
    reviewedBy:        dbRow.reviewed_by         ?? undefined,
    reviewedAt:        dbRow.reviewed_at         ?? undefined,
    fulfilledBy:       dbRow.fulfilled_by        ?? undefined,
    fulfilledAt:       dbRow.fulfilled_at        ?? undefined,
    rejectionReason:   dbRow.rejection_reason    ?? undefined,
    createdAt:         dbRow.created_at,
  };
}

export function stockRequestToDb(r: Partial<any>, tenantId: string): any {
  const out: any = { tenant_id: tenantId };
  if (r['id'])                              out.id                 = r['id'];
  if (r['branchId'])                        out.branch_id          = r['branchId'];
  if (r['requesterId'])                     out.requester_id       = r['requesterId'];
  if (r['productId'])                       out.product_id         = r['productId'];
  if (r['quantityRequested'] !== undefined) out.quantity_requested = r['quantityRequested'];
  if (r['quantityApproved']  !== undefined) out.quantity_approved  = r['quantityApproved']  ?? null;
  if (r['quantityIssued']    !== undefined) out.quantity_issued    = r['quantityIssued']    ?? null;
  if (r['requestReason']    !== undefined)  out.request_reason     = r['requestReason']     ?? null;
  if (r['status'])                          out.status             = r['status'];
  if (r['reviewedBy']   !== undefined)      out.reviewed_by        = r['reviewedBy']   ?? null;
  if (r['reviewedAt']   !== undefined)      out.reviewed_at        = r['reviewedAt']   ?? null;
  if (r['fulfilledBy']  !== undefined)      out.fulfilled_by       = r['fulfilledBy']  ?? null;
  if (r['fulfilledAt']  !== undefined)      out.fulfilled_at       = r['fulfilledAt']  ?? null;
  if (r['rejectionReason'] !== undefined)   out.rejection_reason   = r['rejectionReason'] ?? null;
  return out;
}

// ─────────────────────────── TARGETS ─────────────────────────────

export function transformTarget(dbRow: Row<"targets">): any {
  return {
    id:           dbRow['id'],
    tenantId:     dbRow['tenant_id'],
    scope:        dbRow['scope'],
    branchId:     dbRow['branch_id'],
    userId:       dbRow['user_id']     ?? undefined,
    month:        dbRow['month'],
    amount:       dbRow['amount'],
    createdAt:    dbRow['created_at'],
    updatedAt:    dbRow['updated_at'],
  };
}

export function targetToDb(t: Partial<any>, tenantId: string): any {
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

export function transformApprovalRequest(dbRow: Row<"approval_requests">): any {
  return {
    id:              dbRow['id'],
    tenantId:        dbRow['tenant_id'],
    branchId:        dbRow['branch_id'],
    requesterId:     dbRow['requester_id'],
    requestType:     dbRow['request_type'],
    referenceId:     dbRow['reference_id'],
    reason:          dbRow['reason']           ?? undefined,
    status:          dbRow['status'],
    reviewedBy:      dbRow['reviewed_by']      ?? undefined,
    reviewedAt:      dbRow['reviewed_at']      ?? undefined,
    rejectionReason: dbRow['rejection_reason'] ?? undefined,
    createdAt:       dbRow['created_at'],
  };
}

export function approvalRequestToDb(a: Partial<any>, tenantId: string): any {
  const out: any = { tenant_id: tenantId };
  if (a['id'])                              out.id               = a['id'];
  if (a['branchId'])                        out.branch_id        = a['branchId'];
  if (a['requesterId'])                     out.requester_id     = a['requesterId'];
  if (a['requestType'])                     out.request_type     = a['requestType'];
  if (a['referenceId'])                     out.reference_id     = a['referenceId'];
  if (a['reason']          !== undefined)   out.reason           = a['reason']           ?? null;
  if (a['status'])                          out.status           = a['status'];
  if (a['reviewedBy']      !== undefined)   out.reviewed_by      = a['reviewedBy']       ?? null;
  if (a['reviewedAt']      !== undefined)   out.reviewed_at      = a['reviewedAt']       ?? null;
  if (a['rejectionReason'] !== undefined)   out.rejection_reason = a['rejectionReason']  ?? null;
  return out;
}

// ─────────────────────────── NOTIFICATIONS ───────────────────────
// DB schema: recipient_id (not user_id), read_at (timestamp, not bool), entity_type +
// entity_id + message + type (CHECK-constrained to specific onboarding/payment/stock
// notification types). No title / action_url columns.

export function transformNotification(dbRow: Row<"notifications">): any {
  return {
    id:        dbRow['id'],
    tenantId:  dbRow['tenant_id'],
    recipientId: dbRow['recipient_id'],
    userId:    dbRow['recipient_id'], // alias for legacy callers
    type:      dbRow['type'],
    entityType: dbRow['entity_type'],
    entityId: dbRow['entity_id'],
    message:   dbRow['message'],
    readAt:    dbRow['read_at'],
    read:      dbRow['read_at'] !== null, // derived boolean for legacy callers
    createdAt: dbRow['created_at'],
  };
}

export function notificationToDb(n: Partial<any>, tenantId: string): any {
  const out: any = { tenant_id: tenantId };
  if (n['id'])                       out.id         = n['id'];
  if (n['recipientId'])              out.recipient_id = n['recipientId'];
  else if (n['userId'])              out.recipient_id = n['userId'];
  if (n['type'])                     out.type       = n['type'];
  if (n['entityType'])               out.entity_type = n['entityType'];
  if (n['entityId'])                 out.entity_id  = n['entityId'];
  if (n['message'])                  out.message    = n['message'];
  if (n['readAt'] !== undefined)     out.read_at    = n['readAt'] ?? null;
  else if (n['read'] !== undefined)  out.read_at    = n['read'] ? new Date().toISOString() : null;
  return out;
}

// ─────────────────────────── ACTIVITIES (audit) ──────────────────
// DB schema: action, subject, actor_id, entity (CHECK-constrained), entity_id, emergency,
// metadata. The create_audit_log() RPC is the canonical writer.

export function transformActivity(dbRow: Row<"activities">): any {
  return {
    id:         dbRow['id'],
    tenantId:   dbRow['tenant_id'],
    actorId:    dbRow['actor_id'],
    action:     dbRow['action'],
    actionType: dbRow['action'], // alias for legacy callers
    subject:    dbRow['subject'],
    entity:     dbRow['entity'],
    entityType: dbRow['entity'], // alias for legacy callers
    entityId:   dbRow['entity_id']   ?? undefined,
    emergency:  dbRow['emergency'] ?? false,
    metadata:   dbRow['metadata']    as any,
    createdAt:  dbRow['created_at'],
  };
}

export function activityToDb(a: Partial<any>, tenantId: string): any {
  const out: any = { tenant_id: tenantId };
  if (a['id'])                          out.id           = a['id'];
  if (a['actorId'])                     out.actor_id     = a['actorId'];
  if (a['action'] || a['actionType'])      out.action       = a['action'] || a['actionType'];
  if (a['subject'] || a['description'])    out.subject      = a['subject'] || a['description'];
  if (a['entity'] || a['entityType'])      out.entity       = a['entity'] || a['entityType'];
  if (a['entityId'] !== undefined)     out.entity_id    = a['entityId'] ?? null;
  if (a['emergency'] !== undefined)    out.emergency    = a['emergency'] ?? null;
  if (a['metadata'] !== undefined)     out.metadata     = a['metadata'] ?? null;
  return out;
}

// ─────────────────────────── ONBOARDINGS ─────────────────────────
// Invite-first flow. token_hash holds the SHA-256 of the raw invite token (raw token is
// never stored). user_id is NULL until the invitee signs up (handle_new_user). status:
// invited | in_progress | submitted | approved | rejected.

export function transformOnboarding(dbRow: Row<"onboardings">): any {
  return {
    id:                  dbRow['id'],
    tenantId:            dbRow['tenant_id'],
    userId:              dbRow['user_id'],
    createdBy:            dbRow['created_by'],
    employeeId:          dbRow['employee_id'],
    jobTitle:            dbRow['job_title'],
    department:          dbRow['department'],
    startDate:           dbRow['start_date'],
    status:              dbRow['status'],
    tokenHash:           dbRow['token_hash'],
    tokenExpiresAt:      dbRow['token_expires_at'],
    tokenRevoked:        dbRow['token_revoked'],
    usedAt:              dbRow['used_at'],
    step:                dbRow['step'],
    data:                (dbRow['data'] ?? {}) as Record<string, string>,
    correctionNote:      dbRow['correction_note'] ?? undefined,
    submitterEmail:      dbRow['submitter_email'] ?? undefined,
    guarantorStatus:     dbRow['guarantor_status'],
    guarantorToken:      dbRow['guarantor_token'],
    guarantorResponse:   dbRow['guarantor_response'] as any,
    guarantorDecision:   dbRow['guarantor_decision'] ?? undefined,
    guarantorDecisionReason: dbRow['guarantor_decision_reason'] ?? undefined,
    guarantorDecidedAt:  dbRow['guarantor_decided_at'] ?? undefined,
    reviewedBy:           dbRow['reviewed_by'] ?? undefined,
    reviewedAt:           dbRow['reviewed_at'] ?? undefined,
    rejectionReason:     dbRow['rejection_reason'] ?? undefined,
    assignedRole:         dbRow['assigned_role'] ?? undefined,
    assignedBranchId:    dbRow['assigned_branch_id'] ?? undefined,
    submittedAt:          dbRow['submitted_at'] ?? undefined,
    activatedAt:         dbRow['activated_at'] ?? undefined,
    createdAt:           dbRow['created_at'],
    updatedAt:           dbRow['updated_at'],
  };
}

export function onboardingToDb(o: Partial<any>, tenantId: string): any {
  const out: any = { tenant_id: tenantId };
  if (o['id'])                         out.id               = o['id'];
  if (o['userId'] !== undefined)        out.user_id          = o['userId'] ?? null;
  if (o['createdBy'] !== undefined)     out.created_by       = o['createdBy'] ?? null;
  if (o['employeeId'])                  out.employee_id      = o['employeeId'];
  if (o['jobTitle'] !== undefined)       out.jobTitle         = o['jobTitle'];
  if (o['department'] !== undefined)     out.department       = o['department'];
  if (o['startDate'] !== undefined)      out.start_date       = o['startDate'];
  if (o['status'])                       out.status           = o['status'];
  if (o['tokenHash'])                   out.token_hash       = o['tokenHash'];
  if (o['tokenExpiresAt'])              out.token_expires_at = o['tokenExpiresAt'];
  if (o['tokenRevoked'] !== undefined)   out.token_revoked    = o['tokenRevoked'];
  if (o['usedAt'] !== undefined)         out.used_at          = o['usedAt'] ?? null;
  if (o['step'] !== undefined)           out.step             = o['step'];
  if (o['data'] !== undefined)           out.data             = o['data'];
  if (o['correctionNote'] !== undefined) out.correction_note = o['correctionNote'] ?? null;
  if (o['submitterEmail'] !== undefined) out.submitter_email = o['submitterEmail'] ?? null;
  if (o['guarantorStatus'])              out.guarantor_status = o['guarantorStatus'];
  if (o['guarantorToken'] !== undefined) out.guarantor_token = o['guarantorToken'] ?? null;
  if (o['guarantorResponse'] !== undefined) out.guarantor_response = o['guarantorResponse'] ?? null;
  if (o['guarantorDecision'] !== undefined) out.guarantor_decision = o['guarantorDecision'] ?? null;
  if (o['guarantorDecisionReason'] !== undefined) out.guarantor_decision_reason = o['guarantorDecisionReason'] ?? null;
  if (o['guarantorDecidedAt'] !== undefined) out.guarantor_decided_at = o['guarantorDecidedAt'] ?? null;
  if (o['reviewedBy'] !== undefined)     out.reviewed_by      = o['reviewedBy'] ?? null;
  if (o['reviewedAt'] !== undefined)     out.reviewed_at     = o['reviewedAt'] ?? null;
  if (o['rejectionReason'] !== undefined) out.rejection_reason = o['rejectionReason'] ?? null;
  if (o['assignedRole'] !== undefined)   out.assigned_role   = o['assignedRole'] ?? null;
  if (o['assignedBranchId'] !== undefined) out.assigned_branch_id = o['assignedBranchId'] ?? null;
  if (o['submittedAt'] !== undefined)    out.submitted_at    = o['submittedAt'] ?? null;
  if (o['activatedAt'] !== undefined)    out.activated_at    = o['activatedAt'] ?? null;
  return out;
}

export function transformOnboardingFile(dbRow: Row<"onboarding_files">): any {
  return {
    id:           dbRow['id'],
    onboardingId: dbRow['onboarding_id'],
    fileType:     dbRow['file_type'],
    fileName:     dbRow['file_name'],
    // storage path is stored in both cloudinary_* columns; use cloudinary_url as the path
    storagePath:  dbRow['cloudinary_url'],
    fileUrl:      dbRow['cloudinary_url'],
    fileSize:     dbRow['file_size'],
    mimeType:     dbRow['mime_type'],
    uploadedAt:   dbRow['uploaded_at'],
  };
}
