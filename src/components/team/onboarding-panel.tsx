import { useEffect, useState } from "react";
import { Copy, Download, Link2, RefreshCw, ShieldAlert, Ban, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DetailItem, Panel } from "@/components/shared";
import type { User } from "@/data/mock-db";
import { guarantorStatusLabel, onboardingStatusLabel, type Onboarding, type OnboardingStatus } from "@/data/onboarding";
import { formatDate } from "@/lib/format";
import { canViewOnboardingDetails, findOnboardingByUser, fullName, guarantorUrl, isMarried, needsSecondContact, onboardingLinkState, onboardingUrl, ONBOARDING_STEPS } from "@/lib/onboarding";
import type { AccessScope } from "@/lib/session";
import { useDb } from "@/services/mock-store";
import { onboardingService } from "@/services/services";
import { downloadOnboardingPdf } from "@/components/team/onboarding-pdf";

const tone: Record<OnboardingStatus, string> = { invited: "status-warning", in_progress: "status-brand", submitted: "status-violet", active: "status-success" };
export function OnboardingStatusBadge({ status }: { status: OnboardingStatus }) {
  return <span className={`status whitespace-nowrap ${tone[status]}`}>{onboardingStatusLabel[status]}</span>;
}

export async function copyText(text: string, label = "Link copied") {
  try { await navigator.clipboard.writeText(text); toast.success(label); } catch { toast.error("Couldn't copy — select and copy the link manually."); }
}

export function OnboardingPanel({ member, scope }: { member: User; scope: AccessScope }) {
  const db = useDb();
  const o = findOnboardingByUser(db, member.id);
  const owner = canViewOnboardingDetails(scope);
  const [busy, setBusy] = useState("");
  const [correcting, setCorrecting] = useState(false);
  const [jobOpen, setJobOpen] = useState(false);
  const [now, setNow] = useState("");
  useEffect(() => setNow(new Date().toISOString()), [o?.tokenExpiresAt]);

  async function run(key: string, fn: () => Promise<{ ok: boolean; errors?: { form?: string } }>, success: string) {
    setBusy(key);
    const r = await fn();
    setBusy("");
    if (r.ok) toast.success(success); else toast.error(r.errors?.form ?? "Something went wrong");
  }

  if (!o) {
    if (!owner || member.status !== "pending") return null;
    return (
      <Panel title="Onboarding" subtitle="This member has no onboarding link yet." className="mb-5" action={
        <Button size="sm" disabled={!!busy} onClick={() => run("invite", () => onboardingService.invite(member.id, scope.user.id), "Onboarding link created")}><Link2 className="size-4" />Create onboarding link</Button>}>
        <p className="p-5 text-xs text-muted-foreground">Create a link and share it with {member.name} so they can fill in the employee form.</p>
      </Panel>
    );
  }

  const link = onboardingLinkState(o, now || o.createdAt);
  const url = onboardingUrl(o.token);
  return (
    <Panel title="Onboarding" subtitle={`${o.employeeId} · step ${Math.min(o.step + 1, ONBOARDING_STEPS.length)} of ${ONBOARDING_STEPS.length}`} className="mb-5" action={<OnboardingStatusBadge status={o.status} />}>
      <div className="space-y-5 p-5">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <DetailItem label="Job title">{o.jobTitle}</DetailItem>
          <DetailItem label="Department">{o.department}</DetailItem>
          <DetailItem label="Start date">{formatDate(o.startDate)}</DetailItem>
          <DetailItem label="Guarantor">{guarantorStatusLabel[o.guarantorStatus]}</DetailItem>
        </div>
        {o.correctionNote && o.status === "in_progress" && <p className="rounded-md border border-border bg-muted/40 p-3 text-xs"><b>Corrections requested:</b> {o.correctionNote}</p>}
        {!owner && <p className="text-xs text-muted-foreground">Only the Owner can see the submitted form, documents and guarantor response.</p>}
        {owner && o.status !== "active" && (
          <div className="rounded-md border border-border p-3">
            <p className="text-xs font-semibold">Onboarding link</p>
            {link === "valid" ? (
              <>
                <div className="mt-2 flex gap-2"><Input readOnly value={url} className="h-9 font-mono text-xs" onFocus={(e) => e.target.select()} /><Button size="sm" variant="outline" onClick={() => copyText(url)}><Copy className="size-4" />Copy</Button></div>
                <p className="mt-1.5 text-[11px] text-muted-foreground">Single use. Expires {formatDate(o.tokenExpiresAt)}. Demo note: links only work in this browser session until the app has a real database.</p>
              </>
            ) : <p className="mt-1 text-xs text-muted-foreground">{link === "used" ? "Used — the form has been submitted." : link === "revoked" ? "Revoked." : "Expired."}</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              {link !== "used" && <Button size="sm" variant="outline" disabled={!!busy} onClick={() => run("regen", () => onboardingService.regenerate(o.id, scope.user.id), "New link generated — the old one no longer works")}><RefreshCw className="size-4" />New link</Button>}
              {link === "valid" && <Button size="sm" variant="outline" disabled={!!busy} onClick={() => run("revoke", () => onboardingService.revoke(o.id, scope.user.id), "Link revoked")}><Ban className="size-4" />Revoke</Button>}
              <Button size="sm" variant="outline" onClick={() => setJobOpen(true)}>Edit job details</Button>
            </div>
          </div>
        )}
        {owner && o.guarantorToken && o.guarantorStatus !== "completed" && (
          <div className="flex gap-2"><Input readOnly value={guarantorUrl(o.guarantorToken)} className="h-9 font-mono text-xs" /><Button size="sm" variant="outline" onClick={() => copyText(guarantorUrl(o.guarantorToken!), "Guarantor link copied")}><Copy className="size-4" />Guarantor link</Button></div>
        )}
        {owner && o.guarantorStatus === "completed" && (
          <div className="rounded-md border border-border p-3">
            <p className="text-xs font-semibold">Guarantor review</p>
            {o.guarantorDecision ? (
              <p className="mt-1 text-xs"><span className={`status ${o.guarantorDecision === "accepted" ? "status-success" : "status-danger"}`}>{o.guarantorDecision === "accepted" ? "Accepted" : "Declined"}</span>{o.guarantorDecisionReason && <span className="ml-2 text-muted-foreground">{o.guarantorDecisionReason}</span>}</p>
            ) : (
              <div className="mt-2 flex flex-wrap gap-2">
                <Button size="sm" disabled={!!busy} onClick={() => run("gacc", () => onboardingService.reviewGuarantor(o.id, "accepted", "", scope.user.id), "Guarantor accepted")}><CheckCircle2 className="size-4" />Accept</Button>
                <Button size="sm" variant="outline" disabled={!!busy} onClick={() => setCorrecting(true)}><Ban className="size-4" />Decline</Button>
              </div>
            )}
          </div>
        )}
        {owner && o.status !== "invited" && <OnboardingDetails o={o} />}
        {owner && (o.status === "submitted" || o.status === "active") && (
          <div className="flex flex-wrap gap-2 border-t border-border pt-4">
            <Button size="sm" variant="outline" onClick={() => downloadOnboardingPdf(db, o)}><Download className="size-4" />Download PDF</Button>
            {o.status === "submitted" && <>
              <Button size="sm" disabled={!!busy || o.guarantorDecision !== "accepted"} title={o.guarantorDecision !== "accepted" ? "Accept the guarantor first" : undefined} onClick={() => run("act", () => onboardingService.activate(o.id, scope.user.id), `${member.name} is now active`)}>{busy === "act" ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}Activate</Button>
            </>}
          </div>
        )}
      </div>
      <CorrectionDialog open={correcting} onOpenChange={setCorrecting} onSubmit={(note) => onboardingService.reviewGuarantor(o.id, "declined", note, scope.user.id)} />
      <JobDialog open={jobOpen} onOpenChange={setJobOpen} o={o} actorId={scope.user.id} />
    </Panel>
  );
}

function Section({ title, rows }: { title: string; rows: [string, string | undefined][] }) {
  return (
    <div>
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      <dl className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map(([k, v]) => <div key={k} className="min-w-0"><dt className="text-[11px] text-muted-foreground">{k}</dt><dd className="break-words text-sm font-medium">{v || "—"}</dd></div>)}
      </dl>
    </div>
  );
}

function OnboardingDetails({ o }: { o: Onboarding }) {
  const d = o.data;
  return (
    <div className="space-y-5 border-t border-border pt-4">
      <div className="flex gap-4">
        {o.photo ? <img src={o.photo.dataUrl} alt="Passport photograph" className="size-24 rounded-md border border-border object-cover" /> : <div className="grid size-24 place-items-center rounded-md border border-dashed border-border text-[11px] text-muted-foreground">No photo</div>}
        <Section title="Personal" rows={[["Name", fullName(d)], ["Gender", d.gender], ["Birth date", d.birthDate && formatDate(d.birthDate)], ["Phone", d.phone], ["Email", d.email], ["Marital status", d.maritalStatus], ["Nationality", d.nationality], ["State / LGA", [d.stateOfOrigin, d.lga].filter(Boolean).join(" / ")], ["Preferred e-mail ID", d.preferredEmailId], ["Address", d.address]]} />
      </div>
      <Section title="Previous job reference" rows={[["Referee", d.refName], ["Job title", d.refJobTitle], ["Company", d.refCompany], ["Email", d.refEmail]]} />
      {isMarried(d) && <Section title="Family" rows={[["Spouse", fullName(d, "spouse")], ["Phone", d.spousePhone], ["Email", d.spouseEmail], ["Work address", d.spouseWorkAddress], ["Spouse is first emergency contact", d.spouseIsEmergency]]} />}
      {!(isMarried(d) && d.spouseIsEmergency === "Yes") && <Section title="Emergency contact" rows={[["Name", fullName(d, "ec")], ["Relationship", d.ecRelationship], ["Phone", d.ecPhone], ["Alternate phone", d.ecAltPhone], ["Occupation", d.ecOccupation], ["Address", d.ecAddress]]} />}
      {needsSecondContact(d) && <Section title="Second emergency contact" rows={[["Name", fullName(d, "ec2")], ["Relationship", d.ec2Relationship], ["Phone", d.ec2Phone], ["Alternate phone", d.ec2AltPhone], ["Occupation", d.ec2Occupation], ["Address", d.ec2Address]]} />}
      <Section title="Statutory" rows={[["NIN", d.nin], ["Bank", d.bankName], ["Account number", d.accountNumber]]} />
      <Section title="Guarantor" rows={[["Name", [d.guarantorFirstName, d.guarantorSurname].filter(Boolean).join(" ")], ["Email", d.guarantorEmail], ["Phone", d.guarantorPhone], ["Address", d.guarantorAddress], ["Status", guarantorStatusLabel[o.guarantorStatus]]]} />
      {o.guarantorResponse && (
        <div className="rounded-md border border-destructive/30 p-3">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-destructive"><ShieldAlert className="size-3.5" />Confidential — visible only to the Owner</p>
          <Section title="Guarantor response" rows={[["Known the employee for", o.guarantorResponse.yearsKnown], ["Relationship", o.guarantorResponse.relationship], ["Character", o.guarantorResponse.character], ["Comments", o.guarantorResponse.comments], ["Signed", `${o.guarantorResponse.signature} · ${formatDate(o.guarantorResponse.signedDate)}`]]} />
        </div>
      )}
      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Credentials ({o.credentials.length})</p>
        {o.credentials.length ? <ul className="space-y-1">{o.credentials.map((f, i) => <li key={i}><a href={f.dataUrl} download={f.name} className="text-sm font-medium text-primary hover:underline">{f.name}</a></li>)}</ul> : <p className="text-xs text-muted-foreground">None uploaded.</p>}
      </div>
      <Section title="Declaration" rows={[["Accepted", d.declarationAccepted === "yes" ? "Yes" : "No"], ["Signature", d.signature], ["Date", d.signedDate && formatDate(d.signedDate)], ["Account password", o.passwordSet ? "Set by the member" : "Not set"]]} />
    </div>
  );
}

function CorrectionDialog({ open, onOpenChange, onSubmit }: { open: boolean; onOpenChange: (o: boolean) => void; onSubmit: (note: string) => Promise<{ ok: boolean; errors?: { form?: string } }> }) {
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  useEffect(() => { if (open) { setNote(""); setErr(""); } }, [open]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Request corrections</DialogTitle><DialogDescription className="text-xs">The member's link reopens for 7 days so they can fix their form.</DialogDescription></DialogHeader>
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="What needs to change?" rows={4} />
        {err && <p className="text-[11px] font-medium text-destructive">{err}</p>}
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={async () => { const r = await onSubmit(note); if (!r.ok) { setErr(r.errors?.form ?? "Failed"); return; } toast.success("Corrections requested — share the link again"); onOpenChange(false); }}>Send back</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function JobDialog({ open, onOpenChange, o, actorId }: { open: boolean; onOpenChange: (o: boolean) => void; o: Onboarding; actorId: string }) {
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
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={async () => { const r = await onboardingService.updateJob(o.id, f, actorId); if (!r.ok) { setErr(r.errors.form ?? "Failed"); return; } toast.success("Job details saved"); onOpenChange(false); }}>Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
