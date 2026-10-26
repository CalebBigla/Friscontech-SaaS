import { useEffect, useState } from "react";
import { Ban, Copy, Link2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { DetailItem, ErrorState, Panel } from "@/components/shared";
import type { User } from "@/data/mock-db";
import {
  guarantorStatusLabel, onboardingStatusLabel, type Onboarding, type OnboardingStatus,
} from "@/data/onboarding";
import { formatDate } from "@/lib/format";
import {
  canViewOnboardingDetails, guarantorUrl, onboardingLinkState, onboardingUrl, ONBOARDING_STEPS,
} from "@/lib/onboarding";
import type { AccessScope } from "@/lib/session";
import { useQueryClient } from "@tanstack/react-query";
import { useMemberOnboarding } from "@/hooks/use-onboardings";
import { queryKeys } from "@/lib/query-keys";
import { onboardingService } from "@/services/onboarding-service";
import { OnboardingReview } from "@/components/team/onboarding-review";

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
  const owner = canViewOnboardingDetails(scope);
  const queryClient = useQueryClient();
  const onboarding = useMemberOnboarding(member.id, owner || member.status === "pending");
  const o = owner || member.status === "pending" ? onboarding.data : null;
  const [busy, setBusy] = useState("");
  const [jobOpen, setJobOpen] = useState(false);
  const [now, setNow] = useState("");
  useEffect(() => setNow(new Date().toISOString()), []);

  /** Reload this onboarding and everything an onboarding decision changes. */
  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.onboardings.root() }),
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all(scope.user.tenantId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.root() }),
    ]);
  }

  async function run(key: string, fn: () => Promise<{ ok: boolean; errors?: { form?: string } }>, success: string) {
    setBusy(key);
    const r = await fn();
    setBusy("");
    if (r.ok) { toast.success(success); await refresh(); }
    else toast.error(r.errors?.form ?? "Something went wrong");
  }

  if (onboarding.error) return <div className="mb-5"><ErrorState title="Could not load onboarding" error={onboarding.error} /></div>;
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

        {/* ---- Review: summary, PDF, guarantor decision, approve / reject ---- */}
        {owner && (o.status === "submitted" || o.status === "approved" || o.status === "rejected" || !!o.correctionNote) && (
          <div className="border-t border-border pt-4"><OnboardingReview onboardingId={o.id} scope={scope} /></div>
        )}
      </div>

      {/* ---- Dialogs ---- */}
      <JobDialog open={jobOpen} onOpenChange={setJobOpen} o={o} actorId={scope.user.id} onRefresh={refresh} />
    </Panel>
  );
}

// ---------- dialog helpers ----------

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
