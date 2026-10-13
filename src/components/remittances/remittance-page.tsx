import { useMemo, useState, type ReactNode } from "react";
import { ArrowDownRight, Banknote, Check, Eye, Landmark, Receipt } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { EmptyState, FieldError, FilterSelect, MetricCard, Panel } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ManagerRemittance, RemittanceStatus } from "@/data/mock-db";
import { formatDate, formatMonth, formatNaira, formatTime } from "@/lib/format";
import {
  getManagerExpenseTotal,
  getManagerNetRemittanceDue,
  getManagerPaymentBreakdown,
  getManagerRemittances,
  getManagerTotalReceived,
  getRemittanceOutstanding,
  validateRemittanceReconciliation,
} from "@/lib/remittance-calculations";
import { getAccessScope, useCurrentUserId } from "@/lib/session";
import { useDb } from "@/services/mock-store";
import { remittanceService, type FieldErrors } from "@/services/services";

const currentPeriod = (date: string) => date.slice(0, 7);
const remittanceLabel: Record<RemittanceStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  confirmed: "Confirmed",
  declined: "Declined",
};
const statusTone: Record<RemittanceStatus, string> = {
  draft: "border-muted-foreground/30 bg-muted text-muted-foreground",
  submitted: "border-warning/40 bg-warning/10 text-warning",
  confirmed: "border-success/30 bg-success/5 text-success",
  declined: "border-destructive/30 bg-destructive/5 text-destructive",
};

function RemittanceBadge({ status }: { status: RemittanceStatus }) {
  return (
    <Badge variant="outline" className={`whitespace-nowrap ${statusTone[status]}`}>
      {remittanceLabel[status]}
    </Badge>
  );
}

export function RemittancePage() {
  const db = useDb();
  const userId = useCurrentUserId();
  const scope = getAccessScope(db, userId);
  const managerMode = scope.user.role === "manager";
  const periodNow = currentPeriod(db.tenant.referenceDate);
  const [period, setPeriod] = useState(periodNow);
  const [branchFilter, setBranchFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState(managerMode ? "all" : "submitted");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<"submit" | "confirm" | "decline" | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [cashValue, setCashValue] = useState("");
  const [transferValue, setTransferValue] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [declineReason, setDeclineReason] = useState("");
  const [reasonError, setReasonError] = useState("");

  const allRows = useMemo(() => getManagerRemittances(db, scope), [db, scope]);
  const periodRows = useMemo(
    () => getManagerRemittances(db, scope, { period }),
    [db, scope, period],
  );
  const selected = allRows.find((row) => row.id === selectedId) ?? null;
  const actionRow = allRows.find((row) => row.id === actionId) ?? null;
  const manager = db.users.find((user) => user.id === userId);
  const managerBranch = db.branches.find((branch) => branch.id === manager?.branchId);
  const branches = db.branches.filter(
    (branch) =>
      branch.tenantId === scope.user.tenantId &&
      (scope.branchIds === null || scope.branchIds.includes(branch.id)),
  );
  const rows = (managerMode ? periodRows : allRows).filter(
    (row) =>
      (branchFilter === "all" || row.branchId === branchFilter) &&
      (statusFilter === "all" || row.status === statusFilter),
  );
  const totalReceived = managerMode ? getManagerTotalReceived(db, userId, period) : 0;
  const expenses = managerMode ? getManagerExpenseTotal(db, userId, period) : 0;
  const netDue = managerMode ? getManagerNetRemittanceDue(db, userId, period) : 0;
  const sourceBreakdown = managerMode
    ? getManagerPaymentBreakdown(db, userId, period)
    : { cash: 0, transfer: 0, outstanding: 0 };
  const latestPeriodRemittance = managerMode
    ? periodRows.find((row) => row.managerId === userId)
    : null;
  const currentRemittance =
    latestPeriodRemittance?.status !== "declined" ? latestPeriodRemittance : null;
  const awaitingOwnerReview = managerMode && latestPeriodRemittance?.status === "submitted";
  const latestDeclined =
    latestPeriodRemittance?.status === "declined" ? latestPeriodRemittance : null;
  const numericCash = cashValue === "" ? 0 : Number(cashValue);
  const numericTransfer = transferValue === "" ? 0 : Number(transferValue);
  const outstanding = getRemittanceOutstanding(netDue, numericCash, numericTransfer);
  const reconciliation = validateRemittanceReconciliation(netDue, {
    cashAmount: numericCash,
    transferAmount: numericTransfer,
  });

  const openSubmit = (row?: ManagerRemittance) => {
    setActionId(null);
    setErrors({});
    setCashValue(row ? String(row.cashAmount) : "");
    setTransferValue(row ? String(row.transferAmount) : "");
    setReference(row?.transferReference ?? "");
    setNote(row?.note ?? "");
    setDialog("submit");
  };
  const openAction = (kind: "confirm" | "decline", row: ManagerRemittance) => {
    setActionId(row.id);
    setErrors({});
    setReasonError("");
    setDeclineReason("");
    setDialog(kind);
  };
  const submit = async () => {
    setBusy(true);
    const result = await remittanceService.submit(
      {
        period,
        cashAmount: numericCash,
        transferAmount: numericTransfer,
        transferReference: reference,
        note,
      },
      userId,
    );
    setBusy(false);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    toast.success("Remittance submitted to the Owner");
    setDialog(null);
  };
  const review = async (kind: "confirm" | "decline") => {
    if (!actionRow) return;
    setBusy(true);
    const result =
      kind === "confirm"
        ? await remittanceService.confirm(actionRow.id, userId)
        : await remittanceService.decline(actionRow.id, declineReason, userId);
    setBusy(false);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    toast.success(kind === "confirm" ? "Remittance confirmed" : "Remittance declined");
    setDialog(null);
  };

  if (managerMode) {
    return (
      <AppShell
        title="Manager Remittance"
        subtitle="Submit and track your remittance to the Owner."
      >
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-xl font-bold">Remittance</h1>
            <p className="mt-1 text-xs text-muted-foreground">
              Calculate the eligible payment position less recorded expenses.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Label
              htmlFor="manager-remittance-period"
              className="self-center text-xs text-muted-foreground"
            >
              Period
            </Label>
            <Input
              id="manager-remittance-period"
              type="month"
              max={periodNow}
              value={period}
              onChange={(event) => setPeriod(event.target.value)}
              className="w-44"
            />
            <Button
              disabled={netDue < 0 || awaitingOwnerReview}
              onClick={() => openSubmit(latestDeclined ?? undefined)}
            >
              {awaitingOwnerReview
                ? "Awaiting Owner Review"
                : latestDeclined
                  ? "Submit Corrected Remittance"
                  : "Submit Remittance"}
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            icon={Banknote}
            tone="brand"
            label="Total Received"
            value={formatNaira(totalReceived)}
            detail="Acknowledged payment position, including rep outstanding"
          />
          <MetricCard
            icon={Receipt}
            tone="warning"
            label="Expenses"
            value={formatNaira(expenses)}
            detail="Recorded expenses this period"
          />
          <MetricCard
            icon={ArrowDownRight}
            tone="success"
            label="Net Remittance Due"
            value={formatNaira(netDue)}
            detail="Total received less expenses"
          />
          <MetricCard
            icon={Landmark}
            tone={currentRemittance?.status === "confirmed" ? "success" : "violet"}
            label="Remittance Status"
            value={
              currentRemittance
                ? remittanceLabel[currentRemittance.status]
                : latestDeclined
                  ? "Declined"
                  : "Not submitted"
            }
            detail={
              latestDeclined?.declineReason ??
              currentRemittance?.declineReason ??
              "For the selected period"
            }
          />
        </div>
        <div className="mt-5 grid gap-4 xl:grid-cols-2">
          <Panel
            title="Eligible payment position"
            subtitle="From acknowledged or reconciled Sales Rep payments. Outstanding is not cash held."
          >
            <dl className="divide-y divide-border px-5 text-sm">
              {[
                ["Cash reported", sourceBreakdown.cash],
                ["Transfer reported", sourceBreakdown.transfer],
                ["Rep outstanding · uncollected", sourceBreakdown.outstanding],
                ["Total payment position", totalReceived],
              ].map(([label, amount]) => (
                <div key={String(label)} className="flex items-center justify-between gap-4 py-3">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="font-semibold tabular-nums">{formatNaira(Number(amount))}</dd>
                </div>
              ))}
            </dl>
          </Panel>
          <Panel
            title="Remittance calculation"
            subtitle="Rep outstanding remains a separate due position; it is never added to cash or transfer."
          >
            <dl className="divide-y divide-border px-5 text-sm">
              <CalcLine label="Total received position" value={totalReceived} />
              <CalcLine label="Recorded expenses" value={-expenses} />
              <CalcLine label="Net remittance due" value={netDue} bold />
            </dl>
            {latestDeclined && !currentRemittance && (
              <div className="border-t border-destructive/20 bg-destructive/5 px-5 py-3 text-xs">
                <p className="font-semibold text-destructive">Remittance declined</p>
                <p className="mt-1">{latestDeclined.declineReason}</p>
              </div>
            )}
            {currentRemittance && (
              <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-3 text-xs">
                <span>Status</span>
                <RemittanceBadge status={currentRemittance.status} />
              </div>
            )}
          </Panel>
        </div>
        <Panel
          title="Remittance history"
          subtitle={`${managerBranch?.name ?? "Assigned branch"} · ${formatMonth(period)}`}
          className="mt-5 min-w-0 overflow-hidden"
        >
          <RemittanceTable
            rows={rows}
            db={db}
            managerMode
            onView={(row) => setSelectedId(row.id)}
            onResubmit={
              !awaitingOwnerReview
                ? (row) => {
                    setPeriod(row.period);
                    openSubmit(row);
                  }
                : undefined
            }
          />
        </Panel>
        <Dialog
          open={dialog === "submit"}
          onOpenChange={(open) => !busy && !open && setDialog(null)}
        >
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Submit Remittance?</DialogTitle>
              <DialogDescription>
                Review the calculated payment position and allocate the amount remitted by method.
              </DialogDescription>
            </DialogHeader>
            <RemittanceSummaryLines
              totalReceived={totalReceived}
              expenses={expenses}
              netDue={netDue}
              cash={numericCash}
              transfer={numericTransfer}
              outstanding={outstanding}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <RemitField label="Cash to remit">
                <Input
                  type="number"
                  min="0"
                  value={cashValue}
                  onChange={(event) => setCashValue(event.target.value)}
                  aria-label="Cash to remit"
                />
                {errors.cashAmount && <FieldError message={errors.cashAmount} />}
              </RemitField>
              <RemitField label="Transfer to remit">
                <Input
                  type="number"
                  min="0"
                  value={transferValue}
                  onChange={(event) => setTransferValue(event.target.value)}
                  aria-label="Transfer to remit"
                />
                {errors.transferAmount && <FieldError message={errors.transferAmount} />}
              </RemitField>
              <RemitField label="Outstanding / remaining due">
                <Input
                  value={formatNaira(outstanding)}
                  readOnly
                  aria-label="Calculated remittance outstanding"
                />
              </RemitField>
              <RemitField label="Transfer reference">
                <Input
                  value={reference}
                  onChange={(event) => setReference(event.target.value)}
                  aria-label="Transfer reference"
                />
                {errors.transferReference && <FieldError message={errors.transferReference} />}
              </RemitField>
              <RemitField label="Note" className="sm:col-span-2">
                <Textarea
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  aria-label="Remittance note"
                />
              </RemitField>
            </div>
            <div className="rounded-md border border-border bg-muted/30 p-3 text-xs">
              <div className="flex flex-wrap justify-between gap-2">
                <span>Cash + Transfer + Outstanding</span>
                <strong>
                  {formatNaira(numericCash)} + {formatNaira(numericTransfer)} +{" "}
                  {formatNaira(outstanding)} = {formatNaira(netDue)}
                </strong>
              </div>
              <p
                className={`mt-2 font-semibold ${reconciliation.balanced ? "text-success" : "text-destructive"}`}
              >
                {reconciliation.balanced ? "Balanced" : "Not balanced"} · Outstanding can include
                uncollected rep balances; it is not cash held.
              </p>
            </div>
            {errors.form && <FieldError message={errors.form} />}
            <DialogFooter>
              <Button variant="outline" disabled={busy} onClick={() => setDialog(null)}>
                Cancel
              </Button>
              <Button disabled={busy || !reconciliation.balanced} onClick={submit}>
                {busy ? "Submitting…" : "Submit Remittance"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <RemittanceDetails remittance={selected} db={db} onClose={() => setSelectedId(null)} />
      </AppShell>
    );
  }

  return (
    <AppShell title="Manager Remittance Approvals" subtitle="Review submitted Manager remittances.">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-bold">Manager Remittance Approvals</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Review all submitted Manager remittances and their source calculations.
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <MetricCard
          icon={Landmark}
          tone="warning"
          label="Pending Owner Review"
          value={String(allRows.filter((row) => row.status === "submitted").length)}
          detail="Manager remittances awaiting action"
        />
        <MetricCard
          icon={Check}
          tone="success"
          label="Confirmed"
          value={String(allRows.filter((row) => row.status === "confirmed").length)}
        />
        <MetricCard
          icon={Receipt}
          tone="warning"
          label="Declined"
          value={String(allRows.filter((row) => row.status === "declined").length)}
          detail="Preserved in history"
        />
      </div>
      <Panel
        title="Manager remittance submissions"
        subtitle="Owner review queue and preserved remittance history"
        className="mt-5 min-w-0 overflow-hidden"
        action={
          <FilterSelect
            label="Branch"
            value={branchFilter}
            onChange={setBranchFilter}
            options={[
              { value: "all", label: "All branches" },
              ...branches.map((branch) => ({ value: branch.id, label: branch.name })),
            ]}
            className="w-40"
          />
        }
      >
        <RemittanceTable
          rows={rows.filter((row) => statusFilter === "all" || row.status === statusFilter)}
          db={db}
          managerMode={false}
          onView={(row) => setSelectedId(row.id)}
          onConfirm={(row) => openAction("confirm", row)}
          onDecline={(row) => openAction("decline", row)}
        />
      </Panel>
      <div className="mt-3 flex justify-end">
        <FilterSelect
          label="Remittance status"
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: "all", label: "All statuses" },
            { value: "submitted", label: "Submitted" },
            { value: "confirmed", label: "Confirmed" },
            { value: "declined", label: "Declined" },
          ]}
          className="w-40"
        />
      </div>
      <Dialog
        open={dialog === "confirm" || dialog === "decline"}
        onOpenChange={(open) => !busy && !open && setDialog(null)}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {dialog === "confirm" ? "Confirm Remittance?" : "Decline Remittance"}
            </DialogTitle>
            <DialogDescription>
              {dialog === "confirm"
                ? "Confirm this Manager remittance. The action and confirmation time will be recorded."
                : "Provide a reason so the Manager can correct the issue and create a new submission. The declined record stays in history."}
            </DialogDescription>
          </DialogHeader>
          {actionRow && <ManagerRemittanceSummary row={actionRow} db={db} />}
          {dialog === "decline" && (
            <div>
              <Label className="text-xs">Decline reason</Label>
              <Textarea
                className="mt-1.5"
                value={declineReason}
                onChange={(event) => {
                  setDeclineReason(event.target.value);
                  setReasonError("");
                }}
                aria-label="Decline reason"
              />
              {reasonError && <FieldError message={reasonError} />}
              {errors.reason && <FieldError message={errors.reason} />}
            </div>
          )}
          {errors.form && <FieldError message={errors.form} />}
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button
              variant={dialog === "decline" ? "outline" : "default"}
              className={
                dialog === "decline" ? "border-destructive/40 text-destructive" : undefined
              }
              disabled={busy || (dialog === "decline" && !declineReason.trim())}
              onClick={() => (dialog === "confirm" || dialog === "decline") && review(dialog)}
            >
              {busy
                ? "Saving…"
                : dialog === "confirm"
                  ? "Confirm Remittance"
                  : "Decline Remittance"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <RemittanceDetails remittance={selected} db={db} onClose={() => setSelectedId(null)} />
    </AppShell>
  );
}

function CalcLine({
  label,
  value,
  bold = false,
}: {
  label: string;
  value: number;
  bold?: boolean;
}) {
  return (
    <div className={`flex justify-between gap-3 py-3 ${bold ? "font-bold" : ""}`}>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular-nums">{formatNaira(value)}</dd>
    </div>
  );
}
function RemitField({
  label,
  children,
  className = "",
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <Label className="text-xs">{label}</Label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}
function RemittanceSummaryLines({
  totalReceived,
  expenses,
  netDue,
  cash,
  transfer,
  outstanding,
}: {
  totalReceived: number;
  expenses: number;
  netDue: number;
  cash: number;
  transfer: number;
  outstanding: number;
}) {
  return (
    <div className="rounded-md border border-border bg-muted/20 p-4">
      <dl className="grid grid-cols-2 gap-x-5 gap-y-3 text-xs">
        {[
          ["Total Received", totalReceived],
          ["Expenses", expenses],
          ["Net Remittance Due", netDue],
          ["Cash", cash],
          ["Transfer", transfer],
          ["Outstanding", outstanding],
        ].map(([label, value]) => (
          <div key={String(label)}>
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="mt-1 font-semibold">{formatNaira(Number(value))}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 border-t border-border pt-3 text-[11px] text-muted-foreground">
        Eligible payment position includes reported rep outstanding. Outstanding is shown separately
        and is not cash or transfer received.
      </p>
    </div>
  );
}

function RemittanceTable({
  rows,
  db,
  managerMode,
  onView,
  onConfirm,
  onDecline,
  onResubmit,
}: {
  rows: ManagerRemittance[];
  db: ReturnType<typeof import("@/services/mock-store").getDb>;
  managerMode: boolean;
  onView: (row: ManagerRemittance) => void;
  onConfirm?: ((row: ManagerRemittance) => void) | undefined;
  onDecline?: ((row: ManagerRemittance) => void) | undefined;
  onResubmit?: ((row: ManagerRemittance) => void) | undefined;
}) {
  return (
    <div className="w-full max-w-full min-w-0 overflow-x-auto overscroll-x-contain">
      <table className="hidden w-full min-w-[1150px] text-left md:table">
        <thead>
          <tr className="text-[10px] uppercase text-muted-foreground">
            {[
              ...(managerMode ? [] : ["Manager"]),
              "Branch",
              "Period",
              "Total Received",
              "Expenses",
              "Net Remittance",
              "Cash",
              "Transfer",
              "Outstanding",
              "Status",
              "Submitted",
              "Actions",
            ].map((title) => (
              <th key={title} className="px-4 py-3">
                {title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <RemittanceRow
              key={row.id}
              row={row}
              db={db}
              managerMode={managerMode}
              onView={onView}
              onConfirm={onConfirm}
              onDecline={onDecline}
              onResubmit={onResubmit}
            />
          ))}
        </tbody>
      </table>
      <div className="divide-y divide-border md:hidden">
        {rows.map((row) => (
          <article key={row.id} className="space-y-3 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold">
                  {managerMode
                    ? db.branches.find((branch) => branch.id === row.branchId)?.name
                    : db.users.find((user) => user.id === row.managerId)?.name}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {managerMode
                    ? formatMonth(row.period)
                    : `${db.branches.find((branch) => branch.id === row.branchId)?.name ?? "Branch"} · ${formatMonth(row.period)}`}
                </p>
              </div>
              <RemittanceBadge status={row.status} />
            </div>
            <dl className="grid grid-cols-2 gap-2 text-xs">
              {[
                ["Total Received", row.totalReceived],
                ["Expenses", row.expenseAmount],
                ["Net Remittance", row.netRemittanceDue],
                ["Cash", row.cashAmount],
                ["Transfer", row.transferAmount],
                ["Outstanding", row.outstandingAmount],
              ].map(([label, value]) => (
                <div key={String(label)}>
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="mt-0.5 font-semibold">{formatNaira(Number(value))}</dd>
                </div>
              ))}
            </dl>
            <RemittanceActions
              row={row}
              managerMode={managerMode}
              onView={onView}
              onConfirm={onConfirm}
              onDecline={onDecline}
              onResubmit={onResubmit}
            />
          </article>
        ))}
      </div>
      {!rows.length && (
        <EmptyState
          title={
            managerMode
              ? "No remittance has been prepared for this period."
              : "No manager remittances are awaiting confirmation."
          }
        />
      )}
    </div>
  );
}

function RemittanceRow({
  row,
  db,
  managerMode,
  onView,
  onConfirm,
  onDecline,
  onResubmit,
}: {
  row: ManagerRemittance;
  db: ReturnType<typeof import("@/services/mock-store").getDb>;
  managerMode: boolean;
  onView: (row: ManagerRemittance) => void;
  onConfirm?: ((row: ManagerRemittance) => void) | undefined;
  onDecline?: ((row: ManagerRemittance) => void) | undefined;
  onResubmit?: ((row: ManagerRemittance) => void) | undefined;
}) {
  return (
    <tr className="border-t border-border text-xs">
      <>
        {!managerMode && (
          <td className="px-4 py-3 font-semibold">
            {db.users.find((user) => user.id === row.managerId)?.name ?? "Manager"}
          </td>
        )}
        <td className="px-4 py-3">
          {db.branches.find((branch) => branch.id === row.branchId)?.name ?? "Branch"}
        </td>
        <td className="px-4 py-3">{formatMonth(row.period)}</td>
        <td className="px-4 py-3">{formatNaira(row.totalReceived)}</td>
        <td className="px-4 py-3">{formatNaira(row.expenseAmount)}</td>
        <td className="px-4 py-3 font-semibold">{formatNaira(row.netRemittanceDue)}</td>
        <td className="px-4 py-3">{formatNaira(row.cashAmount)}</td>
        <td className="px-4 py-3">{formatNaira(row.transferAmount)}</td>
        <td className="px-4 py-3">{formatNaira(row.outstandingAmount)}</td>
        <td className="px-4 py-3">
          <RemittanceBadge status={row.status} />
        </td>
        <td className="px-4 py-3 text-muted-foreground">
          {row.submittedAt ? `${formatDate(row.submittedAt)} ${formatTime(row.submittedAt)}` : "—"}
        </td>
        <td className="px-4 py-2">
          <RemittanceActions
            row={row}
            managerMode={managerMode}
            onView={onView}
            onConfirm={onConfirm}
            onDecline={onDecline}
            onResubmit={onResubmit}
          />
        </td>
      </>
    </tr>
  );
}

function RemittanceActions({
  row,
  managerMode,
  onView,
  onConfirm,
  onDecline,
  onResubmit,
}: {
  row: ManagerRemittance;
  managerMode: boolean;
  onView: (row: ManagerRemittance) => void;
  onConfirm?: ((row: ManagerRemittance) => void) | undefined;
  onDecline?: ((row: ManagerRemittance) => void) | undefined;
  onResubmit?: ((row: ManagerRemittance) => void) | undefined;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {!managerMode && row.status === "submitted" && (
        <>
          <Button size="sm" className="h-8" onClick={() => onConfirm?.(row)}>
            Confirm
          </Button>
          <Button size="sm" variant="outline" className="h-8" onClick={() => onDecline?.(row)}>
            Decline
          </Button>
        </>
      )}
      {managerMode && row.status === "declined" && onResubmit && (
        <Button size="sm" variant="outline" className="h-8" onClick={() => onResubmit(row)}>
          New submission
        </Button>
      )}
      <Button
        size="icon"
        variant="ghost"
        className="size-8"
        onClick={() => onView(row)}
        aria-label={`View remittance ${row.id}`}
      >
        <Eye className="size-4" />
      </Button>
    </div>
  );
}

function ManagerRemittanceSummary({
  row,
  db,
}: {
  row: ManagerRemittance;
  db: ReturnType<typeof import("@/services/mock-store").getDb>;
}) {
  return (
    <div>
      <div className="mb-3 grid grid-cols-2 gap-3 rounded-md border border-border bg-muted/20 p-4 text-xs sm:grid-cols-3">
        {[
          ["Manager", db.users.find((user) => user.id === row.managerId)?.name ?? "Manager"],
          ["Branch", db.branches.find((branch) => branch.id === row.branchId)?.name ?? "Branch"],
          ["Period", formatMonth(row.period)],
          ["Total Received", formatNaira(row.totalReceived)],
          ["Expenses", formatNaira(row.expenseAmount)],
          ["Net Remittance", formatNaira(row.netRemittanceDue)],
          ["Cash", formatNaira(row.cashAmount)],
          ["Transfer", formatNaira(row.transferAmount)],
          ["Outstanding", formatNaira(row.outstandingAmount)],
        ].map(([label, value]) => (
          <div key={label}>
            <p className="text-muted-foreground">{label}</p>
            <p className="mt-1 font-semibold">{value}</p>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground">
        Outstanding is the unpaid or remaining due position. It is not cash held.
      </p>
    </div>
  );
}

function RemittanceDetails({
  remittance,
  db,
  onClose,
}: {
  remittance: ManagerRemittance | null;
  db: ReturnType<typeof import("@/services/mock-store").getDb>;
  onClose: () => void;
}) {
  const manager = remittance ? db.users.find((user) => user.id === remittance.managerId) : null;
  const branch = remittance ? db.branches.find((item) => item.id === remittance.branchId) : null;
  const confirmedBy = remittance?.confirmedBy
    ? db.users.find((user) => user.id === remittance.confirmedBy)
    : null;
  const declinedBy = remittance?.declinedBy
    ? db.users.find((user) => user.id === remittance.declinedBy)
    : null;
  return (
    <Dialog open={!!remittance} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Manager remittance details</DialogTitle>
          <DialogDescription>
            {remittance?.id} · {remittance ? formatMonth(remittance.period) : ""}
          </DialogDescription>
        </DialogHeader>
        {remittance && (
          <>
            <ManagerRemittanceSummary row={remittance} db={db} />
            <div className="flex items-center justify-between border-y border-border py-3 text-xs">
              <span>Status</span>
              <RemittanceBadge status={remittance.status} />
            </div>
            {remittance.note && (
              <p className="text-xs text-muted-foreground">Note: {remittance.note}</p>
            )}
            {remittance.declineReason && (
              <p className="rounded-md bg-destructive/5 p-3 text-xs">
                <strong className="text-destructive">Decline reason:</strong>{" "}
                {remittance.declineReason}
              </p>
            )}
            <div>
              <h3 className="mb-2 text-sm font-semibold">Remittance timeline</h3>
              <Timeline title="Submitted" by={manager?.name} at={remittance.submittedAt} />
              <Timeline title="Confirmed" by={confirmedBy?.name} at={remittance.confirmedAt} />
              <Timeline title="Declined" by={declinedBy?.name} at={remittance.declinedAt} />
            </div>
            <div className="border-t border-border pt-3">
              <p className="text-xs font-semibold">Source records</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {remittance.paymentIds.length} eligible payment records ·{" "}
                {remittance.expenseIds.length} recorded expenses
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">{branch?.name ?? "Branch"}</p>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Timeline({
  title,
  by,
  at,
}: {
  title: string;
  by?: string | undefined;
  at?: string | undefined;
}) {
  if (!at) return null;
  return (
    <div className="flex gap-3 border-l border-border py-2 pl-3">
      <span className="-ml-[17px] mt-0.5 grid size-7 place-items-center rounded-full border border-border bg-background">
        <Check className="size-3 text-success" />
      </span>
      <div>
        <p className="text-xs font-semibold">{title}</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          {by ?? ""}
          {by ? " · " : ""}
          {formatDate(at)} at {formatTime(at)}
        </p>
      </div>
    </div>
  );
}
