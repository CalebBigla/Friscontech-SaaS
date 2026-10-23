/**
 * Sales React Query Hooks
 * 
 * Data fetching and mutations for sales transactions
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/auth-context";
import { queryKeys } from "@/lib/query-keys";
import { transformSale, saleToDb } from "@/lib/type-adapters";
import { handleSupabaseError } from "@/lib/supabase-helpers";
import type { Sale } from "@/data/mock-db";

/**
 * Fetch all sales for tenant
 */
export function useSales() {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: queryKeys.sales.all(user?.tenantId || ''),
    queryFn: async (): Promise<Sale[]> => {
      if (!user?.tenantId) throw new Error('Not authenticated');
      
      const { data, error } = await (supabase as any).from('sales')
        .select('*')
        .eq('tenant_id', user.tenantId)
        .order('sale_date', { ascending: false })
        .order('created_at', { ascending: false });
      
      if (error) handleSupabaseError(error);
      
      return (data || []).map(transformSale);
    },
    enabled: !!user?.tenantId,
  });
}

/**
 * Fetch sales by branch
 */
export function useSalesByBranch(branchId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.sales.byBranch(branchId || ''),
    queryFn: async () => {
      if (!branchId) throw new Error('Branch ID required');
      
      const { data, error } = await (supabase as any).from('sales')
        .select('*')
        .eq('branch_id', branchId)
        .order('sale_date', { ascending: false })
        .order('created_at', { ascending: false });
      
      if (error) handleSupabaseError(error);
      
      return (data || []).map(transformSale);
    },
    enabled: !!branchId,
  });
}

/**
 * Fetch sales by sales rep
 */
export function useSalesByRep(repId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.sales.byRep(repId || ''),
    queryFn: async () => {
      if (!repId) throw new Error('Rep ID required');
      
      const { data, error } = await (supabase as any).from('sales')
        .select('*')
        .eq('sales_rep_id', repId)
        .order('sale_date', { ascending: false })
        .order('created_at', { ascending: false });
      
      if (error) handleSupabaseError(error);
      
      return (data || []).map(transformSale);
    },
    enabled: !!repId,
  });
}

/**
 * Fetch sales by period
 */
export function useSalesByPeriod(startDate: string, endDate: string) {
  return useQuery({
    queryKey: queryKeys.sales.byPeriod(startDate, endDate),
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('sales')
        .select('*')
        .gte('sale_date', startDate)
        .lte('sale_date', endDate)
        .order('sale_date', { ascending: false });
      
      if (error) handleSupabaseError(error);
      
      return (data || []).map(transformSale);
    },
    enabled: !!startDate && !!endDate,
  });
}

/**
 * Create a new sale
 */
export function useCreateSale() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (input: Partial<Sale>) => {
      if (!user?.tenantId) throw new Error('Not authenticated');
      
      const dbData = saleToDb(input, user.tenantId);
      
      const { data, error } = await (supabase as any).from('sales')
        .insert(dbData)
        .select()
        .single();
      
      if (error) handleSupabaseError(error);
      
      return transformSale(data);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.sales.all(user?.tenantId || '') 
      });
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.sales.byBranch(data.branchId) 
      });
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.sales.byRep(data.salesRepId) 
      });
      // Also invalidate inventory since sale affects stock
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.inventory.byBranch(data.branchId) 
      });
    },
  });
}

/**
 * Bulk create sales (for multiple line items)
 */
export function useBulkCreateSales() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (sales: Partial<Sale>[]) => {
      if (!user?.tenantId) throw new Error('Not authenticated');
      
      const dbData = sales.map(s => saleToDb(s, user.tenantId));
      
      const { data, error } = await (supabase as any).from('sales')
        .insert(dbData)
        .select();
      
      if (error) handleSupabaseError(error);
      
      return (data || []).map(transformSale);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.sales.all(user?.tenantId || '') 
      });
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.inventory.all(user?.tenantId || '') 
      });
    },
  });
}
