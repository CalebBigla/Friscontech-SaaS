import { createFileRoute } from "@tanstack/react-router";
import { RoleGate } from "@/components/app-shell";
import { ExpensesPage } from "@/components/expenses/expenses-page";
import { BRAND_NAME } from "@/lib/brand";

export const Route = createFileRoute("/expenses")({
  head: () => ({
    meta: [
      { title: `Expenses — ${BRAND_NAME}` },
      { name: "description", content: "Record and review branch operating expenses." },
    ],
  }),
  component: () => (
    <RoleGate
      allow={(scope) => scope.user.role === "manager" || scope.user.role === "owner"}
      title="Expenses"
      message="Expenses are not part of your role."
    >
      <ExpensesPage />
    </RoleGate>
  ),
});
