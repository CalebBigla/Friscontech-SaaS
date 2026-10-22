import { useMemo } from "react";
import { useAuth } from "@/contexts/auth-context";
import type { Db, User } from "@/data/mock-db";
import { useBranches } from "@/hooks/use-branches";
import { useCustomers } from "@/hooks/use-customers";
import { useInventory } from "@/hooks/use-inventory";
import { useProducts } from "@/hooks/use-products";
import { useSales } from "@/hooks/use-sales";
import { useTargets } from "@/hooks/use-targets";
import { useUsers } from "@/hooks/use-users";
import { transformTarget } from "@/lib/type-adapters";
import { useDb } from "@/services/mock-store";

/** A calculation-friendly snapshot assembled only from Supabase-backed queries. */
export function useLiveWorkspace() {
  const { user } = useAuth();
  const emptyDb = useDb();
  const branches = useBranches();
  const customers = useCustomers();
  const inventory = useInventory();
  const products = useProducts();
  const sales = useSales();
  const targets = useTargets(user?.tenantId ?? "");
  const users = useUsers();

  const db = useMemo<Db>(() => ({
    ...emptyDb,
    tenant: {
      ...emptyDb.tenant,
      id: user?.tenantId ?? "",
      referenceDate: new Date().toISOString().slice(0, 10),
    },
    branches: branches.data ?? [],
    users: users.data?.filter((row: User) => row.status === "active") ?? (user ? [user] : []),
    products: products.data ?? [],
    sales: sales.data ?? [],
    targets: (targets.data ?? []).map((row) => transformTarget(row as any)),
    inventory: inventory.data ?? [],
    customers: customers.data ?? [],
  }), [emptyDb, user, branches.data, users.data, products.data, sales.data, targets.data, inventory.data, customers.data]);

  const queries = [branches, customers, inventory, products, sales, targets, users];
  return {
    db,
    isLoading: queries.some((query) => query.isLoading),
    error: queries.find((query) => query.error)?.error ?? null,
  };
}
