import { createFileRoute } from "@tanstack/react-router";
import { RoleGate } from "@/components/app-shell";
import { RemittancePage } from "@/components/remittances/remittance-page";
import { BRAND_NAME } from "@/lib/brand";

export const Route = createFileRoute("/remittance")({
  head: () => ({
    meta: [
      { title: `Remittance — ${BRAND_NAME}` },
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
