/**
 * Expenses React Query Hooks
 *
 * Manager expense tracking with receipt uploads
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/auth-context";
import { queryKeys } from "@/lib/query-keys";
import { transformExpense, type ExpenseMigrationRow } from "@/lib/type-adapters";
import { callRpc, type PlannedRpcs } from "@/lib/rpc";
import { handleSupabaseError } from "@/lib/supabase-helpers";
import type { Expense } from "@/data/mock-db";

/**
 * Fetch all expenses for the current tenant
 */
export function useExpenses() {
  const { user } = useAuth();

  return useQuery({
    queryKey: queryKeys.expenses.all(user?.tenantId ?? ""),
    queryFn: async (): Promise<Expense[]> => {
      if (!user?.tenantId) throw new Error("Not authenticated");

      const { data, error } = await (supabase as any).from("expenses")
        .select("*")
        .eq("tenant_id", user.tenantId)
        .order("expense_date", { ascending: false });

      if (error) throw handleSupabaseError(error);

      return (data ?? []).map(transformExpense);
    },
    enabled: !!user?.tenantId,
  });
}

/**
 * Fetch expenses for a specific branch
 */
export function useExpensesByBranch(branchId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.expenses.byBranch(branchId ?? ""),
    queryFn: async () => {
      if (!branchId) throw new Error("Branch ID required");

      const { data, error } = await (supabase as any).from("expenses")
        .select("*")
        .eq("branch_id", branchId)
        .order("expense_date", { ascending: false });

      if (error) throw handleSupabaseError(error);

      return (data ?? []).map(transformExpense);
    },
    enabled: !!branchId,
  });
}

/**
 * Fetch expenses for a specific manager
 */
export function useExpensesByManager(managerId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.expenses.byManager(managerId ?? ""),
    queryFn: async () => {
      if (!managerId) throw new Error("Manager ID required");

      const { data, error } = await (supabase as any).from("expenses")
        .select("*")
        .eq("manager_id", managerId)
        .order("expense_date", { ascending: false });

      if (error) throw handleSupabaseError(error);

      return (data ?? []).map(transformExpense);
    },
    enabled: !!managerId,
  });
}

/** Expenses feed remittance totals, reports and the audit log. */
function useExpenseMutation<N extends "create_expense" | "update_expense" | "void_expense">(name: N) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (args: PlannedRpcs[N]): Promise<Expense> => {
      const row = await callRpc(name, args);
      return transformExpense(row as ExpenseMigrationRow);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.expenses.root() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.remittances.manager.all(user?.tenantId ?? "") });
      void queryClient.invalidateQueries({ queryKey: queryKeys.activities.all(user?.tenantId ?? "") });
    },
  });
}

/** Record an expense (RPC create_expense). */
export const useCreateExpense = () => useExpenseMutation("create_expense");
/** Edit a recorded expense (RPC update_expense). */
export const useUpdateExpense = () => useExpenseMutation("update_expense");
/** Void a recorded expense (RPC void_expense). */
export const useVoidExpense = () => useExpenseMutation("void_expense");
