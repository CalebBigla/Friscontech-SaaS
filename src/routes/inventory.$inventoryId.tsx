import { createFileRoute } from "@tanstack/react-router";
import { RoleGate } from "@/components/app-shell";
import { InventoryDetailPage } from "@/components/inventory/inventory-detail-page";
import { BRAND_NAME } from "@/lib/brand";

export const Route = createFileRoute("/inventory/$inventoryId")({
  head: () => ({
    meta: [
      { title: `Inventory item — ${BRAND_NAME}` },
      { name: "description", content: "Stock position, pricing and movement history for a branch inventory item." },
      { property: "og:title", content: `Inventory item — ${BRAND_NAME}` },
      { property: "og:description", content: "On-hand, reserved and available stock with a full movement trail." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: InventoryDetailRoute,
});

function InventoryDetailRoute() {
  const { inventoryId } = Route.useParams();
  return <RoleGate allow={(s) => s.canViewInventoryAdmin} title="Inventory item" message="Stock history is managed by your storekeeper. Use Inventory to see what is available."><InventoryDetailPage inventoryId={inventoryId} /></RoleGate>;
}
