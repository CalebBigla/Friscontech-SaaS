import { useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, CircleDollarSign, Eye, Flag, Pencil, Plus, Target as TargetIcon, TrendingUp, Users } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { ALL, EmptyState, FilterSelect, MetricCard, Panel, SearchBox } from "@/components/shared";
import { EditTargetDialog, SetTargetDialog, monthOptions } from "@/components/targets/target-dialogs";
import { TargetProgressBar, TargetStatusBadge } from "@/components/targets/target-shared";
import type { Target } from "@/data/mock-db";
import { useDb } from "@/services/mock-store";
import { getAccessScope, useCurrentUserId } from "@/lib/session";
import { getMonthTargets, getTargetSummary, shiftMonth, targetStatusLabel, type TargetStatus } from "@/lib/catalog-calculations";
import { monthOf } from "@/lib/dates";
import { formatCompactNaira, formatMonth, formatNaira, formatNumber, formatPercent } from "@/lib/format";

export function TargetsPage({ month: monthParam }: { month?: string | undefined }) {
  const db = useDb();
  const userId = useCurrentUserId();
  const scope = getAccessScope(db, userId);
  const navigate = useNavigate();
  const current = monthOf(db.tenant.referenceDate);
  const month = monthParam && /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : current;
  const setMonth = (m: string) => navigate({ to: "/targets", search: { month: m === current ? undefined : m } });
  const [query, setQuery] = useState("");
  const [branchId, setBranchId] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Target | null>(null);

  const all = getMonthTargets(db, month, scope.branchIds);
  const summary = getTargetSummary(all);
  const rep = (id: string) => db.users.find((u) => u.id === id);
  const branch = (id: string) => db.branches.find((b) => b.id === id);
  const branches = db.branches.filter((b) => !scope.branchIds || scope.branchIds.includes(b.id));
  const rows = useMemo(() => all
    .filter((r) => (branchId === ALL || r.target.branchId === branchId) && (status === ALL || r.status === status) && (!query.trim() || (rep(r.repId)?.name ?? "").toLowerCase().includes(query.trim().toLowerCase())))
    .sort((a, b) => b.achievement - a.achievement), // eslint-disable-line react-hooks/exhaustive-deps
  [all, branchId, status, query]);

  const monthPicker = (
    <div className="flex items-center gap-1">
      <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month"><ChevronLeft className="size-4" /></Button>
      <FilterSelect label="Target month" className="w-40" value={month} onChange={setMonth} options={monthOptions(current).some((o) => o.value === month) ? monthOptions(current) : [{ value: month, label: formatMonth(month) }, ...monthOptions(current)]} />
      <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Next month"><ChevronRight className="size-4" /></Button>
    </div>
  );

  return (
    <AppShell title="Targets" subtitle="Monthly sales targets for sales representatives" actions={<Button onClick={() => setCreating(true)}><Plus className="size-4" /><span className="hidden sm:inline">Set Target</span></Button>}>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div><h1 className="text-xl font-bold">Targets · {formatMonth(month)}</h1><p className="mt-1 text-xs text-muted-foreground">Achievement is calculated live from each rep's completed sales.</p></div>
        {monthPicker}
      </div>
      <div className="mb-5 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-5">
        <MetricCard icon={Flag} tone="brand" label="Total targets" value={formatNumber(summary.count)} detail="Rep targets this month" />
        <MetricCard icon={TargetIcon} tone="violet" label="Total target value" value={formatCompactNaira(summary.total)} detail={formatNaira(summary.total)} />
        <MetricCard icon={CircleDollarSign} tone="success" label="Total achieved" value={formatCompactNaira(summary.achieved)} detail="From recorded sales" />
        <MetricCard icon={TrendingUp} tone="warning" label="Overall progress" value={summary.progress > 100 ? "100%+" : formatPercent(summary.progress, 1)} detail="Achieved ÷ target" />
        <MetricCard icon={Users} tone="success" label="Reps on target" value={`${summary.onTarget} / ${summary.count}`} detail="On track, met or exceeded" />
      </div>
      <Panel className="overflow-hidden" title="Rep performance" subtitle={`${rows.length} of ${all.length} targets`} action={
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <SearchBox value={query} onChange={setQuery} placeholder="Search sales rep" className="sm:w-52" />
          {!scope.branchIds || scope.branchIds.length > 1 ? <FilterSelect label="Branch filter" className="w-full sm:w-44" value={branchId} onChange={setBranchId} options={[{ value: ALL, label: "All branches" }, ...branches.map((b) => ({ value: b.id, label: b.name }))]} /> : null}
          <FilterSelect label="Status filter" className="w-full sm:w-36" value={status} onChange={setStatus} options={[{ value: ALL, label: "All statuses" }, ...(Object.keys(targetStatusLabel) as TargetStatus[]).map((s) => ({ value: s, label: targetStatusLabel[s] }))]} />
        </div>}>
        <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[900px] text-left">
          <thead><tr className="text-[10px] uppercase text-muted-foreground"><th className="px-5 py-3">Sales rep</th><th className="px-5 py-3">Branch</th><th className="px-5 py-3 text-right">Target</th><th className="px-5 py-3 text-right">Achieved</th><th className="px-5 py-3 text-right">Remaining</th><th className="w-44 px-5 py-3">Progress</th><th className="px-5 py-3">Status</th><th className="px-5 py-3 text-right">Actions</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.target.id} className="border-t border-border text-xs">
              <td className="px-5 py-3 font-bold"><Link to="/targets/$targetId" params={{ targetId: r.target.id }} className="hover:text-primary">{rep(r.repId)?.name}</Link></td>
              <td className="px-5 py-3">{branch(r.target.branchId)?.name}</td>
              <td className="px-5 py-3 text-right font-semibold">{formatNaira(r.amount)}</td><td className="px-5 py-3 text-right">{formatNaira(r.achieved)}</td>
              <td className="px-5 py-3 text-right text-muted-foreground">{formatNaira(r.remaining)}</td>
              <td className="px-5 py-3"><TargetProgressBar p={r} /></td><td className="px-5 py-3"><TargetStatusBadge status={r.status} /></td>
              <td className="px-5 py-3 text-right"><div className="flex justify-end gap-1"><Button variant="ghost" size="icon" asChild aria-label="View target"><Link to="/targets/$targetId" params={{ targetId: r.target.id }}><Eye className="size-4" /></Link></Button><Button variant="ghost" size="icon" aria-label="Edit target" onClick={() => setEditing(r.target)}><Pencil className="size-4" /></Button></div></td>
            </tr>))}</tbody>
        </table></div>
        <div className="divide-y divide-border md:hidden">{rows.map((r) => (
          <div key={r.target.id} className="p-4">
            <div className="flex items-start justify-between gap-3"><Link to="/targets/$targetId" params={{ targetId: r.target.id }} className="min-w-0"><p className="truncate text-sm font-bold">{rep(r.repId)?.name}</p><p className="text-[11px] text-muted-foreground">{branch(r.target.branchId)?.name}</p></Link><TargetStatusBadge status={r.status} /></div>
            <p className="mt-3 text-xs"><strong>{formatCompactNaira(r.achieved)}</strong> <span className="text-muted-foreground">/ {formatCompactNaira(r.amount)} · {formatCompactNaira(r.remaining)} left</span></p>
            <div className="mt-2"><TargetProgressBar p={r} /></div>
            <div className="mt-3 flex gap-2"><Button variant="outline" size="sm" asChild><Link to="/targets/$targetId" params={{ targetId: r.target.id }}>View</Link></Button><Button variant="outline" size="sm" onClick={() => setEditing(r.target)}>Edit</Button></div>
          </div>))}</div>
        {!rows.length && <EmptyState title={all.length ? "No targets match your filters." : "No targets have been set for this month."} {...(all.length ? {} : { detail: "Use Set Target to add one." })} />}
      </Panel>
      <SetTargetDialog open={creating} onOpenChange={setCreating} scope={scope} defaultMonth={month} onEditExisting={setEditing} />
      <EditTargetDialog target={editing} onClose={() => setEditing(null)} actorId={userId} />
    </AppShell>
  );
}
