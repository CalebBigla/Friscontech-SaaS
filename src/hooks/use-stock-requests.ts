/**
 * Stock Requests React Query Hooks
 * 
 * Data fetching and mutations for stock request workflow
 */

import { useQuery, useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/auth-context";
import { queryKeys } from "@/lib/query-keys";
import { transformStockRequest, type StockRequestMigrationRow } from "@/lib/type-adapters";
import { callRpc, type PlannedRpcs } from "@/lib/rpc";
import { invalidateStock } from "@/hooks/use-inventory";
import { handleSupabaseError } from "@/lib/supabase-helpers";
import type { StockRequest } from "@/data/mock-db";

/**
 * Fetch all stock requests for tenant
 */
export function useStockRequests() {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: queryKeys.stockRequests.all(user?.tenantId || ''),
    queryFn: async (): Promise<StockRequest[]> => {
      if (!user?.tenantId) throw new Error('Not authenticated');
      
      const { data, error } = await supabase.from('stock_requests')
        .select('*')
        .eq('tenant_id', user.tenantId)
        .order('created_at', { ascending: false });
      
      if (error) handleSupabaseError(error);
      
      return (data || []).map((row) => transformStockRequest(row as Parameters<typeof transformStockRequest>[0]));
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
      
      const { data, error } = await supabase.from('stock_requests')
        .select('*')
        .eq('branch_id', branchId)
        .order('created_at', { ascending: false });
      
      if (error) handleSupabaseError(error);
      
      return (data || []).map((row) => transformStockRequest(row as Parameters<typeof transformStockRequest>[0]));
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
      
      const { data, error } = await supabase.from('stock_requests')
        .select('*')
        .eq('rep_id', requesterId)
        .order('created_at', { ascending: false });
      
      if (error) handleSupabaseError(error);
      
      return (data || []).map((row) => transformStockRequest(row as Parameters<typeof transformStockRequest>[0]));
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
    queryFn: async (): Promise<StockRequest> => {
      if (!requestId) throw new Error('Request ID required');
      
      const { data, error } = await supabase.from('stock_requests')
        .select('*')
        .eq('id', requestId)
        .single();
      
      if (error) handleSupabaseError(error);
      
      return transformStockRequest(data as Parameters<typeof transformStockRequest>[0]);
    },
    enabled: !!requestId,
  });
}

function useStockRequestMutation<N extends "approve_stock_request" | "reject_stock_request" | "fulfil_stock_request" | "acknowledge_stock_request">(name: N) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (args: PlannedRpcs[N]): Promise<StockRequest> => {
      const row = await callRpc(name, args);
      return transformStockRequest(row as StockRequestMigrationRow);
    },
    onSuccess: () => invalidateStockRequests(queryClient, user?.tenantId ?? "", name === "fulfil_stock_request"),
  });
}

/** Requests change the queue, notifications and audit log; fulfilment also moves stock. */
function invalidateStockRequests(queryClient: QueryClient, tenantId: string, stockMoved: boolean) {
  void queryClient.invalidateQueries({ queryKey: queryKeys.stockRequests.root() });
  void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.root() });
  void queryClient.invalidateQueries({ queryKey: queryKeys.activities.all(tenantId) });
  if (stockMoved) invalidateStock(queryClient, tenantId);
}

/** Sales rep submits one or more products for their branch (RPC create_stock_requests). */
export function useCreateStockRequests() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (args: PlannedRpcs["create_stock_requests"]): Promise<StockRequest[]> => {
      const rows = await callRpc("create_stock_requests", args);
      return ((rows ?? []) as StockRequestMigrationRow[]).map((row) => transformStockRequest(row as Parameters<typeof transformStockRequest>[0]));
    },
    onSuccess: () => invalidateStockRequests(queryClient, user?.tenantId ?? "", false),
  });
}

/** Storekeeper: pending → approved (RPC approve_stock_request). */
export const useApproveStockRequest = () => useStockRequestMutation("approve_stock_request");
/** Storekeeper: pending → rejected (RPC reject_stock_request). */
export const useRejectStockRequest = () => useStockRequestMutation("reject_stock_request");
/** Storekeeper: issue stock against an approved request (RPC fulfil_stock_request). */
export const useFulfilStockRequest = () => useStockRequestMutation("fulfil_stock_request");
/** Sales rep: confirm receipt of fulfilled stock (RPC acknowledge_stock_request). */
export const useAcknowledgeStockRequest = () => useStockRequestMutation("acknowledge_stock_request");
