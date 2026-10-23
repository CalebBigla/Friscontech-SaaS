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
};

export async function callRpc<N extends keyof PlannedRpcs>(name: N, args: PlannedRpcs[N]): Promise<unknown> {
  const { data, error } = await (supabase as any).rpc(name, args);
  if (error) handleSupabaseError(error);
  return data;
}
