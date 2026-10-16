/**
 * Type Adapters
 * 
 * Transform between database types (snake_case) and app types (camelCase)
 * Maintains separation between database schema and application domain
 */

import type { Row } from "@/lib/supabase-helpers";
import type { Branch, BranchStatus, User, Product, ProductStatus } from "@/data/mock-db";

/**
 * Transform database branch row to app Branch type
 */
export function transformBranch(dbRow: Row<'branches'>): Branch {
  return {
    id: dbRow.id,
    tenantId: dbRow.tenant_id,
    name: dbRow.name,
    code: dbRow.code,
    location: dbRow.location || undefined,
    status: dbRow.status as BranchStatus,
    managerId: dbRow.manager_id || undefined,
    createdAt: dbRow.created_at,
    deactivatedAt: dbRow.deactivated_at || undefined,
  };
}

/**
 * Transform app Branch input to database insert
 */
export function branchToDb(branch: Partial<Branch>, tenantId: string): any {
  const result: any = {
    tenant_id: tenantId,
  };
  
  if (branch.id) result.id = branch.id;
  if (branch.name) result.name = branch.name;
  if (branch.code) result.code = branch.code;
  if (branch.location !== undefined) result.location = branch.location || null;
  if (branch.status) result.status = branch.status;
  if (branch.managerId !== undefined) result.manager_id = branch.managerId || null;
  if (branch.deactivatedAt !== undefined) result.deactivated_at = branch.deactivatedAt || null;
  
  return result;
}

/**
 * Transform database user row to app User type
 */
export function transformUser(dbRow: Row<'users'>): User {
  return {
    id: dbRow.id,
    tenantId: dbRow.tenant_id,
    branchId: dbRow.branch_id || undefined,
    firstName: dbRow.first_name,
    lastName: dbRow.last_name,
    email: dbRow.email || undefined,
    phone: dbRow.phone || undefined,
    role: dbRow.role as any,
    status: dbRow.status as any,
    joinedAt: dbRow.joined_at,
    deactivatedAt: dbRow.deactivated_at || undefined,
  };
}

/**
 * Transform database product row to app Product type
 */
export function transformProduct(dbRow: Row<'products'>): Product {
  return {
    id: dbRow.id,
    tenantId: dbRow.tenant_id,
    name: dbRow.name,
    sku: dbRow.sku,
    category: dbRow.category,
    unit: dbRow.unit,
    unitCost: dbRow.unit_cost,
    unitPrice: dbRow.unit_price,
    status: dbRow.status as ProductStatus,
    lowStockThreshold: dbRow.low_stock_threshold || undefined,
    description: dbRow.description || undefined,
    imageUrl: dbRow.image_url || undefined,
    createdAt: dbRow.created_at,
    deactivatedAt: dbRow.deactivated_at || undefined,
  };
}

/**
 * Transform app Product input to database insert/update
 */
export function productToDb(product: Partial<Product>, tenantId: string): any {
  const result: any = {
    tenant_id: tenantId,
  };
  
  if (product.id) result.id = product.id;
  if (product.name) result.name = product.name;
  if (product.sku) result.sku = product.sku;
  if (product.category) result.category = product.category;
  if (product.unit) result.unit = product.unit;
  if (product.unitCost !== undefined) result.unit_cost = product.unitCost;
  if (product.unitPrice !== undefined) result.unit_price = product.unitPrice;
  if (product.status) result.status = product.status;
  if (product.lowStockThreshold !== undefined) result.low_stock_threshold = product.lowStockThreshold || null;
  if (product.description !== undefined) result.description = product.description || null;
  if (product.imageUrl !== undefined) result.image_url = product.imageUrl || null;
  if (product.deactivatedAt !== undefined) result.deactivated_at = product.deactivatedAt || null;
  
  return result;
}

/**
 * Transform database inventory_records row to app InventoryRecord type
 */
export function transformInventoryRecord(dbRow: Row<'inventory_records'>): any {
  return {
    id: dbRow.id,
    tenantId: dbRow.tenant_id,
    branchId: dbRow.branch_id,
    productId: dbRow.product_id,
    quantityOnHand: dbRow.quantity_on_hand,
    quantityReserved: dbRow.quantity_reserved,
    updatedAt: dbRow.updated_at,
  };
}

/**
 * Transform database inventory_movements row to app InventoryMovement type
 */
export function transformInventoryMovement(dbRow: Row<'inventory_movements'>): any {
  return {
    id: dbRow.id,
    tenantId: dbRow.tenant_id,
    branchId: dbRow.branch_id,
    productId: dbRow.product_id,
    movementType: dbRow.movement_type,
    quantity: dbRow.quantity,
    reference: dbRow.reference || undefined,
    note: dbRow.note || undefined,
    performedBy: dbRow.performed_by,
    createdAt: dbRow.created_at,
  };
}

/**
 * Transform database stock_batches row to app StockBatch type
 */
export function transformStockBatch(dbRow: Row<'stock_batches'>): any {
  return {
    id: dbRow.id,
    tenantId: dbRow.tenant_id,
    branchId: dbRow.branch_id,
    productId: dbRow.product_id,
    batchNumber: dbRow.batch_number || undefined,
    expiryDate: dbRow.expiry_date || undefined,
    quantityReceived: dbRow.quantity_received,
    quantityRemaining: dbRow.quantity_remaining,
    receivedAt: dbRow.received_at,
  };
}

/**
 * Transform database sales row to app Sale type
 */
export function transformSale(dbRow: Row<'sales'>): any {
  return {
    id: dbRow.id,
    tenantId: dbRow.tenant_id,
    branchId: dbRow.branch_id,
    salesRepId: dbRow.sales_rep_id,
    customerId: dbRow.customer_id || undefined,
    orderId: dbRow.order_id || undefined,
    productId: dbRow.product_id,
    quantity: dbRow.quantity,
    unitPrice: dbRow.unit_price,
    totalAmount: dbRow.total_amount,
    saleDate: dbRow.sale_date,
    status: dbRow.status,
    walkInName: dbRow.walk_in_name || undefined,
    walkInPhone: dbRow.walk_in_phone || undefined,
    createdAt: dbRow.created_at,
  };
}

/**
 * Transform database customers row to app Customer type
 */
export function transformCustomer(dbRow: Row<'customers'>): any {
  return {
    id: dbRow.id,
    tenantId: dbRow.tenant_id,
    name: dbRow.name,
    contactPerson: dbRow.contact_person,
    phone: dbRow.phone || undefined,
    email: dbRow.email || undefined,
    address: dbRow.address || undefined,
    creditLimit: dbRow.credit_limit,
    status: dbRow.status,
    createdAt: dbRow.created_at,
    deactivatedAt: dbRow.deactivated_at || undefined,
  };
}

/**
 * Transform database rep_payments row to app Payment type
 */
export function transformPayment(dbRow: Row<'rep_payments'>): any {
  return {
    id: dbRow.id,
    tenantId: dbRow.tenant_id,
    branchId: dbRow.branch_id,
    salesRepId: dbRow.sales_rep_id,
    period: dbRow.period,
    cashAmount: dbRow.cash_amount,
    transferAmount: dbRow.transfer_amount,
    transferReference: dbRow.transfer_reference || undefined,
    proofName: dbRow.proof_name || undefined,
    status: dbRow.status,
    submittedAt: dbRow.submitted_at,
    acknowledgedBy: dbRow.acknowledged_by || undefined,
    acknowledgedAt: dbRow.acknowledged_at || undefined,
    confirmedBy: dbRow.confirmed_by || undefined,
    confirmedAt: dbRow.confirmed_at || undefined,
    declinedBy: dbRow.declined_by || undefined,
    declinedAt: dbRow.declined_at || undefined,
    declineReason: dbRow.decline_reason || undefined,
    createdAt: dbRow.created_at,
  };
}

/**
 * Transform database customer_payments row to app CustomerPayment type
 */
export function transformCustomerPayment(dbRow: Row<'customer_payments'>): any {
  return {
    id: dbRow.id,
    tenantId: dbRow.tenant_id,
    customerId: dbRow.customer_id,
    amount: dbRow.amount,
    paymentMethod: dbRow.payment_method,
    reference: dbRow.reference || undefined,
    note: dbRow.note || undefined,
    paymentDate: dbRow.payment_date,
    status: dbRow.status,
    submittedBy: dbRow.submitted_by,
    submittedAt: dbRow.submitted_at,
    acknowledgedBy: dbRow.acknowledged_by || undefined,
    acknowledgedAt: dbRow.acknowledged_at || undefined,
    confirmedBy: dbRow.confirmed_by || undefined,
    confirmedAt: dbRow.confirmed_at || undefined,
    declinedBy: dbRow.declined_by || undefined,
    declinedAt: dbRow.declined_at || undefined,
    declineReason: dbRow.decline_reason || undefined,
    createdAt: dbRow.created_at,
  };
}

/**
 * Transform database expenses row to app Expense type
 */
export function transformExpense(dbRow: Row<'expenses'>): any {
  return {
    id: dbRow.id,
    tenantId: dbRow.tenant_id,
    branchId: dbRow.branch_id || undefined,
    category: dbRow.category,
    amount: dbRow.amount,
    purpose: dbRow.purpose,
    expenseDate: dbRow.expense_date,
    managerId: dbRow.manager_id,
    status: dbRow.status,
    voidReason: dbRow.void_reason || undefined,
    voidedBy: dbRow.voided_by || undefined,
    voidedAt: dbRow.voided_at || undefined,
    createdAt: dbRow.created_at,
  };
}

/**
 * Transform database manager_remittances row to app ManagerRemittance type
 */
export function transformManagerRemittance(dbRow: Row<'manager_remittances'>): any {
  return {
    id: dbRow.id,
    tenantId: dbRow.tenant_id,
    branchId: dbRow.branch_id,
    managerId: dbRow.manager_id,
    period: dbRow.period,
    totalReceived: dbRow.total_received,
    totalExpenses: dbRow.total_expenses,
    netRemittance: dbRow.net_remittance,
    cashAmount: dbRow.cash_amount,
    transferAmount: dbRow.transfer_amount,
    transferReference: dbRow.transfer_reference || undefined,
    submittedAt: dbRow.submitted_at,
    reviewedBy: dbRow.reviewed_by || undefined,
    reviewedAt: dbRow.reviewed_at || undefined,
    status: dbRow.status,
    rejectReason: dbRow.reject_reason || undefined,
    createdAt: dbRow.created_at,
  };
}

/**
 * Transform database owner_remittances row to app OwnerRemittance type
 */
export function transformOwnerRemittance(dbRow: Row<'owner_remittances'>): any {
  return {
    id: dbRow.id,
    tenantId: dbRow.tenant_id,
    payeeType: dbRow.payee_type,
    payeeName: dbRow.payee_name,
    amount: dbRow.amount,
    paymentMethod: dbRow.payment_method,
    referenceNumber: dbRow.reference_number || undefined,
    description: dbRow.description || undefined,
    paymentDate: dbRow.payment_date,
    createdBy: dbRow.created_by,
    createdAt: dbRow.created_at,
  };
}

/**
 * Transform database stock_requests row to app StockRequest type
 */
export function transformStockRequest(dbRow: Row<'stock_requests'>): any {
  return {
    id: dbRow.id,
    tenantId: dbRow.tenant_id,
    branchId: dbRow.branch_id,
    requesterId: dbRow.requester_id,
    productId: dbRow.product_id,
    quantityRequested: dbRow.quantity_requested,
    quantityApproved: dbRow.quantity_approved || undefined,
    quantityIssued: dbRow.quantity_issued || undefined,
    requestReason: dbRow.request_reason || undefined,
    status: dbRow.status,
    reviewedBy: dbRow.reviewed_by || undefined,
    reviewedAt: dbRow.reviewed_at || undefined,
    fulfilledBy: dbRow.fulfilled_by || undefined,
    fulfilledAt: dbRow.fulfilled_at || undefined,
    rejectionReason: dbRow.rejection_reason || undefined,
    createdAt: dbRow.created_at,
  };
}

/**
 * Transform database targets row to app Target type
 */
export function transformTarget(dbRow: Row<'targets'>): any {
  return {
    id: dbRow.id,
    tenantId: dbRow.tenant_id,
    branchId: dbRow.branch_id || undefined,
    userId: dbRow.user_id || undefined,
    productId: dbRow.product_id || undefined,
    month: dbRow.month,
    targetAmount: dbRow.target_amount,
    createdBy: dbRow.created_by,
    createdAt: dbRow.created_at,
    updatedAt: dbRow.updated_at,
  };
}

/**
 * Transform database approval_requests row to app ApprovalRequest type
 */
export function transformApprovalRequest(dbRow: Row<'approval_requests'>): any {
  return {
    id: dbRow.id,
    tenantId: dbRow.tenant_id,
    branchId: dbRow.branch_id,
    requesterId: dbRow.requester_id,
    requestType: dbRow.request_type,
    referenceId: dbRow.reference_id,
    reason: dbRow.reason || undefined,
    status: dbRow.status,
    reviewedBy: dbRow.reviewed_by || undefined,
    reviewedAt: dbRow.reviewed_at || undefined,
    rejectionReason: dbRow.rejection_reason || undefined,
    createdAt: dbRow.created_at,
  };
}

/**
 * Transform database notifications row to app AppNotification type
 */
export function transformNotification(dbRow: Row<'notifications'>): any {
  return {
    id: dbRow.id,
    tenantId: dbRow.tenant_id,
    userId: dbRow.user_id,
    type: dbRow.type,
    title: dbRow.title,
    message: dbRow.message,
    actionUrl: dbRow.action_url || undefined,
    read: dbRow.read,
    readAt: dbRow.read ? dbRow.created_at : undefined, // Approximate since we don't have read_at in DB
    createdAt: dbRow.created_at,
  };
}

/**
 * Transform database activities row to app Activity type
 */
export function transformActivity(dbRow: Row<'activities'>): any {
  return {
    id: dbRow.id,
    tenantId: dbRow.tenant_id,
    actorId: dbRow.user_id,
    actionType: dbRow.action_type,
    subject: dbRow.description,
    entityType: dbRow.entity_type || undefined,
    entityId: dbRow.entity_id || undefined,
    metadata: dbRow.metadata as any,
    createdAt: dbRow.created_at,
  };
}

/**
 * Transform database onboardings row to app Onboarding type
 */
export function transformOnboarding(dbRow: Row<'onboardings'>): any {
  return {
    id: dbRow.id,
    tenantId: dbRow.tenant_id,
    token: dbRow.token,
    firstName: dbRow.first_name,
    lastName: dbRow.last_name,
    phone: dbRow.phone,
    branchId: dbRow.branch_id,
    role: dbRow.role,
    createdBy: dbRow.created_by,
    completed: dbRow.completed,
    completedAt: dbRow.completed_at || undefined,
    expiresAt: dbRow.expires_at,
    createdAt: dbRow.created_at,
  };
}

/**
 * Transform database onboarding_files row
 */
export function transformOnboardingFile(dbRow: Row<'onboarding_files'>): any {
  return {
    id: dbRow.id,
    onboardingId: dbRow.onboarding_id,
    fileType: dbRow.file_type,
    fileUrl: dbRow.file_url,
    uploadedAt: dbRow.uploaded_at,
  };
}

/**
 * Transform database preferences row to app UserPreference type
 */
export function transformPreference(dbRow: Row<'preferences'>): any {
  return {
    userId: dbRow.user_id,
    dateFormat: dbRow.date_format as any,
    defaultReportPeriod: dbRow.default_report_period as any,
    updatedAt: dbRow.updated_at,
  };
}

// ======================
// REVERSE TRANSFORMERS (App → DB)
// ======================

/**
 * Transform app User input to database insert/update
 */
export function userToDb(user: Partial<any>, tenantId: string): any {
  const result: any = {
    tenant_id: tenantId,
  };
  
  if (user.id) result.id = user.id;
  if (user.branchId !== undefined) result.branch_id = user.branchId || null;
  if (user.firstName) result.first_name = user.firstName;
  if (user.lastName) result.last_name = user.lastName;
  if (user.email !== undefined) result.email = user.email || null;
  if (user.phone !== undefined) result.phone = user.phone || null;
  if (user.role) result.role = user.role;
  if (user.status) result.status = user.status;
  if (user.joinedAt) result.joined_at = user.joinedAt;
  if (user.deactivatedAt !== undefined) result.deactivated_at = user.deactivatedAt || null;
  if (user.authId !== undefined) result.auth_id = user.authId || null;
  
  return result;
}

/**
 * Transform app Customer input to database insert/update
 */
export function customerToDb(customer: Partial<any>, tenantId: string): any {
  const result: any = {
    tenant_id: tenantId,
  };
  
  if (customer.id) result.id = customer.id;
  if (customer.name) result.name = customer.name;
  if (customer.contactPerson) result.contact_person = customer.contactPerson;
  if (customer.phone !== undefined) result.phone = customer.phone || null;
  if (customer.email !== undefined) result.email = customer.email || null;
  if (customer.address !== undefined) result.address = customer.address || null;
  if (customer.creditLimit !== undefined) result.credit_limit = customer.creditLimit;
  if (customer.status) result.status = customer.status;
  if (customer.deactivatedAt !== undefined) result.deactivated_at = customer.deactivatedAt || null;
  
  return result;
}

/**
 * Transform app Sale input to database insert
 */
export function saleToDb(sale: Partial<any>, tenantId: string): any {
  const result: any = {
    tenant_id: tenantId,
  };
  
  if (sale.id) result.id = sale.id;
  if (sale.branchId) result.branch_id = sale.branchId;
  if (sale.salesRepId) result.sales_rep_id = sale.salesRepId;
  if (sale.customerId !== undefined) result.customer_id = sale.customerId || null;
  if (sale.orderId !== undefined) result.order_id = sale.orderId || null;
  if (sale.productId) result.product_id = sale.productId;
  if (sale.quantity !== undefined) result.quantity = sale.quantity;
  if (sale.unitPrice !== undefined) result.unit_price = sale.unitPrice;
  if (sale.totalAmount !== undefined) result.total_amount = sale.totalAmount;
  if (sale.saleDate) result.sale_date = sale.saleDate;
  if (sale.status) result.status = sale.status;
  if (sale.walkInName !== undefined) result.walk_in_name = sale.walkInName || null;
  if (sale.walkInPhone !== undefined) result.walk_in_phone = sale.walkInPhone || null;
  
  return result;
}

/**
 * Transform app Target input to database insert/update
 */
export function targetToDb(target: Partial<any>, tenantId: string): any {
  const result: any = {
    tenant_id: tenantId,
  };
  
  if (target.id) result.id = target.id;
  if (target.branchId !== undefined) result.branch_id = target.branchId || null;
  if (target.userId !== undefined) result.user_id = target.userId || null;
  if (target.productId !== undefined) result.product_id = target.productId || null;
  if (target.month) result.month = target.month;
  if (target.targetAmount !== undefined) result.target_amount = target.targetAmount;
  if (target.createdBy) result.created_by = target.createdBy;
  
  return result;
}

/**
 * Transform app Expense input to database insert/update
 */
export function expenseToDb(expense: Partial<any>, tenantId: string): any {
  const result: any = {
    tenant_id: tenantId,
  };
  
  if (expense.id) result.id = expense.id;
  if (expense.branchId !== undefined) result.branch_id = expense.branchId || null;
  if (expense.category) result.category = expense.category;
  if (expense.amount !== undefined) result.amount = expense.amount;
  if (expense.purpose) result.purpose = expense.purpose;
  if (expense.expenseDate) result.expense_date = expense.expenseDate;
  if (expense.managerId) result.manager_id = expense.managerId;
  if (expense.status) result.status = expense.status;
  if (expense.voidReason !== undefined) result.void_reason = expense.voidReason || null;
  if (expense.voidedBy !== undefined) result.voided_by = expense.voidedBy || null;
  if (expense.voidedAt !== undefined) result.voided_at = expense.voidedAt || null;
  
  return result;
}

/**
 * Transform app StockRequest input to database insert
 */
export function stockRequestToDb(request: Partial<any>, tenantId: string): any {
  const result: any = {
    tenant_id: tenantId,
  };
  
  if (request.id) result.id = request.id;
  if (request.branchId) result.branch_id = request.branchId;
  if (request.requesterId) result.requester_id = request.requesterId;
  if (request.productId) result.product_id = request.productId;
  if (request.quantityRequested !== undefined) result.quantity_requested = request.quantityRequested;
  if (request.quantityApproved !== undefined) result.quantity_approved = request.quantityApproved;
  if (request.quantityIssued !== undefined) result.quantity_issued = request.quantityIssued;
  if (request.requestReason !== undefined) result.request_reason = request.requestReason || null;
  if (request.status) result.status = request.status;
  if (request.reviewedBy !== undefined) result.reviewed_by = request.reviewedBy || null;
  if (request.reviewedAt !== undefined) result.reviewed_at = request.reviewedAt || null;
  if (request.fulfilledBy !== undefined) result.fulfilled_by = request.fulfilledBy || null;
  if (request.fulfilledAt !== undefined) result.fulfilled_at = request.fulfilledAt || null;
  if (request.rejectionReason !== undefined) result.rejection_reason = request.rejectionReason || null;
  
  return result;
}

/**
 * Transform app ApprovalRequest input to database insert
 */
export function approvalRequestToDb(approval: Partial<any>, tenantId: string): any {
  const result: any = {
    tenant_id: tenantId,
  };
  
  if (approval.id) result.id = approval.id;
  if (approval.branchId) result.branch_id = approval.branchId;
  if (approval.requesterId) result.requester_id = approval.requesterId;
  if (approval.requestType) result.request_type = approval.requestType;
  if (approval.referenceId) result.reference_id = approval.referenceId;
  if (approval.reason !== undefined) result.reason = approval.reason || null;
  if (approval.status) result.status = approval.status;
  if (approval.reviewedBy !== undefined) result.reviewed_by = approval.reviewedBy || null;
  if (approval.reviewedAt !== undefined) result.reviewed_at = approval.reviewedAt || null;
  if (approval.rejectionReason !== undefined) result.rejection_reason = approval.rejectionReason || null;
  
  return result;
}

/**
 * Transform app Notification input to database insert
 */
export function notificationToDb(notification: Partial<any>, tenantId: string): any {
  const result: any = {
    tenant_id: tenantId,
  };
  
  if (notification.id) result.id = notification.id;
  if (notification.userId) result.user_id = notification.userId;
  if (notification.type) result.type = notification.type;
  if (notification.title) result.title = notification.title;
  if (notification.message) result.message = notification.message;
  if (notification.actionUrl !== undefined) result.action_url = notification.actionUrl || null;
  if (notification.read !== undefined) result.read = notification.read;
  
  return result;
}

/**
 * Transform app Activity/AuditLog input to database insert
 */
export function activityToDb(activity: Partial<any>, tenantId: string): any {
  const result: any = {
    tenant_id: tenantId,
  };
  
  if (activity.id) result.id = activity.id;
  if (activity.actorId || activity.user_id) result.user_id = activity.actorId || activity.user_id;
  if (activity.actionType || activity.action_type) result.action_type = activity.actionType || activity.action_type;
  if (activity.subject || activity.description) result.description = activity.subject || activity.description;
  if (activity.entityType !== undefined) result.entity_type = activity.entityType || null;
  if (activity.entityId !== undefined) result.entity_id = activity.entityId || null;
  if (activity.metadata !== undefined) result.metadata = activity.metadata || null;
  
  return result;
}

/**
 * Transform app Onboarding input to database insert
 */
export function onboardingToDb(onboarding: Partial<any>, tenantId: string): any {
  const result: any = {
    tenant_id: tenantId,
  };
  
  if (onboarding.id) result.id = onboarding.id;
  if (onboarding.token) result.token = onboarding.token;
  if (onboarding.firstName) result.first_name = onboarding.firstName;
  if (onboarding.lastName) result.last_name = onboarding.lastName;
  if (onboarding.phone) result.phone = onboarding.phone;
  if (onboarding.branchId) result.branch_id = onboarding.branchId;
  if (onboarding.role) result.role = onboarding.role;
  if (onboarding.createdBy) result.created_by = onboarding.createdBy;
  if (onboarding.completed !== undefined) result.completed = onboarding.completed;
  if (onboarding.completedAt !== undefined) result.completed_at = onboarding.completedAt || null;
  if (onboarding.expiresAt) result.expires_at = onboarding.expiresAt;
  
  return result;
}

/**
 * Transform app UserPreference input to database upsert
 */
export function preferenceToDb(preference: Partial<any>, userId: string): any {
  const result: any = {
    user_id: userId,
  };
  
  if (preference.dateFormat) result.date_format = preference.dateFormat;
  if (preference.defaultReportPeriod) result.default_report_period = preference.defaultReportPeriod;
  
  return result;
}
