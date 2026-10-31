import { useEffect, useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError, FilterSelect } from "@/components/shared";
import type { Target } from "@/data/mock-db";
import type { Db } from "@/data/mock-db";
import { useCreateBranchTarget, useCreateTarget, useUpdateTarget } from "@/hooks/use-targets";
import { runWrite, validateBranchTargetCreate, validateTargetCreate, validateTargetUpdate, type FieldErrors } from "@/lib/validation";
import { getAccessScope, type AccessScope } from "@/lib/session";
import { findBranchTarget, findRepTarget, shiftMonth } from "@/lib/catalog-calculations";
import { formatMonth, formatNaira } from "@/lib/format";

export const monthOptions = (center: string) => Array.from({ length: 12 }, (_, i) => shiftMonth(center, i - 6)).map((m) => ({ value: m, label: formatMonth(m) }));

export type TargetKind = "branch" | "rep";

/** Set a new branch or rep target. A rep target's branch is always derived from the rep. */
export function SetTargetDialog({ open, onOpenChange, scope, defaultMonth, onEditExisting, db, defaultKind = "branch", defaultBranchId = "" }: { open: boolean; onOpenChange: (o: boolean) => void; scope: AccessScope; defaultMonth: string; onEditExisting: (t: Target) => void; db: Db; defaultKind?: TargetKind; defaultBranchId?: string }) {
  const [kind, setKind] = useState<TargetKind>(defaultKind);
  const [form, setForm] = useState({ repId: "", branchId: defaultBranchId, month: defaultMonth, amount: "" });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);
  const createTarget = useCreateTarget();
  const createBranchTarget = useCreateBranchTarget();
  useEffect(() => { if (open) { setKind(defaultKind); setForm({ repId: "", branchId: defaultBranchId, month: defaultMonth, amount: "" }); setErrors({}); } }, [open, defaultMonth, defaultKind, defaultBranchId]);

  const reps = db.users.filter((u) => u.role === "sales_rep" && u.status === "active" && u.branchId && (!scope.branchIds || scope.branchIds.includes(u.branchId)));
  const branches = db.branches.filter((b) => b.status === "active" && (!scope.branchIds || scope.branchIds.includes(b.id)));
  const rep = reps.find((r) => r.id === form.repId);
  const branch = db.branches.find((b) => b.id === (kind === "branch" ? form.branchId : rep?.branchId));
  const who = kind === "branch" ? `${branch?.name ?? ""} branch` : rep?.name ?? "";
  const existing = kind === "branch"
    ? (form.branchId ? findBranchTarget(db, form.branchId, form.month) : null)
    : (form.repId ? findRepTarget(db, form.repId, form.month) : null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    const amount = form.amount.trim() === "" ? Number.NaN : Number(form.amount);
    const result = kind === "branch"
      ? await runWrite(validateBranchTargetCreate(db, scope, { branchId: form.branchId, month: form.month, amount }), () =>
        createBranchTarget.mutateAsync({ p_branch_id: form.branchId, p_month: form.month, p_amount: Math.round(amount) }))
      : await runWrite(validateTargetCreate(db, scope, { repId: form.repId, month: form.month, amount }), () =>
        createTarget.mutateAsync({ p_rep_id: form.repId, p_month: form.month, p_amount: Math.round(amount) }));
    setSaving(false);
    if (!result.ok) {
      setErrors(result.errors);
      toast.error(result.errors.form ?? "Please fix the highlighted fields");
      return;
    }
    toast.success("Target set", { description: `${who} · ${formatMonth(form.month)} · ${formatNaira(amount)}` });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Set target</DialogTitle><DialogDescription className="text-xs">{kind === "branch" ? "Monthly sales target for a whole branch. Achievement counts every completed sale in the branch." : "Monthly sales target for a sales representative. Achievement is calculated from their recorded sales."}</DialogDescription></DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div role="radiogroup" aria-label="Target for" className="grid grid-cols-2 rounded-md border border-border bg-muted/40 p-1">
            {(["branch", "rep"] as const).map((k) => (
              <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => { setKind(k); setErrors({}); }}
                className={`rounded px-3 py-1.5 text-xs font-semibold transition-colors ${kind === k ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                {k === "branch" ? "Branch" : "Sales rep"}
              </button>
            ))}
          </div>
          {kind === "branch" ? (
            <div><Label className="text-xs">Branch *</Label><div className="mt-1.5"><FilterSelect label="Branch" className="w-full" value={form.branchId || "none"} onChange={(v) => setForm((f) => ({ ...f, branchId: v === "none" ? "" : v }))} options={[{ value: "none", label: "Select a branch" }, ...branches.map((b) => ({ value: b.id, label: b.name }))]} /></div><FieldError message={errors.branchId} /></div>
          ) : (
            <div><Label className="text-xs">Sales representative *</Label><div className="mt-1.5"><FilterSelect label="Sales representative" className="w-full" value={form.repId || "none"} onChange={(v) => setForm((f) => ({ ...f, repId: v === "none" ? "" : v }))} options={[{ value: "none", label: "Select a rep" }, ...reps.map((r) => ({ value: r.id, label: `${r.name} · ${db.branches.find((b) => b.id === r.branchId)?.name ?? ""}` }))]} /></div><FieldError message={errors.repId} /></div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label className="text-xs">Month *</Label><div className="mt-1.5"><FilterSelect label="Month" className="w-full" value={form.month} onChange={(v) => setForm((f) => ({ ...f, month: v }))} options={monthOptions(defaultMonth)} /></div><FieldError message={errors.month} /></div>
            {kind === "rep" && <div><Label className="text-xs">Branch</Label><Input readOnly value={branch?.name ?? "Derived from rep"} className="mt-1.5 h-9 bg-muted" aria-label="Branch (derived from rep)" /></div>}
          </div>
          {existing ? (
            <div className="alert-warning rounded-lg p-4 text-xs"><p className="font-semibold">{who} already has a {formatMonth(form.month)} target of {formatNaira(existing.amount)}.</p><Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => { onOpenChange(false); onEditExisting(existing); }}>Edit target</Button></div>
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
export function EditTargetDialog({ target, onClose, actorId, db }: { target: Target | null; onClose: () => void; actorId: string; db: Db }) {
  const [amount, setAmount] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const updateTarget = useUpdateTarget();
  useEffect(() => { if (target) { setAmount(String(target.amount)); setConfirming(false); setError(undefined); } }, [target]);
  const rep = db.users.find((u) => u.id === target?.userId);
  const name = target?.scope === "branch" ? `${db.branches.find((b) => b.id === target.branchId)?.name ?? ""} branch` : rep?.name;
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
    const result = await runWrite(validateTargetUpdate(db, getAccessScope(db, actorId), target, next), () =>
      updateTarget.mutateAsync({ p_target_id: target.id, p_amount: Math.round(next) }),
    );
    setSaving(false);
    if (!result.ok) {
      setConfirming(false);
      const message = result.errors.amount ?? result.errors.repId ?? result.errors.branchId ?? result.errors.form ?? "Could not update target";
      setError(message);
      toast.error(message);
      return;
    }
    toast.success("Target updated", { description: `${name} · ${formatNaira(next)}` });
    onClose();
  }

  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{confirming ? "Confirm target change" : "Edit target"}</DialogTitle><DialogDescription className="text-xs">{name} · {target ? formatMonth(target.month) : ""}. Sales history is not changed.</DialogDescription></DialogHeader>
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
