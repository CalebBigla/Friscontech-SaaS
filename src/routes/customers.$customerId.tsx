import { createFileRoute } from "@tanstack/react-router";
import { RoleGate } from "@/components/app-shell";
import { CustomerDetailPage } from "@/components/customers/customer-detail-page";
import { BRAND_NAME } from "@/lib/brand";

export const Route = createFileRoute("/customers/$customerId")({
  head: () => ({
    meta: [
      { title: `Customer Account — ${BRAND_NAME}` },
      { name: "description", content: "Customer ledger, orders, payments and statement." },
      { property: "og:title", content: `Customer Account — ${BRAND_NAME}` },
      { property: "og:description", content: "Customer ledger, orders, payments and statement." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CustomerRoute,
});

function CustomerRoute() {
  const { customerId } = Route.useParams();
  return (
    <RoleGate
      allow={(s) => s.canViewCustomers}
      title="Customers"
      message="Customer accounts are available to Sales Reps, Storekeepers and the Owner."
    >
      <CustomerDetailPage customerId={customerId} />
    </RoleGate>
  );
}
