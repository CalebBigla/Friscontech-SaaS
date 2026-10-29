/**
 * Tenant hooks
 *
 * The tenant row holds the business profile (name, timezone, expiry alert window).
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth-context";
import { supabase } from "@/lib/supabase";
import { queryKeys } from "@/lib/query-keys";
import { handleSupabaseError } from "@/lib/supabase-helpers";
import { transformTenant, type TenantMigrationRow } from "@/lib/type-adapters";
import { callRpc, type PlannedRpcs } from "@/lib/rpc";
import type { Tenant } from "@/data/mock-db";

export function useTenantId(): string {
  const { user } = useAuth();

  if (!user?.tenantId) {
    // In production, user should always have tenantId if authenticated
    // This fallback handles edge cases during development
    console.warn("No tenantId found in user context - user may not be authenticated");
    return "";
  }

  return user.tenantId;
}

/**
 * The signed-in user's tenant. Resolves to null when RLS hides the row
 * (only owners and managers may read `tenants`), so callers can tell
 * "not visible" apart from a failed request.
 */
export function useTenant() {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";

  return useQuery({
    queryKey: queryKeys.tenant.detail(tenantId),
    queryFn: async (): Promise<Tenant | null> => {
      const { data, error } = await supabase.from("tenants")
        .select("*")
        .eq("id", tenantId)
        .maybeSingle();

      if (error) handleSupabaseError(error);

      return data ? transformTenant(data as TenantMigrationRow) : null;
    },
    enabled: !!tenantId,
  });
}

/** Owner only: business profile and expiry alerts (RPC update_tenant_settings). */
export function useUpdateTenantSettings() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const tenantId = user?.tenantId ?? "";

  return useMutation({
    mutationFn: async (args: PlannedRpcs["update_tenant_settings"]): Promise<Tenant> => {
      const row = await callRpc("update_tenant_settings", args);
      return transformTenant(row as TenantMigrationRow);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.tenant.detail(tenantId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.activities.all(tenantId) });
    },
  });
}
