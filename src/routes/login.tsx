import { createFileRoute } from "@tanstack/react-router";

import { LoginPage } from "@/components/auth/auth-pages";

export const Route = createFileRoute("/login")({

  head: () => ({
    meta: [
      { title: "Sign in — Friscontech" },
      { name: "description", content: "Sign in for your Friscontech staff account." },
      { property: "og:title", content: "Sign in — Friscontech" },
      { property: "og:description", content: "Sign in for your Friscontech staff account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: LoginPage,
});
