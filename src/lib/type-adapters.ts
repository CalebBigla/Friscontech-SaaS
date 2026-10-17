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
    location:     dbRow.location ?? "",
    address:      "",   // not in DB schema - default to empty
    phone:        "",   // not in DB schema - default to empty
    email:        "",   // not in DB schema - default to empty
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
  if (branch.location  !== undefined)     r.location        = branch.location  ?? null;
  if (branch.status)                      r.status          = branch.status;
  if (branch.managerId !== undefined)     r.manager_id      = branch.managerId ?? null;
  return r;
}

// ─────────────────────────── USERS ───────────────────────────────

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
    role:          dbRow.role    as any,
    status:        dbRow.status  as any,
    branchId:      dbRow.branch_id ?? null,
    managerId:     null,
    joinedAt:      dbRow.joined_at,
    deactivatedAt: dbRow.deactivated_at ?? null,
    authId:        dbRow.auth_id ?? null,
    createdAt:     dbRow.joined_at ?? "",
  };
}

export function userToDb(user: Partial<User>, tenantId: string): any {
  const r: any = { tenant_id: tenantId };
  if (user.id)                          r.id               = user.id;
  if (user.branchId  !== undefined)     r.branch_id        = user.branchId  ?? null;
  if (user.firstName)                   r.first_name       = user.firstName;
  if (user.lastName)                    r.last_name        = user.lastName;
  if (user.email    !== undefined)      r.email            = user.email     ?? null;
  if (user.phone    !== undefined)      r.phone            = user.phone     ?? null;
  if (user.role)                        r.role             = user.role;
  if (user.status)                      r.status           = user.status;
  if (user.joinedAt)                    r.joined_at        = user.joinedAt;
  if (user.deactivatedAt !== undefined) r.deactivated_at   = user.deactivatedAt ?? null;
  if (user.authId    !== undefined)     r.auth_id          = user.authId    ?? null;
  return r;
}

// ─────────────────────────── USER PREFERENCES ────────────────────

export function transformPreference(dbRow: Row<"user_preferences">): any {
  return {
    userId:              dbRow.user_id,
    dateFormat:          dbRow.date_format,
    defaultReportPeriod: dbRow.report_period,
    updatedAt:           dbRow.updated_at,
  };
}

export function preferenceToDb(pref: Partial<any>, userId: string): any {
  const r: any = { user_id: userId };
  if (pref.dateFormat)          r.date_format   = pref.dateFormat;
  if (pref.reportPeriod)        r.report_period = pref.reportPeriod;
  if (pref.defaultReportPeriod) r.report_period = pref.defaultReportPeriod;
  return r;
}

// ─────────────────────────── PRODUCTS ────────────────────────────

export function transformProduct(dbRow: Row<"products">): Product {
  return {
    id:                dbRow.id,
    tenantId:          dbRow.tenant_id,
    name:              dbRow.name,
    sku:               dbRow.sku,
    category:          dbRow.category,
    unit:              dbRow.unit,
    unitCost:          dbRow.unit_cost,
    unitPrice:         dbRow.unit_price,
    status:            dbRow.status as ProductStatus,
    lowStockThreshold: dbRow.low_stock_threshold ?? 0,
    description:       dbRow.description ?? "",
    createdAt:         dbRow.created_at,
    updatedAt:         dbRow.created_at, // DB schema has no updated_at; use created_at as fallback
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
  if ((product as any).imageUrl    !== undefined)       r.image_url           = (product as any).imageUrl    ?? null;
  if ((product as any).deactivatedAt !== undefined)     r.deactivated_at      = (product as any).deactivatedAt ?? null;
  return r;
}

// ─────────────────────────── INVENTORY ───────────────────────────

export function transformInventoryRecord(dbRow: Row<"inventory_records">): any {
  return {
    id:               dbRow.id,
    tenantId:         dbRow.tenant_id,
    branchId:         dbRow.branch_id,
    productId:        dbRow.product_id,
    quantityOnHand:   dbRow.quantity_on_hand,
    quantityReserved: dbRow.quantity_reserved,
    updatedAt:        dbRow.updated_at,
  };
}

export function inventoryRecordToDb(r: Partial<any>, tenantId: string): any {
  const out: any = { tenant_id: tenantId };
  if (r.id)                          out.id                = r.id;
  if (r.branchId)                    out.branch_id         = r.branchId;
  if (r.productId)                   out.product_id        = r.productId;
  if (r.quantityOnHand   !== undefined) out.quantity_on_hand   = r.quantityOnHand;
  if (r.quantityReserved !== undefined) out.quantity_reserved  = r.quantityReserved;
  return out;
}

export function transformInventoryMovement(dbRow: Row<"inventory_movements">): any {
  return {
    id:           dbRow.id,
    tenantId:     dbRow.tenant_id,
    branchId:     dbRow.branch_id,
    productId:    dbRow.product_id,
    movementType: dbRow.movement_type,
    quantity:     dbRow.quantity,
    // DB uses reference_type + reference_id, not a single "reference" string
    referenceType: dbRow.reference_type ?? undefined,
    referenceId:   dbRow.reference_id   ?? undefined,
    note:          dbRow.note           ?? undefined,
    performedBy:  dbRow.performed_by,
    createdAt:    dbRow.created_at,
  };
}

export function inventoryMovementToDb(m: Partial<any>, tenantId: string): any {
  const out: any = { tenant_id: tenantId };
  if (m.id)            out.id             = m.id;
  if (m.branchId)      out.branch_id      = m.branchId;
  if (m.productId)     out.product_id     = m.productId;
  if (m.movementType)  out.movement_type  = m.movementType;
  if (m.quantity !== undefined) out.quantity = m.quantity;
  if (m.referenceType) out.reference_type = m.referenceType;
  if (m.referenceId !== undefined) out.reference_id = m.referenceId ?? null;
  if (m.note    !== undefined) out.note    = m.note ?? null;
  if (m.performedBy)   out.performed_by   = m.performedBy;
  return out;
}

export function transformStockBatch(dbRow: Row<"stock_batches">): any {
  return {
    id:                dbRow.id,
    tenantId:          dbRow.tenant_id,
    branchId:          dbRow.branch_id,
    productId:         dbRow.product_id,
    batchNumber:       dbRow.batch_number ?? undefined,
    expiryDate:        dbRow.expiry_date  ?? undefined,
    quantityReceived:  dbRow.quantity_received,
    quantityRemaining: dbRow.quantity_remaining,
    receivedAt:        dbRow.received_at,
  };
}

export function stockBatchToDb(b: Partial<any>, tenantId: string): any {
  const out: any = { tenant_id: tenantId };
  if (b.id)                           out.id                = b.id;
  if (b.branchId)                     out.branch_id         = b.branchId;
  if (b.productId)                    out.product_id        = b.productId;
  if (b.batchNumber    !== undefined) out.batch_number      = b.batchNumber  ?? null;
  if (b.expiryDate     !== undefined) out.expiry_date       = b.expiryDate   ?? null;
  if (b.quantityReceived  !== undefined) out.quantity_received  = b.quantityReceived;
  if (b.quantityRemaining !== undefined) out.quantity_remaining = b.quantityRemaining;
  if (b.receivedAt)                   out.received_at       = b.receivedAt;
  return out;
}

// ─────────────────────────── SALES ───────────────────────────────
// DB schema: id, tenant_id, branch_id, customer_id, sales_rep_id,
//            product_id, quantity, unit_price, total_amount, sale_date, created_at
// No order_id, status, walk_in_name, walk_in_phone in this schema version.

export function transformSale(dbRow: Row<"sales">): any {
  return {
    id:          dbRow.id,
    tenantId:    dbRow.tenant_id,
    branchId:    dbRow.branch_id,
    salesRepId:  dbRow.sales_rep_id,
    customerId:  dbRow.customer_id ?? undefined,
    productId:   dbRow.product_id,
    quantity:    dbRow.quantity,
    unitPrice:   dbRow.unit_price,
    totalAmount: dbRow.total_amount,
    saleDate:    dbRow.sale_date,
    createdAt:   dbRow.created_at,
  };
}

export function saleToDb(sale: Partial<any>, tenantId: string): any {
  const out: any = { tenant_id: tenantId };
  if (sale.id)                       out.id           = sale.id;
  if (sale.branchId)                 out.branch_id    = sale.branchId;
  if (sale.salesRepId)               out.sales_rep_id = sale.salesRepId;
  if (sale.customerId !== undefined) out.customer_id  = sale.customerId ?? null;
  if (sale.productId)                out.product_id   = sale.productId;
  if (sale.quantity   !== undefined) out.quantity     = sale.quantity;
  if (sale.unitPrice  !== undefined) out.unit_price   = sale.unitPrice;
  if (sale.totalAmount !== undefined) out.total_amount = sale.totalAmount;
  if (sale.saleDate)                 out.sale_date    = sale.saleDate;
  return out;
}

// ─────────────────────────── CUSTOMERS ───────────────────────────
// DB schema: no contact_person column; has business_name instead.

export function transformCustomer(dbRow: Row<"customers">): any {
  return {
    id:           dbRow.id,
    tenantId:     dbRow.tenant_id,
    branchId:     dbRow.branch_id,
    name:         dbRow.name,
    businessName: dbRow.business_name ?? undefined,
    phone:        dbRow.phone   ?? undefined,
    email:        dbRow.email   ?? undefined,
    address:      dbRow.address ?? undefined,
    creditLimit:  dbRow.credit_limit,
    status:       dbRow.status,
    createdBy:    dbRow.created_by,
    createdAt:    dbRow.created_at,
    deactivatedAt: dbRow.deactivated_at ?? undefined,
  };
}

export function customerToDb(c: Partial<any>, tenantId: string): any {
  const out: any = { tenant_id: tenantId };
  if (c.id)                          out.id             = c.id;
  if (c.branchId)                    out.branch_id      = c.branchId;
  if (c.name)                        out.name           = c.name;
  if (c.businessName !== undefined)  out.business_name  = c.businessName ?? null;
  if (c.phone        !== undefined)  out.phone          = c.phone  ?? null;
  if (c.email        !== undefined)  out.email          = c.email  ?? null;
  if (c.address      !== undefined)  out.address        = c.address ?? null;
  if (c.creditLimit  !== undefined)  out.credit_limit   = c.creditLimit;
  if (c.status)                      out.status         = c.status;
  if (c.createdBy)                   out.created_by     = c.createdBy;
  if (c.deactivatedAt !== undefined) out.deactivated_at = c.deactivatedAt ?? null;
  return out;
}

// ─────────────────────────── CUSTOMER PAYMENTS ───────────────────
// DB schema: id, tenant_id, branch_id, customer_id, sales_rep_id,
//            amount, payment_method, reference_number, note, payment_date, created_at

export function transformCustomerPayment(dbRow: Row<"customer_payments">): any {
  return {
    id:            dbRow.id,
    tenantId:      dbRow.tenant_id,
    branchId:      dbRow.branch_id,
    customerId:    dbRow.customer_id,
    salesRepId:    dbRow.sales_rep_id,
    amount:        dbRow.amount,
    paymentMethod: dbRow.payment_method,
    reference:     dbRow.reference_number ?? undefined,
    note:          dbRow.note             ?? undefined,
    paymentDate:   dbRow.payment_date,
    createdAt:     dbRow.created_at,
  };
}

export function customerPaymentToDb(p: Partial<any>, tenantId: string): any {
  const out: any = { tenant_id: tenantId };
  if (p.id)                          out.id               = p.id;
  if (p.branchId)                    out.branch_id        = p.branchId;
  if (p.customerId)                  out.customer_id      = p.customerId;
  if (p.salesRepId)                  out.sales_rep_id     = p.salesRepId;
  if (p.amount     !== undefined)    out.amount           = p.amount;
  if (p.paymentMethod)               out.payment_method   = p.paymentMethod;
  if (p.reference  !== undefined)    out.reference_number = p.reference  ?? null;
  if (p.note       !== undefined)    out.note             = p.note       ?? null;
  if (p.paymentDate)                 out.payment_date     = p.paymentDate;
  return out;
}

// ─────────────────────────── PAYMENTS (rep) ──────────────────────
// DB schema: id, tenant_id, branch_id, sales_rep_id, period,
//            total_sales, cash_amount, transfer_amount, transfer_reference,
//            submitted_at, acknowledged_by/at, confirmed_by/at,
//            status, decline_reason, created_at

export function transformPayment(dbRow: Row<"payments">): any {
  return {
    id:               dbRow.id,
    tenantId:         dbRow.tenant_id,
    branchId:         dbRow.branch_id,
    salesRepId:       dbRow.sales_rep_id,
    period:           dbRow.period,
    totalSales:       dbRow.total_sales,
    cashAmount:       dbRow.cash_amount,
    transferAmount:   dbRow.transfer_amount,
    transferReference: dbRow.transfer_reference ?? undefined,
    submittedAt:      dbRow.submitted_at,
    acknowledgedBy:   dbRow.acknowledged_by ?? undefined,
    acknowledgedAt:   dbRow.acknowledged_at ?? undefined,
    confirmedBy:      dbRow.confirmed_by    ?? undefined,
    confirmedAt:      dbRow.confirmed_at    ?? undefined,
    status:           dbRow.status,
    declineReason:    dbRow.decline_reason  ?? undefined,
    createdAt:        dbRow.created_at,
  };
}

export function paymentToDb(p: Partial<any>, tenantId: string): any {
  const out: any = { tenant_id: tenantId };
  if (p.id)                            out.id                 = p.id;
  if (p.branchId)                      out.branch_id          = p.branchId;
  if (p.salesRepId)                    out.sales_rep_id       = p.salesRepId;
  if (p.period)                        out.period             = p.period;
  if (p.totalSales      !== undefined) out.total_sales        = p.totalSales;
  if (p.cashAmount      !== undefined) out.cash_amount        = p.cashAmount;
  if (p.transferAmount  !== undefined) out.transfer_amount    = p.transferAmount;
  if (p.transferReference !== undefined) out.transfer_reference = p.transferReference ?? null;
  if (p.submittedAt)                   out.submitted_at       = p.submittedAt;
  if (p.acknowledgedBy !== undefined)  out.acknowledged_by    = p.acknowledgedBy ?? null;
  if (p.acknowledgedAt !== undefined)  out.acknowledged_at    = p.acknowledgedAt ?? null;
  if (p.confirmedBy    !== undefined)  out.confirmed_by       = p.confirmedBy    ?? null;
  if (p.confirmedAt    !== undefined)  out.confirmed_at       = p.confirmedAt    ?? null;
  if (p.status)                        out.status             = p.status;
  if (p.declineReason !== undefined)   out.decline_reason     = p.declineReason  ?? null;
  return out;
}

// ─────────────────────────── EXPENSES ────────────────────────────
// DB schema: id, tenant_id, branch_id, manager_id, category,
//            amount, description, receipt_url, expense_date, created_at

export function transformExpense(dbRow: Row<"expenses">): any {
  return {
    id:          dbRow.id,
    tenantId:    dbRow.tenant_id,
    branchId:    dbRow.branch_id,
    managerId:   dbRow.manager_id,
    category:    dbRow.category,
    amount:      dbRow.amount,
    description: dbRow.description ?? undefined,
    receiptUrl:  dbRow.receipt_url  ?? undefined,
    expenseDate: dbRow.expense_date,
    createdAt:   dbRow.created_at,
  };
}

export function expenseToDb(e: Partial<any>, tenantId: string): any {
  const out: any = { tenant_id: tenantId };
  if (e.id)                         out.id           = e.id;
  if (e.branchId)                   out.branch_id    = e.branchId;
  if (e.managerId)                  out.manager_id   = e.managerId;
  if (e.category)                   out.category     = e.category;
  if (e.amount     !== undefined)   out.amount       = e.amount;
  if (e.description !== undefined)  out.description  = e.description ?? null;
  if (e.receiptUrl  !== undefined)  out.receipt_url  = e.receiptUrl  ?? null;
  if (e.expenseDate)                out.expense_date = e.expenseDate;
  return out;
}

// ─────────────────────────── MANAGER REMITTANCES ─────────────────

export function transformManagerRemittance(dbRow: Row<"manager_remittances">): any {
  return {
    id:                dbRow.id,
    tenantId:          dbRow.tenant_id,
    branchId:          dbRow.branch_id,
    managerId:         dbRow.manager_id,
    period:            dbRow.period,
    totalReceived:     dbRow.total_received,
    totalExpenses:     dbRow.total_expenses,
    netRemittance:     dbRow.net_remittance,
    cashAmount:        dbRow.cash_amount,
    transferAmount:    dbRow.transfer_amount,
    transferReference: dbRow.transfer_reference ?? undefined,
    submittedAt:       dbRow.submitted_at,
    reviewedBy:        dbRow.reviewed_by  ?? undefined,
    reviewedAt:        dbRow.reviewed_at  ?? undefined,
    status:            dbRow.status,
    rejectReason:      dbRow.reject_reason ?? undefined,
    createdAt:         dbRow.created_at,
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
  if (r.id)                              out.id                 = r.id;
  if (r.branchId)                        out.branch_id          = r.branchId;
  if (r.requesterId)                     out.requester_id       = r.requesterId;
  if (r.productId)                       out.product_id         = r.productId;
  if (r.quantityRequested !== undefined) out.quantity_requested = r.quantityRequested;
  if (r.quantityApproved  !== undefined) out.quantity_approved  = r.quantityApproved  ?? null;
  if (r.quantityIssued    !== undefined) out.quantity_issued    = r.quantityIssued    ?? null;
  if (r.requestReason    !== undefined)  out.request_reason     = r.requestReason     ?? null;
  if (r.status)                          out.status             = r.status;
  if (r.reviewedBy   !== undefined)      out.reviewed_by        = r.reviewedBy   ?? null;
  if (r.reviewedAt   !== undefined)      out.reviewed_at        = r.reviewedAt   ?? null;
  if (r.fulfilledBy  !== undefined)      out.fulfilled_by       = r.fulfilledBy  ?? null;
  if (r.fulfilledAt  !== undefined)      out.fulfilled_at       = r.fulfilledAt  ?? null;
  if (r.rejectionReason !== undefined)   out.rejection_reason   = r.rejectionReason ?? null;
  return out;
}

// ─────────────────────────── TARGETS ─────────────────────────────

export function transformTarget(dbRow: Row<"targets">): any {
  return {
    id:           dbRow.id,
    tenantId:     dbRow.tenant_id,
    branchId:     dbRow.branch_id   ?? undefined,
    userId:       dbRow.user_id     ?? undefined,
    productId:    dbRow.product_id  ?? undefined,
    month:        dbRow.month,
    targetAmount: dbRow.target_amount,
    createdBy:    dbRow.created_by,
    createdAt:    dbRow.created_at,
    updatedAt:    dbRow.updated_at,
  };
}

export function targetToDb(t: Partial<any>, tenantId: string): any {
  const out: any = { tenant_id: tenantId };
  if (t.id)                        out.id            = t.id;
  if (t.branchId  !== undefined)   out.branch_id     = t.branchId  ?? null;
  if (t.userId    !== undefined)   out.user_id       = t.userId    ?? null;
  if (t.productId !== undefined)   out.product_id    = t.productId ?? null;
  if (t.month)                     out.month         = t.month;
  if (t.targetAmount !== undefined) out.target_amount = t.targetAmount;
  if (t.createdBy)                 out.created_by    = t.createdBy;
  return out;
}

// ─────────────────────────── APPROVALS ───────────────────────────

export function transformApprovalRequest(dbRow: Row<"approval_requests">): any {
  return {
    id:              dbRow.id,
    tenantId:        dbRow.tenant_id,
    branchId:        dbRow.branch_id,
    requesterId:     dbRow.requester_id,
    requestType:     dbRow.request_type,
    referenceId:     dbRow.reference_id,
    reason:          dbRow.reason           ?? undefined,
    status:          dbRow.status,
    reviewedBy:      dbRow.reviewed_by      ?? undefined,
    reviewedAt:      dbRow.reviewed_at      ?? undefined,
    rejectionReason: dbRow.rejection_reason ?? undefined,
    createdAt:       dbRow.created_at,
  };
}

export function approvalRequestToDb(a: Partial<any>, tenantId: string): any {
  const out: any = { tenant_id: tenantId };
  if (a.id)                              out.id               = a.id;
  if (a.branchId)                        out.branch_id        = a.branchId;
  if (a.requesterId)                     out.requester_id     = a.requesterId;
  if (a.requestType)                     out.request_type     = a.requestType;
  if (a.referenceId)                     out.reference_id     = a.referenceId;
  if (a.reason          !== undefined)   out.reason           = a.reason           ?? null;
  if (a.status)                          out.status           = a.status;
  if (a.reviewedBy      !== undefined)   out.reviewed_by      = a.reviewedBy       ?? null;
  if (a.reviewedAt      !== undefined)   out.reviewed_at      = a.reviewedAt       ?? null;
  if (a.rejectionReason !== undefined)   out.rejection_reason = a.rejectionReason  ?? null;
  return out;
}

// ─────────────────────────── NOTIFICATIONS ───────────────────────

export function transformNotification(dbRow: Row<"notifications">): any {
  return {
    id:        dbRow.id,
    tenantId:  dbRow.tenant_id,
    userId:    dbRow.user_id,
    type:      dbRow.type,
    title:     dbRow.title,
    message:   dbRow.message,
    actionUrl: dbRow.action_url ?? undefined,
    read:      dbRow.read,
    createdAt: dbRow.created_at,
  };
}

export function notificationToDb(n: Partial<any>, tenantId: string): any {
  const out: any = { tenant_id: tenantId };
  if (n.id)                       out.id         = n.id;
  if (n.userId)                   out.user_id    = n.userId;
  if (n.type)                     out.type       = n.type;
  if (n.title)                    out.title      = n.title;
  if (n.message)                  out.message    = n.message;
  if (n.actionUrl !== undefined)  out.action_url = n.actionUrl ?? null;
  if (n.read      !== undefined)  out.read       = n.read;
  return out;
}

// ─────────────────────────── ACTIVITIES (audit) ──────────────────

export function transformActivity(dbRow: Row<"activities">): any {
  return {
    id:         dbRow.id,
    tenantId:   dbRow.tenant_id,
    actorId:    dbRow.user_id,
    actionType: dbRow.action_type,
    subject:    dbRow.description,
    entityType: dbRow.entity_type ?? undefined,
    entityId:   dbRow.entity_id   ?? undefined,
    metadata:   dbRow.metadata    as any,
    createdAt:  dbRow.created_at,
  };
}

export function activityToDb(a: Partial<any>, tenantId: string): any {
  const out: any = { tenant_id: tenantId };
  if (a.id)                          out.id           = a.id;
  if (a.actorId  || a.user_id)       out.user_id      = a.actorId || a.user_id;
  if (a.actionType || a.action_type) out.action_type  = a.actionType || a.action_type;
  if (a.subject  || a.description)   out.description  = a.subject  || a.description;
  if (a.entityType !== undefined)    out.entity_type  = a.entityType  ?? null;
  if (a.entityId   !== undefined)    out.entity_id    = a.entityId    ?? null;
  if (a.metadata   !== undefined)    out.metadata     = a.metadata    ?? null;
  return out;
}

// ─────────────────────────── ONBOARDINGS ─────────────────────────

export function transformOnboarding(dbRow: Row<"onboardings">): any {
  return {
    id:          dbRow.id,
    tenantId:    dbRow.tenant_id,
    token:       dbRow.token,
    firstName:   dbRow.first_name,
    lastName:    dbRow.last_name,
    phone:       dbRow.phone,
    branchId:    dbRow.branch_id,
    role:        dbRow.role,
    createdBy:   dbRow.created_by,
    completed:   dbRow.completed,
    completedAt: dbRow.completed_at ?? undefined,
    expiresAt:   dbRow.expires_at,
    createdAt:   dbRow.created_at,
  };
}

export function onboardingToDb(o: Partial<any>, tenantId: string): any {
  const out: any = { tenant_id: tenantId };
  if (o.id)                         out.id           = o.id;
  if (o.token)                      out.token        = o.token;
  if (o.firstName)                  out.first_name   = o.firstName;
  if (o.lastName)                   out.last_name    = o.lastName;
  if (o.phone)                      out.phone        = o.phone;
  if (o.branchId)                   out.branch_id    = o.branchId;
  if (o.role)                       out.role         = o.role;
  if (o.createdBy)                  out.created_by   = o.createdBy;
  if (o.completed !== undefined)    out.completed    = o.completed;
  if (o.completedAt !== undefined)  out.completed_at = o.completedAt ?? null;
  if (o.expiresAt)                  out.expires_at   = o.expiresAt;
  return out;
}

export function transformOnboardingFile(dbRow: Row<"onboarding_files">): any {
  return {
    id:           dbRow.id,
    onboardingId: dbRow.onboarding_id,
    fileType:     dbRow.file_type,
    fileUrl:      dbRow.file_url,
    uploadedAt:   dbRow.uploaded_at,
  };
}
