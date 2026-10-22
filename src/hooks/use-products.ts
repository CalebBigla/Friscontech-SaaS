/**
 * Products React Query Hooks
 * 
 * Data fetching and mutations for product catalog management
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/auth-context";
import { queryKeys } from "@/lib/query-keys";
import { transformProduct, productToDb } from "@/lib/type-adapters";
import { handleSupabaseError } from "@/lib/supabase-helpers";
import type { Product } from "@/data/mock-db";

/**
 * Fetch all products for the current tenant
 */
export function useProducts() {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: queryKeys.products.all(user?.tenantId || ''),
    queryFn: async () => {
      if (!user?.tenantId) throw new Error('Not authenticated');
      
      const { data, error } = await (supabase as any).from('products')
        .select('*')
        .eq('tenant_id', user.tenantId)
        .order('name');
      
      if (error) handleSupabaseError(error);
      
      return (data || []).map(transformProduct);
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
      
      const { data, error } = await (supabase as any).from('products')
        .select('*')
        .eq('tenant_id', user.tenantId)
        .eq('status', 'active')
        .order('name');
      
      if (error) handleSupabaseError(error);
      
      return (data || []).map(transformProduct);
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
      
      const { data, error } = await (supabase as any).from('products')
        .select('*')
        .eq('id', productId)
        .single();
      
      if (error) handleSupabaseError(error);
      
      return transformProduct(data);
    },
    enabled: !!productId,
  });
}

/**
 * Create a new product
 */
export function useCreateProduct() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (input: Partial<Product>) => {
      if (!user?.tenantId) throw new Error('Not authenticated');
      
      const dbData = productToDb(input, user.tenantId);
      
      const { data, error } = await (supabase as any).from('products')
        .insert(dbData)
        .select()
        .single();
      
      if (error) handleSupabaseError(error);
      
      return transformProduct(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.products.all(user?.tenantId || '') 
      });
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.products.active(user?.tenantId || '') 
      });
    },
  });
}

/**
 * Update an existing product
 */
export function useUpdateProduct() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Product> }) => {
      if (!user?.tenantId) throw new Error('Not authenticated');
      
      const dbData = productToDb(updates, user.tenantId);
      
      const { data, error } = await (supabase as any).from('products')
        .update(dbData)
        .eq('id', id)
        .select()
        .single();
      
      if (error) handleSupabaseError(error);
      
      return transformProduct(data);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.products.all(user?.tenantId || '') 
      });
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.products.active(user?.tenantId || '') 
      });
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.products.detail(data.id) 
      });
    },
  });
}

/**
 * Deactivate a product (soft delete)
 */
export function useDeactivateProduct() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (productId: string) => {
      if (!user?.tenantId) throw new Error('Not authenticated');

      if (user.role === 'manager') {
        const { data, error } = await (supabase as any).rpc('set_product_status', {
          p_product_id: productId,
          p_status: 'inactive',
        });
        if (error) handleSupabaseError(error);
        return transformProduct(data);
      }
      
      const { data, error } = await (supabase as any).from('products')
        .update({ 
          status: 'inactive',
        })
        .eq('id', productId)
        .select()
        .single();
      
      if (error) handleSupabaseError(error);
      
      return transformProduct(data);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.products.all(user?.tenantId || '') 
      });
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.products.active(user?.tenantId || '') 
      });
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.products.detail(data.id) 
      });
    },
  });
}

/**
 * Reactivate a deactivated product
 */
export function useReactivateProduct() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (productId: string) => {
      if (!user?.tenantId) throw new Error('Not authenticated');

      if (user.role === 'manager') {
        const { data, error } = await (supabase as any).rpc('set_product_status', {
          p_product_id: productId,
          p_status: 'active',
        });
        if (error) handleSupabaseError(error);
        return transformProduct(data);
      }
      
      const { data, error } = await (supabase as any).from('products')
        .update({ 
          status: 'active',
        })
        .eq('id', productId)
        .select()
        .single();
      
      if (error) handleSupabaseError(error);
      
      return transformProduct(data);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.products.all(user?.tenantId || '') 
      });
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.products.active(user?.tenantId || '') 
      });
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.products.detail(data.id) 
      });
    },
  });
}

/**
 * Bulk import products
 */
export function useImportProducts() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (products: Partial<Product>[]) => {
      if (!user?.tenantId) throw new Error('Not authenticated');
      
      const dbData = products.map(p => productToDb(p, user.tenantId));
      
      const { data, error } = await (supabase as any).from('products')
        .insert(dbData)
        .select();
      
      if (error) handleSupabaseError(error);
      
      return (data || []).map(transformProduct);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.products.all(user?.tenantId || '') 
      });
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.products.active(user?.tenantId || '') 
      });
    },
  });
}
