/**
 * React Query hooks for audit logs (activities)
 * 
 * Complete audit trail of all system actions with role-based scoping.
 * Owner sees everything, managers/storekeepers see branch-scoped, reps see their own.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { queryKeys } from '@/lib/query-keys';
import { handleSupabaseError } from '@/lib/supabase-helpers';
import type { Database } from '@/types/database.types';

type ActivityRow = Database['public']['Tables']['activities']['Row'];
type ActivityInsert = Database['public']['Tables']['activities']['Insert'];

interface AuditFilters {
  userId?: string;
  actionType?: string;
  entityType?: string;
  entityId?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
}

/**
 * Fetch audit logs for a tenant with optional filters
 */
export function useAuditLogs(tenantId: string, filters: AuditFilters = {}) {
  return useQuery({
    queryKey: queryKeys.activities.list(tenantId, filters),
    queryFn: async () => {
      let query = supabase
        .from('activities')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });

      if (filters.userId) {
        query = query.eq('user_id', filters.userId);
      }
      if (filters.actionType) {
        query = query.eq('action_type', filters.actionType);
      }
      if (filters.entityType) {
        query = query.eq('entity_type', filters.entityType);
      }
      if (filters.entityId) {
        query = query.eq('entity_id', filters.entityId);
      }
      if (filters.startDate) {
        query = query.gte('created_at', filters.startDate);
      }
      if (filters.endDate) {
        query = query.lte('created_at', filters.endDate);
      }
      if (filters.limit) {
        query = query.limit(filters.limit);
      } else {
        query = query.limit(100); // Default limit to prevent large queries
      }

      const { data, error } = await query;
      if (error) throw handleSupabaseError(error);
      return data as ActivityRow[];
    },
    enabled: !!tenantId,
  });
}

/**
 * Fetch audit logs for a specific user (their actions)
 */
export function useUserAuditLogs(userId: string, limit: number = 50) {
  return useQuery({
    queryKey: queryKeys.activities.byUser(userId, limit),
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('activities')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw handleSupabaseError(error);
      return data as ActivityRow[];
    },
    enabled: !!userId,
  });
}

/**
 * Fetch audit logs for a specific entity (entity's history)
 */
export function useEntityAuditLogs(entityType: string, entityId: string) {
  return useQuery({
    queryKey: queryKeys.activities.byEntity(entityType, entityId),
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('activities')
        .select('*')
        .eq('entity_type', entityType)
        .eq('entity_id', entityId)
        .order('created_at', { ascending: false });

      if (error) throw handleSupabaseError(error);
      return data as ActivityRow[];
    },
    enabled: !!entityType && !!entityId,
  });
}

/**
 * Fetch a single audit log entry by ID
 */
export function useAuditLog(id: string) {
  return useQuery({
    queryKey: queryKeys.activities.detail(id),
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('activities')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw handleSupabaseError(error);
      return data as ActivityRow;
    },
    enabled: !!id,
  });
}

/**
 * Fetch recent audit logs (latest N entries)
 */
export function useRecentAuditLogs(tenantId: string, limit: number = 20) {
  return useQuery({
    queryKey: queryKeys.activities.recent(tenantId, limit),
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('activities')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw handleSupabaseError(error);
      return data as ActivityRow[];
    },
    enabled: !!tenantId,
  });
}

/**
 * Fetch audit logs by action type (e.g., all "SALE_CREATED" actions)
 */
export function useAuditLogsByAction(
  tenantId: string,
  actionType: string,
  limit: number = 50
) {
  return useQuery({
    queryKey: queryKeys.activities.byAction(tenantId, actionType, limit),
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('activities')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('action_type', actionType)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw handleSupabaseError(error);
      return data as ActivityRow[];
    },
    enabled: !!tenantId && !!actionType,
  });
}

/**
 * Create a new audit log entry
 * This is typically called automatically by services, not directly in UI
 */
export function useCreateAuditLog() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: ActivityInsert) => {
      const { data, error } = await (supabase as any).from('activities')
        .insert(input)
        .select()
        .single();

      if (error) throw handleSupabaseError(error);
      return data as ActivityRow;
    },
    onSuccess: (data) => {
      // Invalidate relevant queries
      queryClient.invalidateQueries({
        queryKey: queryKeys.activities.all(data.tenant_id),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.activities.byUser(data.user_id),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.activities.recent(data.tenant_id),
      });
      
      if (data.entity_type && data.entity_id) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.activities.byEntity(data.entity_type, data.entity_id),
        });
      }
    },
  });
}

/**
 * Bulk create audit log entries
 * Useful for batch operations that need multiple log entries
 */
export function useBulkCreateAuditLogs() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (inputs: ActivityInsert[]) => {
      const { data, error } = await (supabase as any).from('activities')
        .insert(inputs)
        .select();

      if (error) throw handleSupabaseError(error);
      return data as ActivityRow[];
    },
    onSuccess: (data) => {
      if (data && data.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const tenantId = (data[0] as ActivityRow).tenant_id;
        
        queryClient.invalidateQueries({
          queryKey: queryKeys.activities.all(tenantId),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.activities.recent(tenantId),
        });
        
        // Invalidate user-specific queries
        const uniqueUsers = [...new Set(data.map((a) => a.user_id))];
        uniqueUsers.forEach((userId) => {
          if (!userId) return;
          queryClient.invalidateQueries({
            queryKey: queryKeys.activities.byUser(userId),
          });
        });
      }
    },
  });
}
