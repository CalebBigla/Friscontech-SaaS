import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { LoginPage } from "@/components/auth/auth-pages";
import { BRAND_NAME } from "@/lib/brand";

export const Route = createFileRoute("/login")({
  // ?confirmed=1 is where the sign-up confirmation email lands.
  validateSearch: z.object({ confirmed: z.coerce.number().optional().catch(undefined) }),
  head: () => ({
    meta: [
      { title: `Sign in — ${BRAND_NAME}` },
      { name: "description", content: `Sign in for your ${BRAND_NAME} staff account.` },
      { property: "og:title", content: `Sign in — ${BRAND_NAME}` },
      { property: "og:description", content: `Sign in for your ${BRAND_NAME} staff account.` },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: LoginPage,
});
