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
import type { Database } from "@/types/database.types";

export type PlannedRpcs = {
  /**
   * Stock addition to the central stock (inventory_records). Expiry date required.
   * Owner: applied immediately (approval row recorded as approved).
   * Storekeeper: pending stock_addition approval for the manager; with p_emergency
   * it is applied now and reviewed afterwards.
   * Applying = inventory record, lot (batch number generated when blank),
   * stock_added movement, audit row. Returns the approval_requests row.
   */
  add_stock: {
    p_branch_id: string;
    p_product_id: string;
    p_quantity: number;
    p_note: string | null;
    p_batch_number: string | null;
    p_expiry_date: string;
    p_emergency: boolean;
    p_emergency_reason: string | null;
    /** Same key while the form is open: a retried submit returns the first result. */
    p_idempotency_key: string;
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
    /** Same key while the form is open: a retried submit returns the first result. */
    p_idempotency_key: string;
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
   * deducts stock: quantity_on_hand (stock is never reserved), stock_issued
   * movement, lots drained FEFO, rep notified, audit row. Replaces the
   * stock_request_fulfillment trigger, which skipped repeat partial issues and
   * decremented quantity_reserved.
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
  /**
   * Sales rep adds a customer to their own branch (branch_id = caller's branch,
   * created_by = caller). Phone must be unique in the tenant. Returns the customers row.
   */
  create_customer: {
    p_name: string;
    p_contact_person: string;
    p_phone: string;
    p_email: string | null;
    p_address: string;
  };
  /** Sales rep edits a customer of their own branch. Returns the customers row. */
  update_customer: {
    p_customer_id: string;
    p_name: string;
    p_contact_person: string;
    p_phone: string;
    p_email: string | null;
    p_address: string;
  };
  /** Soft (de)activation; customers are never deleted. Returns the customers row. */
  set_customer_status: {
    p_customer_id: string;
    p_status: "active" | "inactive";
  };
  /** Owner sets or clears (null) a credit limit. Returns the customers row. */
  set_customer_credit_limit: {
    p_customer_id: string;
    p_credit_limit: number | null;
  };
  /**
   * Payment chain step 1: sales rep records a customer payment (status submitted,
   * manager_id = the branch manager). Notifies the manager. Returns the
   * customer_payments row.
   */
  record_customer_payment: {
    p_customer_id: string;
    p_amount: number;
    p_method: "cash" | "transfer";
    p_reference: string | null;
    p_payment_date: string;
    p_order_id: string | null;
    p_note: string | null;
    /** Same key while the form is open: a retried submit returns the first result. */
    p_idempotency_key: string;
  };
  /**
   * Payment chain step 2: the branch manager acknowledges a submitted payment
   * (transfer needs a reference). Notifies the owners.
   */
  acknowledge_customer_payment: {
    p_payment_id: string;
    p_transfer_reference: string | null;
    p_proof_name: string | null;
  };
  /** Payment chain step 3: owner confirms a submitted or acknowledged payment. Notifies the rep. */
  confirm_customer_payment: {
    p_payment_id: string;
  };
  /**
   * Decline with a reason: a manager only while submitted, the owner while
   * submitted or acknowledged. Notifies the rep.
   */
  decline_customer_payment: {
    p_payment_id: string;
    p_reason: string;
  };
  /**
   * Payment chain step 1 for rep collections: the sales rep submits cash/transfer
   * for a month (cannot exceed their sales minus earlier non-declined payments).
   * Generates the text id (payments.id has no default), sets manager_id to the
   * branch manager. Returns the payments row.
   * Must replace the payment_status_notification trigger, which reads the dropped
   * users.name column (so every insert fails) and notifies only one owner.
   */
  submit_payment: {
    p_period: string;
    p_cash_amount: number;
    p_transfer_amount: number;
    p_transfer_reference: string | null;
    p_note: string | null;
    /** Same key while the form is open: a retried submit returns the first result. */
    p_idempotency_key: string;
  };
  /** Step 2: the assigned branch manager acknowledges (a transfer needs its reference). */
  acknowledge_payment: {
    p_payment_id: string;
    p_transfer_reference: string | null;
    p_proof_name: string | null;
  };
  /** Step 3: the owner confirms a submitted or acknowledged payment. */
  confirm_payment: {
    p_payment_id: string;
  };
  /** Decline with a reason: a manager while submitted, the owner while submitted or acknowledged. */
  decline_payment: {
    p_payment_id: string;
    p_reason: string;
  };
  /**
   * Owner (company expense, optional branch) or the branch's assigned manager
   * (branch = their branch) records an expense. Generates the text id
   * (expenses.id has no default). Returns the expenses row.
   */
  create_expense: {
    p_category: string;
    p_amount: number;
    p_expense_date: string;
    p_description: string;
    p_note: string | null;
    p_branch_id: string | null;
    /** Same key while the form is open: a retried submit returns the first result. */
    p_idempotency_key: string;
  };
  /** Edit a recorded expense the caller owns (managers cannot move it to another branch). */
  update_expense: {
    p_expense_id: string;
    p_category: string;
    p_amount: number;
    p_expense_date: string;
    p_description: string;
    p_note: string | null;
    p_branch_id: string | null;
  };
  /** Void a recorded expense; the reason goes in the audit row (no column for it). */
  void_expense: {
    p_expense_id: string;
    p_reason: string;
  };
  /**
   * Branch manager remits a month. The server computes total_received (the
   * manager's acknowledged rep payments), expense_amount, net_remittance_due,
   * outstanding_amount, payment_ids and expense_ids; cash + transfer + outstanding
   * must reconcile to net due. One submitted remittance per manager and period.
   * Returns the manager_remittances row.
   */
  submit_manager_remittance: {
    p_period: string;
    p_cash_amount: number;
    p_transfer_amount: number;
    p_transfer_reference: string | null;
    p_note: string | null;
  };
  /** Owner confirms a submitted manager remittance. */
  confirm_manager_remittance: {
    p_remittance_id: string;
  };
  /** Owner declines a submitted manager remittance with a reason. */
  decline_manager_remittance: {
    p_remittance_id: string;
    p_reason: string;
  };
  /**
   * Owner records money paid out of the business to an external payee (supplier,
   * landlord, …). Not part of the payment chain: no review step. Cash or transfer.
   * Generates the text id (owner_remittances.id has no default). Returns the row.
   */
  create_owner_remittance: {
    p_payee_type: "supplier" | "landlord" | "utility" | "contractor" | "other";
    p_payee_name: string;
    p_amount: number;
    p_payment_method: "cash" | "transfer";
    p_reference: string | null;
    p_remittance_date: string;
    p_purpose: string;
    p_note: string | null;
    /** Same key while the form is open: a retried submit returns the first result. */
    p_idempotency_key: string;
  };
  /**
   * Owner sets a monthly rep target (scope rep, branch = the rep's branch, amount
   * rounded). One target per rep and month. Returns the targets row.
   */
  create_target: {
    p_rep_id: string;
    p_month: string;
    p_amount: number;
  };
  /** Owner changes a rep target's amount only. Returns the targets row. */
  update_target_amount: {
    p_target_id: string;
    p_amount: number;
  };
  /**
   * Add a catalogue product (SKU upper-cased, unique per tenant) and open
   * zero-stock inventory records in the caller's branches (all active branches
   * for the owner), threshold = product threshold, reorder level = 2 × threshold.
   * Returns the products row.
   */
  create_product: {
    p_name: string;
    p_sku: string;
    p_category: string;
    p_unit: string;
    p_unit_price: number;
    p_unit_cost: number;
    p_low_stock_threshold: number;
    p_description: string | null;
  };
  /**
   * Edit catalogue fields. Branch thresholds still equal to the old product
   * threshold follow the new one. Returns the products row.
   */
  update_product: {
    p_product_id: string;
    p_name: string;
    p_sku: string;
    p_category: string;
    p_unit: string;
    p_unit_price: number;
    p_unit_cost: number;
    p_low_stock_threshold: number;
    p_description: string | null;
  };
  /**
   * EXISTS (20261020130000_reconcile_core_table_rls.sql) but is manager-only and
   * writes no audit row. Phase 2 must widen it in a new migration (same signature):
   * owner or manager may deactivate; owner, manager or storekeeper may reactivate;
   * write the audit row. Returns the products row.
   */
  set_product_status: {
    p_product_id: string;
    p_status: "active" | "inactive";
  };
  /** Storekeeper asks their manager to deactivate (pending product_deactivation approval). */
  request_product_deactivation: {
    p_product_id: string;
    p_reason: string;
  };
  /**
   * Bulk import, one transaction. Each row creates or (p_mode = update) updates a
   * product by SKU, or is skipped (p_mode = skip). New products get inventory
   * records like create_product. Opening quantity is added to p_branch_id with the
   * row's batch/expiry (lot opened or extended). Returns
   * { created, updated, skipped, failed, failures: [{ row_number, sku, name, reason }] }.
   */
  import_products: {
    p_rows: {
      row_number: number;
      name: string;
      sku: string;
      category: string;
      unit: string;
      unit_price: number;
      unit_cost: number;
      low_stock_threshold: number;
      description: string | null;
      opening_quantity: number;
      batch_number: string | null;
      expiry_date: string | null;
    }[];
    p_mode: "update" | "skip";
    p_branch_id: string | null;
    /** Same key while the form is open: a retried submit returns the first result. */
    p_idempotency_key: string;
  };
  /**
   * Manager proposes a new member: a pending team_member approval request with
   * member_data { name, email, role, branchId }. Email must be unused and not
   * already pending. Returns the approval_requests row.
   */
  request_team_member: {
    p_name: string;
    p_email: string;
    p_role: "owner" | "manager" | "storekeeper" | "sales_rep";
    p_branch_id: string | null;
  };
  /**
   * Edit a member (owner: anyone but themselves; manager: their branch staff).
   * Sets users.manager_id from the branch for storekeepers and sales reps, keeps
   * branches.manager_id in sync when a manager is (re)assigned, and writes audit
   * rows for edit / role change / branch change / status change. The email is
   * verified at sign-up and never changes here. Returns the users row.
   */
  update_team_member: {
    p_user_id: string;
    p_first_name: string;
    p_last_name: string;
    p_role: "owner" | "manager" | "storekeeper" | "sales_rep";
    p_branch_id: string | null;
    p_status: "active" | "inactive" | "pending";
  };
  /** Soft (de)activation of a member; never deletes. Returns the users row. */
  set_team_member_status: {
    p_user_id: string;
    p_status: "active" | "inactive";
  };
  /**
   * Owner updates the business profile. Null means "leave unchanged"; one audit
   * row lists the changed fields. Expiry alerts: 1–12 months (default 6).
   * Returns the tenants row.
   */
  update_tenant_settings: {
    p_name: string | null;
    p_business_email: string | null;
    p_phone: string | null;
    p_timezone: string | null;
    p_legal_name: string | null;
    p_expiry_alert_months: number | null;
  };
  /** The caller's own display preferences (upsert) plus the audit row. Returns the user_preferences row. */
  update_preferences: {
    p_date_format: "MMM D, YYYY" | "DD/MM/YYYY" | "YYYY-MM-DD";
    p_default_report_period: "today" | "week" | "month" | "quarter";
  };
};

type Functions = Database["public"]["Functions"];

export async function callRpc<N extends keyof PlannedRpcs & keyof Functions>(name: N, args: PlannedRpcs[N]): Promise<unknown> {
  // PlannedRpcs is the stricter contract (exact values, explicit NULLs). Generated Args
  // type nullable SQL arguments as non-null, so the call narrows to them here.
  const { data, error } = await supabase.rpc(name, args as unknown as Functions[N]["Args"]);
  if (error) handleSupabaseError(error);
  return data;
}
