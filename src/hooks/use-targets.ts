/**
 * React Query hooks for sales targets
 * 
 * Targets can be set at branch, rep, or product levels for monthly goals.
 * Achievement is calculated from actual sales data.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { queryKeys } from '@/lib/query-keys';
import { handleSupabaseError } from '@/lib/supabase-helpers';
import type { Database } from '@/types/database.types';

type TargetRow = Database['public']['Tables']['targets']['Row'];
type TargetInsert = Database['public']['Tables']['targets']['Insert'];
type TargetUpdate = Database['public']['Tables']['targets']['Update'];

interface TargetFilters {
  branchId?: string;
  userId?: string;
  productId?: string;
  month?: string;
}

/**
 * Fetch all targets for a tenant with optional filters
 */
export function useTargets(tenantId: string, filters: TargetFilters = {}) {
  return useQuery({
    queryKey: queryKeys.targets.list(tenantId, filters),
    queryFn: async () => {
      let query = supabase
        .from('targets')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('month', { ascending: false })
        .order('created_at', { ascending: false });

      if (filters.branchId) {
        query = query.eq('branch_id', filters.branchId);
      }
      if (filters.userId) {
        query = query.eq('user_id', filters.userId);
      }
      if (filters.productId) {
        query = query.eq('product_id', filters.productId);
      }
      if (filters.month) {
        query = query.eq('month', filters.month);
      }

      const { data, error } = await query;
      if (error) throw handleSupabaseError(error);
      return data as TargetRow[];
    },
    enabled: !!tenantId,
  });
}

/**
 * Fetch a single target by ID
 */
export function useTarget(id: string) {
  return useQuery({
    queryKey: queryKeys.targets.detail(id),
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('targets')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw handleSupabaseError(error);
      return data as TargetRow;
    },
    enabled: !!id,
  });
}

/**
 * Fetch targets for a specific rep and month
 */
export function useRepTargets(userId: string, month: string) {
  return useQuery({
    queryKey: queryKeys.targets.byUser(userId, month),
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('targets')
        .select('*')
        .eq('user_id', userId)
        .eq('month', month)
        .order('created_at', { ascending: false });

      if (error) throw handleSupabaseError(error);
      return data as TargetRow[];
    },
    enabled: !!userId && !!month,
  });
}

/**
 * Fetch targets for a specific branch and month
 */
export function useBranchTargets(branchId: string, month: string) {
  return useQuery({
    queryKey: queryKeys.targets.byBranch(branchId, month),
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('targets')
        .select('*')
        .eq('branch_id', branchId)
        .eq('month', month)
        .order('created_at', { ascending: false });

      if (error) throw handleSupabaseError(error);
      return data as TargetRow[];
    },
    enabled: !!branchId && !!month,
  });
}

/**
 * Create a new target
 */
export function useCreateTarget() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: TargetInsert) => {
      const { data, error } = await (supabase as any).from('targets')
        .insert(input)
        .select()
        .single();

      if (error) throw handleSupabaseError(error);
      return data as TargetRow;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.targets.all(data.tenant_id),
      });
      if (data.user_id) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.targets.byUser(data.user_id, data.month),
        });
      }
      if (data.branch_id) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.targets.byBranch(data.branch_id, data.month),
        });
      }
    },
  });
}

/**
 * Bulk create targets (for setting multiple targets at once)
 */
export function useBulkCreateTargets() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (inputs: TargetInsert[]) => {
      const { data, error } = await (supabase as any).from('targets')
        .insert(inputs)
        .select();

      if (error) throw handleSupabaseError(error);
      return data as TargetRow[];
    },
    onSuccess: (data) => {
      if (data && data.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const tenantId = (data[0] as TargetRow).tenant_id;
        queryClient.invalidateQueries({
          queryKey: queryKeys.targets.all(tenantId),
        });
        
        // Invalidate specific queries for affected users/branches
        const uniqueUsers = [...new Set(data.map(t => t.user_id).filter(Boolean))];
        const uniqueBranches = [...new Set(data.map(t => t.branch_id).filter(Boolean))];
        
        uniqueUsers.forEach(userId => {
          if (userId) {
            queryClient.invalidateQueries({
              queryKey: queryKeys.targets.byUser(userId),
            });
          }
        });
        
        uniqueBranches.forEach(branchId => {
          if (branchId) {
            queryClient.invalidateQueries({
              queryKey: queryKeys.targets.byBranch(branchId),
            });
          }
        });
      }
    },
  });
}

/**
 * Update an existing target
 */
export function useUpdateTarget() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: TargetUpdate;
    }) => {
      const now = new Date().toISOString();
      
      const { data, error } = await (supabase as any).from('targets')
        .update({
          ...updates,
          updated_at: now,
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw handleSupabaseError(error);
      return data as TargetRow;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.targets.all(data.tenant_id),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.targets.detail(data.id),
      });
      if (data.user_id) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.targets.byUser(data.user_id, data.month),
        });
      }
      if (data.branch_id) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.targets.byBranch(data.branch_id, data.month),
        });
      }
    },
  });
}

/**
 * Delete a target
 */
export function useDeleteTarget() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from('targets')
        .delete()
        .eq('id', id);

      if (error) throw handleSupabaseError(error);
      return { id };
    },
    onSuccess: () => {
      // Invalidate all targets queries since we don't have tenantId here
      queryClient.invalidateQueries({
        queryKey: ["targets"],
      });
    },
  });
}
