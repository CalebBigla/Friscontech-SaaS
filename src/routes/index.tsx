import { createFileRoute } from "@tanstack/react-router";
import { OwnerDashboard } from "@/components/owner-dashboard";
import { RepDashboard } from "@/components/dashboards/rep-dashboard";
import { ManagerDashboard } from "@/components/dashboards/manager-dashboard";
import { StorekeeperDashboard } from "@/components/dashboards/storekeeper-dashboard";
import { useDb } from "@/services/mock-store";
import { getAccessScope, useCurrentUserId } from "@/lib/session";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — SalesFlow Pro" },
      { name: "description", content: "Monitor sales, inventory, branches, targets, and team performance across your business." },
      { property: "og:title", content: "Dashboard — SalesFlow Pro" },
      { property: "og:description", content: "A unified view of business performance, stock health, and team targets." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const db = useDb();
  const role = getAccessScope(db, useCurrentUserId()).user.role;
  if (role === "sales_rep") return <RepDashboard />;
  if (role === "storekeeper") return <StorekeeperDashboard />;
  if (role === "manager") return <ManagerDashboard />;
  return <OwnerDashboard />;
}
