import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, CheckCircle2, Copy, Download, Eye, FileText, Loader2, Mail, MessageCircle, Undo2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { DetailItem, ErrorState, FilterSelect } from "@/components/shared";
import { copyText, OnboardingStatusBadge } from "@/components/team/onboarding-panel";
import { buildOnboardingPdf, downloadOnboardingPdf, onboardingPdfName } from "@/components/team/onboarding-pdf";
import type { Branch } from "@/data/mock-db";
import { guarantorStatusLabel, type Onboarding } from "@/data/onboarding";
import { useBranches } from "@/hooks/use-branches";
import { formatDate, roleLabel } from "@/lib/format";
import { fullName, onboardingUrl } from "@/lib/onboarding";
import { queryKeys } from "@/lib/query-keys";
import type { AccessScope } from "@/lib/session";
import { onboardingService } from "@/services/onboarding-service";

type Outcome = { ok: boolean; errors?: { form?: string } };

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** The onboarding with signed links to its photo and documents (owner RLS). */
function useOnboardingReview(id: string) {
  return useQuery({
    queryKey: [...queryKeys.onboardings.root(), "review", id] as const,
    queryFn: async () => {
      const o = await onboardingService.getById(id);
      if (!o) throw new Error("This onboarding could not be found.");
      return o;
    },
    enabled: !!id,
  });
}

/** Reload every query an onboarding decision changes. */
function useRefreshOnboarding(scope: AccessScope) {
  const queryClient = useQueryClient();
  return () => Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.onboardings.root() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.users.all(scope.user.tenantId) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.notifications.root() }),
  ]);
}

/**
 * Owner review of a submitted onboarding: a summary of the staff member, their
 * guarantor and documents, the full form as a PDF (view or download), the
 * guarantor decision, and approve / reject.
 */
export function OnboardingReview({ onboardingId, scope, onDecided }: { onboardingId: string; scope: AccessScope; onDecided?: () => void }) {
  const review = useOnboardingReview(onboardingId);
  const refresh = useRefreshOnboarding(scope);
  const [busy, setBusy] = useState("");
  const [declining, setDeclining] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [pdfOpen, setPdfOpen] = useState(false);
  const [correctionsOpen, setCorrectionsOpen] = useState(false);

  if (review.isLoading) return <p className="flex items-center gap-2 p-5 text-xs text-muted-foreground"><Loader2 className="size-4 animate-spin" />Loading the submission…</p>;
  if (review.error || !review.data) return <ErrorState title="Could not load the submission" error={review.error} />;
  const o = review.data;
  const d = o.data;
  const g = o.guarantorResponse;
  const decided = async () => { await refresh(); onDecided?.(); };

  async function run(key: string, fn: () => Promise<Outcome>, success: string) {
    setBusy(key);
    const r = await fn();
    setBusy("");
    if (r.ok) { toast.success(success); await refresh(); }
    else toast.error(r.errors?.form ?? "Something went wrong");
  }
  async function download() {
    setBusy("pdf");
    try { await downloadOnboardingPdf(o); }
    catch (e) { console.error("[onboarding] PDF failed", e); toast.error("Could not create the PDF", { description: errorText(e) }); }
    setBusy("");
  }

  return (
    <div className="space-y-5">
      {/* ---- Summary ---- */}
      <div className="flex flex-col gap-4 sm:flex-row">
        {o.photo?.dataUrl
          ? <img src={o.photo.dataUrl} alt="Passport photograph" className="size-24 shrink-0 rounded-md border border-border object-cover" />
          : <div className="grid size-24 shrink-0 place-items-center rounded-md border border-dashed border-border text-[11px] text-muted-foreground">No photo</div>}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-base font-semibold">{fullName(d) || "Unnamed applicant"}</p>
            <OnboardingStatusBadge status={o.status} />
          </div>
          <p className="text-xs text-muted-foreground">{[o.employeeId, o.jobTitle, o.department].filter(Boolean).join(" · ")}</p>
          <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-3">
            <DetailItem label="Phone">{d.phone || "—"}</DetailItem>
            <DetailItem label="Email">{d.email || "—"}</DetailItem>
            <DetailItem label="Company e-mail ID">{d.preferredEmailId || "—"}</DetailItem>
            <DetailItem label="Start date">{o.startDate ? formatDate(o.startDate) : "—"}</DetailItem>
            <DetailItem label="Submitted">{o.submittedAt ? formatDate(o.submittedAt.slice(0, 10)) : "—"}</DetailItem>
            <DetailItem label="State / LGA">{[d.stateOfOrigin, d.lga].filter(Boolean).join(" / ") || "—"}</DetailItem>
          </div>
        </div>
      </div>

      {/* ---- Guarantor ---- */}
      <div className="rounded-md border border-border p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold">Guarantor · {[d.guarantorFirstName, d.guarantorSurname].filter(Boolean).join(" ") || "—"}{d.guarantorPhone ? ` · ${d.guarantorPhone}` : ""}</p>
          <span className="text-[11px] text-muted-foreground">
            {guarantorStatusLabel[o.guarantorStatus]}
            {g && (g.filledBy === "staff" ? " · filled in by the applicant on the guarantor's behalf" : " · filled in by the guarantor")}
          </span>
        </div>
        {g && <p className="mt-2 text-xs text-muted-foreground">Known for {g.yearsKnown || "—"} · {g.relationship || "—"}. Full answers are in the PDF.</p>}
        {o.guarantorStatus === "completed" && (
          o.guarantorDecision ? (
            <p className="mt-2 text-xs">
              <span className={`status ${o.guarantorDecision === "accepted" ? "status-success" : "status-danger"}`}>{o.guarantorDecision === "accepted" ? "Accepted" : "Declined"}</span>
              {o.guarantorDecisionReason && <span className="ml-2 text-muted-foreground">{o.guarantorDecisionReason}</span>}
            </p>
          ) : o.status === "submitted" && (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" disabled={!!busy} onClick={() => run("gacc", () => onboardingService.reviewGuarantor(o.id, "accepted", "", scope.user.id), "Guarantor accepted")}>
                {busy === "gacc" ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}Accept guarantor
              </Button>
              <Button size="sm" variant="outline" disabled={!!busy} onClick={() => setDeclining(true)}><Ban className="size-4" />Decline guarantor</Button>
            </div>
          )
        )}
      </div>

      {/* ---- Documents ---- */}
      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Documents</p>
        <ul className="space-y-1">
          {o.photo && <li><a href={o.photo.dataUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"><FileText className="size-4" />Passport photograph</a></li>}
          {o.credentials.map((f) => (
            <li key={f.id ?? f.name}><a href={f.dataUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"><FileText className="size-4" />{f.name}</a></li>
          ))}
          {!o.photo && !o.credentials.length && <li className="text-xs text-muted-foreground">None uploaded.</li>}
        </ul>
      </div>

      {/* ---- Actions ---- */}
      <div className="flex flex-wrap gap-2 border-t border-border pt-4">
        <Button size="sm" variant="outline" onClick={() => setPdfOpen(true)}><Eye className="size-4" />View full form</Button>
        <Button size="sm" variant="outline" disabled={!!busy} onClick={download}>{busy === "pdf" ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}Download PDF</Button>
        {o.status === "submitted" && <>
          <Button size="sm" disabled={!!busy || o.guarantorDecision !== "accepted" || !o.userId}
            title={!o.userId ? "The staff member has not created their account yet" : o.guarantorDecision !== "accepted" ? "Accept the guarantor response first" : undefined}
            onClick={() => setApproveOpen(true)}><CheckCircle2 className="size-4" />Approve</Button>
          <Button size="sm" variant="outline" disabled={!!busy} onClick={() => setCorrectionsOpen(true)}><Undo2 className="size-4" />Request corrections</Button>
          <Button size="sm" variant="outline" disabled={!!busy} onClick={() => setRejectOpen(true)}><Ban className="size-4" />Reject</Button>
        </>}
        {o.status === "rejected" && (
          <Button size="sm" variant="outline" disabled={!!busy} onClick={() => setCorrectionsOpen(true)}><Undo2 className="size-4" />Reopen for corrections</Button>
        )}
      </div>
      {o.status === "submitted" && (!o.userId || o.guarantorDecision !== "accepted") && (
        <p className="text-[11px] text-muted-foreground">
          {!o.userId ? "No account is linked to this submission, so it can't be approved. Usually the email already belongs to another account (for example yours). Use Request corrections and ask them to submit with their own email. " : ""}
          {o.guarantorDecision !== "accepted" ? "Accept the guarantor response before approving." : ""}
        </p>
      )}

      <OnboardingPdfDialog o={o} open={pdfOpen} onOpenChange={setPdfOpen} />
      <ReasonDialog open={declining} onOpenChange={setDeclining} title="Decline guarantor" confirm="Decline"
        description="The reason is saved in the audit log. The member cannot be activated."
        onSubmit={async (note) => { const r = await onboardingService.reviewGuarantor(o.id, "declined", note, scope.user.id); if (r.ok) { toast.success("Guarantor declined"); await refresh(); } return r; }} />
      <ReasonDialog open={rejectOpen} onOpenChange={setRejectOpen} title="Reject onboarding" confirm="Reject"
        description="Provide a reason. The staff member will not be granted access."
        onSubmit={async (reason) => { const r = await onboardingService.reject(o.id, reason, scope.user.id); if (r.ok) { toast.success("Onboarding rejected"); await decided(); } return r; }} />
      <CorrectionsDialog open={correctionsOpen} onOpenChange={setCorrectionsOpen} o={o} onDone={refresh} />
      <ApproveDialog open={approveOpen} onOpenChange={setApproveOpen} o={o} scope={scope} onDone={decided} />
    </div>
  );
}

/** The review in a modal, opened from the Team page's pending list. */
export function OnboardingReviewDialog({ onboardingId, onClose, scope }: { onboardingId: string | null; onClose: () => void; scope: AccessScope }) {
  return (
    <Dialog open={!!onboardingId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Review onboarding</DialogTitle>
          <DialogDescription className="text-xs">Check the summary and the full form, review the guarantor, then approve or reject.</DialogDescription>
        </DialogHeader>
        {onboardingId && <OnboardingReview onboardingId={onboardingId} scope={scope} onDecided={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

/** The full employee data form as a PDF, shown in a modal with a download button. */
function OnboardingPdfDialog({ o, open, onOpenChange }: { o: Onboarding; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [url, setUrl] = useState("");
  const [failed, setFailed] = useState("");
  useEffect(() => {
    if (!open) return;
    let objectUrl = "";
    let active = true;
    setUrl(""); setFailed("");
    buildOnboardingPdf(o)
      .then((blob) => { objectUrl = URL.createObjectURL(blob); if (active) setUrl(objectUrl); })
      .catch((e) => { console.error("[onboarding] PDF failed", e); if (active) setFailed(errorText(e)); });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [open, o]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Employee data form</DialogTitle>
          <DialogDescription className="text-xs">{onboardingPdfName(o)}</DialogDescription>
        </DialogHeader>
        {failed ? <p className="text-sm text-destructive">Could not create the PDF: {failed}. Close this window and try again; if it keeps failing, restart the app.</p>
          : url ? <iframe src={url} title="Employee data form" className="h-[70vh] w-full rounded-md border border-border" />
          : <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="size-4 animate-spin" />Preparing the PDF…</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          {url && <Button asChild><a href={url} download={onboardingPdfName(o)}><Download className="size-4" />Download PDF</a></Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Send the form back to the staff member. The new link is shown with ways to
 * send it: the member cannot sign in while pending, so the owner shares it.
 */
function CorrectionsDialog({ open, onOpenChange, o, onDone }: {
  open: boolean; onOpenChange: (open: boolean) => void; o: Onboarding; onDone: () => Promise<unknown>;
}) {
  const declined = o.guarantorDecision === "declined";
  const [note, setNote] = useState("");
  const [redo, setRedo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [link, setLink] = useState("");
  useEffect(() => { if (open) { setNote(""); setRedo(declined); setErr(""); setLink(""); } }, [open, declined]);

  const name = o.data.firstName || "there";
  const message = `Hello ${name}, please update your Friscontech onboarding form. What to correct: ${note.trim()}\n\nOpen this link (valid for 7 days): ${link}`;
  const email = o.data.email;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{link ? "Send the corrections link" : "Request corrections"}</DialogTitle>
          <DialogDescription className="text-xs">
            {link
              ? "The staff member can't sign in until approved, so send them this link. The old link no longer works."
              : "The form goes back to the staff member with your note. Their answers, documents and account are kept; they fix what you ask and submit again."}
          </DialogDescription>
        </DialogHeader>
        {link ? (
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input readOnly value={link} className="h-9 font-mono text-xs" />
              <Button size="sm" variant="outline" onClick={() => copyText(link)}><Copy className="size-4" />Copy</Button>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" asChild>
                <a href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer"><MessageCircle className="size-4" />Send on WhatsApp</a>
              </Button>
              {email && (
                <Button size="sm" variant="outline" asChild>
                  <a href={`mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent("Please update your onboarding form")}&body=${encodeURIComponent(message)}`}><Mail className="size-4" />Send by email</a>
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => copyText(message, "Message copied")}><Copy className="size-4" />Copy message</Button>
            </div>
            <p className="text-[11px] text-muted-foreground">If they try to sign in meanwhile, they see your note and are told to use the link.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <Label className="text-xs">What needs correcting? *</Label>
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={4} className="mt-1.5"
                placeholder="e.g. Your guarantor could not be reached — provide another guarantor. Upload a clearer passport photo." />
            </div>
            <label className="flex items-start gap-2 text-xs">
              <Checkbox checked={redo} disabled={declined} onCheckedChange={(c) => setRedo(!!c)} className="mt-0.5" />
              <span>The guarantor form must be completed again{declined ? " (required: you declined the guarantor)" : ""}</span>
            </label>
            {err && <p className="text-[11px] font-medium text-destructive">{err}</p>}
          </div>
        )}
        <DialogFooter>
          {link ? <Button onClick={() => onOpenChange(false)}>Done</Button> : <>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button disabled={busy} onClick={async () => {
              if (note.trim().length < 5) { setErr("Describe what the staff member needs to correct."); return; }
              setBusy(true);
              const r = await onboardingService.requestCorrections(o.id, note.trim(), redo);
              setBusy(false);
              if (!r.ok) { setErr(r.errors.form ?? "Could not request corrections"); return; }
              setLink(onboardingUrl(r.data));
              toast.success("Form sent back for corrections");
              await onDone();
            }}>{busy && <Loader2 className="size-4 animate-spin" />}Send back for corrections</Button>
          </>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReasonDialog({ open, onOpenChange, title, description, confirm, onSubmit }: {
  open: boolean; onOpenChange: (open: boolean) => void; title: string; description: string; confirm: string;
  onSubmit: (reason: string) => Promise<Outcome>;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => { if (open) { setReason(""); setErr(""); } }, [open]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription className="text-xs">{description}</DialogDescription></DialogHeader>
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason" rows={4} />
        {err && <p className="text-[11px] font-medium text-destructive">{err}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="outline" disabled={busy} onClick={async () => {
            setBusy(true);
            const r = await onSubmit(reason);
            setBusy(false);
            if (!r.ok) { setErr(r.errors?.form ?? "Failed"); return; }
            onOpenChange(false);
          }}>{busy && <Loader2 className="size-4 animate-spin" />}{confirm}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ApproveDialog({ open, onOpenChange, o, scope, onDone }: {
  open: boolean; onOpenChange: (open: boolean) => void; o: Onboarding; scope: AccessScope; onDone: () => void;
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
          <DialogTitle>Approve {fullName(o.data) || "staff member"}</DialogTitle>
          <DialogDescription className="text-xs">Choose the role and active branch this staff member will work in. Approving a manager also makes them that branch's manager.</DialogDescription>
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
            const r = await onboardingService.approve(o.id, role, branchId, scope.user.id);
            setBusy(false);
            if (!r.ok) { setErr(r.errors.form ?? "Could not approve"); return; }
            toast.success("Staff member activated");
            onOpenChange(false);
            onDone();
          }}>{busy && <Loader2 className="size-4 animate-spin" />}Approve</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
