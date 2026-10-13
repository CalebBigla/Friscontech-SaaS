import { createFileRoute } from "@tanstack/react-router";
import { RoleGate } from "@/components/app-shell";
import { TeamPage } from "@/components/team/team-page";

export const Route = createFileRoute("/team/")({
  head: () => ({
    meta: [
      { title: "Team — SalesFlow Pro" },
      { name: "description", content: "Manage the managers, storekeepers and sales representatives in your organization." },
      { property: "og:title", content: "Team — SalesFlow Pro" },
      { property: "og:description", content: "Invite, edit and activate team members by role and branch." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <RoleGate allow={(s) => s.canManageTeam} title="Team" message="Team management is available to Business Owners and Managers."><TeamPage /></RoleGate>,
});
