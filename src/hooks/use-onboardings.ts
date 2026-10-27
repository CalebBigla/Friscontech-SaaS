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

/**
 * Pending reviews: submitted and linked to the staff member's login (auth + users).
 * Only those can be approved, so only those are shown for review.
 */
export function usePendingOnboardings(tenantId: string) {
  return useQuery({
    queryKey: queryKeys.onboardings.pending(tenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("onboardings")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("status", "submitted")
        .not("user_id", "is", null)
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

/**
 * Profile photos: each member's onboarding passport photo, as signed URLs keyed
 * by user id. The owner can read every member's photo; others see what RLS and
 * the storage policies allow (usually none, so avatars fall back to initials).
 * Photos are cosmetic, so a failure returns no photos instead of an error.
 */
export function useMemberPhotos(enabled = true) {
  return useQuery({
    queryKey: [...queryKeys.onboardings.root(), "photos"] as const,
    queryFn: async (): Promise<Record<string, string>> => {
      const { data, error } = await supabase
        .from("onboardings")
        .select("user_id, onboarding_files(file_type, cloudinary_url, uploaded_at)")
        .not("user_id", "is", null);
      if (error) { console.warn("[photos] could not list onboarding photos", error.message); return {}; }
      const pathByUser = new Map<string, string>();
      for (const row of data ?? []) {
        const latest = (row.onboarding_files ?? [])
          .filter((f) => f.file_type === "photo")
          .sort((a, b) => (b.uploaded_at ?? "").localeCompare(a.uploaded_at ?? ""))[0];
        if (row.user_id && latest) pathByUser.set(row.user_id, latest.cloudinary_url);
      }
      if (!pathByUser.size) return {};
      const { data: signed, error: signErr } = await supabase.storage
        .from("onboarding-files")
        .createSignedUrls([...pathByUser.values()], 60 * 60 * 6);
      if (signErr || !signed) return {};
      const urlByPath = new Map(signed.flatMap((s) => (s.signedUrl && s.path ? [[s.path, s.signedUrl] as const] : [])));
      return Object.fromEntries([...pathByUser].flatMap(([userId, path]) => {
        const url = urlByPath.get(path);
        return url ? [[userId, url]] : [];
      }));
    },
    enabled,
    staleTime: 60 * 60 * 1000,
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
