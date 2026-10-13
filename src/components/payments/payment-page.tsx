import { useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Check, Clock, X } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { EmptyState, FieldError, FilterSelect, Panel, StatTile } from "@/components/shared";
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
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import type { Db, PaymentStatus } from "@/data/mock-db";
import { saleTotal } from "@/lib/calculations";
import { orderIdOf } from "@/lib/customer-calculations";
import { formatDate, formatNaira, formatTime } from "@/lib/format";
import {
  getPaymentEntriesForScope,
  getPaymentOverviewSummary,
  getRepPaymentSummary,
  getRepSalesForPeriod,
  isValidPaymentPeriod,
  paymentMethodLabel,
  paymentStatusLabel,
  validatePaymentReconciliation,
  type PaymentEntry,
  type PaymentKind,
} from "@/lib/payment-calculations";
import { getAccessScope, useCurrentUserId, type AccessScope } from "@/lib/session";
import { useDb } from "@/services/mock-store";
import {
  customerPaymentService,
  paymentService,
  type FieldErrors,
} from "@/services/services";

const tone: Record<PaymentStatus, string> = {
  submitted: "border-warning/40 bg-warning/10 text-warning",
  acknowledged: "border-primary/30 bg-primary/5 text-primary",
  declined: "border-destructive/30 bg-destructive/5 text-destructive",
  confirmed: "border-success/30 bg-success/5 text-success",
};
export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  return (
    <Badge variant="outline" className={`whitespace-nowrap font-medium ${tone[status]}`}>
      {paymentStatusLabel[status]}
    </Badge>
  );
}
const kindLabel: Record<PaymentKind, string> = { rep: "Sales payment", customer: "Customer payment" };
const currentMonth = (date: string) => date.slice(0, 7);
const monthLabel = (period: string) =>
  isValidPaymentPeriod(period)
    ? new Intl.DateTimeFormat("en-NG", { month: "long", year: "numeric", timeZone: "UTC" }).format(
        new Date(`${period}-01T00:00:00Z`),
      )
    : period;

export function PaymentPage() {
  const db = useDb();
  const userId = useCurrentUserId();
  const scope = getAccessScope(db, userId);
  const role = scope.user.role;
  const [period, setPeriod] = useState(currentMonth(db.tenant.referenceDate));
  const [branchId, setBranchId] = useState("all");
  const [repId, setRepId] = useState("all");
  const [status, setStatus] = useState("all");
  const [kind, setKind] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [submitOpen, setSubmitOpen] = useState(false);

  const filters = {
    period: isValidPaymentPeriod(period) ? period : undefined,
    ...(branchId !== "all" ? { branchId } : {}),
    ...(repId !== "all" ? { salesRepId: repId } : {}),
  };
  const periodEntries = useMemo(
    () => getPaymentEntriesForScope(db, scope, { ...filters, kind: kind as PaymentKind | "all" }),
    [db, scope, period, branchId, repId, kind], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const rows = periodEntries.filter((e) => status === "all" || e.status === status);
  const summary = getPaymentOverviewSummary(db, scope, periodEntries, period, filters);
  const selected = selectedId
    ? (getPaymentEntriesForScope(db, scope).find((e) => e.id === selectedId) ?? null)
    : null;

  const branches = db.branches.filter(
    (b) => b.tenantId === scope.user.tenantId && (scope.branchIds === null || scope.branchIds.includes(b.id)),
  );
  const reps = db.users.filter(
    (u) =>
      u.tenantId === scope.user.tenantId &&
      u.role === "sales_rep" &&
      !!u.branchId &&
      (scope.branchIds === null || scope.branchIds.includes(u.branchId)) &&
      (branchId === "all" || u.branchId === branchId),
  );
  const title = role === "manager" ? "Team Payments" : "Payments";
  const subtitle =
    role === "sales_rep"
      ? "Submit your sales payments and track customer payments you collected."
      : role === "manager"
        ? "Acknowledge payments from your branch. The owner gives final confirmation."
        : "Confirm acknowledged payments. Only confirmed money counts as received.";

  return (
    <AppShell title={title} subtitle={subtitle}>
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-xl font-bold">{title}</h1>
          <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {scope.canConfirmPayments && (
            <Button asChild variant="outline" size="sm">
              <Link to="/manager-remittances">Manager remittances</Link>
            </Button>
          )}
          {role === "sales_rep" && (
            <Button size="sm" onClick={() => setSubmitOpen(true)} disabled={!isValidPaymentPeriod(period)}>
              Submit payment
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <StatTile tone="success" label="Total confirmed" value={formatNaira(summary.confirmed)} detail={`${summary.confirmedCount} payment${summary.confirmedCount === 1 ? "" : "s"}`} />
        <StatTile tone="warning" label="Awaiting acknowledgement" value={formatNaira(summary.awaitingAcknowledgement)} detail={`${summary.awaitingAcknowledgementCount} with manager`} />
        <StatTile tone="brand" label="Awaiting owner confirmation" value={formatNaira(summary.awaitingConfirmation)} detail={`${summary.awaitingConfirmationCount} acknowledged`} />
        <StatTile tone="danger" label="Declined" value={formatNaira(summary.declined)} detail={`${summary.declinedCount} declined`} />
        <StatTile tone="violet" label="Outstanding" value={formatNaira(summary.outstanding)} detail="Walk-in sales not yet reported" />
      </div>

      <Panel
        title="Payments"
        subtitle={monthLabel(period)}
        className="mt-4"
        action={
          <div className="flex flex-wrap gap-2">
            <Input
              type="month"
              aria-label="Period"
              max={currentMonth(db.tenant.referenceDate)}
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="h-9 w-40 text-xs"
            />
            {role !== "sales_rep" && branches.length > 1 && (
              <FilterSelect label="Branch" value={branchId} onChange={(v) => { setBranchId(v); setRepId("all"); }} className="w-36" options={[{ value: "all", label: "All branches" }, ...branches.map((b) => ({ value: b.id, label: b.name }))]} />
            )}
            {role !== "sales_rep" && (
              <FilterSelect label="Sales representative" value={repId} onChange={setRepId} className="w-40" options={[{ value: "all", label: "All reps" }, ...reps.map((r) => ({ value: r.id, label: r.name }))]} />
            )}
            <FilterSelect label="Type" value={kind} onChange={setKind} className="w-36" options={[{ value: "all", label: "All types" }, { value: "rep", label: "Sales payments" }, { value: "customer", label: "Customer payments" }]} />
            <FilterSelect label="Status" value={status} onChange={setStatus} className="w-44" options={[{ value: "all", label: "All statuses" }, ...(Object.keys(paymentStatusLabel) as PaymentStatus[]).map((s) => ({ value: s, label: paymentStatusLabel[s] }))]} />
          </div>
        }
      >
        {rows.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-xs">
              <thead className="border-b border-border bg-muted/40 text-[10px] uppercase text-muted-foreground">
                <tr>
                  {["Date", "Rep / customer", "Amount", "Method", "Status", "Handled by"].map((h) => (
                    <th key={h} className="px-4 py-3 font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((e) => (
                  <tr key={e.id} className="cursor-pointer hover:bg-muted/40" onClick={() => setSelectedId(e.id)} tabIndex={0} onKeyDown={(k) => k.key === "Enter" && setSelectedId(e.id)}>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(e.date)}</td>
                    <td className="px-4 py-3">
                      <p className="font-semibold">{partyName(db, e)}</p>
                      <p className="text-[10px] text-muted-foreground">{e.kind === "customer" ? `Collected by ${userName(db, e.repId)}` : kindLabel.rep} · {e.id}</p>
                    </td>
                    <td className="px-4 py-3 font-bold tabular-nums">{formatNaira(e.amount)}</td>
                    <td className="px-4 py-3">{paymentMethodLabel[e.method]}</td>
                    <td className="px-4 py-3"><PaymentStatusBadge status={e.status} /></td>
                    <td className="px-4 py-3 text-muted-foreground">{userName(db, e.handledBy)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No payments for this view." detail="Try another period or clear the filters." />
        )}
      </Panel>

      <PaymentDrawer db={db} scope={scope} entry={selected} onClose={() => setSelectedId(null)} />
      {role === "sales_rep" && (
        <SubmitPaymentDialog db={db} userId={userId} period={period} onPeriodChange={setPeriod} open={submitOpen} onOpenChange={setSubmitOpen} />
      )}
    </AppShell>
  );
}

const userName = (db: Db, id?: string) => (id ? (db.users.find((u) => u.id === id)?.name ?? "—") : "—");
const partyName = (db: Db, e: PaymentEntry) =>
  e.kind === "customer" ? (db.customers.find((c) => c.id === e.customerId)?.name ?? "Customer") : userName(db, e.repId);

function PaymentDrawer({ db, scope, entry, onClose }: { db: Db; scope: AccessScope; entry: PaymentEntry | null; onClose: () => void }) {
  const [action, setAction] = useState<"acknowledge" | "confirm" | "decline" | null>(null);
  const [reference, setReference] = useState("");
  const [proofName, setProofName] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});

  const canAck = !!entry && scope.canAcknowledgePayments && entry.status === "submitted" && entry.managerId === scope.user.id;
  const canConfirm = !!entry && scope.canConfirmPayments && entry.status === "acknowledged";
  const canDecline = canAck || canConfirm;

  const open = (kind: typeof action) => {
    setAction(kind);
    setReference(entry?.reference ?? "");
    setProofName("");
    setReason("");
    setErrors({});
  };
  const run = async () => {
    if (!entry || !action) return;
    setBusy(true);
    const service = entry.kind === "customer" ? customerPaymentService : paymentService;
    const details = { transferReference: reference, proofName };
    const result =
      action === "acknowledge"
        ? await service.acknowledge(entry.id, scope.user.id, details)
        : action === "confirm"
          ? await service.confirm(entry.id, scope.user.id)
          : await service.decline(entry.id, reason, scope.user.id);
    setBusy(false);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    toast.success(action === "acknowledge" ? "Payment acknowledged · sent to owner" : action === "confirm" ? "Payment confirmed" : "Payment declined");
    setAction(null);
  };

  const repSales = entry?.kind === "rep" ? getRepSalesForPeriod(db, entry.repId, entry.period) : [];
  const repPosition = entry?.kind === "rep" ? getRepPaymentSummary(db, entry.repId, entry.period) : null;
  const customerPayment = entry?.kind === "customer" ? db.customerPayments.find((p) => p.id === entry.id) : undefined;
  const linkedOrderLines = customerPayment
    ? db.sales.filter((s) => s.customerId === customerPayment.customerId && (!customerPayment.orderId || orderIdOf(s) === customerPayment.orderId)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 8)
    : [];
  const product = (id: string) => db.products.find((p) => p.id === id)?.name ?? "Product";
  const needsReference = !!entry && entry.transfer > 0;

  return (
    <Sheet open={!!entry} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        {entry && (
          <>
            <SheetHeader className="text-left">
              <SheetTitle>{partyName(db, entry)}</SheetTitle>
              <SheetDescription>{kindLabel[entry.kind]} · {entry.id} · {monthLabel(entry.period)}</SheetDescription>
            </SheetHeader>
            <div className="mt-4 space-y-5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold tabular-nums">{formatNaira(entry.amount)}</span>
                <PaymentStatusBadge status={entry.status} />
              </div>

              <Section title="Breakdown">
                <Row label="Cash">{formatNaira(entry.cash)}</Row>
                <Row label="Transfer">{formatNaira(entry.transfer)}</Row>
                {repPosition && (
                  <>
                    <Row label="Walk-in sales for the month">{formatNaira(repPosition.totalSales)}</Row>
                    <Row label="Confirmed so far">{formatNaira(repPosition.confirmed)}</Row>
                    <Row label="Outstanding (not yet reported)">{formatNaira(repPosition.outstanding)}</Row>
                  </>
                )}
                <Row label="Transfer reference">{entry.reference ?? "—"}</Row>
                <Row label="Proof">{entry.proofName ?? "None attached"}</Row>
                {entry.kind === "customer" && <Row label="Collected by">{userName(db, entry.repId)}</Row>}
                <Row label="Branch">{db.branches.find((b) => b.id === entry.branchId)?.name ?? "—"}</Row>
                {entry.note && <Row label="Note">{entry.note}</Row>}
              </Section>

              {entry.declineReason && (
                <div className="rounded-md border border-destructive/20 bg-destructive/5 p-3">
                  <p className="font-semibold text-destructive">Decline reason</p>
                  <p className="mt-1">{entry.declineReason}</p>
                </div>
              )}

              <Section title="Approval trail">
                <Trail db={db} entry={entry} />
              </Section>

              <Section title={entry.kind === "rep" ? `Linked walk-in sales (${repSales.length})` : "Linked order lines"}>
                {(entry.kind === "rep" ? repSales.slice(-8).reverse() : linkedOrderLines).map((s) => (
                  <Row key={s.id} label={`${formatDate(s.saleDate)} · ${product(s.productId)} × ${s.quantity}`}>{formatNaira(saleTotal(s))}</Row>
                ))}
                {(entry.kind === "rep" ? repSales : linkedOrderLines).length === 0 && <p className="text-muted-foreground">No linked sales.</p>}
                {entry.kind === "customer" && entry.customerId && scope.canViewCustomers && (
                  <Link to="/customers/$customerId" params={{ customerId: entry.customerId }} className="mt-2 inline-block font-semibold text-primary">Open customer account</Link>
                )}
              </Section>

              {(canAck || canConfirm) && (
                <div className="flex flex-wrap gap-2 border-t border-border pt-4">
                  {canAck && <Button size="sm" onClick={() => open("acknowledge")}>Acknowledge</Button>}
                  {canConfirm && <Button size="sm" onClick={() => open("confirm")}>Confirm</Button>}
                  {canDecline && <Button size="sm" variant="outline" className="border-destructive/40 text-destructive hover:bg-destructive/5" onClick={() => open("decline")}>Decline</Button>}
                </div>
              )}
              {!canAck && !canConfirm && entry.status === "acknowledged" && (
                <p className="flex items-center gap-1.5 rounded-md bg-muted p-3 text-muted-foreground"><Clock className="size-3.5" />Awaiting owner confirmation. Not yet counted as received.</p>
              )}
            </div>
          </>
        )}
        <Dialog open={!!action} onOpenChange={(o) => !o && !busy && setAction(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{action === "acknowledge" ? "Acknowledge payment" : action === "confirm" ? "Confirm payment" : "Decline payment"}</DialogTitle>
              <DialogDescription>
                {action === "acknowledge"
                  ? "Confirm you received this money. The owner gives final confirmation."
                  : action === "confirm"
                    ? "Confirmed money counts as received in totals and reports."
                    : "Give a reason so the sales representative can correct it."}
              </DialogDescription>
            </DialogHeader>
            {action === "acknowledge" && (
              <div className="space-y-3">
                {needsReference && (
                  <div>
                    <Label className="text-xs">Transfer reference *</Label>
                    <Input className="mt-1.5" value={reference} onChange={(e) => setReference(e.target.value)} aria-label="Transfer reference" />
                    <FieldError message={errors.transferReference} />
                  </div>
                )}
                <div>
                  <Label className="text-xs">Proof of payment (optional)</Label>
                  <Input className="mt-1.5" type="file" accept="image/*,application/pdf" aria-label="Proof of payment" onChange={(e) => setProofName(e.target.files?.[0]?.name ?? "")} />
                </div>
              </div>
            )}
            {action === "decline" && (
              <div>
                <Label className="text-xs">Reason *</Label>
                <Textarea className="mt-1.5" value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Decline reason" />
                <FieldError message={errors.reason} />
              </div>
            )}
            <FieldError message={errors.form} />
            <DialogFooter>
              <Button variant="outline" disabled={busy} onClick={() => setAction(null)}>Cancel</Button>
              <Button disabled={busy || (action === "decline" && !reason.trim()) || (action === "acknowledge" && needsReference && !reference.trim())} onClick={run}>
                {busy ? "Saving…" : action === "acknowledge" ? "Acknowledge" : action === "confirm" ? "Confirm" : "Decline"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </SheetContent>
    </Sheet>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-[11px] font-bold uppercase text-muted-foreground">{title}</h3>
      <div className="divide-y divide-border rounded-md border border-border px-3">{children}</div>
    </section>
  );
}
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-semibold">{children}</span>
    </div>
  );
}
const stepLabel = { submitted: "Submitted", acknowledged: "Acknowledged by manager", confirmed: "Confirmed by owner", declined: "Declined" };
function Trail({ db, entry }: { db: Db; entry: PaymentEntry }) {
  const steps = [...entry.trail];
  if (entry.status === "submitted") steps.push({ step: "acknowledged" });
  if (entry.status === "submitted" || entry.status === "acknowledged") steps.push({ step: "confirmed" });
  return (
    <div className="py-1">
      {steps.map((s, i) => (
        <div key={i} className="flex gap-3 py-2">
          <span className={`grid size-6 shrink-0 place-items-center rounded-full border ${!s.at ? "border-dashed border-border text-muted-foreground" : s.step === "declined" ? "border-destructive/40 text-destructive" : "border-success/40 text-success"}`}>
            {!s.at ? <Clock className="size-3" /> : s.step === "declined" ? <X className="size-3" /> : <Check className="size-3" />}
          </span>
          <div>
            <p className="font-semibold">{stepLabel[s.step]}</p>
            <p className="text-[11px] text-muted-foreground">
              {s.at ? `${userName(db, s.by)} · ${formatDate(s.at)} at ${formatTime(s.at)}` : "Pending"}
            </p>
            {s.note && <p className="mt-1 text-[11px]">{s.note}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}

function SubmitPaymentDialog({ db, userId, period, onPeriodChange, open, onOpenChange }: { db: Db; userId: string; period: string; onPeriodChange: (p: string) => void; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [cash, setCash] = useState("");
  const [transfer, setTransfer] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const position = getRepPaymentSummary(db, userId, period);
  const cashN = cash === "" ? 0 : Number(cash);
  const transferN = transfer === "" ? 0 : Number(transfer);
  const remaining = position.outstanding;
  const check = validatePaymentReconciliation(remaining, { cashAmount: cashN, transferAmount: transferN });
  const submit = async () => {
    setBusy(true);
    const result = await paymentService.submit({ period, cashAmount: cashN, transferAmount: transferN, transferReference: reference, note }, userId);
    setBusy(false);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    toast.success("Payment submitted for manager acknowledgement");
    setCash("");
    setTransfer("");
    setReference("");
    setNote("");
    setErrors({});
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Submit payment</DialogTitle>
          <DialogDescription>Report money collected from your walk-in sales. Customer account payments are recorded on the customer's page.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label className="text-xs">Period</Label>
            <Input className="mt-1.5" type="month" max={currentMonth(db.tenant.referenceDate)} value={period} onChange={(e) => onPeriodChange(e.target.value)} aria-label="Payment period" />
            <FieldError message={errors.period} />
          </div>
          <div>
            <Label className="text-xs">Not yet reported</Label>
            <Input className="mt-1.5" readOnly value={formatNaira(remaining)} aria-label="Not yet reported" />
          </div>
          <div>
            <Label className="text-xs">Cash (₦)</Label>
            <Input className="mt-1.5" type="number" min="0" value={cash} onChange={(e) => setCash(e.target.value)} aria-label="Cash amount" />
            <FieldError message={errors.cashAmount} />
          </div>
          <div>
            <Label className="text-xs">Transfer (₦)</Label>
            <Input className="mt-1.5" type="number" min="0" value={transfer} onChange={(e) => setTransfer(e.target.value)} aria-label="Transfer amount" />
            <FieldError message={errors.transferAmount} />
          </div>
          <div className="sm:col-span-2">
            <Label className="text-xs">Transfer reference{transferN > 0 ? " *" : ""}</Label>
            <Input className="mt-1.5" value={reference} onChange={(e) => setReference(e.target.value)} aria-label="Transfer reference" />
            <FieldError message={errors.transferReference} />
          </div>
          <div className="sm:col-span-2">
            <Label className="text-xs">Note</Label>
            <Textarea className="mt-1.5" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Payment note" />
          </div>
        </div>
        <p className={`rounded-md bg-muted px-3 py-2 text-xs font-semibold ${check.balanced ? "text-success" : "text-destructive"}`}>
          {check.balanced ? `Still to report after this: ${formatNaira(check.outstanding)}` : "Cash and transfer cannot exceed what is left to report"}
        </p>
        <FieldError message={errors.form} />
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={busy || !check.balanced || cashN + transferN <= 0} onClick={submit}>{busy ? "Submitting…" : "Submit payment"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
