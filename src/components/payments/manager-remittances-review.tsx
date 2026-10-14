import { useMemo, useState } from "react";
import { CircleDollarSign, ClipboardList, Landmark, Wallet } from "lucide-react";
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
import type { Db, ManagerRemittance } from "@/data/mock-db";
import { formatDate, formatMonth, formatNaira, formatTime } from "@/lib/format";
import { getOwnerManagerPaymentSummary, isValidPaymentPeriod } from "@/lib/payment-calculations";
import { getManagerRemittances } from "@/lib/remittance-calculations";
import { getAccessScope, useCurrentUserId } from "@/lib/session";
import { useDb } from "@/services/mock-store";
import { remittanceService, type FieldErrors } from "@/services/services";

const currentMonth = (dbDate: string) => dbDate.slice(0, 7);
const monthLabel = (period: string) =>
  isValidPaymentPeriod(period)
    ? new Intl.DateTimeFormat("en-NG", { month: "long", year: "numeric", timeZone: "UTC" }).format(
        new Date(`${period}-01T00:00:00Z`),
      )
    : period;

/** Owner review of Manager → Owner remittances. */
export function ManagerRemittancesReview() {
  const db = useDb();
  const scope = getAccessScope(db, useCurrentUserId());
  const [period, setPeriod] = useState(currentMonth(db.tenant.referenceDate));
  return (
    <OwnerManagerPaymentPage db={db} scope={scope} period={period} onPeriodChange={setPeriod} />
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
      title="Manager Remittances"
      subtitle="Review payments remitted from Managers to the Owner."
    >
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-bold">Manager Remittances</h1>
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
                  [
                    "Manager",
                    db.users.find((user) => user.id === reviewRow.managerId)?.name ?? "Manager",
                  ],
                  [
                    "Branch",
                    db.branches.find((branch) => branch.id === reviewRow.branchId)?.name ??
                      "Branch",
                  ],
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
                  Transfer reference:{" "}
                  <span className="font-medium text-foreground">{reviewRow.transferReference}</span>
                </p>
              )}
              {reviewRow.note && (
                <p className="text-xs text-muted-foreground">Note: {reviewRow.note}</p>
              )}
              {reviewRow.declineReason && (
                <p className="rounded-md bg-destructive/5 p-3 text-xs">
                  <strong className="text-destructive">Decline reason:</strong>{" "}
                  {reviewRow.declineReason}
                </p>
              )}
              {reviewRow.status === "submitted" && (
                <div>
                  <Label htmlFor="owner-payment-decline-reason" className="text-xs">
                    Decline reason
                  </Label>
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
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8"
                      onClick={() => onReview(row)}
                    >
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
