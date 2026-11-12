import { useState, type FormEvent } from "react";
import { Gift, Loader2, Percent } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError, FilterSelect } from "@/components/shared";
import type { Db, DiscountType, Sale } from "@/data/mock-db";
import { useAddSalePromo, useApplySaleDiscount } from "@/hooks/use-sales";
import { formatNaira } from "@/lib/format";
import { fieldErrorsFrom } from "@/lib/supabase-helpers";

/**
 * Owner only: discount a sold line or add promo items to its order after the rep
 * recorded it at list price. The sale stays the rep's; their target counts the
 * line total after the discount. The server re-checks the role and every value.
 */
export function OwnerSaleAdjustments({ db, sale, onChanged }: { db: Db; sale: Sale; onChanged: (s: Sale) => void }) {
  const applyDiscount = useApplySaleDiscount();
  const addPromo = useAddSalePromo();
  const gross = sale.quantity * sale.unitPrice;

  const [type, setType] = useState<DiscountType>(sale.discountType ?? "percent");
  const [value, setValue] = useState(sale.discountValue ? String(sale.discountValue) : "");
  const [discountError, setDiscountError] = useState("");

  const promoProducts = db.products.filter((p) => p.status === "active" && p.productType === "promo");
  const [promoId, setPromoId] = useState(promoProducts[0]?.id ?? "");
  const [promoQty, setPromoQty] = useState("1");
  const [promoError, setPromoError] = useState("");

  const numeric = Number(value || 0);
  const preview = type === "percent" ? Math.round(gross * numeric) / 100 : numeric;

  async function submitDiscount(e: FormEvent, clear = false) {
    e.preventDefault();
    setDiscountError("");
    if (!clear) {
      if (!Number.isFinite(numeric) || numeric <= 0) return setDiscountError("Enter a discount above zero");
      if (type === "percent" && numeric > 100) return setDiscountError("A discount cannot be more than 100%");
      if (type === "amount" && numeric > gross) return setDiscountError("The discount is more than the line total");
    }
    try {
      const updated = await applyDiscount.mutateAsync({
        p_sale_id: sale.id,
        p_discount_type: clear ? null : type,
        p_discount_value: clear ? null : numeric,
      });
      if (clear) setValue("");
      toast.success(clear ? "Discount removed" : "Discount applied", {
        description: `Line total is now ${formatNaira(updated.quantity * updated.unitPrice - updated.discountAmount)}.`,
      });
      onChanged(updated);
    } catch (error) {
      const errors = fieldErrorsFrom(error, ["discount", "discountType"] as const);
      setDiscountError(errors.discount ?? errors.discountType ?? errors.form ?? "Could not apply the discount");
    }
  }

  async function submitPromo(e: FormEvent) {
    e.preventDefault();
    setPromoError("");
    const qty = Number(promoQty);
    if (!promoId) return setPromoError("Choose a promo item");
    if (!Number.isInteger(qty) || qty <= 0) return setPromoError("Enter a whole quantity above zero");
    try {
      await addPromo.mutateAsync({ p_sale_id: sale.id, p_items: [{ product_id: promoId, quantity: qty }] });
      toast.success("Promo item added", { description: `${qty} × ${promoProducts.find((p) => p.id === promoId)?.name ?? "promo item"} on this order.` });
      setPromoQty("1");
    } catch (error) {
      const errors = fieldErrorsFrom(error, ["items"] as const);
      setPromoError(errors.items ?? errors.form ?? "Could not add the promo item");
    }
  }

  return (
    <div className="space-y-4 rounded-lg border border-border bg-muted/30 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Owner adjustments</p>

      <form onSubmit={(e) => void submitDiscount(e)} className="space-y-2" noValidate>
        <Label htmlFor="owner-discount" className="text-xs">Discount on this line</Label>
        <div className="flex gap-2">
          <Input
            id="owner-discount"
            inputMode="decimal"
            placeholder="0"
            value={value}
            onChange={(e) => setValue(e.target.value.replace(/[^\d.]/g, ""))}
            aria-invalid={!!discountError}
            className="h-9 min-w-0 flex-1"
          />
          <FilterSelect
            label="Discount type"
            className="w-16 shrink-0"
            value={type}
            onChange={(v) => setType(v as DiscountType)}
            options={[{ value: "percent", label: "%" }, { value: "amount", label: "₦" }]}
          />
          <Button type="submit" size="sm" className="h-9" disabled={applyDiscount.isPending}>
            {applyDiscount.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Percent className="size-3.5" />}Apply
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          {numeric > 0 && Number.isFinite(numeric)
            ? `${formatNaira(Math.min(preview, gross))} off · line total ${formatNaira(Math.max(gross - preview, 0))}`
            : `List price ${formatNaira(gross)}`}
          {sale.discountAmount > 0 && (
            <>
              {" · "}
              <button type="button" className="font-semibold text-destructive hover:underline" onClick={(e) => void submitDiscount(e as unknown as FormEvent, true)}>
                Remove discount
              </button>
            </>
          )}
        </p>
        <FieldError message={discountError} />
      </form>

      {promoProducts.length > 0 && (
        <form onSubmit={(e) => void submitPromo(e)} className="space-y-2 border-t border-border pt-4" noValidate>
          <Label className="text-xs">Add a promo item to this order</Label>
          <div className="flex gap-2">
            <FilterSelect
              label="Promo item"
              className="min-w-0 flex-1"
              value={promoId}
              onChange={setPromoId}
              options={promoProducts.map((p) => ({ value: p.id, label: p.name }))}
            />
            <Input
              aria-label="Promo quantity"
              inputMode="numeric"
              value={promoQty}
              onChange={(e) => setPromoQty(e.target.value.replace(/\D/g, ""))}
              className="h-9 w-16 shrink-0"
            />
            <Button type="submit" size="sm" variant="outline" className="h-9" disabled={addPromo.isPending}>
              {addPromo.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Gift className="size-3.5" />}Add
            </Button>
          </div>
          <FieldError message={promoError} />
        </form>
      )}
    </div>
  );
}
