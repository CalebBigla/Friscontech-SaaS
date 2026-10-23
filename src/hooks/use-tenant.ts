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
import { tenantToDb, transformTenant, type TenantMigrationRow } from "@/lib/type-adapters";
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
      const { data, error } = await (supabase as any).from("tenants")
        .select("*")
        .eq("id", tenantId)
        .maybeSingle();

      if (error) handleSupabaseError(error);

      return data ? transformTenant(data as TenantMigrationRow) : null;
    },
    enabled: !!tenantId,
  });
}

/** Owner only: update business profile fields on the tenant row. */
export function useUpdateTenant() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const tenantId = user?.tenantId ?? "";

  return useMutation({
    mutationFn: async (updates: Partial<Tenant>) => {
      if (!tenantId) throw new Error("Not authenticated");

      const { data, error } = await (supabase as any).from("tenants")
        .update(tenantToDb(updates))
        .eq("id", tenantId)
        .select()
        .single();

      if (error) handleSupabaseError(error);

      return transformTenant(data as TenantMigrationRow);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.tenant.detail(tenantId) });
    },
  });
}
