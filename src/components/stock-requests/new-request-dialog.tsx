import { useEffect, useState } from "react";
import { ArrowLeft, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FieldError, FilterSelect, StockStatusBadge } from "@/components/shared";
import { useDb } from "@/services/mock-store";
import { stockRequestService, type FieldErrors } from "@/services/services";
import type { AccessScope } from "@/lib/session";
import { findInventory, getAvailable, getInventoryStatus } from "@/lib/inventory-calculations";
import { formatUnits } from "@/lib/format";

type Line = { key: number; productId: string; quantity: string };
let seq = 0;
const blank = (): Line => ({ key: ++seq, productId: "", quantity: "" });

/** One request, several products. Each line is validated on its own; a product can appear only once. */
export function NewRequestDialog({ open, onOpenChange, scope }: { open: boolean; onOpenChange: (o: boolean) => void; scope: AccessScope }) {
  const db = useDb();
  const branchId = scope.user.branchId ?? "";
  const branch = db.branches.find((b) => b.id === branchId);
  const [lines, setLines] = useState<Line[]>([blank()]);
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [review, setReview] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) { setLines([blank()]); setNote(""); setErrors({}); setReview(false); } }, [open]);

  const stocked = db.products.filter((p) => p.status === "active" && findInventory(db, branchId, p.id));
  const setLine = (key: number, patch: Partial<Line>) => { setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l))); setErrors({}); };

  /** Client-side check mirrors the service so the summary only opens for valid items. */
  function localErrors(): FieldErrors {
    const itemErrors: NonNullable<FieldErrors["itemErrors"]> = {};
    const seen = new Set<string>();
    lines.forEach((l, i) => {
      const e: Partial<Record<"productId" | "quantity", string>> = {};
      const q = Number(l.quantity);
      if (!l.productId) e.productId = "Select a product";
      else if (seen.has(l.productId)) e.productId = "This product is already in the request";
      seen.add(l.productId);
      if (!l.quantity || !Number.isInteger(q) || q <= 0) e.quantity = "Enter a whole number greater than zero";
      if (Object.keys(e).length) itemErrors[i] = e;
    });
    return Object.keys(itemErrors).length ? { itemErrors, items: "Fix the highlighted items" } : {};
  }

  async function submit() {
    setSaving(true);
    const r = await stockRequestService.createBatch({ branchId, note, items: lines.map((l) => ({ productId: l.productId, quantity: Number(l.quantity) })) }, scope.user.id);
    setSaving(false);
    if (!r.ok) { setErrors(r.errors); setReview(false); toast.error(r.errors.form ?? (r.errors.items as string | undefined) ?? "Please fix the highlighted fields"); return; }
    toast.success(r.data.length > 1 ? `${r.data.length} products requested.` : "Stock request submitted.", { description: `${r.data.map((x) => x.id).join(", ")} pending storekeeper review` });
    onOpenChange(false);
  }

  const itemErr = (i: number) => errors.itemErrors?.[i];
  const totalUnits = lines.reduce((a, l) => a + (Number(l.quantity) || 0), 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{review ? "Review stock request" : "New stock request"}</DialogTitle>
          <DialogDescription className="text-xs">{review ? "Check the items below before sending them to your storekeeper." : "Add every product you need. Your branch storekeeper reviews each item; stock is issued only after approval."}</DialogDescription>
        </DialogHeader>

        {!review ? (
          <form onSubmit={(e) => { e.preventDefault(); const le = localErrors(); if (Object.keys(le).length) { setErrors(le); return; } setReview(true); }} className="space-y-4">
            <div><Label htmlFor="req-branch" className="text-xs">Branch</Label><Input id="req-branch" value={branch?.name ?? "No branch assigned"} readOnly disabled className="mt-1.5 h-10" /><FieldError message={errors.branchId as string | undefined} /></div>
            <div className="space-y-3">
              {lines.map((l, i) => {
                const inv = l.productId ? findInventory(db, branchId, l.productId) : null;
                const available = inv ? getAvailable(inv) : 0;
                const q = Number(l.quantity);
                const taken = new Set(lines.filter((x) => x.key !== l.key).map((x) => x.productId));
                return (
                  <div key={l.key} className="rounded-md border border-border p-3" data-testid="request-line">
                    <div className="mb-2 flex items-center justify-between"><p className="text-[10px] font-bold uppercase text-muted-foreground">Item {i + 1}</p>
                      {lines.length > 1 && <Button type="button" variant="ghost" size="sm" className="h-7 text-destructive" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} aria-label={`Remove item ${i + 1}`}><Trash2 className="size-3.5" />Remove</Button>}</div>
                    <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
                      <div><Label className="text-xs">Product *</Label><div className="mt-1.5"><FilterSelect label={`Product for item ${i + 1}`} className="w-full" value={l.productId || "none"} onChange={(v) => setLine(l.key, { productId: v === "none" ? "" : v })}
                        options={[{ value: "none", label: "Select product" }, ...stocked.filter((p) => !taken.has(p.id) || p.id === l.productId).map((p) => ({ value: p.id, label: `${p.name} · ${p.sku}` }))]} /></div><FieldError message={itemErr(i)?.productId} /></div>
                      <div><Label htmlFor={`req-qty-${l.key}`} className="text-xs">Quantity *</Label><Input id={`req-qty-${l.key}`} type="number" inputMode="numeric" min={1} step={1} value={l.quantity} onChange={(e) => setLine(l.key, { quantity: e.target.value })} className="mt-1.5 h-10" /><FieldError message={itemErr(i)?.quantity} /></div>
                    </div>
                    {inv && <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted px-3 py-2 text-[11px]"><span>Available at {branch?.name}: <strong data-testid="request-available">{formatUnits(available)}</strong></span><StockStatusBadge status={getInventoryStatus(inv)} /></div>}
                    {inv && q > available && <p className="mt-1 text-[11px] text-warning">More than is currently available — this item may be partially fulfilled.</p>}
                  </div>
                );
              })}
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => setLines((ls) => [...ls, blank()])} disabled={lines.length >= stocked.length}><Plus className="size-4" />Add another product</Button>
            <div><Label htmlFor="req-note" className="text-xs">Note</Label><Textarea id="req-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} className="mt-1.5 text-sm" placeholder="Customer order, display stock…" /></div>
            <FieldError message={errors.form as string | undefined} />
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit">Review request</Button>
            </DialogFooter>
          </form>
        ) : (
          <div className="space-y-4">
            <div className="overflow-hidden rounded-md border border-border">
              <table className="w-full text-left text-xs">
                <thead><tr className="bg-muted text-[10px] uppercase text-muted-foreground"><th className="px-3 py-2">Product</th><th className="px-3 py-2 text-right">Requested</th><th className="px-3 py-2 text-right">Available</th></tr></thead>
                <tbody>{lines.map((l) => { const p = db.products.find((x) => x.id === l.productId); const inv = findInventory(db, branchId, l.productId); const a = inv ? getAvailable(inv) : 0; return (
                  <tr key={l.key} className="border-t border-border"><td className="px-3 py-2.5"><p className="font-semibold">{p?.name}</p><p className="font-mono text-[10px] text-muted-foreground">{p?.sku}</p></td><td className="px-3 py-2.5 text-right font-bold">{l.quantity}</td><td className={`px-3 py-2.5 text-right ${Number(l.quantity) > a ? "text-warning" : ""}`}>{a}</td></tr>); })}</tbody>
                <tfoot><tr className="border-t border-border bg-muted/50"><td className="px-3 py-2 font-semibold">{lines.length} {lines.length === 1 ? "product" : "products"} · {branch?.name}</td><td className="px-3 py-2 text-right font-bold">{formatUnits(totalUnits)}</td><td /></tr></tfoot>
              </table>
            </div>
            {note.trim() && <p className="text-xs"><span className="text-muted-foreground">Note: </span>{note.trim()}</p>}
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => setReview(false)}><ArrowLeft className="size-4" />Edit items</Button>
              <Button onClick={() => void submit()} disabled={saving}>{saving && <Loader2 className="size-4 animate-spin" />}Submit request</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
