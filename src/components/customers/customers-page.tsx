import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Download, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { CustomerFormDialog } from "@/components/customers/customer-dialogs";
import { DataGate, EmptyState, FilterSelect, Panel, SearchBox, StatTile } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { getCustomerSummary, getCustomersForScope, needsReassignment } from "@/lib/customer-calculations";
import { formatNaira, formatNumber } from "@/lib/format";
import { getAccessScope, useCurrentUserId } from "@/lib/session";
import { useCustomerAccounts } from "@/hooks/use-customers";
import { useLiveWorkspace } from "@/hooks/use-live-workspace";

export function BalanceBadge({ balance }: { balance: number }) {
  if (balance < 0)
    return (
      <span className="status status-danger whitespace-nowrap">Owes {formatNaira(-balance)}</span>
    );
  if (balance > 0)
    return (
      <span className="status status-success whitespace-nowrap">
        In credit {formatNaira(balance)}
      </span>
    );
  return <span className="status status-brand whitespace-nowrap">Settled</span>;
}

export function CustomersPage() {
  const { db, isLoading: workspaceLoading, error: workspaceError } = useLiveWorkspace();
  const userId = useCurrentUserId();
  const scope = getAccessScope(db, userId);
  const { accounts, isLoading: accountsLoading, error: accountsError } = useCustomerAccounts(db, scope);
  const isLoading = workspaceLoading || accountsLoading;
  const error = workspaceError ?? accountsError;
  const isOwner = scope.user.role === "owner";
  const [repFilter, setRepFilter] = useState("all");
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("active");
  const [balance, setBalance] = useState("all");
  const [branchId, setBranchId] = useState("all");
  const [addOpen, setAddOpen] = useState(false);

  const all = useMemo(
    () =>
      getCustomersForScope(db, scope).map((c) => ({
        customer: c,
        summary: getCustomerSummary(accounts, c),
        unmanaged: needsReassignment(db, c),
      })),
    [db, accounts, scope],
  );
  const needle = q.trim().toLowerCase();
  const rows = all.filter(
    ({ customer: c, summary: s, unmanaged }) =>
      (repFilter === "all" || (repFilter === "unmanaged" ? unmanaged : c.assignedRepId === repFilter)) &&
      (status === "all" || c.status === status) &&
      (branchId === "all" || c.branchId === branchId) &&
      (balance === "all" ||
        (balance === "owes"
          ? s.balance < 0
          : balance === "credit"
            ? s.balance > 0
            : s.balance === 0)) &&
      (!needle ||
        [c.name, c.contactPerson, c.phone, c.email].some((v) => v.toLowerCase().includes(needle))),
  );
  const unmanagedCount = all.filter((r) => r.unmanaged).length;
  const repName = (id: string | null) => db.users.find((u) => u.id === id)?.name ?? "—";
  const totalOwed = all.reduce((sum, r) => sum + r.summary.owed, 0);
  const owing = all.filter((r) => r.summary.balance < 0).length;
  const pending = all.reduce((sum, r) => sum + r.summary.pending, 0);
  const branches = db.branches.filter(
    (b) => scope.branchIds === null || scope.branchIds.includes(b.id),
  );
  // Filtered by one rep: what their customers have bought, paid and still owe,
  // over the rows shown (other filters still apply).
  const repTotals = repFilter !== "all" && repFilter !== "unmanaged"
    ? {
        customers: rows.length,
        sold: rows.reduce((sum, r) => sum + r.summary.debits, 0),
        paid: rows.reduce((sum, r) => sum + r.summary.credits, 0),
        owed: rows.reduce((sum, r) => sum + r.summary.owed, 0),
        inCredit: rows.reduce((sum, r) => sum + Math.max(r.summary.balance, 0), 0),
        pending: rows.reduce((sum, r) => sum + r.summary.pending, 0),
      }
    : null;
  // Owner, managers and reps can take the table away as an Excel file (the rows shown, with filters applied).
  const canDownload = isOwner || scope.user.role === "manager" || scope.user.role === "sales_rep";
  const [exporting, setExporting] = useState(false);
  async function downloadExcel() {
    setExporting(true);
    try {
      const XLSX = await import("xlsx");
      const data = rows.map(({ customer: c, summary: s }) => ({
        Customer: c.name,
        "Contact person": c.contactPerson,
        Phone: c.phone,
        Email: c.email,
        Address: c.address,
        Branch: branchName(c.branchId),
        "Sales rep": repName(c.assignedRepId),
        Status: c.status === "active" ? "Active" : "Inactive",
        Orders: s.orders,
        "Total sold (NGN)": s.debits,
        "Total paid (NGN)": s.credits,
        "Balance (NGN)": s.balance,
        Position: s.balance < 0 ? "Owes" : s.balance > 0 ? "In credit" : "Settled",
      }));
      const ws = XLSX.utils.json_to_sheet(data);
      ws["!cols"] = Object.keys(data[0] ?? { Customer: "" }).map((k) => ({ wch: Math.max(12, k.length + 2) }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Customers");
      XLSX.writeFile(wb, `customers-${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast.success(`${rows.length} customer${rows.length === 1 ? "" : "s"} downloaded`);
    } catch (failure) {
      toast.error("Could not create the Excel file", { description: failure instanceof Error ? failure.message : undefined });
    } finally {
      setExporting(false);
    }
  }
  const branchName = (id: string | null) =>
    id ? (db.branches.find((b) => b.id === id)?.name ?? "—") : "All branches";

  return (
    <AppShell title="Customers" subtitle="Registered customers who buy on account">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-bold">Customers</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Walk-in buyers are sold to directly in Sales and have no account.
          </p>
        </div>
        <div className="flex gap-2">
          {canDownload && (
            <Button size="sm" variant="outline" disabled={exporting || !rows.length} onClick={() => void downloadExcel()}>
              {exporting ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
              Download Excel
            </Button>
          )}
          {scope.canManageCustomers && (
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="size-4" />
              Add customer
            </Button>
          )}
        </div>
      </div>
      <DataGate isLoading={isLoading} error={error}>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Customers"
          value={String(all.filter((r) => r.customer.status === "active").length)}
          detail={`${all.length} registered`}
        />
        <StatTile
          tone="danger"
          label="Total owed"
          value={formatNaira(totalOwed)}
          detail={`${owing} customer${owing === 1 ? "" : "s"} owe`}
        />
        <StatTile
          tone="warning"
          label="Payments awaiting confirmation"
          value={formatNaira(pending)}
          detail="Not yet credited"
        />
        <StatTile
          tone="success"
          label="Confirmed payments"
          value={formatNaira(all.reduce((s, r) => s + r.summary.credits, 0))}
        />
      </div>
      {isOwner && unmanagedCount > 0 && (
        <button
          type="button"
          onClick={() => setRepFilter("unmanaged")}
          className="mt-4 block w-full rounded-md bg-warning-soft p-3 text-left text-xs text-warning"
        >
          {unmanagedCount} customer{unmanagedCount === 1 ? " has" : "s have"} no active sales rep.
          Open each one to reassign it.
        </button>
      )}
      {repTotals && (
        <section aria-label={`Totals for ${repName(repFilter)}`} className="mt-4 rounded-xl border border-border bg-card p-4 shadow-panel">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm font-semibold">Totals for {repName(repFilter)}</p>
            <p className="text-xs text-muted-foreground">
              {repTotals.customers} customer{repTotals.customers === 1 ? "" : "s"} shown
            </p>
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
            {[
              ["Customers", formatNumber(repTotals.customers), "text-foreground"],
              ["Total sold", formatNaira(repTotals.sold), "text-foreground"],
              ["Total paid", formatNaira(repTotals.paid), "text-success"],
              ["Outstanding", formatNaira(repTotals.owed), repTotals.owed > 0 ? "text-destructive" : "text-foreground"],
              ["Awaiting confirmation", formatNaira(repTotals.pending), "text-warning"],
            ].map(([label, value, tone]) => (
              <div key={label} className="rounded-lg bg-muted/50 p-3">
                <dt className="text-[11px] text-muted-foreground">{label}</dt>
                <dd className={`mt-1 text-base font-bold tabular-nums ${tone}`}>{value}</dd>
              </div>
            ))}
          </dl>
          {repTotals.inCredit > 0 && (
            <p className="mt-2 text-[11px] text-muted-foreground">Customers in credit hold {formatNaira(repTotals.inCredit)} more than they owe.</p>
          )}
        </section>
      )}
      <Panel
        title="Customer accounts"
        className="mt-4"
        action={
          <div className="flex flex-wrap gap-2">
            <SearchBox value={q} onChange={setQ} placeholder="Search name, phone, email" />
            {scope.branchIds === null && (
              <FilterSelect
                label="Branch"
                value={branchId}
                onChange={setBranchId}
                className="w-36"
                options={[
                  { value: "all", label: "All branches" },
                  ...branches.map((b) => ({ value: b.id, label: b.name })),
                ]}
              />
            )}
            {isOwner && (
              <FilterSelect
                label="Sales rep"
                value={repFilter}
                onChange={setRepFilter}
                className="w-44"
                options={[
                  { value: "all", label: "All sales reps" },
                  { value: "unmanaged", label: "Needs reassignment" },
                  ...db.users
                    .filter((u) => u.role === "sales_rep" && u.status === "active")
                    .map((u) => ({ value: u.id, label: u.name })),
                ]}
              />
            )}
            <FilterSelect
              label="Balance"
              value={balance}
              onChange={setBalance}
              className="w-32"
              options={[
                { value: "all", label: "Any balance" },
                { value: "owes", label: "Owes" },
                { value: "credit", label: "In credit" },
                { value: "settled", label: "Settled" },
              ]}
            />
            <FilterSelect
              label="Status"
              value={status}
              onChange={setStatus}
              className="w-28"
              options={[
                { value: "active", label: "Active" },
                { value: "inactive", label: "Inactive" },
                { value: "all", label: "All" },
              ]}
            />
          </div>
        }
      >
        {rows.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-xs">
              <thead className="border-b border-border bg-muted/40 text-[10px] uppercase text-muted-foreground">
                <tr>
                  {["Customer", "Phone", "Branch", ...(isOwner ? ["Sales rep"] : []), "Orders", "Balance", ""].map((h) => (
                    <th key={h} className="px-4 py-3 font-semibold">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map(({ customer: c, summary: s, unmanaged }) => (
                  <tr
                    key={c.id}
                    className="cursor-pointer hover:bg-muted/40"
                    tabIndex={0}
                    onClick={() =>
                      navigate({ to: "/customers/$customerId", params: { customerId: c.id } })
                    }
                    onKeyDown={(e) =>
                      e.key === "Enter" &&
                      navigate({ to: "/customers/$customerId", params: { customerId: c.id } })
                    }
                  >
                    <td className="px-4 py-3">
                      <p className="font-semibold">{c.name}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {c.contactPerson || c.email || "—"}
                      </p>
                    </td>
                    <td className="px-4 py-3">{c.phone}</td>
                    <td className="px-4 py-3 text-muted-foreground">{branchName(c.branchId)}</td>
                    {isOwner && (
                      <td className="px-4 py-3">
                        {unmanaged ? (
                          <span className="status status-warning whitespace-nowrap">Needs reassignment</span>
                        ) : (
                          repName(c.assignedRepId)
                        )}
                      </td>
                    )}
                    <td className="px-4 py-3">{s.orders}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`font-bold tabular-nums ${s.balance < 0 ? "text-destructive" : ""}`}
                      >
                        {formatNaira(s.balance)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {c.status === "inactive" ? (
                        <span className="status status-warning">Inactive</span>
                      ) : (
                        <BalanceBadge balance={s.balance} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title={all.length ? "No customers match these filters." : "No customers yet."}
            {...(scope.canManageCustomers
              ? { detail: "Add a customer to start selling on account." }
              : {})}
          />
        )}
      </Panel>
      </DataGate>
      {scope.canManageCustomers && (
        <CustomerFormDialog
          open={addOpen}
          onOpenChange={setAddOpen}
          actorId={userId}
          onSaved={(c) => navigate({ to: "/customers/$customerId", params: { customerId: c.id } })}
        />
      )}
    </AppShell>
  );
}
