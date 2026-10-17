import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import type { Branch } from "@/data/mock-db";
import { useDeactivateBranch } from "@/hooks/use-branches";
import { branchService } from "@/services/services";

export function DeactivateBranchDialog({ branch, onClose, actorId }: { branch: Branch | null; onClose: () => void; actorId: string }) {
  const deactivateBranch = useDeactivateBranch();
  const busy = deactivateBranch.isPending;
  
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
            
            try {
              // Validate first (keep existing validation logic)
              const validationResult = await branchService.deactivate(branch.id, actorId);
              if (!validationResult.ok) {
                toast.error(validationResult.errors?.form || "Could not deactivate branch");
                return;
              }
              
              // Perform Supabase mutation
              await deactivateBranch.mutateAsync(branch.id);
              toast.success(`${branch.name} deactivated`);
              onClose();
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "Could not deactivate branch");
            }
          }}>{busy ? "Deactivating…" : "Deactivate Branch"}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
