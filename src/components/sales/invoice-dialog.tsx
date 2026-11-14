import { useEffect, useState, type FormEvent } from "react";
import { FileDown, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { FieldError } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/auth-context";
import type { Db, Sale } from "@/data/mock-db";
import { keptQuantity, saleTotal } from "@/lib/calculations";
import { getCustomerOrders } from "@/lib/customer-calculations";
import { formatNaira } from "@/lib/format";
import { buildInvoicePdf } from "@/lib/invoice-pdf";
import { callRpc } from "@/lib/rpc";

const STORE_KEY = "friscontech-invoice-account";
type Saved = { accountNumber: string; bankName: string; accountName: string };
const load = (): Saved => {
  try {
    return { accountNumber: "", bankName: "", accountName: "", ...JSON.parse(window.localStorage.getItem(STORE_KEY) ?? "{}") };
  } catch {
    return { accountNumber: "", bankName: "", accountName: "" };
  }
};

/** The business's name and contacts for the invoice header (reps can't read the tenant row). */
function useBusinessProfile(enabled: boolean) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["business-profile", user?.tenantId ?? ""],
    queryFn: async () => ((await callRpc("get_business_profile", {})) as { name: string; legal_name: string; phone: string; business_email: string }[])[0] ?? null,
    enabled: enabled && !!user?.tenantId,
    staleTime: 10 * 60_000,
  });
}

/** Lines picked for one customer share this key (walk-ins: same name and phone). */
export const invoiceCustomerKey = (s: Sale) =>
  s.customerId ?? `walk-in:${(s.walkInName ?? "").trim().toLowerCase()}|${(s.walkInPhone ?? "").trim()}`;

function shortHash(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0).toString(16).toUpperCase().padStart(8, "0");
}

/**
 * Invoice for one customer: one sale (its whole order) or several lines picked in
 * the sales list. Asks for the account number to pay into, then downloads a PDF.
 */
export function InvoiceDialog({ open, onOpenChange, db, sales }: { open: boolean; onOpenChange: (o: boolean) => void; db: Db; sales: Sale[] }) {
  const sale = sales[0]!;
  const { data: business } = useBusinessProfile(open);
  const [form, setForm] = useState<Saved>({ accountNumber: "", bankName: "", accountName: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setForm(load()); setError(""); } }, [open]);

  // One sale: its whole order. Several picked lines: exactly those lines.
  const lines = (sales.length > 1 ? sales : sale.orderId ? db.sales.filter((s) => s.orderId === sale.orderId) : [sale])
    .filter((s) => s.status === "completed" && keptQuantity(s) > 0)
    .sort((a, b) => a.saleDate.localeCompare(b.saleDate) || a.createdAt.localeCompare(b.createdAt));
  const total = lines.reduce((sum, s) => sum + saleTotal(s), 0);
  const customer = sale.customerId ? db.customers.find((c) => c.id === sale.customerId) : undefined;
  const number = sales.length > 1
    ? `INV-${shortHash(lines.map((l) => l.id).sort().join("|"))}`
    : `INV-${(sale.orderId ?? sale.id).replace(/-/g, "").slice(0, 8).toUpperCase()}`;
  const invoiceDate = lines.reduce((d, l) => (l.saleDate > d ? l.saleDate : d), sale.saleDate);

  async function generate(e: FormEvent) {
    e.preventDefault();
    const account = form.accountNumber.replace(/\s/g, "");
    if (!/^\d{10}$/.test(account)) return setError("Enter the 10-digit account number the customer should pay into");
    setBusy(true);
    try {
      try { window.localStorage.setItem(STORE_KEY, JSON.stringify({ ...form, accountNumber: account })); } catch { /* remembering is optional */ }
      // Paid towards these lines: each order's payments, shared across its lines by value.
      const orders = customer ? getCustomerOrders(db, customer.id).filter((o) => o.lines.some((l) => lines.some((x) => x.id === l.id))) : [];
      const paid = customer
        ? Math.round(orders.reduce((sum, o) => {
            const picked = o.lines.filter((l) => lines.some((x) => x.id === l.id)).reduce((s, l) => s + saleTotal(l), 0);
            return sum + (o.total > 0 ? (o.paid * picked) / o.total : 0);
          }, 0) * 100) / 100
        : undefined;
      const sellers = [...new Set(lines.map((l) => l.salesRepId))];
      const branches = [...new Set(lines.map((l) => l.branchId))];
      const seller = sellers.length === 1 ? db.users.find((u) => u.id === sellers[0]) : undefined;
      const product = (id: string) => db.products.find((p) => p.id === id);
      await buildInvoicePdf({
        number,
        date: invoiceDate,
        business: {
          name: business?.name || db.tenant.name || "Friscontech",
          legalName: business?.legal_name || undefined,
          phone: business?.phone || undefined,
          email: business?.business_email || undefined,
        },
        billTo: customer
          ? { name: customer.name, lines: [customer.contactPerson, customer.phone, customer.email, customer.address] }
          : { name: sale.walkInName || "Walk-in customer", lines: [sale.walkInPhone ?? ""] },
        servedBy: seller?.name ?? (sellers.length > 1 ? "Several staff" : "Staff"),
        branch: branches.length === 1 ? (db.branches.find((b) => b.id === branches[0])?.name ?? "") : "Several branches",
        items: lines.map((s) => {
          const kept = keptQuantity(s);
          const p = product(s.productId);
          // Lines from different days carry their date.
          const dated = new Set(lines.map((l) => l.saleDate)).size > 1 ? ` · ${s.saleDate}` : "";
          return {
            description: `${p?.name ?? "Product"}${p?.unit ? ` (${p.unit})` : ""}${dated}`,
            quantity: kept,
            unitPrice: s.unitPrice,
            discount: s.quantity ? Math.round(((s.discountAmount * kept) / s.quantity) * 100) / 100 : 0,
            total: saleTotal(s),
            promo: s.isPromo,
          };
        }),
        paid,
        payment: { accountNumber: account, bankName: form.bankName.trim() || undefined, accountName: form.accountName.trim() || undefined },
      });
      toast.success(`${number} downloaded`);
      onOpenChange(false);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not create the invoice");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invoice {number}</DialogTitle>
          <DialogDescription className="text-xs">
            {customer ? customer.name : sale.walkInName || "Walk-in customer"} · {lines.length} item{lines.length === 1 ? "" : "s"} · {formatNaira(total)}.
            Enter the account the customer should pay into.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => void generate(e)} className="space-y-4" noValidate>
          <div>
            <Label htmlFor="inv-account" className="text-xs">Account number *</Label>
            <Input id="inv-account" inputMode="numeric" autoComplete="off" maxLength={10} placeholder="0123456789" value={form.accountNumber}
              onChange={(e) => setForm({ ...form, accountNumber: e.target.value.replace(/\D/g, "") })} className="mt-1.5 font-mono tracking-wider" aria-invalid={!!error} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="inv-bank" className="text-xs">Bank (optional)</Label>
              <Input id="inv-bank" value={form.bankName} onChange={(e) => setForm({ ...form, bankName: e.target.value })} className="mt-1.5" placeholder="e.g. GTBank" />
            </div>
            <div>
              <Label htmlFor="inv-name" className="text-xs">Account name (optional)</Label>
              <Input id="inv-name" value={form.accountName} onChange={(e) => setForm({ ...form, accountName: e.target.value })} className="mt-1.5" placeholder={business?.name ?? "Business name"} />
            </div>
          </div>
          <FieldError message={error} />
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={busy}>{busy ? <Loader2 className="size-4 animate-spin" /> : <FileDown className="size-4" />}Generate PDF</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
