import { createFileRoute } from "@tanstack/react-router";
import { ProductsPage } from "@/components/products/products-page";

export const Route = createFileRoute("/products/")({
  head: () => ({
    meta: [
      { title: "Products — SalesFlow Pro" },
      { name: "description", content: "Manage the product catalogue: pricing, units, thresholds and status." },
      { property: "og:title", content: "Products — SalesFlow Pro" },
      { property: "og:description", content: "The central product catalogue shared by inventory, sales and stock requests." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProductsPage,
});
