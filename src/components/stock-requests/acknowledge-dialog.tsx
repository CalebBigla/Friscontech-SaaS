import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import type { StockRequest } from "@/data/mock-db";
import { useLiveWorkspace } from "@/hooks/use-live-workspace";
import { useAcknowledgeStockRequest } from "@/hooks/use-stock-requests";
import { getAccessScope } from "@/lib/session";
import { fieldErrorsFrom } from "@/lib/supabase-helpers";
import { FIELD_NAMES, validateAcknowledgeStockRequest } from "@/lib/validation";
import { formatUnits } from "@/lib/format";

/** Rep confirms receipt of fulfilled stock (Fulfilled → Acknowledged). */
export function AcknowledgeDialog({ request, onClose, actorId }: { request: StockRequest | null; onClose: () => void; actorId: string }) {
  const { db } = useLiveWorkspace();
  const acknowledge = useAcknowledgeStockRequest();
  const busy = acknowledge.isPending;
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
            const invalid = validateAcknowledgeStockRequest(getAccessScope(db, actorId), request);
            if (invalid) { toast.error(invalid.form ?? "Could not acknowledge"); onClose(); return; }
            try {
              await acknowledge.mutateAsync({ p_request_id: request.id });
              toast.success("Receipt acknowledged.", { description: `${request.id} · ${product?.name}` });
            } catch (error) {
              toast.error(fieldErrorsFrom(error, FIELD_NAMES).form ?? "Could not acknowledge");
            }
            onClose();
          }}>{busy ? "Saving…" : "Acknowledge receipt"}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
