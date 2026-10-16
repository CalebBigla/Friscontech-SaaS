/**
 * React Query hooks for notifications
 * 
 * Real-time notifications for payments, stock alerts, approvals, and general messages.
 * Users see only their own notifications with read/unread state.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { queryKeys } from '@/lib/query-keys';
import { handleSupabaseError } from '@/lib/supabase-helpers';
import type { Database } from '@/types/database.types';

type NotificationRow = Database['public']['Tables']['notifications']['Row'];
type NotificationInsert = Database['public']['Tables']['notifications']['Insert'];
type NotificationUpdate = Database['public']['Tables']['notifications']['Update'];

type NotificationType = 'payment_pending' | 'payment_confirmed' | 'stock_low' | 'approval_needed' | 'general';

interface NotificationFilters {
  type?: NotificationType;
  read?: boolean;
}

/**
 * Fetch all notifications for a specific user with optional filters
 */
export function useNotifications(
  userId: string,
  filters: NotificationFilters = {}
) {
  return useQuery({
    queryKey: queryKeys.notifications.list(userId, filters),
    queryFn: async () => {
      let query = supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (filters.type) {
        query = query.eq('type', filters.type);
      }
      if (filters.read !== undefined) {
        query = query.eq('read', filters.read);
      }

      const { data, error } = await query;
      if (error) throw handleSupabaseError(error);
      return data as NotificationRow[];
    },
    enabled: !!userId,
  });
}

/**
 * Fetch unread notifications count for a user
 */
export function useUnreadNotificationsCount(userId: string) {
  return useQuery({
    queryKey: queryKeys.notifications.unreadCount(userId),
    queryFn: async () => {
      const { count, error } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('read', false);

      if (error) throw handleSupabaseError(error);
      return count ?? 0;
    },
    enabled: !!userId,
    refetchInterval: 30000, // Poll every 30 seconds for new notifications
  });
}

/**
 * Fetch unread notifications for a user
 */
export function useUnreadNotifications(userId: string) {
  return useQuery({
    queryKey: queryKeys.notifications.unread(userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .eq('read', false)
        .order('created_at', { ascending: false });

      if (error) throw handleSupabaseError(error);
      return data as NotificationRow[];
    },
    enabled: !!userId,
  });
}

/**
 * Fetch a single notification by ID
 */
export function useNotification(id: string) {
  return useQuery({
    queryKey: queryKeys.notifications.detail(id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw handleSupabaseError(error);
      return data as NotificationRow;
    },
    enabled: !!id,
  });
}

/**
 * Create a new notification
 */
export function useCreateNotification() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: NotificationInsert) => {
      const { data, error } = await supabase
        .from('notifications')
        .insert(input)
        .select()
        .single();

      if (error) throw handleSupabaseError(error);
      return data as NotificationRow;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.notifications.all(data.user_id),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.notifications.unreadCount(data.user_id),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.notifications.unread(data.user_id),
      });
    },
  });
}

/**
 * Bulk create notifications (for sending to multiple users)
 */
export function useBulkCreateNotifications() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (inputs: NotificationInsert[]) => {
      const { data, error } = await supabase
        .from('notifications')
        .insert(inputs)
        .select();

      if (error) throw handleSupabaseError(error);
      return data as NotificationRow[];
    },
    onSuccess: (data) => {
      // Invalidate queries for all affected users
      const uniqueUsers = [...new Set(data.map(n => n.user_id))];
      uniqueUsers.forEach(userId => {
        queryClient.invalidateQueries({
          queryKey: queryKeys.notifications.all(userId),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.notifications.unreadCount(userId),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.notifications.unread(userId),
        });
      });
    },
  });
}

/**
 * Mark a notification as read
 */
export function useMarkNotificationRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from('notifications')
        .update({ read: true })
        .eq('id', id)
        .select()
        .single();

      if (error) throw handleSupabaseError(error);
      return data as NotificationRow;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.notifications.all(data.user_id),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.notifications.detail(data.id),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.notifications.unreadCount(data.user_id),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.notifications.unread(data.user_id),
      });
    },
  });
}

/**
 * Mark all notifications as read for a user
 */
export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase
        .from('notifications')
        .update({ read: true })
        .eq('user_id', userId)
        .eq('read', false);

      if (error) throw handleSupabaseError(error);
      return { userId };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.notifications.all(data.userId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.notifications.unreadCount(data.userId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.notifications.unread(data.userId),
      });
    },
  });
}

/**
 * Delete a notification
 */
export function useDeleteNotification() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('id', id);

      if (error) throw handleSupabaseError(error);
      return { id };
    },
    onSuccess: () => {
      // Invalidate all notification queries since we don't have userId here
      queryClient.invalidateQueries({
        queryKey: queryKeys.notifications.all,
      });
    },
  });
}

/**
 * Delete all read notifications for a user (cleanup)
 */
export function useDeleteReadNotifications() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('user_id', userId)
        .eq('read', true);

      if (error) throw handleSupabaseError(error);
      return { userId };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.notifications.all(data.userId),
      });
    },
  });
}
