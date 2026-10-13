import { createFileRoute } from "@tanstack/react-router";

import { SettingsPage } from "@/components/settings/settings-page";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — SalesFlow Pro" },
      { name: "description", content: "Manage your business profile, display preferences and account security." },
      { property: "og:title", content: "Settings — SalesFlow Pro" },
      { property: "og:description", content: "Business, organization, preference and security settings." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SettingsPage,
});
