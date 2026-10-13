import { createFileRoute } from "@tanstack/react-router";
import { RoleGate } from "@/components/app-shell";
import { ManagerRemittancesReview } from "@/components/payments/manager-remittances-review";

export const Route = createFileRoute("/manager-remittances")({
  head: () => ({
    meta: [
      { title: "Manager Remittances — Friscontech" },
      { name: "description", content: "Review and confirm remittances submitted by branch managers." },
      { property: "og:title", content: "Manager Remittances — Friscontech" },
      { property: "og:description", content: "Review and confirm remittances submitted by branch managers." },
    ],
  }),
  component: () => (
    <RoleGate
      allow={(scope) => scope.canConfirmPayments}
      title="Manager Remittances"
      message="Only the owner reviews manager remittances."
    >
      <ManagerRemittancesReview />
    </RoleGate>
  ),
});
