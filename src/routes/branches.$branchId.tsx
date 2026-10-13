import { createFileRoute } from "@tanstack/react-router";
import { RoleGate } from "@/components/app-shell";
import { BranchDetailsPage } from "@/components/branches/branch-details-page";

export const Route = createFileRoute("/branches/$branchId")({
  head: () => ({
    meta: [
      { title: "Branch details — SalesFlow Pro" },
      { name: "description", content: "Branch revenue, target achievement, staff, sales and inventory health." },
      { property: "og:title", content: "Branch details — SalesFlow Pro" },
      { property: "og:description", content: "A complete operational view of a single branch." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BranchDetails,
});

function BranchDetails() {
  const { branchId } = Route.useParams();
  return <RoleGate allow={(s) => s.canViewBranches} title="Branch" message="Branch management is not part of your role."><BranchDetailsPage branchId={branchId} /></RoleGate>;
}
