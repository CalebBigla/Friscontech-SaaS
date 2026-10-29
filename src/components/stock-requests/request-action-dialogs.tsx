import { useEffect, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FieldError, FilterSelect } from "@/components/shared";
import type { StockRequest } from "@/data/mock-db";
import { useLiveWorkspace } from "@/hooks/use-live-workspace";
import { useApproveStockRequest, useFulfilStockRequest, useRejectStockRequest } from "@/hooks/use-stock-requests";
import { getAccessScope } from "@/lib/session";
import { fieldErrorsFrom } from "@/lib/supabase-helpers";
import { FIELD_NAMES, validateApproveStockRequest, validateFulfilStockRequest, validateRejectStockRequest, type FieldErrors } from "@/lib/validation";
import { getStockRequestAvailability } from "@/lib/inventory-calculations";
import { formatUnits } from "@/lib/format";

export type RequestAction = { kind: "approve" | "reject" | "fulfill"; request: StockRequest } | null;

export function ShortageNotice({ needed, available }: { needed: number; available: number }) {
  return (
    <div className="alert alert-danger">
      <div className="flex items-center gap-2"><AlertTriangle className="size-4" /><span className="text-xs font-bold">Insufficient stock</span></div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-foreground">
        <div><p className="text-muted-foreground">Requested</p><p className="font-bold">{needed}</p></div>
        <div><p className="text-muted-foreground">Available</p><p className="font-bold">{available}</p></div>
        <div><p className="text-muted-foreground">Shortage</p><p className="font-bold text-destructive">{needed - available}</p></div>
      </div>
    </div>
  );
}

const rejectReasons = ["Product unavailable", "Request not authorized", "Duplicate request", "Other"];

export function RequestActionDialog({ action, onClose, actorId }: { action: RequestAction; onClose: () => void; actorId: string }) {
  const { db } = useLiveWorkspace();
  const approve = useApproveStockRequest();
  const reject = useRejectStockRequest();
  const fulfil = useFulfilStockRequest();
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState(rejectReasons[0]!);
  const [detail, setDetail] = useState("");
  const [error, setError] = useState<string>();
  const saving = approve.isPending || reject.isPending || fulfil.isPending;
  const req = action ? db.stockRequests.find((r) => r.id === action.request.id) ?? action.request : null;
  const avail = req ? getStockRequestAvailability(db, req) : null;

  useEffect(() => {
    if (!action || !avail) return;
    setQty(String(Math.min(avail.needed, avail.available)));
    setReason(rejectReasons[0]!); setDetail(""); setError(undefined);
  }, [action]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!action || !req || !avail) return null;

  const product = db.products.find((p) => p.id === req.productId);
  const rep = db.users.find((u) => u.id === req.repId);
  const n = Number(qty);
  const qtyError = action.kind !== "fulfill" ? undefined
    : qty === "" || !Number.isInteger(n) || n <= 0 ? "Enter a whole number greater than zero"
    : n > avail.available ? "Quantity cannot exceed available stock."
    : n > avail.needed ? `Only ${avail.needed} units are outstanding on this request` : undefined;

  async function submit() {
    const kind = action!.kind;
    const scope = getAccessScope(db, actorId);
    const rejectReason = reason === "Other" ? detail : detail.trim() ? `${reason} — ${detail.trim()}` : reason;
    const fail = (e: FieldErrors) => {
      const msg = e.quantity ?? e.reason ?? e.form ?? "Unable to update request";
      setError(msg);
      toast.error(kind === "fulfill" ? "Unable to fulfill request" : msg, { description: kind === "fulfill" ? msg : undefined });
    };
    const invalid = kind === "approve" ? validateApproveStockRequest(scope, req!)
      : kind === "reject" ? validateRejectStockRequest(scope, req!, rejectReason)
      : validateFulfilStockRequest(db, scope, req!, n);
    if (invalid) return fail(invalid);
    try {
      if (kind === "approve") {
        await approve.mutateAsync({ p_request_id: req!.id });
        toast.success("Stock request approved.", { description: `${req!.id} · stock is deducted only at fulfillment` });
      } else if (kind === "reject") {
        const updated = await reject.mutateAsync({ p_request_id: req!.id, p_reason: rejectReason.trim() });
        toast.success("Stock request rejected.", { description: updated.rejectionReason });
      } else {
        const updated = await fulfil.mutateAsync({ p_request_id: req!.id, p_quantity: n });
        toast.success(updated.status === "fulfilled" ? "Stock request fulfilled." : "Stock request partially fulfilled.", { description: `${n} units issued to ${rep?.name} · ${updated.quantityFulfilled} / ${updated.quantityApproved} fulfilled` });
      }
      onClose();
    } catch (failure) {
      fail(fieldErrorsFrom(failure, FIELD_NAMES));
    }
  }

  const title = action.kind === "approve" ? `Approve ${req.id}` : action.kind === "reject" ? `Reject ${req.id}` : `Fulfill ${req.id}`;
  const summary = (
    <div className="grid grid-cols-2 gap-3 rounded-md bg-muted p-4 text-xs sm:grid-cols-4">
      <div className="col-span-2"><p className="text-muted-foreground">Product</p><p className="mt-1 font-bold">{product?.name}</p></div>
      <div><p className="text-muted-foreground">{action.kind === "fulfill" ? "Outstanding" : "Requested"}</p><p className="mt-1 font-bold">{formatUnits(avail.needed)}</p></div>
      <div><p className="text-muted-foreground">Available</p><p className="mt-1 font-bold">{formatUnits(avail.available)}</p></div>
    </div>
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-md">
        <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription className="text-xs">{rep?.name} · {db.branches.find((b) => b.id === req.branchId)?.name}</DialogDescription></DialogHeader>
        <div className="space-y-4">
          {summary}
          {action.kind === "approve" && (avail.sufficient
            ? <p className="text-xs text-muted-foreground">Enough stock is available. Approval does not deduct inventory — stock is only deducted when the request is fulfilled.</p>
            : <><ShortageNotice needed={avail.needed} available={avail.available} /><p className="text-xs text-muted-foreground">You can still approve; the request can then be partially fulfilled with the {avail.available} units available.</p></>)}
          {action.kind === "reject" && <>
            <div><Label className="text-xs">Reason for rejection *</Label><div className="mt-1.5"><FilterSelect label="Reason for rejection" className="w-full" value={reason} onChange={setReason} options={rejectReasons.map((x) => ({ value: x, label: x }))} /></div></div>
            <div><Label htmlFor="reject-detail" className="text-xs">{reason === "Other" ? "Describe the reason *" : "Additional detail"}</Label><Textarea id="reject-detail" rows={2} value={detail} onChange={(e) => setDetail(e.target.value)} className="mt-1.5 text-sm" /></div>
            <p className="text-[11px] text-muted-foreground">Rejected requests stay in the request history.</p>
          </>}
          {action.kind === "fulfill" && <>
            {req.quantityFulfilled ? <p className="text-xs text-muted-foreground">{req.quantityFulfilled} / {req.quantityApproved ?? req.quantityRequested} already issued.</p> : null}
            {avail.available === 0 ? <ShortageNotice needed={avail.needed} available={0} /> : <>
              <div><Label htmlFor="issue-qty" className="text-xs">Quantity to issue *</Label><Input id="issue-qty" type="number" inputMode="numeric" min={1} max={Math.min(avail.available, avail.needed)} value={qty} onChange={(e) => { setQty(e.target.value); setError(undefined); }} className="mt-1.5 h-10" aria-invalid={!!qtyError} /><FieldError message={qtyError} /></div>
              <div className="flex items-center justify-between rounded-md border border-border p-3 text-xs"><span className="text-muted-foreground">Remaining stock after issue</span><strong data-testid="remaining-stock" className={qtyError ? "text-destructive" : ""}>{qtyError && n > avail.available ? "—" : formatUnits(Math.max(avail.available - (Number.isFinite(n) ? n : 0), 0))}</strong></div>
              {!qtyError && n < avail.needed && <p className="text-[11px] text-muted-foreground">This will be a partial fulfillment: {(req.quantityFulfilled ?? 0) + n} / {req.quantityApproved ?? req.quantityRequested} fulfilled, {avail.needed - n} remaining.</p>}
            </>}
          </>}
          {error && <p className="text-xs font-medium text-destructive">{error}</p>}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          {action.kind === "reject"
            ? <Button className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={submit} disabled={saving || (reason === "Other" && !detail.trim())}>{saving && <Loader2 className="size-4 animate-spin" />}Reject request</Button>
            : <Button onClick={submit} disabled={saving || (action.kind === "fulfill" && (!!qtyError || avail.available === 0))}>{saving && <Loader2 className="size-4 animate-spin" />}{action.kind === "approve" ? "Approve request" : "Issue stock"}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
