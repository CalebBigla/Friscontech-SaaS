import { useState } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ALL, FilterSelect } from "@/components/shared";
import { MovementList } from "@/components/inventory/movement-list";
import type { InventoryMovement } from "@/data/mock-db";
import { useDb } from "@/services/mock-store";
import { getAccessScope, useCurrentUserId } from "@/lib/session";
import { getInventoryMovements, movementTypeLabel } from "@/lib/inventory-calculations";

export function MovementsSheet({ open, onOpenChange, branchIds, branchId }: { open: boolean; onOpenChange: (o: boolean) => void; branchIds: string[] | null; branchId?: string | undefined }) {
  const db = useDb();
  const [type, setType] = useState(ALL);
  const hideSales = getAccessScope(db, useCurrentUserId()).user.role === "storekeeper";
  const list = getInventoryMovements(db, { branchIds, branchId, type: type === ALL ? undefined : (type as InventoryMovement["type"]) }).filter((m) => !hideSales || m.type !== "sale");
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
        <SheetHeader className="border-b border-border p-5 text-left">
          <SheetTitle>Inventory movements</SheetTitle>
          <SheetDescription className="text-xs">{list.length} movements{branchId ? ` · ${db.branches.find((b) => b.id === branchId)?.name}` : ""}</SheetDescription>
          <FilterSelect label="Movement type" className="mt-2 w-full sm:w-48" value={type} onChange={setType} options={[{ value: ALL, label: "All movements" }, ...Object.entries(movementTypeLabel).map(([value, label]) => ({ value, label }))]} />
        </SheetHeader>
        <div className="flex-1 overflow-y-auto"><MovementList db={db} movements={list.slice(0, 150)} showItem /></div>
      </SheetContent>
    </Sheet>
  );
}
