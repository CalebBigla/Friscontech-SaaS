import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Area, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from "recharts";
import { ArrowLeft, Pencil } from "lucide-react";

import { AppShell, RestrictedNotice } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { DetailItem, EmptyState, Panel } from "@/components/shared";
import { EditTargetDialog } from "@/components/targets/target-dialogs";
import { TargetProgressBar, TargetStatusBadge } from "@/components/targets/target-shared";
import { useDb } from "@/services/mock-store";
import { canSeeBranch, getAccessScope, useCurrentUserId } from "@/lib/session";
import { getTarget, getTargetProgress, getTargetSales, getTargetTrend, progressLabel } from "@/lib/catalog-calculations";
import { saleTotal } from "@/lib/calculations";
import { formatCompactNaira, formatDate, formatMonth, formatNaira, roleLabel } from "@/lib/format";

const config = { cumulative: { label: "Cumulative sales", color: "var(--color-primary)" }, target: { label: "Target pace", color: "var(--color-chart-target)" } } satisfies ChartConfig;

export function TargetDetailPage({ targetId }: { targetId: string }) {
  const db = useDb();
  const userId = useCurrentUserId();
  const scope = getAccessScope(db, userId);
  const [editing, setEditing] = useState(false);
  const target = getTarget(db, targetId);
  if (!target || !canSeeBranch(scope, target.branchId)) return <AppShell title="Target"><RestrictedNotice message={target ? "This target belongs to a branch outside your access." : "This target does not exist."} /><div className="mt-4 text-center"><Button variant="outline" asChild><Link to="/targets"><ArrowLeft className="size-4" />Back to targets</Link></Button></div></AppShell>;

  const p = getTargetProgress(db, target);
  const rep = db.users.find((u) => u.id === target.userId);
  const branch = db.branches.find((b) => b.id === target.branchId);
  const sales = getTargetSales(db, target);
  const trend = getTargetTrend(db, target);
  const product = (id: string) => db.products.find((x) => x.id === id);

  return (
    <AppShell title={`${rep?.name ?? "Rep"} · ${formatMonth(target.month)}`} subtitle="Target performance" actions={<Button onClick={() => setEditing(true)}><Pencil className="size-4" /><span className="hidden sm:inline">Edit Target</span></Button>}>
      <Link to="/targets" search={{ month: target.month }} className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground"><ArrowLeft className="size-3.5" />Targets</Link>
      <div className="mb-5 mt-2 flex flex-wrap items-center gap-3"><h1 className="text-xl font-bold">{rep?.name} · {formatMonth(target.month)}</h1><TargetStatusBadge status={p.status} /></div>

      <div className="mb-5 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {[["Target", formatNaira(p.amount)], ["Achieved", formatNaira(p.achieved)], ["Remaining", formatNaira(p.remaining)], ["Progress", progressLabel(p)]].map(([k, v]) => (
          <article key={k} className="min-w-0 rounded-lg border border-border bg-card p-4 shadow-panel sm:p-5"><p className="text-xs text-muted-foreground">{k}</p><p className="mt-1 truncate text-lg font-bold sm:text-2xl">{v}</p></article>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Panel title="Target vs cumulative sales" subtitle="Daily running total from recorded sales against an even monthly pace">
          <div className="p-5">
            <TargetProgressBar p={p} />
            <ChartContainer config={config} className="mt-5 aspect-auto h-56 w-full">
              <ComposedChart data={trend} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} interval={4} fontSize={11} />
                <YAxis tickLine={false} axisLine={false} width={62} fontSize={11} tickFormatter={(v: number) => formatCompactNaira(Number(v))} />
                <ChartTooltip content={<ChartTooltipContent formatter={(v, name) => <span className="flex w-full justify-between gap-4"><span className="text-muted-foreground">{config[name as keyof typeof config]?.label}</span><span className="font-semibold">{formatNaira(Number(v))}</span></span>} />} />
                <Area dataKey="cumulative" type="monotone" stroke="var(--color-cumulative)" fill="var(--color-cumulative)" fillOpacity={0.12} strokeWidth={2} connectNulls={false} />
                <Line dataKey="target" type="linear" stroke="var(--color-target)" strokeDasharray="5 4" dot={false} strokeWidth={1.5} />
              </ComposedChart>
            </ChartContainer>
          </div>
        </Panel>
        <Panel title="Sales representative">
          <div className="grid grid-cols-2 gap-5 p-5">
            <DetailItem label="Name">{rep?.name}</DetailItem><DetailItem label="Role">{rep ? roleLabel[rep.role] : "—"}</DetailItem>
            <DetailItem label="Branch">{branch && scope.canViewBranches ? <Link to="/branches/$branchId" params={{ branchId: branch.id }} className="hover:text-primary">{branch.name}</Link> : branch?.name}</DetailItem>
            <DetailItem label="Status">{rep?.status === "active" ? "Active" : "Inactive"}</DetailItem>
            <DetailItem label="Set on">{formatDate(target.createdAt.slice(0, 10))}</DetailItem><DetailItem label="Last updated">{formatDate(target.updatedAt.slice(0, 10))}</DetailItem>
          </div>
        </Panel>
      </div>

      <Panel className="mt-5 overflow-hidden" title="Sales breakdown" subtitle={`${sales.length} completed sales count toward this target`}>
        {sales.length ? <>
          <div className="hidden overflow-x-auto sm:block"><table className="w-full min-w-[560px] text-left">
            <thead><tr className="text-[10px] uppercase text-muted-foreground"><th className="px-5 py-3">Date</th><th className="px-5 py-3">Sale</th><th className="px-5 py-3">Product</th><th className="px-5 py-3 text-right">Quantity</th><th className="px-5 py-3 text-right">Revenue</th></tr></thead>
            <tbody>{sales.map((s) => (
              <tr key={s.id} className="border-t border-border text-xs"><td className="px-5 py-3">{formatDate(s.saleDate)}</td><td className="px-5 py-3 font-mono text-[11px] text-muted-foreground">{s.code}</td><td className="px-5 py-3 font-semibold">{product(s.productId)?.name}</td><td className="px-5 py-3 text-right">{s.quantity}</td><td className="px-5 py-3 text-right font-bold">{formatNaira(saleTotal(s))}</td></tr>))}</tbody>
          </table></div>
          <div className="divide-y divide-border sm:hidden">{sales.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-3 p-4 text-xs"><div className="min-w-0"><p className="truncate font-bold">{product(s.productId)?.name}</p><p className="text-muted-foreground">{formatDate(s.saleDate)} · {s.quantity} units</p></div><p className="font-bold">{formatNaira(saleTotal(s))}</p></div>))}</div>
        </> : <EmptyState title="No sales have been recorded against this target yet." />}
      </Panel>
      <EditTargetDialog target={editing ? target : null} onClose={() => setEditing(false)} actorId={userId} />
    </AppShell>
  );
}
