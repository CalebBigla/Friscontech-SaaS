import { createFileRoute } from "@tanstack/react-router";
import { OnboardingFormPage } from "@/components/onboarding/onboarding-form-page";
import { BRAND_NAME } from "@/lib/brand";

export const Route = createFileRoute("/onboard/$token")({
  head: () => ({
    meta: [
      { title: `Staff Onboarding — ${BRAND_NAME}` },
      { name: "description", content: `Complete your ${BRAND_NAME} employee data form.` },
      { property: "og:title", content: `Staff Onboarding — ${BRAND_NAME}` },
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
