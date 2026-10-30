import { createFileRoute } from "@tanstack/react-router";
import { ResetPasswordPage } from "@/components/auth/auth-pages";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "New password — Friscontech" },
      { name: "description", content: "New password for your Friscontech staff account." },
      { property: "og:title", content: "New password — Friscontech" },
      { property: "og:description", content: "New password for your Friscontech staff account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ResetPasswordPage,
});
