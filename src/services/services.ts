/**
 * Mock services with async, API-shaped signatures. Replace mockBranchService / mockSalesService
 * with fetch-based implementations of the same interfaces to go live.
 */
import { supabase } from "@/lib/supabase";
import type {
  ApprovalRequest,
  StockBatch,
  DateFormatPref,
  ReportPeriodPref,
  UserPreference,
  Role,
  User,
  UserStatus,
  Activity,
  Branch,
  BranchStatus,
  Db,
  InventoryMovement,
  InventoryRecord,
  Product,
  ProductStatus,
  Sale,
  StockRequest,
  Target,
  Payment,
  Expense,
  ExpenseCategory,
  ManagerRemittance,
  AppNotification,
  Customer,
  CustomerPayment,
  CustomerPaymentMethod,
  CustomerStatus,
  NotificationType,
} from "@/data/mock-db";
import type {
  OwnerRemittance,
  OwnerRemittancePayeeType,
  OwnerRemittancePaymentMethod,
} from "@/data/remittances";
import { findInventory, getAvailable, getRequestOutstanding } from "@/lib/inventory-calculations";
import { getAccessScope } from "@/lib/session";
import { assignableRoles, canEditMember, roleNeedsBranch } from "@/lib/team";
import { getDb, setDb } from "@/services/mock-store";
import type { ImportRow } from "@/lib/product-import";
import { entityFromAction } from "@/data/auditLogs";
import {
  getPaymentOutstandingAmount,
  getPaymentTotal,
  getRepTotalSales,
  isValidPaymentPeriod,
} from "@/lib/payment-calculations";
import {
  expenseCategories,
  getManagerEligiblePayments,
  getManagerExpenses,
  getManagerNetRemittanceDue,
  getManagerTotalReceived,
  getRemittanceOutstanding,
  validateRemittanceReconciliation,
} from "@/lib/remittance-calculations";

import type { FieldErrors } from "@/lib/validation";
export type { FieldErrors } from "@/lib/validation";
export type Result<T> = { ok: true; data: T } | { ok: false; errors: FieldErrors };
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
export type SaleInput = {
  branchId: string;
  salesRepId: string;
  productId: string;
  quantity: number;
  unitPrice: number;
  saleDate: string;
};
/** Order-level details shared by every line of one sale/order. */
export type SaleOrderInput = {
  customerId?: string | undefined;
  walkInName?: string | undefined;
  walkInPhone?: string | undefined;
};

const latency = () => new Promise((r) => setTimeout(r, 350));
function nowOnReferenceDay(db: Db) {
  const d = new Date();
  return `${db.tenant.referenceDate}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:00`;
}
/** The single audit writer: every module appends to db.activities through here. Never pass secrets. */
export function createAuditLog(
  db: Db,
  actorId: string,
  action: string,
  subject: string,
  ref: {
    entityId?: string;
    branchId?: string | null;
    productId?: string;
    emergency?: boolean;
    metadata?: Activity["metadata"];
  } = {},
): Activity {
  const branchId =
    ref.branchId === undefined
      ? (db.users.find((u) => u.id === actorId)?.branchId ?? undefined)
      : (ref.branchId ?? undefined);
  const entityId = ref.entityId ?? subject.match(/\b(SR-\d+|SAL-\d+)\b/)?.[1];
  const metadata = {
    ...(branchId ? { branchId } : {}),
    ...(ref.productId ? { productId: ref.productId } : {}),
    ...ref.metadata,
  };
  return {
    id: `act-${db.activities.length + 1}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    tenantId: db.tenant.id,
    action,
    subject,
    actorId,
    createdAt: nowOnReferenceDay(db),
    entity: entityFromAction(action),
    ...(entityId ? { entityId } : {}),
    ...(ref.emergency ? { emergency: true } : {}),
    ...(Object.keys(metadata).length ? { metadata } : {}),
  };
}
const activity = createAuditLog;

/** Notifications-ready row for the next approver in a chain (delivery added later). */
export function createNotification(
  db: Db,
  recipientId: string,
  type: NotificationType,
  entityType: AppNotification["entityType"],
  entityId: string,
  message: string,
): AppNotification {
  return {
    id: `ntf-${db.notifications.length + 1}-${Math.random().toString(36).slice(2, 6)}`,
    tenantId: db.tenant.id,
    recipientId,
    type,
    entityType,
    entityId,
    message,
    createdAt: nowOnReferenceDay(db),
  };
}
const storekeeperIds = (db: Db, branchId: string) =>
  db.users
    .filter((u) => u.tenantId === db.tenant.id && u.role === "storekeeper" && u.status === "active" && u.branchId === branchId)
    .map((u) => u.id);
const ownerIds = (db: Db) =>
  db.users
    .filter((u) => u.tenantId === db.tenant.id && u.role === "owner" && u.status === "active")
    .map((u) => u.id);

export function validateBranch(db: Db, input: BranchInput, editingId?: string) {
  const errors: FieldErrors = {};
  if (!input.name.trim()) errors.name = "Branch name is required";
  if (!input.code.trim()) errors.code = "Branch code is required";
  else if (
    db.branches.some(
      (b) => b.id !== editingId && b.code.toLowerCase() === input.code.trim().toLowerCase(),
    )
  )
    errors.code = "This branch code is already in use";
  if (!input.location.trim()) errors.location = "Location is required";
  if (input.email && !/^\S+@\S+\.\S+$/.test(input.email)) errors.email = "Enter a valid email";
  if (input.managerId) {
    const manager = db.users.find((x) => x.id === input.managerId);
    if (!manager || manager.role !== "manager" || manager.status !== "active")
      errors.managerId = "Select an active manager";
    else if (
      db.branches.some(
        (b) => b.id !== editingId && b.managerId === manager.id && b.status === "active",
      )
    )
      errors.managerId = "This manager already runs another active branch";
  }
  return errors;
}

/** Assign the manager to the branch and release the previous manager. */
function reassignManager(
  db: Db,
  branchId: string,
  previousManagerId: string | null,
  managerId: string | null,
) {
  return db.users.map((x) => {
    if (managerId && x.id === managerId) return { ...x, branchId };
    if (x.id === previousManagerId && previousManagerId !== managerId)
      return { ...x, branchId: null };
    return x;
  });
}

export const mockBranchService = {
  async create(input: BranchInput, actorId: string): Promise<Result<Branch>> {
    await latency();
    const current = getDb();
    const errors = validateBranch(current, input);
    if (Object.keys(errors).length) return { ok: false, errors };
    const branch: Branch = {
      id: `branch-${String(current.branches.length + 1).padStart(3, "0")}`,
      tenantId: current.tenant.id,
      ...input,
      managerId: input.managerId || null,
      name: input.name.trim(),
      code: input.code.trim().toUpperCase(),
      createdAt: current.tenant.referenceDate,
    };
    setDb((d) => ({
      ...d,
      branches: [...d.branches, branch],
      users: reassignManager(d, branch.id, null, input.managerId || null),
      activities: [
        activity(d, actorId, "Branch created", `${branch.name} · ${branch.code}`),
        ...d.activities,
      ],
    }));
    return { ok: true, data: branch };
  },
  async update(id: string, input: BranchInput, actorId: string): Promise<Result<Branch>> {
    await latency();
    const current = getDb();
    const existing = current.branches.find((b) => b.id === id);
    if (!existing) return { ok: false, errors: { form: "Branch not found" } };
    const errors = validateBranch(current, input, id);
    if (Object.keys(errors).length) return { ok: false, errors };
    const branch: Branch = {
      ...existing,
      ...input,
      managerId: input.managerId || null,
      name: input.name.trim(),
      code: input.code.trim().toUpperCase(),
    };
    setDb((d) => ({
      ...d,
      branches: d.branches.map((b) => (b.id === id ? branch : b)),
      users: reassignManager(d, id, existing.managerId, input.managerId || null),
      activities: [activity(d, actorId, "Branch updated", branch.name), ...d.activities],
    }));
    return { ok: true, data: branch };
  },
  /** Soft-delete: history (sales, inventory, staff links) is preserved. */
  async deactivate(id: string, actorId: string): Promise<Result<Branch>> {
    await latency();
    const existing = getDb().branches.find((b) => b.id === id);
    if (!existing) return { ok: false, errors: { form: "Branch not found" } };
    const branch = { ...existing, status: "inactive" as const };
    setDb((d) => ({
      ...d,
      branches: d.branches.map((b) => (b.id === id ? branch : b)),
      activities: [activity(d, actorId, "Branch deactivated", branch.name), ...d.activities],
    }));
    return { ok: true, data: branch };
  },
};

export function validateSale(db: Db, input: SaleInput) {
  const errors: FieldErrors = {};
  const branch = db.branches.find((b) => b.id === input.branchId && b.tenantId === db.tenant.id);
  if (!branch) errors.branchId = "Branch is required";
  else if (branch.status !== "active")
    errors.branchId = "Sales can only be recorded for active branches";
  const rep = db.users.find((x) => x.id === input.salesRepId);
  if (!rep) errors.salesRepId = "Seller is required";
  else if (rep.role === "sales_rep" && rep.branchId !== input.branchId)
    errors.salesRepId = "Rep must belong to the selected branch";
  else if (rep.role !== "sales_rep" && rep.role !== "owner")
    errors.salesRepId = "Seller cannot record sales";
  else if (rep.role === "owner" && rep.tenantId !== db.tenant.id)
    errors.salesRepId = "Owner must belong to this tenant";
  const saleProduct = db.products.find(
    (pr) => pr.id === input.productId && pr.tenantId === db.tenant.id,
  );
  if (!saleProduct) errors.productId = "Product is required";
  else if (saleProduct.status !== "active")
    errors.productId = "This product is inactive and cannot be sold";
  if (!Number.isInteger(input.quantity) || input.quantity <= 0)
    errors.quantity = "Quantity must be greater than zero";
  else if (branch && !errors.productId) {
    const inv = findInventory(db, input.branchId, input.productId);
    const available = inv ? getAvailable(inv) : 0;
    if (input.quantity > available)
      errors.quantity = `Insufficient stock — only ${available} available at this branch`;
  }
  if (!Number.isFinite(input.unitPrice) || input.unitPrice <= 0)
    errors.unitPrice = "Enter a valid unit price";
  if (!input.saleDate) errors.saleDate = "Sale date is required";
  else if (input.saleDate > db.tenant.referenceDate)
    errors.saleDate = "Sale date cannot be in the future";
  return errors;
}

export const mockSalesService = {
  async record(input: SaleInput, actorId: string): Promise<Result<Sale>> {
    const result = await this.recordMany([input], actorId);
    return result.ok ? { ok: true, data: result.data[0]! } : result;
  },
  async recordMany(
    inputs: SaleInput[],
    actorId: string,
    order: SaleOrderInput = {},
  ): Promise<Result<Sale[]>> {
    await latency();
    const current = getDb();
    const actor = getAccessScope(current, actorId);
    if (order.customerId) {
      const customer = current.customers.find(
        (c) => c.id === order.customerId && c.tenantId === current.tenant.id,
      );
      if (!actor.canManageCustomers)
        return {
          ok: false,
          errors: { form: "Only sales representatives can raise customer orders" },
        };
      if (!customer || customer.status !== "active")
        return { ok: false, errors: { customerId: "Choose an active customer" } };
      if (customer.branchId && actor.user.branchId && customer.branchId !== actor.user.branchId)
        return { ok: false, errors: { customerId: "This customer belongs to another branch" } };
    }
    // Sales reps always record against themselves, their branch and tenant.
    if (!inputs.length) return { ok: false, errors: { items: "Add at least one item" } };
    if (
      actor.user.id !== actorId ||
      actor.user.status !== "active" ||
      actor.user.tenantId !== current.tenant.id
    )
      return { ok: false, errors: { form: "Your account is not active in this organization" } };
    if (actor.repId)
      inputs = inputs.map((input) => ({
        ...input,
        salesRepId: actor.repId!,
        branchId: actor.user.branchId ?? input.branchId,
        unitPrice:
          current.products.find((p) => p.id === input.productId)?.unitPrice ?? input.unitPrice,
      }));
    else if (actor.user.role === "owner")
      inputs = inputs.map((input) => ({
        ...input,
        salesRepId: actor.user.id,
        unitPrice:
          current.products.find((product) => product.id === input.productId)?.unitPrice ??
          input.unitPrice,
      }));
    if (!actor.canRecordSales) return { ok: false, errors: { form: "You cannot record sales" } };
    const errors: FieldErrors = {};
    const demand = new Map<string, number>();
    inputs.forEach((input, index) => {
      const rowErrors = validateSale(current, input);
      if (
        input.branchId &&
        input.productId &&
        Number.isInteger(input.quantity) &&
        input.quantity > 0
      ) {
        const key = `${input.branchId}:${input.productId}`;
        demand.set(key, (demand.get(key) ?? 0) + input.quantity);
        const available = getAvailable(
          findInventory(current, input.branchId, input.productId) ?? {
            quantityOnHand: 0,
            quantityReserved: 0,
          },
        );
        if ((demand.get(key) ?? 0) > available)
          rowErrors.quantity = `Insufficient stock — ${available} available for all lines`;
      }
      if (Object.keys(rowErrors).length) (errors.itemErrors ??= {})[index] = rowErrors;
    });
    if (Object.keys(errors.itemErrors ?? {}).length)
      errors.items = "Review the highlighted sale items";
    if (Object.keys(errors).length) return { ok: false, errors };
    let next = current;
    const orderId = `ORD-${10001 + current.sales.length}`;
    const walkInName = order.walkInName?.trim();
    const walkInPhone = order.walkInPhone?.trim();
    const sales: Sale[] = inputs.map((input, index) => {
      const n = current.sales.length + index + 1;
      return {
        id: `sale-${String(n).padStart(5, "0")}`,
        tenantId: current.tenant.id,
        code: `SAL-${10000 + n}`,
        ...input,
        orderId,
        ...(order.customerId
          ? { customerId: order.customerId }
          : {
              ...(walkInName ? { walkInName } : {}),
              ...(walkInPhone ? { walkInPhone } : {}),
            }),
        createdAt:
          input.saleDate === current.tenant.referenceDate
            ? nowOnReferenceDay(current)
            : `${input.saleDate}T12:00:00`,
        status: "completed" as const,
      };
    });
    for (const sale of sales) {
      next = applyInventoryChange(next, {
        branchId: sale.branchId,
        productId: sale.productId,
        delta: -sale.quantity,
        type: "sale",
        referenceType: "sale",
        referenceId: sale.id,
        performedBy: actorId,
        at: sale.createdAt,
      });
    }
    const logs = sales.map((sale) => {
      const product = current.products.find((pr) => pr.id === sale.productId);
      const branch = current.branches.find((b) => b.id === sale.branchId);
      return activity(
        current,
        actorId,
        "Sale recorded",
        `${branch?.name} · ${product?.name} × ${sale.quantity}`,
        {
          entityId: sale.id,
          branchId: sale.branchId,
          productId: sale.productId,
          metadata: {
            salesRepId: sale.salesRepId,
            saleType: sale.customerId ? "customer" : "walk_in",
            ...(sale.customerId ? { customerId: sale.customerId } : {}),
            orderId,
          },
        },
      );
    });
    setDb((d) => ({
      ...next,
      sales: [...d.sales, ...sales],
      activities: [...logs.reverse(), ...d.activities],
    }));
    return { ok: true, data: sales };
  },
};

// ---------- inventory ----------
type InventoryChange = {
  branchId: string;
  productId: string;
  delta: number;
  type: InventoryMovement["type"];
  referenceType?: InventoryMovement["referenceType"];
  referenceId?: string | undefined;
  performedBy: string;
  at: string;
  note?: string | undefined;
  /** For additions: the received lot. Removals always consume batches first-expiry-first-out. */
  batch?: { batchNumber: string; expiryDate: string } | undefined;
};

/** FEFO: removals drain the earliest-expiring batches; additions with batch info open/extend a lot. */
function applyBatches(d: Db, c: InventoryChange): StockBatch[] {
  const all = d.stockBatches;
  if (c.delta > 0) {
    if (!c.batch?.expiryDate) return all;
    const same = all.find((b) => b.branchId === c.branchId && b.productId === c.productId && b.batchNumber === c.batch!.batchNumber && b.expiryDate === c.batch!.expiryDate);
    if (same) return all.map((b) => (b === same ? { ...b, quantityReceived: b.quantityReceived + c.delta, quantityRemaining: b.quantityRemaining + c.delta } : b));
    return [...all, { id: `bat-${all.length + 1}-${c.at.replace(/\D/g, "")}`, tenantId: d.tenant.id, branchId: c.branchId, productId: c.productId, batchNumber: c.batch.batchNumber || "—", expiryDate: c.batch.expiryDate, quantityReceived: c.delta, quantityRemaining: c.delta, receivedAt: c.at }];
  }
  let left = -c.delta;
  const order = all
    .filter((b) => b.branchId === c.branchId && b.productId === c.productId && b.quantityRemaining > 0)
    .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));
  const take = new Map<string, number>();
  for (const b of order) { if (left <= 0) break; const t = Math.min(left, b.quantityRemaining); take.set(b.id, t); left -= t; }
  return all.map((b) => (take.has(b.id) ? { ...b, quantityRemaining: b.quantityRemaining - take.get(b.id)! } : b));
}

/**
 * The ONLY path that changes quantityOnHand. Every change writes a matching movement,
 * and callers must validate first — a change that would go negative is refused.
 */
export function applyInventoryChange(d: Db, c: InventoryChange): Db {
  const existing = findInventory(d, c.branchId, c.productId);
  const onHand = (existing?.quantityOnHand ?? 0) + c.delta;
  if (onHand < 0) throw new Error("Inventory can never become negative");
  const record: InventoryRecord = existing
    ? {
        ...existing,
        quantityOnHand: onHand,
        quantityReserved: Math.min(existing.quantityReserved, onHand),
        lastUpdated: c.at,
      }
    : {
        id: `inv-${c.branchId.slice(-3)}-${c.productId.slice(-3)}`,
        tenantId: d.tenant.id,
        branchId: c.branchId,
        productId: c.productId,
        quantityOnHand: onHand,
        quantityReserved: 0,
        lowStockThreshold: 10,
        reorderLevel: 20,
        lastUpdated: c.at,
      };
  const movement: InventoryMovement = {
    id: `mov-${String(d.inventoryMovements.length + 1).padStart(5, "0")}`,
    tenantId: d.tenant.id,
    branchId: c.branchId,
    productId: c.productId,
    type: c.type,
    quantity: c.delta,
    performedBy: c.performedBy,
    createdAt: c.at,
    ...(c.referenceType ? { referenceType: c.referenceType } : {}),
    ...(c.referenceId ? { referenceId: c.referenceId } : {}),
    ...(c.note ? { note: c.note } : {}),
  };
  return {
    ...d,
    inventory: existing
      ? d.inventory.map((i) => (i.id === existing.id ? record : i))
      : [...d.inventory, record],
    inventoryMovements: [...d.inventoryMovements, movement],
    stockBatches: applyBatches(d, c),
  };
}

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
const labels = (d: Db, branchId: string, productId: string) =>
  `${d.branches.find((b) => b.id === branchId)?.name} · ${d.products.find((p) => p.id === productId)?.name}`;
const nextApprovalId = (d: Db) =>
  `APR-${Math.max(2000, ...d.approvals.map((a) => Number(a.id.split("-")[1]) || 0)) + 1}`;


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
export function validateProduct(db: Db, input: ProductInput, editingId?: string) {
  const errors: FieldErrors = {};
  const sku = input.sku.trim().toUpperCase();
  if (!input.name.trim()) errors.name = "Enter a product name";
  if (!sku) errors.sku = "Enter a SKU";
  else if (
    db.products.some(
      (p) => p.id !== editingId && p.tenantId === db.tenant.id && p.sku.toUpperCase() === sku,
    )
  )
    errors.sku = "This SKU is already used by another product";
  if (!input.category.trim()) errors.category = "Enter a category";
  if (!input.unit.trim()) errors.unit = "Select a unit";
  if (!Number.isFinite(input.unitPrice) || input.unitPrice <= 0)
    errors.unitPrice = "Enter a selling price above zero";
  if (!Number.isFinite(input.unitCost) || input.unitCost < 0)
    errors.unitCost = "Enter a unit cost of zero or more";
  else if (input.unitCost > input.unitPrice)
    errors.unitCost = "Unit cost cannot exceed selling price";
  if (!Number.isInteger(input.lowStockThreshold) || input.lowStockThreshold < 0)
    errors.threshold = "Enter a whole number of zero or more";
  return errors;
}
const clean = (input: ProductInput) => ({
  name: input.name.trim(),
  sku: input.sku.trim().toUpperCase(),
  category: input.category.trim(),
  unit: input.unit.trim(),
  unitPrice: input.unitPrice,
  unitCost: input.unitCost,
  lowStockThreshold: input.lowStockThreshold,
  ...(input.description?.trim() ? { description: input.description.trim() } : {}),
});

export type ImportSummary = {
  created: number; updated: number; skipped: number; failed: number;
  failures: { rowNumber: number; sku: string; name: string; reason: string }[];
};

export const mockProductService = {
  /**
   * Bulk import. Rows must already be validated (lib/product-import); they are re-checked here.
   * Opening stock goes through applyInventoryChange into `branchId`, with the row's batch/expiry.
   */
  async importProducts(rows: ImportRow[], mode: "update" | "skip", branchId: string, actorId: string): Promise<Result<ImportSummary>> {
    await latency();
    const current = getDb();
    const scope = getAccessScope(current, actorId);
    if (!scope.canManageProducts) return { ok: false, errors: { form: "You cannot import products" } };
    const branch = current.branches.find((b) => b.id === branchId && b.status === "active");
    if (rows.some((r) => r.openingQuantity > 0) && (!branch || (scope.branchIds && !scope.branchIds.includes(branchId))))
      return { ok: false, errors: { form: "Choose one of your active branches for opening stock" } };
    const summary: ImportSummary = { created: 0, updated: 0, skipped: 0, failed: 0, failures: [] };
    const at = nowOnReferenceDay(current);
    setDb((d0) => {
      let d = d0;
      for (const r of rows) {
        const input: ProductInput = { name: r.name, sku: r.sku, category: r.category, unit: r.unit, unitPrice: r.unitPrice, unitCost: r.unitCost, lowStockThreshold: r.lowStockThreshold, description: r.description };
        const existing = d.products.find((p) => p.sku.toUpperCase() === r.sku.toUpperCase());
        if (r.errors.length) { summary.failed++; summary.failures.push({ rowNumber: r.rowNumber, sku: r.sku, name: r.name, reason: r.errors.join("; ") }); continue; }
        if (existing && mode === "skip") { summary.skipped++; summary.failures.push({ rowNumber: r.rowNumber, sku: r.sku, name: r.name, reason: "Skipped: SKU already exists" }); continue; }
        const errs = validateProduct(d, input, existing?.id);
        if (Object.keys(errs).length) { summary.failed++; summary.failures.push({ rowNumber: r.rowNumber, sku: r.sku, name: r.name, reason: Object.values(errs).join("; ") }); continue; }
        let productId: string;
        if (existing) {
          const { description: _x, ...rest } = existing;
          d = { ...d, products: d.products.map((p) => (p.id === existing.id ? { ...rest, ...clean(input), updatedAt: at } : p)), activities: [activity(d, actorId, "Product updated", `${existing.name} · ${existing.sku} · via import`), ...d.activities] };
          productId = existing.id;
          summary.updated++;
        } else {
          productId = `product-${String(d.products.length + 1).padStart(3, "0")}-${Date.now().toString(36)}`;
          const product: Product = { id: productId, tenantId: d.tenant.id, ...clean(input), status: "active", createdAt: at, updatedAt: at };
          const bIds = scope.branchIds ?? d.branches.filter((b) => b.status === "active").map((b) => b.id);
          const records: InventoryRecord[] = bIds.map((bid, i) => ({ id: `inv-${productId}-${i}`, tenantId: d.tenant.id, branchId: bid, productId, quantityOnHand: 0, quantityReserved: 0, lowStockThreshold: input.lowStockThreshold, reorderLevel: input.lowStockThreshold * 2, lastUpdated: at }));
          d = { ...d, products: [...d.products, product], inventory: [...d.inventory, ...records], activities: [activity(d, actorId, "Product created", `${product.name} · ${product.sku} · via import`), ...d.activities] };
          summary.created++;
        }
        if (r.openingQuantity > 0) {
          d = applyInventoryChange(d, { branchId, productId, delta: r.openingQuantity, type: "stock_added", referenceType: "manual", performedBy: actorId, at, note: "Opening stock from import", batch: r.expiryDate ? { batchNumber: r.batchNumber, expiryDate: r.expiryDate } : undefined });
          d = { ...d, activities: [activity(d, actorId, "Stock added", `${labels(d, branchId, productId)} · +${r.openingQuantity} opening stock (import)`, { branchId, productId }), ...d.activities] };
        }
      }
      return { ...d, activities: [activity(d, actorId, "Products imported", `${summary.created} created · ${summary.updated} updated · ${summary.skipped} skipped · ${summary.failed} failed`), ...d.activities] };
    });
    return { ok: true, data: summary };
  },
  /** Adds to the shared catalogue and opens zero-stock inventory records in the actor's branches. */
  async create(input: ProductInput, actorId: string): Promise<Result<Product>> {
    await latency();
    const current = getDb();
    const scope = getAccessScope(current, actorId);
    if (!scope.canManageProducts) return { ok: false, errors: { form: "You cannot add products" } };
    const errors = validateProduct(current, input);
    if (Object.keys(errors).length) return { ok: false, errors };
    const at = nowOnReferenceDay(current);
    const product: Product = {
      id: `product-${String(current.products.length + 1).padStart(3, "0")}-${Date.now().toString(36)}`,
      tenantId: current.tenant.id,
      ...clean(input),
      status: "active",
      createdAt: at,
      updatedAt: at,
    };
    const branchIds =
      scope.branchIds ?? current.branches.filter((b) => b.status === "active").map((b) => b.id);
    const records: InventoryRecord[] = branchIds.map((branchId, i) => ({
      id: `inv-${product.id}-${i}`,
      tenantId: current.tenant.id,
      branchId,
      productId: product.id,
      quantityOnHand: 0,
      quantityReserved: 0,
      lowStockThreshold: input.lowStockThreshold,
      reorderLevel: input.lowStockThreshold * 2,
      lastUpdated: at,
    }));
    setDb((d) => ({
      ...d,
      products: [...d.products, product],
      inventory: [...d.inventory, ...records],
      activities: [
        activity(d, actorId, "Product created", `${product.name} · ${product.sku}`),
        ...d.activities,
      ],
    }));
    return { ok: true, data: product };
  },
  /** Edits catalogue fields; branch thresholds still on the old default follow the new default. */
  async update(id: string, input: ProductInput, actorId: string): Promise<Result<Product>> {
    await latency();
    const current = getDb();
    if (!getAccessScope(current, actorId).canManageProducts)
      return { ok: false, errors: { form: "You cannot edit products" } };
    const existing = current.products.find((p) => p.id === id);
    if (!existing) return { ok: false, errors: { form: "Product not found" } };
    const errors = validateProduct(current, input, id);
    if (Object.keys(errors).length) return { ok: false, errors };
    const { description: _drop, ...rest } = existing;
    const product: Product = { ...rest, ...clean(input), updatedAt: nowOnReferenceDay(current) };
    setDb((d) => ({
      ...d,
      products: d.products.map((p) => (p.id === id ? product : p)),
      inventory: d.inventory.map((i) =>
        i.productId === id && i.lowStockThreshold === existing.lowStockThreshold
          ? { ...i, lowStockThreshold: product.lowStockThreshold }
          : i,
      ),
      activities: [
        activity(d, actorId, "Product edited", `${product.name} · ${product.sku}`),
        ...d.activities,
      ],
    }));
    return { ok: true, data: product };
  },
  /** Soft status change — history (sales, requests, movements) stays intact. */
  async setStatus(id: string, status: ProductStatus, actorId: string): Promise<Result<Product>> {
    await latency();
    const current = getDb();
    const ps = getAccessScope(current, actorId);
    if (
      status === "inactive"
        ? !ps.canDeactivateProducts
        : !(ps.canDeactivateProducts || ps.canManageProducts)
    )
      return {
        ok: false,
        errors: {
          form: ps.canManageProducts
            ? "Deactivation needs a manager's approval — send a request instead"
            : "You cannot change product status",
        },
      };
    const existing = current.products.find((p) => p.id === id);
    if (!existing) return { ok: false, errors: { form: "Product not found" } };
    const product: Product = { ...existing, status, updatedAt: nowOnReferenceDay(current) };
    setDb((d) => ({
      ...d,
      products: d.products.map((p) => (p.id === id ? product : p)),
      activities: [
        activity(
          d,
          actorId,
          status === "active" ? "Product activated" : "Product deactivated",
          `${product.name} · ${product.sku}`,
        ),
        ...d.activities,
      ],
    }));
    return { ok: true, data: product };
  },
};

/** Storekeeper asks their Manager to deactivate a product. */
export async function requestProductDeactivation(
  productId: string,
  reason: string,
  actorId: string,
): Promise<Result<ApprovalRequest>> {
  await latency();
  const current = getDb();
  const scope = getAccessScope(current, actorId);
  if (!scope.canManageProducts || scope.canDeactivateProducts)
    return { ok: false, errors: { form: "You cannot request product deactivation" } };
  const product = current.products.find((p) => p.id === productId);
  if (!product) return { ok: false, errors: { form: "Product not found" } };
  if (product.status !== "active")
    return { ok: false, errors: { form: "This product is already inactive" } };
  if (
    current.approvals.some(
      (a) =>
        a.type === "product_deactivation" && a.status === "pending" && a.productId === productId,
    )
  )
    return {
      ok: false,
      errors: { form: "A deactivation request for this product is already pending" },
    };
  if (reason.trim().length < 3)
    return { ok: false, errors: { reason: "Give a reason for the manager" } };
  const approval: ApprovalRequest = {
    id: nextApprovalId(current),
    tenantId: current.tenant.id,
    type: "product_deactivation",
    status: "pending",
    branchId: scope.user.branchId,
    requestedBy: actorId,
    requestedAt: nowOnReferenceDay(current),
    productId,
    note: reason.trim(),
  };
  setDb((d) => ({
    ...d,
    approvals: [approval, ...d.approvals],
    activities: [
      activity(
        d,
        actorId,
        "Product deactivation requested",
        `${approval.id} · ${product.name} · ${approval.note}`,
        { entityId: approval.id, productId },
      ),
      ...d.activities,
    ],
  }));
  return { ok: true, data: approval };
}

// ---------- targets ----------
export type TargetInput = { repId: string; month: string; amount: number };
export function validateTarget(db: Db, input: TargetInput, actorId: string, editingId?: string) {
  const errors: FieldErrors = {};
  const scope = getAccessScope(db, actorId);
  const rep = db.users.find((u) => u.id === input.repId);
  if (!rep) errors.repId = "Select a sales representative";
  else if (rep.role !== "sales_rep")
    errors.repId = "Targets can only be set for sales representatives";
  else if (rep.status !== "active") errors.repId = "This sales representative is inactive";
  else if (!rep.branchId) errors.repId = "This sales representative has no branch";
  else if (scope.branchIds && !scope.branchIds.includes(rep.branchId))
    errors.repId = "You can only set targets for your branch";
  if (!/^\d{4}-\d{2}$/.test(input.month)) errors.month = "Select a month";
  if (!Number.isFinite(input.amount) || input.amount <= 0)
    errors.amount = "Enter a target above zero";
  if (
    !errors.repId &&
    !errors.month &&
    db.targets.some(
      (t) =>
        t.id !== editingId &&
        t.scope === "rep" &&
        t.userId === input.repId &&
        t.month === input.month,
    )
  )
    errors.repId = "This rep already has a target for that month — edit it instead";
  return errors;
}
export const mockTargetService = {
  async create(input: TargetInput, actorId: string): Promise<Result<Target>> {
    await latency();
    const current = getDb();
    if (!getAccessScope(current, actorId).canManageTargets)
      return { ok: false, errors: { form: "You cannot set targets" } };
    const errors = validateTarget(current, input, actorId);
    if (Object.keys(errors).length) return { ok: false, errors };
    const rep = current.users.find((u) => u.id === input.repId)!;
    const at = nowOnReferenceDay(current);
    const target: Target = {
      id: `target-${rep.id}-${input.month}`,
      tenantId: current.tenant.id,
      scope: "rep",
      branchId: rep.branchId!,
      userId: rep.id,
      month: input.month,
      amount: Math.round(input.amount),
      createdAt: at,
      updatedAt: at,
    };
    setDb((d) => ({
      ...d,
      targets: [...d.targets, target],
      activities: [
        activity(
          d,
          actorId,
          "Target created",
          `${rep.name} · ${input.month} · ₦${target.amount.toLocaleString("en-NG")}`,
        ),
        ...d.activities,
      ],
    }));
    return { ok: true, data: target };
  },
  /** Changes only the amount — sales history is never touched. */
  async update(id: string, amount: number, actorId: string): Promise<Result<Target>> {
    await latency();
    const current = getDb();
    const existing = current.targets.find((t) => t.id === id && t.scope === "rep");
    if (!existing) return { ok: false, errors: { form: "Target not found" } };
    if (!getAccessScope(current, actorId).canManageTargets)
      return { ok: false, errors: { form: "You cannot edit targets" } };
    const errors = validateTarget(
      current,
      { repId: existing.userId ?? "", month: existing.month, amount },
      actorId,
      id,
    );
    if (Object.keys(errors).length) return { ok: false, errors };
    const target: Target = {
      ...existing,
      amount: Math.round(amount),
      updatedAt: nowOnReferenceDay(current),
    };
    const rep = current.users.find((u) => u.id === existing.userId)?.name;
    setDb((d) => ({
      ...d,
      targets: d.targets.map((t) => (t.id === id ? target : t)),
      activities: [
        activity(
          d,
          actorId,
          "Target updated",
          `${rep} · ${existing.month} · ₦${existing.amount.toLocaleString("en-NG")} → ₦${target.amount.toLocaleString("en-NG")}`,
        ),
        ...d.activities,
      ],
    }));
    return { ok: true, data: target };
  },
};

// Swap points for the live API.
// ---------- team (views over db.users; never deletes) ----------
export type TeamMemberInput = {
  name: string;
  email: string;
  role: Role;
  branchId: string;
  status: UserStatus;
};
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function validateTeamMember(
  db: Db,
  input: TeamMemberInput,
  actorId: string,
  editingId?: string,
) {
  const scope = getAccessScope(db, actorId);
  const e: FieldErrors = {};
  const existing = editingId ? db.users.find((u) => u.id === editingId) : undefined;
  if (!scope.canManageTeam) e.form = "You don't have permission to manage the team.";
  if (existing && !canEditMember(scope, existing)) e.form = "You can't edit this team member.";
  if (input.name.trim().length < 2) e.name = "Enter the member's full name.";
  const email = input.email.trim().toLowerCase();
  if (!email) e.email = "Email is required.";
  else if (!EMAIL.test(email)) e.email = "Enter a valid email address.";
  else if (db.users.some((u) => u.email.toLowerCase() === email && u.id !== editingId))
    e.email = "Someone on the team already uses this email.";
  const roleUnchanged = existing?.role === input.role;
  if (!assignableRoles(scope).includes(input.role) && !roleUnchanged)
    e.role = "You can't assign this role.";
  const branch = db.branches.find((b) => b.id === input.branchId);
  if (roleNeedsBranch(input.role) && !input.branchId)
    e.branchId = "Select the branch this member works at.";
  if (input.branchId) {
    if (!branch || branch.tenantId !== db.tenant.id) e.branchId = "Select a valid branch.";
    else if (scope.branchIds && !scope.branchIds.includes(branch.id))
      e.branchId = "You can only assign members to your own branch.";
    else if (branch.status !== "active" && input.status === "active")
      e.branchId = "This branch is inactive.";
    else if (
      input.role === "manager" &&
      branch.managerId &&
      branch.managerId !== editingId &&
      db.users.find((u) => u.id === branch.managerId)?.status === "active"
    )
      e.branchId = `${branch.name} already has a manager.`;
  }
  if (!["active", "inactive", "pending"].includes(input.status))
    e.status = "Choose a valid status.";
  return e;
}
const branchManager = (d: Db, role: Role, branchId: string | null) =>
  (role === "storekeeper" || role === "sales_rep") && branchId
    ? (d.branches.find((b) => b.id === branchId)?.managerId ?? null)
    : null;
/** Keep branch.managerId in sync when a manager is (re)assigned. */
function syncBranches(d: Db, user: User, previous?: User) {
  return d.branches.map((b) => {
    if (
      previous?.role === "manager" &&
      b.managerId === user.id &&
      (user.role !== "manager" || b.id !== user.branchId)
    )
      return { ...b, managerId: null };
    if (user.role === "manager" && b.id === user.branchId && !b.managerId)
      return { ...b, managerId: user.id };
    return b;
  });
}

export const mockTeamService = {
  /** Owner only — managers go through requestMember so the Owner approves new accounts. */
  async create(input: TeamMemberInput, actorId: string): Promise<Result<User>> {
    await latency();
    const db = getDb();
    if (getAccessScope(db, actorId).user.role !== "owner")
      return { ok: false, errors: { form: "New team members need the Owner's approval." } };
    const errors = validateTeamMember(db, input, actorId);
    if (Object.keys(errors).length) return { ok: false, errors };
    const n = db.users.reduce((m, u) => Math.max(m, Number(u.id.slice(5)) || 0), 0) + 1;
    const branchId = input.branchId || null;
    const user: User = {
      id: `user-${String(n).padStart(3, "0")}`,
      tenantId: db.tenant.id,
      name: input.name.trim(),
      email: input.email.trim().toLowerCase(),
      role: input.role,
      branchId,
      managerId: branchManager(db, input.role, branchId),
      status: input.status,
      createdAt: nowOnReferenceDay(db),
    };
    setDb((d) => ({
      ...d,
      users: [...d.users, user],
      branches: syncBranches(d, user),
      // Onboarding invites are now created via onboardingService.createInvite (Supabase);
      // the mock team-create path no longer generates onboarding records.
      activities: [
        activity(
          d,
          actorId,
          "Team member created",
          `${user.name} · ${input.role.replace("_", " ")}`,
        ),
        ...d.activities,
      ],
    }));
    return { ok: true, data: user };
  },
  /** Manager proposes a new member; nothing is added to the team until the Owner approves. */
  async requestMember(input: TeamMemberInput, actorId: string): Promise<Result<ApprovalRequest>> {
    await latency();
    const db = getDb();
    const errors = validateTeamMember(db, { ...input, status: "pending" }, actorId);
    const email = input.email.trim().toLowerCase();
    if (
      !errors.email &&
      db.approvals.some(
        (a) => a.type === "team_member" && a.status === "pending" && a.member?.email === email,
      )
    )
      errors.email = "A request for this email is already waiting for approval.";
    if (Object.keys(errors).length) return { ok: false, errors };
    const approval: ApprovalRequest = {
      id: nextApprovalId(db),
      tenantId: db.tenant.id,
      type: "team_member",
      status: "pending",
      branchId: input.branchId || null,
      requestedBy: actorId,
      requestedAt: nowOnReferenceDay(db),
      member: {
        name: input.name.trim(),
        email,
        role: input.role,
        branchId: input.branchId || null,
      },
    };
    setDb((d) => ({
      ...d,
      approvals: [approval, ...d.approvals],
      activities: [
        activity(
          d,
          actorId,
          "Team member request submitted",
          `${approval.id} · ${approval.member!.name} · ${input.role.replace("_", " ")}`,
          { entityId: approval.id },
        ),
        ...d.activities,
      ],
    }));
    return { ok: true, data: approval };
  },
  async update(id: string, input: TeamMemberInput, actorId: string): Promise<Result<User>> {
    await latency();
    const db = getDb();
    const prev = db.users.find((u) => u.id === id);
    if (!prev) return { ok: false, errors: { form: "Team member not found." } };
    const errors = validateTeamMember(db, input, actorId, id);
    if (Object.keys(errors).length) return { ok: false, errors };
    const branchId = input.branchId || null;
    const user: User = {
      ...prev,
      name: input.name.trim(),
      email: input.email.trim().toLowerCase(),
      role: input.role,
      branchId,
      managerId: branchManager(db, input.role, branchId),
      status: input.status,
    };
    const branchName = (bid: string | null) =>
      db.branches.find((b) => b.id === bid)?.name ?? "Unassigned";
    setDb((d) => {
      const acts = [activity(d, actorId, "Team member edited", user.name)];
      if (prev.role !== user.role)
        acts.push(
          activity(
            d,
            actorId,
            "Role changed",
            `${user.name} · ${prev.role.replace("_", " ")} → ${user.role.replace("_", " ")}`,
          ),
        );
      if (prev.branchId !== user.branchId)
        acts.push(
          activity(
            d,
            actorId,
            "Branch assignment changed",
            `${user.name} · ${branchName(prev.branchId)} → ${branchName(user.branchId)}`,
          ),
        );
      if (prev.status !== user.status)
        acts.push(
          activity(
            d,
            actorId,
            user.status === "active" ? "Team member activated" : "Team member deactivated",
            user.name,
          ),
        );
      return {
        ...d,
        users: d.users.map((u) => (u.id === id ? user : u)),
        branches: syncBranches(d, user, prev),
        activities: [...acts.reverse(), ...d.activities],
      };
    });
    return { ok: true, data: user };
  },
  /** Soft (de)activation — sales, targets, requests and movements keep referencing the user. */
  async setStatus(
    id: string,
    status: "active" | "inactive",
    actorId: string,
  ): Promise<Result<User>> {
    await latency();
    const db = getDb();
    const prev = db.users.find((u) => u.id === id);
    if (!prev || !canEditMember(getAccessScope(db, actorId), prev))
      return { ok: false, errors: { form: "You can't change this member's status." } };
    const user = { ...prev, status };
    setDb((d) => ({
      ...d,
      users: d.users.map((u) => (u.id === id ? user : u)),
      activities: [
        activity(
          d,
          actorId,
          status === "active" ? "Team member activated" : "Team member deactivated",
          user.name,
        ),
        ...d.activities,
      ],
    }));
    return { ok: true, data: user };
  },
};

// ---------- approvals (Storekeeper → Manager, Manager → Owner) ----------
export function canReviewApproval(db: Db, actorId: string, a: ApprovalRequest) {
  const scope = getAccessScope(db, actorId);
  if (!scope.canReviewApprovals || a.requestedBy === actorId) return false;
  if (scope.user.role === "owner") return true;
  return a.type !== "team_member" && !!a.branchId && !!scope.branchIds?.includes(a.branchId);
}
export const mockApprovalService = {
  async approve(id: string, actorId: string): Promise<Result<ApprovalRequest>> {
    await latency();
    const db = getDb();
    const a = db.approvals.find((x) => x.id === id);
    if (!a) return { ok: false, errors: { form: "Request not found" } };
    if (!canReviewApproval(db, actorId, a))
      return { ok: false, errors: { form: "You can't review this request" } };
    if (a.status !== "pending")
      return { ok: false, errors: { form: "This request was already reviewed" } };
    const at = nowOnReferenceDay(db);
    if (
      a.type === "product_deactivation" &&
      db.products.find((p) => p.id === a.productId)?.status !== "active"
    )
      return { ok: false, errors: { form: "This product is already inactive" } };
    if (a.type === "team_member" && db.users.some((u) => u.email.toLowerCase() === a.member?.email))
      return { ok: false, errors: { form: "Someone on the team already uses this email" } };
    if (
      a.type === "stock_addition" &&
      !a.emergency &&
      db.products.find((p) => p.id === a.productId)?.status !== "active"
    )
      return { ok: false, errors: { form: "This product is inactive — stock can't be added" } };
    const reviewed: ApprovalRequest = {
      ...a,
      status: "approved",
      reviewedBy: actorId,
      reviewedAt: at,
      ...(a.type === "stock_addition" && !a.emergency ? { appliedAt: at } : {}),
    };
    setDb((d) => {
      let next: Db = { ...d, approvals: d.approvals.map((x) => (x.id === id ? reviewed : x)) };
      let log: Activity;
      if (a.type === "stock_addition") {
        if (!a.emergency)
          next = applyInventoryChange(next, {
            branchId: a.branchId!,
            productId: a.productId!,
            delta: a.quantity!,
            type: "stock_added",
            referenceType: "manual",
            referenceId: a.id,
            performedBy: a.requestedBy,
            at,
            batch: a.expiryDate ? { batchNumber: a.batchNumber ?? "", expiryDate: a.expiryDate } : undefined,
            note: a.note ? `${a.note} · approved` : "Approved stock addition",
          });
        log = activity(
          d,
          actorId,
          a.emergency ? "Emergency stock addition reviewed" : "Stock addition approved",
          `${a.id} · ${labels(d, a.branchId!, a.productId!)} · +${a.quantity}`,
          {
            entityId: a.id,
            branchId: a.branchId,
            productId: a.productId!,
            emergency: !!a.emergency,
          },
        );
      } else if (a.type === "product_deactivation") {
        next = {
          ...next,
          products: next.products.map((p) =>
            p.id === a.productId ? { ...p, status: "inactive", updatedAt: at } : p,
          ),
        };
        log = activity(
          d,
          actorId,
          "Product deactivation approved",
          `${a.id} · ${d.products.find((p) => p.id === a.productId)?.name}`,
          { entityId: a.id, productId: a.productId! },
        );
      } else {
        const m = a.member!;
        const n = d.users.reduce((mx, u) => Math.max(mx, Number(u.id.slice(5)) || 0), 0) + 1;
        const user: User = {
          id: `user-${String(n).padStart(3, "0")}`,
          tenantId: d.tenant.id,
          name: m.name,
          email: m.email,
          role: m.role,
          branchId: m.branchId,
          managerId: branchManager(d, m.role, m.branchId),
          status: "pending",
          createdAt: at,
        };
        next = { ...next, users: [...next.users, user], branches: syncBranches(next, user) };
        // Onboarding invites now created via Supabase; no mock onboarding record needed here.
        log = activity(
          d,
          actorId,
          "Team member request approved",
          `${a.id} · ${m.name} · ${m.role.replace("_", " ")}`,
          { entityId: a.id, branchId: m.branchId },
        );
      }
      return { ...next, activities: [log, ...d.activities] };
    });
    return { ok: true, data: reviewed };
  },
  async reject(id: string, reason: string, actorId: string): Promise<Result<ApprovalRequest>> {
    await latency();
    const db = getDb();
    const a = db.approvals.find((x) => x.id === id);
    if (!a) return { ok: false, errors: { form: "Request not found" } };
    if (!canReviewApproval(db, actorId, a))
      return { ok: false, errors: { form: "You can't review this request" } };
    if (a.status !== "pending")
      return { ok: false, errors: { form: "This request was already reviewed" } };
    if (reason.trim().length < 3)
      return { ok: false, errors: { reason: "A rejection reason is required" } };
    const reviewed: ApprovalRequest = {
      ...a,
      status: "rejected",
      reviewedBy: actorId,
      reviewedAt: nowOnReferenceDay(db),
      rejectionReason: reason.trim(),
    };
    const what =
      a.type === "stock_addition"
        ? a.emergency
          ? "Emergency stock addition rejected"
          : "Stock addition rejected"
        : a.type === "product_deactivation"
          ? "Product deactivation rejected"
          : "Team member request rejected";
    setDb((d) => ({
      ...d,
      approvals: d.approvals.map((x) => (x.id === id ? reviewed : x)),
      activities: [
        activity(d, actorId, what, `${a.id} · ${reason.trim()}`, {
          entityId: a.id,
          branchId: a.branchId,
          emergency: !!a.emergency,
        }),
        ...d.activities,
      ],
    }));
    return { ok: true, data: reviewed };
  },
  async approveMany(ids: string[], actorId: string): Promise<Result<ApprovalRequest[]>> {
    const db = getDb();
    const uniqueIds = [...new Set(ids)];
    if (!uniqueIds.length)
      return { ok: false, errors: { form: "Select at least one pending approval" } };
    const rows = uniqueIds.map((id) => db.approvals.find((item) => item.id === id));
    if (rows.some((item) => !item))
      return { ok: false, errors: { form: "One or more requests no longer exist" } };
    const eligible = rows as ApprovalRequest[];
    for (const item of eligible) {
      if (item.status !== "pending" || !canReviewApproval(db, actorId, item))
        return { ok: false, errors: { form: item.id + " is no longer eligible for approval" } };
      if (
        item.type === "product_deactivation" &&
        db.products.find((product) => product.id === item.productId)?.status !== "active"
      )
        return { ok: false, errors: { form: item.id + ": product is already inactive" } };
      if (
        item.type === "team_member" &&
        db.users.some((user) => user.email.toLowerCase() === item.member?.email.toLowerCase())
      )
        return { ok: false, errors: { form: item.id + ": email is already in use" } };
      if (
        item.type === "stock_addition" &&
        !item.emergency &&
        db.products.find((product) => product.id === item.productId)?.status !== "active"
      )
        return { ok: false, errors: { form: item.id + ": product is inactive" } };
    }
    const approved: ApprovalRequest[] = [];
    for (const item of eligible) {
      const result = await mockApprovalService.approve(item.id, actorId);
      if (!result.ok)
        return {
          ok: false,
          errors: { form: item.id + ": " + (result.errors.form ?? "Approval failed") },
        };
      approved.push(result.data);
    }
    return { ok: true, data: approved };
  },
};

// ---------- payment reconciliation ----------
export type PaymentAcknowledgement = { transferReference?: string; proofName?: string };
export type PaymentSubmission = {
  period: string;
  cashAmount: number;
  transferAmount: number;
  transferReference?: string;
  note?: string;
};

function paymentScopeError(db: Db, actorId: string, payment: Payment, role: "manager" | "owner") {
  const actor = db.users.find((user) => user.id === actorId);
  if (!actor || actor.tenantId !== db.tenant.id)
    return "Your account is not available in this organization";
  const scope = getAccessScope(db, actorId);
  if (scope.user.tenantId !== payment.tenantId || payment.tenantId !== db.tenant.id)
    return "This payment is outside your organization";
  if (scope.user.status !== "active") return "Your account is inactive";
  if (
    role === "manager" &&
    (!scope.canAcknowledgePayments ||
      payment.managerId !== actorId ||
      !scope.branchIds?.includes(payment.branchId))
  )
    return "This payment is outside your branch scope";
  if (role === "owner" && !scope.canConfirmPayments)
    return "Only the business owner can confirm payments";
  return null;
}

function paymentAuditDetails(db: Db, payment: Payment, outstandingAmount: number) {
  const paymentMethod: "cash" | "transfer" | "cash_and_transfer" | "none" =
    payment.cashAmount > 0 && payment.transferAmount > 0
      ? "cash_and_transfer"
      : payment.cashAmount > 0
        ? "cash"
        : payment.transferAmount > 0
          ? "transfer"
          : "none";
  return {
    salesRepId: payment.salesRepId,
    managerId: payment.managerId,
    period: payment.period,
    amount: getRepTotalSales(db, payment.salesRepId, payment.period),
    cashAmount: payment.cashAmount,
    transferAmount: payment.transferAmount,
    outstandingAmount,
    paymentMethod,
    ...(payment.transferReference ? { transferReference: payment.transferReference } : {}),
  };
}

export const mockPaymentService = {
  async submit(input: PaymentSubmission, actorId: string): Promise<Result<Payment>> {
    await latency();
    const db = getDb();
    const scope = getAccessScope(db, actorId);
    const errors: FieldErrors = {};
    if (scope.user.role !== "sales_rep" || scope.repId !== actorId)
      errors.form = "Only a sales representative can submit their own payment";
    const rep = db.users.find((user) => user.id === actorId);
    if (!rep || rep.tenantId !== db.tenant.id || rep.status !== "active" || !rep.branchId)
      errors.form = "An active sales representative and branch are required";
    if (!isValidPaymentPeriod(input.period) || input.period > db.tenant.referenceDate.slice(0, 7))
      errors.period = "Choose a valid current or past month";
    if (!Number.isFinite(input.cashAmount) || input.cashAmount < 0)
      errors.cashAmount = "Cash cannot be negative";
    if (!Number.isFinite(input.transferAmount) || input.transferAmount < 0)
      errors.transferAmount = "Transfer cannot be negative";
    if (input.transferAmount > 0 && !input.transferReference?.trim())
      errors.transferReference =
        "A transfer reference is required when transfer is greater than zero";
    if (rep?.branchId) {
      const branch = db.branches.find(
        (item) => item.id === rep.branchId && item.tenantId === rep.tenantId,
      );
      const manager = branch?.managerId
        ? db.users.find(
            (item) =>
              item.id === branch.managerId &&
              item.role === "manager" &&
              item.status === "active" &&
              item.tenantId === rep.tenantId,
          )
        : null;
      if (!branch || !manager)
        errors.form = "A branch manager must be assigned before submitting a payment";
      const totalSales = getRepTotalSales(db, actorId, input.period);
      const previouslyCollected = db.payments
        .filter(
          (payment) =>
            payment.tenantId === rep.tenantId &&
            payment.salesRepId === actorId &&
            payment.period === input.period &&
            payment.status !== "declined",
        )
        .reduce((sum, payment) => sum + payment.cashAmount + payment.transferAmount, 0);
      const outstanding =
        totalSales - previouslyCollected - input.cashAmount - input.transferAmount;
      if (outstanding < 0) errors.transferAmount = "Cash and transfer cannot exceed total sales";
      if (!Object.keys(errors).length && branch && manager) {
        const submittedAt = nowOnReferenceDay(db);
        const payment: Payment = {
          id: `PAY-${String(db.payments.length + 3001).padStart(4, "0")}`,
          tenantId: rep.tenantId,
          branchId: rep.branchId,
          salesRepId: actorId,
          managerId: manager.id,
          period: input.period,
          cashAmount: input.cashAmount,
          transferAmount: input.transferAmount,
          ...(input.transferReference?.trim()
            ? { transferReference: input.transferReference.trim() }
            : {}),
          status: "submitted",
          submittedAt,
          ...(input.note?.trim() ? { note: input.note.trim() } : {}),
          createdAt: submittedAt,
          updatedAt: submittedAt,
        };
        const outstandingAmount = outstanding;
        const log = activity(
          db,
          actorId,
          "PAYMENT_SUBMITTED",
          `${payment.id} · ${payment.period} payment submitted`,
          {
            entityId: payment.id,
            branchId: payment.branchId,
            metadata: paymentAuditDetails(db, payment, outstandingAmount),
          },
        );
        const notice = createNotification(
          db,
          manager.id,
          "payment_awaiting_acknowledgement",
          "payment",
          payment.id,
          `${rep.name} submitted ${payment.id} for acknowledgement`,
        );
        setDb((current) => ({
          ...current,
          payments: [...current.payments, payment],
          notifications: [notice, ...current.notifications],
          activities: [log, ...current.activities],
        }));
        return { ok: true, data: payment };
      }
    }
    return { ok: false, errors };
  },
  async acknowledge(
    id: string,
    actorId: string,
    details: PaymentAcknowledgement = {},
  ): Promise<Result<Payment>> {
    await latency();
    const db = getDb();
    const payment = db.payments.find((item) => item.id === id);
    if (!payment) return { ok: false, errors: { form: "Payment not found" } };
    const scopeError = paymentScopeError(db, actorId, payment, "manager");
    if (scopeError) return { ok: false, errors: { form: scopeError } };
    if (payment.status !== "submitted")
      return { ok: false, errors: { form: "Only submitted payments can be acknowledged" } };
    const reference = details.transferReference?.trim() || payment.transferReference;
    if (payment.transferAmount > 0 && !reference)
      return {
        ok: false,
        errors: { transferReference: "Enter the transfer reference before acknowledging" },
      };
    const updated: Payment = {
      ...payment,
      ...(reference ? { transferReference: reference } : {}),
      ...(details.proofName?.trim() ? { proofName: details.proofName.trim() } : {}),
      status: "acknowledged",
      acknowledgedAt: nowOnReferenceDay(db),
      acknowledgedBy: actorId,
      updatedAt: nowOnReferenceDay(db),
    };
    const outstandingAmount = getPaymentOutstandingAmount(db, payment);
    const log = activity(
      db,
      actorId,
      "PAYMENT_ACKNOWLEDGED",
      `${id} · ${payment.period} payment acknowledged`,
      {
        entityId: id,
        branchId: payment.branchId,
        metadata: {
          ...paymentAuditDetails(db, updated, outstandingAmount),
          ...(updated.proofName ? { proofName: updated.proofName } : {}),
        },
      },
    );
    const notices = ownerIds(db).map((ownerId) =>
      createNotification(
        db,
        ownerId,
        "payment_awaiting_confirmation",
        "payment",
        id,
        `${id} acknowledged by manager · awaiting your confirmation`,
      ),
    );
    setDb((current) => ({
      ...current,
      payments: current.payments.map((item) => (item.id === id ? updated : item)),
      notifications: [...notices, ...current.notifications],
      activities: [log, ...current.activities],
    }));
    return { ok: true, data: updated };
  },
  async decline(id: string, reason: string, actorId: string): Promise<Result<Payment>> {
    await latency();
    const db = getDb();
    const payment = db.payments.find((item) => item.id === id);
    if (!payment) return { ok: false, errors: { form: "Payment not found" } };
    const scope = getAccessScope(db, actorId);
    const allowed =
      scope.user.role === "manager"
        ? !paymentScopeError(db, actorId, payment, "manager")
        : scope.user.role === "owner"
          ? !paymentScopeError(db, actorId, payment, "owner")
          : false;
    if (!allowed) return { ok: false, errors: { form: "You cannot decline this payment" } };
    if (scope.user.role === "manager" && payment.status !== "submitted")
      return {
        ok: false,
        errors: { form: "Only submitted payments can be declined by a manager" },
      };
    if (scope.user.role === "owner" && payment.status !== "acknowledged" && payment.status !== "submitted")
      return {
        ok: false,
        errors: { form: "Only pending payments can be declined by the owner" },
      };
    if (!reason.trim()) return { ok: false, errors: { reason: "A decline reason is required" } };
    const declinedAt = nowOnReferenceDay(db);
    const updated: Payment = {
      ...payment,
      status: "declined",
      declinedAt,
      declinedBy: actorId,
      declineReason: reason.trim(),
      updatedAt: declinedAt,
    };
    const previouslyCollected = db.payments
      .filter(
        (item) =>
          item.id !== payment.id &&
          item.tenantId === payment.tenantId &&
          item.salesRepId === payment.salesRepId &&
          item.period === payment.period &&
          item.status !== "declined",
      )
      .reduce((sum, item) => sum + item.cashAmount + item.transferAmount, 0);
    const outstandingAmount = Math.max(
      getRepTotalSales(db, payment.salesRepId, payment.period) - previouslyCollected,
      0,
    );
    const log = activity(db, actorId, "PAYMENT_DECLINED", `${id} · ${reason.trim()}`, {
      entityId: id,
      branchId: payment.branchId,
      metadata: {
        ...paymentAuditDetails(db, payment, outstandingAmount),
        declineReason: reason.trim(),
      },
    });
    const notice = createNotification(
      db,
      payment.salesRepId,
      "payment_declined",
      "payment",
      id,
      `${id} was declined: ${reason.trim()}`,
    );
    setDb((current) => ({
      ...current,
      payments: current.payments.map((item) => (item.id === id ? updated : item)),
      notifications: [notice, ...current.notifications],
      activities: [log, ...current.activities],
    }));
    return { ok: true, data: updated };
  },
  async confirm(id: string, actorId: string): Promise<Result<Payment>> {
    await latency();
    const db = getDb();
    const payment = db.payments.find((item) => item.id === id);
    if (!payment) return { ok: false, errors: { form: "Payment not found" } };
    const scopeError = paymentScopeError(db, actorId, payment, "owner");
    if (scopeError) return { ok: false, errors: { form: scopeError } };
    if (payment.status !== "acknowledged" && payment.status !== "submitted")
      return { ok: false, errors: { form: "Only pending payments can be confirmed" } };
    const confirmedAt = nowOnReferenceDay(db);
    const updated: Payment = {
      ...payment,
      status: "confirmed",
      confirmedAt,
      confirmedBy: actorId,
      updatedAt: confirmedAt,
    };
    const outstandingAmount = getPaymentOutstandingAmount(db, payment);
    const metadata = paymentAuditDetails(db, payment, outstandingAmount);
    const confirmedLog = activity(
      db,
      actorId,
      "PAYMENT_CONFIRMED",
      `${id} · owner confirmed payment`,
      { entityId: id, branchId: payment.branchId, metadata },
    );
    const notice = createNotification(
      db,
      payment.salesRepId,
      "payment_confirmed",
      "payment",
      id,
      `${id} was confirmed by the owner`,
    );
    setDb((current) => ({
      ...current,
      payments: current.payments.map((item) => (item.id === id ? updated : item)),
      notifications: [notice, ...current.notifications],
      activities: [confirmedLog, ...current.activities],
    }));
    return { ok: true, data: updated };
  },
};

// ---------- manager expenses and remittance ----------
export type ExpenseInput = {
  category: ExpenseCategory;
  amount: number;
  expenseDate: string;
  description: string;
  note?: string;
  branchId?: string;
};
export type OwnerRemittanceInput = {
  payeeType: OwnerRemittancePayeeType;
  payeeName: string;
  amount: number;
  paymentMethod: OwnerRemittancePaymentMethod;
  reference?: string;
  remittanceDate: string;
  purpose: string;
  note?: string;
  branchId?: string;
};
export type RemittanceInput = {
  period: string;
  cashAmount: number;
  transferAmount: number;
  transferReference?: string;
  note?: string;
};

function managerBranch(db: Db, actorId: string) {
  const manager = db.users.find(
    (user) =>
      user.id === actorId &&
      user.tenantId === db.tenant.id &&
      user.role === "manager" &&
      user.status === "active",
  );
  const branch = manager?.branchId
    ? db.branches.find(
        (item) =>
          item.id === manager.branchId &&
          item.tenantId === manager.tenantId &&
          item.managerId === manager.id,
      )
    : null;
  return manager && branch ? { manager, branch } : null;
}
function ownerActor(db: Db, actorId: string) {
  return (
    db.users.find(
      (user) =>
        user.id === actorId &&
        user.tenantId === db.tenant.id &&
        user.role === "owner" &&
        user.status === "active",
    ) ?? null
  );
}
function expenseActor(db: Db, actorId: string) {
  const owner = ownerActor(db, actorId);
  if (owner) return { owner };
  const manager = managerBranch(db, actorId);
  return manager ? { manager: manager.manager, branch: manager.branch } : null;
}
function canManageExpense(db: Db, actorId: string, expense: Expense) {
  const context = expenseActor(db, actorId);
  if (!context || expense.tenantId !== db.tenant.id) return false;
  if ("owner" in context) return expense.ownerId === actorId;
  return expense.managerId === actorId && expense.branchId === context.branch.id;
}

const validExpenseDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
};
const expensePeriodLocked = (_db: Db, _managerId: string, _period: string) => false;

export function validateExpense(db: Db, input: ExpenseInput) {
  const errors: FieldErrors = {};
  if (!validExpenseDate(input.expenseDate)) errors.expenseDate = "Enter a valid expense date";
  else if (input.expenseDate > db.tenant.referenceDate)
    errors.expenseDate = "Expense date cannot be in the future";
  if (!expenseCategories.includes(input.category)) errors.category = "Choose an expense category";
  if (!Number.isFinite(input.amount) || input.amount <= 0)
    errors.amount = "Amount must be greater than zero";
  if (!input.description.trim()) errors.description = "Description is required";
  if (
    input.branchId &&
    !db.branches.some((branch) => branch.id === input.branchId && branch.tenantId === db.tenant.id)
  )
    errors.branchId = "Choose a valid branch";
  return errors;
}

export const mockExpenseService = {
  async create(input: ExpenseInput, actorId: string): Promise<Result<Expense>> {
    await latency();
    const db = getDb();
    const assignment = expenseActor(db, actorId);
    if (!assignment)
      return {
        ok: false,
        errors: { form: "Only an active Owner or branch Manager can record expenses" },
      };
    const errors = validateExpense(db, input);
    if (expensePeriodLocked(db, actorId, input.expenseDate.slice(0, 7)))
      errors.form = "This period is locked by a submitted remittance";
    if (Object.keys(errors).length) return { ok: false, errors };
    const createdAt = nowOnReferenceDay(db);
    const isOwner = "owner" in assignment;
    const expense: Expense = {
      id: `EXP-${String(db.expenses.length + 4201).padStart(4, "0")}`,
      tenantId: isOwner ? assignment.owner!.tenantId : assignment.manager.tenantId,
      branchId: isOwner ? (input.branchId ?? null) : assignment.branch.id,
      ...(isOwner ? { ownerId: assignment.owner!.id } : { managerId: assignment.manager.id }),
      category: input.category,
      amount: input.amount,
      expenseDate: input.expenseDate,
      description: input.description.trim(),
      ...(input.note?.trim() ? { note: input.note.trim() } : {}),
      status: "recorded",
      createdAt,
      updatedAt: createdAt,
    };
    const log = activity(db, actorId, "EXPENSE_CREATED", `${expense.id} · ${expense.description}`, {
      entityId: expense.id,
      ...(expense.branchId ? { branchId: expense.branchId } : {}),
      metadata: {
        ...(expense.managerId ? { managerId: expense.managerId } : {}),
        expenseId: expense.id,
        amount: expense.amount,
        category: expense.category,
        period: expense.expenseDate.slice(0, 7),
      },
    });
    setDb((current) => ({
      ...current,
      expenses: [...current.expenses, expense],
      activities: [log, ...current.activities],
    }));
    return { ok: true, data: expense };
  },
  async update(id: string, input: ExpenseInput, actorId: string): Promise<Result<Expense>> {
    await latency();
    const db = getDb();
    const current = db.expenses.find((expense) => expense.id === id);
    const assignment = expenseActor(db, actorId);
    if (!current) return { ok: false, errors: { form: "Expense not found" } };
    if (!assignment || !canManageExpense(db, actorId, current))
      return { ok: false, errors: { form: "You cannot edit this expense" } };
    if (current.status !== "recorded")
      return { ok: false, errors: { form: "Voided expenses cannot be edited" } };
    if (
      expensePeriodLocked(db, actorId, current.expenseDate.slice(0, 7)) ||
      expensePeriodLocked(db, actorId, input.expenseDate.slice(0, 7))
    )
      return {
        ok: false,
        errors: { form: "Expenses in a submitted remittance period are locked" },
      };
    const errors = validateExpense(db, input);
    if (Object.keys(errors).length) return { ok: false, errors };
    const base = { ...current };
    delete base.note;
    const updated: Expense = {
      ...base,
      branchId: "owner" in assignment ? (input.branchId ?? null) : current.branchId,
      category: input.category,
      amount: input.amount,
      expenseDate: input.expenseDate,
      description: input.description.trim(),
      ...(input.note?.trim() ? { note: input.note.trim() } : {}),
      updatedAt: nowOnReferenceDay(db),
    };
    const log = activity(db, actorId, "EXPENSE_UPDATED", `${id} · ${updated.description}`, {
      entityId: id,
      ...(updated.branchId ? { branchId: updated.branchId } : {}),
      metadata: {
        ...(updated.managerId ? { managerId: updated.managerId } : {}),
        expenseId: id,
        amount: updated.amount,
        category: updated.category,
        period: updated.expenseDate.slice(0, 7),
      },
    });
    setDb((currentDb) => ({
      ...currentDb,
      expenses: currentDb.expenses.map((expense) => (expense.id === id ? updated : expense)),
      activities: [log, ...currentDb.activities],
    }));
    return { ok: true, data: updated };
  },
  async void(id: string, reason: string, actorId: string): Promise<Result<Expense>> {
    await latency();
    const db = getDb();
    const current = db.expenses.find((expense) => expense.id === id);
    const assignment = expenseActor(db, actorId);
    if (!current) return { ok: false, errors: { form: "Expense not found" } };
    if (!assignment || !canManageExpense(db, actorId, current))
      return { ok: false, errors: { form: "You cannot void this expense" } };
    if (current.status !== "recorded")
      return { ok: false, errors: { form: "This expense is already voided" } };
    if (expensePeriodLocked(db, actorId, current.expenseDate.slice(0, 7)))
      return {
        ok: false,
        errors: { form: "Expenses in a submitted remittance period are locked" },
      };
    if (!reason.trim()) return { ok: false, errors: { reason: "A void reason is required" } };
    const updated: Expense = { ...current, status: "voided", updatedAt: nowOnReferenceDay(db) };
    const log = activity(db, actorId, "EXPENSE_VOIDED", `${id} · ${reason.trim()}`, {
      entityId: id,
      ...(updated.branchId ? { branchId: updated.branchId } : {}),
      metadata: {
        ...(updated.managerId ? { managerId: updated.managerId } : {}),
        expenseId: id,
        amount: updated.amount,
        category: updated.category,
        reason: reason.trim(),
        period: updated.expenseDate.slice(0, 7),
      },
    });
    setDb((currentDb) => ({
      ...currentDb,
      expenses: currentDb.expenses.map((expense) => (expense.id === id ? updated : expense)),
      activities: [log, ...currentDb.activities],
    }));
    return { ok: true, data: updated };
  },
};
const ownerPayeeTypes: OwnerRemittancePayeeType[] = [
  "supplier",
  "landlord",
  "utility",
  "contractor",
  "other",
];
const validOwnerRemittanceDate = (value: string) => validExpenseDate(value);
export function validateOwnerRemittance(db: Db, input: OwnerRemittanceInput) {
  const errors: FieldErrors = {};
  if (!ownerPayeeTypes.includes(input.payeeType)) errors.payeeType = "Choose a payee type";
  if (!input.payeeName.trim()) errors.payeeName = "Payee name is required";
  if (!Number.isFinite(input.amount) || input.amount <= 0)
    errors.amount = "Amount must be greater than zero";
  if (input.paymentMethod !== "cash" && input.paymentMethod !== "transfer")
    errors.paymentMethod = "Choose a payment method";
  if (!validOwnerRemittanceDate(input.remittanceDate))
    errors.remittanceDate = "Enter a valid remittance date";
  else if (input.remittanceDate > db.tenant.referenceDate)
    errors.remittanceDate = "Date cannot be in the future";
  if (!input.purpose.trim()) errors.purpose = "Purpose is required";
  if (input.paymentMethod === "transfer" && !input.reference?.trim())
    errors.reference = "A transfer reference is required";
  if (
    input.branchId &&
    !db.branches.some((branch) => branch.id === input.branchId && branch.tenantId === db.tenant.id)
  )
    errors.branchId = "Choose a valid branch";
  return errors;
}

export const ownerRemittanceService = {
  async create(input: OwnerRemittanceInput, actorId: string): Promise<Result<OwnerRemittance>> {
    await latency();
    const db = getDb();
    const owner = ownerActor(db, actorId);
    if (!owner)
      return {
        ok: false,
        errors: { form: "Only the active business owner can create remittances" },
      };
    const errors = validateOwnerRemittance(db, input);
    if (Object.keys(errors).length) return { ok: false, errors };
    const now = nowOnReferenceDay(db);
    const row: OwnerRemittance = {
      id: `ORM-${String(db.ownerRemittances.length + 1).padStart(5, "0")}`,
      tenantId: owner.tenantId,
      ownerId: owner.id,
      ...(input.branchId ? { branchId: input.branchId } : {}),
      payeeType: input.payeeType,
      payeeName: input.payeeName.trim(),
      amount: input.amount,
      paymentMethod: input.paymentMethod,
      ...(input.reference?.trim() ? { reference: input.reference.trim() } : {}),
      remittanceDate: input.remittanceDate,
      purpose: input.purpose.trim(),
      ...(input.note?.trim() ? { note: input.note.trim() } : {}),
      createdAt: now,
      updatedAt: now,
    };
    const log = activity(db, actorId, "REMITTANCE_RECORDED", `${row.id} · ${row.payeeName}`, {
      entityId: row.id,
      ...(row.branchId ? { branchId: row.branchId } : {}),
      metadata: {
        remittanceId: row.id,
        amount: row.amount,
        payeeName: row.payeeName,
        paymentMethod: row.paymentMethod,
        purpose: row.purpose,
        ...(row.reference ? { reference: row.reference } : {}),
      },
    });
    setDb((current) => ({
      ...current,
      ownerRemittances: [...current.ownerRemittances, row],
      activities: [log, ...current.activities],
    }));
    return { ok: true, data: row };
  },
};

function remittanceOwnerError(db: Db, actorId: string, remittance: ManagerRemittance) {
  const actor = db.users.find(
    (user) => user.id === actorId && user.tenantId === db.tenant.id && user.status === "active",
  );
  if (
    !actor ||
    actor.role !== "owner" ||
    remittance.tenantId !== actor.tenantId ||
    remittance.tenantId !== db.tenant.id
  )
    return "Only the active business owner can review this remittance";
  const branch = db.branches.find(
    (item) =>
      item.id === remittance.branchId &&
      item.tenantId === remittance.tenantId &&
      item.managerId === remittance.managerId,
  );
  if (!branch) return "This remittance is not linked to a valid branch manager";
  return null;
}

export const mockRemittanceService = {
  async submit(input: RemittanceInput, actorId: string): Promise<Result<ManagerRemittance>> {
    await latency();
    const db = getDb();
    const assignment = managerBranch(db, actorId);
    if (!assignment)
      return { ok: false, errors: { form: "Only an active branch manager can submit remittance" } };
    const errors: FieldErrors = {};
    if (!isValidPaymentPeriod(input.period) || input.period > db.tenant.referenceDate.slice(0, 7))
      errors.period = "Choose a valid current or past month";
    if (!Number.isFinite(input.cashAmount) || input.cashAmount < 0)
      errors.cashAmount = "Cash cannot be negative";
    if (!Number.isFinite(input.transferAmount) || input.transferAmount < 0)
      errors.transferAmount = "Transfer cannot be negative";
    if (input.transferAmount > 0 && !input.transferReference?.trim())
      errors.transferReference =
        "A transfer reference is required when transfer is greater than zero";
    const awaitingReview = db.remittances.some(
      (item) =>
        item.tenantId === assignment.manager.tenantId &&
        item.managerId === assignment.manager.id &&
        item.period === input.period &&
        item.status === "submitted",
    );
    if (awaitingReview)
      errors.form = "A remittance for this period is already awaiting Owner review";
    if (!Object.keys(errors).length) {
      const totalReceived = getManagerTotalReceived(db, actorId, input.period);
      const payments = getManagerEligiblePayments(db, actorId, input.period);
      const expenses = getManagerExpenses(db, actorId, input.period);
      if (!payments.length)
        return {
          ok: false,
          errors: { form: "There are no acknowledged Sales Rep payments for this period" },
        };
      const expenseAmount = expenses.reduce((sum, expense) => sum + expense.amount, 0);
      const netRemittanceDue = getManagerNetRemittanceDue(db, actorId, input.period);
      const reconciliation = validateRemittanceReconciliation(netRemittanceDue, input);
      if (netRemittanceDue < 0)
        errors.form = "Recorded expenses exceed the eligible payment position for this period";
      else if (!reconciliation.balanced)
        errors.form = "Cash, transfer and outstanding must reconcile to net remittance due";
      if (reconciliation.outstanding < 0)
        errors.transferAmount = "Cash and transfer cannot exceed net remittance due";
      if (Object.keys(errors).length) return { ok: false, errors };
      const submittedAt = nowOnReferenceDay(db);
      const remittance: ManagerRemittance = {
        id: `REM-${String(db.remittances.length + 5201).padStart(4, "0")}`,
        tenantId: assignment.manager.tenantId,
        branchId: assignment.branch.id,
        managerId: actorId,
        period: input.period,
        totalReceived,
        expenseAmount,
        netRemittanceDue,
        cashAmount: input.cashAmount,
        transferAmount: input.transferAmount,
        outstandingAmount: getRemittanceOutstanding(
          netRemittanceDue,
          input.cashAmount,
          input.transferAmount,
        ),
        ...(input.transferReference?.trim()
          ? { transferReference: input.transferReference.trim() }
          : {}),
        status: "submitted",
        submittedAt,
        ...(input.note?.trim() ? { note: input.note.trim() } : {}),
        paymentIds: payments.map((payment) => payment.id),
        expenseIds: expenses.map((expense) => expense.id),
        createdAt: submittedAt,
        updatedAt: submittedAt,
      };
      const log = activity(
        db,
        actorId,
        "REMITTANCE_SUBMITTED",
        `${remittance.id} · ${remittance.period} remittance submitted`,
        {
          entityId: remittance.id,
          branchId: remittance.branchId,
          metadata: {
            managerId: remittance.managerId,
            remittanceId: remittance.id,
            period: remittance.period,
            amount: remittance.netRemittanceDue,
            totalReceived,
            expenseAmount,
            netRemittanceDue,
            cashAmount: remittance.cashAmount,
            transferAmount: remittance.transferAmount,
            outstandingAmount: remittance.outstandingAmount,
          },
        },
      );
      setDb((current) => ({
        ...current,
        remittances: [...current.remittances, remittance],
        activities: [log, ...current.activities],
      }));
      return { ok: true, data: remittance };
    }
    return { ok: false, errors };
  },
  async confirm(id: string, actorId: string): Promise<Result<ManagerRemittance>> {
    await latency();
    const db = getDb();
    const current = db.remittances.find((item) => item.id === id);
    if (!current) return { ok: false, errors: { form: "Remittance not found" } };
    const accessError = remittanceOwnerError(db, actorId, current);
    if (accessError) return { ok: false, errors: { form: accessError } };
    if (current.status !== "submitted")
      return { ok: false, errors: { form: "Only submitted remittances can be confirmed" } };
    const confirmedAt = nowOnReferenceDay(db);
    const updated: ManagerRemittance = {
      ...current,
      status: "confirmed",
      confirmedAt,
      confirmedBy: actorId,
      updatedAt: confirmedAt,
    };
    const log = activity(db, actorId, "REMITTANCE_CONFIRMED", `${id} · remittance confirmed`, {
      entityId: id,
      branchId: current.branchId,
      metadata: {
        managerId: current.managerId,
        remittanceId: id,
        period: current.period,
        amount: current.netRemittanceDue,
        totalReceived: current.totalReceived,
        expenseAmount: current.expenseAmount,
        netRemittanceDue: current.netRemittanceDue,
      },
    });
    setDb((currentDb) => ({
      ...currentDb,
      remittances: currentDb.remittances.map((item) => (item.id === id ? updated : item)),
      activities: [log, ...currentDb.activities],
    }));
    return { ok: true, data: updated };
  },
  async decline(id: string, reason: string, actorId: string): Promise<Result<ManagerRemittance>> {
    await latency();
    const db = getDb();
    const current = db.remittances.find((item) => item.id === id);
    if (!current) return { ok: false, errors: { form: "Remittance not found" } };
    const accessError = remittanceOwnerError(db, actorId, current);
    if (accessError) return { ok: false, errors: { form: accessError } };
    if (current.status !== "submitted")
      return { ok: false, errors: { form: "Only submitted remittances can be declined" } };
    if (!reason.trim()) return { ok: false, errors: { reason: "A decline reason is required" } };
    const declinedAt = nowOnReferenceDay(db);
    const updated: ManagerRemittance = {
      ...current,
      status: "declined",
      declinedAt,
      declinedBy: actorId,
      declineReason: reason.trim(),
      updatedAt: declinedAt,
    };
    const log = activity(db, actorId, "REMITTANCE_DECLINED", `${id} · ${reason.trim()}`, {
      entityId: id,
      branchId: current.branchId,
      metadata: {
        managerId: current.managerId,
        remittanceId: id,
        period: current.period,
        amount: current.netRemittanceDue,
        totalReceived: current.totalReceived,
        expenseAmount: current.expenseAmount,
        netRemittanceDue: current.netRemittanceDue,
        reason: reason.trim(),
      },
    });
    setDb((currentDb) => ({
      ...currentDb,
      remittances: currentDb.remittances.map((item) => (item.id === id ? updated : item)),
      activities: [log, ...currentDb.activities],
    }));
    return { ok: true, data: updated };
  },
};

// ---------- customers (accounts) and customer payments ----------
export type CustomerInput = {
  name: string;
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
};
export function validateCustomer(db: Db, input: CustomerInput, editingId?: string) {
  const errors: FieldErrors = {};
  if (!input.name.trim()) errors.name = "Customer or business name is required";
  if (!input.phone.trim()) errors.phone = "Phone number is required";
  else if (!/^[+\d][\d\s-]{6,}$/.test(input.phone.trim()))
    errors.phone = "Enter a valid phone number";
  if (input.email.trim() && !/^\S+@\S+\.\S+$/.test(input.email.trim()))
    errors.email = "Enter a valid email";
  if (
    !errors.phone &&
    db.customers.some(
      (c) =>
        c.id !== editingId &&
        c.tenantId === db.tenant.id &&
        c.phone.replace(/\s/g, "") === input.phone.trim().replace(/\s/g, ""),
    )
  )
    errors.phone = "A customer with this phone number already exists";
  return errors;
}
function customerActor(db: Db, actorId: string) {
  const scope = getAccessScope(db, actorId);
  if (
    scope.user.id !== actorId ||
    scope.user.status !== "active" ||
    scope.user.tenantId !== db.tenant.id
  )
    return null;
  return scope;
}

export const mockCustomerService = {
  async create(input: CustomerInput, actorId: string): Promise<Result<Customer>> {
    await latency();
    const db = getDb();
    const scope = customerActor(db, actorId);
    if (!scope?.canManageCustomers)
      return { ok: false, errors: { form: "Only sales representatives can add customers" } };
    const errors = validateCustomer(db, input);
    if (Object.keys(errors).length) return { ok: false, errors };
    const at = nowOnReferenceDay(db);
    const customer: Customer = {
      id: `cust-${String(db.customers.length + 1).padStart(3, "0")}-${Math.random().toString(36).slice(2, 5)}`,
      tenantId: db.tenant.id,
      branchId: scope.user.branchId,
      name: input.name.trim(),
      contactPerson: input.contactPerson.trim(),
      phone: input.phone.trim(),
      email: input.email.trim(),
      address: input.address.trim(),
      status: "active",
      createdBy: actorId,
      createdAt: at,
      updatedAt: at,
    };
    const log = activity(db, actorId, "Customer created", customer.name, {
      entityId: customer.id,
      branchId: customer.branchId,
      metadata: { customerId: customer.id },
    });
    setDb((d) => ({
      ...d,
      customers: [...d.customers, customer],
      activities: [log, ...d.activities],
    }));
    return { ok: true, data: customer };
  },
  async update(id: string, input: CustomerInput, actorId: string): Promise<Result<Customer>> {
    await latency();
    const db = getDb();
    const scope = customerActor(db, actorId);
    const existing = db.customers.find((c) => c.id === id && c.tenantId === db.tenant.id);
    if (!existing) return { ok: false, errors: { form: "Customer not found" } };
    if (
      !scope?.canManageCustomers ||
      (existing.branchId && !scope.branchIds?.includes(existing.branchId))
    )
      return { ok: false, errors: { form: "You cannot edit this customer" } };
    const errors = validateCustomer(db, input, id);
    if (Object.keys(errors).length) return { ok: false, errors };
    const updated: Customer = {
      ...existing,
      name: input.name.trim(),
      contactPerson: input.contactPerson.trim(),
      phone: input.phone.trim(),
      email: input.email.trim(),
      address: input.address.trim(),
      updatedAt: nowOnReferenceDay(db),
    };
    const log = activity(db, actorId, "Customer updated", updated.name, {
      entityId: id,
      branchId: updated.branchId,
      metadata: { customerId: id },
    });
    setDb((d) => ({
      ...d,
      customers: d.customers.map((c) => (c.id === id ? updated : c)),
      activities: [log, ...d.activities],
    }));
    return { ok: true, data: updated };
  },
  /** Soft (de)activation only — customers are never deleted. */
  async setStatus(id: string, status: CustomerStatus, actorId: string): Promise<Result<Customer>> {
    await latency();
    const db = getDb();
    const scope = customerActor(db, actorId);
    const existing = db.customers.find((c) => c.id === id && c.tenantId === db.tenant.id);
    if (!existing) return { ok: false, errors: { form: "Customer not found" } };
    if (
      !scope?.canManageCustomers ||
      (existing.branchId && !scope.branchIds?.includes(existing.branchId))
    )
      return { ok: false, errors: { form: "You cannot change this customer" } };
    const updated: Customer = { ...existing, status, updatedAt: nowOnReferenceDay(db) };
    const log = activity(
      db,
      actorId,
      status === "active" ? "Customer activated" : "Customer deactivated",
      updated.name,
      { entityId: id, branchId: updated.branchId, metadata: { customerId: id } },
    );
    setDb((d) => ({
      ...d,
      customers: d.customers.map((c) => (c.id === id ? updated : c)),
      activities: [log, ...d.activities],
    }));
    return { ok: true, data: updated };
  },
  async setCreditLimit(
    id: string,
    limit: number | null,
    actorId: string,
  ): Promise<Result<Customer>> {
    await latency();
    const db = getDb();
    const scope = customerActor(db, actorId);
    const existing = db.customers.find((c) => c.id === id && c.tenantId === db.tenant.id);
    if (!existing) return { ok: false, errors: { form: "Customer not found" } };
    if (!scope?.canSetCreditLimit)
      return { ok: false, errors: { form: "Only the owner can set credit limits" } };
    if (limit !== null && (!Number.isFinite(limit) || limit < 0))
      return { ok: false, errors: { creditLimit: "Enter a valid credit limit" } };
    const { creditLimit: _old, ...rest } = existing;
    const updated: Customer = {
      ...rest,
      ...(limit ? { creditLimit: limit } : {}),
      updatedAt: nowOnReferenceDay(db),
    };
    const log = activity(db, actorId, "Customer credit limit updated", updated.name, {
      entityId: id,
      branchId: updated.branchId,
      metadata: { customerId: id, ...(limit ? { creditLimit: limit } : {}) },
    });
    setDb((d) => ({
      ...d,
      customers: d.customers.map((c) => (c.id === id ? updated : c)),
      activities: [log, ...d.activities],
    }));
    return { ok: true, data: updated };
  },
};

export type CustomerPaymentInput = {
  customerId: string;
  amount: number;
  method: CustomerPaymentMethod;
  reference?: string;
  paymentDate: string;
  orderId?: string;
  note?: string;
};
function customerPaymentScopeError(
  db: Db,
  actorId: string,
  payment: CustomerPayment,
  role: "manager" | "owner",
) {
  const scope = customerActor(db, actorId);
  if (!scope || payment.tenantId !== db.tenant.id)
    return "This payment is outside your organization";
  if (
    role === "manager" &&
    (!scope.canAcknowledgePayments ||
      payment.managerId !== actorId ||
      !scope.branchIds?.includes(payment.branchId))
  )
    return "This payment is outside your branch scope";
  if (role === "owner" && !scope.canConfirmPayments)
    return "Only the business owner can confirm payments";
  return null;
}
function customerPaymentAudit(payment: CustomerPayment) {
  return {
    customerId: payment.customerId,
    salesRepId: payment.receivedBy,
    managerId: payment.managerId,
    amount: payment.amount,
    paymentMethod: payment.method,
    ...(payment.reference ? { transferReference: payment.reference } : {}),
    ...(payment.orderId ? { orderId: payment.orderId } : {}),
  };
}

export const mockCustomerPaymentService = {
  async record(input: CustomerPaymentInput, actorId: string): Promise<Result<CustomerPayment>> {
    await latency();
    const db = getDb();
    const scope = customerActor(db, actorId);
    if (!scope?.canManageCustomers || !scope.user.branchId)
      return {
        ok: false,
        errors: { form: "Only sales representatives can record customer payments" },
      };
    const customer = db.customers.find(
      (c) => c.id === input.customerId && c.tenantId === db.tenant.id,
    );
    const errors: FieldErrors = {};
    if (!customer || (customer.branchId && customer.branchId !== scope.user.branchId))
      errors.customerId = "Choose a customer from your branch";
    if (!Number.isFinite(input.amount) || input.amount <= 0)
      errors.amount = "Amount must be greater than zero";
    if (input.method !== "cash" && input.method !== "transfer") errors.method = "Choose a method";
    if (input.method === "transfer" && !input.reference?.trim())
      errors.reference = "A transfer reference is required";
    if (!validExpenseDate(input.paymentDate) || input.paymentDate > db.tenant.referenceDate)
      errors.paymentDate = "Enter a valid date (not in the future)";
    const branch = db.branches.find((b) => b.id === scope.user.branchId);
    if (!branch?.managerId) errors.form = "A branch manager must be assigned first";
    if (Object.keys(errors).length || !customer || !branch?.managerId) return { ok: false, errors };
    const at = nowOnReferenceDay(db);
    const payment: CustomerPayment = {
      id: `CPY-${5001 + db.customerPayments.length}`,
      tenantId: db.tenant.id,
      customerId: customer.id,
      branchId: branch.id,
      managerId: branch.managerId,
      amount: input.amount,
      method: input.method,
      ...(input.reference?.trim() ? { reference: input.reference.trim() } : {}),
      receivedBy: actorId,
      ...(input.orderId ? { orderId: input.orderId } : {}),
      paymentDate: input.paymentDate,
      status: "submitted",
      submittedAt: at,
      ...(input.note?.trim() ? { note: input.note.trim() } : {}),
      createdAt: at,
      updatedAt: at,
    };
    const log = activity(
      db,
      actorId,
      "Customer payment submitted",
      `${payment.id} · ${customer.name}`,
      {
        entityId: payment.id,
        branchId: payment.branchId,
        metadata: customerPaymentAudit(payment),
      },
    );
    const notice = createNotification(
      db,
      branch.managerId,
      "payment_awaiting_acknowledgement",
      "customer_payment",
      payment.id,
      `${payment.id} from ${customer.name} awaits your acknowledgement`,
    );
    setDb((d) => ({
      ...d,
      customerPayments: [...d.customerPayments, payment],
      notifications: [notice, ...d.notifications],
      activities: [log, ...d.activities],
    }));
    return { ok: true, data: payment };
  },
  async acknowledge(
    id: string,
    actorId: string,
    details: PaymentAcknowledgement = {},
  ): Promise<Result<CustomerPayment>> {
    await latency();
    const db = getDb();
    const payment = db.customerPayments.find((p) => p.id === id);
    if (!payment) return { ok: false, errors: { form: "Payment not found" } };
    const scopeError = customerPaymentScopeError(db, actorId, payment, "manager");
    if (scopeError) return { ok: false, errors: { form: scopeError } };
    if (payment.status !== "submitted")
      return { ok: false, errors: { form: "Only submitted payments can be acknowledged" } };
    const reference = details.transferReference?.trim() || payment.reference;
    if (payment.method === "transfer" && !reference)
      return {
        ok: false,
        errors: { transferReference: "Enter the transfer reference before acknowledging" },
      };
    const at = nowOnReferenceDay(db);
    const updated: CustomerPayment = {
      ...payment,
      ...(reference ? { reference } : {}),
      ...(details.proofName?.trim() ? { proofName: details.proofName.trim() } : {}),
      status: "acknowledged",
      acknowledgedAt: at,
      acknowledgedBy: actorId,
      updatedAt: at,
    };
    const log = activity(db, actorId, "Customer payment acknowledged", id, {
      entityId: id,
      branchId: payment.branchId,
      metadata: {
        ...customerPaymentAudit(updated),
        ...(updated.proofName ? { proofName: updated.proofName } : {}),
      },
    });
    const notices = ownerIds(db).map((o) =>
      createNotification(
        db,
        o,
        "payment_awaiting_confirmation",
        "customer_payment",
        id,
        `${id} acknowledged by manager · awaiting your confirmation`,
      ),
    );
    setDb((d) => ({
      ...d,
      customerPayments: d.customerPayments.map((p) => (p.id === id ? updated : p)),
      notifications: [...notices, ...d.notifications],
      activities: [log, ...d.activities],
    }));
    return { ok: true, data: updated };
  },
  async confirm(id: string, actorId: string): Promise<Result<CustomerPayment>> {
    await latency();
    const db = getDb();
    const payment = db.customerPayments.find((p) => p.id === id);
    if (!payment) return { ok: false, errors: { form: "Payment not found" } };
    const scopeError = customerPaymentScopeError(db, actorId, payment, "owner");
    if (scopeError) return { ok: false, errors: { form: scopeError } };
    if (payment.status !== "acknowledged" && payment.status !== "submitted")
      return { ok: false, errors: { form: "Only pending payments can be confirmed" } };
    const at = nowOnReferenceDay(db);
    const updated: CustomerPayment = {
      ...payment,
      status: "confirmed",
      confirmedAt: at,
      confirmedBy: actorId,
      updatedAt: at,
    };
    const log = activity(db, actorId, "Customer payment confirmed", id, {
      entityId: id,
      branchId: payment.branchId,
      metadata: customerPaymentAudit(updated),
    });
    const notice = createNotification(
      db,
      payment.receivedBy,
      "payment_confirmed",
      "customer_payment",
      id,
      `${id} was confirmed by the owner`,
    );
    setDb((d) => ({
      ...d,
      customerPayments: d.customerPayments.map((p) => (p.id === id ? updated : p)),
      notifications: [notice, ...d.notifications],
      activities: [log, ...d.activities],
    }));
    return { ok: true, data: updated };
  },
  async decline(id: string, reason: string, actorId: string): Promise<Result<CustomerPayment>> {
    await latency();
    const db = getDb();
    const payment = db.customerPayments.find((p) => p.id === id);
    if (!payment) return { ok: false, errors: { form: "Payment not found" } };
    const scope = customerActor(db, actorId);
    const role = scope?.canConfirmPayments ? "owner" : "manager";
    const scopeError = customerPaymentScopeError(db, actorId, payment, role);
    if (scopeError) return { ok: false, errors: { form: scopeError } };
    if (role === "manager" && payment.status !== "submitted")
      return {
        ok: false,
        errors: { form: "Only submitted payments can be declined by a manager" },
      };
    if (role === "owner" && payment.status !== "acknowledged" && payment.status !== "submitted")
      return {
        ok: false,
        errors: { form: "Only pending payments can be declined by the owner" },
      };
    if (!reason.trim()) return { ok: false, errors: { reason: "A decline reason is required" } };
    const at = nowOnReferenceDay(db);
    const updated: CustomerPayment = {
      ...payment,
      status: "declined",
      declinedAt: at,
      declinedBy: actorId,
      declineReason: reason.trim(),
      updatedAt: at,
    };
    const log = activity(db, actorId, "Customer payment declined", `${id} · ${reason.trim()}`, {
      entityId: id,
      branchId: payment.branchId,
      metadata: { ...customerPaymentAudit(updated), declineReason: reason.trim() },
    });
    const notice = createNotification(
      db,
      payment.receivedBy,
      "payment_declined",
      "customer_payment",
      id,
      `${id} was declined: ${reason.trim()}`,
    );
    setDb((d) => ({
      ...d,
      customerPayments: d.customerPayments.map((p) => (p.id === id ? updated : p)),
      notifications: [notice, ...d.notifications],
      activities: [log, ...d.activities],
    }));
    return { ok: true, data: updated };
  },
};
/** Read state of the signed-in user's own notifications. Supabase-backed. */
export const notificationService = {
  async markRead(id: string, _actorId: string) {
    const { error } = await (supabase as any)
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", id)
      .is("read_at", null);
    if (error) console.error("markRead failed", error);
  },
  async markAllRead(actorId: string) {
    const { error } = await (supabase as any)
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("recipient_id", actorId)
      .is("read_at", null);
    if (error) console.error("markAllRead failed", error);
  },
};
export const customerService = mockCustomerService;
export const customerPaymentService = mockCustomerPaymentService;

export const approvalService = mockApprovalService;
export const teamService = mockTeamService;
export { onboardingService } from "@/services/onboarding-service";
export const targetService = mockTargetService;
export const productService = mockProductService;
export const branchService = mockBranchService;
export const salesService = mockSalesService;
export const paymentService = mockPaymentService;
export const expenseService = mockExpenseService;
export const remittanceService = mockRemittanceService;

/* ---------------- Settings ---------------- */
export type GeneralSettingsInput = {
  name: string;
  businessEmail: string;
  phone: string;
  timezone: string;
};
export type OrganizationInput = { legalName: string };
export type PreferencesInput = {
  dateFormat: DateFormatPref;
  defaultReportPeriod: ReportPeriodPref;
};
export type PasswordInput = { current: string; next: string; confirm: string };
export type SettingsErrors = Partial<
  Record<
    | "name"
    | "businessEmail"
    | "phone"
    | "timezone"
    | "legalName"
    | "current"
    | "next"
    | "confirm"
    | "form",
    string
  >
>;
type SettingsResult<T> = { ok: true; data: T } | { ok: false; errors: SettingsErrors };

export const defaultPreferences = (userId: string): UserPreference => ({
  userId,
  dateFormat: "MMM D, YYYY",
  defaultReportPeriod: "month",
  updatedAt: "",
});
export const getPreferences = (db: Db, userId: string) =>
  db.preferences.find((p) => p.userId === userId) ?? defaultPreferences(userId);
export const timezones = [
  "Africa/Lagos",
  "Africa/Accra",
  "Africa/Nairobi",
  "Africa/Johannesburg",
  "Europe/London",
];
const fieldLabel: Record<string, string> = {
  name: "business name",
  businessEmail: "business email",
  phone: "phone number",
  timezone: "timezone",
  legalName: "organization name",
};

export function validatePassword(input: PasswordInput): SettingsErrors {
  const e: SettingsErrors = {};
  if (!input.current) e.current = "Enter your current password";
  if (!input.next) e.next = "Enter a new password";
  else if (input.next.length < 8 || !/[A-Za-z]/.test(input.next) || !/\d/.test(input.next))
    e.next = "Use at least 8 characters with a letter and a number";
  else if (input.next === input.current)
    e.next = "New password must be different from the current one";
  if (!input.confirm) e.confirm = "Confirm your new password";
  else if (input.confirm !== input.next) e.confirm = "Passwords do not match";
  return e;
}

export const settingsService = {
  /** Owner only: business profile shown across the app. */
  async updateGeneral(
    input: GeneralSettingsInput,
    actorId: string,
  ): Promise<SettingsResult<GeneralSettingsInput>> {
    await latency();
    const db = getDb();
    if (!getAccessScope(db, actorId).canManageSettings)
      return { ok: false, errors: { form: "Only the business owner can change these settings." } };
    const e: SettingsErrors = {};
    if (!input.name.trim()) e.name = "Business name is required";
    if (!/^\S+@\S+\.\S+$/.test(input.businessEmail.trim())) e.businessEmail = "Enter a valid email";
    if (!/^\+?[\d\s-]{7,}$/.test(input.phone.trim())) e.phone = "Enter a valid phone number";
    if (!timezones.includes(input.timezone)) e.timezone = "Select a timezone";
    if (Object.keys(e).length) return { ok: false, errors: e };
    const changed = (Object.keys(input) as (keyof GeneralSettingsInput)[]).filter(
      (k) => input[k].trim() !== String(db.tenant[k]),
    );
    if (!changed.length) return { ok: true, data: input };
    setDb((d) => ({
      ...d,
      tenant: {
        ...d.tenant,
        name: input.name.trim(),
        businessEmail: input.businessEmail.trim(),
        phone: input.phone.trim(),
        timezone: input.timezone,
        updatedAt: nowOnReferenceDay(d),
      },
      activities: [
        activity(
          d,
          actorId,
          "Settings updated",
          `Updated ${changed.map((k) => fieldLabel[k]).join(", ")}`,
          { branchId: null, entityId: d.tenant.id },
        ),
        ...d.activities,
      ],
    }));
    return { ok: true, data: input };
  },
  async updateOrganization(
    input: OrganizationInput,
    actorId: string,
  ): Promise<SettingsResult<OrganizationInput>> {
    await latency();
    const db = getDb();
    if (!getAccessScope(db, actorId).canManageSettings)
      return {
        ok: false,
        errors: { form: "Only the business owner can change organization details." },
      };
    if (!input.legalName.trim())
      return { ok: false, errors: { legalName: "Organization name is required" } };
    if (input.legalName.trim() === db.tenant.legalName) return { ok: true, data: input };
    setDb((d) => ({
      ...d,
      tenant: { ...d.tenant, legalName: input.legalName.trim(), updatedAt: nowOnReferenceDay(d) },
      activities: [
        activity(d, actorId, "Settings updated", "Updated organization name", {
          branchId: null,
          entityId: d.tenant.id,
        }),
        ...d.activities,
      ],
    }));
    return { ok: true, data: input };
  },
  async updateExpiryAlertMonths(months: number, actorId: string): Promise<SettingsResult<number>> {
    await latency();
    const db = getDb();
    if (!getAccessScope(db, actorId).canManageSettings)
      return { ok: false, errors: { form: "Only the business owner can change expiry alerts." } };
    if (!Number.isInteger(months) || months < 1 || months > 24)
      return { ok: false, errors: { form: "Enter a whole number of months between 1 and 24" } };
    setDb((d) => ({
      ...d,
      tenant: { ...d.tenant, expiryAlertMonths: months, updatedAt: nowOnReferenceDay(d) },
      activities: [activity(d, actorId, "Settings updated", `Expiry alerts start ${months} months before expiry`, { branchId: null, entityId: d.tenant.id }), ...d.activities],
    }));
    return { ok: true, data: months };
  },
  /** Any signed-in user, for their own account only. */
  async updatePreferences(
    input: PreferencesInput,
    actorId: string,
  ): Promise<SettingsResult<UserPreference>> {
    await latency();
    const pref: UserPreference = {
      userId: actorId,
      ...input,
      updatedAt: nowOnReferenceDay(getDb()),
    };
    setDb((d) => ({
      ...d,
      preferences: [...d.preferences.filter((p) => p.userId !== actorId), pref],
      activities: [
        activity(
          d,
          actorId,
          "Preferences updated",
          "Updated date format and default report period",
          { entityId: actorId },
        ),
        ...d.activities,
      ],
    }));
    return { ok: true, data: pref };
  },
  /**
   * Demo mode: there is no sign-in system yet, so nothing is stored. When real accounts are added,
   * this calls the auth provider's password update — passwords are never written to app data.
   */
  async changePassword(input: PasswordInput, actorId: string): Promise<SettingsResult<true>> {
    await latency();
    const e = validatePassword(input);
    if (Object.keys(e).length) return { ok: false, errors: e };
    setDb((d) => ({
      ...d,
      activities: [
        activity(d, actorId, "Password changed", "Changed account password", { entityId: actorId }),
        ...d.activities,
      ],
    }));
    return { ok: true, data: true };
  },
};

/** Demo sign-in: switching the viewed user records a Logout and a Login. */
export const sessionService = {
  switchUser(fromId: string, toId: string) {
    if (fromId === toId) return;
    setDb((d) => ({
      ...d,
      activities: [
        activity(d, toId, "Login", "Signed in"),
        activity(d, fromId, "Logout", "Signed out"),
        ...d.activities,
      ],
    }));
  },
};
