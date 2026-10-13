import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Plus } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { CustomerFormDialog } from "@/components/customers/customer-dialogs";
import { EmptyState, FilterSelect, Panel, SearchBox, StatTile } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { getCustomerSummary, getCustomersForScope } from "@/lib/customer-calculations";
import { formatNaira } from "@/lib/format";
import { getAccessScope, useCurrentUserId } from "@/lib/session";
import { useDb } from "@/services/mock-store";

export function BalanceBadge({ balance }: { balance: number }) {
  if (balance < 0) return <span className="status status-danger whitespace-nowrap">Owes {formatNaira(-balance)}</span>;
  if (balance > 0) return <span className="status status-success whitespace-nowrap">In credit {formatNaira(balance)}</span>;
  return <span className="status status-brand whitespace-nowrap">Settled</span>;
}

export function CustomersPage() {
  const db = useDb();
  const userId = useCurrentUserId();
  const scope = getAccessScope(db, userId);
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("active");
  const [balance, setBalance] = useState("all");
  const [branchId, setBranchId] = useState("all");
  const [addOpen, setAddOpen] = useState(false);

  const all = useMemo(
    () => getCustomersForScope(db, scope).map((c) => ({ customer: c, summary: getCustomerSummary(db, c) })),
    [db, scope],
  );
  const needle = q.trim().toLowerCase();
  const rows = all.filter(
    ({ customer: c, summary: s }) =>
      (status === "all" || c.status === status) &&
      (branchId === "all" || c.branchId === branchId) &&
      (balance === "all" || (balance === "owes" ? s.balance < 0 : balance === "credit" ? s.balance > 0 : s.balance === 0)) &&
      (!needle || [c.name, c.contactPerson, c.phone, c.email].some((v) => v.toLowerCase().includes(needle))),
  );
  const totalOwed = all.reduce((sum, r) => sum + r.summary.owed, 0);
  const owing = all.filter((r) => r.summary.balance < 0).length;
  const pending = all.reduce((sum, r) => sum + r.summary.pending, 0);
  const branches = db.branches.filter((b) => scope.branchIds === null || scope.branchIds.includes(b.id));
  const branchName = (id: string | null) => (id ? (db.branches.find((b) => b.id === id)?.name ?? "—") : "All branches");

  return (
    <AppShell title="Customers" subtitle="Registered customers who buy on account">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-bold">Customers</h1>
          <p className="mt-1 text-xs text-muted-foreground">Walk-in buyers are sold to directly in Sales and have no account.</p>
        </div>
        {scope.canManageCustomers && (
          <Button size="sm" onClick={() => setAddOpen(true)}><Plus className="size-4" />Add customer</Button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Customers" value={String(all.filter((r) => r.customer.status === "active").length)} detail={`${all.length} registered`} />
        <StatTile tone="danger" label="Total owed" value={formatNaira(totalOwed)} detail={`${owing} customer${owing === 1 ? "" : "s"} owe`} />
        <StatTile tone="warning" label="Payments awaiting confirmation" value={formatNaira(pending)} detail="Not yet credited" />
        <StatTile tone="success" label="Confirmed payments" value={formatNaira(all.reduce((s, r) => s + r.summary.credits, 0))} />
      </div>
      <Panel
        title="Customer accounts"
        className="mt-4"
        action={
          <div className="flex flex-wrap gap-2">
            <SearchBox value={q} onChange={setQ} placeholder="Search name, phone, email" />
            {scope.branchIds === null && (
              <FilterSelect label="Branch" value={branchId} onChange={setBranchId} className="w-36" options={[{ value: "all", label: "All branches" }, ...branches.map((b) => ({ value: b.id, label: b.name }))]} />
            )}
            <FilterSelect label="Balance" value={balance} onChange={setBalance} className="w-32" options={[{ value: "all", label: "Any balance" }, { value: "owes", label: "Owes" }, { value: "credit", label: "In credit" }, { value: "settled", label: "Settled" }]} />
            <FilterSelect label="Status" value={status} onChange={setStatus} className="w-28" options={[{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }, { value: "all", label: "All" }]} />
          </div>
        }
      >
        {rows.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-xs">
              <thead className="border-b border-border bg-muted/40 text-[10px] uppercase text-muted-foreground">
                <tr>{["Customer", "Phone", "Branch", "Orders", "Balance", ""].map((h) => <th key={h} className="px-4 py-3 font-semibold">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map(({ customer: c, summary: s }) => (
                  <tr key={c.id} className="cursor-pointer hover:bg-muted/40" tabIndex={0} onClick={() => navigate({ to: "/customers/$customerId", params: { customerId: c.id } })} onKeyDown={(e) => e.key === "Enter" && navigate({ to: "/customers/$customerId", params: { customerId: c.id } })}>
                    <td className="px-4 py-3"><p className="font-semibold">{c.name}</p><p className="text-[10px] text-muted-foreground">{c.contactPerson || c.email || "—"}</p></td>
                    <td className="px-4 py-3">{c.phone}</td>
                    <td className="px-4 py-3 text-muted-foreground">{branchName(c.branchId)}</td>
                    <td className="px-4 py-3">{s.orders}</td>
                    <td className="px-4 py-3"><span className={`font-bold tabular-nums ${s.balance < 0 ? "text-destructive" : ""}`}>{formatNaira(s.balance)}</span></td>
                    <td className="px-4 py-3 text-right">{c.status === "inactive" ? <span className="status status-warning">Inactive</span> : <BalanceBadge balance={s.balance} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title={all.length ? "No customers match these filters." : "No customers yet."} {...(scope.canManageCustomers ? { detail: "Add a customer to start selling on account." } : {})} />
        )}
      </Panel>
      {scope.canManageCustomers && <CustomerFormDialog open={addOpen} onOpenChange={setAddOpen} actorId={userId} onSaved={(c) => navigate({ to: "/customers/$customerId", params: { customerId: c.id } })} />}
    </AppShell>
  );
}
