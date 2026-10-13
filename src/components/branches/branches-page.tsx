import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, ArrowUpDown, Building2, CircleOff, Eye, MoreHorizontal, Pencil, Plus, Power, Search, Store, Users } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ALL, BandBadge, BranchStatusBadge, EmptyState, FilterSelect, MetricCard, Panel } from "@/components/shared";
import { BranchFormDialog } from "@/components/branches/branch-form-dialog";
import { DeactivateBranchDialog } from "@/components/branches/deactivate-dialog";
import type { Branch } from "@/data/mock-db";
import { useDb } from "@/services/mock-store";
import { getAccessScope, useCurrentUserId } from "@/lib/session";
import { getBranchManager, getBranchPerformance, getBranchStaff } from "@/lib/calculations";
import { monthOf } from "@/lib/dates";
import { formatMonth, formatNaira, formatPercent } from "@/lib/format";

type SortKey = "name" | "revenue" | "target" | "achievement" | "staff" | "status";

export function BranchesPage() {
  const db = useDb();
  const userId = useCurrentUserId();
  const scope = getAccessScope(db, userId);
  const month = monthOf(db.tenant.referenceDate);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState(ALL);
  const [band, setBand] = useState(ALL);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "revenue", dir: -1 });
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Branch | null>(null);
  const [deactivating, setDeactivating] = useState<Branch | null>(null);

  const rows = useMemo(() => db.branches
    .filter((b) => !scope.branchIds || scope.branchIds.includes(b.id))
    .map((b) => ({ branch: b, manager: getBranchManager(db, b), staff: getBranchStaff(db, b.id).length, ...getBranchPerformance(db, b.id, month) })), [db, scope.branchIds, month]);

  const summary = {
    total: rows.length,
    active: rows.filter((r) => r.branch.status === "active").length,
    staff: rows.filter((r) => r.branch.status === "active").reduce((s, r) => s + r.staff, 0),
  };

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const list = rows.filter((r) =>
      (!needle || `${r.branch.name} ${r.branch.code} ${r.branch.location} ${r.manager?.name ?? ""}`.toLowerCase().includes(needle)) &&
      (status === ALL || r.branch.status === status) && (band === ALL || r.band === band));
    const val = (r: (typeof rows)[number]) => sort.key === "name" ? r.branch.name : sort.key === "status" ? r.branch.status : r[sort.key];
    return [...list].sort((a, b) => { const x = val(a), y = val(b); return (x < y ? -1 : x > y ? 1 : 0) * sort.dir; });
  }, [rows, query, status, band, sort]);

  const toggleSort = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: key === "name" || key === "status" ? 1 : -1 }));
  const SortHead = ({ k, label, right }: { k: SortKey; label: string; right?: boolean }) => (
    <th className={`px-4 py-3 ${right ? "text-right" : ""}`}>
      <button onClick={() => toggleSort(k)} className="inline-flex items-center gap-1 uppercase hover:text-foreground">{label}
        {sort.key === k ? (sort.dir === 1 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />) : <ArrowUpDown className="size-3 opacity-40" />}</button>
    </th>
  );

  const actions = (b: Branch) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label={`Actions for ${b.name}`}><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild><Link to="/branches/$branchId" params={{ branchId: b.id }}><Eye className="size-4" />View</Link></DropdownMenuItem>
        {scope.canManageBranches && <DropdownMenuItem onClick={() => { setEditing(b); setFormOpen(true); }}><Pencil className="size-4" />Edit</DropdownMenuItem>}
        {scope.canManageBranches && b.status === "active" && <DropdownMenuItem className="text-destructive" onClick={() => setDeactivating(b)}><Power className="size-4" />Deactivate</DropdownMenuItem>}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <AppShell title="Branches" subtitle="Manage business locations, branch performance and operational status."
      actions={scope.canManageBranches && <Button onClick={() => { setEditing(null); setFormOpen(true); }}><Plus className="size-4" /><span className="hidden sm:inline">New Branch</span></Button>}>
      <div className="mb-5"><h1 className="text-xl font-bold">Branches</h1><p className="mt-1 text-xs text-muted-foreground">Manage business locations, branch performance and operational status · Performance for {formatMonth(month)}</p></div>

      <section className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <MetricCard icon={Building2} tone="brand" label="Total branches" value={String(summary.total)} detail="All registered locations" />
        <MetricCard icon={Store} tone="success" label="Active branches" value={String(summary.active)} detail="Currently operating" />
        <MetricCard icon={CircleOff} tone="warning" label="Inactive branches" value={String(summary.total - summary.active)} detail="History preserved" />
        <MetricCard icon={Users} tone="violet" label="Total branch staff" value={String(summary.staff)} detail="Across active branches" />
      </section>

      <Panel className="mt-4 overflow-hidden" title="All branches" subtitle={`${visible.length} of ${rows.length} branches`}
        action={<div className="flex flex-col gap-2 sm:flex-row">
          <label className="flex h-9 items-center gap-2 rounded-md border border-border bg-muted px-3 sm:w-60">
            <Search className="size-4 text-muted-foreground" /><input value={query} onChange={(e) => setQuery(e.target.value)} className="w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground" placeholder="Search name, code, location, manager" aria-label="Search branches" />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <FilterSelect label="Status filter" className="w-full sm:w-32" value={status} onChange={setStatus} options={[{ value: ALL, label: "All statuses" }, { value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }]} />
            <FilterSelect label="Performance filter" className="w-full sm:w-40" value={band} onChange={setBand} options={[{ value: ALL, label: "All performance" }, { value: "exceeding", label: "Exceeding target" }, { value: "on_track", label: "On track" }, { value: "behind", label: "Behind target" }]} />
          </div>
          <div className="md:hidden"><FilterSelect label="Sort by" className="w-full" value={`${sort.key}:${sort.dir}`} onChange={(v) => { const [key, dir] = v.split(":"); setSort({ key: key as SortKey, dir: Number(dir) as 1 | -1 }); }}
            options={[["name:1", "Name A–Z"], ["revenue:-1", "Highest revenue"], ["target:-1", "Highest target"], ["achievement:-1", "Best performance"], ["staff:-1", "Most staff"], ["status:1", "Status"]].map(([value = "", label = ""]) => ({ value, label }))} /></div>
        </div>}>
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[980px] text-left">
            <thead><tr className="text-[10px] uppercase text-muted-foreground">
              <SortHead k="name" label="Branch" /><th className="px-4 py-3">Code</th><th className="px-4 py-3">Location</th><th className="px-4 py-3">Manager</th>
              <SortHead k="staff" label="Staff" /><SortHead k="revenue" label="Revenue" /><SortHead k="target" label="Target" /><SortHead k="achievement" label="Performance" /><SortHead k="status" label="Status" /><th className="px-4 py-3 text-right">Actions</th>
            </tr></thead>
            <tbody>{visible.map((r) => (
              <tr key={r.branch.id} className="border-t border-border text-xs">
                <td className="px-4 py-3.5 font-bold"><Link to="/branches/$branchId" params={{ branchId: r.branch.id }} className="hover:text-primary">{r.branch.name}</Link></td>
                <td className="px-4 py-3.5 font-mono text-[11px] text-muted-foreground">{r.branch.code}</td>
                <td className="px-4 py-3.5 text-muted-foreground">{r.branch.location}</td>
                <td className="px-4 py-3.5">{r.manager?.name ?? "Unassigned"}</td>
                <td className="px-4 py-3.5 font-semibold">{r.staff}</td>
                <td className="px-4 py-3.5 font-bold">{formatNaira(r.revenue)}</td>
                <td className="px-4 py-3.5 text-muted-foreground">{formatNaira(r.target)}</td>
                <td className="px-4 py-3.5"><div className="flex items-center gap-2"><strong>{formatPercent(r.achievement, 2)}</strong><BandBadge band={r.band} /></div></td>
                <td className="px-4 py-3.5"><BranchStatusBadge status={r.branch.status} /></td>
                <td className="px-4 py-2 text-right">{actions(r.branch)}</td>
              </tr>))}</tbody>
          </table>
        </div>
        <div className="divide-y divide-border md:hidden">{visible.map((r) => (
          <div key={r.branch.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0"><Link to="/branches/$branchId" params={{ branchId: r.branch.id }} className="text-sm font-bold">{r.branch.name}</Link><p className="text-[11px] text-muted-foreground">{r.branch.code} · {r.branch.location}</p></div>
              <div className="flex items-center gap-1"><BranchStatusBadge status={r.branch.status} />{actions(r.branch)}</div>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
              <div><p className="text-muted-foreground">Revenue</p><p className="font-bold">{formatNaira(r.revenue)}</p></div>
              <div><p className="text-muted-foreground">Target</p><p className="font-bold">{formatNaira(r.target)}</p></div>
              <div><p className="text-muted-foreground">Performance</p><p className="font-bold">{formatPercent(r.achievement, 2)}</p></div>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">{r.manager?.name ?? "Unassigned"} · {r.staff} staff</p>
          </div>))}</div>
        {visible.length === 0 && <EmptyState title="No branches found" detail="Try a different search or clear the filters." />}
      </Panel>

      <BranchFormDialog open={formOpen} onOpenChange={setFormOpen} branch={editing} actorId={userId} />
      <DeactivateBranchDialog branch={deactivating} onClose={() => setDeactivating(null)} actorId={userId} />
    </AppShell>
  );
}
