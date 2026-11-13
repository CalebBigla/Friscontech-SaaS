import { createFileRoute } from "@tanstack/react-router";
import { RoleGate } from "@/components/app-shell";
import { ExchangesPage } from "@/components/exchanges/exchanges-page";

export const Route = createFileRoute("/exchanges")({
  head: () => ({
    meta: [
      { title: "Exchanges — Friscontech" },
      { name: "description", content: "Customer exchanges: requested by the rep, approved and fulfilled by the storekeeper." },
    ],
  }),
  component: () => (
    <RoleGate allow={(s) => s.user.role !== "supervisor"} title="Exchanges" message="Exchanges are not part of your role.">
      <ExchangesPage />
    </RoleGate>
  ),
});
