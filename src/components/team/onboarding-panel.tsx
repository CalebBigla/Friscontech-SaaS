import { useEffect, useState } from "react";
import { Ban, CheckCircle2, Copy, Download, Link2, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { DetailItem, Panel } from "@/components/shared";
import { FilterSelect } from "@/components/shared";
import type { User, Branch } from "@/data/mock-db";
import {
  guarantorStatusLabel, onboardingStatusLabel, type Onboarding, type OnboardingStatus,
} from "@/data/onboarding";
import { formatDate } from "@/lib/format";
import {
  canViewOnboardingDetails, fullName, guarantorUrl,
  isMarried, needsSecondContact, onboardingLinkState, onboardingUrl, ONBOARDING_STEPS,
} from "@/lib/onboarding";
import type { AccessScope } from "@/lib/session";
import { useDb } from "@/services/mock-store";
import { supabase } from "@/lib/supabase";
import { onboardingService } from "@/services/services";
import { downloadOnboardingPdf } from "@/components/team/onboarding-pdf";
import { roleLabel } from "@/lib/format";
import { useBranches } from "@/hooks/use-branches";

export async function copyText(text: string, label = "Link copied") {
  try { await navigator.clipboard.writeText(text); toast.success(label); }
  catch { toast.error("Couldn't copy — select and copy the link manually."); }
}

const onbTone: Record<OnboardingStatus, string> = {
  invited: "status-warning", in_progress: "status-brand", submitted: "status-violet",
  approved: "status-success", rejected: "status-danger",
};
export function OnboardingStatusBadge({ status }: { status: OnboardingStatus }) {
  return <span className={`status whitespace-nowrap ${onbTone[status] ?? "status-muted"}`}>{onboardingStatusLabel[status] ?? status}</span>;
}

/** Panel on the Team detail page. Fetches the onboarding from Supabase by the member's user_id. */
export function OnboardingPanel({ member, scope }: { member: User; scope: AccessScope }) {
  const db = useDb(); // branches list (still from mock shell until branches migrate — gives empty; owner can type branch anyway)
  const owner = canViewOnboardingDetails(scope);
  const [o, setO] = useState<Onboarding | null | undefined>(undefined); // undefined=loading, null=none
  const [busy, setBusy] = useState("");
  const [correcting, setCorrecting] = useState(false);
  const [jobOpen, setJobOpen] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [now, setNow] = useState("");
  useEffect(() => setNow(new Date().toISOString()), []);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!owner && member.status !== "pending") { setO(null); return; }
      const { data, error } = await (supabase as any)
        .from("onboardings")
        .select("*")
        .eq("user_id", member.id)
        .maybeSingle();
      if (!active) return;
      if (error || !data) { setO(null); return; }
      const row = data as any;
      setO({
        id: row.id, tenantId: row.tenant_id, userId: row.user_id ?? "",
        employeeId: row.employee_id, jobTitle: row.job_title, department: row.department,
        startDate: row.start_date, status: row.status,
        token: "",
        tokenExpiresAt: row.token_expires_at, tokenRevoked: row.token_revoked,
        tokenUsed: row.used_at !== null, step: row.step,
        data: row.data ?? {}, photo: null, credentials: [],
        correctionNote: row.correction_note, guarantorStatus: row.guarantor_status,
        guarantorToken: row.guarantor_token, guarantorResponse: row.guarantor_response,
        guarantorDecision: row.guarantor_decision, guarantorDecisionReason: row.guarantor_decision_reason,
        guarantorDecidedAt: row.guarantor_decided_at, passwordSet: row.user_id !== null,
        createdAt: row.created_at, submittedAt: row.submitted_at, activatedAt: row.activated_at,
      } as Onboarding);
    })();
    return () => { active = false; };
  }, [member.id, owner]);

  async function refresh() {
    const { data } = await (supabase as any)
      .from("onboardings").select("*").eq("user_id", member.id).maybeSingle();
    if (data) setO({ ...(o ?? {} as Onboarding), ...(data as any) });
  }

  async function run(key: string, fn: () => Promise<{ ok: boolean; errors?: { form?: string } }>, success: string) {
    setBusy(key);
    const r = await fn();
    setBusy("");
    if (r.ok) { toast.success(success); await refresh(); }
    else toast.error(r.errors?.form ?? "Something went wrong");
  }

  if (o === undefined) return null; // loading
  if (!o) {
    if (!owner || member.status !== "pending") return null;
    return (
      <Panel title="Onboarding" subtitle="This member has no onboarding record yet." className="mb-5"
        action={<Button size="sm" disabled={!!busy} onClick={() => run("invite", () => onboardingService.createInvite({ firstName: member.firstName || "", lastName: member.lastName || "", email: member.email, jobTitle: "", department: "", startDate: "" }, scope.user.id), "Onboarding link created")}><Link2 className="size-4" />Create onboarding link</Button>}>
        <p className="p-5 text-xs text-muted-foreground">Create a link and share it with {member.name} so they can fill in the employee form.</p>
      </Panel>
    );
  }

  const link = onboardingLinkState(o, now || o.createdAt);
  // Raw token is only in memory on the owner's browser when they first create the invite;
  // after regeneration a new token is returned. We show link state here; the URL can't be
  // reconstructed from the hash.
  const showLinkSection = owner && o.status !== "approved" && o.status !== "rejected";

  return (
    <Panel
      title="Onboarding"
      subtitle={`${o.employeeId} · step ${Math.min((o.step ?? 0) + 1, ONBOARDING_STEPS.length)} of ${ONBOARDING_STEPS.length}`}
      className="mb-5"
      action={<OnboardingStatusBadge status={o.status} />}
    >
      <div className="space-y-5 p-5">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <DetailItem label="Job title">{o.jobTitle}</DetailItem>
          <DetailItem label="Department">{o.department}</DetailItem>
          <DetailItem label="Start date">{formatDate(o.startDate)}</DetailItem>
          <DetailItem label="Guarantor">{guarantorStatusLabel[o.guarantorStatus]}</DetailItem>
        </div>

        {o.correctionNote && o.status === "in_progress" && (
          <p className="rounded-md border border-border bg-muted/40 p-3 text-xs">
            <b>Corrections requested:</b> {o.correctionNote}
          </p>
        )}

        {!owner && <p className="text-xs text-muted-foreground">Only the Owner can see the submitted form, documents and guarantor response.</p>}

        {/* ---- Invite link management ---- */}
        {showLinkSection && (
          <div className="rounded-md border border-border p-3">
            <p className="text-xs font-semibold">Onboarding link</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {link === "used"
                ? "Used — the form has been submitted and the invitee has created their account."
                : link === "revoked"
                ? "Revoked."
                : link === "expired"
                ? "Expired."
                : "Active (single-use). The raw link is only shown at invite creation or after regeneration."}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {link !== "used" && (
                <Button size="sm" variant="outline" disabled={!!busy}
                  onClick={async () => {
                    setBusy("regen");
                    const r = await onboardingService.regenerate(o.id, scope.user.id);
                    setBusy("");
                    if (!r.ok) { toast.error(r.errors.form ?? "Could not regenerate"); return; }
                    const url = onboardingUrl(r.data as unknown as string);
                    toast.success("New link generated — old link no longer works", {
                      action: { label: "Copy link", onClick: () => void copyText(url) },
                      duration: 15000,
                    });
                    await refresh();
                  }}
                ><RefreshCw className="size-4" />New link</Button>
              )}
              {link === "valid" && (
                <Button size="sm" variant="outline" disabled={!!busy}
                  onClick={() => run("revoke", () => onboardingService.revoke(o.id, scope.user.id), "Link revoked")}
                ><Ban className="size-4" />Revoke</Button>
              )}
              <Button size="sm" variant="outline" onClick={() => setJobOpen(true)}>Edit job details</Button>
            </div>
          </div>
        )}

        {/* ---- Guarantor link for display ---- */}
        {owner && o.guarantorToken && o.guarantorStatus !== "completed" && (
          <div className="flex gap-2">
            <Input readOnly value={guarantorUrl(o.guarantorToken)} className="h-9 font-mono text-xs" />
            <Button size="sm" variant="outline" onClick={() => copyText(guarantorUrl(o.guarantorToken!), "Guarantor link copied")}><Copy className="size-4" />Guarantor link</Button>
          </div>
        )}

        {/* ---- Guarantor review ---- */}
        {owner && o.guarantorStatus === "completed" && (
          <div className="rounded-md border border-border p-3">
            <p className="text-xs font-semibold">Guarantor review</p>
            {o.guarantorDecision ? (
              <p className="mt-1 text-xs">
                <span className={`status ${o.guarantorDecision === "accepted" ? "status-success" : "status-danger"}`}>
                  {o.guarantorDecision === "accepted" ? "Accepted" : "Declined"}
                </span>
                {o.guarantorDecisionReason && <span className="ml-2 text-muted-foreground">{o.guarantorDecisionReason}</span>}
              </p>
            ) : (
              <div className="mt-2 flex flex-wrap gap-2">
                <Button size="sm" disabled={!!busy}
                  onClick={() => run("gacc", () => onboardingService.reviewGuarantor(o.id, "accepted", "", scope.user.id), "Guarantor accepted")}
                ><CheckCircle2 className="size-4" />Accept</Button>
                <Button size="sm" variant="outline" disabled={!!busy} onClick={() => setCorrecting(true)}><Ban className="size-4" />Decline</Button>
              </div>
            )}
          </div>
        )}

        {/* ---- Submitted form details ---- */}
        {owner && o.status !== "invited" && <OnboardingDetails o={o} />}

        {/* ---- Approve / Reject controls (submitted status only) ---- */}
        {owner && o.status === "submitted" && (
          <div className="flex flex-wrap gap-2 border-t border-border pt-4">
            <Button size="sm" variant="outline" onClick={() => downloadOnboardingPdf(db, o)}><Download className="size-4" />Download PDF</Button>
            <Button size="sm"
              disabled={!!busy || o.guarantorDecision !== "accepted"}
              title={o.guarantorDecision !== "accepted" ? "Accept the guarantor response first" : undefined}
              onClick={() => setApproveOpen(true)}
            ><CheckCircle2 className="size-4" />Approve</Button>
            <Button size="sm" variant="outline"
              disabled={!!busy}
              onClick={() => setRejectOpen(true)}
            ><Ban className="size-4" />Reject</Button>
          </div>
        )}

        {owner && (o.status === "approved") && (
          <div className="border-t border-border pt-4">
            <Button size="sm" variant="outline" onClick={() => downloadOnboardingPdf(db, o)}><Download className="size-4" />Download PDF</Button>
          </div>
        )}
      </div>

      {/* ---- Dialogs ---- */}
      <CorrectionDialog
        open={correcting}
        onOpenChange={setCorrecting}
        onSubmit={(note) => onboardingService.reviewGuarantor(o.id, "declined", note, scope.user.id)}
      />
      <JobDialog open={jobOpen} onOpenChange={setJobOpen} o={o} actorId={scope.user.id} onRefresh={refresh} />
      <ApproveDialog
        open={approveOpen}
        onOpenChange={setApproveOpen}
        o={o}
        scope={scope}
        onDone={refresh}
      />
      <RejectDialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        o={o}
        actorId={scope.user.id}
        onDone={refresh}
      />
    </Panel>
  );
}

// ---------- sub-sections ----------

function Section({ title, rows }: { title: string; rows: [string, string | undefined][] }) {
  return (
    <div>
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      <dl className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map(([k, v]) => (
          <div key={k} className="min-w-0">
            <dt className="text-[11px] text-muted-foreground">{k}</dt>
            <dd className="break-words text-sm font-medium">{v || "—"}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function OnboardingDetails({ o }: { o: Onboarding }) {
  const d = o.data;
  if (!d || !Object.keys(d).length) return <p className="text-xs text-muted-foreground">Form data not yet available.</p>;
  return (
    <div className="space-y-5 border-t border-border pt-4">
      <div className="flex gap-4">
        {o.photo ? (
          <img src={o.photo.dataUrl} alt="Passport photograph" className="size-24 rounded-md border border-border object-cover" />
        ) : (
          <div className="grid size-24 place-items-center rounded-md border border-dashed border-border text-[11px] text-muted-foreground">No photo</div>
        )}
        <Section title="Personal" rows={[
          ["Name", fullName(d)], ["Gender", d.gender], ["Birth date", d.birthDate && formatDate(d.birthDate)],
          ["Phone", d.phone], ["Email", d.email], ["Marital status", d.maritalStatus],
          ["Nationality", d.nationality], ["State / LGA", [d.stateOfOrigin, d.lga].filter(Boolean).join(" / ")],
          ["Preferred e-mail ID", d.preferredEmailId], ["Address", d.address],
        ]} />
      </div>
      <Section title="Previous job reference" rows={[["Referee", d.refName], ["Job title", d.refJobTitle], ["Company", d.refCompany], ["Email", d.refEmail]]} />
      {isMarried(d) && (
        <Section title="Family" rows={[
          ["Spouse", fullName(d, "spouse")], ["Phone", d.spousePhone], ["Email", d.spouseEmail],
          ["Work address", d.spouseWorkAddress], ["Spouse is first emergency contact", d.spouseIsEmergency],
        ]} />
      )}
      {!(isMarried(d) && d.spouseIsEmergency === "Yes") && (
        <Section title="Emergency contact" rows={[
          ["Name", fullName(d, "ec")], ["Relationship", d.ecRelationship], ["Phone", d.ecPhone],
          ["Alternate phone", d.ecAltPhone], ["Occupation", d.ecOccupation], ["Address", d.ecAddress],
        ]} />
      )}
      {needsSecondContact(d) && (
        <Section title="Second emergency contact" rows={[
          ["Name", fullName(d, "ec2")], ["Relationship", d.ec2Relationship], ["Phone", d.ec2Phone],
          ["Alternate phone", d.ec2AltPhone], ["Occupation", d.ec2Occupation], ["Address", d.ec2Address],
        ]} />
      )}
      <Section title="Statutory" rows={[["NIN", d.nin], ["Bank", d.bankName], ["Account number", d.accountNumber]]} />
      <Section title="Guarantor" rows={[
        ["Name", [d.guarantorFirstName, d.guarantorSurname].filter(Boolean).join(" ")],
        ["Email", d.guarantorEmail], ["Phone", d.guarantorPhone], ["Address", d.guarantorAddress],
        ["Status", guarantorStatusLabel[o.guarantorStatus]],
      ]} />
      {o.guarantorResponse && (
        <div className="rounded-md border border-destructive/30 p-3">
          <p className="mb-2 text-xs font-semibold text-destructive">Confidential — visible only to the Owner</p>
          <Section title="Guarantor response" rows={[
            ["Known for", (o.guarantorResponse as any).yearsKnown],
            ["Relationship", (o.guarantorResponse as any).relationship],
            ["Character", (o.guarantorResponse as any).character],
            ["Comments", (o.guarantorResponse as any).comments],
            ["Signed", `${(o.guarantorResponse as any).signature} · ${formatDate((o.guarantorResponse as any).signedDate)}`],
          ]} />
        </div>
      )}
      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Credentials ({o.credentials.length})</p>
        {o.credentials.length
          ? <ul className="space-y-1">{o.credentials.map((f, i) => (
            <li key={i}><a href={f.dataUrl} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-primary hover:underline">{f.name}</a></li>
          ))}</ul>
          : <p className="text-xs text-muted-foreground">None uploaded.</p>}
      </div>
    </div>
  );
}

// ---------- dialog helpers ----------

function CorrectionDialog({ open, onOpenChange, onSubmit }: { open: boolean; onOpenChange: (o: boolean) => void; onSubmit: (note: string) => Promise<{ ok: boolean; errors?: { form?: string } }> }) {
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  useEffect(() => { if (open) { setNote(""); setErr(""); } }, [open]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Decline guarantor</DialogTitle><DialogDescription className="text-xs">The reason is saved in the audit log. The member cannot be activated.</DialogDescription></DialogHeader>
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason for declining" rows={4} />
        {err && <p className="text-[11px] font-medium text-destructive">{err}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={async () => { const r = await onSubmit(note); if (!r.ok) { setErr(r.errors?.form ?? "Failed"); return; } toast.success("Guarantor declined"); onOpenChange(false); }}>Decline</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function JobDialog({ open, onOpenChange, o, actorId, onRefresh }: { open: boolean; onOpenChange: (o: boolean) => void; o: Onboarding; actorId: string; onRefresh: () => void }) {
  const [f, setF] = useState({ jobTitle: o.jobTitle, department: o.department, startDate: o.startDate });
  const [err, setErr] = useState("");
  useEffect(() => { if (open) { setF({ jobTitle: o.jobTitle, department: o.department, startDate: o.startDate }); setErr(""); } }, [open, o]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Job details</DialogTitle><DialogDescription className="text-xs">Shown read-only on the member's form. Employee ID {o.employeeId}.</DialogDescription></DialogHeader>
        <div className="space-y-3">
          <div><Label className="text-xs">Job title</Label><Input className="mt-1.5 h-9" value={f.jobTitle} onChange={(e) => setF({ ...f, jobTitle: e.target.value })} /></div>
          <div><Label className="text-xs">Department</Label><Input className="mt-1.5 h-9" value={f.department} onChange={(e) => setF({ ...f, department: e.target.value })} /></div>
          <div><Label className="text-xs">Start date</Label><Input type="date" className="mt-1.5 h-9" value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value })} /></div>
          {err && <p className="text-[11px] font-medium text-destructive">{err}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={async () => {
            const r = await onboardingService.updateJob(o.id, f, actorId);
            if (!r.ok) { setErr(r.errors.form ?? "Failed"); return; }
            toast.success("Job details saved"); onRefresh(); onOpenChange(false);
          }}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ApproveDialog({ open, onOpenChange, o, scope, onDone }: {
  open: boolean; onOpenChange: (o: boolean) => void;
  o: Onboarding; scope: AccessScope; onDone: () => void;
}) {
  const { data: branches = [] } = useBranches();
  const activeBranches = branches.filter((b: Branch) => b.status === "active");
  const [role, setRole] = useState<"manager" | "storekeeper" | "sales_rep">("sales_rep");
  const [branchId, setBranchId] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => { if (open) { setRole("sales_rep"); setBranchId(""); setErr(""); } }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Approve onboarding</DialogTitle>
          <DialogDescription className="text-xs">Assign each staff member to an active branch. Branches can be created before any managers are onboarded; approving a manager assigns them as that branch's manager.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="text-xs">Role *</Label>
            <div className="mt-1.5">
              <FilterSelect label="Role" className="w-full" value={role}
                onChange={(v) => setRole(v as "manager" | "storekeeper" | "sales_rep")}
                options={[
                  { value: "manager", label: roleLabel.manager },
                  { value: "storekeeper", label: roleLabel.storekeeper },
                  { value: "sales_rep", label: roleLabel.sales_rep },
                ]} />
            </div>
          </div>
          <div>
            <Label className="text-xs">Branch *</Label>
            <div className="mt-1.5">
              <FilterSelect label="Branch" className="w-full" value={branchId || "none"}
                onChange={(v) => setBranchId(v === "none" ? "" : v)}
                options={[{ value: "none", label: "Select a branch" }, ...activeBranches.map((b: Branch) => ({ value: b.id, label: b.name }))]} />
            </div>
          </div>
          {err && <p className="text-[11px] font-medium text-destructive">{err}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={busy} onClick={async () => {
            if (!branchId) { setErr("Select an active branch before approving this staff member."); return; }
            setBusy(true);
            const r = await onboardingService.approve(o.id, role, branchId || null, scope.user.id);
            setBusy(false);
            if (!r.ok) { setErr(r.errors.form ?? "Could not approve"); return; }
            toast.success("Staff member activated");
            onDone(); onOpenChange(false);
          }}>
            {busy && <Loader2 className="size-4 animate-spin" />}Approve
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RejectDialog({ open, onOpenChange, o, actorId, onDone }: {
  open: boolean; onOpenChange: (o: boolean) => void;
  o: Onboarding; actorId: string; onDone: () => void;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => { if (open) { setReason(""); setErr(""); } }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reject onboarding</DialogTitle>
          <DialogDescription className="text-xs">Provide a reason. The staff member will not be granted access.</DialogDescription>
        </DialogHeader>
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for rejection" rows={4} />
        {err && <p className="text-[11px] font-medium text-destructive">{err}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="outline" disabled={busy} onClick={async () => {
            setBusy(true);
            const r = await onboardingService.reject(o.id, reason, actorId);
            setBusy(false);
            if (!r.ok) { setErr(r.errors.form ?? "Could not reject"); return; }
            toast.success("Onboarding rejected");
            onDone(); onOpenChange(false);
          }}>
            {busy && <Loader2 className="size-4 animate-spin" />}Reject
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
