import { createFileRoute } from "@tanstack/react-router";
import { RoleGate } from "@/components/app-shell";
import { ReportsPage } from "@/components/reports/reports-page";

export const Route = createFileRoute("/reports")({
  head: () => ({
    meta: [
      { title: "Reports — SalesFlow Pro" },
      { name: "description", content: "Sales, target, inventory and team performance reports calculated from live records." },
      { property: "og:title", content: "Reports — SalesFlow Pro" },
      { property: "og:description", content: "Analyze sales, targets, inventory and team performance." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <RoleGate allow={(s) => s.canViewReports} title="Reports" message="Company reports are available to Business Owners and Managers. Your own performance is on your dashboard."><ReportsPage /></RoleGate>,
});
