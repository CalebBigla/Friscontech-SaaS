/**
 * React Query hooks for manager and owner remittances
 * 
 * Manager remittances: branch manager submission with owner review
 * Owner remittances: owner-level payments to external parties
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { queryKeys } from '@/lib/query-keys';
import { handleSupabaseError } from '@/lib/supabase-helpers';
import type { Database } from '@/types/database.types';
import {
  transformManagerRemittance,
  transformOwnerRemittance,
  type ManagerRemittanceMigrationRow,
  type OwnerRemittanceMigrationRow,
} from '@/lib/type-adapters';

type ManagerRemittanceRow = Database['public']['Tables']['manager_remittances']['Row'];
type ManagerRemittanceInsert = Database['public']['Tables']['manager_remittances']['Insert'];
type ManagerRemittanceUpdate = Database['public']['Tables']['manager_remittances']['Update'];

type OwnerRemittanceRow = Database['public']['Tables']['owner_remittances']['Row'];
type OwnerRemittanceInsert = Database['public']['Tables']['owner_remittances']['Insert'];
type OwnerRemittanceUpdate = Database['public']['Tables']['owner_remittances']['Update'];

// ======================
// MANAGER REMITTANCES
// ======================

interface ManagerRemittanceFilters {
  branchId?: string;
  managerId?: string;
  period?: string;
  status?: 'draft' | 'submitted' | 'confirmed' | 'declined';
}

/**
 * Fetch all manager remittances for a tenant with optional filters
 */
export function useManagerRemittances(
  tenantId: string,
  filters: ManagerRemittanceFilters = {}
) {
  return useQuery({
    queryKey: queryKeys.remittances.manager.list(tenantId, filters),
    queryFn: async () => {
      let query = (supabase as any)
        .from('manager_remittances')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });

      if (filters.branchId) {
        query = query.eq('branch_id', filters.branchId);
      }
      if (filters.managerId) {
        query = query.eq('manager_id', filters.managerId);
      }
      if (filters.period) {
        query = query.eq('period', filters.period);
      }
      if (filters.status) {
        query = query.eq('status', filters.status);
      }

      const { data, error } = await query;
      if (error) throw handleSupabaseError(error);
      return ((data ?? []) as ManagerRemittanceMigrationRow[]).map(transformManagerRemittance);
    },
    enabled: !!tenantId,
  });
}

/**
 * Fetch a single manager remittance by ID
 */
export function useManagerRemittance(id: string) {
  return useQuery({
    queryKey: queryKeys.remittances.manager.detail(id),
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('manager_remittances')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw handleSupabaseError(error);
      return transformManagerRemittance(data as ManagerRemittanceMigrationRow);
    },
    enabled: !!id,
  });
}

/**
 * Submit a new manager remittance
 */
export function useSubmitManagerRemittance() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: ManagerRemittanceInsert) => {
      const { data, error } = await (supabase as any).from('manager_remittances')
        .insert(input)
        .select()
        .single();

      if (error) throw handleSupabaseError(error);
      return data as ManagerRemittanceRow;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.remittances.manager.all(data.tenant_id),
      });
    },
  });
}

/**
 * Approve a manager remittance (owner action)
 */
export function useApproveManagerRemittance() {
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
      
      const { data, error } = await (supabase as any).from('manager_remittances')
        .update({
          status: 'approved',
          reviewed_by: reviewerId,
          reviewed_at: now,
          reject_reason: null,
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw handleSupabaseError(error);
      return data as ManagerRemittanceRow;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.remittances.manager.all(data.tenant_id),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.remittances.manager.detail(data.id),
      });
    },
  });
}

/**
 * Reject a manager remittance (owner action)
 */
export function useRejectManagerRemittance() {
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
      
      const { data, error } = await (supabase as any).from('manager_remittances')
        .update({
          status: 'rejected',
          reviewed_by: reviewerId,
          reviewed_at: now,
          reject_reason: reason,
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw handleSupabaseError(error);
      return data as ManagerRemittanceRow;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.remittances.manager.all(data.tenant_id),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.remittances.manager.detail(data.id),
      });
    },
  });
}

// ======================
// OWNER REMITTANCES
// ======================

interface OwnerRemittanceFilters {
  payeeType?: 'supplier' | 'landlord' | 'utility' | 'contractor' | 'other';
  paymentMethod?: 'cash' | 'transfer' | 'cheque';
  startDate?: string;
  endDate?: string;
}

/**
 * Fetch all owner remittances for a tenant with optional filters
 */
export function useOwnerRemittances(
  tenantId: string,
  filters: OwnerRemittanceFilters = {}
) {
  return useQuery({
    queryKey: queryKeys.remittances.owner.list(tenantId, filters),
    queryFn: async () => {
      let query = (supabase as any)
        .from('owner_remittances')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('remittance_date', { ascending: false });

      if (filters.payeeType) {
        query = query.eq('payee_type', filters.payeeType);
      }
      if (filters.paymentMethod) {
        query = query.eq('payment_method', filters.paymentMethod);
      }
      if (filters.startDate) {
        query = query.gte('remittance_date', filters.startDate);
      }
      if (filters.endDate) {
        query = query.lte('remittance_date', filters.endDate);
      }

      const { data, error } = await query;
      if (error) throw handleSupabaseError(error);
      return ((data ?? []) as OwnerRemittanceMigrationRow[]).map(transformOwnerRemittance);
    },
    enabled: !!tenantId,
  });
}

/**
 * Fetch a single owner remittance by ID
 */
export function useOwnerRemittance(id: string) {
  return useQuery({
    queryKey: queryKeys.remittances.owner.detail(id),
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('owner_remittances')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw handleSupabaseError(error);
      return transformOwnerRemittance(data as OwnerRemittanceMigrationRow);
    },
    enabled: !!id,
  });
}

/**
 * Create a new owner remittance
 */
export function useCreateOwnerRemittance() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: OwnerRemittanceInsert) => {
      const { data, error } = await (supabase as any).from('owner_remittances')
        .insert(input)
        .select()
        .single();

      if (error) throw handleSupabaseError(error);
      return data as OwnerRemittanceRow;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.remittances.owner.all(data.tenant_id),
      });
    },
  });
}

/**
 * Update an existing owner remittance
 */
export function useUpdateOwnerRemittance() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: OwnerRemittanceUpdate;
    }) => {
      const { data, error } = await (supabase as any).from('owner_remittances')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw handleSupabaseError(error);
      return data as OwnerRemittanceRow;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.remittances.owner.all(data.tenant_id),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.remittances.owner.detail(data.id),
      });
    },
  });
}

/**
 * Delete an owner remittance
 */
export function useDeleteOwnerRemittance() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from('owner_remittances')
        .delete()
        .eq('id', id);

      if (error) throw handleSupabaseError(error);
      return { id };
    },
    onSuccess: (_, id) => {
      // Invalidate all owner remittances queries since we don't have tenantId here
      queryClient.invalidateQueries({
        queryKey: ["remittances", "owner"],
      });
    },
  });
}
