/**
 * Users/Team React Query Hooks
 * 
 * Data fetching and mutations for user/team management
 */

import { useQuery, useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { callRpc, type PlannedRpcs } from "@/lib/rpc";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/auth-context";
import { queryKeys } from "@/lib/query-keys";
import { transformApprovalRequest, transformUser, type ApprovalRequestMigrationRow } from "@/lib/type-adapters";
import { handleSupabaseError } from "@/lib/supabase-helpers";
import type { ApprovalRequest, User, Role } from "@/data/mock-db";

/**
 * Fetch all users for the current tenant (scoped by role)
 */
export function useUsers() {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: queryKeys.users.all(user?.tenantId || ''),
    queryFn: async (): Promise<User[]> => {
      if (!user?.tenantId) throw new Error('Not authenticated');
      
      const { data, error } = await supabase.from('users')
        .select('*')
        .eq('tenant_id', user.tenantId)
        // All statuses: deactivated staff stay visible (soft-deactivation).
        // Profiles without a role are pending onboarding and listed separately.
        .not('role', 'is', null)
        .order('first_name');
      
      if (error) handleSupabaseError(error);
      
      return (data || []).map((row) => transformUser(row as Parameters<typeof transformUser>[0]));
    },
    enabled: !!user?.tenantId,
  });
}

/**
 * Fetch users by branch (for managers viewing their branch staff)
 */
export function useUsersByBranch(branchId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.users.byBranch(branchId || ''),
    queryFn: async () => {
      if (!branchId) throw new Error('Branch ID required');
      
      const { data, error } = await supabase.from('users')
        .select('*')
        .eq('branch_id', branchId)
        .order('first_name');
      
      if (error) handleSupabaseError(error);
      
      return (data || []).map((row) => transformUser(row as Parameters<typeof transformUser>[0]));
    },
    enabled: !!branchId,
  });
}

/**
 * Fetch users by role
 */
export function useUsersByRole(role: Role) {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: queryKeys.users.byRole(user?.tenantId || '', role),
    queryFn: async () => {
      if (!user?.tenantId) throw new Error('Not authenticated');
      
      const { data, error } = await supabase.from('users')
        .select('*')
        .eq('tenant_id', user.tenantId)
        .eq('role', role)
        .order('first_name');
      
      if (error) handleSupabaseError(error);
      
      return (data || []).map((row) => transformUser(row as Parameters<typeof transformUser>[0]));
    },
    enabled: !!user?.tenantId,
  });
}

/**
 * Fetch a single user by ID
 */
export function useUser(userId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.users.detail(userId || ''),
    queryFn: async () => {
      if (!userId) throw new Error('User ID required');
      
      const { data, error } = await supabase.from('users')
        .select('*')
        .eq('id', userId)
        .single();
      
      if (error) handleSupabaseError(error);
      
      return transformUser(data as Parameters<typeof transformUser>[0]);
    },
    enabled: !!userId,
  });
}

/** Team changes touch users, branches (manager assignment), approvals and the audit log. */
function invalidateTeam(queryClient: QueryClient, tenantId: string) {
  void queryClient.invalidateQueries({ queryKey: queryKeys.users.all(tenantId) });
  void queryClient.invalidateQueries({ queryKey: queryKeys.branches.all(tenantId) });
  void queryClient.invalidateQueries({ queryKey: queryKeys.approvals.all(tenantId) });
  void queryClient.invalidateQueries({ queryKey: queryKeys.activities.all(tenantId) });
}

function useTeamMutation<N extends "update_team_member" | "set_team_member_status">(name: N) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (args: PlannedRpcs[N]): Promise<User> => {
      const row = await callRpc(name, args);
      return transformUser(row as Parameters<typeof transformUser>[0]);
    },
    onSuccess: () => invalidateTeam(queryClient, user?.tenantId ?? ''),
  });
}

/** Edit a member (RPC update_team_member). */
export const useUpdateTeamMember = () => useTeamMutation('update_team_member');
/** Soft (de)activation (RPC set_team_member_status). */
export const useSetTeamMemberStatus = () => useTeamMutation('set_team_member_status');

/** Manager proposes a new member for Owner approval (RPC request_team_member). */
export function useRequestTeamMember() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (args: PlannedRpcs['request_team_member']): Promise<ApprovalRequest> => {
      const row = await callRpc('request_team_member', args);
      return transformApprovalRequest(row as ApprovalRequestMigrationRow);
    },
    onSuccess: () => invalidateTeam(queryClient, user?.tenantId ?? ''),
  });
}
