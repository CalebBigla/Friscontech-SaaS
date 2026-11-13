import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";

import { DetailItem, RequestStatusBadge } from "@/components/shared";
import type { Db } from "@/data/mock-db";
import { saleTotal } from "@/lib/calculations";
import { getCustomerOrders, getCustomerSummary, orderPaymentLabel } from "@/lib/customer-calculations";
import { formatDate, formatNaira, formatNumber } from "@/lib/format";

/**
 * What an audit entry refers to, read from data the viewer can already see. A
 * record the viewer can't see (or that no longer exists) shows a short note.
 */
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-6">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      <div className="mt-2 rounded-lg border border-border p-4">{children}</div>
    </section>
  );
}
const stamp = (iso?: string) => (iso ? `${formatDate(iso.slice(0, 10))} ${iso.slice(11, 16)}` : "—");
const paymentTone = { paid: "status-success", partly_paid: "status-warning", unpaid: "status-danger" } as const;
const paymentStatusLabel = { submitted: "Awaiting manager", acknowledged: "Awaiting Owner", confirmed: "Confirmed", declined: "Declined" } as Record<string, string>;

export function SaleAuditDetails({ db, saleId }: { db: Db; saleId: string }) {
  const sale = db.sales.find((s) => s.id === saleId || s.code === saleId);
  if (!sale) return <Section title="Sale"><p className="text-sm text-muted-foreground">This sale is not available to you, or no longer exists.</p></Section>;
  const product = db.products.find((p) => p.id === sale.productId);
  const seller = db.users.find((u) => u.id === sale.salesRepId);
  const customer = sale.customerId ? db.customers.find((c) => c.id === sale.customerId) : undefined;
  const order = customer ? getCustomerOrders(db, customer.id).find((o) => o.lines.some((l) => l.id === sale.id)) : undefined;
  const orderPayments = customer
    ? db.customerPayments.filter((p) => p.customerId === customer.id && order && p.orderId === order.orderId)
    : [];
  const summary = customer ? getCustomerSummary(db, customer) : undefined;

  return (
    <>
      <Section title="Sale">
        <div className="grid grid-cols-2 gap-4">
          <DetailItem label="Sale">{sale.code}</DetailItem>
          <DetailItem label="Date">{formatDate(sale.saleDate)}</DetailItem>
          <DetailItem label="Product">{product?.name ?? "—"}{sale.isPromo ? " (promo)" : ""}</DetailItem>
          <DetailItem label="Quantity">{formatNumber(sale.quantity)}</DetailItem>
          <DetailItem label="Unit price">{sale.isPromo ? "Free" : formatNaira(sale.unitPrice)}</DetailItem>
          <DetailItem label="Discount">{sale.discountAmount > 0 ? formatNaira(sale.discountAmount) : "None"}</DetailItem>
          <DetailItem label="Line total"><span className="font-bold">{sale.isPromo ? "Free" : formatNaira(saleTotal(sale))}</span></DetailItem>
          <DetailItem label="Sold by">{seller?.name ?? "—"}</DetailItem>
        </div>
      </Section>

      <Section title="Customer and payment">
        {customer ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <Link to="/customers/$customerId" params={{ customerId: customer.id }} className="text-sm font-semibold text-primary hover:underline">{customer.name}</Link>
                <p className="text-xs text-muted-foreground">{[customer.contactPerson, customer.phone].filter(Boolean).join(" · ")}</p>
              </div>
              {order && <span className={`status ${paymentTone[order.paymentStatus]} whitespace-nowrap`}>{orderPaymentLabel[order.paymentStatus]}</span>}
            </div>
            {order && (
              <div className="grid grid-cols-2 gap-4">
                <DetailItem label="Order total">{formatNaira(order.total)}</DetailItem>
                <DetailItem label="Paid towards it">{formatNaira(order.paid)}</DetailItem>
                <DetailItem label="Items on the order">{formatNumber(order.lines.length)}</DetailItem>
                <DetailItem label="Still owed on it">{formatNaira(Math.max(order.total - order.paid, 0))}</DetailItem>
              </div>
            )}
            {orderPayments.length > 0 && (
              <ul className="divide-y divide-border rounded-md bg-muted/40 text-xs">
                {orderPayments.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                    <span>{formatDate(p.paymentDate)} · {p.method}{p.reference ? ` · ${p.reference}` : ""}</span>
                    <span className="font-semibold tabular-nums">{formatNaira(p.amount)} <span className="font-normal text-muted-foreground">· {paymentStatusLabel[p.status] ?? p.status}</span></span>
                  </li>
                ))}
              </ul>
            )}
            {summary && (
              <p className="text-xs text-muted-foreground">
                Customer balance now:{" "}
                <span className={`font-semibold ${summary.balance < 0 ? "text-destructive" : summary.balance > 0 ? "text-success" : "text-foreground"}`}>
                  {summary.balance < 0 ? `owes ${formatNaira(-summary.balance)}` : summary.balance > 0 ? `in credit ${formatNaira(summary.balance)}` : "settled"}
                </span>
                {summary.pending > 0 && ` · ${formatNaira(summary.pending)} awaiting confirmation`}
              </p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            <DetailItem label="Customer">{sale.walkInName ? `${sale.walkInName} (walk-in)` : "Walk-in"}</DetailItem>
            <DetailItem label="Phone">{sale.walkInPhone ?? "—"}</DetailItem>
            <p className="col-span-2 text-xs text-muted-foreground">Walk-in sales have no customer account; the cash is part of the rep's remittance.</p>
          </div>
        )}
      </Section>
    </>
  );
}

export function StockRequestAuditDetails({ db, requestId }: { db: Db; requestId: string }) {
  const r = db.stockRequests.find((x) => x.id === requestId);
  if (!r) return <Section title="Stock request"><p className="text-sm text-muted-foreground">This request is not available to you, or no longer exists.</p></Section>;
  const name = (id?: string) => (id ? (db.users.find((u) => u.id === id)?.name ?? "—") : "—");
  const product = db.products.find((p) => p.id === r.productId);
  const steps = [
    ["Requested", r.requestedAt, r.repId],
    ["Approved", r.approvedAt, r.approvedBy],
    ["Rejected", r.rejectedAt, r.processedBy],
    ["Issued", r.fulfilledAt, r.fulfilledBy],
    ["Received by rep", r.acknowledgedAt, r.acknowledgedBy],
  ].filter(([, at]) => !!at) as [string, string, string | undefined][];

  return (
    <Section title={`Stock request ${r.id}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold">{product?.name ?? "Product"}</p>
        <RequestStatusBadge request={r} />
      </div>
      <div className="mt-4 grid grid-cols-3 gap-4">
        <DetailItem label="Requested">{formatNumber(r.quantityRequested)}</DetailItem>
        <DetailItem label="Approved">{r.quantityApproved != null ? formatNumber(r.quantityApproved) : "—"}</DetailItem>
        <DetailItem label="Issued">{formatNumber(r.quantityFulfilled ?? 0)}</DetailItem>
        <DetailItem label="Sales rep">{name(r.repId)}</DetailItem>
        <DetailItem label="Branch">{db.branches.find((b) => b.id === r.branchId)?.name ?? "—"}</DetailItem>
        <DetailItem label="Priority">{r.priority}</DetailItem>
      </div>
      <ol className="mt-4 space-y-2 border-l border-border pl-4 text-xs">
        {steps.map(([label, at, by]) => (
          <li key={label} className="relative">
            <span className="absolute -left-[21px] top-1 size-2.5 rounded-full border-2 border-background bg-primary" aria-hidden="true" />
            <span className="font-semibold">{label}</span> · {stamp(at)}{by ? ` · ${name(by)}` : ""}
          </li>
        ))}
      </ol>
      {r.note && <p className="mt-3 rounded-md bg-muted/60 px-3 py-2 text-xs">Note: {r.note}</p>}
      {r.rejectionReason && <p className="mt-3 rounded-md bg-destructive/5 px-3 py-2 text-xs text-destructive">Rejected: {r.rejectionReason}</p>}
    </Section>
  );
}
