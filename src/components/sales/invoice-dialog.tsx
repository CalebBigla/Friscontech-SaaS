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

/** Invoice for the whole order this sale belongs to: asks for the account number to pay into, then downloads a PDF. */
export function InvoiceDialog({ open, onOpenChange, db, sale }: { open: boolean; onOpenChange: (o: boolean) => void; db: Db; sale: Sale }) {
  const { data: business } = useBusinessProfile(open);
  const [form, setForm] = useState<Saved>({ accountNumber: "", bankName: "", accountName: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setForm(load()); setError(""); } }, [open]);

  const lines = (sale.orderId ? db.sales.filter((s) => s.orderId === sale.orderId) : [sale])
    .filter((s) => s.status === "completed" && keptQuantity(s) > 0);
  const total = lines.reduce((sum, s) => sum + saleTotal(s), 0);
  const customer = sale.customerId ? db.customers.find((c) => c.id === sale.customerId) : undefined;
  const number = `INV-${(sale.orderId ?? sale.id).replace(/-/g, "").slice(0, 8).toUpperCase()}`;

  async function generate(e: FormEvent) {
    e.preventDefault();
    const account = form.accountNumber.replace(/\s/g, "");
    if (!/^\d{10}$/.test(account)) return setError("Enter the 10-digit account number the customer should pay into");
    setBusy(true);
    try {
      try { window.localStorage.setItem(STORE_KEY, JSON.stringify({ ...form, accountNumber: account })); } catch { /* remembering is optional */ }
      const order = customer ? getCustomerOrders(db, customer.id).find((o) => o.lines.some((l) => l.id === sale.id)) : undefined;
      const seller = db.users.find((u) => u.id === sale.salesRepId);
      const product = (id: string) => db.products.find((p) => p.id === id);
      await buildInvoicePdf({
        number,
        date: sale.saleDate,
        business: {
          name: business?.name || db.tenant.name || "Friscontech",
          legalName: business?.legal_name || undefined,
          phone: business?.phone || undefined,
          email: business?.business_email || undefined,
        },
        billTo: customer
          ? { name: customer.name, lines: [customer.contactPerson, customer.phone, customer.email, customer.address] }
          : { name: sale.walkInName || "Walk-in customer", lines: [sale.walkInPhone ?? ""] },
        servedBy: seller?.name ?? "Staff",
        branch: db.branches.find((b) => b.id === sale.branchId)?.name ?? "",
        items: lines.map((s) => {
          const kept = keptQuantity(s);
          const p = product(s.productId);
          return {
            description: `${p?.name ?? "Product"}${p?.unit ? ` (${p.unit})` : ""}`,
            quantity: kept,
            unitPrice: s.unitPrice,
            discount: s.quantity ? Math.round(((s.discountAmount * kept) / s.quantity) * 100) / 100 : 0,
            total: saleTotal(s),
            promo: s.isPromo,
          };
        }),
        paid: order ? order.paid : undefined,
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
