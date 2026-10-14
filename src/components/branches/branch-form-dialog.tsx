import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError, FilterSelect } from "@/components/shared";
import type { Branch } from "@/data/mock-db";
import { useDb } from "@/services/mock-store";
import { branchService, type BranchInput, type FieldErrors } from "@/services/services";

const empty: BranchInput = { name: "", code: "", location: "", address: "", phone: "", email: "", managerId: "", status: "active" };

export function BranchFormDialog({ open, onOpenChange, branch, actorId }: { open: boolean; onOpenChange: (o: boolean) => void; branch?: Branch | null; actorId: string }) {
  const db = useDb();
  const [form, setForm] = useState<BranchInput>(empty);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setForm(branch ? { name: branch.name, code: branch.code, location: branch.location, address: branch.address, phone: branch.phone, email: branch.email, managerId: branch.managerId ?? "", status: branch.status } : empty);
  }, [open, branch]);

  // Managers who are free, or who only run an inactive branch, or already run this one.
  const managers = db.users.filter((x) => x.role === "manager" && x.status === "active" &&
    !db.branches.some((b) => b.managerId === x.id && b.status === "active" && b.id !== branch?.id));

  const set = <K extends keyof BranchInput>(key: K, value: BranchInput[K]) => setForm((f) => ({ ...f, [key]: value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const result = branch ? await branchService.update(branch.id, form, actorId) : await branchService.create(form, actorId);
    setSaving(false);
    if (!result.ok) { setErrors(result.errors); toast.error("Please fix the highlighted fields"); return; }
    toast.success(branch ? `${result.data.name} updated` : `${result.data.name} created`);
    onOpenChange(false);
  }

  const field = (key: "name" | "code" | "location" | "address" | "phone" | "email", label: string, placeholder: string, required = false) => (
    <div>
      <Label htmlFor={`branch-${key}`} className="text-xs">{label}{required && <span className="text-destructive"> *</span>}</Label>
      <Input id={`branch-${key}`} value={form[key]} onChange={(e) => set(key, e.target.value)} placeholder={placeholder} className="mt-1.5 h-9 text-sm" aria-invalid={!!errors[key]} />
      <FieldError message={errors[key]} />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{branch ? `Edit ${branch.name}` : "New branch"}</DialogTitle>
          <DialogDescription className="text-xs">Revenue, sales and performance come from operational data and can't be edited here.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-5">
          <fieldset className="space-y-3">
            <legend className="panel-title mb-2 text-muted-foreground">Basic information</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {field("name", "Branch name", "e.g. Surulere Branch", true)}
              {field("code", "Branch code", "e.g. SRL-007", true)}
              {field("location", "Location", "e.g. Surulere, Lagos", true)}
              {field("phone", "Phone number", "+234 …")}
            </div>
            {field("address", "Address", "Street address")}
            {field("email", "Email", "branch@westfield.ng")}
          </fieldset>
          <fieldset className="grid gap-3 sm:grid-cols-2">
            <legend className="panel-title mb-2 text-muted-foreground">Management & status</legend>
            <div>
              <Label className="text-xs">Branch manager<span className="text-destructive"> *</span></Label>
              <div className="mt-1.5"><FilterSelect label="Branch manager" className="w-full" value={form.managerId || "none"} onChange={(v) => set("managerId", v === "none" ? "" : v)}
                options={[{ value: "none", label: "Select a manager" }, ...managers.map((m) => ({ value: m.id, label: m.name }))]} /></div>
              <FieldError message={errors.managerId} />
            </div>
            <div>
              <Label className="text-xs">Status</Label>
              <div className="mt-1.5 grid grid-cols-2 rounded-md border border-border p-1">
                {(["active", "inactive"] as const).map((s) => <Button key={s} type="button" size="sm" variant={form.status === s ? "default" : "ghost"} onClick={() => set("status", s)} className="capitalize">{s}</Button>)}
              </div>
            </div>
          </fieldset>
          <FieldError message={errors.form} />
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving && <Loader2 className="size-4 animate-spin" />}{branch ? "Save changes" : "Create branch"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
