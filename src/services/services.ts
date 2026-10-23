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


// ---------- targets ----------

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
export { canReviewApproval } from "@/lib/approvals";
import { canReviewApproval } from "@/lib/approvals";

// ---------- customers (accounts) and customer payments ----------


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

export const teamService = mockTeamService;
export { onboardingService } from "@/services/onboarding-service";
export const branchService = mockBranchService;
export const salesService = mockSalesService;

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
