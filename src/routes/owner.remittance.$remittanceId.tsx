import { createFileRoute } from "@tanstack/react-router";
import { RoleGate } from "@/components/app-shell";
import { OwnerRemittancePage } from "@/components/remittances/owner-remittance-page";

export const Route = createFileRoute("/owner/remittance/$remittanceId")({
  head: () => ({ meta: [{ title: "Remittance Details — SalesFlow Pro" }] }),
  component: OwnerRemittanceDetailRoute,
});

function OwnerRemittanceDetailRoute() {
  const { remittanceId } = Route.useParams();
  return (
    <RoleGate
      allow={(scope) => scope.user.role === "owner"}
      title="Remittance"
      message="Owner remittances are not part of your role."
    >
      <OwnerRemittancePage remittanceId={remittanceId} />
    </RoleGate>
  );
}
