import { createFileRoute } from "@tanstack/react-router";

import { SettingsPage } from "@/components/settings/settings-page";
import { BRAND_NAME } from "@/lib/brand";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: `Settings — ${BRAND_NAME}` },
      { name: "description", content: "Manage your business profile, display preferences and account security." },
      { property: "og:title", content: `Settings — ${BRAND_NAME}` },
      { property: "og:description", content: "Business, organization, preference and security settings." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SettingsPage,
});
