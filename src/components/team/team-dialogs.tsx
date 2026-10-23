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
import { useAuth } from "@/contexts/auth-context";
import { useLiveWorkspace } from "@/hooks/use-live-workspace";
import { useRequestTeamMember, useSetTeamMemberStatus, useUpdateTeamMember } from "@/hooks/use-users";
import {
  runWrite,
  splitName,
  validateMemberStatus,
  validateTeamMemberRequest,
  validateTeamMemberUpdate,
  type FieldErrors,
} from "@/lib/validation";
import { getAccessScope, type AccessScope } from "@/lib/session";
import { roleLabel } from "@/lib/format";
import { assignableRoles, roleNeedsBranch, userStatusLabel } from "@/lib/team";
import { onboardingUrl } from "@/lib/onboarding";
import { copyText } from "@/components/team/onboarding-panel";
import { onboardingService } from "@/services/onboarding-service";

const NONE = "none";
const roleTone: Record<Role, string> = { owner: "status-violet", manager: "status-brand", storekeeper: "status-warning", sales_rep: "status-success" };
export function RoleBadge({ role }: { role: Role }) {
  return <span className={`status whitespace-nowrap ${roleTone[role]}`}>{role === "owner" ? "Business Owner" : roleLabel[role]}</span>;
}
const statusTone: Record<UserStatus, string> = { active: "status-success", inactive: "status-danger", pending: "status-warning", rejected: "status-danger", suspended: "status-danger" };
export function MemberStatusBadge({ status }: { status: UserStatus }) {
  return <span className={`status whitespace-nowrap ${statusTone[status]}`}>{userStatusLabel[status]}</span>;
}

/** Add (member = null): owner creates a Supabase invite, manager requests approval. Edit calls update_team_member. */
export function TeamMemberDialog({
  open,
  onOpenChange,
  scope,
  member,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  scope: AccessScope;
  member?: User | null | undefined;
}) {
  const { db } = useLiveWorkspace();
  const { user: authUser } = useAuth();
  const updateMember = useUpdateTeamMember();
  const requestMember = useRequestTeamMember();
  const roles = assignableRoles(scope);

  // ---- form state ----
  const initial = () =>
    member
      ? { name: member.name, email: member.email, role: member.role as Role, branchId: member.branchId ?? NONE, status: member.status }
      : { name: "", email: "", role: (roles[roles.length - 1] ?? "sales_rep") as Role, branchId: scope.branchIds?.length === 1 ? scope.branchIds[0]! : NONE, status: "pending" as UserStatus };

  const [form, setForm] = useState(initial);
  // invite-specific fields (only used when creating, owner only)
  const [jobTitle, setJobTitle] = useState("");
  const [department, setDepartment] = useState("");
  const [startDate, setStartDate] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(initial());
      setJobTitle("");
      setDepartment("");
      setStartDate(new Date().toISOString().slice(0, 10));
      setErrors({});
    }
  }, [open, member]); // eslint-disable-line react-hooks/exhaustive-deps

  const branches = db.branches.filter((b) => !scope.branchIds || scope.branchIds.includes(b.id));
  const roleOptions = member && !roles.includes(member.role as Role) ? [member.role as Role, ...roles] : roles;
  const [nameParts] = form.name.split(" ").filter(Boolean);
  const firstName = form.name.split(" ")[0] ?? "";
  const lastName = form.name.split(" ").slice(1).join(" ");

  async function submit(e: FormEvent) {
    e.preventDefault();
    const branchId = form.branchId === NONE ? "" : form.branchId;
    setSaving(true);

    // ---- EDIT path ----
    if (member) {
      const input = { ...form, branchId };
      const names = splitName(form.name);
      const r = await runWrite(validateTeamMemberUpdate(db, scope, member, input), () =>
        updateMember.mutateAsync({
          p_user_id: member.id,
          p_first_name: names.firstName,
          p_last_name: names.lastName,
          p_email: form.email.trim().toLowerCase(),
          p_role: form.role,
          p_branch_id: branchId || null,
          p_status: form.status === "inactive" ? "inactive" : form.status === "pending" ? "pending" : "active",
        }),
      );
      setSaving(false);
      if (!r.ok) { setErrors(r.errors); toast.error(r.errors.form ?? "Please fix the highlighted fields"); return; }
      toast.success(`${r.data.name} updated`);
      onOpenChange(false);
      return;
    }

    // ---- CREATE path: manager requests approval, owner creates an invite ----
    if (scope.user.role !== "owner") {
      const input = { ...form, branchId, status: "pending" as UserStatus };
      const r = await runWrite(validateTeamMemberRequest(db, scope, input), () =>
        requestMember.mutateAsync({
          p_name: form.name.trim(),
          p_email: form.email.trim().toLowerCase(),
          p_role: form.role,
          p_branch_id: branchId || null,
        }),
      );
      setSaving(false);
      if (!r.ok) { setErrors(r.errors); toast.error(r.errors.form ?? "Please fix the highlighted fields"); return; }
      toast.success("Sent to the Owner for approval.", { description: `${form.name} joins the team once approved.` });
      onOpenChange(false);
      return;
    }

    // ---- Owner creates a Supabase invite ----
    if (!firstName.trim() || !form.email.trim()) { setSaving(false); setErrors({ form: "Name and email are required." }); return; }
    if (!jobTitle.trim() || !department.trim() || !startDate) { setSaving(false); setErrors({ form: "Job title, department and start date are required." }); return; }

    const r = await onboardingService.createInvite(
      { firstName: firstName.trim(), lastName: lastName.trim(), email: form.email.trim(), jobTitle: jobTitle.trim(), department: department.trim(), startDate },
      authUser?.id ?? scope.user.id,
    );
    setSaving(false);
    if (!r.ok) { setErrors({ form: r.errors.form } as FieldErrors); toast.error(r.errors.form ?? "Could not create the invite."); return; }

    const url = onboardingUrl(r.data.token);
    toast.success("Invite created — copy the link and send it to the new team member", {
      description: url,
      action: { label: "Copy link", onClick: () => void copyText(url, "Onboarding link copied") },
      duration: 15000,
    });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{member ? "Edit team member" : "Invite team member"}</DialogTitle>
          <DialogDescription className="text-xs">
            {member
              ? member.email
              : scope.user.role === "owner"
              ? "An onboarding link will be generated. Share it with the new team member so they can fill in their employee form."
              : "Propose a storekeeper or sales representative for your branch. The Owner approves new members."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div>
            <Label htmlFor="t-name" className="text-xs">Full name *</Label>
            <Input id="t-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1.5 h-9" placeholder="e.g. Ngozi Umeh" aria-invalid={!!errors.name} />
            <FieldError message={errors.name} />
          </div>
          <div>
            <Label htmlFor="t-email" className="text-xs">Email *</Label>
            <Input id="t-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="mt-1.5 h-9" placeholder="name@friscontech.ng" aria-invalid={!!errors.email} />
            <FieldError message={errors.email} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs">Role *</Label>
              <div className="mt-1.5">
                <FilterSelect label="Role" className="w-full" value={form.role} onChange={(v) => setForm({ ...form, role: v as Role })} options={roleOptions.map((r) => ({ value: r, label: roleLabel[r] }))} />
              </div>
              <FieldError message={errors.role} />
            </div>
            <div>
              <Label className="text-xs">Branch {roleNeedsBranch(form.role) ? "*" : ""}</Label>
              <div className="mt-1.5">
                <FilterSelect label="Branch" className="w-full" value={form.branchId} onChange={(v) => setForm({ ...form, branchId: v })}
                  options={[{ value: NONE, label: roleNeedsBranch(form.role) ? "Select branch" : "Unassigned" }, ...branches.map((b) => ({ value: b.id, label: `${b.name}${b.status === "inactive" ? " (inactive)" : ""}` }))]} />
              </div>
              <FieldError message={errors.branchId} />
            </div>
          </div>

          {/* Owner create path: extra job-details fields for the invite */}
          {!member && scope.user.role === "owner" && (
            <>
              <div>
                <Label htmlFor="t-title" className="text-xs">Job title *</Label>
                <Input id="t-title" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} className="mt-1.5 h-9" placeholder="e.g. Sales Representative" />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="t-dept" className="text-xs">Department *</Label>
                  <Input id="t-dept" value={department} onChange={(e) => setDepartment(e.target.value)} className="mt-1.5 h-9" placeholder="e.g. Sales" />
                </div>
                <div>
                  <Label htmlFor="t-start" className="text-xs">Start date *</Label>
                  <Input id="t-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="mt-1.5 h-9" />
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">The member fills in their employee data via the onboarding link and sets their own password. Their account is only activated after your review.</p>
            </>
          )}

          {member && (
            <div>
              <Label className="text-xs">Status *</Label>
              <div className="mt-1.5">
                <FilterSelect label="Status" className="w-full" value={form.status} onChange={(v) => setForm({ ...form, status: v as UserStatus })}
                  options={(["pending", "active", "inactive"] as UserStatus[]).map((s) => ({ value: s, label: userStatusLabel[s] }))} />
              </div>
              <FieldError message={errors.status} />
            </div>
          )}

          <FieldError message={errors.form} />
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="size-4 animate-spin" />}
              {member ? "Save changes" : scope.user.role === "owner" ? "Create invite" : "Send for approval"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function MemberStatusDialog({ member, onClose, actorId }: { member: User | null; onClose: () => void; actorId: string }) {
  const [busy, setBusy] = useState(false);
  const { db } = useLiveWorkspace();
  const setStatus = useSetTeamMemberStatus();
  const scope = getAccessScope(db, actorId);
  const deactivating = member?.status !== "inactive";
  const deleting = scope.user.role === "owner" && deactivating;

  return (
    <AlertDialog open={!!member} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {deleting ? `Delete ${member?.name}?` : deactivating ? "Deactivate this team member?" : `Activate ${member?.name}?`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {deactivating
              ? deleting
                ? `${member?.name} will be marked inactive and lose access to Friscontech. Their sales, payments, targets, stock requests and audit history will be preserved.`
                : `${member?.name} will no longer be able to access Friscontech. Their sales, targets, stock requests and audit history are kept.`
              : "They regain access with their existing role and branch."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            className={deactivating ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}
            onClick={async (e) => {
              e.preventDefault();
              if (!member) return;
              setBusy(true);
              const r = await runWrite(validateMemberStatus(scope, member), () =>
                setStatus.mutateAsync({ p_user_id: member.id, p_status: deactivating ? "inactive" : "active" }));
              setBusy(false);
              if (r.ok) toast.success(`${member.name} ${deleting ? "deleted" : deactivating ? "deactivated" : "activated"}`);
              else toast.error(r.errors.form ?? "Could not update member");
              onClose();
            }}
          >
            {busy ? "Saving…" : deleting ? "Delete" : deactivating ? "Deactivate" : "Activate"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
