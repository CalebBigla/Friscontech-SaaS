/**
 * React Query hooks for approval requests
 * 
 * Approval workflow for product deactivation, stock additions, and team member changes.
 * Managers request, owner approves/rejects.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { queryKeys } from '@/lib/query-keys';
import { handleSupabaseError } from '@/lib/supabase-helpers';
import type { Database } from '@/types/database.types';
import { transformApprovalRequest, type ApprovalRequestMigrationRow } from '@/lib/type-adapters';
import type { ApprovalRequest } from '@/data/mock-db';

type ApprovalRequestRow = Database['public']['Tables']['approval_requests']['Row'];
type ApprovalRequestInsert = Database['public']['Tables']['approval_requests']['Insert'];
type ApprovalRequestUpdate = Database['public']['Tables']['approval_requests']['Update'];

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

/**
 * Create a new approval request
 */
export function useCreateApprovalRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: ApprovalRequestInsert) => {
      const { data, error } = await (supabase as any).from('approval_requests')
        .insert(input)
        .select()
        .single();

      if (error) throw handleSupabaseError(error);
      return data as ApprovalRequestRow;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.approvals.all(data.tenant_id),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.approvals.pending(data.tenant_id),
      });
    },
  });
}

/**
 * Approve an approval request
 */
export function useApproveRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      reviewerId,
    }: {
      id: string;
      reviewerId: string;
    }) => {
      const now = new Date().toISOString();
      
      const { data, error } = await (supabase as any).from('approval_requests')
        .update({
          status: 'approved',
          reviewed_by: reviewerId,
          reviewed_at: now,
          rejection_reason: null,
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw handleSupabaseError(error);
      return data as ApprovalRequestRow;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.approvals.all(data.tenant_id),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.approvals.detail(data.id),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.approvals.pending(data.tenant_id),
      });
    },
  });
}

/**
 * Reject an approval request
 */
export function useRejectRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      reviewerId,
      reason,
    }: {
      id: string;
      reviewerId: string;
      reason: string;
    }) => {
      const now = new Date().toISOString();
      
      const { data, error } = await (supabase as any).from('approval_requests')
        .update({
          status: 'rejected',
          reviewed_by: reviewerId,
          reviewed_at: now,
          rejection_reason: reason,
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw handleSupabaseError(error);
      return data as ApprovalRequestRow;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.approvals.all(data.tenant_id),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.approvals.detail(data.id),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.approvals.pending(data.tenant_id),
      });
    },
  });
}

/**
 * Delete an approval request (if needed, e.g., if requester wants to cancel)
 */
export function useDeleteApprovalRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from('approval_requests')
        .delete()
        .eq('id', id);

      if (error) throw handleSupabaseError(error);
      return { id };
    },
    onSuccess: () => {
      // Invalidate all approval queries since we don't have tenantId here
      queryClient.invalidateQueries({
        queryKey: ["approvals"],
      });
    },
  });
}
