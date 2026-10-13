import { createFileRoute } from "@tanstack/react-router";
import { RoleGate } from "@/components/app-shell";
import { TeamDetailPage } from "@/components/team/team-detail-page";

export const Route = createFileRoute("/team/$userId")({
  head: () => ({
    meta: [
      { title: "Team Member — SalesFlow Pro" },
      { name: "description", content: "Profile, role, branch and performance for a team member." },
      { property: "og:title", content: "Team Member — SalesFlow Pro" },
      { property: "og:description", content: "Team member profile and activity." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TeamMemberRoute,
});

function TeamMemberRoute() {
  const { userId } = Route.useParams();
  return <RoleGate allow={(s) => s.canManageTeam} title="Team" message="Team management is available to Business Owners and Managers."><TeamDetailPage userId={userId} /></RoleGate>;
}
