/**
 * Products React Query Hooks
 * 
 * Data fetching and mutations for product catalog management
 */

import { useQuery, useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { invalidateStock } from "@/hooks/use-inventory";
import { callRpc, type PlannedRpcs } from "@/lib/rpc";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/auth-context";
import { queryKeys } from "@/lib/query-keys";
import { transformApprovalRequest, transformProduct, type ApprovalRequestMigrationRow } from "@/lib/type-adapters";
import { handleSupabaseError } from "@/lib/supabase-helpers";
import type { ApprovalRequest, Product } from "@/data/mock-db";

/**
 * Fetch all products for the current tenant
 */
export function useProducts() {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: queryKeys.products.all(user?.tenantId || ''),
    queryFn: async (): Promise<Product[]> => {
      if (!user?.tenantId) throw new Error('Not authenticated');
      
      const { data, error } = await supabase.from('products')
        .select('*')
        .eq('tenant_id', user.tenantId)
        .order('name');
      
      if (error) handleSupabaseError(error);
      
      return (data || []).map((row) => transformProduct(row as Parameters<typeof transformProduct>[0]));
    },
    enabled: !!user?.tenantId,
  });
}

/**
 * Fetch only active products
 */
export function useActiveProducts() {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: queryKeys.products.active(user?.tenantId || ''),
    queryFn: async () => {
      if (!user?.tenantId) throw new Error('Not authenticated');
      
      const { data, error } = await supabase.from('products')
        .select('*')
        .eq('tenant_id', user.tenantId)
        .eq('status', 'active')
        .order('name');
      
      if (error) handleSupabaseError(error);
      
      return (data || []).map((row) => transformProduct(row as Parameters<typeof transformProduct>[0]));
    },
    enabled: !!user?.tenantId,
  });
}

/**
 * Fetch a single product by ID
 */
export function useProduct(productId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.products.detail(productId || ''),
    queryFn: async () => {
      if (!productId) throw new Error('Product ID required');
      
      const { data, error } = await supabase.from('products')
        .select('*')
        .eq('id', productId)
        .single();
      
      if (error) handleSupabaseError(error);
      
      return transformProduct(data as Parameters<typeof transformProduct>[0]);
    },
    enabled: !!productId,
  });
}

/** Product changes touch the catalogue, inventory records, approvals and the audit log. */
function invalidateProducts(queryClient: QueryClient, tenantId: string) {
  void queryClient.invalidateQueries({ queryKey: queryKeys.products.all(tenantId) });
  void queryClient.invalidateQueries({ queryKey: queryKeys.products.root() });
  invalidateStock(queryClient, tenantId);
}

function useProductMutation<N extends "create_product" | "update_product" | "set_product_status">(name: N) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (args: PlannedRpcs[N]): Promise<Product> => {
      const row = await callRpc(name, args);
      return transformProduct(row as Parameters<typeof transformProduct>[0]);
    },
    onSuccess: () => invalidateProducts(queryClient, user?.tenantId ?? ''),
  });
}

/** Add a catalogue product (RPC create_product). */
export const useCreateProduct = () => useProductMutation('create_product');
/** Edit a catalogue product (RPC update_product). */
export const useUpdateProduct = () => useProductMutation('update_product');
/** Soft (de)activation (RPC set_product_status). */
export const useSetProductStatus = () => useProductMutation('set_product_status');

/** Storekeeper's deactivation request (RPC request_product_deactivation). */
export function useRequestProductDeactivation() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (args: PlannedRpcs['request_product_deactivation']): Promise<ApprovalRequest> => {
      const row = await callRpc('request_product_deactivation', args);
      return transformApprovalRequest(row as ApprovalRequestMigrationRow);
    },
    onSuccess: () => invalidateProducts(queryClient, user?.tenantId ?? ''),
  });
}

export type ImportSummary = {
  created: number; updated: number; skipped: number; failed: number;
  failures: { rowNumber: number; sku: string; name: string; reason: string }[];
};
type ImportSummaryRow = {
  created: number; updated: number; skipped: number; failed: number;
  failures: { row_number: number; sku: string; name: string; reason: string }[];
};

/** Bulk import in one transaction (RPC import_products). */
export function useImportProducts() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (args: PlannedRpcs['import_products']): Promise<ImportSummary> => {
      const row = (await callRpc('import_products', args)) as ImportSummaryRow;
      return {
        created: row.created,
        updated: row.updated,
        skipped: row.skipped,
        failed: row.failed,
        failures: (row.failures ?? []).map((f) => ({ rowNumber: f.row_number, sku: f.sku, name: f.name, reason: f.reason })),
      };
    },
    onSuccess: () => invalidateProducts(queryClient, user?.tenantId ?? ''),
  });
}
