import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { InventoryPage } from "@/components/inventory/inventory-page";
import { RoleGate } from "@/components/app-shell";

const searchSchema = z.object({
  branch: z.string().optional().catch(undefined),
  status: z.enum(["in_stock", "low_stock", "out_of_stock"]).optional().catch(undefined),
});

export const Route = createFileRoute("/inventory/")({
  validateSearch: (search) => searchSchema.parse(search),
  head: () => ({
    meta: [
      { title: "Inventory — SalesFlow Pro" },
      { name: "description", content: "Monitor stock levels, availability, and inventory movement across your branches." },
      { property: "og:title", content: "Inventory — SalesFlow Pro" },
      { property: "og:description", content: "Branch-aware stock levels, low-stock alerts and inventory value." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: InventoryRoute,
});

function InventoryRoute() {
  const search = Route.useSearch();
  return <RoleGate allow={(scope) => scope.canViewInventoryAdmin} title="Inventory" message="The full Inventory module is not part of your role. Stock Requests remain available."><InventoryPage initialBranch={search.branch} initialStatus={search.status} /></RoleGate>;
}
