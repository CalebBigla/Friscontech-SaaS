import { createFileRoute } from "@tanstack/react-router";
import { RoleGate } from "@/components/app-shell";
import { ProductDetailPage } from "@/components/products/product-detail-page";

export const Route = createFileRoute("/products/$productId")({
  head: () => ({
    meta: [
      { title: "Product details — SalesFlow Pro" },
      { name: "description", content: "Product information, stock by branch, sales and movement history." },
      { property: "og:title", content: "Product details — SalesFlow Pro" },
      { property: "og:description", content: "See branch stock, sales and movements for a product." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProductDetailRoute,
});

function ProductDetailRoute() {
  const { productId } = Route.useParams();
  return <RoleGate allow={(s) => s.canViewInventoryAdmin} title="Product" message="Product details are not part of your role."><ProductDetailPage productId={productId} /></RoleGate>;
}
