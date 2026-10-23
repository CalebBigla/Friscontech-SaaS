/**
 * Branches React Query Hooks
 * 
 * Data fetching and mutations for branch management
 * Branches are read from and written to Supabase
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/auth-context";
import { queryKeys } from "@/lib/query-keys";
import { transformBranch, branchToDb } from "@/lib/type-adapters";
import { handleSupabaseError } from "@/lib/supabase-helpers";
import type { Branch } from "@/data/mock-db";

/**
 * Fetch all branches for the current tenant
 */
export function useBranches() {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: queryKeys.branches.all(user?.tenantId || ''),
    queryFn: async (): Promise<Branch[]> => {
      if (!user?.tenantId) throw new Error('Not authenticated');
      
      const { data, error } = await (supabase as any).from('branches')
        .select('*')
        .eq('tenant_id', user.tenantId)
        .order('name');
      
      if (error) handleSupabaseError(error);
      
      return (data || []).map(transformBranch);
    },
    enabled: !!user?.tenantId,
  });
}

/**
 * Fetch a single branch by ID
 */
export function useBranch(branchId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.branches.detail(branchId || ''),
    queryFn: async (): Promise<Branch> => {
      if (!branchId) throw new Error('Branch ID required');
      
      const { data, error } = await (supabase as any).from('branches')
        .select('*')
        .eq('id', branchId)
        .single();
      
      if (error) handleSupabaseError(error);
      
      return transformBranch(data);
    },
    enabled: !!branchId,
  });
}

/**
 * Create a new branch
 */
export function useCreateBranch() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (input: Partial<Branch>) => {
      if (!user?.tenantId) throw new Error('Not authenticated');
      
      const dbData = branchToDb(input, user.tenantId);
      
      const { data, error } = await (supabase as any).from('branches')
        .insert(dbData)
        .select()
        .single();
      
      if (error) handleSupabaseError(error);
      
      return transformBranch(data);
    },
    onSuccess: () => {
      // Invalidate branches cache to refetch
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.branches.all(user?.tenantId || '') 
      });
    },
  });
}

/**
 * Update an existing branch
 */
export function useUpdateBranch() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Branch> }) => {
      if (!user?.tenantId) throw new Error('Not authenticated');
      
      const dbData = branchToDb(updates, user.tenantId);
      
      const { data, error } = await (supabase as any).from('branches')
        .update(dbData)
        .eq('id', id)
        .select()
        .single();
      
      if (error) handleSupabaseError(error);
      
      return transformBranch(data);
    },
    onSuccess: (data) => {
      // Invalidate both list and detail caches
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.branches.all(user?.tenantId || '') 
      });
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.branches.detail(data.id) 
      });
    },
  });
}

/**
 * Deactivate a branch (soft delete)
 */
export function useDeactivateBranch() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (branchId: string) => {
      if (!user?.tenantId) throw new Error('Not authenticated');
      
      const { data, error } = await (supabase as any).from('branches')
        .update({ 
          status: 'inactive',
        })
        .eq('id', branchId)
        .select()
        .single();
      
      if (error) handleSupabaseError(error);
      
      return transformBranch(data);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.branches.all(user?.tenantId || '') 
      });
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.branches.detail(data.id) 
      });
    },
  });
}

/**
 * Reactivate a deactivated branch
 */
export function useReactivateBranch() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (branchId: string) => {
      if (!user?.tenantId) throw new Error('Not authenticated');
      
      const { data, error } = await (supabase as any).from('branches')
        .update({ 
          status: 'active',
        })
        .eq('id', branchId)
        .select()
        .single();
      
      if (error) handleSupabaseError(error);
      
      return transformBranch(data);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.branches.all(user?.tenantId || '') 
      });
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.branches.detail(data.id) 
      });
    },
  });
}
