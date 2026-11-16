import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { RoleGate } from "@/components/app-shell";
import { OrdersPage } from "@/components/orders/orders-page";
import { BRAND_NAME } from "@/lib/brand";

const searchSchema = z.object({
  status: z.enum(["pending", "fulfilled", "acknowledged", "cancelled"]).optional().catch(undefined),
});

export const Route = createFileRoute("/orders")({
  validateSearch: (search) => searchSchema.parse(search),
  head: () => ({
    meta: [
      { title: `Orders — ${BRAND_NAME}` },
      { name: "description", content: "Customer orders: raised by the sales rep, fulfilled by the storekeeper, acknowledged by the rep." },
    ],
  }),
  component: OrdersRoute,
});

function OrdersRoute() {
  const search = Route.useSearch();
  return (
    <RoleGate allow={(s) => s.canViewOrders} title="Orders" message="Orders are not part of your role.">
      <OrdersPage initialStatus={search.status} />
    </RoleGate>
  );
}
