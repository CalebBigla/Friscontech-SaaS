import { useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Check, CheckCheck, ClipboardList, Clock, Eye, MoreHorizontal, PackageCheck, Plus, X, XCircle } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ALL, EmptyState, FilterSelect, MetricCard, Panel, RequestStatusBadge, SearchBox, StockStatusBadge } from "@/components/shared";
import { NewRequestDialog } from "@/components/stock-requests/new-request-dialog";
import { AcknowledgeDialog } from "@/components/stock-requests/acknowledge-dialog";
import { RequestActionDialog, type RequestAction } from "@/components/stock-requests/request-action-dialogs";
import type { StockRequest, StockRequestStatus } from "@/data/mock-db";
import { useDb } from "@/services/mock-store";
import { getAccessScope, useCurrentUserId } from "@/lib/session";
import { getRepIssuedStock, getRequestDisplayStatus, getStockRequestAvailability, getStockRequests, getStockRequestSummary, needsAcknowledgement, requestDisplayLabel, withinDays } from "@/lib/inventory-calculations";
import { monthOf } from "@/lib/dates";
import { formatDayTime, formatNumber, formatShortDate } from "@/lib/format";

const PAGE = 20;

export function StockRequestsPage({ initialStatus }: { initialStatus?: StockRequestStatus | undefined }) {
  const db = useDb();
  const userId = useCurrentUserId();
  const scope = getAccessScope(db, userId);
  const navigate = useNavigate();
  const today = db.tenant.referenceDate;
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<string>(initialStatus ?? ALL);
  const [branch, setBranch] = useState(ALL);
  const [rep, setRep] = useState(ALL);
  const [date, setDate] = useState(ALL);
  const [page, setPage] = useState(1);
  const [newOpen, setNewOpen] = useState(false);
  const [action, setAction] = useState<RequestAction>(null);
  const [acking, setAcking] = useState<StockRequest | null>(null);

  const all = getStockRequests(db, { branchIds: scope.branchIds, repId: scope.repId });
  const summary = getStockRequestSummary(all);
  const branches = db.branches.filter((b) => !scope.branchIds || scope.branchIds.includes(b.id));
  const reps = db.users.filter((u) => u.role === "sales_rep" && all.some((r) => r.repId === u.id));
  const reset = <T,>(fn: (v: T) => void) => (v: T) => { fn(v); setPage(1); };

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return all.filter((r) => {
      const product = db.products.find((p) => p.id === r.productId);
      const repName = db.users.find((u) => u.id === r.repId)?.name ?? "";
      return (!needle || `${r.id} ${repName} ${product?.name} ${product?.sku}`.toLowerCase().includes(needle)) &&
        (status === ALL || r.status === status || getRequestDisplayStatus(r) === status) && (branch === ALL || !!scope.branchIds || r.branchId === branch) && (rep === ALL || !!scope.repId || r.repId === rep) &&
        (date === ALL || (date === "today" ? withinDays(r.requestedAt, today, 1) : date === "week" ? withinDays(r.requestedAt, today, 7) : monthOf(r.requestedAt) === monthOf(today)));
    });
  }, [all, db, query, status, branch, rep, date, today, scope.branchIds, scope.repId]);
  const pages = Math.max(1, Math.ceil(visible.length / PAGE));
  const shown = visible.slice((Math.min(page, pages) - 1) * PAGE, Math.min(page, pages) * PAGE);

  const canAck = (r: StockRequest) => scope.canAcknowledgeStock && r.repId === userId && needsAcknowledgement(r);
  const canAct = (r: StockRequest) => canAck(r) || (r.status === "pending" && scope.canReviewRequests) || ((r.status === "approved" || r.status === "partially_fulfilled") && scope.canFulfillRequests);
  const actions = (r: StockRequest) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label={`Actions for ${r.id}`} onClick={(e) => e.stopPropagation()}><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem asChild><Link to="/stock-requests/$requestId" params={{ requestId: r.id }}><Eye className="size-4" />View details</Link></DropdownMenuItem>
        {r.status === "pending" && scope.canReviewRequests && <>
          <DropdownMenuItem onClick={() => setAction({ kind: "approve", request: r })}><Check className="size-4" />Approve</DropdownMenuItem>
          <DropdownMenuItem className="text-destructive" onClick={() => setAction({ kind: "reject", request: r })}><X className="size-4" />Reject</DropdownMenuItem>
        </>}
        {canAck(r) && <DropdownMenuItem onClick={() => setAcking(r)}><CheckCheck className="size-4" />Acknowledge receipt</DropdownMenuItem>}
        {(r.status === "approved" || r.status === "partially_fulfilled") && scope.canFulfillRequests && <DropdownMenuItem onClick={() => setAction({ kind: "fulfill", request: r })}><PackageCheck className="size-4" />Fulfill</DropdownMenuItem>}
      </DropdownMenuContent>
    </DropdownMenu>
  );
  const quickAction = (r: StockRequest) => canAck(r)
    ? <Button size="sm" variant="soft" onClick={(e) => { e.stopPropagation(); setAcking(r); }}>Acknowledge</Button>
    : r.status === "pending" && scope.canReviewRequests
    ? <Button size="sm" variant="soft" onClick={(e) => { e.stopPropagation(); setAction({ kind: "approve", request: r }); }}>Approve</Button>
    : (r.status === "approved" || r.status === "partially_fulfilled") && scope.canFulfillRequests
      ? <Button size="sm" variant="soft" onClick={(e) => { e.stopPropagation(); setAction({ kind: "fulfill", request: r }); }}>Fulfill</Button> : null;

  const qtyCell = (r: StockRequest) => r.status === "partially_fulfilled" || r.status === "fulfilled"
    ? <><strong>{r.quantityFulfilled}</strong><span className="text-muted-foreground"> / {r.quantityApproved ?? r.quantityRequested}</span></>
    : <strong>{r.quantityRequested}</strong>;
  const availCell = (r: StockRequest) => {
    const a = getStockRequestAvailability(db, r);
    return <div className="flex items-center justify-end gap-2"><span className={`font-semibold ${a.sufficient || r.status === "fulfilled" || r.status === "rejected" ? "" : "text-destructive"}`}>{formatNumber(a.available)}</span>{a.status !== "in_stock" && <StockStatusBadge status={a.status} />}</div>;
  };
  const processedDate = (r: StockRequest) => r.fulfilledAt ?? r.rejectedAt ?? r.approvedAt;
  const empty = all.length === 0 ? <EmptyState title="No stock requests yet." detail={scope.canCreateRequests ? "Create a request when you need stock from your storekeeper." : "Requests from sales representatives will appear here."} />
    : status === "pending" && !query ? <EmptyState title="You're all caught up. No pending stock requests." />
    : <EmptyState title="No requests match these filters" detail="Try a different search or clear the filters." />;

  return (
    <AppShell title="Stock Requests" subtitle="Review, approve, and fulfill product requests from sales representatives."
      actions={scope.canCreateRequests && <Button onClick={() => setNewOpen(true)}><Plus className="size-4" /><span className="hidden sm:inline">New Request</span></Button>}>
      <div className="mb-5"><h1 className="text-xl font-bold">{scope.repId ? "My Stock Requests" : "Stock Requests"}</h1><p className="mt-1 text-xs text-muted-foreground">{scope.repId ? "Request stock from your branch storekeeper and track each request's status." : "Review, approve, and fulfill product requests from sales representatives."}</p></div>

      <section className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-5">
        <MetricCard icon={ClipboardList} tone="brand" label="Total requests" value={formatNumber(summary.total)} detail={scope.repId ? `${formatNumber(getRepIssuedStock(db, scope.repId))} units issued to you` : "All request history"} />
        <MetricCard icon={Clock} tone="warning" label="Pending" value={formatNumber(summary.pending)} detail="Awaiting review" badge={summary.pending ? "Action" : undefined} />
        <MetricCard icon={Check} tone="violet" label="Approved" value={formatNumber(summary.approved + summary.partial)} detail={`${summary.partial} partially fulfilled`} />
        <MetricCard icon={CheckCheck} tone="success" label="Fulfilled" value={formatNumber(summary.fulfilled)} detail={`${all.filter(needsAcknowledgement).length} awaiting acknowledgement`} badge={scope.repId && all.some(needsAcknowledgement) ? "Confirm" : undefined} />
        <MetricCard icon={XCircle} tone="warning" label="Rejected" value={formatNumber(summary.rejected)} detail="Kept in history" />
      </section>

      <Panel className="mt-4 overflow-hidden" title="Requests" subtitle={`${visible.length} of ${all.length} requests`}
        action={<div className="flex flex-col gap-2 lg:flex-row">
          <SearchBox value={query} onChange={reset(setQuery)} placeholder="Search ID, rep, product or SKU" className="lg:w-56" />
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <FilterSelect label="Status filter" className="w-full sm:w-36" value={status} onChange={reset(setStatus)} options={[{ value: ALL, label: "All statuses" }, ...Object.entries(requestDisplayLabel).map(([value, label]) => ({ value, label }))]} />
            {!scope.branchIds && <FilterSelect label="Branch filter" className="w-full sm:w-36" value={branch} onChange={reset(setBranch)} options={[{ value: ALL, label: "All branches" }, ...branches.map((b) => ({ value: b.id, label: b.name.replace(" Branch", "") }))]} />}
            {!scope.repId && <FilterSelect label="Sales representative filter" className="w-full sm:w-36" value={rep} onChange={reset(setRep)} options={[{ value: ALL, label: "All reps" }, ...reps.map((u) => ({ value: u.id, label: u.name }))]} />}
            <FilterSelect label="Date filter" className="w-full sm:w-32" value={date} onChange={reset(setDate)} options={[{ value: ALL, label: "All dates" }, { value: "today", label: "Today" }, { value: "week", label: "Last 7 days" }, { value: "month", label: "This month" }]} />
          </div>
        </div>}>
        <div className="hidden overflow-x-auto lg:block">
          <table className="w-full min-w-[1100px] text-left">
            <thead><tr className="text-[10px] uppercase text-muted-foreground">
              <th className="px-4 py-3">Request</th><th className="px-4 py-3">Sales rep</th><th className="px-4 py-3">Branch</th><th className="px-4 py-3">Product</th>
              <th className="px-4 py-3 text-right">Quantity</th><th className="px-4 py-3 text-right">Available stock</th><th className="px-4 py-3">Requested</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Processed</th><th className="px-4 py-3 text-right">Actions</th>
            </tr></thead>
            <tbody>{shown.map((r) => {
              const product = db.products.find((p) => p.id === r.productId);
              return (
                <tr key={r.id} onClick={() => void navigate({ to: "/stock-requests/$requestId", params: { requestId: r.id } })} className="cursor-pointer border-t border-border text-xs transition-colors hover:bg-muted/60">
                  <td className="px-4 py-3.5 font-mono text-[11px] font-semibold">{r.id}{r.batchId && <span className="ml-1.5 font-sans text-[10px] font-normal text-muted-foreground">· multi</span>}{r.priority === "High" && <span className="status status-danger ml-2 font-sans">High</span>}</td>
                  <td className="px-4 py-3.5 font-semibold">{db.users.find((u) => u.id === r.repId)?.name}</td>
                  <td className="px-4 py-3.5 text-muted-foreground">{db.branches.find((b) => b.id === r.branchId)?.name}</td>
                  <td className="px-4 py-3.5"><p className="font-semibold">{product?.name}</p><p className="font-mono text-[10px] text-muted-foreground">{product?.sku}</p></td>
                  <td className="px-4 py-3.5 text-right">{qtyCell(r)}</td>
                  <td className="px-4 py-3.5 text-right">{availCell(r)}</td>
                  <td className="px-4 py-3.5 text-muted-foreground">{formatDayTime(r.requestedAt, today)}</td>
                  <td className="px-4 py-3.5"><RequestStatusBadge request={r} /></td>
                  <td className="px-4 py-3.5 text-muted-foreground">{processedDate(r) ? formatShortDate(processedDate(r)!) : "—"}</td>
                  <td className="px-4 py-2 text-right"><div className="flex items-center justify-end gap-1">{quickAction(r)}{actions(r)}</div></td>
                </tr>);
            })}</tbody>
          </table>
        </div>
        <div className="divide-y divide-border lg:hidden">{shown.map((r) => {
          const product = db.products.find((p) => p.id === r.productId);
          return (
            <div key={r.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <Link to="/stock-requests/$requestId" params={{ requestId: r.id }} className="min-w-0"><p className="truncate text-sm font-bold">{product?.name}</p><p className="text-[11px] text-muted-foreground">{r.id} · {db.users.find((u) => u.id === r.repId)?.name}</p></Link>
                <div className="flex items-center gap-1"><RequestStatusBadge request={r} />{actions(r)}</div>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
                <div><p className="text-muted-foreground">Quantity</p><p>{qtyCell(r)}</p></div>
                <div><p className="text-muted-foreground">Available</p><div className="[&>div]:justify-start">{availCell(r)}</div></div>
                <div><p className="text-muted-foreground">Requested</p><p className="font-semibold">{formatDayTime(r.requestedAt, today)}</p></div>
              </div>
              {canAct(r) && <div className="mt-3 [&>button]:h-10 [&>button]:w-full">{quickAction(r)}</div>}
            </div>);
        })}</div>
        {visible.length === 0 && empty}
        {pages > 1 && <div className="flex items-center justify-between border-t border-border px-5 py-3 text-xs">
          <span className="text-muted-foreground">Page {Math.min(page, pages)} of {pages}</span>
          <div className="flex gap-2"><Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button><Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next</Button></div>
        </div>}
      </Panel>

      <NewRequestDialog open={newOpen} onOpenChange={setNewOpen} scope={scope} />
      <RequestActionDialog action={action} onClose={() => setAction(null)} actorId={userId} />
      <AcknowledgeDialog request={acking} onClose={() => setAcking(null)} actorId={userId} />
    </AppShell>
  );
}
