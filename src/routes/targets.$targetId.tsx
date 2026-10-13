import { createFileRoute } from "@tanstack/react-router";
import { RoleGate } from "@/components/app-shell";
import { TargetDetailPage } from "@/components/targets/target-detail-page";

export const Route = createFileRoute("/targets/$targetId")({
  head: () => ({
    meta: [
      { title: "Target details — SalesFlow Pro" },
      { name: "description", content: "Target, achieved, remaining and contributing sales for a rep's month." },
      { property: "og:title", content: "Target details — SalesFlow Pro" },
      { property: "og:description", content: "Track a rep's monthly target against cumulative sales." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TargetDetailRoute,
});

function TargetDetailRoute() {
  const { targetId } = Route.useParams();
  return <RoleGate allow={(s) => s.canManageTargets} title="Target" message="Target management is not part of your role."><TargetDetailPage targetId={targetId} /></RoleGate>;
}
