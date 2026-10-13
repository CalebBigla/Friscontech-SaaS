import { createFileRoute } from "@tanstack/react-router";
import { RoleGate } from "@/components/app-shell";
import { PaymentPage } from "@/components/payments/payment-page";

export const Route = createFileRoute("/payment")({
  head: () => ({
    meta: [
      { title: "Payment — SalesFlow Pro" },
      { name: "description", content: "Submit, review and reconcile sales payments." },
    ],
  }),
  component: () => (
    <RoleGate
      allow={(scope) =>
        scope.user.role === "sales_rep" ||
        scope.user.role === "manager" ||
        scope.user.role === "owner"
      }
      title="Payment"
      message="Payment reconciliation is not part of your role."
    >
      <PaymentPage />
    </RoleGate>
  ),
});
