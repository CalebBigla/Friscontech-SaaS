import { useEffect, useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError, FilterSelect } from "@/components/shared";
import type { Role, User, UserStatus } from "@/data/mock-db";
import { getAccessScope, type AccessScope } from "@/lib/session";
import { roleLabel } from "@/lib/format";
import { assignableRoles, roleNeedsBranch, userStatusLabel } from "@/lib/team";
import { useDb } from "@/services/mock-store";
import { teamService, type FieldErrors } from "@/services/services";

const NONE = "none";
const roleTone: Record<Role, string> = { owner: "status-violet", manager: "status-brand", storekeeper: "status-warning", sales_rep: "status-success" };
export function RoleBadge({ role }: { role: Role }) {
  return <span className={`status whitespace-nowrap ${roleTone[role]}`}>{role === "owner" ? "Business Owner" : roleLabel[role]}</span>;
}
const statusTone: Record<UserStatus, string> = { active: "status-success", inactive: "status-danger", pending: "status-warning" };
export function MemberStatusBadge({ status }: { status: UserStatus }) {
  return <span className={`status whitespace-nowrap ${statusTone[status]}`}>{userStatusLabel[status]}</span>;
}

/** Add (member = null) or edit a team member. Options follow the caller's permissions. */
export function TeamMemberDialog({ open, onOpenChange, scope, member }: { open: boolean; onOpenChange: (o: boolean) => void; scope: AccessScope; member?: User | null | undefined }) {
  const db = useDb();
  const roles = assignableRoles(scope);
  const initial = () => member
    ? { name: member.name, email: member.email, role: member.role, branchId: member.branchId ?? NONE, status: member.status }
    : { name: "", email: "", role: roles[roles.length - 1] ?? "sales_rep", branchId: scope.branchIds?.length === 1 ? scope.branchIds[0]! : NONE, status: "pending" as UserStatus };
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) { setForm(initial()); setErrors({}); } }, [open, member]); // eslint-disable-line react-hooks/exhaustive-deps
  const branches = db.branches.filter((b) => !scope.branchIds || scope.branchIds.includes(b.id));
  const roleOptions = (member && !roles.includes(member.role) ? [member.role, ...roles] : roles);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const input = { ...form, branchId: form.branchId === NONE ? "" : form.branchId };
    setSaving(true);
    if (!member && scope.user.role !== "owner") {
      const q = await teamService.requestMember(input, scope.user.id);
      setSaving(false);
      if (!q.ok) { setErrors(q.errors); toast.error(q.errors.form ?? "Please fix the highlighted fields"); return; }
      toast.success("Sent to the Owner for approval.", { description: `${q.data.member?.name} joins the team once approved (${q.data.id}).` });
      onOpenChange(false); return;
    }
    const r = member ? await teamService.update(member.id, input, scope.user.id) : await teamService.create(input, scope.user.id);
    setSaving(false);
    if (!r.ok) { setErrors(r.errors); toast.error(r.errors.form ?? "Please fix the highlighted fields"); return; }
    toast.success(member ? `${r.data.name} updated` : `${r.data.name} added to the team`, member ? undefined : { description: r.data.status === "pending" ? "Invitation pending — the account activates once accepted." : undefined });
    onOpenChange(false);
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>{member ? "Edit team member" : "Add team member"}</DialogTitle>
          <DialogDescription className="text-xs">{member ? member.email : scope.user.role === "owner" ? "Invite a manager, storekeeper or sales representative." : "Propose a storekeeper or sales representative for your branch. The Owner approves new members."}</DialogDescription></DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div><Label htmlFor="t-name" className="text-xs">Full name *</Label><Input id="t-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1.5 h-9" placeholder="e.g. Ngozi Umeh" aria-invalid={!!errors.name} /><FieldError message={errors.name} /></div>
          <div><Label htmlFor="t-email" className="text-xs">Email *</Label><Input id="t-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="mt-1.5 h-9" placeholder="name@westfield.ng" aria-invalid={!!errors.email} /><FieldError message={errors.email} /></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label className="text-xs">Role *</Label><div className="mt-1.5"><FilterSelect label="Role" className="w-full" value={form.role} onChange={(v) => setForm({ ...form, role: v as Role })} options={roleOptions.map((r) => ({ value: r, label: roleLabel[r] }))} /></div><FieldError message={errors.role} /></div>
            <div><Label className="text-xs">Branch {roleNeedsBranch(form.role) ? "*" : ""}</Label><div className="mt-1.5"><FilterSelect label="Branch" className="w-full" value={form.branchId} onChange={(v) => setForm({ ...form, branchId: v })}
              options={[{ value: NONE, label: roleNeedsBranch(form.role) ? "Select branch" : "Unassigned" }, ...branches.map((b) => ({ value: b.id, label: `${b.name}${b.status === "inactive" ? " (inactive)" : ""}` }))]} /></div><FieldError message={errors.branchId} /></div>
          </div>
          <div><Label className="text-xs">Status *</Label><div className="mt-1.5"><FilterSelect label="Status" className="w-full" value={form.status} onChange={(v) => setForm({ ...form, status: v as UserStatus })} options={(["pending", "active", "inactive"] as UserStatus[]).map((s) => ({ value: s, label: userStatusLabel[s] }))} /></div><FieldError message={errors.status} /></div>
          <FieldError message={errors.form} />
          <DialogFooter className="gap-2"><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" disabled={saving}>{saving && <Loader2 className="size-4 animate-spin" />}{member ? "Save changes" : scope.user.role === "owner" ? "Add member" : "Send for approval"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function MemberStatusDialog({ member, onClose, actorId }: { member: User | null; onClose: () => void; actorId: string }) {
  const [busy, setBusy] = useState(false);
  const scope = getAccessScope(useDb(), actorId);
  const deactivating = member?.status !== "inactive";
  const deleting = scope.user.role === "owner" && deactivating;
  return (
    <AlertDialog open={!!member} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{deleting ? `Delete ${member?.name}?` : deactivating ? "Deactivate this team member?" : `Activate ${member?.name}?`}</AlertDialogTitle>
          <AlertDialogDescription>{deactivating
            ? deleting
              ? `${member?.name} will be marked inactive and lose access to SalesFlow Pro. Their sales, payments, targets, stock requests and audit history will be preserved.`
              : `${member?.name} will no longer be able to access SalesFlow Pro. Their sales, targets, stock requests and audit history are kept.`
            : "They regain access with their existing role and branch."}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction disabled={busy} className={deactivating ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""} onClick={async (e) => {
            e.preventDefault();
            if (!member) return;
            setBusy(true);
            const r = await teamService.setStatus(member.id, deactivating ? "inactive" : "active", actorId);
            setBusy(false);
            if (r.ok) toast.success(`${member.name} ${deleting ? "deleted" : deactivating ? "deactivated" : "activated"}`); else toast.error(r.errors.form ?? "Could not update member");
            onClose();
          }}>{busy ? "Saving…" : deleting ? "Delete" : deactivating ? "Deactivate" : "Activate"}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
