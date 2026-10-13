import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { RoleGate } from "@/components/app-shell";
import { TargetsPage } from "@/components/targets/targets-page";

export const Route = createFileRoute("/targets/")({
  validateSearch: z.object({ month: z.string().optional() }),
  head: () => ({
    meta: [
      { title: "Targets — SalesFlow Pro" },
      { name: "description", content: "Set monthly sales targets and track each rep's progress from real sales." },
      { property: "og:title", content: "Targets — SalesFlow Pro" },
      { property: "og:description", content: "Monthly rep targets with live achievement, pace and status." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TargetsRoute,
});

function TargetsRoute() {
  const { month } = Route.useSearch();
  return <RoleGate allow={(s) => s.canManageTargets} title="Targets" message="Target management is not part of your role. Your own target is on your dashboard."><TargetsPage month={month} /></RoleGate>;
}
