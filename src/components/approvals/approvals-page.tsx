import { useState } from "react";
import { AlertTriangle, Check, CheckCheck, Clock, X, XCircle } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ALL, EmptyState, FieldError, FilterSelect, MetricCard, Panel } from "@/components/shared";
import type { ApprovalRequest } from "@/data/mock-db";
import { useDb } from "@/services/mock-store";
import { approvalService, canReviewApproval } from "@/services/services";
import { getAccessScope, useCurrentUserId } from "@/lib/session";
import {
  approvalTypeLabel,
  describeApproval,
  getApprovals,
  getApprovalSummary,
} from "@/lib/approvals";
import { formatDayTime, formatNumber } from "@/lib/format";

const statusTone = {
  pending: "status-warning",
  approved: "status-success",
  rejected: "status-danger",
} as const;

export function ApprovalsPage() {
  const db = useDb();
  const userId = useCurrentUserId();
  const scope = getAccessScope(db, userId);
  const today = db.tenant.referenceDate;
  const [type, setType] = useState(ALL);
  const [status, setStatus] = useState("pending");
  const [rejecting, setRejecting] = useState<ApprovalRequest | null>(null);
  const [reason, setReason] = useState("");
  const [reasonErr, setReasonErr] = useState<string>();
  const [busy, setBusy] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkConfirm, setBulkConfirm] = useState(false);

  const all = getApprovals(db, scope);
  const summary = getApprovalSummary(all);
  const list = all.filter(
    (a) => (type === ALL || a.type === type) && (status === ALL || a.status === status),
  );
  const reviewer = scope.canReviewApprovals;
  const eligibleVisible = list.filter(
    (item) => item.status === "pending" && canReviewApproval(db, userId, item),
  );
  const selectedVisible = eligibleVisible.filter((item) => selectedIds.includes(item.id));
  const name = (id?: string) => db.users.find((u) => u.id === id)?.name ?? "—";
  const types =
    scope.user.role === "owner"
      ? Object.entries(approvalTypeLabel)
      : scope.user.role === "manager"
        ? Object.entries(approvalTypeLabel)
        : Object.entries(approvalTypeLabel).filter(([k]) => k !== "team_member");

  async function approve(a: ApprovalRequest) {
    setBusy(a.id);
    const r = await approvalService.approve(a.id, userId);
    setBusy(null);
    if (r.ok)
      toast.success(a.emergency ? "Emergency addition marked as reviewed." : "Request approved.", {
        description: `${a.id} · ${describeApproval(db, a).title}`,
      });
    else toast.error(r.errors.form ?? "Could not approve");
  }
  async function reject() {
    if (!rejecting) return;
    setBusy(rejecting.id);
    const r = await approvalService.reject(rejecting.id, reason, userId);
    setBusy(null);
    if (!r.ok) {
      setReasonErr(
        (r.errors.reason as string | undefined) ?? (r.errors.form as string | undefined),
      );
      return;
    }
    toast.success("Request rejected.", { description: rejecting.id });
    setRejecting(null);
  }
  async function approveSelected() {
    setBusy("bulk");
    const result = await approvalService.approveMany(
      selectedVisible.map((item) => item.id),
      userId,
    );
    setBusy(null);
    setBulkConfirm(false);
    if (!result.ok) {
      toast.error(result.errors.form ?? "Could not approve selected requests");
      return;
    }
    setSelectedIds((ids) => ids.filter((id) => !selectedVisible.some((item) => item.id === id)));
    toast.success(
      String(result.data.length) + " request" + (result.data.length === 1 ? "" : "s") + " approved",
    );
  }
  const toggleSelected = (id: string, checked: boolean) =>
    setSelectedIds((ids) =>
      checked ? [...new Set([...ids, id])] : ids.filter((value) => value !== id),
    );
  const toggleVisible = (checked: boolean) =>
    setSelectedIds((ids) =>
      checked
        ? [...new Set([...ids, ...eligibleVisible.map((item) => item.id)])]
        : ids.filter((id) => !eligibleVisible.some((item) => item.id === id)),
    );

  const actions = (a: ApprovalRequest) =>
    a.status === "pending" && canReviewApproval(db, userId, a) ? (
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={busy === a.id}
          onClick={() => {
            setRejecting(a);
            setReason("");
            setReasonErr(undefined);
          }}
        >
          <X className="size-3.5" />
          Reject
        </Button>
        <Button size="sm" disabled={busy === a.id} onClick={() => void approve(a)}>
          <Check className="size-3.5" />
          {a.emergency ? "Mark reviewed" : "Approve"}
        </Button>
      </div>
    ) : null;

  return (
    <AppShell
      title="Approvals"
      subtitle={
        reviewer
          ? "Review requests that need your sign-off."
          : "Track requests you've sent for approval."
      }
    >
      <div className="mb-5">
        <h1 className="text-xl font-bold">{reviewer ? "Approvals" : "My Approval Requests"}</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          {scope.user.role === "owner"
            ? "New team members, stock additions and product deactivations across the organization."
            : scope.user.role === "manager"
              ? "Stock additions and product deactivations from your storekeeper, plus team members you've proposed."
              : "Stock additions and product deactivations you've sent to your manager."}
        </p>
      </div>

      <section className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <MetricCard
          icon={Clock}
          tone="warning"
          label="Awaiting approval"
          value={formatNumber(summary.pending)}
          badge={summary.pending && reviewer ? "Action" : undefined}
        />
        <MetricCard
          icon={AlertTriangle}
          tone="warning"
          label="Emergency — review needed"
          value={formatNumber(summary.emergency)}
          detail="Stock already added"
        />
        <MetricCard
          icon={CheckCheck}
          tone="success"
          label="Approved"
          value={formatNumber(summary.approved)}
        />
        <MetricCard
          icon={XCircle}
          tone="violet"
          label="Rejected"
          value={formatNumber(summary.rejected)}
          detail="Kept in history"
        />
      </section>

      <Panel
        className="mt-4 overflow-hidden"
        title="Requests"
        subtitle={`${list.length} of ${all.length}`}
        action={
          <div className="grid grid-cols-2 gap-2 sm:flex">
            {reviewer && eligibleVisible.length > 0 && (
              <div className="flex items-center gap-2 rounded-md border border-border px-2 text-xs">
                <input
                  aria-label="Select all eligible visible approvals"
                  type="checkbox"
                  checked={selectedVisible.length === eligibleVisible.length}
                  onChange={(event) => toggleVisible(event.target.checked)}
                />
                Select all
              </div>
            )}
            {reviewer && selectedVisible.length > 0 && (
              <Button size="sm" onClick={() => setBulkConfirm(true)}>
                <CheckCheck className="size-4" />
                Approve selected ({selectedVisible.length})
              </Button>
            )}
            <FilterSelect
              label="Type filter"
              className="w-full sm:w-44"
              value={type}
              onChange={setType}
              options={[
                { value: ALL, label: "All types" },
                ...types.map(([value, label]) => ({ value, label })),
              ]}
            />
            <FilterSelect
              label="Status filter"
              className="w-full sm:w-36"
              value={status}
              onChange={setStatus}
              options={[
                { value: ALL, label: "All statuses" },
                { value: "pending", label: "Pending" },
                { value: "approved", label: "Approved" },
                { value: "rejected", label: "Rejected" },
              ]}
            />
          </div>
        }
      >
        {list.length === 0 ? (
          <EmptyState
            title={
              status === "pending" ? "You're all caught up." : "No requests match these filters"
            }
            {...(status === "pending" ? { detail: "Nothing is waiting for approval." } : {})}
          />
        ) : (
          <div className="divide-y divide-border">
            {list.map((a) => {
              const d = describeApproval(db, a);
              return (
                <div
                  key={a.id}
                  className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5"
                  data-testid="approval-row"
                >
                  <div className="flex min-w-0 items-start gap-3">
                    {reviewer && a.status === "pending" && canReviewApproval(db, userId, a) && (
                      <input
                        aria-label={"Select approval " + a.id}
                        type="checkbox"
                        checked={selectedIds.includes(a.id)}
                        onChange={(event) => toggleSelected(a.id, event.target.checked)}
                        className="mt-1"
                      />
                    )}
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-[11px] font-semibold">{a.id}</span>
                        <span className="status status-brand">{approvalTypeLabel[a.type]}</span>
                        {a.emergency && <span className="status status-danger">Emergency</span>}
                        <span className={`status ${statusTone[a.status]}`}>
                          {a.status === "pending" && a.emergency
                            ? "Review needed"
                            : a.status[0]!.toUpperCase() + a.status.slice(1)}
                        </span>
                      </div>
                      <p className="mt-1.5 text-sm font-bold">{d.title}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {d.detail}
                        {d.detail ? " · " : ""}
                        {db.branches.find((b) => b.id === a.branchId)?.name ?? "No branch"} · by{" "}
                        {name(a.requestedBy)} · {formatDayTime(a.requestedAt, today)}
                      </p>
                      {a.emergencyReason && (
                        <p className="mt-1 text-[11px]">
                          <span className="text-destructive">Emergency reason: </span>
                          {a.emergencyReason}
                        </p>
                      )}
                      {a.note && (
                        <p className="mt-1 text-[11px]">
                          <span className="text-muted-foreground">Note: </span>
                          {a.note}
                        </p>
                      )}
                      {a.reviewedBy && (
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {a.status === "approved" ? "Approved" : "Rejected"} by{" "}
                          {name(a.reviewedBy)} · {formatDayTime(a.reviewedAt!, today)}
                          {a.rejectionReason ? ` — ${a.rejectionReason}` : ""}
                        </p>
                      )}
                    </div>
                  </div>
                  {actions(a)}
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      <Dialog open={!!rejecting} onOpenChange={(o) => !o && setRejecting(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reject {rejecting?.id}?</DialogTitle>
            <DialogDescription className="text-xs">
              {rejecting?.emergency
                ? "The emergency stock was already added. Rejecting records your objection; make a stock adjustment if the stock should be removed."
                : "The requester will see your reason. Nothing changes in the app."}
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label htmlFor="apr-reason" className="text-xs">
              Reason *
            </Label>
            <Textarea
              id="apr-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="mt-1.5 text-sm"
            />
            <FieldError message={reasonErr} />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setRejecting(null)}>
              Cancel
            </Button>
            <Button
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={busy === rejecting?.id}
              onClick={() => void reject()}
            >
              Reject request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={bulkConfirm} onOpenChange={(open) => !open && setBulkConfirm(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Approve {selectedVisible.length} requests?</DialogTitle>
            <DialogDescription>
              Each selected pending request will be validated, updated, and recorded in the audit
              log individually.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={busy === "bulk"}
              onClick={() => setBulkConfirm(false)}
            >
              Cancel
            </Button>
            <Button
              disabled={busy === "bulk" || !selectedVisible.length}
              onClick={() => void approveSelected()}
            >
              {busy === "bulk" ? "Approving…" : "Confirm approvals"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
