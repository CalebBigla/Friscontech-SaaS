import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Boxes, CircleDollarSign, Mail, MapPin, Pencil, Phone, Power, Target, UserRound, Users } from "lucide-react";

import { AppShell, RestrictedNotice } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { BandBadge, BranchStatusBadge, EmptyState, MetricCard, Panel, ProgressBar } from "@/components/shared";
import { BranchFormDialog } from "@/components/branches/branch-form-dialog";
import { DeactivateBranchDialog } from "@/components/branches/deactivate-dialog";
import { useDb } from "@/services/mock-store";
import { canSeeBranch, getAccessScope, useCurrentUserId } from "@/lib/session";
import { filterSales, getBranchInventoryHealth, getBranchManager, getBranchPerformance, getBranchStaff, saleTotal } from "@/lib/calculations";
import { monthOf } from "@/lib/dates";
import { formatDate, formatMonth, formatNaira, formatPercent, initials, roleLabel } from "@/lib/format";

export function BranchDetailsPage({ branchId }: { branchId: string }) {
  const db = useDb();
  const userId = useCurrentUserId();
  const scope = getAccessScope(db, userId);
  const [editOpen, setEditOpen] = useState(false);
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const branch = db.branches.find((b) => b.id === branchId);

  if (!branch) return <AppShell title="Branch not found"><EmptyState title="Branch not found" detail="It may have been removed or the link is incorrect." /><div className="text-center"><Button variant="outline" asChild><Link to="/branches">Back to branches</Link></Button></div></AppShell>;
  if (!canSeeBranch(scope, branch.id)) return <AppShell title={branch.name}><RestrictedNotice message="You can only view your assigned branch." /></AppShell>;

  const month = monthOf(db.tenant.referenceDate);
  const perf = getBranchPerformance(db, branch.id, month);
  const manager = getBranchManager(db, branch);
  const staff = getBranchStaff(db, branch.id).sort((a, b) => (a.role === "manager" ? -1 : b.role === "manager" ? 1 : a.name.localeCompare(b.name)));
  const inv = getBranchInventoryHealth(db, branch.id);
  const sales = filterSales(db, { branchId: branch.id, repId: scope.repId, includeNonCompleted: true }).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 8);
  const userName = (id: string) => db.users.find((x) => x.id === id)?.name ?? "—";
  const productName = (id: string) => db.products.find((x) => x.id === id)?.name ?? "—";

  return (
    <AppShell title={branch.name} subtitle={`${branch.code} · ${branch.location}`}
      actions={scope.canManageBranches && <div className="flex gap-2">
        <Button variant="outline" onClick={() => setEditOpen(true)}><Pencil className="size-4" /><span className="hidden sm:inline">Edit</span></Button>
        {branch.status === "active" && <Button variant="outline" className="text-destructive" onClick={() => setDeactivateOpen(true)}><Power className="size-4" /><span className="hidden sm:inline">Deactivate</span></Button>}
      </div>}>
      <Link to="/branches" className="mb-4 inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground"><ArrowLeft className="size-3" />All branches</Link>
      <div className="mb-5 flex flex-col gap-3 rounded-lg border border-border bg-card p-5 shadow-panel sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2"><h1 className="text-xl font-bold">{branch.name}</h1><span className="font-mono text-xs text-muted-foreground">{branch.code}</span><BranchStatusBadge status={branch.status} /></div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1"><MapPin className="size-3" />{branch.location} · {branch.address}</span>
            {branch.phone && <span className="inline-flex items-center gap-1"><Phone className="size-3" />{branch.phone}</span>}
            {branch.email && <span className="inline-flex items-center gap-1"><Mail className="size-3" />{branch.email}</span>}
          </div>
        </div>
        <div className="text-xs"><p className="text-muted-foreground">Manager</p><p className="font-bold">{manager?.name ?? "Unassigned"}</p></div>
      </div>

      <section className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <MetricCard icon={CircleDollarSign} tone="success" label={`Monthly revenue · ${formatMonth(month)}`} value={formatNaira(perf.revenue)} detail="Completed sales, month to date" />
        <MetricCard icon={Target} tone="brand" label="Monthly target" value={formatNaira(perf.target)} detail={`${formatNaira(perf.remaining)} remaining`} />
        <MetricCard icon={Users} tone="violet" label="Staff count" value={String(staff.length)} detail={`${staff.filter((s) => s.role === "sales_rep").length} sales representatives`} />
        <MetricCard icon={Boxes} tone="warning" label="Inventory health" value={formatPercent(inv.healthPct, 0)} detail={`${inv.low} low · ${inv.out} out of stock`} badge={inv.status} />
      </section>

      <section className="mt-4 grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <Panel title="Branch performance" subtitle={`Target achievement for ${formatMonth(month)}`} action={<BandBadge band={perf.band} />}>
          <div className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-4">
            {[["Monthly revenue", formatNaira(perf.revenue)], ["Monthly target", formatNaira(perf.target)], ["Achievement", formatPercent(perf.achievement, 2)], ["Remaining target", formatNaira(perf.remaining)]].map(([k, v]) => <div key={k}><p className="text-[11px] text-muted-foreground">{k}</p><p className="mt-1 text-base font-bold">{v}</p></div>)}
          </div>
          <div className="px-5 pb-5"><ProgressBar value={perf.achievement} band={perf.band} /></div>
        </Panel>
        <Panel title="Inventory summary" subtitle="From branch stock records" action={<Button variant="ghost" size="sm" asChild><Link to="/inventory" search={{ branch: branch.id }}>View inventory</Link></Button>}>
          <div className="grid grid-cols-2 gap-4 p-5">
            {[["Total products", String(inv.total)], ["Low stock", String(inv.low)], ["Out of stock", String(inv.out)], ["Units on hand", inv.units.toLocaleString("en-NG")], ["Inventory value", formatNaira(inv.value)], ["Inventory health", `${formatPercent(inv.healthPct, 0)} · ${inv.status}`]].map(([k, v]) => <div key={k}><p className="text-[11px] text-muted-foreground">{k}</p><p className="mt-1 text-base font-bold">{v}</p></div>)}
          </div>
        </Panel>
      </section>

      <section className="mt-4 grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <Panel title="Recent sales" subtitle={scope.repId ? "Your latest sales at this branch" : "Latest transactions at this branch"} className="overflow-hidden"
          action={scope.canViewSales && <Button variant="outline" size="sm" asChild><Link to="/sales" search={{ branch: branch.id }}>View All Sales</Link></Button>}>
          {scope.canViewSales ? (sales.length ? (
            <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left"><thead><tr className="text-[10px] uppercase text-muted-foreground"><th className="px-5 py-3">Sales rep</th><th className="px-5 py-3">Product</th><th className="px-5 py-3">Qty</th><th className="px-5 py-3">Revenue</th><th className="px-5 py-3 text-right">Date</th></tr></thead>
              <tbody>{sales.map((s) => <tr key={s.id} className="border-t border-border text-xs"><td className="px-5 py-3 font-semibold">{userName(s.salesRepId)}</td><td className="px-5 py-3 text-muted-foreground">{productName(s.productId)}</td><td className="px-5 py-3">{s.quantity}</td><td className="px-5 py-3 font-bold">{formatNaira(saleTotal(s))}</td><td className="px-5 py-3 text-right text-muted-foreground">{formatDate(s.saleDate)}</td></tr>)}</tbody></table></div>
          ) : <EmptyState title="No sales yet" />) : <EmptyState title="Sales are not available for your role" />}
        </Panel>
        <Panel title="Branch staff" subtitle={`${staff.length} team members`}>
          <div className="divide-y divide-border">{staff.map((s) => <div key={s.id} className="flex items-center gap-3 px-5 py-3"><span className="grid size-8 place-items-center rounded-full bg-avatar text-[11px] font-bold text-primary">{initials(s.name)}</span><div className="min-w-0 flex-1"><p className="truncate text-xs font-bold">{s.name}</p><p className="text-[11px] text-muted-foreground">{roleLabel[s.role]}</p></div>{s.role === "manager" && <UserRound className="size-4 text-primary" />}</div>)}
            {staff.length === 0 && <EmptyState title="No staff assigned" />}</div>
        </Panel>
      </section>

      <BranchFormDialog open={editOpen} onOpenChange={setEditOpen} branch={branch} actorId={userId} />
      <DeactivateBranchDialog branch={deactivateOpen ? branch : null} onClose={() => setDeactivateOpen(false)} actorId={userId} />
    </AppShell>
  );
}
