/**
 * Payments React Query Hooks
 * 
 * Rep payment chain: submitted → acknowledged (manager) → confirmed (owner)
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/auth-context";
import { queryKeys } from "@/lib/query-keys";
import { transformPayment, paymentToDb } from "@/lib/type-adapters";
import { handleSupabaseError } from "@/lib/supabase-helpers";
import type { Payment } from "@/data/mock-db";

/**
 * Fetch all payments for tenant
 */
export function usePayments() {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: queryKeys.payments.all(user?.tenantId || ''),
    queryFn: async () => {
      if (!user?.tenantId) throw new Error('Not authenticated');
      
      const { data, error } = await supabase
        .from('payments')
        .select('*')
        .eq('tenant_id', user.tenantId)
        .order('submitted_at', { ascending: false });
      
      if (error) handleSupabaseError(error);
      
      return (data || []).map(transformPayment);
    },
    enabled: !!user?.tenantId,
  });
}

/**
 * Fetch payments by sales rep
 */
export function usePaymentsByRep(repId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.payments.byRep(repId || ''),
    queryFn: async () => {
      if (!repId) throw new Error('Rep ID required');
      
      const { data, error } = await supabase
        .from('payments')
        .select('*')
        .eq('sales_rep_id', repId)
        .order('submitted_at', { ascending: false });
      
      if (error) handleSupabaseError(error);
      
      return (data || []).map(transformPayment);
    },
    enabled: !!repId,
  });
}

/**
 * Fetch payments by period
 */
export function usePaymentsByPeriod(period: string) {
  return useQuery({
    queryKey: queryKeys.payments.byPeriod(period),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payments')
        .select('*')
        .eq('period', period)
        .order('submitted_at', { ascending: false });
      
      if (error) handleSupabaseError(error);
      
      return (data || []).map(transformPayment);
    },
    enabled: !!period,
  });
}

/**
 * Fetch pending payments (for manager/owner review)
 */
export function usePendingPayments() {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: queryKeys.payments.pending(user?.tenantId || ''),
    queryFn: async () => {
      if (!user?.tenantId) throw new Error('Not authenticated');
      
      const { data, error } = await supabase
        .from('payments')
        .select('*')
        .eq('tenant_id', user.tenantId)
        .in('status', ['submitted', 'acknowledged'])
        .order('submitted_at', { ascending: true });
      
      if (error) handleSupabaseError(error);
      
      return (data || []).map(transformPayment);
    },
    enabled: !!user?.tenantId,
  });
}

/**
 * Submit payment (rep action)
 */
export function useSubmitPayment() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (input: Partial<Payment>) => {
      if (!user?.tenantId) throw new Error('Not authenticated');
      
      const dbData = paymentToDb(input, user.tenantId);
      
      const { data, error } = await supabase
        .from('payments')
        .insert(dbData)
        .select()
        .single();
      
      if (error) handleSupabaseError(error);
      
      return transformPayment(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.payments.all(user?.tenantId || '') 
      });
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.payments.pending(user?.tenantId || '') 
      });
    },
  });
}

/**
 * Update payment status (acknowledge, confirm, decline)
 */
export function useUpdatePayment() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Payment> }) => {
      if (!user?.tenantId) throw new Error('Not authenticated');
      
      const dbData = paymentToDb(updates, user.tenantId);
      
      const { data, error } = await supabase
        .from('payments')
        .update(dbData)
        .eq('id', id)
        .select()
        .single();
      
      if (error) handleSupabaseError(error);
      
      return transformPayment(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.payments.all(user?.tenantId || '') 
      });
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.payments.pending(user?.tenantId || '') 
      });
    },
  });
}
