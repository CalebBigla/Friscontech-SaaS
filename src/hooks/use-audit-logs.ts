/**
 * React Query hooks for audit logs (activities)
 *
 * Complete audit trail of all system actions with role-based scoping.
 * Owner sees everything, managers/storekeepers see branch-scoped, reps see their own.
 *
 * Read-only by design: audit rows are written server-side by RPCs and triggers
 * (create_audit_log, auto_audit_sale), never inserted directly from the browser.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { queryKeys } from '@/lib/query-keys';
import { handleSupabaseError } from '@/lib/supabase-helpers';
import { transformActivity } from '@/lib/type-adapters';
import type { Database } from '@/types/database.types';
import type { Activity, AuditEntity } from '@/data/mock-db';

type ActivityRow = Database['public']['Tables']['activities']['Row'];

/** Most recent rows loaded for the audit log and dashboards. */
export const AUDIT_LOG_LIMIT = 1000;

interface AuditFilters {
  userId?: string;
  action?: string;
  entity?: AuditEntity;
  entityId?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
}

const toActivities = (data: unknown): Activity[] =>
  ((data ?? []) as ActivityRow[]).map((row) => transformActivity(row as Parameters<typeof transformActivity>[0]));

/**
 * Fetch audit logs for a tenant with optional filters
 */
export function useAuditLogs(tenantId: string, filters: AuditFilters = {}, enabled = true) {
  return useQuery({
    queryKey: queryKeys.activities.list(tenantId, filters),
    queryFn: async () => {
      let query = supabase
        .from('activities')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(filters.limit ?? AUDIT_LOG_LIMIT);

      if (filters.userId) query = query.eq('actor_id', filters.userId);
      if (filters.action) query = query.eq('action', filters.action);
      if (filters.entity) query = query.eq('entity', filters.entity);
      if (filters.entityId) query = query.eq('entity_id', filters.entityId);
      if (filters.startDate) query = query.gte('created_at', filters.startDate);
      if (filters.endDate) query = query.lte('created_at', filters.endDate);

      const { data, error } = await query;
      if (error) throw handleSupabaseError(error);
      return toActivities(data);
    },
    enabled: enabled && !!tenantId,
  });
}

/**
 * Fetch audit logs for a specific user (their actions)
 */
export function useUserAuditLogs(userId: string, limit: number = 50) {
  return useQuery({
    queryKey: queryKeys.activities.byUser(userId, limit),
    queryFn: async () => {
      const { data, error } = await supabase.from('activities')
        .select('*')
        .eq('actor_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw handleSupabaseError(error);
      return toActivities(data);
    },
    enabled: !!userId,
  });
}

/**
 * Fetch audit logs for a specific entity (entity's history)
 */
export function useEntityAuditLogs(entity: AuditEntity, entityId: string) {
  return useQuery({
    queryKey: queryKeys.activities.byEntity(entity, entityId),
    queryFn: async () => {
      const { data, error } = await supabase.from('activities')
        .select('*')
        .eq('entity', entity)
        .eq('entity_id', entityId)
        .order('created_at', { ascending: false });

      if (error) throw handleSupabaseError(error);
      return toActivities(data);
    },
    enabled: !!entity && !!entityId,
  });
}

/**
 * Fetch recent audit logs (latest N entries)
 */
export function useRecentAuditLogs(tenantId: string, limit: number = 20) {
  return useQuery({
    queryKey: queryKeys.activities.recent(tenantId, limit),
    queryFn: async () => {
      const { data, error } = await supabase.from('activities')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw handleSupabaseError(error);
      return toActivities(data);
    },
    enabled: !!tenantId,
  });
}
