/**
 * Customer Payments React Query Hooks
 * 
 * Track payments from customers for credit orders
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/auth-context";
import { queryKeys } from "@/lib/query-keys";
import { transformCustomerPayment, customerPaymentToDb } from "@/lib/type-adapters";
import { handleSupabaseError } from "@/lib/supabase-helpers";
import type { CustomerPayment } from "@/data/mock-db";

/**
 * Fetch customer payments by customer
 */
export function useCustomerPayments(customerId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.customers.payments(customerId || ''),
    queryFn: async () => {
      if (!customerId) throw new Error('Customer ID required');
      
      const { data, error } = await supabase
        .from('customer_payments')
        .select('*')
        .eq('customer_id', customerId)
        .order('payment_date', { ascending: false });
      
      if (error) handleSupabaseError(error);
      
      return (data || []).map(transformCustomerPayment);
    },
    enabled: !!customerId,
  });
}

/**
 * Create a customer payment
 */
export function useCreateCustomerPayment() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (input: Partial<CustomerPayment>) => {
      if (!user?.tenantId) throw new Error('Not authenticated');
      
      const dbData = customerPaymentToDb(input, user.tenantId);
      
      const { data, error } = await supabase
        .from('customer_payments')
        .insert(dbData)
        .select()
        .single();
      
      if (error) handleSupabaseError(error);
      
      return transformCustomerPayment(data);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.customers.payments(data.customerId) 
      });
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.customers.detail(data.customerId) 
      });
    },
  });
}
