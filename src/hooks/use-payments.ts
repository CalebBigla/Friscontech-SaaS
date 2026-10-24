/**
 * Payments React Query Hooks
 * 
 * Rep payment chain: submitted → acknowledged (manager) → confirmed (owner)
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/auth-context";
import { queryKeys } from "@/lib/query-keys";
import { transformPayment, type PaymentMigrationRow } from "@/lib/type-adapters";
import { callRpc, type PlannedRpcs } from "@/lib/rpc";
import { handleSupabaseError } from "@/lib/supabase-helpers";
import type { Payment } from "@/data/mock-db";

/**
 * Fetch all payments for tenant
 */
export function usePayments() {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: queryKeys.payments.all(user?.tenantId || ''),
    queryFn: async (): Promise<Payment[]> => {
      if (!user?.tenantId) throw new Error('Not authenticated');
      
      const { data, error } = await supabase.from('payments')
        .select('*')
        .eq('tenant_id', user.tenantId)
        .order('submitted_at', { ascending: false });
      
      if (error) handleSupabaseError(error);
      
      return (data || []).map((row) => transformPayment(row as Parameters<typeof transformPayment>[0]));
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
      
      const { data, error } = await supabase.from('payments')
        .select('*')
        .eq('sales_rep_id', repId)
        .order('submitted_at', { ascending: false });
      
      if (error) handleSupabaseError(error);
      
      return (data || []).map((row) => transformPayment(row as Parameters<typeof transformPayment>[0]));
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
      const { data, error } = await supabase.from('payments')
        .select('*')
        .eq('period', period)
        .order('submitted_at', { ascending: false });
      
      if (error) handleSupabaseError(error);
      
      return (data || []).map((row) => transformPayment(row as Parameters<typeof transformPayment>[0]));
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
      
      const { data, error } = await supabase.from('payments')
        .select('*')
        .eq('tenant_id', user.tenantId)
        .in('status', ['submitted', 'acknowledged'])
        .order('submitted_at', { ascending: true });
      
      if (error) handleSupabaseError(error);
      
      return (data || []).map((row) => transformPayment(row as Parameters<typeof transformPayment>[0]));
    },
    enabled: !!user?.tenantId,
  });
}

/** Each payment chain step changes payments, balances, remittances, notifications and the audit log. */
function usePaymentMutation<N extends "submit_payment" | "acknowledge_payment" | "confirm_payment" | "decline_payment">(name: N) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (args: PlannedRpcs[N]): Promise<Payment> => {
      const row = await callRpc(name, args);
      return transformPayment(row as PaymentMigrationRow);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.payments.root() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.remittances.manager.all(user?.tenantId ?? "") });
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.root() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.activities.all(user?.tenantId ?? "") });
    },
  });
}

/** Step 1: sales rep submits a collection (RPC submit_payment). */
export const useSubmitPayment = () => usePaymentMutation("submit_payment");
/** Step 2: branch manager acknowledges (RPC acknowledge_payment). */
export const useAcknowledgePayment = () => usePaymentMutation("acknowledge_payment");
/** Step 3: owner confirms (RPC confirm_payment). */
export const useConfirmPayment = () => usePaymentMutation("confirm_payment");
/** Manager or owner declines (RPC decline_payment). */
export const useDeclinePayment = () => usePaymentMutation("decline_payment");
