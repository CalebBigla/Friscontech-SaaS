import { createFileRoute } from "@tanstack/react-router";
import { RoleGate } from "@/components/app-shell";
import { RemittancePage } from "@/components/remittances/remittance-page";

export const Route = createFileRoute("/remittance")({
  head: () => ({
    meta: [
      { title: "Remittance — SalesFlow Pro" },
      { name: "description", content: "Submit and confirm manager remittances." },
    ],
  }),
  component: () => (
    <RoleGate
      allow={(scope) => scope.user.role === "manager" || scope.user.role === "owner"}
      title="Remittance"
      message="Manager remittances are not part of your role."
    >
      <RemittancePage />
    </RoleGate>
  ),
});
