/**
 * Expenses React Query Hooks
 *
 * Manager expense tracking with receipt uploads
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/auth-context";
import { queryKeys } from "@/lib/query-keys";
import { transformExpense, expenseToDb } from "@/lib/type-adapters";
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

/**
 * Create a new expense
 */
export function useCreateExpense() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: Partial<Expense>) => {
      if (!user?.tenantId) throw new Error("Not authenticated");

      const dbData = expenseToDb(input, user.tenantId);

      const { data, error } = await (supabase as any).from("expenses")
        .insert(dbData)
        .select()
        .single();

      if (error) throw handleSupabaseError(error);

      return transformExpense(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.expenses.all(user?.tenantId ?? ""),
      });
    },
  });
}

/**
 * Update an existing expense
 */
export function useUpdateExpense() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: Partial<Expense>;
    }) => {
      if (!user?.tenantId) throw new Error("Not authenticated");

      const dbData = expenseToDb(updates, user.tenantId);

      const { data, error } = await (supabase as any).from("expenses")
        .update(dbData)
        .eq("id", id)
        .select()
        .single();

      if (error) throw handleSupabaseError(error);

      return transformExpense(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.expenses.all(user?.tenantId ?? ""),
      });
    },
  });
}

/**
 * Delete an expense
 */
export function useDeleteExpense() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (expenseId: string) => {
      const { error } = await (supabase as any).from("expenses")
        .delete()
        .eq("id", expenseId);

      if (error) throw handleSupabaseError(error);

      return expenseId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.expenses.all(user?.tenantId ?? ""),
      });
    },
  });
}
