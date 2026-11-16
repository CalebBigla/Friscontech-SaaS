/**
 * Stock requests were replaced by customer orders (20261116100000). The rows stay
 * as history: the audit log, stock movements and team activity still read them.
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/auth-context";
import { queryKeys } from "@/lib/query-keys";
import { transformStockRequest, type StockRequestMigrationRow } from "@/lib/type-adapters";
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
