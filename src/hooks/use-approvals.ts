/**
 * React Query hooks for approval requests
 * 
 * Approval workflow for product deactivation, stock additions, and team member changes.
 * Managers request, owner approves/rejects.
 */

import { useQuery, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/auth-context';
import { invalidateStock } from '@/hooks/use-inventory';
import { callRpc, type PlannedRpcs } from '@/lib/rpc';
import { supabase } from '@/lib/supabase';
import { queryKeys } from '@/lib/query-keys';
import { handleSupabaseError } from '@/lib/supabase-helpers';
import type { Database } from '@/types/database.types';
import { transformApprovalRequest, type ApprovalRequestMigrationRow } from '@/lib/type-adapters';
import type { ApprovalRequest } from '@/data/mock-db';

type ApprovalRequestRow = Database['public']['Tables']['approval_requests']['Row'];

type ApprovalRequestType = 'product_deactivation' | 'stock_addition' | 'team_member';
type ApprovalStatus = 'pending' | 'approved' | 'rejected';

interface ApprovalFilters {
  branchId?: string;
  requesterId?: string;
  requestType?: ApprovalRequestType;
  status?: ApprovalStatus;
}

/**
 * Fetch all approval requests for a tenant with optional filters
 */
export function useApprovalRequests(
  tenantId: string,
  filters: ApprovalFilters = {}
) {
  return useQuery({
    queryKey: queryKeys.approvals.list(tenantId, filters),
    queryFn: async (): Promise<ApprovalRequest[]> => {
      let query = supabase
        .from('approval_requests')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });

      if (filters.branchId) {
        query = query.eq('branch_id', filters.branchId);
      }
      if (filters.requesterId) {
        query = query.eq('requested_by', filters.requesterId);
      }
      if (filters.requestType) {
        query = query.eq('type', filters.requestType);
      }
      if (filters.status) {
        query = query.eq('status', filters.status);
      }

      const { data, error } = await query;
      if (error) throw handleSupabaseError(error);
      return (data ?? []).map((row: unknown) => transformApprovalRequest(row as ApprovalRequestMigrationRow));
    },
    enabled: !!tenantId,
  });
}

/**
 * Fetch pending approval requests only
 */
export function usePendingApprovals(tenantId: string, branchId?: string) {
  return useQuery({
    queryKey: queryKeys.approvals.pending(tenantId, branchId),
    queryFn: async (): Promise<ApprovalRequest[]> => {
      let query = supabase
        .from('approval_requests')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('status', 'pending')
        .order('created_at', { ascending: true });

      if (branchId) {
        query = query.eq('branch_id', branchId);
      }

      const { data, error } = await query;
      if (error) throw handleSupabaseError(error);
      return (data ?? []).map((row: unknown) => transformApprovalRequest(row as ApprovalRequestMigrationRow));
    },
    enabled: !!tenantId,
  });
}

/**
 * Fetch a single approval request by ID
 */
export function useApprovalRequest(id: string) {
  return useQuery({
    queryKey: queryKeys.approvals.detail(id),
    queryFn: async (): Promise<ApprovalRequest> => {
      const { data, error } = await (supabase as any).from('approval_requests')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw handleSupabaseError(error);
      return transformApprovalRequest(data as ApprovalRequestMigrationRow);
    },
    enabled: !!id,
  });
}

/** Approving applies stock or deactivates products, so it touches more than approvals. */
function invalidateApprovals(queryClient: QueryClient, tenantId: string) {
  void queryClient.invalidateQueries({ queryKey: queryKeys.approvals.all(tenantId) });
  void queryClient.invalidateQueries({ queryKey: queryKeys.products.all(tenantId) });
  invalidateStock(queryClient, tenantId);
}

/** Approve one or more pending requests, all or nothing (RPC approve_requests). */
export function useApproveRequests() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (args: PlannedRpcs['approve_requests']): Promise<ApprovalRequest[]> => {
      const rows = await callRpc('approve_requests', args);
      return ((rows ?? []) as ApprovalRequestMigrationRow[]).map(transformApprovalRequest);
    },
    onSuccess: () => invalidateApprovals(queryClient, user?.tenantId ?? ''),
  });
}

/** Reject a pending request with a reason (RPC reject_request). */
export function useRejectRequest() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (args: PlannedRpcs['reject_request']): Promise<ApprovalRequest> => {
      const row = await callRpc('reject_request', args);
      return transformApprovalRequest(row as ApprovalRequestMigrationRow);
    },
    onSuccess: () => invalidateApprovals(queryClient, user?.tenantId ?? ''),
  });
}
