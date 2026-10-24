/**
 * React Query hooks for staff onboarding (Supabase-backed, real schema).
 *
 * Owner-facing reads go through normal RLS (onboardings_owner_all). The public token
 * fetch goes through the get_onboarding_by_token() RPC (SECURITY DEFINER, hashed token).
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { queryKeys } from "@/lib/query-keys";
import { handleSupabaseError } from "@/lib/supabase-helpers";
import { transformOnboarding } from "@/lib/type-adapters";
import type { Onboarding } from "@/data/onboarding";

interface OnboardingFilters {
  status?: "invited" | "in_progress" | "submitted" | "approved" | "rejected";
}

/** All onboardings in the caller's tenant (owner RLS). */
export function useOnboardings(tenantId: string, filters: OnboardingFilters = {}) {
  return useQuery({
    queryKey: queryKeys.onboardings.list(tenantId, filters as any),
    queryFn: async (): Promise<Onboarding[]> => {
      let q = supabase
        .from("onboardings")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false });
      if (filters.status) q = q.eq("status", filters.status);
      const { data, error } = await q;
      if (error) throw handleSupabaseError(error);
      return (data || []).map((row) => transformOnboarding(row as Parameters<typeof transformOnboarding>[0]));
    },
    enabled: !!tenantId,
  });
}

/** Pending reviews: status = submitted, awaiting the owner. */
export function usePendingOnboardings(tenantId: string) {
  return useQuery({
    queryKey: queryKeys.onboardings.pending(tenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("onboardings")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("status", "submitted")
        .order("submitted_at", { ascending: true });
      if (error) throw handleSupabaseError(error);
      return (data || []).map((row) => transformOnboarding(row as Parameters<typeof transformOnboarding>[0]));
    },
    enabled: !!tenantId,
  });
}

/**
 * The onboarding of one team member, or null when they have none.
 * A failed request throws, so the screen can show an error instead of "none".
 */
export function useMemberOnboarding(userId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.onboardings.byUser(userId),
    queryFn: async (): Promise<Onboarding | null> => {
      const { data, error } = await supabase
        .from("onboardings")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw handleSupabaseError(error);
      return data ? transformOnboarding(data as Parameters<typeof transformOnboarding>[0]) : null;
    },
    enabled: enabled && !!userId,
  });
}

/** A single onboarding by id (owner RLS). */
export function useOnboarding(id: string) {
  return useQuery({
    queryKey: queryKeys.onboardings.detail(id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("onboardings")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw handleSupabaseError(error);
      return transformOnboarding(data as Parameters<typeof transformOnboarding>[0]);
    },
    enabled: !!id,
  });
}

/** Invalidate onboarding queries after a mutation. */
export function useInvalidateOnboardings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (_tenantId: string) => _tenantId,
    onSuccess: (tenantId) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.onboardings.all(tenantId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.onboardings.pending(tenantId) });
    },
  });
}
