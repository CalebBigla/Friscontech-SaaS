import { createFileRoute } from "@tanstack/react-router";
import { GuarantorFormPage } from "@/components/onboarding/guarantor-form-page";

export const Route = createFileRoute("/guarantor/$token")({
  head: () => ({
    meta: [
      { title: "Guarantor Form — Friscontech" },
      { name: "description", content: "Confidential guarantor form for a Friscon Tech Limited applicant." },
      { property: "og:title", content: "Guarantor Form — Friscontech" },
      { property: "og:description", content: "Confidential guarantor reference." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: GuarantorRoute,
});

function GuarantorRoute() {
  const { token } = Route.useParams();
  return <GuarantorFormPage token={token} />;
}
