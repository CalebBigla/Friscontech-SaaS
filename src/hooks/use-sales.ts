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
import { handleSupabaseError, type Row } from "@/lib/supabase-helpers";
import { callRpc, type PlannedRpcs } from "@/lib/rpc";
import type { Sale } from "@/data/mock-db";
import type { TablesInsert } from "@/types/database.types";

/**
 * Fetch all sales for tenant
 */
export function useSales() {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: queryKeys.sales.all(user?.tenantId || ''),
    queryFn: async (): Promise<Sale[]> => {
      if (!user?.tenantId) throw new Error('Not authenticated');
      
      const { data, error } = await supabase.from('sales')
        .select('*')
        .eq('tenant_id', user.tenantId)
        .order('sale_date', { ascending: false })
        .order('created_at', { ascending: false });
      
      if (error) handleSupabaseError(error);
      
      return (data || []).map((row) => transformSale(row as Parameters<typeof transformSale>[0]));
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
      
      const { data, error } = await supabase.from('sales')
        .select('*')
        .eq('branch_id', branchId)
        .order('sale_date', { ascending: false })
        .order('created_at', { ascending: false });
      
      if (error) handleSupabaseError(error);
      
      return (data || []).map((row) => transformSale(row as Parameters<typeof transformSale>[0]));
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
      
      const { data, error } = await supabase.from('sales')
        .select('*')
        .eq('sales_rep_id', repId)
        .order('sale_date', { ascending: false })
        .order('created_at', { ascending: false });
      
      if (error) handleSupabaseError(error);
      
      return (data || []).map((row) => transformSale(row as Parameters<typeof transformSale>[0]));
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
      const { data, error } = await supabase.from('sales')
        .select('*')
        .gte('sale_date', startDate)
        .lte('sale_date', endDate)
        .order('sale_date', { ascending: false });
      
      if (error) handleSupabaseError(error);
      
      return (data || []).map((row) => transformSale(row as Parameters<typeof transformSale>[0]));
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
      
      const dbData = saleToDb(input, user.tenantId) as TablesInsert<"sales">;
      
      const { data, error } = await supabase.from('sales')
        .insert(dbData)
        .select()
        .single();
      
      if (error) handleSupabaseError(error);
      
      return transformSale(data as Parameters<typeof transformSale>[0]);
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
 * Record one order, all lines or none (RPC record_sale). The server sets each price,
 * works out the discount and deducts stock.
 */
/** Sales, stock, customer balances and the audit log all move with a sale change. */
function invalidateSaleChange(queryClient: ReturnType<typeof useQueryClient>, tenantId: string) {
  void queryClient.invalidateQueries({ queryKey: queryKeys.sales.all(tenantId) });
  void queryClient.invalidateQueries({ queryKey: queryKeys.inventory.all(tenantId) });
  void queryClient.invalidateQueries({ queryKey: queryKeys.customers.root() });
  void queryClient.invalidateQueries({ queryKey: queryKeys.activities.all(tenantId) });
}

/** Owner: discount a sold line (see apply_sale_discount). */
export function useApplySaleDiscount() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: PlannedRpcs["apply_sale_discount"]): Promise<Sale> =>
      transformSale((await callRpc("apply_sale_discount", args)) as Row<"sales">),
    onSuccess: () => invalidateSaleChange(queryClient, user?.tenantId || ''),
  });
}

/** Owner: add promo items to a sale's order (see add_sale_promo). */
export function useAddSalePromo() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: PlannedRpcs["add_sale_promo"]): Promise<Sale[]> =>
      ((await callRpc("add_sale_promo", args)) as Row<"sales">[]).map(transformSale),
    onSuccess: () => invalidateSaleChange(queryClient, user?.tenantId || ''),
  });
}

export function useRecordSale() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (args: PlannedRpcs["record_sale"]): Promise<Sale[]> => {
      const rows = await callRpc("record_sale", args);
      return (rows as Row<"sales">[]).map(transformSale);
    },
    onSuccess: () => {
      const tenantId = user?.tenantId || '';
      void queryClient.invalidateQueries({ queryKey: queryKeys.sales.all(tenantId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.inventory.all(tenantId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.customers.root() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.activities.all(tenantId) });
    },
  });
}
