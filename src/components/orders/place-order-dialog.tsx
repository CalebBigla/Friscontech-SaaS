import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, Loader2, Plus, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { FieldError, FilterSelect } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Db } from "@/data/mock-db";
import { useIdempotencyKey } from "@/hooks/use-idempotency-key";
import { usePlaceOrder } from "@/hooks/use-orders";
import { getCustomersForScope } from "@/lib/customer-calculations";
import { formatNaira, formatNumber } from "@/lib/format";
import { getAvailableStock } from "@/lib/inventory-calculations";
import type { AccessScope } from "@/lib/session";
import { fieldErrorsFrom } from "@/lib/supabase-helpers";

type Line = { key: number; productId: string; quantity: string };

/**
 * A rep's order for one of their customers. Shows what the branch has available
 * (on hand minus units reserved for other orders) and refuses more than that; the
 * server checks again with the stock locked. The storekeeper then fulfils it.
 */
export function PlaceOrderDialog({ open, onOpenChange, db, scope, presetCustomerId }: {
  open: boolean; onOpenChange: (o: boolean) => void; db: Db; scope: AccessScope; presetCustomerId?: string | undefined;
}) {
  const place = usePlaceOrder();
  const idempotencyKey = useIdempotencyKey(open);
  const [customerId, setCustomerId] = useState("");
  const [lines, setLines] = useState<Line[]>([{ key: 1, productId: "", quantity: "1" }]);
  const [nextKey, setNextKey] = useState(2);
  const [note, setNote] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [errors, setErrors] = useState<{ customerId?: string | undefined; form?: string | undefined; lines?: Record<number, string> }>({});

  useEffect(() => {
    if (!open) return;
    setCustomerId(presetCustomerId ?? "");
    setLines([{ key: 1, productId: "", quantity: "1" }]);
    setNextKey(2);
    setNote("");
    setReviewing(false);
    setErrors({});
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const branchId = scope.user.branchId ?? "";
  const branch = db.branches.find((b) => b.id === branchId);
  const customers = getCustomersForScope(db, scope).filter((c) => c.status === "active");
  const customer = customers.find((c) => c.id === customerId);
  const products = db.products
    .filter((p) => p.status === "active" && p.productType !== "promo" && db.inventory.some((i) => i.branchId === branchId && i.productId === p.id))
    .sort((a, b) => a.name.localeCompare(b.name));
  const available = (productId: string) => getAvailableStock(db, productId, branchId);
  const product = (id: string) => db.products.find((p) => p.id === id);
  const qty = (l: Line) => Number(l.quantity);
  const total = lines.reduce((sum, l) => sum + (product(l.productId)?.unitPrice ?? 0) * (qty(l) > 0 ? qty(l) : 0), 0);
  const setLine = (key: number, patch: Partial<Line>) => setLines((rows) => rows.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  function check() {
    const next: typeof errors = { lines: {} };
    if (!customer) next.customerId = "Choose the customer";
    const seen = new Set<string>();
    for (const l of lines) {
      const q = qty(l);
      const left = available(l.productId);
      if (!l.productId) next.lines![l.key] = "Choose a product";
      else if (seen.has(l.productId)) next.lines![l.key] = "This product is already on the order";
      else if (left <= 0) next.lines![l.key] = "Out of stock";
      else if (!Number.isInteger(q) || q <= 0) next.lines![l.key] = "Enter a whole quantity above zero";
      else if (q > left) next.lines![l.key] = `Only ${formatNumber(left)} available`;
      if (l.productId) seen.add(l.productId);
    }
    setErrors(next);
    return !next.customerId && !Object.keys(next.lines!).length;
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!reviewing) {
      if (check()) setReviewing(true);
      return;
    }
    try {
      const order = await place.mutateAsync({
        p_customer_id: customerId,
        p_items: lines.map((l) => ({ product_id: l.productId, quantity: qty(l) })),
        p_note: note.trim() || null,
        p_idempotency_key: idempotencyKey,
      });
      toast.success(`Order ${order.code} sent to the storekeeper`, { description: `${customer?.name ?? "Customer"} · ${formatNaira(total)}. You'll be told when it's fulfilled.` });
      onOpenChange(false);
    } catch (failure) {
      const fields = fieldErrorsFrom(failure, ["customerId", "items"] as const);
      setReviewing(false);
      setErrors({ customerId: fields.customerId, form: fields.items ?? fields.form ?? "Could not place the order" });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{reviewing ? "Check the order" : "New order"}</DialogTitle>
          <DialogDescription className="text-xs">
            {reviewing
              ? "Nothing is sent until you submit. The units are then held for this order until the storekeeper fulfils it."
              : `The ${branch?.name ?? "branch"} storekeeper fulfils the order. You can only order what is available now.`}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => void submit(e)} className="space-y-4" noValidate>
          {reviewing ? (
            <div className="space-y-3">
              <div className="rounded-md border border-border p-3 text-xs">
                <p className="text-muted-foreground">Customer</p>
                <p className="mt-0.5 font-semibold">{customer?.name}</p>
              </div>
              <ul className="divide-y divide-border rounded-md border border-border text-xs">
                {lines.map((l) => {
                  const p = product(l.productId);
                  return (
                    <li key={l.key} className="flex items-center justify-between gap-3 px-3 py-2">
                      <span>{p?.name} × {formatNumber(qty(l))}</span>
                      <span className="font-semibold tabular-nums">{formatNaira((p?.unitPrice ?? 0) * qty(l))}</span>
                    </li>
                  );
                })}
              </ul>
              {note.trim() && <p className="text-xs text-muted-foreground">Note: {note.trim()}</p>}
            </div>
          ) : (
            <>
              <div>
                <Label className="text-xs">Customer *</Label>
                {presetCustomerId ? (
                  <p className="mt-1.5 rounded-md border border-border px-3 py-2 text-xs font-semibold">{customer?.name ?? "Customer"}</p>
                ) : (
                  <div className="mt-1.5">
                    <FilterSelect label="Customer" className="w-full" value={customerId || "none"} onChange={(v) => setCustomerId(v === "none" ? "" : v)}
                      options={[{ value: "none", label: customers.length ? "Choose a customer" : "You have no active customers" }, ...customers.map((c) => ({ value: c.id, label: c.name }))]} />
                  </div>
                )}
                <FieldError message={errors.customerId} />
              </div>
              <div className="space-y-3">
                {lines.map((l, index) => {
                  const left = l.productId ? available(l.productId) : null;
                  const over = left !== null && qty(l) > left;
                  return (
                    <div key={l.key} className="rounded-md border border-border p-3">
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <Label className="text-xs">Product</Label>
                          <div className="mt-1.5">
                            <FilterSelect label={`Product for item ${index + 1}`} className="w-full" value={l.productId || "none"}
                              onChange={(v) => setLine(l.key, { productId: v === "none" ? "" : v })}
                              options={[{ value: "none", label: "Choose a product" }, ...products.map((p) => {
                                const n = available(p.id);
                                return { value: p.id, label: `${p.name} · ${formatNaira(p.unitPrice)} · ${n > 0 ? `${formatNumber(n)} available` : "out of stock"}` };
                              })]} />
                          </div>
                        </div>
                        <div className="w-24 shrink-0">
                          <Label htmlFor={`order-qty-${l.key}`} className="text-xs">Quantity</Label>
                          <Input id={`order-qty-${l.key}`} type="number" inputMode="numeric" min={1} step={1} value={l.quantity}
                            onChange={(e) => setLine(l.key, { quantity: e.target.value })} className="mt-1.5" aria-invalid={over || !!errors.lines?.[l.key]} />
                        </div>
                        <Button type="button" variant="ghost" size="icon" className="mt-6 shrink-0" aria-label={`Remove item ${index + 1}`}
                          disabled={lines.length === 1} onClick={() => setLines((rows) => rows.filter((x) => x.key !== l.key))}>
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                      {left !== null && (
                        <p className={`mt-2 text-[11px] font-medium ${left <= 0 || over ? "text-destructive" : left <= (product(l.productId)?.lowStockThreshold ?? 0) ? "text-warning" : "text-success"}`}>
                          {left <= 0 ? "Out of stock: it can't be ordered now" : over ? `Only ${formatNumber(left)} available` : `${formatNumber(left)} available at ${branch?.name ?? "the branch"}`}
                        </p>
                      )}
                      <FieldError message={errors.lines?.[l.key]} />
                    </div>
                  );
                })}
                <Button type="button" variant="outline" size="sm" onClick={() => { setLines((rows) => [...rows, { key: nextKey, productId: "", quantity: "1" }]); setNextKey((k) => k + 1); }}>
                  <Plus className="size-3.5" />Add product
                </Button>
              </div>
              <div>
                <Label htmlFor="order-note" className="text-xs">Note for the storekeeper (optional)</Label>
                <Textarea id="order-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} className="mt-1.5" placeholder="e.g. Customer collects Monday" />
              </div>
            </>
          )}
          <div className="flex items-center justify-between rounded-md bg-muted p-3">
            <span className="text-xs text-muted-foreground">Order total (list price)</span>
            <strong className="tabular-nums">{formatNaira(total)}</strong>
          </div>
          <FieldError message={errors.form} />
          <DialogFooter className="gap-2">
            {reviewing ? (
              <Button type="button" variant="outline" onClick={() => setReviewing(false)}><ArrowLeft className="size-4" />Back</Button>
            ) : (
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            )}
            <Button type="submit" disabled={place.isPending}>
              {place.isPending ? <Loader2 className="size-4 animate-spin" /> : reviewing ? <Send className="size-4" /> : null}
              {reviewing ? "Submit order" : "Review order"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
