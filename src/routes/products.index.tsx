import { createFileRoute } from "@tanstack/react-router";
import { ProductsPage } from "@/components/products/products-page";
import { BRAND_NAME } from "@/lib/brand";

export const Route = createFileRoute("/products/")({
  head: () => ({
    meta: [
      { title: `Products — ${BRAND_NAME}` },
      { name: "description", content: "Manage the product catalogue: pricing, units, thresholds and status." },
      { property: "og:title", content: `Products — ${BRAND_NAME}` },
      { property: "og:description", content: "The central product catalogue shared by inventory, sales and orders." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProductsPage,
});
