import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FieldError, FilterSelect, StockStatusBadge } from "@/components/shared";
import { useLiveWorkspace } from "@/hooks/use-live-workspace";
import { useAddStock } from "@/hooks/use-inventory";
import { useIdempotencyKey } from "@/hooks/use-idempotency-key";
import { fieldErrorsFrom } from "@/lib/supabase-helpers";
import { FIELD_NAMES, validateAddStock, type AddStockInput, type FieldErrors } from "@/lib/validation";
import type { AccessScope } from "@/lib/session";
import { findInventory, getAvailable, getInventoryStatus } from "@/lib/inventory-calculations";
import { formatUnits } from "@/lib/format";

export function AddStockDialog({ open, onOpenChange, scope, defaults }: { open: boolean; onOpenChange: (o: boolean) => void; scope: AccessScope; defaults?: { branchId?: string | undefined; productId?: string | undefined } | undefined }) {
  const { db } = useLiveWorkspace();
  const addStock = useAddStock();
  const idempotencyKey = useIdempotencyKey(open);
  const [form, setForm] = useState({ branchId: "", productId: "", quantity: "", note: "", emergency: false, emergencyReason: "", batchNumber: "", expiryDate: "" });
  const [errors, setErrors] = useState<FieldErrors>({});
  const saving = addStock.isPending;
  // The owner's additions apply at once; a storekeeper's go to the manager.
  const direct = scope.user.role === "owner";
  const branches = db.branches.filter((b) => b.status === "active" && (!scope.branchIds || scope.branchIds.includes(b.id)));

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setForm({ branchId: defaults?.branchId ?? (branches.length === 1 ? branches[0]!.id : ""), productId: defaults?.productId ?? "", quantity: "", note: "", emergency: false, emergencyReason: "", batchNumber: "", expiryDate: "" });
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const product = db.products.find((p) => p.id === form.productId);
  const inv = form.branchId && form.productId ? findInventory(db, form.branchId, form.productId) : null;
  const qty = Number(form.quantity);
  const after = inv && Number.isInteger(qty) && qty > 0 ? { ...inv, quantityOnHand: inv.quantityOnHand + qty } : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const input: AddStockInput = { branchId: form.branchId, productId: form.productId, quantity: qty, note: form.note, emergency: form.emergency, emergencyReason: form.emergencyReason, batchNumber: form.batchNumber, expiryDate: form.expiryDate };
    const invalid = validateAddStock(db, scope, input);
    if (invalid) { setErrors(invalid); toast.error(invalid.form ?? "Please fix the highlighted fields"); return; }
    try {
      const approval = await addStock.mutateAsync({
        p_branch_id: input.branchId,
        p_product_id: input.productId,
        p_quantity: input.quantity,
        p_note: input.note.trim() || null,
        p_batch_number: input.batchNumber?.trim() || null,
        p_expiry_date: input.expiryDate ?? "",
        p_emergency: !direct && !!input.emergency,
        p_emergency_reason: input.emergency ? input.emergencyReason?.trim() ?? null : null,
        p_idempotency_key: idempotencyKey,
      });
      if (direct) toast.success("Stock added.", { description: `${product?.name} · +${formatUnits(qty)}` });
      else if (approval.emergency) toast.success("Emergency stock added.", { description: `${product?.name} · +${formatUnits(qty)} · your manager will review it` });
      else toast.success("Sent for manager approval.", { description: `${product?.name} · +${formatUnits(qty)} · stock counts once approved` });
      onOpenChange(false);
    } catch (error) {
      const failed = fieldErrorsFrom(error, FIELD_NAMES);
      setErrors(failed);
      toast.error(failed.form ?? "Please fix the highlighted fields");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>Add stock</DialogTitle><DialogDescription className="text-xs">{direct ? "Stock is added to the central stock immediately and recorded as a movement." : "Your manager approves the addition before it counts as available stock. Use Emergency only when the stock is needed right away."}</DialogDescription></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div><Label className="text-xs">Branch *</Label><div className="mt-1.5"><FilterSelect label="Branch" className="w-full" value={form.branchId || "none"} onChange={(v) => setForm((f) => ({ ...f, branchId: v === "none" ? "" : v }))} options={[{ value: "none", label: "Select branch" }, ...branches.map((b) => ({ value: b.id, label: b.name }))]} /></div><FieldError message={errors.branchId} /></div>
          <div><Label className="text-xs">Product *</Label><div className="mt-1.5"><FilterSelect label="Product" className="w-full" value={form.productId || "none"} onChange={(v) => setForm((f) => ({ ...f, productId: v === "none" ? "" : v }))} options={[{ value: "none", label: "Select product" }, ...db.products.filter((p) => p.status === "active").map((p) => ({ value: p.id, label: `${p.name} · ${p.sku}` }))]} /></div><FieldError message={errors.productId} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label htmlFor="stock-qty" className="text-xs">Quantity *</Label><Input id="stock-qty" type="number" inputMode="numeric" min={1} step={1} value={form.quantity} onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))} className="mt-1.5 h-10" placeholder="100" /><FieldError message={errors.quantity} /></div>
            <div><Label htmlFor="stock-unit" className="text-xs">Unit</Label><Input id="stock-unit" value={product?.unit ?? "—"} readOnly disabled className="mt-1.5 h-10" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label htmlFor="stock-batch" className="text-xs">Batch number (optional)</Label><Input id="stock-batch" value={form.batchNumber} onChange={(e) => setForm((f) => ({ ...f, batchNumber: e.target.value }))} className="mt-1.5 h-10" placeholder="LOT-2401" /></div>
            <div><Label htmlFor="stock-expiry" className="text-xs">Expiry date *</Label><Input id="stock-expiry" type="date" value={form.expiryDate} onChange={(e) => setForm((f) => ({ ...f, expiryDate: e.target.value }))} className="mt-1.5 h-10" /><FieldError message={errors.expiryDate} /></div>
          </div>
          <div><Label htmlFor="stock-note" className="text-xs">Reference / note</Label><Textarea id="stock-note" value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} className="mt-1.5 text-sm" rows={2} placeholder="New shipment received" /></div>
          {!direct && <div className={`rounded-md border p-3 ${form.emergency ? "border-destructive/40 bg-destructive/5" : "border-border"}`}>
            <label className="flex items-start gap-2.5 text-xs">
              <input type="checkbox" className="mt-0.5 size-4 accent-destructive" checked={form.emergency} onChange={(e) => setForm((f) => ({ ...f, emergency: e.target.checked }))} />
              <span><span className="font-semibold">Emergency override</span><span className="block text-[11px] text-muted-foreground">Adds the stock immediately. Your manager must review it afterwards and it's labelled Emergency in the audit log.</span></span>
            </label>
            {form.emergency && <div className="mt-3"><Label htmlFor="stock-emergency" className="text-xs">Emergency reason *</Label><Textarea id="stock-emergency" value={form.emergencyReason} onChange={(e) => setForm((f) => ({ ...f, emergencyReason: e.target.value }))} className="mt-1.5 text-sm" rows={2} placeholder="Customer waiting for a confirmed order" /><FieldError message={errors.emergencyReason as string | undefined} /></div>}
          </div>}
          {inv && (
            <div className="grid grid-cols-3 gap-2 rounded-md bg-muted p-4 text-xs">
              <div><p className="text-muted-foreground">On hand now</p><p className="mt-1 font-bold">{inv.quantityOnHand}</p></div>
              <div><p className="text-muted-foreground">{direct || form.emergency ? "After receipt" : "After approval"}</p><p className="mt-1 font-bold">{after ? after.quantityOnHand : "—"}</p></div>
              <div><p className="text-muted-foreground">Status</p><div className="mt-1"><StockStatusBadge status={getInventoryStatus(after ?? inv)} /></div></div>
              <p className="col-span-3 text-[11px] text-muted-foreground">Available now: {formatUnits(getAvailable(inv))}</p>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving && <Loader2 className="size-4 animate-spin" />}{direct ? "Add stock" : form.emergency ? "Add now (emergency)" : "Submit for approval"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
