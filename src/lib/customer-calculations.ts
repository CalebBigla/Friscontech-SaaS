/**
 * Customer account math. Nothing here is stored: debits are customer order totals,
 * credits are owner-confirmed customer payments, balance = credits − debits (negative = owes).
 */
import type { Customer, CustomerPayment, Db, Sale } from "@/data/mock-db";
import type { AccessScope } from "@/lib/session";
import { saleTotal } from "@/lib/calculations";

export const orderIdOf = (sale: Pick<Sale, "id" | "orderId">) => sale.orderId ?? sale.id;
export const isCustomerSale = (sale: Pick<Sale, "customerId">) => !!sale.customerId;
export type SaleType = "walk_in" | "customer";
export const saleTypeOf = (sale: Pick<Sale, "customerId">): SaleType =>
  sale.customerId ? "customer" : "walk_in";
export const saleTypeLabel: Record<SaleType, string> = { walk_in: "Walk-in", customer: "Customer" };

export function canAccessCustomer(scope: AccessScope, customer: Customer) {
  if (!scope.canViewCustomers || customer.tenantId !== scope.user.tenantId) return false;
  if (scope.branchIds === null) return true;
  return customer.branchId === null || scope.branchIds.includes(customer.branchId);
}

export function getCustomersForScope(db: Db, scope: AccessScope) {
  return db.customers
    .filter((c) => c.tenantId === db.tenant.id && canAccessCustomer(scope, c))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export const getCustomerOrderLines = (db: Db, customerId: string) =>
  db.sales.filter(
    (s) => s.tenantId === db.tenant.id && s.customerId === customerId && s.status === "completed",
  );

export const getCustomerPayments = (db: Db, customerId: string) =>
  db.customerPayments
    .filter((p) => p.tenantId === db.tenant.id && p.customerId === customerId)
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));

const confirmed = (rows: CustomerPayment[]) => rows.filter((p) => p.status === "confirmed");

export function getCustomerDebits(db: Db, customerId: string) {
  return getCustomerOrderLines(db, customerId).reduce((sum, s) => sum + saleTotal(s), 0);
}
export function getCustomerCredits(db: Db, customerId: string) {
  return confirmed(getCustomerPayments(db, customerId)).reduce((sum, p) => sum + p.amount, 0);
}
export const getCustomerBalance = (db: Db, customerId: string) =>
  getCustomerCredits(db, customerId) - getCustomerDebits(db, customerId);

export function getCustomerSummary(db: Db, customer: Customer) {
  const debits = getCustomerDebits(db, customer.id);
  const credits = getCustomerCredits(db, customer.id);
  const balance = credits - debits;
  const pending = getCustomerPayments(db, customer.id)
    .filter((p) => p.status === "submitted" || p.status === "acknowledged")
    .reduce((sum, p) => sum + p.amount, 0);
  const owed = Math.max(-balance, 0);
  const creditUsage =
    customer.creditLimit && customer.creditLimit > 0 ? (owed / customer.creditLimit) * 100 : null;
  return { debits, credits, balance, owed, pending, creditUsage, orders: getCustomerOrders(db, customer.id).length };
}

export type CustomerOrder = {
  orderId: string;
  date: string;
  createdAt: string;
  salesRepId: string;
  branchId: string;
  lines: Sale[];
  total: number;
  paid: number;
  paymentStatus: "paid" | "partly_paid" | "unpaid";
};
export const orderPaymentLabel: Record<CustomerOrder["paymentStatus"], string> = {
  paid: "Paid",
  partly_paid: "Partly paid",
  unpaid: "Unpaid",
};

/** Orders oldest-first get confirmed credits allocated FIFO, unless a payment names its order. */
export function getCustomerOrders(db: Db, customerId: string): CustomerOrder[] {
  const groups = new Map<string, Sale[]>();
  for (const line of getCustomerOrderLines(db, customerId)) {
    const key = orderIdOf(line);
    groups.set(key, [...(groups.get(key) ?? []), line]);
  }
  const orders = [...groups.entries()]
    .map(([orderId, lines]) => ({
      orderId,
      date: lines[0]!.saleDate,
      createdAt: lines[0]!.createdAt,
      salesRepId: lines[0]!.salesRepId,
      branchId: lines[0]!.branchId,
      lines,
      total: lines.reduce((sum, l) => sum + saleTotal(l), 0),
    }))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const credits = confirmed(getCustomerPayments(db, customerId));
  const paidByOrder = new Map<string, number>();
  let pool = 0;
  for (const p of credits) {
    if (p.orderId && orders.some((o) => o.orderId === p.orderId))
      paidByOrder.set(p.orderId, (paidByOrder.get(p.orderId) ?? 0) + p.amount);
    else pool += p.amount;
  }
  return orders
    .map((o) => {
      let paid = Math.min(paidByOrder.get(o.orderId) ?? 0, o.total);
      const take = Math.min(pool, o.total - paid);
      paid += take;
      pool -= take;
      const paymentStatus: CustomerOrder["paymentStatus"] =
        paid >= o.total ? "paid" : paid > 0 ? "partly_paid" : "unpaid";
      return { ...o, paid, paymentStatus };
    })
    .reverse();
}

export type LedgerRow = {
  id: string;
  date: string;
  at: string;
  kind: "order" | "payment";
  description: string;
  debit: number;
  credit: number;
  balance: number;
};
/** Ledger of orders (debits) and confirmed payments (credits) with running balance, newest first. */
export function getCustomerLedger(db: Db, customerId: string): LedgerRow[] {
  const entries = [
    ...getCustomerOrders(db, customerId).map((o) => ({
      id: o.orderId,
      date: o.date,
      at: o.createdAt,
      kind: "order" as const,
      description: `Order ${o.orderId} · ${o.lines.length} item${o.lines.length === 1 ? "" : "s"}`,
      debit: o.total,
      credit: 0,
    })),
    ...confirmed(getCustomerPayments(db, customerId)).map((p) => ({
      id: p.id,
      date: p.paymentDate,
      at: p.confirmedAt ?? p.submittedAt,
      kind: "payment" as const,
      description: `Payment ${p.id} · ${p.method === "cash" ? "Cash" : "Transfer"}${p.reference ? ` · ${p.reference}` : ""}`,
      debit: 0,
      credit: p.amount,
    })),
  ].sort((a, b) => a.at.localeCompare(b.at));
  let running = 0;
  return entries
    .map((e) => {
      running += e.credit - e.debit;
      return { ...e, balance: running };
    })
    .reverse();
}

/** Customer payments collected by a rep that the owner has confirmed (for the rep's period view). */
export function getRepConfirmedCustomerCollections(db: Db, repId: string, period: string) {
  return db.customerPayments
    .filter(
      (p) =>
        p.tenantId === db.tenant.id &&
        p.receivedBy === repId &&
        p.status === "confirmed" &&
        p.paymentDate.startsWith(period),
    )
    .reduce((sum, p) => sum + p.amount, 0);
}

export function customerStatementCsv(db: Db, customer: Customer) {
  const rows = getCustomerLedger(db, customer.id).slice().reverse();
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  return [
    ["Date", "Type", "Description", "Debit (NGN)", "Credit (NGN)", "Balance (NGN)"].map(esc).join(","),
    ...rows.map((r) =>
      [r.date, r.kind === "order" ? "Order" : "Payment", r.description, r.debit, r.credit, r.balance]
        .map(esc)
        .join(","),
    ),
  ].join("\n");
}
