import { useState } from "react";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import type { Product, ProductStatus } from "@/data/mock-db";
import { Textarea } from "@/components/ui/textarea";
import { useLiveWorkspace } from "@/hooks/use-live-workspace";
import { getAccessScope } from "@/lib/session";
import { useRequestProductDeactivation, useSetProductStatus } from "@/hooks/use-products";
import { runWrite, validateDeactivationRequest, validateProductStatus } from "@/lib/validation";

export function ProductStatusBadge({ status }: { status: ProductStatus }) {
  return <span className={`status whitespace-nowrap ${status === "active" ? "status-success" : "status-warning"}`}>{status === "active" ? "Active" : "Inactive"}</span>;
}

/** Confirms activate/deactivate. Deactivation is soft: history is preserved. */
export function ProductStatusDialog({ product, onClose, actorId }: { product: Product | null; onClose: () => void; actorId: string }) {
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const { db } = useLiveWorkspace();
  const scope = getAccessScope(db, actorId);
  const setStatus = useSetProductStatus();
  const requestDeactivation = useRequestProductDeactivation();
  const deactivating = product?.status === "active";
  const deleting = scope.user.role === "owner" && deactivating;
  const needsApproval = deactivating && !scope.canDeactivateProducts;
  const pending = needsApproval && db.approvals.some((a) => a.type === "product_deactivation" && a.status === "pending" && a.productId === product?.id);
  return (
    <AlertDialog open={!!product} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{deleting ? "Delete" : needsApproval ? "Request deactivation of" : deactivating ? "Deactivate" : "Activate"} {product?.name}?</AlertDialogTitle>
          <AlertDialogDescription>{needsApproval ? (pending ? "A deactivation request for this product is already waiting for your manager." : "Your manager must approve this. The product stays active until then.") : deactivating
            ? "It will no longer be available for new sales, stock requests or stock additions. Historical sales, requests and movements stay intact."
            : "It becomes available again for new sales, stock requests and stock additions."}</AlertDialogDescription>
        </AlertDialogHeader>
        {needsApproval && !pending && <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for your manager" aria-label="Reason for deactivation" className="text-sm" />}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction disabled={busy || pending} className={deactivating ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""} onClick={async (e) => {
            e.preventDefault();
            if (!product) return;
            setBusy(true);
            if (needsApproval) {
              const r = await runWrite(validateDeactivationRequest(db, scope, product, reason), () =>
                requestDeactivation.mutateAsync({ p_product_id: product.id, p_reason: reason.trim() }));
              setBusy(false);
              if (!r.ok) { toast.error(r.errors.reason ?? r.errors.form ?? "Could not send request"); return; }
              toast.success("Deactivation request sent to your manager.", { description: product.name });
              setReason(""); onClose(); return;
            }
            const status = deactivating ? "inactive" : "active";
            const r = await runWrite(validateProductStatus(scope, status), () =>
              setStatus.mutateAsync({ p_product_id: product.id, p_status: status }));
            setBusy(false);
            if (!r.ok) { toast.error(r.errors.form ?? "Could not update product"); return; }
            toast.success(`${product.name} ${deleting ? "deleted" : deactivating ? "deactivated" : "activated"}`);
            onClose();
          }}>{busy ? "Saving…" : needsApproval ? "Send request" : deleting ? "Delete product" : deactivating ? "Deactivate product" : "Activate product"}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
