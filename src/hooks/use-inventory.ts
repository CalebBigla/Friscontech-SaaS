/**
 * Inventory React Query Hooks
 * 
 * Data fetching and mutations for inventory records, movements, and batches
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/auth-context";
import { queryKeys } from "@/lib/query-keys";
import { transformInventoryRecord, transformInventoryMovement, transformStockBatch, inventoryRecordToDb, inventoryMovementToDb, stockBatchToDb } from "@/lib/type-adapters";
import { handleSupabaseError } from "@/lib/supabase-helpers";
import type { InventoryRecord, InventoryMovement, StockBatch } from "@/data/mock-db";

/**
 * Fetch all inventory records for tenant
 */
export function useInventory() {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: queryKeys.inventory.all(user?.tenantId || ''),
    queryFn: async () => {
      if (!user?.tenantId) throw new Error('Not authenticated');
      
      const { data, error } = await (supabase as any).from('inventory_records')
        .select('*')
        .eq('tenant_id', user.tenantId)
        .order('created_at', { ascending: false });
      
      if (error) handleSupabaseError(error);
      
      return (data || []).map(transformInventoryRecord);
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
      
      const { data, error } = await (supabase as any).from('inventory_records')
        .select('*')
        .eq('branch_id', branchId)
        .order('updated_at', { ascending: false });
      
      if (error) handleSupabaseError(error);
      
      return (data || []).map(transformInventoryRecord);
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
    queryFn: async () => {
      if (!recordId) throw new Error('Record ID required');
      
      const { data, error } = await (supabase as any).from('inventory_records')
        .select('*')
        .eq('id', recordId)
        .single();
      
      if (error) handleSupabaseError(error);
      
      return transformInventoryRecord(data);
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
    queryFn: async () => {
      if (!recordId) throw new Error('Record ID required');
      
      const { data, error } = await (supabase as any).from('inventory_movements')
        .select('*')
        .eq('reference_id', recordId)
        .order('created_at', { ascending: false });
      
      if (error) handleSupabaseError(error);
      
      return (data || []).map(transformInventoryMovement);
    },
    enabled: !!recordId,
  });
}

/**
 * Fetch stock batches for a product at a branch
 */
export function useStockBatches(productId: string | undefined, branchId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.inventory.batches(productId || '', branchId || ''),
    queryFn: async () => {
      if (!productId || !branchId) throw new Error('Product and branch required');
      
      const { data, error } = await (supabase as any).from('stock_batches')
        .select('*')
        .eq('product_id', productId)
        .eq('branch_id', branchId)
        .gt('quantity_remaining', 0)
        .order('expiry_date', { ascending: true, nullsFirst: false });
      
      if (error) handleSupabaseError(error);
      
      return (data || []).map(transformStockBatch);
    },
    enabled: !!productId && !!branchId,
  });
}

/**
 * Update inventory record (quantity changes)
 */
export function useUpdateInventory() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<InventoryRecord> }) => {
      if (!user?.tenantId) throw new Error('Not authenticated');
      
      const dbData = inventoryRecordToDb(updates, user.tenantId);
      
      const { data, error } = await (supabase as any).from('inventory_records')
        .update(dbData)
        .eq('id', id)
        .select()
        .single();
      
      if (error) handleSupabaseError(error);
      
      return transformInventoryRecord(data);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.inventory.all(user?.tenantId || '') 
      });
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.inventory.byBranch(data.branchId) 
      });
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.inventory.detail(data.id) 
      });
    },
  });
}

/**
 * Create inventory movement (stock change)
 */
export function useCreateInventoryMovement() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (input: Partial<InventoryMovement>) => {
      if (!user?.tenantId) throw new Error('Not authenticated');
      
      const dbData = inventoryMovementToDb(input, user.tenantId);
      
      const { data, error } = await (supabase as any).from('inventory_movements')
        .insert(dbData)
        .select()
        .single();
      
      if (error) handleSupabaseError(error);
      
      return transformInventoryMovement(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.inventory.all(user?.tenantId || '') 
      });
    },
  });
}

/**
 * Create stock batch
 */
export function useCreateStockBatch() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (input: Partial<StockBatch>) => {
      if (!user?.tenantId) throw new Error('Not authenticated');
      
      const dbData = stockBatchToDb(input, user.tenantId);
      
      const { data, error } = await (supabase as any).from('stock_batches')
        .insert(dbData)
        .select()
        .single();
      
      if (error) handleSupabaseError(error);
      
      return transformStockBatch(data);
    },
    onSuccess: (data) => {
      if (data.productId && data.branchId) {
        queryClient.invalidateQueries({ 
          queryKey: queryKeys.inventory.batches(data.productId, data.branchId) 
        });
      }
    },
  });
}
