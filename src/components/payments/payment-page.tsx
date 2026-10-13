import { useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Check, CircleDollarSign, ClipboardList, Eye, Landmark, Wallet } from "lucide-react";
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
import type { Db, ManagerRemittance, Payment, PaymentStatus } from "@/data/mock-db";
import { formatDate, formatMonth, formatNaira, formatTime } from "@/lib/format";
import {
  getManagerPaymentSummary,
  getOwnerPaymentSummary,
  getOwnerManagerPaymentSummary,
  getPaymentOutstandingAmount,
  getPaymentTotalSales,
  getPaymentsForScope,
  getRepPaymentSummary,
  getRepTotalSales,
  isValidPaymentPeriod,
  validatePaymentReconciliation,
} from "@/lib/payment-calculations";
import { getManagerRemittances } from "@/lib/remittance-calculations";
import { getAccessScope, useCurrentUserId } from "@/lib/session";
import { getDb, useDb } from "@/services/mock-store";
import { paymentService, remittanceService, type FieldErrors } from "@/services/services";

const tone: Record<PaymentStatus, string> = {
  submitted: "border-warning/40 bg-warning/10 text-warning",
  acknowledged: "border-primary/30 bg-primary/5 text-primary",
  declined: "border-destructive/30 bg-destructive/5 text-destructive",
  reconciled: "border-success/30 bg-success/5 text-success",
};
const statusLabel: Record<PaymentStatus, string> = {
  submitted: "Submitted",
  acknowledged: "Acknowledged",
  declined: "Declined",
  reconciled: "Reconciled",
};
const currentMonth = (dbDate: string) => dbDate.slice(0, 7);
const monthLabel = (period: string) =>
  isValidPaymentPeriod(period)
    ? new Intl.DateTimeFormat("en-NG", { month: "long", year: "numeric", timeZone: "UTC" }).format(
        new Date(`${period}-01T00:00:00Z`),
      )
    : period;
export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  return (
    <Badge variant="outline" className={`whitespace-nowrap font-medium ${tone[status]}`}>
      {statusLabel[status]}
    </Badge>
  );
}

export function PaymentPage() {
  const db = useDb();
  const userId = useCurrentUserId();
  const scope = getAccessScope(db, userId);
  const role = scope.user.role;
  const [period, setPeriod] = useState(currentMonth(db.tenant.referenceDate));
  const [branchFilter, setBranchFilter] = useState("all");
  const [repFilter, setRepFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<"submit" | "acknowledge" | "decline" | "confirm" | null>(
    null,
  );
  const [actionPaymentId, setActionPaymentId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [formErrors, setFormErrors] = useState<FieldErrors>({});
  const [cashInput, setCashInput] = useState("");
  const [transferInput, setTransferInput] = useState("");
  const [referenceInput, setReferenceInput] = useState("");
  const [noteInput, setNoteInput] = useState("");
  const [declineReason, setDeclineReason] = useState("");

  const allCurrent = useMemo(() => getPaymentsForScope(db, scope), [db, scope]);
  const periodPayments = useMemo(
    () => getPaymentsForScope(db, scope, { period }),
    [db, scope, period],
  );
  const selectedPayment = allCurrent.find((payment) => payment.id === selectedId) ?? null;
  const actionPayment = allCurrent.find((payment) => payment.id === actionPaymentId) ?? null;
  const reps = db.users.filter(
    (user) =>
      user.tenantId === scope.user.tenantId &&
      user.role === "sales_rep" &&
      (scope.branchIds === null || (!!user.branchId && scope.branchIds.includes(user.branchId))),
  );
  const branches = db.branches.filter(
    (branch) =>
      branch.tenantId === scope.user.tenantId &&
      (scope.branchIds === null || scope.branchIds.includes(branch.id)),
  );
  const rows = periodPayments.filter(
    (payment) =>
      (branchFilter === "all" || payment.branchId === branchFilter) &&
      (repFilter === "all" || payment.salesRepId === repFilter) &&
      (statusFilter === "all" || payment.status === statusFilter),
  );
  const openDialog = (kind: typeof dialog, payment?: Payment) => {
    setActionPaymentId(payment?.id ?? null);
    setFormErrors({});
    setDeclineReason("");
    if (kind === "submit") {
      const previous = periodPayments.find(
        (item) => item.period === period && item.status === "declined",
      );
      setCashInput(previous?.cashAmount ? String(previous.cashAmount) : "");
      setTransferInput(previous?.transferAmount ? String(previous.transferAmount) : "");
      setReferenceInput(previous?.transferReference ?? "");
      setNoteInput(previous?.note ?? "");
    }
    setDialog(kind);
  };

  const numericCash = cashInput === "" ? 0 : Number(cashInput);
  const numericTransfer = transferInput === "" ? 0 : Number(transferInput);
  const salesTotal = role === "sales_rep" ? getRepTotalSales(db, userId, period) : 0;
  const repPosition =
    role === "sales_rep"
      ? getRepPaymentSummary(db, userId, period)
      : { cash: 0, transfer: 0, totalSales: 0, outstanding: 0 };
  const remainingBeforeSubmission = Math.max(
    salesTotal - repPosition.cash - repPosition.transfer,
    0,
  );
  const outstanding = remainingBeforeSubmission - numericCash - numericTransfer;
  const validation = validatePaymentReconciliation(remainingBeforeSubmission, {
    cashAmount: numericCash,
    transferAmount: numericTransfer,
  });

  const submit = async () => {
    setBusy(true);
    const result = await paymentService.submit(
      {
        period,
        cashAmount: numericCash,
        transferAmount: numericTransfer,
        transferReference: referenceInput,
        note: noteInput,
      },
      userId,
    );
    setBusy(false);
    if (!result.ok) {
      setFormErrors(result.errors);
      return;
    }
    toast.success("Payment submitted for manager acknowledgement");
    setDialog(null);
  };
  const review = async (kind: "acknowledge" | "decline" | "confirm") => {
    if (!actionPayment) return;
    setBusy(true);
    const result =
      kind === "acknowledge"
        ? await paymentService.acknowledge(actionPayment.id, userId)
        : kind === "confirm"
          ? await paymentService.confirm(actionPayment.id, userId)
          : await paymentService.decline(actionPayment.id, declineReason, userId);
    setBusy(false);
    if (!result.ok) {
      setFormErrors(result.errors);
      return;
    }
    toast.success(
      kind === "acknowledge"
        ? "Payment acknowledged"
        : kind === "confirm"
          ? "Payment reconciled"
          : "Payment declined",
    );
    setDialog(null);
  };

  if (role === "sales_rep") {
    const latest = periodPayments[0];
    const repOutstanding = repPosition.outstanding;
    const totalAccounted = repPosition.cash + repPosition.transfer + repOutstanding;
    const currentBalance = validatePaymentReconciliation(salesTotal, {
      cashAmount: repPosition.cash,
      transferAmount: repPosition.transfer,
    });
    return (
      <AppShell title="Payment" subtitle="Submit and track your sales payment reconciliation">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-xl font-bold">Payment</h1>
            <p className="mt-1 text-xs text-muted-foreground">
              Reconcile completed sales for a month.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Label htmlFor="rep-payment-period" className="text-xs text-muted-foreground">
              Period
            </Label>
            <Input
              id="rep-payment-period"
              type="month"
              max={currentMonth(db.tenant.referenceDate)}
              value={period}
              onChange={(event) => setPeriod(event.target.value)}
              className="w-full sm:w-48"
            />
            <Button
              className="w-full sm:w-auto"
              disabled={!isValidPaymentPeriod(period)}
              onClick={() => openDialog("submit")}
            >
              Submit Payment
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            icon={CircleDollarSign}
            tone="brand"
            label="Total Sales"
            value={formatNaira(latest ? getPaymentTotalSales(db, latest) : salesTotal)}
            detail={monthLabel(period)}
          />
          <MetricCard
            icon={Wallet}
            tone="success"
            label="Cash"
            value={formatNaira(repPosition.cash)}
          />
          <MetricCard
            icon={Landmark}
            tone="violet"
            label="Transfer"
            value={formatNaira(repPosition.transfer)}
          />
          <MetricCard
            icon={ClipboardList}
            tone="warning"
            label="Outstanding"
            value={formatNaira(repOutstanding)}
          />
        </div>
        <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(260px,0.55fr)]">
          <Panel title="Reconciliation" subtitle={`${monthLabel(period)} · completed sales only`}>
            <dl className="divide-y divide-border px-5 text-sm">
              {[
                ["Total Sales", latest ? getPaymentTotalSales(db, latest) : salesTotal],
                ["Cash", repPosition.cash],
                ["Transfer", repPosition.transfer],
                ["Outstanding", repOutstanding],
                ["Total Accounted", totalAccounted],
              ].map(([label, amount]) => (
                <div key={String(label)} className="flex items-center justify-between gap-4 py-3">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="font-semibold tabular-nums">{formatNaira(Number(amount))}</dd>
                </div>
              ))}
            </dl>
            <div className="flex items-center justify-between gap-3 border-t border-border bg-muted/30 px-5 py-4 text-xs">
              <span>Reconciliation status</span>
              <span
                className={`font-semibold ${currentBalance.balanced ? "text-success" : "text-destructive"}`}
              >
                {currentBalance.balanced ? "Balanced" : "Not balanced"}
              </span>
            </div>
          </Panel>
          <Panel title="Payment status" subtitle="Your latest submission for this period">
            {latest ? (
              <div className="space-y-3 p-5">
                <PaymentStatusBadge status={latest.status} />
                <p className="text-xs leading-5 text-muted-foreground">
                  {latest.status === "submitted"
                    ? "Pending Manager Acknowledgement"
                    : latest.status === "acknowledged"
                      ? "Acknowledged by Manager. Awaiting Owner confirmation."
                      : latest.status === "reconciled"
                        ? "Owner confirmed this payment. Reconciliation is complete."
                        : "This payment was declined. Review the reason and submit again."}
                </p>
                {latest.declineReason && (
                  <div className="rounded-md border border-destructive/20 bg-destructive/5 p-3">
                    <p className="text-[11px] font-semibold text-destructive">Decline reason</p>
                    <p className="mt-1 text-xs">{latest.declineReason}</p>
                  </div>
                )}
                <p className="text-[11px] text-muted-foreground">
                  Submitted {formatDate(latest.submittedAt)} at {formatTime(latest.submittedAt)}
                </p>
              </div>
            ) : (
              <EmptyState
                title="No payment submissions yet."
                detail="Choose a month and submit a reconciliation when you are ready."
              />
            )}
          </Panel>
        </div>
        <PaymentTable
          historyLabel="Payment History"
          rows={periodPayments}
          db={db}
          scope={scope}
          onView={(payment) => setSelectedId(payment.id)}
        />
        <Dialog
          open={dialog === "submit"}
          onOpenChange={(open) => !open && !busy && setDialog(null)}
        >
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Submit Payment</DialogTitle>
              <DialogDescription>
                Enter the amounts collected from your completed sales.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Period">
                <Input
                  type="month"
                  max={currentMonth(db.tenant.referenceDate)}
                  value={period}
                  onChange={(event) => setPeriod(event.target.value)}
                  aria-label="Payment period"
                />
                {formErrors.period && <FieldError message={formErrors.period} />}
              </Field>
              <Field label="Remaining Sales Balance">
                <Input
                  value={formatNaira(remainingBeforeSubmission)}
                  readOnly
                  aria-label="Remaining sales balance"
                />
              </Field>
              <Field label="Cash Amount">
                <Input
                  type="number"
                  min="0"
                  inputMode="decimal"
                  value={cashInput}
                  onChange={(event) => setCashInput(event.target.value)}
                  aria-label="Cash amount"
                />
                {formErrors.cashAmount && <FieldError message={formErrors.cashAmount} />}
              </Field>
              <Field label="Transfer Amount">
                <Input
                  type="number"
                  min="0"
                  inputMode="decimal"
                  value={transferInput}
                  onChange={(event) => setTransferInput(event.target.value)}
                  aria-label="Transfer amount"
                />
                {formErrors.transferAmount && <FieldError message={formErrors.transferAmount} />}
              </Field>
              <Field label="Outstanding (calculated)">
                <Input
                  value={formatNaira(outstanding)}
                  readOnly
                  aria-label="Calculated outstanding amount"
                />
              </Field>
              <Field label="Transfer Reference">
                <Input
                  value={referenceInput}
                  onChange={(event) => setReferenceInput(event.target.value)}
                  aria-label="Transfer reference"
                />
                {formErrors.transferReference && (
                  <FieldError message={formErrors.transferReference} />
                )}
              </Field>
              <Field label="Note" className="sm:col-span-2">
                <Textarea
                  value={noteInput}
                  onChange={(event) => setNoteInput(event.target.value)}
                  aria-label="Payment note"
                />
              </Field>
            </div>
            <div className="rounded-md border border-border bg-muted/30 px-3 py-3 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>Cash + Transfer + Outstanding</span>
                <span className="font-semibold tabular-nums">
                  {formatNaira(numericCash)} + {formatNaira(numericTransfer)} +{" "}
                  {formatNaira(outstanding)} = {formatNaira(remainingBeforeSubmission)}
                </span>
              </div>
              <p
                className={`mt-2 font-semibold ${validation.balanced ? "text-success" : "text-destructive"}`}
              >
                {validation.balanced
                  ? "Balanced"
                  : `Not balanced · Remaining amount ${formatNaira(Math.max(remainingBeforeSubmission - numericCash - numericTransfer, 0))}`}
              </p>
            </div>
            {formErrors.form && <FieldError message={formErrors.form} />}
            <DialogFooter className="flex-col-reverse sm:flex-row">
              <Button
                variant="outline"
                className="min-h-11 w-full sm:w-auto"
                disabled={busy}
                onClick={() => setDialog(null)}
              >
                Cancel
              </Button>
              <Button
                className="min-h-11 w-full sm:w-auto"
                disabled={busy || !validation.balanced}
                onClick={submit}
              >
                {busy ? "Submitting…" : "Submit Payment"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <PaymentDetails payment={selectedPayment} db={db} onClose={() => setSelectedId(null)} />
      </AppShell>
    );
  }

  if (role === "owner") {
    return (
      <OwnerManagerPaymentPage db={db} scope={scope} period={period} onPeriodChange={setPeriod} />
    );
  }

  const manager = role === "manager";
  const summaryRows = getPaymentsForScope(db, scope, { period });
  const managerSummary = getManagerPaymentSummary(db, summaryRows, userId, period);
  const ownerSummary = getOwnerPaymentSummary(db, summaryRows);
  const pageTitle = manager ? "Team Payments" : "Payments";
  const pageSubtitle = manager
    ? "Review payment submissions from your branch."
    : "Review and confirm branch payment reconciliations.";
  return (
    <AppShell title={pageTitle} subtitle={pageSubtitle}>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-bold">{pageTitle}</h1>
          <p className="mt-1 text-xs text-muted-foreground">{pageSubtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Label htmlFor="review-payment-period" className="text-xs text-muted-foreground">
            Period
          </Label>
          <Input
            id="review-payment-period"
            type="month"
            max={currentMonth(db.tenant.referenceDate)}
            value={period}
            onChange={(event) => setPeriod(event.target.value)}
            className="w-44"
          />
        </div>
      </div>
      {manager ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            icon={Wallet}
            tone="success"
            label="Cash Payment"
            value={formatNaira(managerSummary.cashPayment)}
            detail={monthLabel(period)}
          />
          <MetricCard
            icon={Landmark}
            tone="violet"
            label="Transfer Payment"
            value={formatNaira(managerSummary.transferPayment)}
          />
          <MetricCard
            icon={Landmark}
            tone="warning"
            label="Outstanding"
            value={formatNaira(managerSummary.outstanding)}
          />
          <MetricCard
            icon={ClipboardList}
            tone="brand"
            label="Percentage Progress"
            value={`${Math.floor(managerSummary.collectionRate)}%`}
            detail="Cash + transfer ÷ total sales"
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            icon={Wallet}
            tone="success"
            label="Total Cash"
            value={formatNaira(ownerSummary.cash)}
          />
          <MetricCard
            icon={Landmark}
            tone="violet"
            label="Total Transfer"
            value={formatNaira(ownerSummary.transfer)}
          />
          <MetricCard
            icon={CircleDollarSign}
            tone="warning"
            label="Total Outstanding"
            value={formatNaira(ownerSummary.outstanding)}
          />
          <MetricCard
            icon={ClipboardList}
            tone="brand"
            label="Pending Owner Confirmation"
            value={String(ownerSummary.pendingConfirmation)}
            detail={`${ownerSummary.reconciled} reconciled · ${ownerSummary.declined} declined`}
          />
        </div>
      )}
      <Panel
        title="Payment submissions"
        subtitle={
          manager
            ? "Manager acknowledgement is not final reconciliation."
            : `${ownerSummary.submitted} submitted · ${ownerSummary.acknowledged} acknowledged · ${ownerSummary.declined} declined`
        }
        className="mt-5"
        action={
          <div className="flex flex-wrap gap-2">
            <FilterSelect
              label="Branch"
              value={branchFilter}
              onChange={setBranchFilter}
              options={[
                { value: "all", label: "All branches" },
                ...branches.map((branch) => ({ value: branch.id, label: branch.name })),
              ]}
              className="w-36"
            />
            <FilterSelect
              label="Sales representative"
              value={repFilter}
              onChange={setRepFilter}
              options={[
                { value: "all", label: "All representatives" },
                ...reps.map((rep) => ({ value: rep.id, label: rep.name })),
              ]}
              className="w-44"
            />
            <FilterSelect
              label="Payment status"
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: "all", label: "All statuses" },
                ...Object.entries(statusLabel).map(([value, label]) => ({ value, label })),
              ]}
              className="w-36"
            />
          </div>
        }
      >
        <PaymentTable
          historyLabel="Payment submissions"
          rows={rows}
          db={db}
          scope={scope}
          onView={(payment) => setSelectedId(payment.id)}
          onAcknowledge={(payment) => openDialog("acknowledge", payment)}
          onDecline={(payment) => openDialog("decline", payment)}
          onConfirm={(payment) => openDialog("confirm", payment)}
        />
      </Panel>
      <Dialog
        open={!!dialog && dialog !== "submit"}
        onOpenChange={(open) => !open && !busy && setDialog(null)}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {dialog === "acknowledge"
                ? "Acknowledge Payment?"
                : dialog === "confirm"
                  ? "Confirm Payment?"
                  : "Decline Payment"}
            </DialogTitle>
            <DialogDescription>
              {dialog === "acknowledge"
                ? "Confirm receipt of this sales representative’s payment report."
                : dialog === "confirm"
                  ? "Confirm the manager-reviewed payment and complete reconciliation."
                  : "Enter a reason so the sales representative can correct the submission."}
            </DialogDescription>
          </DialogHeader>
          {actionPayment && (
            <PaymentSummary payment={actionPayment} db={db} includePeople={!manager} />
          )}
          {dialog === "decline" && (
            <Field label="Decline reason">
              <Textarea
                value={declineReason}
                onChange={(event) => setDeclineReason(event.target.value)}
                aria-label="Decline reason"
                aria-invalid={!!formErrors.reason}
              />
              {formErrors.reason && <FieldError message={formErrors.reason} />}
            </Field>
          )}
          {formErrors.form && <FieldError message={formErrors.form} />}
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button
              variant={dialog === "decline" ? "outline" : "default"}
              className={
                dialog === "decline"
                  ? "border-destructive/40 text-destructive hover:bg-destructive/5"
                  : undefined
              }
              disabled={busy || (dialog === "decline" && !declineReason.trim())}
              onClick={() => dialog && dialog !== "submit" && review(dialog)}
            >
              {busy
                ? "Saving…"
                : dialog === "acknowledge"
                  ? "Acknowledge Payment"
                  : dialog === "confirm"
                    ? "Confirm Payment"
                    : "Decline Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <PaymentDetails payment={selectedPayment} db={db} onClose={() => setSelectedId(null)} />
    </AppShell>
  );
}

function Field({
  label,
  className = "",
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={className}>
      <Label className="text-xs">{label}</Label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function PaymentTable({
  rows,
  db,
  scope,
  historyLabel,
  onView,
  onAcknowledge,
  onDecline,
  onConfirm,
}: {
  rows: Payment[];
  db: ReturnType<typeof getDb>;
  scope: ReturnType<typeof getAccessScope>;
  historyLabel?: string;
  onView: (payment: Payment) => void;
  onAcknowledge?: ((payment: Payment) => void) | undefined;
  onDecline?: ((payment: Payment) => void) | undefined;
  onConfirm?: ((payment: Payment) => void) | undefined;
}) {
  const manager = scope.user.role === "manager";
  const owner = scope.user.role === "owner";
  const content = (
    <div className="overflow-x-auto">
      <table className="hidden w-full min-w-[1050px] text-left md:table">
        <thead>
          <tr className="text-[10px] uppercase text-muted-foreground">
            {[
              "Sales Rep",
              "Branch",
              "Period",
              "Total Sales",
              "Cash",
              "Transfer",
              "Outstanding",
              "Status",
              "Submitted date / time",
              "Transfer reference",
              "Manager acknowledgement",
              "Owner confirmation",
              "Actions",
            ].map((heading) => (
              <th key={heading} className="px-4 py-3">
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((payment) => (
            <PaymentRow
              key={payment.id}
              payment={payment}
              db={db}
              onView={onView}
              manager={manager}
              owner={owner}
              onAcknowledge={onAcknowledge}
              onDecline={onDecline}
              onConfirm={onConfirm}
            />
          ))}
        </tbody>
      </table>
      <div className="divide-y divide-border md:hidden">
        {rows.map((payment) => {
          const rep =
            db.users.find((user) => user.id === payment.salesRepId)?.name ?? "Sales representative";
          const branch = db.branches.find((item) => item.id === payment.branchId)?.name ?? "Branch";
          return (
            <article key={payment.id} className="space-y-3 p-4">
              <button
                className="flex w-full items-start justify-between gap-3 text-left"
                onClick={() => onView(payment)}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{rep}</p>
                  <p className="mt-1 truncate text-[11px] text-muted-foreground">
                    {branch} · {monthLabel(payment.period)}
                  </p>
                </div>
                <PaymentStatusBadge status={payment.status} />
              </button>
              <p className="text-[11px] text-muted-foreground">
                Submitted {formatDate(payment.submittedAt)} at {formatTime(payment.submittedAt)}
                {payment.transferReference ? " · Transfer ref " + payment.transferReference : ""}
              </p>
              <p className="text-[11px] text-muted-foreground">
                Manager:{" "}
                {payment.acknowledgedAt
                  ? "Acknowledged " +
                    formatDate(payment.acknowledgedAt) +
                    " " +
                    formatTime(payment.acknowledgedAt)
                  : payment.status === "submitted"
                    ? "Pending"
                    : payment.status === "declined"
                      ? "Declined"
                      : "—"}{" "}
                · Owner:{" "}
                {payment.confirmedAt
                  ? "Confirmed " +
                    formatDate(payment.confirmedAt) +
                    " " +
                    formatTime(payment.confirmedAt)
                  : payment.status === "acknowledged"
                    ? "Pending"
                    : "—"}
              </p>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                {[
                  ["Total Sales", getPaymentTotalSales(db, payment)],
                  ["Cash", payment.cashAmount],
                  ["Transfer", payment.transferAmount],
                  ["Outstanding", getPaymentOutstandingAmount(db, payment)],
                ].map(([label, amount]) => (
                  <div key={String(label)}>
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="mt-0.5 font-semibold">{formatNaira(Number(amount))}</dd>
                  </div>
                ))}
              </dl>
              <PaymentActions
                payment={payment}
                manager={manager}
                owner={owner}
                onView={onView}
                onAcknowledge={onAcknowledge}
                onDecline={onDecline}
                onConfirm={onConfirm}
              />
            </article>
          );
        })}
      </div>
      {!rows.length && (
        <EmptyState
          title={
            scope.user.role === "sales_rep"
              ? "No payment submissions yet."
              : manager
                ? "No payment submissions require your attention."
                : "No payments are awaiting confirmation."
          }
          {...(scope.user.role === "owner"
            ? { detail: "Manager-acknowledged payments will appear here for final review." }
            : {})}
        />
      )}
    </div>
  );
  return scope.user.role === "sales_rep" ? (
    <Panel
      className="mt-5 overflow-hidden"
      title={historyLabel ?? "Payment submissions"}
      subtitle={`${rows.length} records · newest first`}
    >
      {content}
    </Panel>
  ) : (
    content
  );
}

function PaymentRow({
  payment,
  db,
  manager,
  owner,
  onView,
  onAcknowledge,
  onDecline,
  onConfirm,
}: {
  payment: Payment;
  db: ReturnType<typeof getDb>;
  manager: boolean;
  owner: boolean;
  onView: (payment: Payment) => void;
  onAcknowledge?: ((payment: Payment) => void) | undefined;
  onDecline?: ((payment: Payment) => void) | undefined;
  onConfirm?: ((payment: Payment) => void) | undefined;
}) {
  const rep =
    db.users.find((user) => user.id === payment.salesRepId)?.name ?? "Sales representative";
  const branch = db.branches.find((item) => item.id === payment.branchId)?.name ?? "Branch";
  return (
    <tr className="border-t border-border text-xs hover:bg-muted/30">
      <td className="px-4 py-3 font-semibold">{rep}</td>
      <td className="px-4 py-3">{branch}</td>
      <td className="px-4 py-3">{monthLabel(payment.period)}</td>
      <td className="px-4 py-3 font-semibold">{formatNaira(getPaymentTotalSales(db, payment))}</td>
      <td className="px-4 py-3">{formatNaira(payment.cashAmount)}</td>
      <td className="px-4 py-3">{formatNaira(payment.transferAmount)}</td>
      <td className="px-4 py-3">{formatNaira(getPaymentOutstandingAmount(db, payment))}</td>
      <td className="px-4 py-3">
        <PaymentStatusBadge status={payment.status} />
      </td>
      <td className="px-4 py-3 text-muted-foreground">
        {formatDate(payment.submittedAt)} {formatTime(payment.submittedAt)}
      </td>
      <td className="px-4 py-3 text-muted-foreground">{payment.transferReference ?? "—"}</td>
      <td className="px-4 py-3">
        {payment.acknowledgedAt
          ? `Acknowledged · ${formatDate(payment.acknowledgedAt)} ${formatTime(payment.acknowledgedAt)}`
          : payment.status === "submitted"
            ? "Pending"
            : payment.status === "declined"
              ? "Declined"
              : "—"}
      </td>
      <td className="px-4 py-3">
        {payment.confirmedAt
          ? `Confirmed · ${formatDate(payment.confirmedAt)} ${formatTime(payment.confirmedAt)}`
          : payment.status === "acknowledged"
            ? "Pending"
            : "—"}
      </td>
      <td className="px-4 py-2">
        <PaymentActions
          payment={payment}
          manager={manager}
          owner={owner}
          onView={onView}
          onAcknowledge={onAcknowledge}
          onDecline={onDecline}
          onConfirm={onConfirm}
        />
      </td>
    </tr>
  );
}

function PaymentActions({
  payment,
  manager,
  owner,
  onView,
  onAcknowledge,
  onDecline,
  onConfirm,
}: {
  payment: Payment;
  manager: boolean;
  owner: boolean;
  onView: (payment: Payment) => void;
  onAcknowledge?: ((payment: Payment) => void) | undefined;
  onDecline?: ((payment: Payment) => void) | undefined;
  onConfirm?: ((payment: Payment) => void) | undefined;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {manager && payment.status === "submitted" && (
        <>
          <Button size="sm" className="h-8" onClick={() => onAcknowledge?.(payment)}>
            Acknowledge
          </Button>
          <Button size="sm" variant="outline" className="h-8" onClick={() => onDecline?.(payment)}>
            Decline
          </Button>
        </>
      )}
      {owner && payment.status === "acknowledged" && (
        <>
          <Button size="sm" className="h-8" onClick={() => onConfirm?.(payment)}>
            Confirm
          </Button>
          <Button size="sm" variant="outline" className="h-8" onClick={() => onDecline?.(payment)}>
            Decline
          </Button>
        </>
      )}
      <Button
        size="icon"
        variant="ghost"
        className="size-8"
        onClick={() => onView(payment)}
        aria-label={`View payment ${payment.id}`}
      >
        <Eye className="size-4" />
      </Button>
    </div>
  );
}

function PaymentSummary({
  payment,
  db,
  includePeople,
}: {
  payment: Payment;
  db: ReturnType<typeof getDb>;
  includePeople: boolean;
}) {
  const rep = db.users.find((user) => user.id === payment.salesRepId);
  const manager = db.users.find((user) => user.id === payment.managerId);
  const branch = db.branches.find((item) => item.id === payment.branchId);
  const totalSales = getPaymentTotalSales(db, payment);
  const outstanding = getPaymentOutstandingAmount(db, payment);
  const lines: [string, string][] = [
    ["Payment ID", payment.id],
    ["Period", monthLabel(payment.period)],
    ...(includePeople
      ? ([
          ["Sales Representative", rep?.name ?? "—"],
          ["Manager", manager?.name ?? "—"],
          ["Branch", branch?.name ?? "—"],
        ] as [string, string][])
      : ([
          ["Sales Representative", rep?.name ?? "—"],
          ["Branch", branch?.name ?? "—"],
        ] as [string, string][])),
    ["Total Sales", formatNaira(totalSales)],
    ["Cash", formatNaira(payment.cashAmount)],
    ["Transfer", formatNaira(payment.transferAmount)],
    ["Outstanding", formatNaira(outstanding)],
  ];
  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-md border border-border bg-muted/20 p-4 sm:grid-cols-3">
        {lines.map(([label, value]) => (
          <div key={label}>
            <dt className="text-[10px] text-muted-foreground">{label}</dt>
            <dd className="mt-1 truncate text-xs font-semibold">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="rounded-md bg-muted/30 p-3 text-xs">
        Cash + Transfer + Outstanding = {formatNaira(payment.cashAmount)} +{" "}
        {formatNaira(payment.transferAmount)} + {formatNaira(outstanding)} ={" "}
        <strong>{formatNaira(totalSales)}</strong>
      </p>
    </div>
  );
}

function PaymentDetails({
  payment,
  db,
  onClose,
}: {
  payment: Payment | null;
  db: ReturnType<typeof getDb>;
  onClose: () => void;
}) {
  const rep = payment ? db.users.find((user) => user.id === payment.salesRepId) : null;
  const manager = payment ? db.users.find((user) => user.id === payment.managerId) : null;
  const owner = payment?.confirmedBy
    ? db.users.find((user) => user.id === payment.confirmedBy)
    : null;
  const total = payment ? getPaymentTotalSales(db, payment) : 0;
  const outstanding = payment ? getPaymentOutstandingAmount(db, payment) : 0;
  return (
    <Dialog open={!!payment} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Payment details</DialogTitle>
          <DialogDescription>
            {payment?.id} · {payment ? monthLabel(payment.period) : ""}
          </DialogDescription>
        </DialogHeader>
        {payment && (
          <>
            <PaymentSummary payment={payment} db={db} includePeople />
            <div className="rounded-md border border-border p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold">Status</h3>
                <PaymentStatusBadge status={payment.status} />
              </div>
              <p className="text-xs text-muted-foreground">
                {formatNaira(payment.cashAmount)} cash + {formatNaira(payment.transferAmount)}{" "}
                transfer + {formatNaira(outstanding)} outstanding = {formatNaira(total)}
              </p>
              {payment.transferReference && (
                <p className="mt-2 text-xs">
                  Transfer reference:{" "}
                  <span className="font-medium">{payment.transferReference}</span>
                </p>
              )}
              {payment.note && (
                <p className="mt-2 text-xs text-muted-foreground">Note: {payment.note}</p>
              )}
              {payment.declineReason && (
                <p className="mt-3 rounded bg-destructive/5 p-3 text-xs">
                  <strong className="text-destructive">Decline reason:</strong>{" "}
                  {payment.declineReason}
                </p>
              )}
            </div>
            <div className="space-y-0.5">
              <h3 className="mb-2 text-sm font-semibold">Payment timeline</h3>
              <TimelineRow
                title="Submitted"
                by={rep?.name ?? "Sales representative"}
                at={payment.submittedAt}
              />
              <TimelineRow
                title="Acknowledged"
                by={payment.acknowledgedBy ? (manager?.name ?? "Manager") : undefined}
                at={payment.acknowledgedAt}
              />
              <TimelineRow
                title={payment.status === "declined" ? "Declined" : "Reconciled"}
                by={
                  payment.status === "declined"
                    ? payment.declinedBy
                      ? db.users.find((user) => user.id === payment.declinedBy)?.name
                      : undefined
                    : owner?.name
                }
                at={payment.status === "declined" ? payment.declinedAt : payment.confirmedAt}
              />
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function TimelineRow({
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
      <span className="-ml-[17px] mt-0.5 grid size-7 shrink-0 place-items-center rounded-full border border-border bg-background">
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

function OwnerManagerPaymentPage({
  db,
  scope,
  period,
  onPeriodChange,
}: {
  db: Db;
  scope: ReturnType<typeof getAccessScope>;
  period: string;
  onPeriodChange: (value: string) => void;
}) {
  const [branchId, setBranchId] = useState("all");
  const [status, setStatus] = useState("all");
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [declineReason, setDeclineReason] = useState("");
  const allRows = useMemo(() => getManagerRemittances(db, scope, { period }), [db, scope, period]);
  const reviewRow = allRows.find((row) => row.id === reviewId) ?? null;
  const summary = getOwnerManagerPaymentSummary(allRows);
  const rows = allRows.filter(
    (row) =>
      (branchId === "all" || row.branchId === branchId) &&
      (status === "all" || row.status === status),
  );
  const branches = db.branches.filter((branch) => branch.tenantId === scope.user.tenantId);

  const openReview = (row: ManagerRemittance) => {
    setReviewId(row.id);
    setErrors({});
    setDeclineReason("");
  };
  const reviewRemittance = async (action: "confirm" | "decline") => {
    if (!reviewRow) return;
    setBusy(true);
    const result =
      action === "confirm"
        ? await remittanceService.confirm(reviewRow.id, scope.user.id)
        : await remittanceService.decline(reviewRow.id, declineReason, scope.user.id);
    setBusy(false);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    toast.success(action === "confirm" ? "Remittance confirmed" : "Remittance declined");
    setReviewId(null);
  };

  return (
    <AppShell
      title="Payment"
      subtitle="Review payments remitted from Managers to the Owner."
    >
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-bold">Payment</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Incoming Manager → Owner remittances for {monthLabel(period)}.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Label
            htmlFor="owner-manager-payment-period"
            className="self-center text-xs text-muted-foreground"
          >
            Period
          </Label>
          <Input
            id="owner-manager-payment-period"
            type="month"
            max={currentMonth(db.tenant.referenceDate)}
            value={period}
            onChange={(event) => onPeriodChange(event.target.value)}
            className="w-full sm:w-44"
          />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          icon={Wallet}
          tone="success"
          label="Total Cash"
          value={formatNaira(summary.cash)}
          detail={monthLabel(period)}
        />
        <MetricCard
          icon={Landmark}
          tone="violet"
          label="Total Transfer"
          value={formatNaira(summary.transfer)}
        />
        <MetricCard
          icon={Landmark}
          tone="warning"
          label="Total Outstanding"
          value={formatNaira(summary.outstanding)}
        />
        <MetricCard
          icon={ClipboardList}
          tone="brand"
          label="Pending Owner Confirmation"
          value={String(summary.submitted)}
          detail={`${summary.confirmed} confirmed · ${summary.declined} declined`}
        />
        <MetricCard
          icon={CircleDollarSign}
          tone="success"
          label="Total Payment"
          value={formatNaira(summary.total)}
          detail="Cash + transfer"
        />
      </div>
      <Panel
        title="Manager payments"
        subtitle={`${rows.length} records · submitted, confirmed, and declined Manager remittances`}
        className="mt-5 overflow-hidden"
        action={
          <div className="flex flex-wrap gap-2">
            <FilterSelect
              label="Branch"
              value={branchId}
              onChange={setBranchId}
              options={[
                { value: "all", label: "All branches" },
                ...branches.map((branch) => ({ value: branch.id, label: branch.name })),
              ]}
              className="w-36"
            />
            <FilterSelect
              label="Status"
              value={status}
              onChange={setStatus}
              options={[
                { value: "all", label: "All statuses" },
                { value: "submitted", label: "Submitted" },
                { value: "confirmed", label: "Confirmed" },
                { value: "declined", label: "Declined" },
              ]}
              className="w-36"
            />
          </div>
        }
      >
        <OwnerManagerPaymentTable rows={rows} db={db} onReview={openReview} />
      </Panel>
      <Dialog
        open={!!reviewRow}
        onOpenChange={(open) => {
          if (!open && !busy) setReviewId(null);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Review Manager payment</DialogTitle>
            <DialogDescription>
              {reviewRow?.id} · {reviewRow ? formatMonth(reviewRow.period) : ""}
            </DialogDescription>
          </DialogHeader>
          {reviewRow && (
            <>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-md border border-border bg-muted/20 p-4 text-xs sm:grid-cols-3">
                {[
                  ["Manager", db.users.find((user) => user.id === reviewRow.managerId)?.name ?? "Manager"],
                  ["Branch", db.branches.find((branch) => branch.id === reviewRow.branchId)?.name ?? "Branch"],
                  ["Period", formatMonth(reviewRow.period)],
                  ["Total Received", formatNaira(reviewRow.totalReceived)],
                  ["Expenses", formatNaira(reviewRow.expenseAmount)],
                  ["Net Remittance", formatNaira(reviewRow.netRemittanceDue)],
                  ["Cash", formatNaira(reviewRow.cashAmount)],
                  ["Transfer", formatNaira(reviewRow.transferAmount)],
                  ["Outstanding", formatNaira(reviewRow.outstandingAmount)],
                  ["Payment Date", formatDate(reviewRow.submittedAt ?? reviewRow.createdAt)],
                  ["Status", reviewRow.status],
                ].map(([label, value]) => (
                  <div key={label} className="min-w-0">
                    <dt className="text-[10px] text-muted-foreground">{label}</dt>
                    <dd className="mt-1 truncate font-semibold">{value}</dd>
                  </div>
                ))}
              </dl>
              {reviewRow.transferReference && (
                <p className="text-xs text-muted-foreground">
                  Transfer reference: <span className="font-medium text-foreground">{reviewRow.transferReference}</span>
                </p>
              )}
              {reviewRow.note && <p className="text-xs text-muted-foreground">Note: {reviewRow.note}</p>}
              {reviewRow.declineReason && (
                <p className="rounded-md bg-destructive/5 p-3 text-xs">
                  <strong className="text-destructive">Decline reason:</strong> {reviewRow.declineReason}
                </p>
              )}
              {reviewRow.status === "submitted" && (
                <div>
                  <Label htmlFor="owner-payment-decline-reason" className="text-xs">Decline reason</Label>
                  <Textarea
                    id="owner-payment-decline-reason"
                    className="mt-1.5"
                    value={declineReason}
                    onChange={(event) => {
                      setDeclineReason(event.target.value);
                      setErrors({});
                    }}
                    aria-label="Decline reason"
                  />
                  {errors.reason && <FieldError message={errors.reason} />}
                </div>
              )}
              {errors.form && <FieldError message={errors.form} />}
            </>
          )}
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setReviewId(null)}>
              Close
            </Button>
            {reviewRow?.status === "submitted" && (
              <>
                <Button
                  variant="outline"
                  className="border-destructive/40 text-destructive"
                  disabled={busy || !declineReason.trim()}
                  onClick={() => reviewRemittance("decline")}
                >
                  Decline
                </Button>
                <Button disabled={busy} onClick={() => reviewRemittance("confirm")}>
                  {busy ? "Saving…" : "Accept"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function OwnerManagerPaymentTable({
  rows,
  db,
  onReview,
}: {
  rows: ManagerRemittance[];
  db: Db;
  onReview: (row: ManagerRemittance) => void;
}) {
  const statusStyle: Record<ManagerRemittance["status"], string> = {
    draft: "border-muted-foreground/30 bg-muted text-muted-foreground",
    submitted: "border-warning/40 bg-warning/10 text-warning",
    confirmed: "border-success/30 bg-success/5 text-success",
    declined: "border-destructive/30 bg-destructive/5 text-destructive",
  };
  const content = (
    <>
      <div className="hidden max-w-full min-w-0 overflow-x-auto md:block">
        <table className="w-full min-w-[1050px] text-left">
          <thead>
            <tr className="text-[10px] uppercase text-muted-foreground">
              {[
                "Manager",
                "Branch",
                "Amount",
                "Cash",
                "Transfer",
                "Outstanding",
                "Payment Date",
                "Status",
                "Reference",
                "Actions",
              ].map((heading) => (
                <th key={heading} className="px-4 py-3">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const manager = db.users.find((user) => user.id === row.managerId);
              const branch = db.branches.find((item) => item.id === row.branchId);
              const amount = row.cashAmount + row.transferAmount;
              return (
                <tr key={row.id} className="border-t border-border text-xs hover:bg-muted/30">
                  <td className="px-4 py-3 font-semibold">{manager?.name ?? "Manager"}</td>
                  <td className="px-4 py-3">{branch?.name ?? "Branch"}</td>
                  <td className="px-4 py-3 font-semibold">{formatNaira(amount)}</td>
                  <td className="px-4 py-3">{formatNaira(row.cashAmount)}</td>
                  <td className="px-4 py-3">{formatNaira(row.transferAmount)}</td>
                  <td className="px-4 py-3">{formatNaira(row.outstandingAmount)}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {formatDate(row.submittedAt ?? row.createdAt)}{" "}
                    {formatTime(row.submittedAt ?? row.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="outline" className={`capitalize ${statusStyle[row.status]}`}>
                      {row.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {row.transferReference ?? "—"}
                  </td>
                  <td className="px-4 py-2">
                    <Button size="sm" variant="outline" className="h-8" onClick={() => onReview(row)}>
                      Review
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="divide-y divide-border md:hidden">
        {rows.map((row) => {
          const manager = db.users.find((user) => user.id === row.managerId);
          const branch = db.branches.find((item) => item.id === row.branchId);
          return (
            <article key={row.id} className="space-y-3 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">{manager?.name ?? "Manager"}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {branch?.name ?? "Branch"} · {formatDate(row.submittedAt ?? row.createdAt)}
                  </p>
                </div>
                <Badge variant="outline" className={`capitalize ${statusStyle[row.status]}`}>
                  {row.status}
                </Badge>
              </div>
              <p className="text-lg font-bold">
                {formatNaira(row.cashAmount + row.transferAmount)}
              </p>
              <dl className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <dt className="text-muted-foreground">Cash</dt>
                  <dd className="font-semibold">{formatNaira(row.cashAmount)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Transfer</dt>
                  <dd className="font-semibold">{formatNaira(row.transferAmount)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Outstanding</dt>
                  <dd className="font-semibold">{formatNaira(row.outstandingAmount)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Reference</dt>
                  <dd className="font-semibold">{row.transferReference ?? "—"}</dd>
                </div>
              </dl>
              <Button variant="outline" className="min-h-10 w-full" onClick={() => onReview(row)}>
                Review
              </Button>
            </article>
          );
        })}
      </div>
      {!rows.length && (
        <EmptyState
          title="No Manager payments for this period"
          detail="Manager remittances will appear here when submitted."
        />
      )}
    </>
  );
  return content;
}
