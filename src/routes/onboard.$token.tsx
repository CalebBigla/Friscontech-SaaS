import { createFileRoute } from "@tanstack/react-router";
import { OnboardingFormPage } from "@/components/onboarding/onboarding-form-page";

export const Route = createFileRoute("/onboard/$token")({
  head: () => ({
    meta: [
      { title: "Staff Onboarding — Friscontech" },
      { name: "description", content: "Complete your Friscon Tech Limited employee data form." },
      { property: "og:title", content: "Staff Onboarding — Friscontech" },
      { property: "og:description", content: "Employee data form, documents and declaration." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: OnboardRoute,
});

function OnboardRoute() {
  const { token } = Route.useParams();
  return <OnboardingFormPage token={token} />;
}
