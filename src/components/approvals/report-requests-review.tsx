import { useState } from "react";
import { Check, FileBarChart, Loader2, X } from "lucide-react";
import { toast } from "sonner";

import { EmptyState, FieldError, Panel } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Db } from "@/data/mock-db";
import { useReportRequests, useReviewReportRequest, type ReportRequest } from "@/hooks/use-report-requests";
import { formatDate } from "@/lib/format";
import { fieldErrorsFrom } from "@/lib/supabase-helpers";

/** Owner: approve or decline Supervisor report requests. */
export function ReportRequestsReview({ db }: { db: Db }) {
  const { data: requests = [], isLoading } = useReportRequests();
  const pending = requests.filter((r) => r.status === "pending");
  const recent = requests.filter((r) => r.status !== "pending").slice(0, 5);
  if (isLoading || (!pending.length && !recent.length)) return null;
  const who = (id: string) => db.users.find((u) => u.id === id)?.name ?? "Supervisor";
  const branch = (id: string | null) => (id ? (db.branches.find((b) => b.id === id)?.name ?? "Branch") : "All branches");

  return (
    <Panel className="mb-5" title="Report requests" subtitle={pending.length ? `${pending.length} waiting for you` : "Nothing waiting"}>
      {pending.length ? (
        <ul className="divide-y divide-border">
          {pending.map((r) => <PendingRow key={r.id} r={r} who={who(r.requestedBy)} branch={branch(r.branchId)} />)}
        </ul>
      ) : (
        <EmptyState icon={FileBarChart} title="No report requests waiting" detail="Supervisors' report requests appear here for your approval." />
      )}
      {recent.length > 0 && (
        <div className="border-t border-border px-5 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Recently reviewed</p>
          <ul className="mt-2 space-y-1.5 text-xs">
            {recent.map((r) => (
              <li key={r.id} className="flex flex-wrap justify-between gap-2">
                <span>{who(r.requestedBy)} · {r.reportType === "sales" ? "Sales" : "Inventory"} · {branch(r.branchId)}</span>
                <span className={r.status === "approved" ? "text-success" : "text-destructive"}>{r.status === "approved" ? "Approved" : "Declined"}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  );
}

function PendingRow({ r, who, branch }: { r: ReportRequest; who: string; branch: string }) {
  const review = useReviewReportRequest();
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");

  async function decide(approve: boolean) {
    setError("");
    if (!approve && reason.trim().length < 3) return setError("Give the Supervisor a reason");
    try {
      await review.mutateAsync({ p_request_id: r.id, p_approve: approve, p_reason: approve ? null : reason.trim() });
      toast.success(approve ? "Report approved" : "Report request declined", {
        description: approve ? `${who} can open it for the next 7 days.` : `${who} has been told why.`,
      });
    } catch (failure) {
      const errors = fieldErrorsFrom(failure, ["reason"] as const);
      setError(errors.reason ?? errors.form ?? "Could not save your decision");
    }
  }

  return (
    <li className="px-5 py-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold">{who} · {r.reportType === "sales" ? "Sales report" : "Inventory report"}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {branch} · {r.reportType === "sales" ? `${formatDate(r.periodFrom)} to ${formatDate(r.periodTo)}` : "Stock on hand"} · asked {formatDate(r.createdAt.slice(0, 10))}
          </p>
          {r.note && <p className="mt-1.5 rounded-md bg-muted/60 px-2.5 py-1.5 text-xs">“{r.note}”</p>}
        </div>
        {!declining && (
          <div className="flex shrink-0 gap-2">
            <Button size="sm" variant="outline" onClick={() => setDeclining(true)} disabled={review.isPending}><X className="size-3.5" />Decline</Button>
            <Button size="sm" onClick={() => void decide(true)} disabled={review.isPending}>
              {review.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}Approve
            </Button>
          </div>
        )}
      </div>
      {declining && (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <Input autoFocus aria-label="Reason for declining" placeholder="Reason for the Supervisor" value={reason} onChange={(e) => setReason(e.target.value)} className="h-9 flex-1" />
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => { setDeclining(false); setError(""); }}>Cancel</Button>
            <Button size="sm" variant="outline" className="text-destructive" onClick={() => void decide(false)} disabled={review.isPending}>
              {review.isPending && <Loader2 className="size-3.5 animate-spin" />}Decline request
            </Button>
          </div>
        </div>
      )}
      <FieldError message={error} />
    </li>
  );
}
