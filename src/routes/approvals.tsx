import { createFileRoute } from "@tanstack/react-router";
import { RoleGate } from "@/components/app-shell";
import { ApprovalsPage } from "@/components/approvals/approvals-page";

export const Route = createFileRoute("/approvals")({
  head: () => ({
    meta: [
      { title: "Approvals — SalesFlow Pro" },
      { name: "description", content: "Review stock additions, product deactivations and new team members awaiting sign-off." },
      { property: "og:title", content: "Approvals — SalesFlow Pro" },
      { property: "og:description", content: "Approve or reject requests between storekeepers, managers and owners." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <RoleGate allow={(s) => s.user.role !== "sales_rep"} title="Approvals" message="Approvals are not part of your role."><ApprovalsPage /></RoleGate>,
});
