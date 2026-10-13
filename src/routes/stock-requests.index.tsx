import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { StockRequestsPage } from "@/components/stock-requests/stock-requests-page";

const searchSchema = z.object({
  status: z.enum(["pending", "approved", "partially_fulfilled", "fulfilled", "rejected"]).optional().catch(undefined),
});

export const Route = createFileRoute("/stock-requests/")({
  validateSearch: (search) => searchSchema.parse(search),
  head: () => ({
    meta: [
      { title: "Stock Requests — SalesFlow Pro" },
      { name: "description", content: "Review, approve, and fulfill product requests from sales representatives." },
      { property: "og:title", content: "Stock Requests — SalesFlow Pro" },
      { property: "og:description", content: "Approve, reject and fulfill branch stock requests with live availability." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StockRequestsRoute,
});

function StockRequestsRoute() {
  const search = Route.useSearch();
  return <StockRequestsPage initialStatus={search.status} />;
}
