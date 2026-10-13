import { createFileRoute } from "@tanstack/react-router";
import { RoleGate } from "@/components/app-shell";
import { CustomersPage } from "@/components/customers/customers-page";

export const Route = createFileRoute("/customers/")({
  head: () => ({
    meta: [
      { title: "Customers — Friscontech" },
      { name: "description", content: "Registered customer accounts, balances and credit." },
      { property: "og:title", content: "Customers — Friscontech" },
      { property: "og:description", content: "Registered customer accounts, balances and credit." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <RoleGate allow={(s) => s.canViewCustomers} title="Customers" message="Customer accounts are available to Sales Reps, Storekeepers and the Owner."><CustomersPage /></RoleGate>,
});
