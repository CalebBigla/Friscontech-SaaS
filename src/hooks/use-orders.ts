/**
 * Customer orders (migration 20261116100000): a rep raises an order from the
 * customer's order book, the branch storekeeper fulfils it, the rep acknowledges.
 * Raising reserves the stock; fulfilling deducts it once. Every step is an RPC.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth-context";
import { callRpc, type PlannedRpcs } from "@/lib/rpc";
import { queryKeys } from "@/lib/query-keys";

export type OrderStatus = "pending" | "fulfilled" | "acknowledged" | "cancelled";
export type OrderLine = {
  saleId: string;
  productId: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  isPromo: boolean;
  status: "pending" | "completed" | "voided";
};
export type CustomerOrderRecord = {
  id: string;
  code: string;
  branchId: string;
  customerId: string;
  customerName: string;
  repId: string;
  status: OrderStatus;
  note: string | null;
  createdAt: string;
  fulfilledAt: string | null;
  fulfilledBy: string | null;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
  cancelledAt: string | null;
  cancelledBy: string | null;
  cancelReason: string | null;
  lines: OrderLine[];
};

type RawLine = { sale_id: string; product_id: string; quantity: number; unit_price: number; line_total: number; is_promo: boolean; status: string };
type RawOrder = {
  id: string; code: string; branch_id: string; customer_id: string; customer_name: string; rep_id: string; status: string;
  note: string | null; created_at: string; fulfilled_at: string | null; fulfilled_by: string | null; acknowledged_at: string | null;
  acknowledged_by: string | null; cancelled_at: string | null; cancelled_by: string | null; cancel_reason: string | null; lines: RawLine[] | null;
};

const toOrder = (r: RawOrder): CustomerOrderRecord => ({
  id: r.id, code: r.code, branchId: r.branch_id, customerId: r.customer_id, customerName: r.customer_name, repId: r.rep_id,
  status: r.status as OrderStatus, note: r.note, createdAt: r.created_at, fulfilledAt: r.fulfilled_at, fulfilledBy: r.fulfilled_by,
  acknowledgedAt: r.acknowledged_at, acknowledgedBy: r.acknowledged_by, cancelledAt: r.cancelled_at, cancelledBy: r.cancelled_by,
  cancelReason: r.cancel_reason,
  lines: (r.lines ?? []).map((l) => ({
    saleId: l.sale_id, productId: l.product_id, quantity: Number(l.quantity), unitPrice: Number(l.unit_price),
    lineTotal: Number(l.line_total), isPromo: l.is_promo, status: l.status as OrderLine["status"],
  })),
});

export const orderTotal = (o: CustomerOrderRecord) => o.lines.reduce((sum, l) => sum + (l.status === "voided" ? 0 : l.lineTotal), 0);

export const orderStatusView: Record<OrderStatus, { label: string; tone: string }> = {
  pending: { label: "Waiting for fulfilment", tone: "status-warning" },
  fulfilled: { label: "Fulfilled · rep to acknowledge", tone: "status-violet" },
  acknowledged: { label: "Completed", tone: "status-success" },
  cancelled: { label: "Cancelled", tone: "status-danger" },
};

/** Orders the signed-in user may see: Owner all, manager and storekeeper their branch, a rep their own. */
export function useCustomerOrders(enabled = true) {
  const { user } = useAuth();
  return useQuery({
    queryKey: queryKeys.orders.all(user?.tenantId ?? ""),
    queryFn: async () => ((await callRpc("get_customer_orders", {})) as RawOrder[]).map(toOrder),
    enabled: enabled && !!user?.tenantId,
  });
}

/** An order step moves stock, sales, the customer's ledger, notifications and the audit log. */
function useOrderMutation<N extends "place_customer_order" | "fulfil_customer_order" | "acknowledge_customer_order" | "cancel_customer_order">(name: N) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const tenantId = user?.tenantId ?? "";
  return useMutation({
    mutationFn: async (args: PlannedRpcs[N]) => (await callRpc(name, args)) as { id: string; code: string; status: OrderStatus },
    onSuccess: () => {
      for (const key of [queryKeys.orders.all(tenantId), queryKeys.sales.all(tenantId), queryKeys.inventory.all(tenantId),
        queryKeys.customers.root(), queryKeys.notifications.root(), queryKeys.activities.all(tenantId)]) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
    },
  });
}
export const usePlaceOrder = () => useOrderMutation("place_customer_order");
export const useFulfilOrder = () => useOrderMutation("fulfil_customer_order");
export const useAcknowledgeOrder = () => useOrderMutation("acknowledge_customer_order");
export const useCancelOrder = () => useOrderMutation("cancel_customer_order");
