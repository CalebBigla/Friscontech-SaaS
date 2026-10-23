/**
 * React Query hooks for notifications (Supabase-backed, real schema).
 *
 * DB schema: recipient_id, read_at (TIMESTAMPTZ, nullable), entity_type, entity_id,
 * message, type (CHECK-constrained). RLS: a recipient only sees their own rows.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { queryKeys } from "@/lib/query-keys";
import { handleSupabaseError } from "@/lib/supabase-helpers";
import { transformNotification } from "@/lib/type-adapters";
import type { AppNotification } from "@/data/mock-db";

interface NotificationFilters {
  read?: boolean;
}

/** All notifications for the signed-in user (RLS filters to their rows). */
export function useNotifications(userId: string, filters: NotificationFilters = {}) {
  return useQuery({
    queryKey: queryKeys.notifications.list(userId, filters as any),
    queryFn: async (): Promise<AppNotification[]> => {
      let q = (supabase as any)
        .from("notifications")
        .select("*")
        .eq("recipient_id", userId)
        .order("created_at", { ascending: false });
      if (filters.read === true) q = q.is("read_at", null);
      if (filters.read === false) q = q.not("read_at", "is", null);
      const { data, error } = await q;
      if (error) throw handleSupabaseError(error);
      return (data || []).map(transformNotification);
    },
    enabled: !!userId,
  });
}

/** Unread count for the bell badge. */
export function useUnreadNotificationsCount(userId: string) {
  return useQuery({
    queryKey: queryKeys.notifications.unreadCount(userId),
    queryFn: async () => {
      const { count, error } = await (supabase as any)
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("recipient_id", userId)
        .is("read_at", null);
      if (error) throw handleSupabaseError(error);
      return count ?? 0;
    },
    enabled: !!userId,
    refetchInterval: 30000,
  });
}

/** Unread notifications list. */
export function useUnreadNotifications(userId: string) {
  return useQuery({
    queryKey: queryKeys.notifications.unread(userId),
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("notifications")
        .select("*")
        .eq("recipient_id", userId)
        .is("read_at", null)
        .order("created_at", { ascending: false });
      if (error) throw handleSupabaseError(error);
      return (data || []).map(transformNotification);
    },
    enabled: !!userId,
  });
}

/** Mark a single notification as read (RLS: recipient only). */
export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await (supabase as any)
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("id", id)
        .is("read_at", null)
        .select()
        .maybeSingle();
      if (error) throw handleSupabaseError(error);
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.root() });
    },
  });
}

/** Mark all of a user's notifications as read. */
export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await (supabase as any)
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("recipient_id", userId)
        .is("read_at", null);
      if (error) throw handleSupabaseError(error);
      return { userId };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.root() });
    },
  });
}
