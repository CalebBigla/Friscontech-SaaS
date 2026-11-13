/**
 * Customer exchanges (migration 20261114110000): the rep requests, the branch
 * storekeeper approves and fulfils, the rep acknowledges. Every step is an RPC.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth-context";
import { supabase } from "@/lib/supabase";
import { callRpc, type PlannedRpcs } from "@/lib/rpc";
import { handleSupabaseError } from "@/lib/supabase-helpers";
import { queryKeys } from "@/lib/query-keys";
import type { Database } from "@/types/database.types";

export type ExchangeStatus = "pending" | "approved" | "rejected" | "fulfilled";
export type Exchange = {
  id: string;
  tenantId: string;
  branchId: string;
  customerId: string;
  repId: string;
  saleId: string;
  returnedProductId: string;
  returnQuantity: number;
  replacementProductId: string;
  replacementQuantity: number;
  status: ExchangeStatus;
  reason: string;
  requestedAt: string;
  approvedBy: string | null;
  approvedAt: string | null;
  rejectedBy: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  fulfilledBy: string | null;
  fulfilledAt: string | null;
  acknowledgedAt: string | null;
  returnedValue: number | null;
  replacementValue: number | null;
  replacementSaleId: string | null;
};

type Row = Database["public"]["Tables"]["stock_exchanges"]["Row"];
const num = (v: number | null) => (v === null ? null : Number(v));
export function transformExchange(r: Row): Exchange {
  return {
    id: r.id, tenantId: r.tenant_id, branchId: r.branch_id, customerId: r.customer_id, repId: r.rep_id, saleId: r.sale_id,
    returnedProductId: r.returned_product_id, returnQuantity: r.return_quantity,
    replacementProductId: r.replacement_product_id, replacementQuantity: r.replacement_quantity,
    status: r.status as ExchangeStatus, reason: r.reason, requestedAt: r.requested_at,
    approvedBy: r.approved_by, approvedAt: r.approved_at, rejectedBy: r.rejected_by, rejectedAt: r.rejected_at,
    rejectionReason: r.rejection_reason, fulfilledBy: r.fulfilled_by, fulfilledAt: r.fulfilled_at,
    acknowledgedAt: r.acknowledged_at, returnedValue: num(r.returned_value), replacementValue: num(r.replacement_value),
    replacementSaleId: r.replacement_sale_id,
  };
}

/** What the exchange did to the customer's account once fulfilled: + they owe more, - they gained credit. */
export const exchangeDifference = (e: Exchange) =>
  e.returnedValue === null || e.replacementValue === null ? null : e.replacementValue - e.returnedValue;

export function useExchanges() {
  const { user } = useAuth();
  return useQuery({
    queryKey: queryKeys.exchanges.all(user?.tenantId ?? ""),
    queryFn: async (): Promise<Exchange[]> => {
      const { data, error } = await supabase.from("stock_exchanges").select("*").order("requested_at", { ascending: false });
      if (error) handleSupabaseError(error);
      return (data ?? []).map(transformExchange);
    },
    enabled: !!user?.tenantId,
  });
}

/** An exchange moves stock, sales, the customer's ledger, notifications and the audit log. */
function useExchangeMutation<N extends "request_exchange" | "approve_exchange" | "reject_exchange" | "fulfil_exchange" | "acknowledge_exchange">(name: N) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const tenantId = user?.tenantId ?? "";
  return useMutation({
    mutationFn: async (args: PlannedRpcs[N]) => transformExchange((await callRpc(name, args)) as Row),
    onSuccess: () => {
      for (const key of [queryKeys.exchanges.all(tenantId), queryKeys.sales.all(tenantId), queryKeys.inventory.all(tenantId),
        queryKeys.customers.root(), queryKeys.notifications.root(), queryKeys.activities.all(tenantId)]) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
    },
  });
}
export const useRequestExchange = () => useExchangeMutation("request_exchange");
export const useApproveExchange = () => useExchangeMutation("approve_exchange");
export const useRejectExchange = () => useExchangeMutation("reject_exchange");
export const useFulfilExchange = () => useExchangeMutation("fulfil_exchange");
export const useAcknowledgeExchange = () => useExchangeMutation("acknowledge_exchange");
