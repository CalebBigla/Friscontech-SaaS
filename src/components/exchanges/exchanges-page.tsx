import { useMemo, useState, type FormEvent } from "react";
import { ArrowLeftRight, Check, CheckCheck, Loader2, PackageCheck, Plus, X } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { DataGate, EmptyState, FieldError, FilterSelect, Panel, StatTile } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Db } from "@/data/mock-db";
import { useCustomerAccounts } from "@/hooks/use-customers";
import {
  exchangeDifference,
  useAcknowledgeExchange,
  useApproveExchange,
  useExchanges,
  useFulfilExchange,
  useRejectExchange,
  useRequestExchange,
  type Exchange,
} from "@/hooks/use-exchanges";
import { useLiveWorkspace } from "@/hooks/use-live-workspace";
import { keptQuantity } from "@/lib/calculations";
import { getCustomersForScope } from "@/lib/customer-calculations";
import { formatDate, formatNaira, formatNumber } from "@/lib/format";
import { getAvailableStock } from "@/lib/inventory-calculations";
import { getAccessScope, useCurrentUserId, type AccessScope } from "@/lib/session";
import { fieldErrorsFrom } from "@/lib/supabase-helpers";

const ALL = "all";
const statusView = (e: Exchange) =>
  e.status === "pending" ? { label: "Waiting for storekeeper", tone: "status-warning" }
    : e.status === "approved" ? { label: "Approved · being prepared", tone: "status-brand" }
      : e.status === "rejected" ? { label: "Rejected", tone: "status-danger" }
        : e.acknowledgedAt ? { label: "Completed", tone: "status-success" }
          : { label: "Ready · rep to confirm", tone: "status-violet" };

/** Exchanges: a customer returns part of a sale for another product. */
export function ExchangesPage() {
  const { db, isLoading, error } = useLiveWorkspace();
  const { data: exchanges = [], isLoading: loadingEx, error: exError } = useExchanges();
  const scope = getAccessScope(db, useCurrentUserId());
  const [status, setStatus] = useState(ALL);
  const [creating, setCreating] = useState(false);
  const isRep = scope.user.role === "sales_rep";
  const isStorekeeper = scope.user.role === "storekeeper";

  const list = exchanges.filter((e) => status === ALL || (status === "awaiting" ? e.status === "fulfilled" && !e.acknowledgedAt : e.status === status));
  const pending = exchanges.filter((e) => e.status === "pending").length;
  const toFulfil = exchanges.filter((e) => e.status === "approved").length;
  const toConfirm = exchanges.filter((e) => e.status === "fulfilled" && !e.acknowledgedAt).length;

  return (
    <AppShell
      title="Exchanges"
      subtitle="Customer returns for another product"
      actions={isRep ? <Button onClick={() => setCreating(true)}><Plus className="size-4" /><span className="hidden sm:inline">New exchange</span></Button> : undefined}
    >
      <div className="mb-5">
        <h1 className="text-xl font-bold">Exchanges</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          {isRep ? "Request an exchange for your customer; the storekeeper approves and prepares the replacement, then you confirm the customer has it."
            : isStorekeeper ? "Check the replacement is in stock, approve, then fulfil: the returned units go back into stock and the replacement goes out."
              : "Exchanges across your branches. A difference in value goes onto the customer's ledger."}
        </p>
      </div>
      <DataGate isLoading={isLoading || loadingEx} error={error ?? exError}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label="Waiting for approval" value={formatNumber(pending)} tone="warning" />
          <StatTile label="Approved, to fulfil" value={formatNumber(toFulfil)} />
          <StatTile label="Rep to confirm" value={formatNumber(toConfirm)} tone="success" />
          <StatTile label="All exchanges" value={formatNumber(exchanges.length)} />
        </div>
        <Panel
          className="mt-4 overflow-hidden"
          title="Exchanges"
          subtitle={`${formatNumber(list.length)} shown`}
          action={
            <FilterSelect label="Status" className="w-44" value={status} onChange={setStatus} options={[
              { value: ALL, label: "All statuses" }, { value: "pending", label: "Waiting for approval" }, { value: "approved", label: "Approved" },
              { value: "awaiting", label: "Rep to confirm" }, { value: "fulfilled", label: "Fulfilled" }, { value: "rejected", label: "Rejected" },
            ]} />
          }
        >
          {list.length ? (
            <ul className="divide-y divide-border">{list.map((e) => <ExchangeRow key={e.id} e={e} db={db} scope={scope} />)}</ul>
          ) : (
            <EmptyState icon={ArrowLeftRight} title="No exchanges" detail={isRep ? "When a customer wants to swap something they bought, start a new exchange." : "Exchanges requested by reps appear here."} />
          )}
        </Panel>
      </DataGate>
      {isRep && <NewExchangeDialog open={creating} onOpenChange={setCreating} db={db} scope={scope} exchanges={exchanges} />}
    </AppShell>
  );
}

function ExchangeRow({ e, db, scope }: { e: Exchange; db: Db; scope: AccessScope }) {
  const approve = useApproveExchange();
  const reject = useRejectExchange();
  const fulfil = useFulfilExchange();
  const acknowledge = useAcknowledgeExchange();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const product = (id: string) => db.products.find((p) => p.id === id)?.name ?? "Product";
  const person = (id: string | null) => (id ? (db.users.find((u) => u.id === id)?.name ?? "—") : "—");
  const customer = db.customers.find((c) => c.id === e.customerId)?.name ?? "Customer";
  const view = statusView(e);
  const diff = exchangeDifference(e);
  const isStorekeeper = scope.user.role === "storekeeper" && scope.branchIds?.includes(e.branchId);
  const isRequester = scope.user.id === e.repId;
  const available = getAvailableStock(db, e.replacementProductId, e.branchId);

  async function run(label: string, fn: () => Promise<unknown>) {
    setError("");
    try {
      await fn();
      toast.success(label);
      setRejecting(false);
    } catch (failure) {
      const errors = fieldErrorsFrom(failure, ["reason", "quantity"] as const);
      setError(errors.reason ?? errors.quantity ?? errors.form ?? "Could not update the exchange");
    }
  }
  const busy = approve.isPending || reject.isPending || fulfil.isPending || acknowledge.isPending;

  return (
    <li className="px-5 py-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-muted-foreground">{e.id}</span>
            <span className={`status ${view.tone} whitespace-nowrap`}>{view.label}</span>
          </div>
          <p className="text-sm font-semibold">{customer}</p>
          <p className="text-xs">
            Returns <strong>{formatNumber(e.returnQuantity)} × {product(e.returnedProductId)}</strong>
            {" "}for <strong>{formatNumber(e.replacementQuantity)} × {product(e.replacementProductId)}</strong>
          </p>
          <p className="text-[11px] text-muted-foreground">
            Requested by {person(e.repId)} · {formatDate(e.requestedAt.slice(0, 10))} · “{e.reason}”
          </p>
          {e.status === "fulfilled" && diff !== null && (
            <p className="text-[11px]">
              Returned {formatNaira(e.returnedValue ?? 0)} · replacement {formatNaira(e.replacementValue ?? 0)} ·{" "}
              <span className={diff > 0 ? "font-semibold text-destructive" : diff < 0 ? "font-semibold text-success" : "font-semibold"}>
                {diff > 0 ? `customer owes ${formatNaira(diff)} more` : diff < 0 ? `customer credited ${formatNaira(-diff)}` : "account unchanged"}
              </span>
            </p>
          )}
          {e.status === "rejected" && e.rejectionReason && <p className="text-xs text-destructive">Reason: {e.rejectionReason}</p>}
          {isStorekeeper && e.status === "pending" && (
            <p className={`text-[11px] ${available >= e.replacementQuantity ? "text-success" : "text-destructive"}`}>
              {formatNumber(available)} {product(e.replacementProductId)} in stock{available < e.replacementQuantity ? `, ${formatNumber(e.replacementQuantity)} needed` : ""}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {isStorekeeper && (e.status === "pending" || e.status === "approved") && !rejecting && (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => setRejecting(true)}><X className="size-3.5" />Reject</Button>
          )}
          {isStorekeeper && e.status === "pending" && !rejecting && (
            <Button size="sm" disabled={busy} onClick={() => void run("Exchange approved", () => approve.mutateAsync({ p_exchange_id: e.id }))}>
              {approve.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}Approve
            </Button>
          )}
          {isStorekeeper && e.status === "approved" && !rejecting && (
            <Button size="sm" disabled={busy} onClick={() => void run("Exchange fulfilled", () => fulfil.mutateAsync({ p_exchange_id: e.id }))}>
              {fulfil.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <PackageCheck className="size-3.5" />}Fulfil
            </Button>
          )}
          {isRequester && e.status === "fulfilled" && !e.acknowledgedAt && (
            <Button size="sm" disabled={busy} onClick={() => void run("Exchange confirmed", () => acknowledge.mutateAsync({ p_exchange_id: e.id }))}>
              {acknowledge.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCheck className="size-3.5" />}Customer has it
            </Button>
          )}
        </div>
      </div>
      {rejecting && (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <Input autoFocus aria-label="Reason for rejecting" placeholder="Reason for the rep" value={reason} onChange={(ev) => setReason(ev.target.value)} className="h-9 flex-1" />
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => { setRejecting(false); setError(""); }}>Cancel</Button>
            <Button size="sm" variant="outline" className="text-destructive" disabled={busy}
              onClick={() => void run("Exchange rejected", () => reject.mutateAsync({ p_exchange_id: e.id, p_reason: reason.trim() }))}>
              {reject.isPending && <Loader2 className="size-3.5 animate-spin" />}Reject exchange
            </Button>
          </div>
        </div>
      )}
      <FieldError message={error} />
    </li>
  );
}

function NewExchangeDialog({ open, onOpenChange, db, scope, exchanges }: {
  open: boolean; onOpenChange: (o: boolean) => void; db: Db; scope: AccessScope; exchanges: Exchange[];
}) {
  const request = useRequestExchange();
  // Includes sales the customer made with a previous rep (their ledger moves with them).
  const { accounts } = useCustomerAccounts(db, scope);
  const customers = getCustomersForScope(db, scope).filter((c) => c.status === "active");
  const [customerId, setCustomerId] = useState("");
  const [saleId, setSaleId] = useState("");
  const [returnQty, setReturnQty] = useState("1");
  const [productId, setProductId] = useState("");
  const [qty, setQty] = useState("1");
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const openReturns = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of exchanges) if (e.status === "pending" || e.status === "approved") m.set(e.saleId, (m.get(e.saleId) ?? 0) + e.returnQuantity);
    return m;
  }, [exchanges]);
  const lines = accounts.sales
    .filter((s) => s.customerId === customerId && s.status === "completed" && !s.isPromo)
    .map((s) => ({ s, left: keptQuantity(s) - (openReturns.get(s.id) ?? 0) }))
    .filter((x) => x.left > 0)
    .sort((a, b) => b.s.saleDate.localeCompare(a.s.saleDate));
  const line = lines.find((x) => x.s.id === saleId);
  const product = (id: string) => db.products.find((p) => p.id === id);
  const replacement = product(productId);
  const products = db.products.filter((p) => p.status === "active" && p.productType !== "promo");

  const r = Number(returnQty) || 0;
  const q = Number(qty) || 0;
  const returnedValue = line ? Math.round((r * line.s.unitPrice - (line.s.discountAmount * r) / line.s.quantity) * 100) / 100 : 0;
  const replacementValue = replacement ? q * replacement.unitPrice : 0;
  const diff = replacementValue - returnedValue;

  function reset() {
    setCustomerId(""); setSaleId(""); setReturnQty("1"); setProductId(""); setQty("1"); setReason(""); setErrors({});
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!customerId) next["customerId"] = "Choose the customer";
    if (!line) next["saleId"] = "Choose what they bought";
    if (line && (!Number.isInteger(r) || r < 1 || r > line.left)) next["returnQuantity"] = `Return 1 to ${line.left}`;
    if (!replacement) next["replacementProductId"] = "Choose the replacement";
    if (!Number.isInteger(q) || q < 1) next["replacementQuantity"] = "Enter a whole quantity";
    if (reason.trim().length < 3) next["reason"] = "Say why the customer is exchanging";
    setErrors(next);
    if (Object.keys(next).length || !line || !replacement) return;
    try {
      const created = await request.mutateAsync({
        p_sale_id: line.s.id, p_return_quantity: r, p_replacement_product_id: replacement.id, p_replacement_quantity: q, p_reason: reason.trim(),
      });
      toast.success(`Exchange ${created.id} sent to the storekeeper`);
      reset();
      onOpenChange(false);
    } catch (failure) {
      setErrors(fieldErrorsFrom(failure, ["saleId", "returnQuantity", "replacementProductId", "replacementQuantity", "reason"] as const) as Record<string, string>);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New exchange</DialogTitle>
          <DialogDescription className="text-xs">The storekeeper checks the replacement is in stock, approves and prepares it. Any difference in value goes onto the customer's ledger.</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => void submit(e)} className="space-y-4" noValidate>
          <div>
            <Label className="text-xs">Customer</Label>
            <div className="mt-1.5"><FilterSelect label="Customer" className="w-full" value={customerId || "none"} onChange={(v) => { setCustomerId(v === "none" ? "" : v); setSaleId(""); }}
              options={[{ value: "none", label: "Choose a customer" }, ...customers.map((c) => ({ value: c.id, label: c.name }))]} /></div>
            <FieldError message={errors["customerId"]} />
          </div>
          <div>
            <Label className="text-xs">What they bought</Label>
            <div className="mt-1.5"><FilterSelect label="Sale" className="w-full" value={saleId || "none"} onChange={(v) => setSaleId(v === "none" ? "" : v)}
              options={[{ value: "none", label: customerId ? (lines.length ? "Choose the item" : "Nothing left to exchange") : "Choose a customer first" },
                ...lines.map(({ s, left }) => ({ value: s.id, label: `${formatDate(s.saleDate)} · ${product(s.productId)?.name ?? "Product"} · ${left} left` }))]} /></div>
            <FieldError message={errors["saleId"]} />
          </div>
          <div className="grid grid-cols-[1fr_7rem] gap-2">
            <div>
              <Label className="text-xs">Replacement</Label>
              <div className="mt-1.5"><FilterSelect label="Replacement product" className="w-full" value={productId || "none"} onChange={(v) => setProductId(v === "none" ? "" : v)}
                options={[{ value: "none", label: "Choose a product" }, ...products.map((p) => ({ value: p.id, label: `${p.name} · ${formatNaira(p.unitPrice)}` }))]} /></div>
              <FieldError message={errors["replacementProductId"]} />
            </div>
            <div>
              <Label htmlFor="ex-qty" className="text-xs">Quantity</Label>
              <Input id="ex-qty" type="number" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} className="mt-1.5" />
              <FieldError message={errors["replacementQuantity"]} />
            </div>
          </div>
          <div>
            <Label htmlFor="ex-ret" className="text-xs">Units returned{line ? ` (up to ${line.left})` : ""}</Label>
            <Input id="ex-ret" type="number" inputMode="numeric" value={returnQty} onChange={(e) => setReturnQty(e.target.value)} className="mt-1.5 w-28" />
            <FieldError message={errors["returnQuantity"]} />
          </div>
          <div>
            <Label htmlFor="ex-reason" className="text-xs">Reason</Label>
            <Textarea id="ex-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} className="mt-1.5" placeholder="e.g. Wrong size" />
            <FieldError message={errors["reason"]} />
          </div>
          {line && replacement && r > 0 && q > 0 && (
            <div className="rounded-lg bg-muted/60 p-3 text-xs">
              <p>Returned: <strong>{formatNaira(returnedValue)}</strong> · Replacement: <strong>{formatNaira(replacementValue)}</strong></p>
              <p className={`mt-1 font-semibold ${diff > 0 ? "text-destructive" : diff < 0 ? "text-success" : ""}`}>
                {diff > 0 ? `The customer will owe ${formatNaira(diff)} more.` : diff < 0 ? `The customer will be credited ${formatNaira(-diff)}.` : "The customer's account stays the same."}
              </p>
            </div>
          )}
          <FieldError message={errors["form"]} />
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={request.isPending}>{request.isPending && <Loader2 className="size-4 animate-spin" />}Send to storekeeper</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
