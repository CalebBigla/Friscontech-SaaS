import { useEffect, useMemo, useState } from "react";
import { Download, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { FilterSelect } from "@/components/shared";
import type { Db } from "@/data/mock-db";
import { IMPORT_COLUMNS, IMPORT_EXAMPLE, importErrorsCsv, validateImportRows, type ImportRow } from "@/lib/product-import";
import type { AccessScope } from "@/lib/session";
import { formatNaira, formatNumber } from "@/lib/format";
import { useImportProducts, type ImportSummary } from "@/hooks/use-products";
import { useIdempotencyKey } from "@/hooks/use-idempotency-key";

function download(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadImportTemplate() {
  const XLSX = await import("xlsx");
  const ws = XLSX.utils.json_to_sheet([IMPORT_EXAMPLE], { header: [...IMPORT_COLUMNS] });
  ws["!cols"] = IMPORT_COLUMNS.map((c) => ({ wch: Math.max(12, c.length + 2) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Products");
  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  download("friscontech-products-template.xlsx", new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
}

export function ImportProductsDialog({ open, onOpenChange, db, scope }: { open: boolean; onOpenChange: (o: boolean) => void; db: Db; scope: AccessScope }) {
  const branches = db.branches.filter((b) => b.status === "active" && (!scope.branchIds || scope.branchIds.includes(b.id)));
  const importProducts = useImportProducts();
  const idempotencyKey = useIdempotencyKey(open);
  const [file, setFile] = useState("");
  const [rows, setRows] = useState<ImportRow[] | null>(null);
  const [skipInvalid, setSkipInvalid] = useState(true);
  const [mode, setMode] = useState<"update" | "skip">("skip");
  const [branchId, setBranchId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  useEffect(() => {
    if (!open) return;
    setFile(""); setRows(null); setSummary(null); setError(""); setMode("skip"); setSkipInvalid(true);
    setBranchId(branches.length === 1 ? branches[0]!.id : "");
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const invalid = useMemo(() => rows?.filter((r) => r.errors.length) ?? [], [rows]);
  const existing = useMemo(() => rows?.filter((r) => !r.errors.length && r.existingProductId) ?? [], [rows]);
  const needsBranch = !!rows?.some((r) => r.openingQuantity > 0 && !r.errors.length);

  async function onFile(f: File | undefined) {
    if (!f) return;
    setError(""); setSummary(null);
    if (!/\.(xlsx|xls|csv)$/i.test(f.name)) return setError("Upload an .xlsx or .csv file.");
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await f.arrayBuffer(), { type: "array", cellDates: true });
      const sheet = wb.Sheets[wb.SheetNames[0]!];
      const raw = sheet ? XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" }) : [];
      if (!raw.length) return setError("The file has no product rows.");
      setFile(f.name);
      setRows(validateImportRows(db, raw));
    } catch {
      setError("Couldn't read this file. Use the template and save it as .xlsx or .csv.");
    }
  }

  async function confirm() {
    if (!rows) return;
    if (!skipInvalid && invalid.length) return setError("Fix the invalid rows or choose to skip them.");
    if (needsBranch && !branchId) return setError("Choose the branch that receives opening stock.");
    if (!scope.canManageProducts) return setError("You cannot import products");
    // Rows that failed the file checks never reach the server; they count as failed.
    const failedLocally = rows.filter((r) => r.errors.length);
    setBusy(true);
    try {
      const result = await importProducts.mutateAsync({
        p_rows: rows.filter((r) => !r.errors.length).map((r) => ({
          row_number: r.rowNumber,
          name: r.name,
          sku: r.sku,
          category: r.category,
          unit: r.unit,
          unit_price: r.unitPrice,
          unit_cost: r.unitCost,
          low_stock_threshold: r.lowStockThreshold,
          description: r.description || null,
          opening_quantity: r.openingQuantity,
          batch_number: r.batchNumber || null,
          expiry_date: r.expiryDate || null,
        })),
        p_mode: mode,
        p_branch_id: branchId || null,
        p_idempotency_key: idempotencyKey,
      });
      const merged: ImportSummary = {
        ...result,
        failed: result.failed + failedLocally.length,
        failures: [
          ...failedLocally.map((r) => ({ rowNumber: r.rowNumber, sku: r.sku, name: r.name, reason: r.errors.join("; ") })),
          ...result.failures,
        ],
      };
      setSummary(merged);
      toast.success(`Import finished: ${merged.created} created, ${merged.updated} updated`);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Import products</DialogTitle>
          <DialogDescription className="text-xs">Upload an Excel or CSV file. You'll check every row before anything is saved.</DialogDescription>
        </DialogHeader>

        {summary ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {([["Created", summary.created], ["Updated", summary.updated], ["Skipped", summary.skipped], ["Failed", summary.failed]] as const).map(([k, v]) => (
                <div key={k} className="rounded-md border border-border p-3"><p className="text-[11px] text-muted-foreground">{k}</p><p className="mt-1 text-lg font-bold">{v}</p></div>
              ))}
            </div>
            {summary.failures.length > 0 && (
              <Button variant="outline" size="sm" onClick={() => download("product-import-errors.csv", new Blob([importErrorsCsv(summary.failures)], { type: "text/csv" }))}><Download className="size-4" />Download error CSV</Button>
            )}
            <DialogFooter><Button onClick={() => onOpenChange(false)}>Done</Button></DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => void downloadImportTemplate()}><FileSpreadsheet className="size-4" />Download template</Button>
              <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-accent">
                <Upload className="size-4" />{file || "Choose file"}
                <input type="file" accept=".xlsx,.xls,.csv" className="sr-only" onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ""; }} />
              </label>
            </div>
            {error && <p className="text-xs font-medium text-destructive">{error}</p>}

            {rows && (
              <>
                <p className="text-xs text-muted-foreground">{rows.length} rows · <b className="text-foreground">{rows.length - invalid.length}</b> valid · <b className="text-destructive">{invalid.length}</b> with errors · {existing.length} existing SKUs</p>
                <div className="max-h-72 overflow-auto rounded-md border border-border">
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 bg-muted text-[10px] uppercase text-muted-foreground"><tr><th className="px-3 py-2">Row</th><th className="px-3 py-2">Product</th><th className="px-3 py-2 text-right">Price</th><th className="px-3 py-2 text-right">Opening</th><th className="px-3 py-2">Expiry</th><th className="px-3 py-2">Check</th></tr></thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.rowNumber} className={`border-t border-border ${r.errors.length ? "bg-destructive/5" : ""}`}>
                          <td className="px-3 py-2 text-muted-foreground">{r.rowNumber}</td>
                          <td className="px-3 py-2"><p className="font-bold">{r.name || "—"}</p><p className="font-mono text-[10px] text-muted-foreground">{r.sku || "—"}</p></td>
                          <td className="px-3 py-2 text-right">{Number.isFinite(r.unitPrice) ? formatNaira(r.unitPrice) : "—"}</td>
                          <td className="px-3 py-2 text-right">{Number.isFinite(r.openingQuantity) ? formatNumber(r.openingQuantity) : "—"}</td>
                          <td className="px-3 py-2">{r.expiryDate || "—"}{r.batchNumber && <span className="block text-[10px] text-muted-foreground">{r.batchNumber}</span>}</td>
                          <td className="px-3 py-2">{r.errors.length ? <span className="text-[11px] font-medium text-destructive">{r.errors.join(" · ")}</span> : r.existingProductId ? <span className="status status-warning">Existing SKU</span> : <span className="status status-success">New</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div><Label className="text-xs">Invalid rows</Label><div className="mt-1.5"><FilterSelect label="Invalid rows" className="w-full" value={skipInvalid ? "skip" : "stop"} onChange={(v) => setSkipInvalid(v === "skip")} options={[{ value: "skip", label: "Skip invalid rows" }, { value: "stop", label: "Don't import if any fail" }]} /></div></div>
                  <div><Label className="text-xs">Existing SKUs</Label><div className="mt-1.5"><FilterSelect label="Existing SKUs" className="w-full" value={mode} onChange={(v) => setMode(v as "update" | "skip")} options={[{ value: "skip", label: "Skip them" }, { value: "update", label: "Update existing SKUs" }]} /></div></div>
                  {needsBranch && <div><Label className="text-xs">Opening stock branch *</Label><div className="mt-1.5"><FilterSelect label="Branch" className="w-full" value={branchId || "none"} onChange={(v) => setBranchId(v === "none" ? "" : v)} options={[{ value: "none", label: "Select branch" }, ...branches.map((b) => ({ value: b.id, label: b.name }))]} /></div></div>}
                </div>
              </>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button disabled={!rows || busy || rows.length === invalid.length} onClick={() => void confirm()}>{busy && <Loader2 className="size-4 animate-spin" />}Import {rows ? rows.length - invalid.length : 0} rows</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
