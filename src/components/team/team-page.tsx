import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpDown, Eye, MoreHorizontal, Pencil, Plus, Power, ShieldCheck, Trash2, UserCheck, Users, UserRound } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ALL, EmptyState, FilterSelect, MetricCard, Panel, SearchBox } from "@/components/shared";
import { MemberStatusBadge, MemberStatusDialog, RoleBadge, TeamMemberDialog } from "@/components/team/team-dialogs";
import type { Role, User, UserStatus } from "@/data/mock-db";
import { useDb } from "@/services/mock-store";
import { getAccessScope, useCurrentUserId } from "@/lib/session";
import { formatDate, formatDayTime, initials, roleLabel } from "@/lib/format";
import { canEditMember, getLastActivity, getTeamMembers, getTeamSummary, sortTeam, userStatusLabel, type TeamSortKey } from "@/lib/team";

export function TeamPage() {
  const db = useDb();
  const userId = useCurrentUserId();
  const scope = getAccessScope(db, userId);
  const all = useMemo(() => getTeamMembers(db, scope), [db, scope]);
  const [query, setQuery] = useState("");
  const [role, setRole] = useState(ALL);
  const [branchId, setBranchId] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [sort, setSort] = useState<TeamSortKey>("name");
  const [dir, setDir] = useState<"asc" | "desc">("asc");
  const [editing, setEditing] = useState<User | null>(null);
  const [creating, setCreating] = useState(false);
  const [toggling, setToggling] = useState<User | null>(null);

  const summary = getTeamSummary(all);
  const branches = db.branches.filter((b) => all.some((u) => u.branchId === b.id));
  const branchName = (id: string | null) => db.branches.find((b) => b.id === id)?.name ?? "Unassigned";
  const q = query.trim().toLowerCase();
  const rows = sortTeam(db, all.filter((u) => (!q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
    && (role === ALL || u.role === role) && (status === ALL || u.status === status)
    && (branchId === ALL || (branchId === "none" ? !u.branchId : u.branchId === branchId))), sort, dir);
  const roles = [...new Set(all.map((u) => u.role))] as Role[];
  const toggleSort = (k: TeamSortKey) => { if (sort === k) setDir(dir === "asc" ? "desc" : "asc"); else { setSort(k); setDir(k === "joined" || k === "activity" ? "desc" : "asc"); } };
  const Sort = ({ k, label }: { k: TeamSortKey; label: string }) => (
    <button onClick={() => toggleSort(k)} className={`inline-flex items-center gap-1 uppercase hover:text-foreground ${sort === k ? "text-foreground" : ""}`}>{label}<ArrowUpDown className="size-3" /></button>
  );
  const Actions = ({ u }: { u: User }) => {
    const editable = canEditMember(scope, u);
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label={`Actions for ${u.name}`}><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem asChild><Link to="/team/$userId" params={{ userId: u.id }}><Eye className="size-4" />View</Link></DropdownMenuItem>
          {editable && <DropdownMenuItem onClick={() => setEditing(u)}><Pencil className="size-4" />Edit</DropdownMenuItem>}
          {editable && <DropdownMenuItem onClick={() => setToggling(u)} className={u.status !== "inactive" ? "text-destructive" : ""}>{scope.user.role === "owner" && u.status !== "inactive" ? <Trash2 className="size-4" /> : <Power className="size-4" />}{u.status === "inactive" ? "Activate" : scope.user.role === "owner" ? "Delete" : "Deactivate"}</DropdownMenuItem>}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };
  const Member = ({ u }: { u: User }) => (
    <Link to="/team/$userId" params={{ userId: u.id }} className="flex min-w-0 items-center gap-3 hover:text-primary">
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-avatar text-xs font-bold text-primary">{initials(u.name)}</span>
      <span className="min-w-0"><span className="block truncate text-sm font-semibold">{u.name}</span><span className="block truncate text-[11px] text-muted-foreground">{u.email}</span></span>
    </Link>
  );
  const last = (u: User) => { const at = getLastActivity(db, u.id); return at ? formatDayTime(at, db.tenant.referenceDate) : "No activity yet"; };

  return (
    <AppShell title="Team" subtitle="Manage the people who work across your organization."
      actions={<Button size="sm" onClick={() => setCreating(true)}><Plus className="size-4" /><span className="hidden sm:inline">Add Team Member</span></Button>}>
      <div className="mb-5 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <MetricCard icon={Users} tone="brand" label="Total team members" value={String(summary.total)} detail={scope.user.role === "owner" ? "Across the organization" : "In your branch team"} />
        <MetricCard icon={UserCheck} tone="success" label="Active" value={String(summary.active)} detail={`${summary.total - summary.active} inactive or pending`} />
        <MetricCard icon={ShieldCheck} tone="violet" label="Managers" value={String(summary.managers)} detail={scope.user.role === "owner" ? "Branch leadership" : "You"} />
        <MetricCard icon={UserRound} tone="warning" label="Sales representatives" value={String(summary.reps)} detail={`${summary.storekeepers} storekeepers`} />
      </div>
      <Panel className="overflow-hidden" title="Team members" subtitle={`${rows.length} of ${all.length} members`} action={
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <SearchBox value={query} onChange={setQuery} placeholder="Search name or email" className="sm:w-56" />
          <FilterSelect label="Role filter" className="w-full sm:w-44" value={role} onChange={setRole} options={[{ value: ALL, label: "All roles" }, ...roles.map((r) => ({ value: r, label: roleLabel[r] }))]} />
          {scope.user.role === "owner" && <FilterSelect label="Branch filter" className="w-full sm:w-44" value={branchId} onChange={setBranchId} options={[{ value: ALL, label: "All branches" }, ...branches.map((b) => ({ value: b.id, label: b.name })), { value: "none", label: "Unassigned" }]} />}
          <FilterSelect label="Status filter" className="w-full sm:w-36" value={status} onChange={setStatus} options={[{ value: ALL, label: "All statuses" }, ...(Object.keys(userStatusLabel) as UserStatus[]).map((s) => ({ value: s, label: userStatusLabel[s] }))]} />
        </div>}>
        <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[880px] text-left">
          <thead><tr className="text-[10px] uppercase text-muted-foreground"><th className="px-5 py-3"><Sort k="name" label="Member" /></th><th className="px-5 py-3"><Sort k="role" label="Role" /></th><th className="px-5 py-3">Branch</th><th className="px-5 py-3">Status</th><th className="px-5 py-3"><Sort k="joined" label="Joined" /></th><th className="px-5 py-3"><Sort k="activity" label="Last activity" /></th><th className="px-5 py-3 text-right">Actions</th></tr></thead>
          <tbody>{rows.map((u) => (
            <tr key={u.id} className="border-t border-border text-xs">
              <td className="px-5 py-3"><Member u={u} /></td><td className="px-5 py-3"><RoleBadge role={u.role} /></td>
              <td className={`px-5 py-3 ${u.branchId ? "" : "text-muted-foreground"}`}>{branchName(u.branchId)}</td>
              <td className="px-5 py-3"><MemberStatusBadge status={u.status} /></td>
              <td className="px-5 py-3 text-muted-foreground">{formatDate(u.createdAt.slice(0, 10))}</td>
              <td className="px-5 py-3 text-muted-foreground">{last(u)}</td>
              <td className="px-5 py-3 text-right"><Actions u={u} /></td>
            </tr>))}</tbody>
        </table></div>
        <div className="divide-y divide-border md:hidden">{rows.map((u) => (
          <div key={u.id} className="p-4">
            <div className="flex items-start justify-between gap-3"><Member u={u} /><Actions u={u} /></div>
            <div className="mt-3 flex flex-wrap items-center gap-2"><RoleBadge role={u.role} /><MemberStatusBadge status={u.status} /></div>
            <p className="mt-2 text-[11px] text-muted-foreground">{branchName(u.branchId)} · Joined {formatDate(u.createdAt.slice(0, 10))} · {last(u)}</p>
          </div>))}</div>
        {!rows.length && <EmptyState title="No team members found." detail={all.length ? "Try a different search or filter." : "Use Add Team Member to invite someone."} />}
      </Panel>
      <TeamMemberDialog open={creating} onOpenChange={setCreating} scope={scope} />
      <TeamMemberDialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)} scope={scope} member={editing} />
      <MemberStatusDialog member={toggling} onClose={() => setToggling(null)} actorId={userId} />
    </AppShell>
  );
}
