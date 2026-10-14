import { createFileRoute } from "@tanstack/react-router";

import { ForgotPasswordPage } from "@/components/auth/auth-pages";

export const Route = createFileRoute("/forgot-password")({

  head: () => ({
    meta: [
      { title: "Reset password — Friscontech" },
      { name: "description", content: "Reset password for your Friscontech staff account." },
      { property: "og:title", content: "Reset password — Friscontech" },
      { property: "og:description", content: "Reset password for your Friscontech staff account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ForgotPasswordPage,
});
