/**
 * Customers React Query Hooks
 * 
 * Data fetching and mutations for customer management
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/auth-context";
import { queryKeys } from "@/lib/query-keys";
import { transformCustomer, type CustomerMigrationRow } from "@/lib/type-adapters";
import { callRpc, type PlannedRpcs } from "@/lib/rpc";
import { handleSupabaseError } from "@/lib/supabase-helpers";
import type { Customer } from "@/data/mock-db";

/**
 * Fetch all customers for tenant
 */
export function useCustomers() {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: queryKeys.customers.all(user?.tenantId || ''),
    queryFn: async (): Promise<Customer[]> => {
      if (!user?.tenantId) throw new Error('Not authenticated');
      
      const { data, error } = await supabase.from('customers')
        .select('*')
        .eq('tenant_id', user.tenantId)
        .order('name');
      
      if (error) handleSupabaseError(error);
      
      return (data || []).map((row) => transformCustomer(row as Parameters<typeof transformCustomer>[0]));
    },
    enabled: !!user?.tenantId,
  });
}

/**
 * Fetch customers by branch
 */
export function useCustomersByBranch(branchId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.customers.byBranch(branchId || ''),
    queryFn: async () => {
      if (!branchId) throw new Error('Branch ID required');
      
      const { data, error } = await supabase.from('customers')
        .select('*')
        .eq('branch_id', branchId)
        .order('name');
      
      if (error) handleSupabaseError(error);
      
      return (data || []).map((row) => transformCustomer(row as Parameters<typeof transformCustomer>[0]));
    },
    enabled: !!branchId,
  });
}

/**
 * Fetch single customer
 */
export function useCustomer(customerId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.customers.detail(customerId || ''),
    queryFn: async (): Promise<Customer> => {
      if (!customerId) throw new Error('Customer ID required');
      
      const { data, error } = await supabase.from('customers')
        .select('*')
        .eq('id', customerId)
        .single();
      
      if (error) handleSupabaseError(error);
      
      return transformCustomer(data as Parameters<typeof transformCustomer>[0]);
    },
    enabled: !!customerId,
  });
}

/** Customer writes change customer lists and the audit log. */
function useCustomerMutation<N extends "create_customer" | "update_customer" | "set_customer_status" | "set_customer_credit_limit">(name: N) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (args: PlannedRpcs[N]): Promise<Customer> => {
      const row = await callRpc(name, args);
      return transformCustomer(row as CustomerMigrationRow);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.customers.root() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.activities.all(user?.tenantId ?? "") });
    },
  });
}

/** Sales rep adds a customer (RPC create_customer). */
export const useCreateCustomer = () => useCustomerMutation("create_customer");
/** Sales rep edits a customer (RPC update_customer). */
export const useUpdateCustomer = () => useCustomerMutation("update_customer");
/** Soft (de)activation (RPC set_customer_status). */
export const useSetCustomerStatus = () => useCustomerMutation("set_customer_status");
/** Owner sets the credit limit (RPC set_customer_credit_limit). */
export const useSetCustomerCreditLimit = () => useCustomerMutation("set_customer_credit_limit");
