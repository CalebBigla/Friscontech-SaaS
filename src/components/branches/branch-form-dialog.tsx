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
import { useBranches, useCreateBranch, useUpdateBranch } from "@/hooks/use-branches";
import { useUsers } from "@/hooks/use-users";
import { validateBranch, type BranchInput, type FieldErrors } from "@/services/services";

const empty: BranchInput = { name: "", code: "", location: "", address: "", phone: "", email: "", managerId: "", status: "active" };

export function BranchFormDialog({ open, onOpenChange, branch }: { open: boolean; onOpenChange: (o: boolean) => void; branch?: Branch | null; actorId: string }) {
  const db = useDb();
  const { data: branches = [], isLoading: branchesLoading } = useBranches();
  const { data: users = [], isLoading: usersLoading } = useUsers();
  const [form, setForm] = useState<BranchInput>(empty);
  const [errors, setErrors] = useState<FieldErrors>({});
  
  // Supabase mutations
  const createBranch = useCreateBranch();
  const updateBranch = useUpdateBranch();
  const saving = createBranch.isPending || updateBranch.isPending;

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setForm(branch ? { name: branch.name, code: branch.code, location: branch.location, address: branch.address, phone: branch.phone, email: branch.email, managerId: branch.managerId ?? "", status: branch.status } : empty);
  }, [open, branch]);

  const set = <K extends keyof BranchInput>(key: K, value: BranchInput[K]) => setForm((f) => ({ ...f, [key]: value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    
    // Branches and users are loaded from Supabase; the demo store is intentionally empty.
    const validationErrors = validateBranch({ ...db, users, branches }, form, branch?.id);
    if (Object.keys(validationErrors).length) {
      setErrors(validationErrors);
      toast.error("Please fix the highlighted fields");
      return;
    }
    
    try {
      if (branch) {
        // Update existing branch
        await updateBranch.mutateAsync({ id: branch.id, updates: form as Partial<Branch> });
        toast.success(`${form.name} updated`);
      } else {
        // Create new branch
        await createBranch.mutateAsync(form as Partial<Branch>);
        toast.success(`${form.name} created`);
      }
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Operation failed");
    }
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
          <DialogDescription className="text-xs">Create the branch first. The Owner assigns its manager when approving that manager's onboarding.</DialogDescription>
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
          <fieldset className="grid gap-3">
            <legend className="panel-title mb-2 text-muted-foreground">Management & status</legend>
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
            <Button type="submit" disabled={saving || branchesLoading || usersLoading}>{(saving || branchesLoading || usersLoading) && <Loader2 className="size-4 animate-spin" />}{branch ? "Save changes" : "Create branch"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
