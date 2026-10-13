import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FieldError, StockStatusBadge } from "@/components/shared";
import type { InventoryRecord } from "@/data/mock-db";
import { inventoryService, type FieldErrors } from "@/services/services";
import { getInventoryStatus } from "@/lib/inventory-calculations";

/** Two-step stock count correction: enter the count, then confirm the change. */
export function AdjustStockDialog({ record, productName, onClose, actorId }: { record: InventoryRecord | null; productName: string; onClose: () => void; actorId: string }) {
  const [count, setCount] = useState("");
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (record) { setCount(String(record.quantityOnHand)); setReason(""); setConfirming(false); setErrors({}); } }, [record]);
  if (!record) return null;
  const n = Number(count);
  const valid = count !== "" && Number.isInteger(n) && n >= 0;
  const delta = valid ? n - record.quantityOnHand : 0;

  function review() {
    const e: FieldErrors = {};
    if (!valid) e.quantity = "Enter a whole number of zero or more";
    else if (n < record!.quantityReserved) e.quantity = `Cannot go below the ${record!.quantityReserved} reserved units`;
    else if (delta === 0) e.quantity = "Counted quantity matches current stock";
    if (!reason.trim()) e.reason = "Give a reason for the adjustment";
    setErrors(e);
    if (!Object.keys(e).length) setConfirming(true);
  }
  async function confirm() {
    setSaving(true);
    const r = await inventoryService.adjustStock(record!.id, n, reason, actorId);
    setSaving(false);
    if (!r.ok) { setErrors(r.errors); setConfirming(false); toast.error(r.errors.form ?? "Unable to adjust stock"); return; }
    toast.success("Inventory updated successfully.", { description: `${productName}: ${record!.quantityOnHand} → ${n} on hand` });
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{confirming ? "Confirm stock adjustment" : "Adjust stock"}</DialogTitle><DialogDescription className="text-xs">{productName} · corrections are logged as an adjustment movement.</DialogDescription></DialogHeader>
        {!confirming ? (
          <div className="space-y-4">
            <div><Label htmlFor="adj-count" className="text-xs">Counted quantity on hand *</Label><Input id="adj-count" type="number" inputMode="numeric" min={0} value={count} onChange={(e) => setCount(e.target.value)} className="mt-1.5 h-10" /><FieldError message={errors.quantity} /></div>
            <div><Label htmlFor="adj-reason" className="text-xs">Reason *</Label><Textarea id="adj-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1.5 text-sm" placeholder="Cycle count variance, damaged units…" /><FieldError message={errors.reason} /></div>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2 rounded-md bg-muted p-4 text-xs">
            <div><p className="text-muted-foreground">Current</p><p className="mt-1 text-base font-bold">{record.quantityOnHand}</p></div>
            <div><p className="text-muted-foreground">Change</p><p className={`mt-1 text-base font-bold ${delta > 0 ? "text-success" : "text-destructive"}`}>{delta > 0 ? "+" : "−"}{Math.abs(delta)}</p></div>
            <div><p className="text-muted-foreground">New on hand</p><p className="mt-1 text-base font-bold">{n}</p></div>
            <div className="col-span-3 flex items-center justify-between border-t border-border pt-3"><span className="text-muted-foreground">Status after</span><StockStatusBadge status={getInventoryStatus({ ...record, quantityOnHand: n })} /></div>
            <p className="col-span-3 text-[11px] text-muted-foreground">Reason: {reason}</p>
          </div>
        )}
        <DialogFooter className="gap-2">
          {confirming ? <Button variant="outline" onClick={() => setConfirming(false)}>Back</Button> : <Button variant="outline" onClick={onClose}>Cancel</Button>}
          {confirming ? <Button onClick={confirm} disabled={saving}>{saving && <Loader2 className="size-4 animate-spin" />}Confirm adjustment</Button> : <Button onClick={review}>Review change</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
