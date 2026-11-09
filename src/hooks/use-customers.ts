/**
 * Customers React Query Hooks
 * 
 * Data fetching and mutations for customer management
 */

import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/auth-context";
import { queryKeys } from "@/lib/query-keys";
import { transformCustomer, transformCustomerPayment, transformSale, type CustomerMigrationRow, type CustomerPaymentMigrationRow } from "@/lib/type-adapters";
import { callRpc, type PlannedRpcs } from "@/lib/rpc";
import { handleSupabaseError, type Row } from "@/lib/supabase-helpers";
import { withCustomerLedgers } from "@/lib/customer-calculations";
import type { AccessScope } from "@/lib/session";
import type { Customer, Db } from "@/data/mock-db";

/**
 * Fetch all customers for tenant
 */
export function useCustomers() {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: queryKeys.customers.all(user?.tenantId || ''),
    queryFn: async (): Promise<Customer[]> => {
      if (!user?.tenantId) throw new Error('Not authenticated');
      
      const { data, error } = await supabase.from('customers')
        .select('*')
        .eq('tenant_id', user.tenantId)
        .order('name');
      
      if (error) handleSupabaseError(error);
      
      const customers = (data || []).map((row) => transformCustomer(row as Parameters<typeof transformCustomer>[0]));
      if (user.role !== "sales_rep") return customers;
      // Customers since moved to another rep: names only, so the rep's own history still reads
      // properly. They have no assigned rep here, so no customer screen lists them.
      const former = (await callRpc("get_former_customer_names", {})) as { id: string; name: string }[];
      return [...customers, ...former.map((c): Customer => ({
        id: c.id, tenantId: user.tenantId, branchId: null, name: c.name, contactPerson: "", phone: "", email: "", address: "",
        status: "inactive", createdBy: "", assignedRepId: null, createdAt: "", updatedAt: "",
      }))];
    },
    enabled: !!user?.tenantId,
  });
}

/**
 * Fetch customers by branch
 */
export function useCustomersByBranch(branchId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.customers.byBranch(branchId || ''),
    queryFn: async () => {
      if (!branchId) throw new Error('Branch ID required');
      
      const { data, error } = await supabase.from('customers')
        .select('*')
        .eq('branch_id', branchId)
        .order('name');
      
      if (error) handleSupabaseError(error);
      
      return (data || []).map((row) => transformCustomer(row as Parameters<typeof transformCustomer>[0]));
    },
    enabled: !!branchId,
  });
}

/**
 * Fetch single customer
 */
export function useCustomer(customerId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.customers.detail(customerId || ''),
    queryFn: async (): Promise<Customer> => {
      if (!customerId) throw new Error('Customer ID required');
      
      const { data, error } = await supabase.from('customers')
        .select('*')
        .eq('id', customerId)
        .single();
      
      if (error) handleSupabaseError(error);
      
      return transformCustomer(data as Parameters<typeof transformCustomer>[0]);
    },
    enabled: !!customerId,
  });
}

/**
 * The workspace with the full ledger of the rep's assigned customers added. For customer
 * accounts only: the rest of the app keeps the rep's own sales, so revenue and targets
 * never include another rep's sales. Other roles already load what they may see.
 */
export function useCustomerAccounts(db: Db, scope: AccessScope) {
  const isRep = !!scope.repId;
  const query = useQuery({
    queryKey: queryKeys.customers.ledgers(scope.user.id),
    queryFn: async () => {
      const data = (await callRpc("get_assigned_customer_ledgers", {})) as { sales: Row<"sales">[]; payments: CustomerPaymentMigrationRow[] };
      return { sales: data.sales.map(transformSale), payments: data.payments.map(transformCustomerPayment) };
    },
    enabled: isRep,
  });
  const accounts = useMemo(() => (query.data ? withCustomerLedgers(db, query.data) : db), [db, query.data]);
  return { accounts, isLoading: isRep && query.isLoading, error: query.error };
}

/** Customer writes change customer lists and the audit log. */
function useCustomerMutation<N extends "create_customer" | "update_customer" | "set_customer_status" | "set_customer_credit_limit">(name: N) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (args: PlannedRpcs[N]): Promise<Customer> => {
      const row = await callRpc(name, args);
      return transformCustomer(row as CustomerMigrationRow);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.customers.root() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.activities.all(user?.tenantId ?? "") });
    },
  });
}

/** Sales rep adds a customer (RPC create_customer). */
export const useCreateCustomer = () => useCustomerMutation("create_customer");
/** Sales rep edits a customer (RPC update_customer). */
export const useUpdateCustomer = () => useCustomerMutation("update_customer");
/** Soft (de)activation (RPC set_customer_status). */
export const useSetCustomerStatus = () => useCustomerMutation("set_customer_status");
/** Owner sets the credit limit (RPC set_customer_credit_limit). */
export const useSetCustomerCreditLimit = () => useCustomerMutation("set_customer_credit_limit");

/** Owner moves customers to another rep (RPC reassign_customers). */
export function useReassignCustomers() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (args: PlannedRpcs["reassign_customers"]): Promise<Customer[]> => {
      const rows = await callRpc("reassign_customers", args);
      return (rows as CustomerMigrationRow[]).map(transformCustomer);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.customers.root() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.activities.all(user?.tenantId ?? "") });
    },
  });
}
