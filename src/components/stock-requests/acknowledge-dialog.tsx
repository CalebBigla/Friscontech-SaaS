import { useState } from "react";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import type { StockRequest } from "@/data/mock-db";
import { useDb } from "@/services/mock-store";
import { stockRequestService } from "@/services/services";
import { formatUnits } from "@/lib/format";

/** Rep confirms receipt of fulfilled stock (Fulfilled → Acknowledged). */
export function AcknowledgeDialog({ request, onClose, actorId }: { request: StockRequest | null; onClose: () => void; actorId: string }) {
  const db = useDb();
  const [busy, setBusy] = useState(false);
  const product = db.products.find((p) => p.id === request?.productId);
  return (
    <AlertDialog open={!!request} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Acknowledge receipt?</AlertDialogTitle>
          <AlertDialogDescription>Confirm you received {formatUnits(request?.quantityFulfilled ?? 0)} of {product?.name} for request {request?.id}. This is recorded with today's date and can't be undone.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction disabled={busy} onClick={async (e) => {
            e.preventDefault();
            if (!request) return;
            setBusy(true);
            const r = await stockRequestService.acknowledge(request.id, actorId);
            setBusy(false);
            if (r.ok) toast.success("Receipt acknowledged.", { description: `${request.id} · ${product?.name}` }); else toast.error(r.errors.form ?? "Could not acknowledge");
            onClose();
          }}>{busy ? "Saving…" : "Acknowledge receipt"}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
