/**
 * React Query hooks for staff onboarding
 * 
 * Manages new staff member onboarding process with token-based public links.
 * Includes guarantor verification and document uploads (future Cloudinary).
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { queryKeys } from '@/lib/query-keys';
import { handleSupabaseError } from '@/lib/supabase-helpers';
import type { Database } from '@/types/database.types';

type OnboardingRow = Database['public']['Tables']['onboardings']['Row'];
type OnboardingInsert = Database['public']['Tables']['onboardings']['Insert'];
type OnboardingUpdate = Database['public']['Tables']['onboardings']['Update'];

type OnboardingFileRow = Database['public']['Tables']['onboarding_files']['Row'];
type OnboardingFileInsert = Database['public']['Tables']['onboarding_files']['Insert'];

interface OnboardingFilters {
  branchId?: string;
  role?: 'manager' | 'storekeeper' | 'sales_rep';
  completed?: boolean;
  expired?: boolean;
}

/**
 * Fetch all onboarding records for a tenant with optional filters
 */
export function useOnboardings(
  tenantId: string,
  filters: OnboardingFilters = {}
) {
  return useQuery({
    queryKey: queryKeys.onboardings.list(tenantId, filters),
    queryFn: async () => {
      let query = supabase
        .from('onboardings')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });

      if (filters.branchId) {
        query = query.eq('branch_id', filters.branchId);
      }
      if (filters.role) {
        query = query.eq('role', filters.role);
      }
      if (filters.completed !== undefined) {
        query = query.eq('completed', filters.completed);
      }
      if (filters.expired !== undefined) {
        const now = new Date().toISOString();
        if (filters.expired) {
          query = query.lt('expires_at', now);
        } else {
          query = query.gte('expires_at', now);
        }
      }

      const { data, error } = await query;
      if (error) throw handleSupabaseError(error);
      return data as OnboardingRow[];
    },
    enabled: !!tenantId,
  });
}

/**
 * Fetch a single onboarding record by ID
 */
export function useOnboarding(id: string) {
  return useQuery({
    queryKey: queryKeys.onboardings.detail(id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('onboardings')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw handleSupabaseError(error);
      return data as OnboardingRow;
    },
    enabled: !!id,
  });
}

/**
 * Fetch onboarding by token (for public onboarding pages)
 */
export function useOnboardingByToken(token: string) {
  return useQuery({
    queryKey: queryKeys.onboardings.byToken(token),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('onboardings')
        .select('*')
        .eq('token', token)
        .single();

      if (error) throw handleSupabaseError(error);
      return data as OnboardingRow;
    },
    enabled: !!token,
  });
}

/**
 * Fetch pending (incomplete, non-expired) onboardings
 */
export function usePendingOnboardings(tenantId: string) {
  return useQuery({
    queryKey: queryKeys.onboardings.pending(tenantId),
    queryFn: async () => {
      const now = new Date().toISOString();
      
      const { data, error } = await supabase
        .from('onboardings')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('completed', false)
        .gte('expires_at', now)
        .order('created_at', { ascending: true });

      if (error) throw handleSupabaseError(error);
      return data as OnboardingRow[];
    },
    enabled: !!tenantId,
  });
}

/**
 * Create a new onboarding record
 */
export function useCreateOnboarding() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: OnboardingInsert) => {
      const { data, error } = await supabase
        .from('onboardings')
        .insert(input)
        .select()
        .single();

      if (error) throw handleSupabaseError(error);
      return data as OnboardingRow;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.onboardings.all(data.tenant_id),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.onboardings.pending(data.tenant_id),
      });
    },
  });
}

/**
 * Complete an onboarding (mark as complete)
 */
export function useCompleteOnboarding() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const now = new Date().toISOString();
      
      const { data, error } = await supabase
        .from('onboardings')
        .update({
          completed: true,
          completed_at: now,
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw handleSupabaseError(error);
      return data as OnboardingRow;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.onboardings.all(data.tenant_id),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.onboardings.detail(data.id),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.onboardings.pending(data.tenant_id),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.onboardings.byToken(data.token),
      });
    },
  });
}

/**
 * Update an onboarding record (e.g., extend expiry)
 */
export function useUpdateOnboarding() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: OnboardingUpdate;
    }) => {
      const { data, error } = await supabase
        .from('onboardings')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw handleSupabaseError(error);
      return data as OnboardingRow;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.onboardings.all(data.tenant_id),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.onboardings.detail(data.id),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.onboardings.byToken(data.token),
      });
    },
  });
}

/**
 * Delete an onboarding record
 */
export function useDeleteOnboarding() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('onboardings')
        .delete()
        .eq('id', id);

      if (error) throw handleSupabaseError(error);
      return { id };
    },
    onSuccess: () => {
      // Invalidate all onboarding queries since we don't have tenantId here
      queryClient.invalidateQueries({
        queryKey: queryKeys.onboardings.all,
      });
    },
  });
}

// ======================
// ONBOARDING FILES
// ======================

/**
 * Fetch files for a specific onboarding
 */
export function useOnboardingFiles(onboardingId: string) {
  return useQuery({
    queryKey: queryKeys.onboardings.files(onboardingId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('onboarding_files')
        .select('*')
        .eq('onboarding_id', onboardingId)
        .order('uploaded_at', { ascending: true });

      if (error) throw handleSupabaseError(error);
      return data as OnboardingFileRow[];
    },
    enabled: !!onboardingId,
  });
}

/**
 * Add a file to an onboarding record
 */
export function useAddOnboardingFile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: OnboardingFileInsert) => {
      const { data, error } = await supabase
        .from('onboarding_files')
        .insert(input)
        .select()
        .single();

      if (error) throw handleSupabaseError(error);
      return data as OnboardingFileRow;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.onboardings.files(data.onboarding_id),
      });
    },
  });
}

/**
 * Bulk add files to an onboarding record
 */
export function useBulkAddOnboardingFiles() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (inputs: OnboardingFileInsert[]) => {
      const { data, error } = await supabase
        .from('onboarding_files')
        .insert(inputs)
        .select();

      if (error) throw handleSupabaseError(error);
      return data as OnboardingFileRow[];
    },
    onSuccess: (data) => {
      if (data.length > 0) {
        const onboardingId = data[0].onboarding_id;
        queryClient.invalidateQueries({
          queryKey: queryKeys.onboardings.files(onboardingId),
        });
      }
    },
  });
}

/**
 * Delete an onboarding file
 */
export function useDeleteOnboardingFile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('onboarding_files')
        .delete()
        .eq('id', id);

      if (error) throw handleSupabaseError(error);
      return { id };
    },
    onSuccess: () => {
      // Invalidate all onboarding files queries
      queryClient.invalidateQueries({
        queryKey: ['onboardings', 'files'],
      });
    },
  });
}
