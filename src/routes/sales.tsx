import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { SalesPage } from "@/components/sales/sales-page";

const searchSchema = z.object({
  period: z.enum(["today", "week", "month", "quarter", "custom"]).optional().catch(undefined),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().catch(undefined),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().catch(undefined),
  branch: z.string().optional().catch(undefined),
  rep: z.string().optional().catch(undefined),
  product: z.string().optional().catch(undefined),
});

export const Route = createFileRoute("/sales")({
  validateSearch: (search) => searchSchema.parse(search),
  head: () => ({
    meta: [
      { title: "Sales — SalesFlow Pro" },
      { name: "description", content: "Track sales activity, revenue and sales performance across every branch." },
      { property: "og:title", content: "Sales — SalesFlow Pro" },
      { property: "og:description", content: "Filter sales by period, branch, rep and product, and record new sales." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SalesPage,
});
