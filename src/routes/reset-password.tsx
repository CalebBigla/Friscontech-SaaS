import { createFileRoute } from "@tanstack/react-router";
import { ResetPasswordPage } from "@/components/auth/auth-pages";
import { BRAND_NAME } from "@/lib/brand";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: `New password — ${BRAND_NAME}` },
      { name: "description", content: `New password for your ${BRAND_NAME} staff account.` },
      { property: "og:title", content: `New password — ${BRAND_NAME}` },
      { property: "og:description", content: `New password for your ${BRAND_NAME} staff account.` },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ResetPasswordPage,
});
