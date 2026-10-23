/**
 * User Preferences React Query Hooks
 * 
 * Data fetching and mutations for user-specific settings
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/auth-context";
import { queryKeys } from "@/lib/query-keys";
import { transformPreference, preferenceToDb } from "@/lib/type-adapters";
import { handleSupabaseError } from "@/lib/supabase-helpers";
import type { UserPreference } from "@/data/mock-db";

/**
 * Fetch preferences for current user
 */
export function usePreferences() {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: queryKeys.preferences.byUser(user?.id || ''),
    queryFn: async (): Promise<UserPreference | null> => {
      if (!user?.id) throw new Error('Not authenticated');

      const { data, error } = await (supabase as any).from('user_preferences')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) handleSupabaseError(error);

      // No row yet: callers use defaultPreferences(), which mirrors the column defaults.
      return data ? transformPreference(data) : null;
    },
    enabled: !!user?.id,
  });
}

/**
 * Update user preferences (upsert)
 */
export function useUpdatePreferences() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (updates: Partial<UserPreference>) => {
      if (!user?.id) throw new Error('Not authenticated');
      
      const dbData = preferenceToDb(updates, user.id);
      
      const { data, error } = await (supabase as any).from('user_preferences')
        .upsert(dbData, { onConflict: 'user_id' })
        .select()
        .single();
      
      if (error) handleSupabaseError(error);
      
      return transformPreference(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.preferences.byUser(user?.id || '') 
      });
    },
  });
}
