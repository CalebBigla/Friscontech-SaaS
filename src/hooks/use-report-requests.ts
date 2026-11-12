/**
 * Supervisor report requests (migration 20261113110000). A Supervisor asks for a
 * report, the Owner approves or rejects it, and the approved report's data comes
 * from get_report_data: the Supervisor reads no business tables directly.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth-context";
import { supabase } from "@/lib/supabase";
import { callRpc, type PlannedRpcs } from "@/lib/rpc";
import { handleSupabaseError } from "@/lib/supabase-helpers";
import { queryKeys } from "@/lib/query-keys";
import type { Database } from "@/types/database.types";

export type ReportRequestType = "sales" | "inventory";
export type ReportRequestStatus = "pending" | "approved" | "rejected";
export type ReportRequest = {
  id: string;
  tenantId: string;
  requestedBy: string;
  reportType: ReportRequestType;
  branchId: string | null;
  periodFrom: string;
  periodTo: string;
  note: string | null;
  status: ReportRequestStatus;
  reviewedBy: string | null;
  reviewedAt: string | null;
  rejectionReason: string | null;
  expiresAt: string | null;
  createdAt: string;
};

type Row = Database["public"]["Tables"]["report_requests"]["Row"];
export function transformReportRequest(r: Row): ReportRequest {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    requestedBy: r.requested_by,
    reportType: r.report_type as ReportRequestType,
    branchId: r.branch_id,
    periodFrom: r.period_from,
    periodTo: r.period_to,
    note: r.note,
    status: r.status as ReportRequestStatus,
    reviewedBy: r.reviewed_by,
    reviewedAt: r.reviewed_at,
    rejectionReason: r.rejection_reason,
    expiresAt: r.expires_at,
    createdAt: r.created_at,
  };
}

/** An approved request the Supervisor can still open. */
export const isOpenable = (r: ReportRequest, now = new Date().toISOString()) =>
  r.status === "approved" && !!r.expiresAt && r.expiresAt > now;

export type ReportData = {
  request: Row;
  branches: { id: string; name: string }[];
  products: { id: string; name: string; sku: string; category: string; unit: string; unit_price: number; product_type: string; status: string }[];
  people: { id: string; name: string; role: string }[];
  sales: {
    id: string; code: string; sale_date: string; created_at: string; branch_id: string; sales_rep_id: string; product_id: string;
    is_customer_sale: boolean; quantity: number; unit_price: number; discount_amount: number; line_total: number; is_promo: boolean;
  }[];
  inventory: { branch_id: string; product_id: string; quantity_on_hand: number; quantity_reserved: number; low_stock_threshold: number }[];
};

/** The caller's report requests: a Supervisor sees their own, the Owner sees all. */
export function useReportRequests(enabled = true) {
  const { user } = useAuth();
  return useQuery({
    queryKey: queryKeys.reportRequests.all(user?.tenantId ?? ""),
    queryFn: async (): Promise<ReportRequest[]> => {
      const { data, error } = await supabase.from("report_requests").select("*").order("created_at", { ascending: false });
      if (error) handleSupabaseError(error);
      return (data ?? []).map(transformReportRequest);
    },
    enabled: enabled && !!user?.tenantId,
  });
}

function useInvalidateReports() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.reportRequests.all(user?.tenantId ?? "") });
    void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.root() });
  };
}

export function useRequestReport() {
  const invalidate = useInvalidateReports();
  return useMutation({
    mutationFn: async (args: PlannedRpcs["request_report"]) => transformReportRequest((await callRpc("request_report", args)) as Row),
    onSuccess: invalidate,
  });
}

export function useReviewReportRequest() {
  const invalidate = useInvalidateReports();
  return useMutation({
    mutationFn: async (args: PlannedRpcs["review_report_request"]) => transformReportRequest((await callRpc("review_report_request", args)) as Row),
    onSuccess: invalidate,
  });
}

/** One approved report's data; fetched when opened, kept for a minute. */
export function useReportData(requestId: string | null) {
  return useQuery({
    queryKey: queryKeys.reportRequests.data(requestId ?? ""),
    queryFn: async () => (await callRpc("get_report_data", { p_request_id: requestId! })) as ReportData,
    enabled: !!requestId,
    staleTime: 60_000,
  });
}
