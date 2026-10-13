import { useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Banknote, CircleDollarSign, Eye, Landmark, Plus, Search } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { EmptyState, FieldError, MetricCard, Panel } from "@/components/shared";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type {
  OwnerRemittance,
  OwnerRemittancePayeeType,
  OwnerRemittancePaymentMethod,
} from "@/data/remittances";
import type { Db } from "@/data/mock-db";
import { formatDate, formatNaira, formatTime } from "@/lib/format";
import { getOwnerRemittanceSummary, getOwnerRemittances } from "@/lib/remittance-calculations";
import { getAccessScope, useCurrentUserId } from "@/lib/session";
import { useDb } from "@/services/mock-store";
import {
  ownerRemittanceService,
  type FieldErrors,
  type OwnerRemittanceInput,
} from "@/services/services";

const payeeLabels: Record<OwnerRemittancePayeeType, string> = {
  supplier: "Supplier",
  service_provider: "Service provider",
  external_payee: "External payee",
  other: "Other",
};
const defaultForm = (date: string): OwnerRemittanceInput => ({
  payeeType: "supplier",
  payeeName: "",
  amount: 0,
  paymentMethod: "cash",
  reference: "",
  remittanceDate: date,
  purpose: "",
  note: "",
});

export function OwnerRemittancePage({ remittanceId }: { remittanceId?: string }) {
  const db = useDb();
  const userId = useCurrentUserId();
  const scope = getAccessScope(db, userId);
  const month = db.tenant.referenceDate.slice(0, 7);
  const [query, setQuery] = useState("");
  const [method, setMethod] = useState<"all" | OwnerRemittancePaymentMethod>("all");
  const [payeeType, setPayeeType] = useState<"all" | OwnerRemittancePayeeType>("all");
  const [branchId, setBranchId] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<OwnerRemittanceInput>(defaultForm(db.tenant.referenceDate));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);
  const allRows = useMemo(() => getOwnerRemittances(db, scope), [db, scope]);
  const summary = getOwnerRemittanceSummary(allRows, month);
  const rows = useMemo(
    () =>
      getOwnerRemittances(db, scope, {
        search: query,
        paymentMethod: method,
        payeeType,
        branchId,
        from,
        to,
      }),
    [db, scope, query, method, payeeType, branchId, from, to],
  );
  const selected = remittanceId ? allRows.find((row) => row.id === remittanceId) : null;
  const branches = db.branches.filter((branch) => branch.tenantId === scope.user.tenantId);
  const openForm = () => {
    setErrors({});
    setForm(defaultForm(db.tenant.referenceDate));
    setFormOpen(true);
  };
  const setField = <K extends keyof OwnerRemittanceInput>(key: K, value: OwnerRemittanceInput[K]) =>
    setForm((current) => ({ ...current, [key]: value }));
  const record = async () => {
    setBusy(true);
    const result = await ownerRemittanceService.create(form, userId);
    setBusy(false);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setFormOpen(false);
    toast.success("Remittance recorded");
  };

  if (remittanceId)
    return selected ? (
      <RemittanceDetail row={selected} />
    ) : (
      <AppShell title="Remittance">
        <EmptyState
          title="Remittance not found"
          detail="This record is unavailable in the current Owner account."
        />
      </AppShell>
    );

  return (
    <AppShell
      title="Remittance"
      subtitle="Manage outgoing remittances from the Owner to suppliers, payees, and other external obligations."
      actions={
        <Button onClick={openForm}>
          <Plus className="size-4" />
          Record Remittance
        </Button>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={CircleDollarSign}
          tone="brand"
          label="Total Remitted"
          value={formatNaira(summary.total)}
          detail="Recorded outgoing payments"
        />
        <MetricCard
          icon={Banknote}
          tone="success"
          label="Cash"
          value={formatNaira(summary.cash)}
          detail="Recorded cash remittances"
        />
        <MetricCard
          icon={Landmark}
          tone="violet"
          label="Transfer"
          value={formatNaira(summary.transfer)}
          detail="Recorded transfers"
        />
        <MetricCard
          icon={CircleDollarSign}
          tone="warning"
          label="This Month"
          value={formatNaira(summary.thisMonth)}
          detail="Recorded this month"
        />
      </div>

      <Panel
        title="Remittance history"
        subtitle="Outgoing payments from the Owner to external payees."
        className="mt-5 min-w-0 overflow-hidden"
      >
        <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <div className="relative xl:col-span-2">
            <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search payee, reference, purpose"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label="Search remittances"
            />
          </div>
          <Filter
            label="Method"
            value={method}
            onChange={(value) => setMethod(value as typeof method)}
            values={[
              ["all", "All methods"],
              ["cash", "Cash"],
              ["transfer", "Transfer"],
            ]}
          />
          <Filter
            label="Payee type"
            value={payeeType}
            onChange={(value) => setPayeeType(value as typeof payeeType)}
            values={[["all", "All types"], ...Object.entries(payeeLabels)]}
          />
          <Filter
            label="Branch"
            value={branchId}
            onChange={setBranchId}
            values={[
              ["all", "All branches"],
              ...branches.map((branch) => [branch.id, branch.name] as [string, string]),
            ]}
          />
          <div className="flex gap-2">
            <Input
              aria-label="From date"
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
            <Input
              aria-label="To date"
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
            />
          </div>
        </div>
        <div className="w-full max-w-full min-w-0 overflow-x-auto overscroll-x-contain">
          <table className="hidden w-full min-w-[1000px] text-left md:table">
            <thead>
              <tr className="text-[10px] uppercase text-muted-foreground">
                {[
                  "Payee",
                  "Type",
                  "Purpose",
                  "Amount",
                  "Payment Method",
                  "Date",
                  "Reference",
                  "Recorded By",
                  "Actions",
                ].map((heading) => (
                  <th key={heading} className="px-4 py-3">
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <RemittanceRow key={row.id} row={row} db={db} />
              ))}
            </tbody>
          </table>
          <div className="divide-y divide-border md:hidden">
            {rows.map((row) => (
              <article key={row.id} className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{row.payeeName}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {payeeLabels[row.payeeType]} · {formatDate(row.remittanceDate)}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-bold">{formatNaira(row.amount)}</span>
                </div>
                <p className="line-clamp-2 text-xs text-muted-foreground">{row.purpose}</p>
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span className="capitalize">
                    {row.paymentMethod}
                    {row.reference ? ` · ${row.reference}` : ""}
                  </span>
                  <Link
                    to="/owner/remittance/$remittanceId"
                    params={{ remittanceId: row.id }}
                    className="inline-flex min-h-10 items-center gap-1 font-semibold text-primary"
                  >
                    View details <Eye className="size-4" />
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </div>
        {!rows.length && (
          <>
            <EmptyState
              title={allRows.length ? "No matching remittances" : "No remittances yet"}
              detail={
                allRows.length
                  ? "Adjust your search or filters to see remittances."
                  : "Create your first outgoing remittance to start tracking Owner payments."
              }
            />
            {!allRows.length && (
              <div className="pb-8 text-center">
                <Button onClick={openForm}>
                  <Plus className="size-4" />
                  Record Remittance
                </Button>
              </div>
            )}
          </>
        )}
      </Panel>

      <Dialog open={formOpen} onOpenChange={(open) => !busy && setFormOpen(open)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Record Remittance</DialogTitle>
            <DialogDescription>
              Record money leaving the Owner for a supplier, payee, or external obligation.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Payee Type">
              <Select
                value={form.payeeType}
                onValueChange={(value) => setField("payeeType", value as OwnerRemittancePayeeType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(payeeLabels).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Payee Name">
              <Input
                value={form.payeeName}
                onChange={(event) => setField("payeeName", event.target.value)}
              />
              {errors.payeeName && <FieldError message={errors.payeeName} />}
            </Field>
            <Field label="Amount">
              <Input
                type="number"
                min="0.01"
                step="0.01"
                inputMode="decimal"
                value={form.amount || ""}
                onChange={(event) =>
                  setField("amount", event.target.value ? Number(event.target.value) : 0)
                }
              />
              {errors.amount && <FieldError message={errors.amount} />}
            </Field>
            <Field label="Payment Method">
              <Select
                value={form.paymentMethod}
                onValueChange={(value) =>
                  setField("paymentMethod", value as OwnerRemittancePaymentMethod)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="transfer">Transfer</SelectItem>
                </SelectContent>
              </Select>
              {errors.paymentMethod && <FieldError message={errors.paymentMethod} />}
            </Field>
            <Field label="Remittance Date">
              <Input
                type="date"
                max={db.tenant.referenceDate}
                value={form.remittanceDate}
                onChange={(event) => setField("remittanceDate", event.target.value)}
              />
              {errors.remittanceDate && <FieldError message={errors.remittanceDate} />}
            </Field>
            <Field label="Reference">
              <Input
                value={form.reference ?? ""}
                onChange={(event) => setField("reference", event.target.value)}
                placeholder={
                  form.paymentMethod === "transfer" ? "Required for transfer" : "Optional"
                }
              />
              {errors.reference && <FieldError message={errors.reference} />}
            </Field>
            <Field label="Branch (optional)">
              <Select
                value={form.branchId ?? "none"}
                onValueChange={(value) =>
                  setForm((current) => {
                    const next = { ...current };
                    if (value === "none") delete next.branchId;
                    else next.branchId = value;
                    return next;
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Business-wide" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Business-wide</SelectItem>
                  {branches.map((branch) => (
                    <SelectItem key={branch.id} value={branch.id}>
                      {branch.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.branchId && <FieldError message={errors.branchId} />}
            </Field>
            <Field label="Purpose" className="sm:col-span-2">
              <Input
                value={form.purpose}
                onChange={(event) => setField("purpose", event.target.value)}
                placeholder="What is this remittance for?"
              />
              {errors.purpose && <FieldError message={errors.purpose} />}
            </Field>
            <Field label="Note (optional)" className="sm:col-span-2">
              <Textarea
                value={form.note ?? ""}
                onChange={(event) => setField("note", event.target.value)}
              />
            </Field>
          </div>
          {errors.form && <FieldError message={errors.form} />}
          <DialogFooter className="flex-col-reverse sm:flex-row">
            <Button
              variant="outline"
              className="min-h-11 w-full sm:w-auto"
              disabled={busy}
              onClick={() => setFormOpen(false)}
            >
              Cancel
            </Button>
            <Button className="min-h-11 w-full sm:w-auto" disabled={busy} onClick={record}>
              {busy ? "Recording…" : "Record Remittance"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function RemittanceRow({ row, db }: { row: OwnerRemittance; db: Db }) {
  return (
    <tr className="border-t border-border text-xs hover:bg-muted/30">
      <td className="px-4 py-3 font-semibold">{row.payeeName}</td>
      <td className="px-4 py-3">{payeeLabels[row.payeeType]}</td>
      <td className="max-w-56 truncate px-4 py-3">{row.purpose}</td>
      <td className="px-4 py-3 font-semibold">{formatNaira(row.amount)}</td>
      <td className="px-4 py-3 capitalize">{row.paymentMethod}</td>
      <td className="px-4 py-3">{formatDate(row.remittanceDate)}</td>
      <td className="px-4 py-3 text-muted-foreground">{row.reference ?? "—"}</td>
      <td className="px-4 py-3">
        {db.users.find((user) => user.id === row.ownerId)?.name ?? "Owner"}
      </td>
      <td className="px-4 py-2">
        <Link to="/owner/remittance/$remittanceId" params={{ remittanceId: row.id }}>
          <Button size="icon" variant="ghost" className="size-8" aria-label={`View ${row.id}`}>
            <Eye className="size-4" />
          </Button>
        </Link>
      </td>
    </tr>
  );
}
function Filter({
  label,
  value,
  onChange,
  values,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  values: [string, string][];
}) {
  return (
    <div className="min-w-0">
      <Label className="mb-1 block text-[10px] text-muted-foreground">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {values.map(([key, text]) => (
            <SelectItem key={key} value={key}>
              {text}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
function Field({
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
      <div className="mt-1.5 space-y-1.5">{children}</div>
    </div>
  );
}
function RemittanceDetail({ row }: { row: OwnerRemittance }) {
  const db = useDb();
  const owner = db.users.find((user) => user.id === row.ownerId);
  const branch = row.branchId ? db.branches.find((item) => item.id === row.branchId) : null;
  const values: [string, string][] = [
    ["Payee", row.payeeName],
    ["Payee Type", payeeLabels[row.payeeType]],
    ["Amount", formatNaira(row.amount)],
    ["Payment Method", row.paymentMethod],
    ["Purpose", row.purpose],
    ["Reference", row.reference ?? "—"],
    ["Remittance Date", formatDate(row.remittanceDate)],
    ["Owner", owner?.name ?? "Owner"],
    ["Branch", branch?.name ?? "Business-wide"],
    ["Note", row.note ?? "—"],
    ["Created At", `${formatDate(row.createdAt)} · ${formatTime(row.createdAt)}`],
  ];
  return (
    <AppShell
      title="Remittance"
      subtitle="Outgoing transaction details"
      actions={
        <Link to="/owner/remittance">
          <Button variant="outline">
            <ArrowLeft className="size-4" />
            Back to Remittance
          </Button>
        </Link>
      }
    >
      <Panel title={row.payeeName} subtitle={row.id}>
        <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
          {values.map(([label, value]) => (
            <div key={label} className="min-w-0 rounded-md border border-border p-3">
              <p className="text-[10px] uppercase text-muted-foreground">{label}</p>
              <p className="mt-1 break-words text-sm font-semibold">{value}</p>
            </div>
          ))}
        </div>
      </Panel>
      <Panel
        title="Recorded"
        subtitle={`${owner?.name ?? "Owner"} recorded this outgoing remittance.`}
        className="mt-5"
      >
        <div className="px-5 pb-5 text-xs text-muted-foreground">
          Recorded by {owner?.name ?? "Owner"} · {formatDate(row.createdAt)} at{" "}
          {formatTime(row.createdAt)}
        </div>
      </Panel>
    </AppShell>
  );
}
