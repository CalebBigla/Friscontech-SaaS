import { useMemo, useState, type ReactNode } from "react";
import { Ban, Eye, Pencil, Plus, Receipt } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { EmptyState, FieldError, MetricCard, Panel } from "@/components/shared";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { Expense, ExpenseCategory } from "@/data/mock-db";
import { formatDate, formatMonth, formatNaira } from "@/lib/format";
import {
  expenseCategories,
  expenseCategoryLabel,
  getExpensesForScope,
  getExpenseSummary,
} from "@/lib/remittance-calculations";
import { getAccessScope, useCurrentUserId } from "@/lib/session";
import { useDb } from "@/services/mock-store";
import { expenseService, type FieldErrors, type ExpenseInput } from "@/services/services";

const currentPeriod = (date: string) => date.slice(0, 7);

export function ExpensesPage() {
  const db = useDb();
  const userId = useCurrentUserId();
  const scope = getAccessScope(db, userId);
  const periodNow = currentPeriod(db.tenant.referenceDate);
  const [period, setPeriod] = useState(periodNow);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewId, setViewId] = useState<string | null>(null);
  const [voidId, setVoidId] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [reasonError, setReasonError] = useState("");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [form, setForm] = useState<ExpenseInput>({
    category: "transport",
    amount: 0,
    expenseDate: db.tenant.referenceDate,
    description: "",
    note: "",
  });
  const rows = useMemo(() => getExpensesForScope(db, scope, period), [db, scope, period]);
  const summary = getExpenseSummary(db, scope, period, periodNow);
  const view = db.expenses.find((expense) => expense.id === viewId) ?? null;
  const voidExpense = db.expenses.find((expense) => expense.id === voidId) ?? null;
  const actor = scope.user;
  const branch = actor.branchId ? db.branches.find((item) => item.id === actor.branchId) : null;
  const tenantBranches = db.branches.filter((item) => item.tenantId === scope.user.tenantId);

  const openForm = (expense?: Expense) => {
    setErrors({});
    setEditingId(expense?.id ?? null);
    setForm(
      expense
        ? {
            category: expense.category,
            amount: expense.amount,
            expenseDate: expense.expenseDate,
            description: expense.description,
            note: expense.note ?? "",
            ...(scope.user.role === "owner" && expense.branchId
              ? { branchId: expense.branchId }
              : {}),
          }
        : {
            category: "transport",
            amount: 0,
            expenseDate: db.tenant.referenceDate,
            description: "",
            note: "",
          },
    );
    setFormOpen(true);
  };
  const set = <K extends keyof ExpenseInput>(key: K, value: ExpenseInput[K]) =>
    setForm((current) => ({ ...current, [key]: value }));
  const save = async () => {
    setBusy(true);
    const result = editingId
      ? await expenseService.update(editingId, form, userId)
      : await expenseService.create(form, userId);
    setBusy(false);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    toast.success(editingId ? "Expense updated" : "Expense recorded");
    setFormOpen(false);
  };
  const voidRecord = async () => {
    if (!voidId) return;
    setBusy(true);
    const result = await expenseService.void(voidId, voidReason, userId);
    setBusy(false);
    if (!result.ok) {
      setReasonError(result.errors.reason ?? result.errors.form ?? "Unable to void expense");
      return;
    }
    toast.success("Expense voided");
    setVoidId(null);
    setVoidReason("");
  };

  return (
    <AppShell
      title="Expenses"
      subtitle={
        scope.user.role === "owner"
          ? "Record and review business operating expenses."
          : "Record and monitor operational expenses that affect your remittance."
      }
      actions={
        <Button onClick={() => openForm()}>
          <Plus className="size-4" />
          Add Expense
        </Button>
      }
    >
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-bold">Expenses</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            {scope.user.role === "owner"
              ? "Record and review business operating costs separately from outgoing remittances."
              : "Operational expenses are deducted from your remittance position."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="expense-period" className="text-xs text-muted-foreground">
            Period
          </Label>
          <Input
            id="expense-period"
            type="month"
            max={periodNow}
            value={period}
            onChange={(event) => setPeriod(event.target.value)}
            className="w-44"
          />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={Receipt}
          tone="brand"
          label="Total Expenses"
          value={formatNaira(summary.total)}
          detail="All recorded expenses"
        />
        <MetricCard
          icon={Receipt}
          tone="violet"
          label="This Month"
          value={formatNaira(summary.monthTotal)}
          detail={formatMonth(periodNow)}
        />
        <MetricCard
          icon={Receipt}
          tone="warning"
          label="This Period"
          value={formatNaira(summary.periodTotal)}
          detail={formatMonth(period)}
        />
        <MetricCard
          icon={Receipt}
          tone="success"
          label="Expense Count"
          value={String(summary.count)}
          detail="Recorded, non-voided"
        />
      </div>
      <Panel
        title="Expense history"
        subtitle={`${scope.user.role === "owner" ? "Business-wide" : (branch?.name ?? "Assigned branch")} · voided expenses remain in the record`}
        className="mt-5"
      >
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[800px] text-left">
            <thead>
              <tr className="text-[10px] uppercase text-muted-foreground">
                {[
                  "Date",
                  "Category",
                  "Description",
                  "Amount",
                  "Status",
                  "Created By",
                  "Actions",
                ].map((title) => (
                  <th key={title} className="px-4 py-3">
                    {title}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((expense) => (
                <tr key={expense.id} className="border-t border-border text-xs">
                  <td className="px-4 py-3 text-muted-foreground">
                    {formatDate(expense.expenseDate)}
                  </td>
                  <td className="px-4 py-3">{expenseCategoryLabel[expense.category]}</td>
                  <td className="max-w-64 truncate px-4 py-3 font-medium">{expense.description}</td>
                  <td className="px-4 py-3 font-semibold">{formatNaira(expense.amount)}</td>
                  <td className="px-4 py-3">
                    <ExpenseBadge status={expense.status} />
                  </td>
                  <td className="px-4 py-3">
                    {db.users.find((user) => user.id === (expense.ownerId ?? expense.managerId))
                      ?.name ?? "Unknown"}
                  </td>
                  <td className="px-4 py-2">
                    <ExpenseActions
                      expense={expense}
                      canManage={
                        scope.user.role === "owner"
                          ? expense.ownerId === userId
                          : expense.managerId === userId
                      }
                      onView={() => setViewId(expense.id)}
                      onEdit={() => openForm(expense)}
                      onVoid={() => {
                        setVoidId(expense.id);
                        setReasonError("");
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="divide-y divide-border md:hidden">
          {rows.map((expense) => (
            <article key={expense.id} className="space-y-3 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold">{expense.description}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {formatDate(expense.expenseDate)} · {expenseCategoryLabel[expense.category]}
                  </p>
                </div>
                <ExpenseBadge status={expense.status} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold">{formatNaira(expense.amount)}</span>
                <ExpenseActions
                  expense={expense}
                  canManage={
                    scope.user.role === "owner"
                      ? expense.ownerId === userId
                      : expense.managerId === userId
                  }
                  onView={() => setViewId(expense.id)}
                  onEdit={() => openForm(expense)}
                  onVoid={() => {
                    setVoidId(expense.id);
                    setReasonError("");
                  }}
                />
              </div>
            </article>
          ))}
        </div>
        {!rows.length && (
          <EmptyState
            title="No expenses recorded yet."
            detail={`No expenses were recorded for ${formatMonth(period)}.`}
          />
        )}
      </Panel>
      <Dialog open={formOpen} onOpenChange={(open) => !busy && setFormOpen(open)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Expense" : "Add Expense"}</DialogTitle>
            <DialogDescription>
              {scope.user.role === "owner"
                ? "Record an Owner operational expense. Expenses remain separate from Owner Remittance."
                : "Expense totals update the remittance calculation automatically."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <ExpenseField label="Expense Date">
              <Input
                type="date"
                max={db.tenant.referenceDate}
                value={form.expenseDate}
                onChange={(event) => set("expenseDate", event.target.value)}
                aria-label="Expense date"
              />
              {errors.expenseDate && <FieldError message={errors.expenseDate} />}
            </ExpenseField>
            <ExpenseField label="Category">
              <Select
                value={form.category}
                onValueChange={(value) => set("category", value as ExpenseCategory)}
              >
                <SelectTrigger aria-label="Expense category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {expenseCategories.map((category) => (
                    <SelectItem key={category} value={category}>
                      {expenseCategoryLabel[category]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.category && <FieldError message={errors.category} />}
            </ExpenseField>
            <ExpenseField label="Amount">
              <Input
                type="number"
                min="0.01"
                step="0.01"
                inputMode="decimal"
                value={form.amount || ""}
                onChange={(event) =>
                  set("amount", event.target.value === "" ? 0 : Number(event.target.value))
                }
                aria-label="Expense amount"
              />
              {errors.amount && <FieldError message={errors.amount} />}
            </ExpenseField>
            <ExpenseField label={scope.user.role === "owner" ? "Owner" : "Manager"}>
              <Input
                value={actor.name}
                readOnly
                aria-label={scope.user.role === "owner" ? "Owner" : "Manager"}
              />
            </ExpenseField>
            {scope.user.role === "owner" ? (
              <ExpenseField label="Branch (optional)">
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
                  <SelectTrigger aria-label="Expense branch">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Business-wide</SelectItem>
                    {tenantBranches.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.branchId && <FieldError message={errors.branchId} />}
              </ExpenseField>
            ) : (
              <ExpenseField label="Branch">
                <Input value={branch?.name ?? ""} readOnly aria-label="Branch" />
              </ExpenseField>
            )}
            <ExpenseField label="Description" className="sm:col-span-2">
              <Input
                value={form.description}
                onChange={(event) => set("description", event.target.value)}
                aria-label="Expense description"
              />
              {errors.description && <FieldError message={errors.description} />}
            </ExpenseField>
            <ExpenseField label="Optional note" className="sm:col-span-2">
              <Textarea
                value={form.note ?? ""}
                onChange={(event) => set("note", event.target.value)}
                aria-label="Expense note"
              />
              {errors.note && <FieldError message={errors.note} />}
            </ExpenseField>
          </div>
          {errors.form && <FieldError message={errors.form} />}
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button disabled={busy} onClick={save}>
              {busy ? "Saving…" : editingId ? "Save Changes" : "Record Expense"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={!!voidExpense} onOpenChange={(open) => !busy && !open && setVoidId(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Void Expense?</DialogTitle>
            <DialogDescription>
              This expense will remain in the audit history and stop reducing remittance.
            </DialogDescription>
          </DialogHeader>
          {voidExpense && (
            <p className="rounded-md bg-muted p-3 text-xs">
              {voidExpense.description} · {formatNaira(voidExpense.amount)}
            </p>
          )}
          <div>
            <Label htmlFor="void-reason" className="text-xs">
              Reason
            </Label>
            <Textarea
              id="void-reason"
              className="mt-1.5"
              value={voidReason}
              onChange={(event) => {
                setVoidReason(event.target.value);
                setReasonError("");
              }}
            />
            {reasonError && <FieldError message={reasonError} />}
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setVoidId(null)}>
              Cancel
            </Button>
            <Button
              variant="outline"
              className="border-destructive/40 text-destructive"
              disabled={busy || !voidReason.trim()}
              onClick={voidRecord}
            >
              {busy ? "Voiding…" : "Void Expense"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={!!view} onOpenChange={(open) => !open && setViewId(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Expense details</DialogTitle>
            <DialogDescription>{view?.id}</DialogDescription>
          </DialogHeader>
          {view && (
            <dl className="divide-y divide-border text-xs">
              {[
                ["Date", formatDate(view.expenseDate)],
                ["Category", expenseCategoryLabel[view.category]],
                ["Description", view.description],
                ["Amount", formatNaira(view.amount)],
                [
                  "Branch",
                  (view.branchId && db.branches.find((item) => item.id === view.branchId)?.name) ??
                    "Business-wide",
                ],
                [
                  "Created By",
                  db.users.find((user) => user.id === (view.ownerId ?? view.managerId))?.name ??
                    "—",
                ],
                ["Status", view.status],
                ["Created At", formatDate(view.createdAt)],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between gap-4 py-2.5">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="text-right font-semibold capitalize">{value}</dd>
                </div>
              ))}
            </dl>
          )}
          {view && (
            <div className="border-t border-border pt-3">
              <p className="mb-2 text-xs font-semibold">Expense history</p>
              {db.activities
                .filter((event) => event.entity === "expense" && event.entityId === view.id)
                .map((event) => (
                  <p key={event.id} className="py-1 text-[11px] text-muted-foreground">
                    {event.action.replaceAll("_", " ")} · {formatDate(event.createdAt)} ·{" "}
                    {event.subject}
                  </p>
                ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function ExpenseField({
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
function ExpenseBadge({ status }: { status: Expense["status"] }) {
  return (
    <Badge
      variant="outline"
      className={
        status === "recorded"
          ? "border-success/30 bg-success/5 text-success"
          : "border-muted-foreground/30 bg-muted text-muted-foreground"
      }
    >
      {status === "recorded" ? "Recorded" : "Voided"}
    </Badge>
  );
}
function ExpenseActions({
  expense,
  canManage,
  onView,
  onEdit,
  onVoid,
}: {
  expense: Expense;
  canManage: boolean;
  onView: () => void;
  onEdit: () => void;
  onVoid: () => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <Button
        size="icon"
        variant="ghost"
        className="size-8"
        aria-label={`View ${expense.id}`}
        onClick={onView}
      >
        <Eye className="size-4" />
      </Button>
      {expense.status === "recorded" && canManage && (
        <>
          <Button
            size="icon"
            variant="ghost"
            className="size-8"
            aria-label={`Edit ${expense.id}`}
            onClick={onEdit}
          >
            <Pencil className="size-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="size-8 text-destructive"
            aria-label={`Void ${expense.id}`}
            onClick={onVoid}
          >
            <Ban className="size-4" />
          </Button>
        </>
      )}
    </div>
  );
}
