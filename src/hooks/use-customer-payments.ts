/**
 * Customer Payments React Query Hooks
 * 
 * Track payments from customers for credit orders
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/auth-context";
import { queryKeys } from "@/lib/query-keys";
import { transformCustomerPayment, type CustomerPaymentMigrationRow } from "@/lib/type-adapters";
import { callRpc, type PlannedRpcs } from "@/lib/rpc";
import { handleSupabaseError } from "@/lib/supabase-helpers";
import type { CustomerPayment } from "@/data/mock-db";

/**
 * Fetch all customer payments for tenant (balances, ledgers, payment chain)
 */
export function useAllCustomerPayments() {
  const { user } = useAuth();

  return useQuery({
    queryKey: queryKeys.customerPayments.all(user?.tenantId || ''),
    queryFn: async (): Promise<CustomerPayment[]> => {
      if (!user?.tenantId) throw new Error('Not authenticated');

      const { data, error } = await (supabase as any).from('customer_payments')
        .select('*')
        .eq('tenant_id', user.tenantId)
        .order('submitted_at', { ascending: false });

      if (error) handleSupabaseError(error);

      return (data || []).map(transformCustomerPayment);
    },
    enabled: !!user?.tenantId,
  });
}

/**
 * Fetch customer payments by customer
 */
export function useCustomerPayments(customerId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.customers.payments(customerId || ''),
    queryFn: async (): Promise<CustomerPayment[]> => {
      if (!customerId) throw new Error('Customer ID required');
      
      const { data, error } = await (supabase as any).from('customer_payments')
        .select('*')
        .eq('customer_id', customerId)
        .order('payment_date', { ascending: false });
      
      if (error) handleSupabaseError(error);
      
      return (data || []).map(transformCustomerPayment);
    },
    enabled: !!customerId,
  });
}

/** Each payment chain step changes payments, balances, notifications and the audit log. */
function useCustomerPaymentMutation<N extends "record_customer_payment" | "acknowledge_customer_payment" | "confirm_customer_payment" | "decline_customer_payment">(name: N) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (args: PlannedRpcs[N]): Promise<CustomerPayment> => {
      const row = await callRpc(name, args);
      return transformCustomerPayment(row as CustomerPaymentMigrationRow);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.customerPayments.root() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.customers.root() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.root() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.activities.all(user?.tenantId ?? "") });
    },
  });
}

/** Step 1: sales rep records a payment (RPC record_customer_payment). */
export const useRecordCustomerPayment = () => useCustomerPaymentMutation("record_customer_payment");
/** Step 2: manager acknowledges (RPC acknowledge_customer_payment). */
export const useAcknowledgeCustomerPayment = () => useCustomerPaymentMutation("acknowledge_customer_payment");
/** Step 3: owner confirms (RPC confirm_customer_payment). */
export const useConfirmCustomerPayment = () => useCustomerPaymentMutation("confirm_customer_payment");
/** Manager (while submitted) or owner declines (RPC decline_customer_payment). */
export const useDeclineCustomerPayment = () => useCustomerPaymentMutation("decline_customer_payment");
