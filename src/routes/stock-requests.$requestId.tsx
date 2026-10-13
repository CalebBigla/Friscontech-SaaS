import { createFileRoute } from "@tanstack/react-router";
import { RequestDetailPage } from "@/components/stock-requests/request-detail-page";

export const Route = createFileRoute("/stock-requests/$requestId")({
  head: () => ({
    meta: [
      { title: "Stock request — SalesFlow Pro" },
      { name: "description", content: "Request details, live stock availability and the approval-to-fulfilment timeline." },
      { property: "og:title", content: "Stock request — SalesFlow Pro" },
      { property: "og:description", content: "Track a stock request from submission to fulfilment." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RequestDetailRoute,
});

function RequestDetailRoute() {
  const { requestId } = Route.useParams();
  return <RequestDetailPage requestId={requestId} />;
}
