import { createFileRoute } from "@tanstack/react-router";

import { ForgotPasswordPage } from "@/components/auth/auth-pages";
import { BRAND_NAME } from "@/lib/brand";

export const Route = createFileRoute("/forgot-password")({

  head: () => ({
    meta: [
      { title: `Reset password — ${BRAND_NAME}` },
      { name: "description", content: `Reset password for your ${BRAND_NAME} staff account.` },
      { property: "og:title", content: `Reset password — ${BRAND_NAME}` },
      { property: "og:description", content: `Reset password for your ${BRAND_NAME} staff account.` },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ForgotPasswordPage,
});
