import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Activity as ActivityIcon, ArrowLeftRight, CalendarDays, ClipboardList, KeyRound, Landmark, Package, Receipt, Settings, ShoppingCart, Store, Target, UserRound, Users, Wallet, type LucideIcon } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { ALL, DetailItem, EmptyState, FilterSelect, MetricCard, Panel, SearchBox } from "@/components/shared";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useDb } from "@/services/mock-store";
import { getPreferences } from "@/services/services";
import { getAccessScope, useCurrentUserId } from "@/lib/session";
import { filterByRange, formatPrefDate, getAuditLogs, getAuditSummary, type AuditRow } from "@/lib/audit";
import { canAccessMember } from "@/lib/team";
import { getPeriodRange, type PeriodKey } from "@/lib/dates";
import { formatNumber, formatTime, initials, roleLabel } from "@/lib/format";
import { auditEntityLabel } from "@/data/auditLogs";
import type { AuditEntity } from "@/data/mock-db";

const entityIcon: Record<AuditEntity, LucideIcon> = {
  product: Package, sale: ShoppingCart, payment: Wallet, expense: Receipt, remittance: Landmark, stock_request: ClipboardList, target: Target, team_member: Users,
  branch: Store, inventory: ArrowLeftRight, settings: Settings, session: KeyRound,
};
const periods = [{ value: ALL, label: "All time" }, { value: "today", label: "Today" }, { value: "week", label: "Last 7 days" }, { value: "month", label: "This month" }, { value: "quarter", label: "This quarter" }];

export function AuditLogPage() {
  const db = useDb();
  const userId = useCurrentUserId();
  const scope = getAccessScope(db, userId);
  const pref = getPreferences(db, userId);
  const today = db.tenant.referenceDate;
  const personal = scope.user.role === "sales_rep" || scope.user.role === "storekeeper";

  const [ready, setReady] = useState(false);
  useEffect(() => { const t = setTimeout(() => setReady(true), 250); return () => clearTimeout(t); }, []);
  const [q, setQ] = useState("");
  const [period, setPeriod] = useState(ALL);
  const [actor, setActor] = useState(ALL);
  const [verb, setVerb] = useState(ALL);
  const [entity, setEntity] = useState(ALL);
  const [branch, setBranch] = useState(ALL);
  const [limit, setLimit] = useState(40);
  const [open, setOpen] = useState<AuditRow | null>(null);

  const all = useMemo(() => getAuditLogs(db, scope), [db, userId]); // eslint-disable-line react-hooks/exhaustive-deps
  const user = (id: string) => db.users.find((u) => u.id === id);
  const bname = (id?: string) => db.branches.find((b) => b.id === id)?.name ?? "—";

  const needle = q.trim().toLowerCase();
  let list = period === ALL ? all : filterByRange(all, getPeriodRange(period as PeriodKey, today));
  list = list.filter((a) =>
    (actor === ALL || a.actorId === actor) && (verb === ALL || a.verb === verb) && (entity === ALL || a.entity === entity) && (branch === ALL || a.branchId === branch) &&
    (!needle || [a.action, a.subject, a.entityId ?? "", user(a.actorId)?.name ?? "", auditEntityLabel[a.entity]].some((v) => v.toLowerCase().includes(needle))));
  const summary = getAuditSummary(all, today);

  const actors = [...new Set(all.map((a) => a.actorId))].map((id) => ({ value: id, label: user(id)?.name ?? id })).sort((a, b) => a.label.localeCompare(b.label));
  const verbs = [...new Set(all.map((a) => a.verb))].sort();
  const entities = [...new Set(all.map((a) => a.entity))];
  const branches = db.branches.filter((b) => scope.branchIds === null || scope.branchIds.includes(b.id));
  const reset = () => setLimit(40);
  const stamp = (iso: string) => `${formatPrefDate(iso, pref.dateFormat)}, ${formatTime(iso)}`;

  return (
    <AppShell title="Audit Log" subtitle={personal ? "Only actions you performed" : "Organization activity"}>
      <div className="mb-5">
        <h1 className="text-xl font-bold">{personal ? "My Activity" : "Audit Log"}</h1>
        <p className="mt-1 text-xs text-muted-foreground">{personal ? "A record of every action you performed in SalesFlow Pro." : "Track important activity across your organization."}</p>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {ready ? <>
          <MetricCard icon={ActivityIcon} tone="brand" label="Total Activities" value={formatNumber(summary.total)} />
          <MetricCard icon={CalendarDays} tone="success" label="Today" value={formatNumber(summary.today)} />
          <MetricCard icon={ClipboardList} tone="violet" label="This Week" value={formatNumber(summary.week)} detail="Last 7 days" />
          <MetricCard icon={UserRound} tone="warning" label="Active Users" value={formatNumber(summary.activeUsers)} detail="Acted in the last 7 days" />
        </> : [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[132px] rounded-lg" />)}
      </div>

      <Panel title="Activity" subtitle={`${formatNumber(list.length)} of ${formatNumber(all.length)} entries`}>
        <div className="flex flex-col gap-2 border-b border-border p-4 sm:flex-row sm:flex-wrap">
          <SearchBox value={q} onChange={(v) => { setQ(v); reset(); }} placeholder="Search action, record or person" className="sm:w-64" />
          <FilterSelect label="Date range" className="w-full sm:w-36" value={period} onChange={(v) => { setPeriod(v); reset(); }} options={periods} />
          {!personal && <FilterSelect label="User" className="w-full sm:w-44" value={actor} onChange={(v) => { setActor(v); reset(); }} options={[{ value: ALL, label: "All users" }, ...actors]} />}
          <FilterSelect label="Action" className="w-full sm:w-36" value={verb} onChange={(v) => { setVerb(v); reset(); }} options={[{ value: ALL, label: "All actions" }, ...verbs.map((v) => ({ value: v, label: v }))]} />
          <FilterSelect label="Entity" className="w-full sm:w-40" value={entity} onChange={(v) => { setEntity(v); reset(); }} options={[{ value: ALL, label: "All records" }, ...entities.map((e) => ({ value: e, label: auditEntityLabel[e] }))]} />
          {branches.length > 1 && <FilterSelect label="Branch" className="w-full sm:w-40" value={branch} onChange={(v) => { setBranch(v); reset(); }} options={[{ value: ALL, label: "All branches" }, ...branches.map((b) => ({ value: b.id, label: b.name }))]} />}
        </div>

        {!ready ? <div className="space-y-2 p-4">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-11" />)}</div> : !list.length ? <EmptyState title="No activity found." detail="Try a different search or filter." /> : <>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-border text-[11px] text-muted-foreground"><tr>
                <th className="px-5 py-3 font-semibold">Date & time</th><th className="px-3 py-3 font-semibold">User</th><th className="px-3 py-3 font-semibold">Action</th>
                <th className="px-3 py-3 font-semibold">Entity</th><th className="px-3 py-3 font-semibold">Reference</th><th className="px-5 py-3 font-semibold">Branch</th>
              </tr></thead>
              <tbody className="divide-y divide-border">{list.slice(0, limit).map((a) => { const u = user(a.actorId); const Icon = entityIcon[a.entity]; return (
                <tr key={a.id} className="cursor-pointer transition-colors hover:bg-muted/60" onClick={() => setOpen(a)} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && setOpen(a)} aria-label={`Open ${a.action}`}>
                  <td className="whitespace-nowrap px-5 py-3 text-muted-foreground">{stamp(a.createdAt)}</td>
                  <td className="px-3 py-3"><div className="flex items-center gap-2"><span className="grid size-7 shrink-0 place-items-center rounded-full bg-avatar text-[10px] font-bold text-primary">{initials(u?.name ?? "?")}</span><div className="min-w-0"><p className="truncate font-semibold">{u?.name ?? "Unknown"}</p><p className="text-[11px] text-muted-foreground">{u ? roleLabel[u.role] : ""}</p></div></div></td>
                  <td className="px-3 py-3 font-semibold">{a.action}</td>
                  <td className="px-3 py-3"><span className="status status-brand inline-flex items-center gap-1 whitespace-nowrap"><Icon className="size-3" />{auditEntityLabel[a.entity]}</span></td>
                  <td className="max-w-[280px] truncate px-3 py-3 text-muted-foreground">{a.entityId && a.entity !== "inventory" ? `${a.entityId} · ` : ""}{a.subject}</td>
                  <td className="whitespace-nowrap px-5 py-3 text-muted-foreground">{bname(a.branchId)}</td>
                </tr>); })}</tbody>
            </table>
          </div>
          <ul className="divide-y divide-border md:hidden">{list.slice(0, limit).map((a) => { const u = user(a.actorId); const Icon = entityIcon[a.entity]; return (
            <li key={a.id}><button className="flex w-full items-start gap-3 px-4 py-3 text-left" onClick={() => setOpen(a)}>
              <span className="grid size-9 shrink-0 place-items-center rounded-md bg-muted text-primary"><Icon className="size-4" /></span>
              <div className="min-w-0 flex-1"><p className="text-xs font-bold">{a.action}</p><p className="truncate text-[11px] text-muted-foreground">{a.subject}</p><p className="mt-1 text-[11px] text-muted-foreground">{u?.name} · {stamp(a.createdAt)}</p></div>
            </button></li>); })}</ul>
          {list.length > limit && <div className="border-t border-border p-3 text-center"><button className="text-xs font-semibold text-primary" onClick={() => setLimit((l) => l + 40)}>Show more</button></div>}
        </>}
      </Panel>

      <Sheet open={!!open} onOpenChange={(v) => !v && setOpen(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          {open && <AuditDetail row={open} stamp={stamp} />}
        </SheetContent>
      </Sheet>
    </AppShell>
  );

  function AuditDetail({ row, stamp }: { row: AuditRow; stamp: (iso: string) => string }) {
    const u = user(row.actorId);
    const product = db.products.find((p) => p.id === row.metadata?.productId);
    const canOpenMember = u && canAccessMember(scope, u);
    return <>
      <SheetHeader className="text-left"><SheetTitle>{row.action}</SheetTitle><SheetDescription>{auditEntityLabel[row.entity]} activity</SheetDescription></SheetHeader>
      <div className="mt-6 grid grid-cols-2 gap-5">
        <DetailItem label="Performed by">{canOpenMember ? <Link to="/team/$userId" params={{ userId: u.id }} className="text-primary hover:underline">{u.name}</Link> : u?.name ?? "Unknown"}</DetailItem>
        <DetailItem label="Role">{u ? roleLabel[u.role] : "—"}</DetailItem>
        <DetailItem label="Date & time">{stamp(row.createdAt)}</DetailItem>
        <DetailItem label="Entity">{auditEntityLabel[row.entity]}</DetailItem>
        <DetailItem label="Reference">{row.entityId && /^(SR|SAL)-/.test(row.entityId) ? row.entityId : "—"}</DetailItem>
        <DetailItem label="Related branch">{bname(row.branchId)}</DetailItem>
        {product && <DetailItem label="Product">{product.name}</DetailItem>}
      </div>
      <div className="mt-6 rounded-md bg-muted p-4"><p className="text-[11px] text-muted-foreground">Description</p><p className="mt-1 text-sm font-semibold">{row.subject}</p></div>
      {row.entityId?.startsWith("SR-") && <Link to="/stock-requests/$requestId" params={{ requestId: row.entityId }} className="mt-4 inline-block text-xs font-semibold text-primary hover:underline">Open stock request</Link>}
    </>;
  }
}
