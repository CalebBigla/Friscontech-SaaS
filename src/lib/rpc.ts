/**
 * Planned database RPCs.
 *
 * Writes that must change several rows together (stock + lot + movement + audit,
 * approval + fulfilment, payment chain steps) run as ONE Postgres function so they
 * commit or fail as a unit. This file is the contract: Phase 2 creates each
 * function as a new migration with exactly these names and arguments
 * (SECURITY DEFINER, caller's profile checked inside, invalid input raised with
 * the form field name in HINT, audit row written to public.activities).
 *
 * Until a function exists, calling it fails with a "function not found" error,
 * which the screen shows as a real error.
 */
import { supabase } from "@/lib/supabase";
import { handleSupabaseError } from "@/lib/supabase-helpers";

export type PlannedRpcs = {
  /**
   * Storekeeper stock addition. Creates a pending stock_addition approval request.
   * With p_emergency, also applies the stock now: inventory record, lot
   * (opened or extended by batch number + expiry), stock_added movement, audit row.
   * Returns the approval_requests row.
   */
  add_stock: {
    p_branch_id: string;
    p_product_id: string;
    p_quantity: number;
    p_note: string | null;
    p_batch_number: string | null;
    p_expiry_date: string | null;
    p_emergency: boolean;
    p_emergency_reason: string | null;
  };
  /**
   * Stock count correction: sets quantity_on_hand to the counted quantity,
   * writes an adjustment movement for the difference, drains lots FEFO when the
   * count is lower, and writes the audit row. Returns the inventory_records row.
   */
  adjust_stock: {
    p_inventory_id: string;
    p_counted_quantity: number;
    p_reason: string;
  };
  /**
   * Sales rep stock request for their own branch. One row per product, sharing a
   * batch_id when several products are requested together. Generates the text ids
   * (stock_requests.id has no default), notifies every active storekeeper of the
   * branch, writes one audit row per request. Returns the stock_requests rows.
   */
  create_stock_requests: {
    p_branch_id: string;
    p_items: { product_id: string; quantity: number }[];
    p_note: string | null;
  };
  /** Pending → approved (quantity_approved = quantity_requested). Never touches stock. */
  approve_stock_request: {
    p_request_id: string;
  };
  /** Pending → rejected with a reason. The row is kept for history. */
  reject_stock_request: {
    p_request_id: string;
    p_reason: string;
  };
  /**
   * Approved / partially fulfilled → (partially) fulfilled. The only step that
   * deducts stock: inventory, stock_issued movement, lots drained FEFO, rep
   * notified, audit row. Must replace the existing stock_request_fulfillment
   * trigger, which skips repeat partial issues and decrements quantity_reserved.
   */
  fulfil_stock_request: {
    p_request_id: string;
    p_quantity: number;
  };
  /** The requesting rep confirms receipt of a fulfilled request. */
  acknowledge_stock_request: {
    p_request_id: string;
  };
  /**
   * Approve one or more pending approval requests, all or nothing: every request
   * is checked (pending, caller may review it, not their own) before any is applied.
   * stock_addition (non-emergency): applies the stock like add_stock's emergency path.
   * product_deactivation: sets the product inactive (soft-deactivation).
   * team_member: records the decision only; the member joins through an onboarding
   * invite, because users.id must be an auth account.
   * Writes one audit row per request. Returns the approval_requests rows.
   */
  approve_requests: {
    p_request_ids: string[];
  };
  /** Reject a pending approval request with a reason (at least 3 characters). */
  reject_request: {
    p_request_id: string;
    p_reason: string;
  };
};

export async function callRpc<N extends keyof PlannedRpcs>(name: N, args: PlannedRpcs[N]): Promise<unknown> {
  const { data, error } = await (supabase as any).rpc(name, args);
  if (error) handleSupabaseError(error);
  return data;
}
