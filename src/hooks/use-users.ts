/**
 * Users/Team React Query Hooks
 * 
 * Data fetching and mutations for user/team management
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/auth-context";
import { queryKeys } from "@/lib/query-keys";
import { transformUser, userToDb } from "@/lib/type-adapters";
import { handleSupabaseError } from "@/lib/supabase-helpers";
import type { User, Role } from "@/data/mock-db";

/**
 * Fetch all users for the current tenant (scoped by role)
 */
export function useUsers() {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: queryKeys.users.all(user?.tenantId || ''),
    queryFn: async () => {
      if (!user?.tenantId) throw new Error('Not authenticated');
      
      const { data, error } = await (supabase as any).from('users')
        .select('*')
        .eq('tenant_id', user.tenantId)
        .eq('status', 'active')
        .not('role', 'is', null)
        .order('first_name');
      
      if (error) handleSupabaseError(error);
      
      return (data || []).map(transformUser);
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
      
      const { data, error } = await (supabase as any).from('users')
        .select('*')
        .eq('branch_id', branchId)
        .order('first_name');
      
      if (error) handleSupabaseError(error);
      
      return (data || []).map(transformUser);
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
      
      const { data, error } = await (supabase as any).from('users')
        .select('*')
        .eq('tenant_id', user.tenantId)
        .eq('role', role)
        .order('first_name');
      
      if (error) handleSupabaseError(error);
      
      return (data || []).map(transformUser);
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
      
      const { data, error } = await (supabase as any).from('users')
        .select('*')
        .eq('id', userId)
        .single();
      
      if (error) handleSupabaseError(error);
      
      return transformUser(data);
    },
    enabled: !!userId,
  });
}

/**
 * Create a new user (via onboarding or manual)
 */
export function useCreateUser() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (input: Partial<User>) => {
      if (!user?.tenantId) throw new Error('Not authenticated');
      
      const dbData = userToDb(input, user.tenantId);
      
      const { data, error } = await (supabase as any).from('users')
        .insert(dbData)
        .select()
        .single();
      
      if (error) handleSupabaseError(error);
      
      return transformUser(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.users.all(user?.tenantId || '') 
      });
    },
  });
}

/**
 * Update an existing user
 */
export function useUpdateUser() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<User> }) => {
      if (!user?.tenantId) throw new Error('Not authenticated');
      
      const dbData = userToDb(updates, user.tenantId);
      
      const { data, error } = await (supabase as any).from('users')
        .update(dbData)
        .eq('id', id)
        .select()
        .single();
      
      if (error) handleSupabaseError(error);
      
      return transformUser(data);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.users.all(user?.tenantId || '') 
      });
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.users.detail(data.id) 
      });
      if (data.branchId) {
        queryClient.invalidateQueries({ 
          queryKey: queryKeys.users.byBranch(data.branchId) 
        });
      }
    },
  });
}

/**
 * Deactivate a user (soft delete)
 */
export function useDeactivateUser() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (userId: string) => {
      if (!user?.tenantId) throw new Error('Not authenticated');
      
      const { data, error } = await (supabase as any).from('users')
        .update({ 
          status: 'inactive',
          deactivated_at: new Date().toISOString(),
        })
        .eq('id', userId)
        .select()
        .single();
      
      if (error) handleSupabaseError(error);
      
      return transformUser(data);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.users.all(user?.tenantId || '') 
      });
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.users.detail(data.id) 
      });
    },
  });
}

/**
 * Reactivate a deactivated user
 */
export function useReactivateUser() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (userId: string) => {
      if (!user?.tenantId) throw new Error('Not authenticated');
      
      const { data, error } = await (supabase as any).from('users')
        .update({ 
          status: 'active',
          deactivated_at: null,
        })
        .eq('id', userId)
        .select()
        .single();
      
      if (error) handleSupabaseError(error);
      
      return transformUser(data);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.users.all(user?.tenantId || '') 
      });
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.users.detail(data.id) 
      });
    },
  });
}
