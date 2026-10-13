import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Download, FileText } from "lucide-react";
import { toast } from "sonner";

import { AppShell, RestrictedNotice } from "@/components/app-shell";
import { BalanceBadge } from "@/components/customers/customers-page";
import { CreditLimitDialog, CustomerFormDialog, RecordCustomerPaymentDialog } from "@/components/customers/customer-dialogs";
import { PaymentStatusBadge } from "@/components/payments/payment-page";
import { RecordSaleDialog } from "@/components/sales/record-sale-dialog";
import { DetailItem, EmptyState, Panel, StatTile } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { saleTotal } from "@/lib/calculations";
import {
  canAccessCustomer,
  customerStatementCsv,
  getCustomerLedger,
  getCustomerOrders,
  getCustomerPayments,
  getCustomerSummary,
  orderPaymentLabel,
} from "@/lib/customer-calculations";
import { formatDate, formatNaira } from "@/lib/format";
import { getAccessScope, useCurrentUserId } from "@/lib/session";
import { useDb } from "@/services/mock-store";
import { customerService } from "@/services/services";

const orderTone = { paid: "status-success", partly_paid: "status-warning", unpaid: "status-danger" } as const;

export function CustomerDetailPage({ customerId }: { customerId: string }) {
  const db = useDb();
  const userId = useCurrentUserId();
  const scope = getAccessScope(db, userId);
  const customer = db.customers.find((c) => c.id === customerId);
  const [dialog, setDialog] = useState<"edit" | "order" | "payment" | "limit" | null>(null);

  if (!customer || !canAccessCustomer(scope, customer))
    return (
      <AppShell title="Customer">
        <RestrictedNotice message="This customer was not found or is outside your branch." />
      </AppShell>
    );

  const summary = getCustomerSummary(db, customer);
  const ledger = getCustomerLedger(db, customer.id);
  const orders = getCustomerOrders(db, customer.id);
  const payments = getCustomerPayments(db, customer.id);
  const name = (id?: string) => db.users.find((u) => u.id === id)?.name ?? "—";
  const product = (id: string) => db.products.find((p) => p.id === id)?.name ?? "Product";
  const canAct = scope.canManageCustomers && customer.status === "active";

  const downloadCsv = () => {
    const blob = new Blob([customerStatementCsv(db, customer)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${customer.name.replace(/\W+/g, "-")}-statement.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const printPdf = () => {
    const w = window.open("", "_blank");
    if (!w) {
      toast.error("Allow pop-ups to export the statement");
      return;
    }
    const rows = ledger.slice().reverse().map((r) => `<tr><td>${r.date}</td><td>${r.description}</td><td>${r.debit ? formatNaira(r.debit) : ""}</td><td>${r.credit ? formatNaira(r.credit) : ""}</td><td>${formatNaira(r.balance)}</td></tr>`).join("");
    w.document.write(`<html><head><title>Statement · ${customer.name}</title><style>body{font-family:system-ui,sans-serif;padding:32px;color:#111}h1{font-size:20px;margin:0}table{width:100%;border-collapse:collapse;margin-top:20px;font-size:12px}td,th{border-bottom:1px solid #ddd;padding:6px;text-align:left}</style></head><body><h1>Friscontech · Customer statement</h1><p>${customer.name}<br/>${customer.phone} · ${customer.address}<br/>As of ${formatDate(db.tenant.referenceDate)} · Balance ${formatNaira(summary.balance)}</p><table><thead><tr><th>Date</th><th>Description</th><th>Debit</th><th>Credit</th><th>Balance</th></tr></thead><tbody>${rows}</tbody></table></body></html>`);
    w.document.close();
    w.print();
  };
  const toggleStatus = async () => {
    const result = await customerService.setStatus(customer.id, customer.status === "active" ? "inactive" : "active", userId);
    if (result.ok) toast.success(result.data.status === "active" ? "Customer activated" : "Customer deactivated");
    else toast.error(result.errors.form ?? "Could not update the customer");
  };

  return (
    <AppShell title={customer.name} subtitle="Customer account">
      <Link to="/customers" className="mb-3 inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground"><ArrowLeft className="size-3.5" />Customers</Link>
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold">{customer.name}</h1>
            {customer.status === "inactive" ? <span className="status status-warning">Inactive</span> : <BalanceBadge balance={summary.balance} />}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{[customer.contactPerson, customer.phone, customer.email].filter(Boolean).join(" · ")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canAct && <Button size="sm" onClick={() => setDialog("order")}>New order</Button>}
          {canAct && <Button size="sm" variant="outline" onClick={() => setDialog("payment")}>Record payment</Button>}
          {scope.canManageCustomers && <Button size="sm" variant="outline" onClick={() => setDialog("edit")}>Edit</Button>}
          {scope.canManageCustomers && <Button size="sm" variant="outline" onClick={toggleStatus}>{customer.status === "active" ? "Deactivate" : "Activate"}</Button>}
          {scope.canSetCreditLimit && <Button size="sm" variant="outline" onClick={() => setDialog("limit")}>Credit limit</Button>}
          <Button size="sm" variant="ghost" onClick={downloadCsv}><Download className="size-4" />CSV</Button>
          <Button size="sm" variant="ghost" onClick={printPdf}><FileText className="size-4" />PDF</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile tone={summary.balance < 0 ? "danger" : "success"} label="Balance" value={formatNaira(summary.balance)} detail={summary.balance < 0 ? "Customer owes" : "Nothing owed"} />
        <StatTile label="Total ordered" value={formatNaira(summary.debits)} detail={`${summary.orders} order${summary.orders === 1 ? "" : "s"}`} />
        <StatTile tone="success" label="Total paid (confirmed)" value={formatNaira(summary.credits)} detail={summary.pending ? `${formatNaira(summary.pending)} awaiting confirmation` : undefined} />
        <StatTile tone="warning" label="Credit limit used" value={summary.creditUsage === null ? "No limit" : `${Math.round(summary.creditUsage)}%`} detail={customer.creditLimit ? `of ${formatNaira(customer.creditLimit)}` : undefined} />
      </div>

      <Panel title="Details" className="mt-4">
        <div className="grid gap-4 p-5 sm:grid-cols-4">
          <DetailItem label="Branch">{db.branches.find((b) => b.id === customer.branchId)?.name ?? "All branches"}</DetailItem>
          <DetailItem label="Address">{customer.address || "—"}</DetailItem>
          <DetailItem label="Created by">{name(customer.createdBy)}</DetailItem>
          <DetailItem label="Since">{formatDate(customer.createdAt)}</DetailItem>
        </div>
      </Panel>

      <Tabs defaultValue="ledger" className="mt-4">
        <TabsList>
          <TabsTrigger value="ledger">Ledger</TabsTrigger>
          <TabsTrigger value="orders">Orders ({orders.length})</TabsTrigger>
          <TabsTrigger value="payments">Payments ({payments.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="ledger">
          <Panel title="Ledger" subtitle="Orders are debits; owner-confirmed payments are credits">
            {ledger.length ? (
              <Table head={["Date", "Description", "Debit", "Credit", "Balance"]}>
                {ledger.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(r.date)}</td>
                    <td className="px-4 py-3">{r.description}</td>
                    <td className="px-4 py-3 tabular-nums">{r.debit ? formatNaira(r.debit) : ""}</td>
                    <td className="px-4 py-3 tabular-nums text-success">{r.credit ? formatNaira(r.credit) : ""}</td>
                    <td className={`px-4 py-3 font-bold tabular-nums ${r.balance < 0 ? "text-destructive" : ""}`}>{formatNaira(r.balance)}</td>
                  </tr>
                ))}
              </Table>
            ) : <EmptyState title="No account activity yet." />}
          </Panel>
        </TabsContent>
        <TabsContent value="orders">
          <Panel title="Orders" subtitle="Storekeepers release the items listed on each order">
            {orders.length ? (
              <Table head={["Order", "Date", "Items", "Rep", "Total", "Paid", "Status"]}>
                {orders.map((o) => (
                  <tr key={o.orderId}>
                    <td className="px-4 py-3 font-mono text-[11px] font-bold">{o.orderId}</td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(o.date)}</td>
                    <td className="px-4 py-3">{o.lines.map((l) => `${product(l.productId)} × ${l.quantity}`).join(", ")}</td>
                    <td className="px-4 py-3">{name(o.salesRepId)}</td>
                    <td className="px-4 py-3 font-bold tabular-nums">{formatNaira(o.lines.reduce((s, l) => s + saleTotal(l), 0))}</td>
                    <td className="px-4 py-3 tabular-nums">{formatNaira(o.paid)}</td>
                    <td className="px-4 py-3"><span className={`status ${orderTone[o.paymentStatus]}`}>{orderPaymentLabel[o.paymentStatus]}</span></td>
                  </tr>
                ))}
              </Table>
            ) : <EmptyState title="No orders yet." />}
          </Panel>
        </TabsContent>
        <TabsContent value="payments">
          <Panel title="Payments" subtitle="Rep submits → Manager acknowledges → Owner confirms">
            {payments.length ? (
              <Table head={["Date", "Payment", "Amount", "Method", "Collected by", "Status"]}>
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(p.paymentDate)}</td>
                    <td className="px-4 py-3 font-mono text-[11px]">{p.id}{p.reference ? ` · ${p.reference}` : ""}</td>
                    <td className="px-4 py-3 font-bold tabular-nums">{formatNaira(p.amount)}</td>
                    <td className="px-4 py-3">{p.method === "cash" ? "Cash" : "Transfer"}</td>
                    <td className="px-4 py-3">{name(p.receivedBy)}</td>
                    <td className="px-4 py-3"><PaymentStatusBadge status={p.status} /></td>
                  </tr>
                ))}
              </Table>
            ) : <EmptyState title="No payments yet." />}
          </Panel>
        </TabsContent>
      </Tabs>

      {scope.canManageCustomers && <CustomerFormDialog open={dialog === "edit"} onOpenChange={(o) => setDialog(o ? "edit" : null)} actorId={userId} customer={customer} />}
      {canAct && <RecordCustomerPaymentDialog open={dialog === "payment"} onOpenChange={(o) => setDialog(o ? "payment" : null)} actorId={userId} customer={customer} />}
      {canAct && <RecordSaleDialog open={dialog === "order"} onOpenChange={(o) => setDialog(o ? "order" : null)} scope={scope} presetCustomerId={customer.id} />}
      {scope.canSetCreditLimit && <CreditLimitDialog open={dialog === "limit"} onOpenChange={(o) => setDialog(o ? "limit" : null)} actorId={userId} customer={customer} />}
    </AppShell>
  );
}

function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[620px] text-left text-xs">
        <thead className="border-b border-border bg-muted/40 text-[10px] uppercase text-muted-foreground">
          <tr>{head.map((h) => <th key={h} className="px-4 py-3 font-semibold">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-border">{children}</tbody>
      </table>
    </div>
  );
}
