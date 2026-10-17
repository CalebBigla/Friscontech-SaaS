/**
 * Customers React Query Hooks
 * 
 * Data fetching and mutations for customer management
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/auth-context";
import { queryKeys } from "@/lib/query-keys";
import { transformCustomer, customerToDb } from "@/lib/type-adapters";
import { handleSupabaseError } from "@/lib/supabase-helpers";
import type { Customer } from "@/data/mock-db";

/**
 * Fetch all customers for tenant
 */
export function useCustomers() {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: queryKeys.customers.all(user?.tenantId || ''),
    queryFn: async () => {
      if (!user?.tenantId) throw new Error('Not authenticated');
      
      const { data, error } = await (supabase as any).from('customers')
        .select('*')
        .eq('tenant_id', user.tenantId)
        .order('name');
      
      if (error) handleSupabaseError(error);
      
      return (data || []).map(transformCustomer);
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
      
      const { data, error } = await (supabase as any).from('customers')
        .select('*')
        .eq('branch_id', branchId)
        .order('name');
      
      if (error) handleSupabaseError(error);
      
      return (data || []).map(transformCustomer);
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
    queryFn: async () => {
      if (!customerId) throw new Error('Customer ID required');
      
      const { data, error } = await (supabase as any).from('customers')
        .select('*')
        .eq('id', customerId)
        .single();
      
      if (error) handleSupabaseError(error);
      
      return transformCustomer(data);
    },
    enabled: !!customerId,
  });
}

/**
 * Create a new customer
 */
export function useCreateCustomer() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (input: Partial<Customer>) => {
      if (!user?.tenantId) throw new Error('Not authenticated');
      
      const dbData = customerToDb(input, user.tenantId);
      
      const { data, error } = await (supabase as any).from('customers')
        .insert(dbData)
        .select()
        .single();
      
      if (error) handleSupabaseError(error);
      
      return transformCustomer(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.customers.all(user?.tenantId || '') 
      });
    },
  });
}

/**
 * Update an existing customer
 */
export function useUpdateCustomer() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Customer> }) => {
      if (!user?.tenantId) throw new Error('Not authenticated');
      
      const dbData = customerToDb(updates, user.tenantId);
      
      const { data, error } = await (supabase as any).from('customers')
        .update(dbData)
        .eq('id', id)
        .select()
        .single();
      
      if (error) handleSupabaseError(error);
      
      return transformCustomer(data);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.customers.all(user?.tenantId || '') 
      });
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.customers.byBranch(data.branchId) 
      });
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.customers.detail(data.id) 
      });
    },
  });
}

/**
 * Deactivate a customer (soft delete)
 */
export function useDeactivateCustomer() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (customerId: string) => {
      if (!user?.tenantId) throw new Error('Not authenticated');
      
      const { data, error } = await (supabase as any).from('customers')
        .update({ 
          status: 'inactive',
          deactivated_at: new Date().toISOString(),
        })
        .eq('id', customerId)
        .select()
        .single();
      
      if (error) handleSupabaseError(error);
      
      return transformCustomer(data);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.customers.all(user?.tenantId || '') 
      });
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.customers.detail(data.id) 
      });
    },
  });
}
