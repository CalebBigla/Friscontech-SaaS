/** Product spreadsheet import: template columns, row parsing and validation. Pure functions. */
import type { Db } from "@/data/mock-db";

export const IMPORT_COLUMNS = [
  "name", "sku", "category", "unit", "unitPrice", "unitCost", "lowStockThreshold",
  "description", "openingQuantity", "batchNumber", "expiryDate",
] as const;
export type ImportColumn = (typeof IMPORT_COLUMNS)[number];
export const IMPORT_EXAMPLE: Record<ImportColumn, string | number> = {
  name: "Example Rice 50kg", sku: "RICE-50", category: "Grains", unit: "bag", unitPrice: 78000,
  unitCost: 65000, lowStockThreshold: 10, description: "Long grain parboiled", openingQuantity: 40,
  batchNumber: "LOT-2401", expiryDate: "2027-06-30",
};

export type ImportRow = {
  rowNumber: number;
  name: string; sku: string; category: string; unit: string;
  unitPrice: number; unitCost: number; lowStockThreshold: number; description: string;
  openingQuantity: number; batchNumber: string; expiryDate: string;
  errors: string[];
  existingProductId: string | null;
};

const str = (v: unknown) => (v === undefined || v === null ? "" : String(v).trim());
const num = (v: unknown) => { const s = str(v).replace(/[₦,\s]/g, ""); return s === "" ? NaN : Number(s); };

/** Accepts YYYY-MM-DD, DD/MM/YYYY, JS Dates and Excel serial numbers. Returns "" when blank, "invalid" when unreadable. */
export function normalizeDate(v: unknown): string {
  if (v === undefined || v === null || str(v) === "") return "";
  if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  if (typeof v === "number") return new Date(Math.round((v - 25569) * 864e5)).toISOString().slice(0, 10);
  const s = str(v);
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return valid(+m[1]!, +m[2]!, +m[3]!);
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) return valid(+m[3]!, +m[2]!, +m[1]!);
  return "invalid";
}
function valid(y: number, mo: number, d: number) {
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d ? dt.toISOString().slice(0, 10) : "invalid";
}

const keyOf = (h: string) => IMPORT_COLUMNS.find((c) => c.toLowerCase() === h.replace(/[\s_*()]/g, "").replace(/optional/i, "").toLowerCase());

export function validateImportRows(db: Db, raw: Record<string, unknown>[]): ImportRow[] {
  const seen = new Map<string, number>();
  const rows = raw.map((r, i) => {
    const g: Partial<Record<ImportColumn, unknown>> = {};
    for (const [h, v] of Object.entries(r)) { const k = keyOf(h); if (k) g[k] = v; }
    const errors: string[] = [];
    const name = str(g.name), sku = str(g.sku).toUpperCase();
    if (!name) errors.push("Missing name");
    if (!sku) errors.push("Missing SKU");
    const unitPrice = num(g.unitPrice), unitCost = num(g.unitCost);
    const threshold = str(g.lowStockThreshold) === "" ? 0 : num(g.lowStockThreshold);
    const opening = str(g.openingQuantity) === "" ? 0 : num(g.openingQuantity);
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) errors.push(Number.isFinite(unitPrice) && unitPrice < 0 ? "Negative unit price" : "Unit price must be above zero");
    if (!Number.isFinite(unitCost)) errors.push("Missing unit cost");
    else if (unitCost < 0) errors.push("Negative unit cost");
    else if (unitCost > unitPrice) errors.push("Unit cost exceeds unit price");
    if (!Number.isInteger(threshold) || threshold < 0) errors.push(threshold < 0 ? "Negative low-stock threshold" : "Threshold must be a whole number");
    if (!Number.isInteger(opening) || opening < 0) errors.push(opening < 0 ? "Negative opening quantity" : "Opening quantity must be a whole number");
    const expiryDate = normalizeDate(g.expiryDate);
    if (expiryDate === "invalid") errors.push("Invalid expiry date");
    const batchNumber = str(g.batchNumber);
    if (batchNumber && !expiryDate) errors.push("Batch number needs an expiry date");
    if (!str(g.category)) errors.push("Missing category");
    if (!str(g.unit)) errors.push("Missing unit");
    if (sku) {
      if (seen.has(sku)) errors.push(`Duplicate SKU (also row ${seen.get(sku)})`);
      else seen.set(sku, i + 2);
    }
    const existing = sku ? db.products.find((p) => p.sku.toUpperCase() === sku) : undefined;
    return {
      rowNumber: i + 2, name, sku, category: str(g.category), unit: str(g.unit),
      unitPrice, unitCost, lowStockThreshold: threshold, description: str(g.description),
      openingQuantity: opening, batchNumber, expiryDate: expiryDate === "invalid" ? "" : expiryDate,
      errors, existingProductId: existing?.id ?? null,
    };
  });
  return rows;
}

const csvCell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
export function importErrorsCsv(rows: { rowNumber: number; sku: string; name: string; reason: string }[]) {
  return ["row,sku,name,reason", ...rows.map((r) => [r.rowNumber, r.sku, r.name, r.reason].map(csvCell).join(","))].join("\n");
}
