import { useState } from "react";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import type { Branch } from "@/data/mock-db";
import { branchService } from "@/services/services";

export function DeactivateBranchDialog({ branch, onClose, actorId }: { branch: Branch | null; onClose: () => void; actorId: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <AlertDialog open={!!branch} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Deactivate {branch?.name}?</AlertDialogTitle>
          <AlertDialogDescription>This branch will no longer be treated as an active operating location. Historical sales, inventory and reports will remain available.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction disabled={busy} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={async (e) => {
            e.preventDefault();
            if (!branch) return;
            setBusy(true);
            const r = await branchService.deactivate(branch.id, actorId);
            setBusy(false);
            if (r.ok) toast.success(`${branch.name} deactivated`); else toast.error("Could not deactivate branch");
            onClose();
          }}>{busy ? "Deactivating…" : "Deactivate Branch"}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
