import { useEffect, useState } from "react";
import { Gift, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError, FilterSelect } from "@/components/shared";
import type { Db, DiscountType } from "@/data/mock-db";
import { useIdempotencyKey } from "@/hooks/use-idempotency-key";
import { useRecordSale } from "@/hooks/use-sales";
import type { FieldErrors } from "@/lib/validation";
import type { AccessScope } from "@/lib/session";
import { formatNaira, formatUnits } from "@/lib/format";
import { getAvailableStock, getRepHeldStock } from "@/lib/inventory-calculations";
import { getCustomersForScope } from "@/lib/customer-calculations";
import { CustomerFormDialog } from "@/components/customers/customer-dialogs";

type Line = {
  key: number;
  productId: string;
  quantity: string;
  unitPrice: string;
  isPromo: boolean;
  discountType: DiscountType;
  discount: string;
};
const newLine = (key: number, isPromo = false): Line => ({
  key,
  productId: "",
  quantity: "1",
  unitPrice: isPromo ? "0" : "",
  isPromo,
  discountType: "percent",
  discount: "",
});
const lineGross = (line: Line) =>
  Number(line.quantity) > 0 && Number(line.unitPrice) > 0
    ? Number(line.quantity) * Number(line.unitPrice)
    : 0;
/** Same sum as record_sale; the server's figure is the one stored. */
const lineDiscount = (line: Line) => {
  const value = Number(line.discount);
  if (line.isPromo || !(value > 0)) return 0;
  const gross = lineGross(line);
  return Math.min(line.discountType === "percent" ? Math.round(gross * value) / 100 : value, gross);
};

export function RecordSaleDialog({
  open,
  onOpenChange,
  scope,
  defaultBranchId,
  presetCustomerId,
  db,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  scope: AccessScope;
  defaultBranchId?: string | undefined;
  presetCustomerId?: string | undefined;
  db: Db;
}) {
  const recordSale = useRecordSale();
  const idempotencyKey = useIdempotencyKey(open);
  const [branchId, setBranchId] = useState("");
  const [saleDate, setSaleDate] = useState("");
  const [lines, setLines] = useState<Line[]>([newLine(1)]);
  const [nextKey, setNextKey] = useState(2);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);
  const [saleType, setSaleType] = useState<"walk_in" | "customer">("walk_in");
  const [customerId, setCustomerId] = useState("");
  const [customerQuery, setCustomerQuery] = useState("");
  const [walkInName, setWalkInName] = useState("");
  const [walkInPhone, setWalkInPhone] = useState("");
  const [addCustomerOpen, setAddCustomerOpen] = useState(false);
  const customers = getCustomersForScope(db, scope).filter((c) => c.status === "active");
  const needle = customerQuery.trim().toLowerCase();
  const customerMatches = customers
    .filter(
      (c) =>
        !needle || [c.name, c.phone, c.contactPerson].some((v) => v.toLowerCase().includes(needle)),
    )
    .slice(0, 6);
  const selectedCustomer = customers.find((c) => c.id === customerId);

  const branches = db.branches.filter(
    (b) => b.status === "active" && (!scope.branchIds || scope.branchIds.includes(b.id)),
  );
  useEffect(() => {
    if (!open) return;
    setBranchId(
      scope.branchIds?.[0] ??
        (defaultBranchId && branches.some((b) => b.id === defaultBranchId) ? defaultBranchId : ""),
    );
    setSaleDate(db.tenant.referenceDate);
    setLines([newLine(1)]);
    setNextKey(2);
    setErrors({});
    setSaleType(presetCustomerId ? "customer" : "walk_in");
    setCustomerId(presetCustomerId ?? "");
    setCustomerQuery("");
    setWalkInName("");
    setWalkInPhone("");
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const total = lines.reduce((sum, line) => sum + lineGross(line) - lineDiscount(line), 0);
  const discountTotal = lines.reduce((sum, line) => sum + lineDiscount(line), 0);
  const hasPromoItems = db.products.some((x) => x.status === "active" && x.productType === "promo");
  const setLine = (key: number, patch: Partial<Line>) =>
    setLines((rows) => rows.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (saleType === "customer" && !customerId) {
      setErrors({ customerId: "Choose a customer" });
      return;
    }
    const itemErrors: NonNullable<FieldErrors["itemErrors"]> = {};
    const requiredWalkInName = walkInName.trim();
    let requestedByItem = new Map<string, number>();
    lines.forEach((line, index) => {
      if (!line.productId) (itemErrors[index] ??= {}).productId = "Choose a product";
      const quantity = Number(line.quantity);
      if (!Number.isInteger(quantity) || quantity <= 0) (itemErrors[index] ??= {}).quantity = "Enter a whole quantity above zero";
      const product = db.products.find((candidate) => candidate.id === line.productId && candidate.status === "active");
      if (!product) (itemErrors[index] ??= {}).productId = "Choose an active product";
      if (product && (!Number.isFinite(product.unitPrice) || product.unitPrice < 0)) (itemErrors[index] ??= {}).quantity = "Product price is invalid";
      if (product && Number.isInteger(quantity) && quantity > 0) {
        const key = `${branchId}:${product.id}`;
        const requested = (requestedByItem.get(key) ?? 0) + quantity;
        requestedByItem.set(key, requested);
        const available = getAvailableStock(db, product.id, branchId) + (scope.repId ? getRepHeldStock(db, scope.repId, product.id) : 0);
        if (requested > available) (itemErrors[index] ??= {}).quantity = `Insufficient stock — ${available} available for all lines`;
      }
      if (!line.isPromo && line.discount.trim()) {
        const value = Number(line.discount);
        if (!Number.isFinite(value) || value < 0) (itemErrors[index] ??= {}).discount = "Enter a discount of zero or more";
        else if (line.discountType === "percent" && value > 100) (itemErrors[index] ??= {}).discount = "A discount cannot be more than 100%";
        else if (line.discountType === "amount" && value > lineGross(line)) (itemErrors[index] ??= {}).discount = "The discount is more than the line total";
      }
    });
    if (lines.every((line) => line.isPromo)) {
      setErrors({ itemErrors, items: "Promo items go out with a sale: add a product being sold" });
      toast.error("Add a product being sold");
      return;
    }
    if (saleType === "walk_in" && !requiredWalkInName) {
      setErrors({ walkInName: "Enter the walk-in customer's name", itemErrors });
      toast.error("Enter the walk-in customer's name");
      return;
    }
    if (!branchId || !db.branches.some((branch) => branch.id === branchId && branch.status === "active")) {
      setErrors({ branchId: "Choose an active branch", itemErrors });
      toast.error("Choose an active branch");
      return;
    }
    if (Object.keys(itemErrors).length) {
      setErrors({ itemErrors, items: "Review the highlighted sale items" });
      toast.error("Please fix the highlighted sale items");
      return;
    }
    setSaving(true);
    try {
      await recordSale.mutateAsync({
        p_branch_id: branchId,
        p_sale_date: saleDate,
        p_customer_id: saleType === "customer" ? customerId : null,
        p_walk_in_name: saleType === "customer" ? null : requiredWalkInName,
        p_walk_in_phone: saleType === "customer" ? null : walkInPhone.trim() || null,
        p_items: lines.map((line) => {
          const value = line.isPromo ? 0 : Number(line.discount);
          return {
            product_id: line.productId,
            quantity: Number(line.quantity),
            is_promo: line.isPromo,
            discount_type: value > 0 ? line.discountType : null,
            discount_value: value > 0 ? value : null,
          };
        }),
        p_idempotency_key: idempotencyKey,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not record sale";
      setErrors({ form: message });
      toast.error(message);
      setSaving(false);
      return;
    }
    setSaving(false);
    toast.success(
      `${lines.length} sale item${lines.length === 1 ? "" : "s"} recorded`,
      { description: `${formatNaira(total)} added to revenue` },
    );
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Record sale</DialogTitle>
          <DialogDescription className="text-xs">
            Add one or more products. Revenue is quantity × unit price, less any discount. Promo items are free.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          {scope.canManageCustomers && !presetCustomerId && (
            <div
              role="radiogroup"
              aria-label="Sale type"
              className="grid grid-cols-2 gap-2 rounded-md bg-muted p-1"
            >
              {(
                [
                  ["walk_in", "Walk-in sale", "Pay now"],
                  ["customer", "Customer order", "On account"],
                ] as const
              ).map(([value, label, hint]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={saleType === value}
                  onClick={() => setSaleType(value)}
                  className={`rounded-sm px-3 py-2 text-left text-xs transition-colors ${saleType === value ? "bg-card font-semibold shadow-panel" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {label}
                  <span className="block text-[10px] font-normal text-muted-foreground">
                    {hint}
                  </span>
                </button>
              ))}
            </div>
          )}
          {saleType === "walk_in" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="walkin-name" className="text-xs">
                  Buyer name *
                </Label>
                <Input
                  id="walkin-name"
                  className="mt-1.5 h-9"
                  value={walkInName}
                  onChange={(e) => setWalkInName(e.target.value)}
                  aria-invalid={!!errors.walkInName}
                />
                <FieldError message={errors.walkInName} />
              </div>
              <div>
                <Label htmlFor="walkin-phone" className="text-xs">
                  Buyer phone (optional)
                </Label>
                <Input
                  id="walkin-phone"
                  className="mt-1.5 h-9"
                  value={walkInPhone}
                  onChange={(e) => setWalkInPhone(e.target.value)}
                />
              </div>
            </div>
          ) : (
            <div>
              <Label className="text-xs">Customer *</Label>
              {selectedCustomer ? (
                <div className="mt-1.5 flex items-center justify-between rounded-md border border-border px-3 py-2 text-xs">
                  <span>
                    <strong>{selectedCustomer.name}</strong> · {selectedCustomer.phone}
                  </span>
                  {!presetCustomerId && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setCustomerId("")}
                    >
                      Change
                    </Button>
                  )}
                </div>
              ) : (
                <div className="mt-1.5 space-y-2">
                  <Input
                    placeholder="Search customers by name or phone"
                    aria-label="Search customers"
                    value={customerQuery}
                    onChange={(e) => setCustomerQuery(e.target.value)}
                    className="h-9"
                  />
                  <div className="max-h-40 divide-y divide-border overflow-y-auto rounded-md border border-border">
                    {customerMatches.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setCustomerId(c.id)}
                        className="block w-full px-3 py-2 text-left text-xs hover:bg-muted"
                      >
                        <strong>{c.name}</strong>{" "}
                        <span className="text-muted-foreground">· {c.phone}</span>
                      </button>
                    ))}
                    {!customerMatches.length && (
                      <p className="px-3 py-2 text-xs text-muted-foreground">
                        No matching customers.
                      </p>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setAddCustomerOpen(true)}
                  >
                    <Plus className="size-3.5" />
                    Add customer
                  </Button>
                </div>
              )}
              <FieldError message={errors.customerId} />
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs">Branch *</Label>
              <div className="mt-1.5">
                {scope.repId ? (
                  <Input
                    value={branches.find((b) => b.id === branchId)?.name ?? "No branch assigned"}
                    readOnly
                  />
                ) : (
                  <FilterSelect
                    label="Branch"
                    className="w-full"
                    value={branchId || "none"}
                    onChange={(v) => setBranchId(v === "none" ? "" : v)}
                    options={[
                      { value: "none", label: "Select branch" },
                      ...branches.map((b) => ({ value: b.id, label: b.name })),
                    ]}
                  />
                )}
              </div>
              <FieldError message={errors.branchId} />
            </div>
            <div>
              <Label htmlFor="sale-date" className="text-xs">
                Sale date *
              </Label>
              <Input
                id="sale-date"
                type="date"
                max={db.tenant.referenceDate}
                value={saleDate}
                onChange={(e) => setSaleDate(e.target.value)}
                className="mt-1.5 h-9"
              />
              <FieldError message={errors.saleDate} />
            </div>
          </div>
          {!scope.repId && (
            <p className="rounded-md bg-muted px-3 py-2 text-[11px] text-muted-foreground">
              Recorded as <strong className="text-foreground">{scope.user.name}</strong>.
            </p>
          )}
          <div className="space-y-3">
            {lines.map((line, index) => {
              const itemErrors = errors.itemErrors?.[index];
              return (
                <div key={line.key} className="rounded-md border border-border p-3">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-xs font-semibold">
                      {line.isPromo ? "Promo item" : "Item"} {index + 1}
                    </p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove item ${index + 1}`}
                      disabled={lines.length === 1}
                      onClick={() => setLines((rows) => rows.filter((x) => x.key !== line.key))}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                  <div>
                    <Label className="text-xs">{line.isPromo ? "Promo item *" : "Product *"}</Label>
                    <div className="mt-1.5">
                      <FilterSelect
                        label={`Product for item ${index + 1}`}
                        className="w-full"
                        value={line.productId || "none"}
                        onChange={(v) => {
                          const product = db.products.find((x) => x.id === v);
                          setLine(line.key, {
                            productId: v === "none" ? "" : v,
                            unitPrice: product ? String(product.unitPrice) : line.unitPrice,
                          });
                        }}
                        options={[
                          { value: "none", label: "Select product" },
                          ...db.products
                            .filter((x) => x.status === "active" && (x.productType === "promo") === line.isPromo)
                            .map((x) => ({
                              value: x.id,
                              label: line.isPromo ? x.name : `${x.name} · ${formatNaira(x.unitPrice)}`,
                            })),
                        ]}
                      />
                    </div>
                    <FieldError message={itemErrors?.productId} />
                    {branchId && line.productId && (
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Available at branch:{" "}
                        {formatUnits(getAvailableStock(db, line.productId, branchId))}
                        {scope.repId && ` · With you: ${formatUnits(getRepHeldStock(db, scope.repId, line.productId))}`}
                      </p>
                    )}
                  </div>
                  <div className={`mt-3 grid gap-3 ${line.isPromo ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-4"}`}>
                    <div>
                      <Label htmlFor={`sale-qty-${line.key}`} className="text-xs">
                        Quantity *
                      </Label>
                      <Input
                        id={`sale-qty-${line.key}`}
                        type="number"
                        min={1}
                        step={1}
                        value={line.quantity}
                        onChange={(e) => setLine(line.key, { quantity: e.target.value })}
                        className="mt-1.5 h-9"
                      />
                      <FieldError message={itemErrors?.quantity} />
                    </div>
                    {!line.isPromo && (
                      <div>
                        <Label htmlFor={`sale-price-${line.key}`} className="text-xs">
                          Unit price (₦) *
                        </Label>
                        <Input
                          id={`sale-price-${line.key}`}
                          type="number"
                          min={1}
                          value={line.unitPrice}
                          onChange={(e) => setLine(line.key, { unitPrice: e.target.value })}
                          readOnly
                          className="mt-1.5 h-9"
                        />
                        <FieldError message={errors.unitPrice} />
                      </div>
                    )}
                    {!line.isPromo && (
                      <div>
                        <Label htmlFor={`sale-discount-${line.key}`} className="text-xs">
                          Discount
                        </Label>
                        <div className="mt-1.5 flex gap-1.5">
                          <Input
                            id={`sale-discount-${line.key}`}
                            type="number"
                            min={0}
                            step="any"
                            inputMode="decimal"
                            placeholder="0"
                            value={line.discount}
                            onChange={(e) => setLine(line.key, { discount: e.target.value })}
                            aria-invalid={!!itemErrors?.discount}
                            className="h-9 min-w-0"
                          />
                          <FilterSelect
                            label={`Discount type for item ${index + 1}`}
                            className="w-16 shrink-0"
                            value={line.discountType}
                            onChange={(v) => setLine(line.key, { discountType: v as DiscountType })}
                            options={[
                              { value: "percent", label: "%" },
                              { value: "amount", label: "₦" },
                            ]}
                          />
                        </div>
                        <FieldError message={itemErrors?.discount} />
                      </div>
                    )}
                    <div>
                      <Label className="text-xs">{line.isPromo ? "Value" : "Line revenue"}</Label>
                      <p className="mt-1.5 h-9 rounded-md bg-muted px-3 py-2 text-sm font-semibold">
                        {line.isPromo ? "Free" : formatNaira(lineGross(line) - lineDiscount(line))}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setLines((rows) => [...rows, newLine(nextKey)]);
                  setNextKey((key) => key + 1);
                }}
              >
                <Plus className="size-3.5" />
                Add item
              </Button>
              {hasPromoItems && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setLines((rows) => [...rows, newLine(nextKey, true)]);
                    setNextKey((key) => key + 1);
                  }}
                >
                  <Gift className="size-3.5" />
                  Add promo item
                </Button>
              )}
            </div>
            {errors.items && <FieldError message={errors.items} />}
          </div>
          <div className="flex items-center justify-between rounded-md bg-muted p-4">
            <span className="text-xs text-muted-foreground">
              Total revenue
              {discountTotal > 0 && (
                <span className="block text-[11px]">After {formatNaira(discountTotal)} discount</span>
              )}
            </span>
            <strong className="text-lg" data-testid="sale-total">
              {formatNaira(total)}
            </strong>
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="size-4 animate-spin" />}Record sale
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
      {scope.canManageCustomers && (
        <CustomerFormDialog
          open={addCustomerOpen}
          onOpenChange={setAddCustomerOpen}
          actorId={scope.user.id}
          onSaved={(c) => setCustomerId(c.id)}
        />
      )}
    </Dialog>
  );
}
