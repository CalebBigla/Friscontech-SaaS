import { useEffect, useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError, FilterSelect } from "@/components/shared";
import type { Target } from "@/data/mock-db";
import { useDb } from "@/services/mock-store";
import { targetService, type FieldErrors } from "@/services/services";
import type { AccessScope } from "@/lib/session";
import { findRepTarget, shiftMonth } from "@/lib/catalog-calculations";
import { formatMonth, formatNaira } from "@/lib/format";

export const monthOptions = (center: string) => Array.from({ length: 12 }, (_, i) => shiftMonth(center, i - 6)).map((m) => ({ value: m, label: formatMonth(m) }));

/** Set a new rep target. Branch is always derived from the rep. */
export function SetTargetDialog({ open, onOpenChange, scope, defaultMonth, onEditExisting }: { open: boolean; onOpenChange: (o: boolean) => void; scope: AccessScope; defaultMonth: string; onEditExisting: (t: Target) => void }) {
  const db = useDb();
  const [form, setForm] = useState({ repId: "", month: defaultMonth, amount: "" });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) { setForm({ repId: "", month: defaultMonth, amount: "" }); setErrors({}); } }, [open, defaultMonth]);

  const reps = db.users.filter((u) => u.role === "sales_rep" && u.status === "active" && u.branchId && (!scope.branchIds || scope.branchIds.includes(u.branchId)));
  const rep = reps.find((r) => r.id === form.repId);
  const branch = db.branches.find((b) => b.id === rep?.branchId);
  const existing = form.repId ? findRepTarget(db, form.repId, form.month) : null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    const r = await targetService.create({ repId: form.repId, month: form.month, amount: form.amount.trim() === "" ? Number.NaN : Number(form.amount) }, scope.user.id);
    setSaving(false);
    if (!r.ok) { setErrors(r.errors); toast.error(r.errors.form ?? "Please fix the highlighted fields"); return; }
    toast.success("Target set", { description: `${rep?.name} · ${formatMonth(form.month)} · ${formatNaira(r.data.amount)}` });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Set target</DialogTitle><DialogDescription className="text-xs">Monthly sales target for a sales representative. Achievement is calculated from their recorded sales.</DialogDescription></DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div><Label className="text-xs">Sales representative *</Label><div className="mt-1.5"><FilterSelect label="Sales representative" className="w-full" value={form.repId || "none"} onChange={(v) => setForm((f) => ({ ...f, repId: v === "none" ? "" : v }))} options={[{ value: "none", label: "Select a rep" }, ...reps.map((r) => ({ value: r.id, label: `${r.name} · ${db.branches.find((b) => b.id === r.branchId)?.name ?? ""}` }))]} /></div><FieldError message={errors.repId} /></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label className="text-xs">Month *</Label><div className="mt-1.5"><FilterSelect label="Month" className="w-full" value={form.month} onChange={(v) => setForm((f) => ({ ...f, month: v }))} options={monthOptions(defaultMonth)} /></div><FieldError message={errors.month} /></div>
            <div><Label className="text-xs">Branch</Label><Input readOnly value={branch?.name ?? "Derived from rep"} className="mt-1.5 h-9 bg-muted" aria-label="Branch (derived from rep)" /></div>
          </div>
          {existing ? (
            <div className="alert-warning rounded-lg p-4 text-xs"><p className="font-semibold">{rep?.name} already has a {formatMonth(form.month)} target of {formatNaira(existing.amount)}.</p><Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => { onOpenChange(false); onEditExisting(existing); }}>Edit target</Button></div>
          ) : (
            <div><Label htmlFor="t-amount" className="text-xs">Target amount (₦) *</Label><Input id="t-amount" type="number" min={1} inputMode="numeric" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} className="mt-1.5 h-9" placeholder="e.g. 3000000" /><FieldError message={errors.amount} /></div>
          )}
          <DialogFooter className="gap-2"><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" disabled={saving || !!existing}>{saving && <Loader2 className="size-4 animate-spin" />}Set target</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Edit amount with a two-step confirmation showing current vs new. */
export function EditTargetDialog({ target, onClose, actorId }: { target: Target | null; onClose: () => void; actorId: string }) {
  const db = useDb();
  const [amount, setAmount] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (target) { setAmount(String(target.amount)); setConfirming(false); setError(undefined); } }, [target]);
  const rep = db.users.find((u) => u.id === target?.userId);
  const next = Number(amount);

  function review(e: FormEvent) {
    e.preventDefault();
    if (!Number.isFinite(next) || next <= 0 || amount.trim() === "") return setError("Enter a target above zero");
    if (target && Math.round(next) === target.amount) return setError("The new target matches the current target");
    setError(undefined); setConfirming(true);
  }
  async function save() {
    if (!target) return;
    setSaving(true);
    const r = await targetService.update(target.id, next, actorId);
    setSaving(false);
    if (!r.ok) { setConfirming(false); setError(r.errors.amount ?? r.errors.form); toast.error(r.errors.form ?? "Could not update target"); return; }
    toast.success("Target updated", { description: `${rep?.name} · ${formatNaira(r.data.amount)}` });
    onClose();
  }

  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{confirming ? "Confirm target change" : "Edit target"}</DialogTitle><DialogDescription className="text-xs">{rep?.name} · {target ? formatMonth(target.month) : ""}. Sales history is not changed.</DialogDescription></DialogHeader>
        {confirming ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-xs"><div className="rounded-md bg-muted p-4"><p className="text-muted-foreground">Current target</p><p className="mt-1 text-lg font-bold">{formatNaira(target?.amount ?? 0)}</p></div><div className="rounded-md bg-muted p-4"><p className="text-muted-foreground">New target</p><p className="mt-1 text-lg font-bold text-primary">{formatNaira(Math.round(next))}</p></div></div>
            <DialogFooter className="gap-2"><Button variant="outline" onClick={() => setConfirming(false)}>Back</Button><Button onClick={save} disabled={saving}>{saving && <Loader2 className="size-4 animate-spin" />}Confirm change</Button></DialogFooter>
          </div>
        ) : (
          <form onSubmit={review} className="space-y-4" noValidate>
            <div><Label htmlFor="edit-amount" className="text-xs">Target amount (₦) *</Label><Input id="edit-amount" type="number" min={1} inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} className="mt-1.5 h-9" /><FieldError message={error} /></div>
            <DialogFooter className="gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit">Review change</Button></DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
