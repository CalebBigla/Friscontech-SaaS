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
import { useReassignCustomers } from "@/hooks/use-customers";
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
            <Input id="t-email" type="email" value={form.email} disabled={!!member} onChange={(e) => setForm({ ...form, email: e.target.value })} className="mt-1.5 h-9" placeholder="name@friscontech.ng" aria-invalid={!!errors.email} />
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
  const reassign = useReassignCustomers();
  // customer id → the rep taking over. Customers left blank wait on the Customers page.
  const [moves, setMoves] = useState<Record<string, string>>({});
  useEffect(() => { setMoves({}); }, [member?.id]);
  const isRep = deactivating && member?.role === "sales_rep";
  const repCustomers = isRep && scope.user.role === "owner" ? db.customers.filter((c) => c.assignedRepId === member.id) : [];
  const otherReps = db.users.filter((u) => u.role === "sales_rep" && u.status === "active" && u.id !== member?.id);
  const repOptions = [
    { value: "none", label: "Decide later" },
    ...otherReps.map((u) => ({ value: u.id, label: `${u.name} · ${db.branches.find((b) => b.id === u.branchId)?.name ?? "No branch"}` })),
  ];
  const moveCustomers = async () => {
    const byRep = new Map<string, string[]>();
    for (const c of repCustomers) {
      const repId = moves[c.id];
      if (repId) byRep.set(repId, [...(byRep.get(repId) ?? []), c.id]);
    }
    for (const [repId, ids] of byRep) {
      const r = await runWrite(null, () => reassign.mutateAsync({ p_customer_ids: ids, p_rep_id: repId }));
      if (!r.ok) return r.errors.form ?? "Could not reassign the customers";
    }
    return null;
  };

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
              : "They regain access with their existing role and branch. Customers already moved to another rep stay there."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {repCustomers.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold">Move {repCustomers.length} customer{repCustomers.length === 1 ? "" : "s"} to</p>
              <FilterSelect
                label="Move all customers to"
                className="w-52"
                value={repCustomers.every((c) => moves[c.id] === moves[repCustomers[0]!.id]) ? moves[repCustomers[0]!.id] ?? "none" : "none"}
                onChange={(v) => setMoves(v === "none" ? {} : Object.fromEntries(repCustomers.map((c) => [c.id, v])))}
                options={repOptions}
              />
            </div>
            {repCustomers.length > 1 && (
              <ul className="max-h-48 divide-y divide-border overflow-y-auto rounded-md border border-border">
                {repCustomers.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
                    <span className="truncate font-semibold">{c.name}</span>
                    <FilterSelect
                      label={`New rep for ${c.name}`}
                      className="w-52 shrink-0"
                      value={moves[c.id] ?? "none"}
                      onChange={(v) => setMoves((m) => { const next = { ...m }; if (v === "none") delete next[c.id]; else next[c.id] = v; return next; })}
                      options={repOptions}
                    />
                  </li>
                ))}
              </ul>
            )}
            <p className="text-[11px] text-muted-foreground">The new rep takes over each customer's details and ledger. Past sales and targets stay with {member?.name}.</p>
          </div>
        )}
        {isRep && scope.user.role !== "owner" && (
          <p className="text-[11px] text-muted-foreground">Their customers will wait for the owner to reassign them.</p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            className={deactivating ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}
            onClick={async (e) => {
              e.preventDefault();
              if (!member) return;
              setBusy(true);
              const moveError = validateMemberStatus(scope, member) ? null : await moveCustomers();
              if (moveError) { setBusy(false); toast.error(moveError); return; }
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
