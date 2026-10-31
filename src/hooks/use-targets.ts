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
import { useAuth } from '@/contexts/auth-context';
import type { Database } from '@/types/database.types';
import { transformTarget } from '@/lib/type-adapters';
import { callRpc, type PlannedRpcs } from '@/lib/rpc';
import type { Target } from '@/data/mock-db';

type TargetRow = Database['public']['Tables']['targets']['Row'];

interface TargetFilters {
  branchId?: string;
  userId?: string;
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
      if (filters.month) {
        query = query.eq('month', filters.month);
      }

      const { data, error } = await query;
      if (error) throw handleSupabaseError(error);
      return ((data ?? []) as TargetRow[]).map((row) => transformTarget(row as Parameters<typeof transformTarget>[0]));
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
      const { data, error } = await supabase.from('targets')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw handleSupabaseError(error);
      return transformTarget(data as TargetRow);
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
      const { data, error } = await supabase.from('targets')
        .select('*')
        .eq('user_id', userId)
        .eq('month', month)
        .order('created_at', { ascending: false });

      if (error) throw handleSupabaseError(error);
      return ((data ?? []) as TargetRow[]).map((row) => transformTarget(row as Parameters<typeof transformTarget>[0]));
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
      const { data, error } = await supabase.from('targets')
        .select('*')
        .eq('branch_id', branchId)
        .eq('month', month)
        .order('created_at', { ascending: false });

      if (error) throw handleSupabaseError(error);
      return ((data ?? []) as TargetRow[]).map((row) => transformTarget(row as Parameters<typeof transformTarget>[0]));
    },
    enabled: !!branchId && !!month,
  });
}

/** Target writes change targets, dashboards and the audit log. */
function useTargetMutation<N extends "create_target" | "create_branch_target" | "update_target_amount">(name: N) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (args: PlannedRpcs[N]): Promise<Target> => {
      const row = await callRpc(name, args);
      return transformTarget(row as TargetRow);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.targets.root() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.activities.all(user?.tenantId ?? '') });
    },
  });
}

/** Owner sets a rep target (RPC create_target). */
export const useCreateTarget = () => useTargetMutation('create_target');
/** Owner sets a branch target (RPC create_branch_target). */
export const useCreateBranchTarget = () => useTargetMutation('create_branch_target');
/** Owner edits a target amount (RPC update_target_amount). */
export const useUpdateTarget = () => useTargetMutation('update_target_amount');
