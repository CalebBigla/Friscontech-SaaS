import { createFileRoute } from "@tanstack/react-router";

import { RoleGate } from "@/components/app-shell";
import { AuditLogPage } from "@/components/audit/audit-log-page";

export const Route = createFileRoute("/audit-log")({
  head: () => ({
    meta: [
      { title: "Audit Log — SalesFlow Pro" },
      { name: "description", content: "Track who did what, when, and to which record across your organization." },
      { property: "og:title", content: "Audit Log — SalesFlow Pro" },
      { property: "og:description", content: "A chronological record of important actions in SalesFlow Pro." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <RoleGate allow={(s) => s.canViewAuditLogs} title="Audit Log" message="You don't have access to the audit log."><AuditLogPage /></RoleGate>,
});
