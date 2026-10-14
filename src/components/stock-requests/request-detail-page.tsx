import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Check, CheckCheck, Circle, PackageCheck, X, XCircle } from "lucide-react";
import { AcknowledgeDialog } from "@/components/stock-requests/acknowledge-dialog";

import { AppShell, RestrictedNotice } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { DetailItem, Panel, RequestStatusBadge, StockStatusBadge } from "@/components/shared";
import { RequestActionDialog, ShortageNotice, type RequestAction } from "@/components/stock-requests/request-action-dialogs";
import { useDb } from "@/services/mock-store";
import { canSeeBranch, getAccessScope, useCurrentUserId } from "@/lib/session";
import { getRequestBatch, getRequestOutstanding, getRequestTimeline, getStockRequestAvailability, isRequestOpen, needsAcknowledgement } from "@/lib/inventory-calculations";
import { formatDate, formatDayTime, formatUnits } from "@/lib/format";

export function RequestDetailPage({ requestId }: { requestId: string }) {
  const db = useDb();
  const userId = useCurrentUserId();
  const scope = getAccessScope(db, userId);
  const [action, setAction] = useState<RequestAction>(null);
  const [acking, setAcking] = useState(false);
  const req = db.stockRequests.find((r) => r.id === requestId);
  const allowed = req && canSeeBranch(scope, req.branchId) && (!scope.repId || req.repId === scope.repId);

  if (!req || !allowed) {
    return <AppShell title="Stock request"><RestrictedNotice message={req ? "This request is outside your access." : "This stock request does not exist."} /><div className="mt-4 text-center"><Button variant="outline" asChild><Link to="/stock-requests"><ArrowLeft className="size-4" />Back to requests</Link></Button></div></AppShell>;
  }
  const product = db.products.find((p) => p.id === req.productId)!;
  const branch = db.branches.find((b) => b.id === req.branchId)!;
  const rep = db.users.find((u) => u.id === req.repId);
  const avail = getStockRequestAvailability(db, req);
  const timeline = getRequestTimeline(db, req);
  const total = req.quantityApproved ?? req.quantityRequested;
  const fulfilled = req.quantityFulfilled ?? 0;
  const canReview = req.status === "pending" && scope.canReviewRequests;
  const canFulfill = (req.status === "approved" || req.status === "partially_fulfilled") && scope.canFulfillRequests;
  const canAck = scope.canAcknowledgeStock && req.repId === userId && needsAcknowledgement(req);
  const batch = getRequestBatch(db, req);

  return (
    <AppShell title={`Request ${req.id}`} subtitle={`${product.name} · ${branch.name}`}
      actions={<div className="flex gap-2">
        {canReview && <><Button variant="outline" onClick={() => setAction({ kind: "reject", request: req })}><X className="size-4" /><span className="hidden sm:inline">Reject</span></Button><Button onClick={() => setAction({ kind: "approve", request: req })}><Check className="size-4" />Approve</Button></>}
        {canFulfill && <Button onClick={() => setAction({ kind: "fulfill", request: req })}><PackageCheck className="size-4" />Fulfill</Button>}
        {canAck && <Button onClick={() => setAcking(true)}><CheckCheck className="size-4" />Acknowledge Receipt</Button>}
      </div>}>
      <Link to="/stock-requests" className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground"><ArrowLeft className="size-3.5" />Stock requests</Link>
      <div className="mb-5 mt-2 flex flex-wrap items-center gap-3"><h1 className="text-xl font-bold">Request {req.id}</h1><RequestStatusBadge request={req} />{req.priority === "High" && <span className="status status-danger">High priority</span>}</div>

      <section className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
        <div className="space-y-4">
          <Panel title="Request information">
            <div className="grid grid-cols-2 gap-5 p-5 sm:grid-cols-3">
              <DetailItem label="Request ID"><span className="font-mono text-xs">{req.id}</span></DetailItem>
              <DetailItem label="Date">{formatDate(req.requestedAt)}, {req.requestedAt.slice(11, 16)}</DetailItem>
              <DetailItem label="Sales rep">{rep?.name}</DetailItem>
              <DetailItem label="Branch"><Link to="/branches/$branchId" params={{ branchId: branch.id }} className="hover:text-primary">{branch.name}</Link></DetailItem>
              <DetailItem label="Product">{avail.inventory ? <Link to="/inventory/$inventoryId" params={{ inventoryId: avail.inventory.id }} className="hover:text-primary">{product.name}</Link> : product.name}</DetailItem>
              <DetailItem label="SKU"><span className="font-mono text-xs">{product.sku}</span></DetailItem>
              <DetailItem label="Quantity requested">{formatUnits(req.quantityRequested)}</DetailItem>
              <DetailItem label="Current available stock"><span className="flex items-center gap-2">{formatUnits(avail.available)}<StockStatusBadge status={avail.status} /></span></DetailItem>
              <DetailItem label="Status"><RequestStatusBadge request={req} /></DetailItem>
            </div>
            {req.acknowledgedAt && <p className="border-t border-border px-5 py-3 text-xs"><span className="text-muted-foreground">Acknowledged: </span><strong>{db.users.find((u) => u.id === req.acknowledgedBy)?.name}</strong> · {formatDate(req.acknowledgedAt)}, {req.acknowledgedAt.slice(11, 16)} · {branch.name}</p>}
            {canAck && <div className="border-t border-border p-5"><div className="alert alert-warning flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-semibold text-foreground">Fulfilled — Awaiting Acknowledgement</p><p className="mt-0.5 text-[11px] text-muted-foreground">Confirm once you've received {formatUnits(fulfilled)}.</p></div><Button size="sm" onClick={() => setAcking(true)}>Acknowledge Receipt</Button></div></div>}
            {req.note && <p className="border-t border-border px-5 py-3 text-xs"><span className="text-muted-foreground">Note: </span>{req.note}</p>}
            {req.status === "rejected" && <div className="border-t border-border p-5"><div className="alert alert-danger"><p className="text-[10px] font-bold uppercase">Rejection reason</p><p className="mt-1 text-xs font-semibold text-foreground">{req.rejectionReason}</p></div></div>}
          </Panel>

          {batch.length > 1 && (
            <Panel title="Submitted together" subtitle={`${batch.length} products in ${req.batchId}`}>
              <div className="divide-y divide-border">{batch.map((b) => (
                <Link key={b.id} to="/stock-requests/$requestId" params={{ requestId: b.id }} className={`flex items-center justify-between gap-3 px-5 py-3 text-xs hover:bg-muted/60 ${b.id === req.id ? "bg-muted/60" : ""}`}>
                  <span className="min-w-0"><span className="font-semibold">{db.products.find((p) => p.id === b.productId)?.name}</span><span className="ml-2 font-mono text-[10px] text-muted-foreground">{b.id}</span></span>
                  <span className="flex items-center gap-3"><strong>{b.quantityRequested}</strong><RequestStatusBadge request={b} /></span>
                </Link>))}</div>
            </Panel>
          )}

          {req.status !== "rejected" && req.status !== "pending" && (
            <Panel title="Fulfillment" subtitle={`${fulfilled} / ${total} fulfilled`}>
              <div className="p-5">
                <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-success" style={{ width: `${total ? (fulfilled / total) * 100 : 0}%` }} /></div>
                <div className="mt-3 flex justify-between text-xs"><span><strong>{fulfilled}</strong> <span className="text-muted-foreground">issued</span></span><span><strong>{getRequestOutstanding(req)}</strong> <span className="text-muted-foreground">remaining</span></span></div>
              </div>
            </Panel>
          )}

          {isRequestOpen(req) && (
            <Panel title="Stock availability" subtitle="Calculated live from branch inventory">
              <div className="p-5">{avail.sufficient
                ? <div className="alert alert-neutral"><p className="text-xs font-semibold">Enough stock to {req.status === "pending" ? "approve and fulfill" : "fulfill"} this request.</p><p className="mt-1 text-[11px] text-muted-foreground">Needed {avail.needed} · available {avail.available} · {avail.available - avail.needed} would remain</p></div>
                : <ShortageNotice needed={avail.needed} available={avail.available} />}</div>
            </Panel>
          )}
        </div>

        <Panel title="Timeline" subtitle="Request lifecycle">
          <ol className="p-5">
            {timeline.map((s, i) => (
              <li key={s.key} className="relative flex gap-3 pb-6 last:pb-0">
                {i < timeline.length - 1 && <span className={`absolute left-[13px] top-7 h-[calc(100%-1.5rem)] w-px ${s.state === "done" ? "bg-success" : "bg-border"}`} />}
                <span className={`z-10 grid size-7 shrink-0 place-items-center rounded-full ${s.state === "done" ? "bg-success-soft text-success" : s.state === "failed" ? "bg-destructive/10 text-destructive" : s.state === "current" ? "bg-warning-soft text-warning" : "bg-muted text-muted-foreground"}`}>
                  {s.state === "done" ? <Check className="size-3.5" /> : s.state === "failed" ? <XCircle className="size-3.5" /> : <Circle className="size-3" />}
                </span>
                <div className="min-w-0 pt-0.5">
                  <p className={`text-xs font-semibold ${s.state === "upcoming" ? "text-muted-foreground" : ""}`}>{s.label}</p>
                  {s.detail && <p className="mt-0.5 text-[11px] text-muted-foreground">{s.detail}</p>}
                  {s.at && <p className="mt-0.5 text-[10px] text-muted-foreground">{formatDayTime(s.at, db.tenant.referenceDate)}</p>}
                </div>
              </li>
            ))}
          </ol>
        </Panel>
      </section>

      <RequestActionDialog action={action} onClose={() => setAction(null)} actorId={userId} />
      <AcknowledgeDialog request={acking ? req : null} onClose={() => setAcking(false)} actorId={userId} />
    </AppShell>
  );
}
