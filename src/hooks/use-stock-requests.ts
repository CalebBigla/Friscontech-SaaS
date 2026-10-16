/**
 * Stock Requests React Query Hooks
 * 
 * Data fetching and mutations for stock request workflow
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/auth-context";
import { queryKeys } from "@/lib/query-keys";
import { transformStockRequest, stockRequestToDb } from "@/lib/type-adapters";
import { handleSupabaseError } from "@/lib/supabase-helpers";
import type { StockRequest } from "@/data/mock-db";

/**
 * Fetch all stock requests for tenant
 */
export function useStockRequests() {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: queryKeys.stockRequests.all(user?.tenantId || ''),
    queryFn: async () => {
      if (!user?.tenantId) throw new Error('Not authenticated');
      
      const { data, error } = await supabase
        .from('stock_requests')
        .select('*')
        .eq('tenant_id', user.tenantId)
        .order('created_at', { ascending: false });
      
      if (error) handleSupabaseError(error);
      
      return (data || []).map(transformStockRequest);
    },
    enabled: !!user?.tenantId,
  });
}

/**
 * Fetch stock requests by branch
 */
export function useStockRequestsByBranch(branchId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.stockRequests.byBranch(branchId || ''),
    queryFn: async () => {
      if (!branchId) throw new Error('Branch ID required');
      
      const { data, error } = await supabase
        .from('stock_requests')
        .select('*')
        .eq('branch_id', branchId)
        .order('created_at', { ascending: false });
      
      if (error) handleSupabaseError(error);
      
      return (data || []).map(transformStockRequest);
    },
    enabled: !!branchId,
  });
}

/**
 * Fetch stock requests by requester (rep)
 */
export function useStockRequestsByRequester(requesterId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.stockRequests.byRequester(requesterId || ''),
    queryFn: async () => {
      if (!requesterId) throw new Error('Requester ID required');
      
      const { data, error } = await supabase
        .from('stock_requests')
        .select('*')
        .eq('requester_id', requesterId)
        .order('created_at', { ascending: false });
      
      if (error) handleSupabaseError(error);
      
      return (data || []).map(transformStockRequest);
    },
    enabled: !!requesterId,
  });
}

/**
 * Fetch single stock request
 */
export function useStockRequest(requestId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.stockRequests.detail(requestId || ''),
    queryFn: async () => {
      if (!requestId) throw new Error('Request ID required');
      
      const { data, error } = await supabase
        .from('stock_requests')
        .select('*')
        .eq('id', requestId)
        .single();
      
      if (error) handleSupabaseError(error);
      
      return transformStockRequest(data);
    },
    enabled: !!requestId,
  });
}

/**
 * Create a new stock request
 */
export function useCreateStockRequest() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (input: Partial<StockRequest>) => {
      if (!user?.tenantId) throw new Error('Not authenticated');
      
      const dbData = stockRequestToDb(input, user.tenantId);
      
      const { data, error } = await supabase
        .from('stock_requests')
        .insert(dbData)
        .select()
        .single();
      
      if (error) handleSupabaseError(error);
      
      return transformStockRequest(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.stockRequests.all(user?.tenantId || '') 
      });
    },
  });
}

/**
 * Update stock request (approve, reject, fulfill, cancel)
 */
export function useUpdateStockRequest() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<StockRequest> }) => {
      if (!user?.tenantId) throw new Error('Not authenticated');
      
      const dbData = stockRequestToDb(updates, user.tenantId);
      
      const { data, error } = await supabase
        .from('stock_requests')
        .update(dbData)
        .eq('id', id)
        .select()
        .single();
      
      if (error) handleSupabaseError(error);
      
      return transformStockRequest(data);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.stockRequests.all(user?.tenantId || '') 
      });
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.stockRequests.detail(data.id) 
      });
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.stockRequests.byBranch(data.branchId) 
      });
    },
  });
}
