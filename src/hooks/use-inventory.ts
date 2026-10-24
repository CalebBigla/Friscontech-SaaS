/**
 * Inventory React Query Hooks
 * 
 * Data fetching and mutations for inventory records, movements, and batches
 */

import { useQuery, useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/auth-context";
import { queryKeys } from "@/lib/query-keys";
import { transformApprovalRequest, transformInventoryRecord, transformInventoryMovement, transformStockBatch, type ApprovalRequestMigrationRow, type InventoryRecordMigrationRow } from "@/lib/type-adapters";
import { callRpc, type PlannedRpcs } from "@/lib/rpc";
import { handleSupabaseError } from "@/lib/supabase-helpers";
import type { ApprovalRequest, InventoryRecord, InventoryMovement, StockBatch } from "@/data/mock-db";

/**
 * Fetch all inventory records for tenant
 */
export function useInventory() {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: queryKeys.inventory.all(user?.tenantId || ''),
    queryFn: async (): Promise<InventoryRecord[]> => {
      if (!user?.tenantId) throw new Error('Not authenticated');
      
      const { data, error } = await supabase.from('inventory_records')
        .select('*')
        .eq('tenant_id', user.tenantId)
        .order('last_updated', { ascending: false });
      
      if (error) handleSupabaseError(error);
      
      return (data || []).map((row) => transformInventoryRecord(row as Parameters<typeof transformInventoryRecord>[0]));
    },
    enabled: !!user?.tenantId,
  });
}

/**
 * Fetch inventory records by branch
 */
export function useInventoryByBranch(branchId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.inventory.byBranch(branchId || ''),
    queryFn: async () => {
      if (!branchId) throw new Error('Branch ID required');
      
      const { data, error } = await supabase.from('inventory_records')
        .select('*')
        .eq('branch_id', branchId)
        .order('last_updated', { ascending: false });
      
      if (error) handleSupabaseError(error);
      
      return (data || []).map((row) => transformInventoryRecord(row as Parameters<typeof transformInventoryRecord>[0]));
    },
    enabled: !!branchId,
  });
}

/**
 * Fetch single inventory record
 */
export function useInventoryRecord(recordId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.inventory.detail(recordId || ''),
    queryFn: async (): Promise<InventoryRecord> => {
      if (!recordId) throw new Error('Record ID required');
      
      const { data, error } = await supabase.from('inventory_records')
        .select('*')
        .eq('id', recordId)
        .single();
      
      if (error) handleSupabaseError(error);
      
      return transformInventoryRecord(data as Parameters<typeof transformInventoryRecord>[0]);
    },
    enabled: !!recordId,
  });
}

/**
 * Fetch inventory movements for a specific record
 */
export function useInventoryMovements(recordId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.inventory.movements(recordId || ''),
    queryFn: async (): Promise<InventoryMovement[]> => {
      if (!recordId) throw new Error('Record ID required');

      // Movements are keyed by branch + product, not by inventory record id.
      const { data: record, error: recordError } = await supabase.from('inventory_records')
        .select('tenant_id, branch_id, product_id')
        .eq('id', recordId)
        .single();
      if (recordError) handleSupabaseError(recordError);

      const { data, error } = await supabase.from('inventory_movements')
        .select('*')
        .eq('tenant_id', record.tenant_id)
        .eq('branch_id', record.branch_id)
        .eq('product_id', record.product_id)
        .order('created_at', { ascending: false });
      
      if (error) handleSupabaseError(error);
      
      return (data || []).map((row) => transformInventoryMovement(row as Parameters<typeof transformInventoryMovement>[0]));
    },
    enabled: !!recordId,
  });
}

/**
 * Fetch all inventory movements for tenant. Heavy: load only on screens that list movements.
 */
export function useAllInventoryMovements(enabled = true) {
  const { user } = useAuth();

  return useQuery({
    queryKey: queryKeys.inventory.allMovements(user?.tenantId || ''),
    queryFn: async (): Promise<InventoryMovement[]> => {
      if (!user?.tenantId) throw new Error('Not authenticated');

      const { data, error } = await supabase.from('inventory_movements')
        .select('*')
        .eq('tenant_id', user.tenantId)
        .order('created_at', { ascending: false });

      if (error) handleSupabaseError(error);

      return (data || []).map((row) => transformInventoryMovement(row as Parameters<typeof transformInventoryMovement>[0]));
    },
    enabled: enabled && !!user?.tenantId,
  });
}

/**
 * Fetch all stock batches (lots) for tenant, earliest expiry first (FEFO order).
 */
export function useAllStockBatches(enabled = true) {
  const { user } = useAuth();

  return useQuery({
    queryKey: queryKeys.inventory.allBatches(user?.tenantId || ''),
    queryFn: async (): Promise<StockBatch[]> => {
      if (!user?.tenantId) throw new Error('Not authenticated');

      const { data, error } = await supabase.from('stock_batches')
        .select('*')
        .eq('tenant_id', user.tenantId)
        .order('expiry_date', { ascending: true });

      if (error) handleSupabaseError(error);

      return (data || []).map((row) => transformStockBatch(row as Parameters<typeof transformStockBatch>[0]));
    },
    enabled: enabled && !!user?.tenantId,
  });
}

/**
 * Fetch stock batches for a product at a branch
 */
export function useStockBatches(productId: string | undefined, branchId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.inventory.batches(productId || '', branchId || ''),
    queryFn: async (): Promise<StockBatch[]> => {
      if (!productId || !branchId) throw new Error('Product and branch required');
      
      const { data, error } = await supabase.from('stock_batches')
        .select('*')
        .eq('product_id', productId)
        .eq('branch_id', branchId)
        .gt('quantity_remaining', 0)
        .order('expiry_date', { ascending: true, nullsFirst: false });
      
      if (error) handleSupabaseError(error);
      
      return (data || []).map((row) => transformStockBatch(row as Parameters<typeof transformStockBatch>[0]));
    },
    enabled: !!productId && !!branchId,
  });
}

/** A stock change touches inventory, lots, movements, approvals and the audit log. */
export function invalidateStock(queryClient: QueryClient, tenantId: string) {
  void queryClient.invalidateQueries({ queryKey: queryKeys.inventory.root() });
  void queryClient.invalidateQueries({ queryKey: queryKeys.approvals.all(tenantId) });
  void queryClient.invalidateQueries({ queryKey: queryKeys.activities.all(tenantId) });
}

/**
 * Storekeeper stock addition (RPC add_stock). Creates a pending approval request;
 * an emergency addition is also applied immediately.
 */
export function useAddStock() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (args: PlannedRpcs["add_stock"]): Promise<ApprovalRequest> => {
      const row = await callRpc("add_stock", args);
      return transformApprovalRequest(row as ApprovalRequestMigrationRow);
    },
    onSuccess: () => invalidateStock(queryClient, user?.tenantId ?? ""),
  });
}

/** Stock count correction (RPC adjust_stock). */
export function useAdjustStock() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (args: PlannedRpcs["adjust_stock"]): Promise<InventoryRecord> => {
      const row = await callRpc("adjust_stock", args);
      return transformInventoryRecord(row as InventoryRecordMigrationRow);
    },
    onSuccess: () => invalidateStock(queryClient, user?.tenantId ?? ""),
  });
}
