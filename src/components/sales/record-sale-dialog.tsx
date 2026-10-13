import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
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
import { useDb } from "@/services/mock-store";
import { salesService, type FieldErrors } from "@/services/services";
import type { AccessScope } from "@/lib/session";
import { formatNaira, formatUnits } from "@/lib/format";
import { getAvailableStock } from "@/lib/inventory-calculations";

type Line = { key: number; productId: string; quantity: string; unitPrice: string };

export function RecordSaleDialog({
  open,
  onOpenChange,
  scope,
  defaultBranchId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  scope: AccessScope;
  defaultBranchId?: string | undefined;
}) {
  const db = useDb();
  const [branchId, setBranchId] = useState("");
  const [saleDate, setSaleDate] = useState("");
  const [lines, setLines] = useState<Line[]>([
    { key: 1, productId: "", quantity: "1", unitPrice: "" },
  ]);
  const [nextKey, setNextKey] = useState(2);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);

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
    setLines([{ key: 1, productId: "", quantity: "1", unitPrice: "" }]);
    setNextKey(2);
    setErrors({});
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const total = lines.reduce(
    (sum, line) =>
      sum +
      (Number(line.quantity) > 0 && Number(line.unitPrice) > 0
        ? Number(line.quantity) * Number(line.unitPrice)
        : 0),
    0,
  );
  const setLine = (key: number, patch: Partial<Line>) =>
    setLines((rows) => rows.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const result = await salesService.recordMany(
      lines.map((line) => ({
        branchId,
        salesRepId: scope.repId ?? scope.user.id,
        productId: line.productId,
        quantity: Number(line.quantity),
        unitPrice: Number(line.unitPrice),
        saleDate,
      })),
      scope.user.id,
    );
    setSaving(false);
    if (!result.ok) {
      setErrors(result.errors);
      toast.error("Please fix the highlighted fields");
      return;
    }
    toast.success(
      `${result.data.length} sale item${result.data.length === 1 ? "" : "s"} recorded`,
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
            Add one or more products. Revenue is calculated from quantity × unit price.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
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
                    <p className="text-xs font-semibold">Item {index + 1}</p>
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
                    <Label className="text-xs">Product *</Label>
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
                            .filter((x) => x.status === "active")
                            .map((x) => ({
                              value: x.id,
                              label: `${x.name} · ${formatNaira(x.unitPrice)}`,
                            })),
                        ]}
                      />
                    </div>
                    <FieldError message={itemErrors?.productId} />
                    {branchId && line.productId && (
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Available at branch:{" "}
                        {formatUnits(getAvailableStock(db, line.productId, branchId))}
                      </p>
                    )}
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
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
                    <div>
                      <Label className="text-xs">Line revenue</Label>
                      <p className="mt-1.5 h-9 rounded-md bg-muted px-3 py-2 text-sm font-semibold">
                        {formatNaira(Number(line.quantity) * Number(line.unitPrice) || 0)}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setLines((rows) => [
                  ...rows,
                  { key: nextKey, productId: "", quantity: "1", unitPrice: "" },
                ]);
                setNextKey((key) => key + 1);
              }}
            >
              <Plus className="size-3.5" />
              Add item
            </Button>
            {errors.items && <FieldError message={errors.items} />}
          </div>
          <div className="flex items-center justify-between rounded-md bg-muted p-4">
            <span className="text-xs text-muted-foreground">Total revenue</span>
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
    </Dialog>
  );
}
