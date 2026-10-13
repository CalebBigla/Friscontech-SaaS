import { createFileRoute } from "@tanstack/react-router";
import { RoleGate } from "@/components/app-shell";
import { OwnerRemittancePage } from "@/components/remittances/owner-remittance-page";

export const Route = createFileRoute("/owner/remittance/")({
  head: () => ({
    meta: [
      { title: "Remittance — SalesFlow Pro" },
      { name: "description", content: "Manage outgoing Owner remittances." },
    ],
  }),
  component: () => (
    <RoleGate
      allow={(scope) => scope.user.role === "owner"}
      title="Remittance"
      message="Owner remittances are not part of your role."
    >
      <OwnerRemittancePage />
    </RoleGate>
  ),
});
