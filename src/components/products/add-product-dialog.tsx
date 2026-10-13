import { useEffect, useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FieldError, FilterSelect } from "@/components/shared";
import type { Product } from "@/data/mock-db";
import { productService, type FieldErrors } from "@/services/services";

export const PRODUCT_UNITS = ["Piece", "Box", "Carton", "Pack", "Set", "Unit"];
const empty = { name: "", sku: "", category: "", unit: "Piece", unitPrice: "", unitCost: "", threshold: "10", description: "" };
type Key = keyof typeof empty;
const fromProduct = (p: Product) => ({ name: p.name, sku: p.sku, category: p.category, unit: p.unit, unitPrice: String(p.unitPrice), unitCost: String(p.unitCost), threshold: String(p.lowStockThreshold), description: p.description ?? "" });

/** Add or edit a catalogue product. Pass `product` to edit. */
export function ProductFormDialog({ open, onOpenChange, actorId, product, categories = [] }: { open: boolean; onOpenChange: (o: boolean) => void; actorId: string; product?: Product | null | undefined; categories?: string[] }) {
  const [form, setForm] = useState(empty);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) { setForm(product ? fromProduct(product) : empty); setErrors({}); } }, [open, product]);
  const set = (k: Key, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const units = product && !PRODUCT_UNITS.includes(product.unit) ? [product.unit, ...PRODUCT_UNITS] : PRODUCT_UNITS;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const num = (v: string) => (v.trim() === "" ? Number.NaN : Number(v));
    const input = { name: form.name, sku: form.sku, category: form.category, unit: form.unit, unitPrice: num(form.unitPrice), unitCost: num(form.unitCost), lowStockThreshold: num(form.threshold), description: form.description };
    setSaving(true);
    const r = product ? await productService.update(product.id, input, actorId) : await productService.create(input, actorId);
    setSaving(false);
    if (!r.ok) { setErrors(r.errors); toast.error(r.errors.form ?? "Please fix the highlighted fields"); return; }
    toast.success(product ? `${r.data.name} updated` : `${r.data.name} added`, { description: product ? "Changes apply everywhere this product is referenced." : "Created with 0 units — add stock to start selling." });
    onOpenChange(false);
  }

  const field = (k: Key, label: string, err: keyof FieldErrors, props: Record<string, unknown> = {}) => (
    <div><Label htmlFor={`p-${k}`} className="text-xs">{label}</Label><Input id={`p-${k}`} value={form[k]} onChange={(e) => set(k, e.target.value)} className="mt-1.5 h-9" aria-invalid={!!errors[err]} {...props} /><FieldError message={errors[err] as string | undefined} /></div>
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>{product ? "Edit product" : "Add product"}</DialogTitle><DialogDescription className="text-xs">{product ? `${product.sku} · updates the shared catalogue.` : "The product joins the shared catalogue used by inventory, sales and stock requests."}</DialogDescription></DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          {field("name", "Product name *", "name", { placeholder: "e.g. Samsung Galaxy A15" })}
          <div className="grid gap-3 sm:grid-cols-3">
            {field("sku", "SKU *", "sku", { placeholder: "SMS-A15" })}
            <div><Label htmlFor="p-category" className="text-xs">Category *</Label><Input id="p-category" list="product-categories" value={form.category} onChange={(e) => set("category", e.target.value)} className="mt-1.5 h-9" /><datalist id="product-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist><FieldError message={errors.category} /></div>
            <div><Label className="text-xs">Unit *</Label><div className="mt-1.5"><FilterSelect label="Unit" className="w-full" value={form.unit} onChange={(v) => set("unit", v)} options={units.map((u) => ({ value: u, label: u }))} /></div><FieldError message={errors.unit} /></div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">{field("unitPrice", "Selling price (₦) *", "unitPrice", { type: "number", min: 0, inputMode: "decimal" })}{field("unitCost", "Unit cost (₦) *", "unitCost", { type: "number", min: 0, inputMode: "decimal" })}{field("threshold", "Low-stock threshold *", "threshold", { type: "number", min: 0, step: 1, inputMode: "numeric" })}</div>
          <div><Label htmlFor="p-description" className="text-xs">Description</Label><Textarea id="p-description" value={form.description} onChange={(e) => set("description", e.target.value)} className="mt-1.5" rows={3} placeholder="Optional" /></div>
          <DialogFooter className="gap-2"><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" disabled={saving}>{saving && <Loader2 className="size-4 animate-spin" />}{product ? "Save changes" : "Add product"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Backwards-compatible name used by earlier screens. */
export const AddProductDialog = ProductFormDialog;
