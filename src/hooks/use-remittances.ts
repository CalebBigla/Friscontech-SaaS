/**
 * React Query hooks for manager and owner remittances
 * 
 * Manager remittances: branch manager submission with owner review
 * Owner remittances: owner-level payments to external parties
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/auth-context';
import { callRpc, type PlannedRpcs } from '@/lib/rpc';
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
      let query = supabase
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
      return ((data ?? []) as ManagerRemittanceMigrationRow[]).map((row) => transformManagerRemittance(row as Parameters<typeof transformManagerRemittance>[0]));
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
      const { data, error } = await supabase.from('manager_remittances')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw handleSupabaseError(error);
      return transformManagerRemittance(data as ManagerRemittanceMigrationRow);
    },
    enabled: !!id,
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
      let query = supabase
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
      return ((data ?? []) as OwnerRemittanceMigrationRow[]).map((row) => transformOwnerRemittance(row as Parameters<typeof transformOwnerRemittance>[0]));
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
      const { data, error } = await supabase.from('owner_remittances')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw handleSupabaseError(error);
      return transformOwnerRemittance(data as OwnerRemittanceMigrationRow);
    },
    enabled: !!id,
  });
}

// ======================
// WRITES (planned RPCs)
// ======================

/** Remittance steps change remittances, payment/expense views and the audit log. */
function useRemittanceMutation<R, N extends keyof PlannedRpcs>(name: N, transform: (row: unknown) => R) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (args: PlannedRpcs[N]): Promise<R> => transform(await callRpc(name, args)),
    onSuccess: () => {
      const tenantId = user?.tenantId ?? '';
      void queryClient.invalidateQueries({ queryKey: queryKeys.remittances.manager.all(tenantId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.remittances.owner.all(tenantId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.payments.root() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.expenses.root() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.activities.all(tenantId) });
    },
  });
}

const toManager = (row: unknown) => transformManagerRemittance(row as ManagerRemittanceMigrationRow);

/** Branch manager remits a month (RPC submit_manager_remittance). */
export const useSubmitManagerRemittance = () => useRemittanceMutation('submit_manager_remittance', toManager);
/** Owner confirms (RPC confirm_manager_remittance). */
export const useConfirmManagerRemittance = () => useRemittanceMutation('confirm_manager_remittance', toManager);
/** Owner declines (RPC decline_manager_remittance). */
export const useDeclineManagerRemittance = () => useRemittanceMutation('decline_manager_remittance', toManager);
/** Owner records an external payment (RPC create_owner_remittance). */
export const useCreateOwnerRemittance = () =>
  useRemittanceMutation('create_owner_remittance', (row) => transformOwnerRemittance(row as OwnerRemittanceMigrationRow));
