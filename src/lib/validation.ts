/**
 * Client-side input checks, run before a write is sent to Supabase.
 *
 * Same rules and messages the app has always shown. The database (RPCs and
 * CHECK constraints) enforces them again; this only gives faster feedback.
 */
import type { Db, InventoryRecord } from "@/data/mock-db";
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
