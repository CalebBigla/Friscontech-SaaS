import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Ban, CheckCheck, ClipboardList, Loader2, PackageCheck, Plus, X } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { PlaceOrderDialog } from "@/components/orders/place-order-dialog";
import { DataGate, EmptyState, FieldError, FilterSelect, Panel, StatTile } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Db } from "@/data/mock-db";
import { useLiveWorkspace } from "@/hooks/use-live-workspace";
import {
  orderStatusView,
  orderTotal,
  useAcknowledgeOrder,
  useCancelOrder,
  useCustomerOrders,
  useFulfilOrder,
  useVoidOrder,
  type CustomerOrderRecord,
  type OrderStatus,
} from "@/hooks/use-orders";
import { formatDayTime, formatNaira, formatNumber } from "@/lib/format";
import { getAvailableStock } from "@/lib/inventory-calculations";
import { getAccessScope, useCurrentUserId, type AccessScope } from "@/lib/session";
import { fieldErrorsFrom } from "@/lib/supabase-helpers";

const ALL = "all";

/** Customer orders: the rep raises, the branch storekeeper fulfils, the rep acknowledges. */
export function OrdersPage({ initialStatus }: { initialStatus?: OrderStatus | undefined }) {
  const { db, isLoading, error } = useLiveWorkspace();
  const { data: orders = [], isLoading: loadingOrders, error: ordersError } = useCustomerOrders();
  const scope = getAccessScope(db, useCurrentUserId());
  const [status, setStatus] = useState<string>(initialStatus ?? ALL);
  const [creating, setCreating] = useState(false);
  const role = scope.user.role;

  const count = (s: OrderStatus) => orders.filter((o) => o.status === s).length;
  const list = orders.filter((o) => status === ALL || o.status === status);
  // The work for this role comes first: storekeepers the pending ones, reps those to acknowledge.
  const urgent = (o: CustomerOrderRecord) =>
    (role === "storekeeper" && o.status === "pending") || (role === "sales_rep" && o.status === "fulfilled") ? 0 : 1;
  const sorted = [...list].sort((a, b) => urgent(a) - urgent(b) || (urgent(a) === 0 ? a.createdAt.localeCompare(b.createdAt) : b.createdAt.localeCompare(a.createdAt)));

  return (
    <AppShell
      title="Orders"
      subtitle="Customer orders and their fulfilment"
      actions={scope.canRaiseOrders ? <Button onClick={() => setCreating(true)}><Plus className="size-4" /><span className="hidden sm:inline">New order</span></Button> : undefined}
    >
      <div className="mb-5">
        <h1 className="text-xl font-bold">Orders</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          {role === "sales_rep" ? "Raise an order for your customer; the storekeeper fulfils it, then you acknowledge you have the goods."
            : role === "storekeeper" ? "Orders raised by your branch's sales reps. Fulfil an order to release its items: the stock is already held for it."
              : "Customer orders across your branches, from raised to acknowledged."}
        </p>
      </div>
      <DataGate isLoading={isLoading || loadingOrders} error={error ?? ordersError}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label="Waiting for fulfilment" value={formatNumber(count("pending"))} tone="warning" />
          <StatTile label="Fulfilled, to acknowledge" value={formatNumber(count("fulfilled"))} />
          <StatTile label="Completed" value={formatNumber(count("acknowledged"))} tone="success" />
          <StatTile label="Cancelled or voided" value={formatNumber(count("cancelled") + count("voided"))} />
        </div>
        <Panel
          className="mt-4 overflow-hidden"
          title="Orders"
          subtitle={`${formatNumber(list.length)} shown`}
          action={
            <FilterSelect label="Status" className="w-48" value={status} onChange={setStatus} options={[
              { value: ALL, label: "All statuses" },
              { value: "pending", label: orderStatusView.pending.label },
              { value: "fulfilled", label: orderStatusView.fulfilled.label },
              { value: "acknowledged", label: orderStatusView.acknowledged.label },
              { value: "cancelled", label: orderStatusView.cancelled.label },
              { value: "voided", label: orderStatusView.voided.label },
            ]} />
          }
        >
          {sorted.length ? (
            <ul className="divide-y divide-border">{sorted.map((o) => <OrderRow key={o.id} o={o} db={db} scope={scope} />)}</ul>
          ) : (
            <EmptyState icon={ClipboardList} title="No orders" detail={scope.canRaiseOrders ? "Open a customer and raise an order from their order book." : "Orders raised by sales reps appear here."} />
          )}
        </Panel>
      </DataGate>
      {scope.canRaiseOrders && <PlaceOrderDialog open={creating} onOpenChange={setCreating} db={db} scope={scope} />}
    </AppShell>
  );
}

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const view = orderStatusView[status];
  return <span className={`status ${view.tone} whitespace-nowrap`}>{view.label}</span>;
}

export function OrderRow({ o, db, scope }: { o: CustomerOrderRecord; db: Db; scope: AccessScope }) {
  const fulfil = useFulfilOrder();
  const acknowledge = useAcknowledgeOrder();
  const cancel = useCancelOrder();
  const voidOrder = useVoidOrder();
  // "cancel" before fulfilment; "void" (Owner) after it.
  const [cancelling, setCancelling] = useState<false | "cancel" | "void">(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const today = db.tenant.referenceDate;
  const product = (id: string) => db.products.find((p) => p.id === id)?.name ?? "Product";
  const person = (id: string | null) => (id ? (db.users.find((u) => u.id === id)?.name ?? "—") : "—");
  const isStorekeeper = scope.canFulfilOrders && (scope.branchIds?.includes(o.branchId) ?? true);
  const isRaiser = scope.user.id === o.repId;
  const canCancel = o.status === "pending" && (isRaiser || isStorekeeper || scope.user.role === "owner");
  const canVoid = scope.user.role === "owner" && (o.status === "fulfilled" || o.status === "acknowledged");
  const lines = o.lines.filter((l) => l.status !== "voided" || o.status === "cancelled");
  const busy = fulfil.isPending || acknowledge.isPending || cancel.isPending || voidOrder.isPending;

  async function run(label: string, fn: () => Promise<unknown>) {
    setError("");
    try {
      await fn();
      toast.success(label);
      setCancelling(false);
    } catch (failure) {
      const errors = fieldErrorsFrom(failure, ["reason"] as const);
      setError(errors.reason ?? errors.form ?? "Could not update the order");
    }
  }

  return (
    <li className="px-5 py-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs font-bold">{o.code}</span>
            <OrderStatusBadge status={o.status} />
          </div>
          <p className="text-sm font-semibold">
            <Link to="/customers/$customerId" params={{ customerId: o.customerId }} className="hover:text-primary">{o.customerName}</Link>
          </p>
          <ul className="space-y-0.5 text-xs">
            {lines.map((l) => {
              const left = getAvailableStock(db, l.productId, o.branchId);
              return (
                <li key={l.saleId}>
                  <strong>{formatNumber(l.quantity)} × {product(l.productId)}</strong>
                  {l.isPromo && <span className="text-muted-foreground"> (promo)</span>}
                  {isStorekeeper && o.status === "pending" && (
                    <span className="text-muted-foreground"> · held for this order ({formatNumber(left)} more available)</span>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="text-[11px] text-muted-foreground">
            Raised by {person(o.repId)} · {formatDayTime(o.createdAt, today)} · {formatNaira(orderTotal(o))}
          </p>
          {o.note && <p className="text-[11px] text-muted-foreground">“{o.note}”</p>}
          {o.fulfilledAt && <p className="text-[11px] text-muted-foreground">Fulfilled by {person(o.fulfilledBy)} · {formatDayTime(o.fulfilledAt, today)}</p>}
          {o.acknowledgedAt && <p className="text-[11px] text-muted-foreground">Acknowledged by {person(o.acknowledgedBy)} · {formatDayTime(o.acknowledgedAt, today)}</p>}
          {o.cancelledAt && <p className="text-[11px] text-destructive">{o.status === "voided" ? "Voided" : "Cancelled"} by {person(o.cancelledBy)} · {formatDayTime(o.cancelledAt, today)}{o.cancelReason ? ` · ${o.cancelReason}` : ""}</p>}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {canCancel && !cancelling && (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => setCancelling("cancel")}><X className="size-3.5" />Cancel order</Button>
          )}
          {canVoid && !cancelling && (
            <Button size="sm" variant="outline" className="text-destructive" disabled={busy} onClick={() => setCancelling("void")}><Ban className="size-3.5" />Void order</Button>
          )}
          {isStorekeeper && o.status === "pending" && !cancelling && (
            <Button size="sm" disabled={busy} onClick={() => void run(`${o.code} fulfilled`, () => fulfil.mutateAsync({ p_order_id: o.id }))}>
              {fulfil.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <PackageCheck className="size-3.5" />}Fulfil order
            </Button>
          )}
          {isRaiser && scope.canRaiseOrders && o.status === "fulfilled" && (
            <Button size="sm" disabled={busy} onClick={() => void run(`${o.code} acknowledged`, () => acknowledge.mutateAsync({ p_order_id: o.id }))}>
              {acknowledge.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCheck className="size-3.5" />}Acknowledge receipt
            </Button>
          )}
        </div>
      </div>
      {cancelling && (
        <div className="mt-3 space-y-2">
          {cancelling === "void" && (
            <p className="rounded-md bg-destructive/5 px-3 py-2 text-[11px] text-destructive">
              Voiding takes {formatNaira(orderTotal(o))} off {o.customerName}'s account and {person(o.repId)}'s sales, and puts the items back in stock.
              Only do this if the goods are back on the shelf or never left. It can't be undone.
            </p>
          )}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input autoFocus aria-label={cancelling === "void" ? "Reason for voiding" : "Reason for cancelling"}
              placeholder={cancelling === "void" ? "Why is the order voided?" : "Why is the order cancelled?"}
              value={reason} onChange={(e) => setReason(e.target.value)} className="h-9 flex-1" />
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => { setCancelling(false); setError(""); }}>Keep order</Button>
              {cancelling === "void" ? (
                <Button size="sm" variant="outline" className="text-destructive" disabled={busy}
                  onClick={() => void run(`${o.code} voided`, () => voidOrder.mutateAsync({ p_order_id: o.id, p_reason: reason.trim() }))}>
                  {voidOrder.isPending && <Loader2 className="size-3.5 animate-spin" />}Void order
                </Button>
              ) : (
                <Button size="sm" variant="outline" className="text-destructive" disabled={busy}
                  onClick={() => void run(`${o.code} cancelled`, () => cancel.mutateAsync({ p_order_id: o.id, p_reason: reason.trim() }))}>
                  {cancel.isPending && <Loader2 className="size-3.5 animate-spin" />}Cancel order
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
      <FieldError message={error} />
    </li>
  );
}
