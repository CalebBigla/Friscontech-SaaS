import { createFileRoute } from "@tanstack/react-router";
import { RoleGate } from "@/components/app-shell";
import { BranchesPage } from "@/components/branches/branches-page";
import { BRAND_NAME } from "@/lib/brand";

export const Route = createFileRoute("/branches/")({
  head: () => ({
    meta: [
      { title: `Branches — ${BRAND_NAME}` },
      { name: "description", content: "Manage business locations, branch performance and operational status." },
      { property: "og:title", content: `Branches — ${BRAND_NAME}` },
      { property: "og:description", content: "Create, edit and monitor every branch in your business." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BranchesRoute,
});

function BranchesRoute() {
  return <RoleGate allow={(s) => s.canViewBranches} title="Branches" message="Branch management is not part of your role."><BranchesPage /></RoleGate>;
}
