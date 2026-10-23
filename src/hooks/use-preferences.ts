/**
 * User Preferences React Query Hooks
 * 
 * Data fetching and mutations for user-specific settings
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/auth-context";
import { queryKeys } from "@/lib/query-keys";
import { transformPreference, type UserPreferenceMigrationRow } from "@/lib/type-adapters";
import { callRpc, type PlannedRpcs } from "@/lib/rpc";
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

/** Save the caller's own preferences (RPC update_preferences). */
export function useUpdatePreferences() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (args: PlannedRpcs['update_preferences']): Promise<UserPreference> => {
      const row = await callRpc('update_preferences', args);
      return transformPreference(row as UserPreferenceMigrationRow);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.preferences.byUser(user?.id || '') });
      void queryClient.invalidateQueries({ queryKey: queryKeys.activities.all(user?.tenantId || '') });
    },
  });
}
