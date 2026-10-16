/**
 * Session + RBAC scope with Supabase Auth integration.
 * Use useAuth() from auth-context for real authentication state.
 * This file maintains backward compatibility for demo/development.
 */
import { useSyncExternalStore } from "react";
import type { Db, User } from "@/data/mock-db";
import { useAuth } from "@/contexts/auth-context";

// Legacy demo user switching (for development/testing only)
let currentUserId = "user-001";
const listeners = new Set<() => void>();
export function setCurrentUserId(id: string) {
  currentUserId = id;
  listeners.forEach((l) => l());
}
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/**
 * @deprecated Use useAuth().user.id instead for production
 * This is kept for backward compatibility during migration
 */
export const useCurrentUserId = () =>
  useSyncExternalStore(
    subscribe,
    () => currentUserId,
    () => currentUserId,
  );

export type AccessScope = {
  user: User;
  /** null = every branch in the tenant */
  branchIds: string[] | null;
  /** set when the user may only see their own sales */
  repId?: string;
  canManageBranches: boolean;
  canRecordSales: boolean;
  canViewSales: boolean;
  /** add / adjust stock (storekeeper only) */
  canManageStock: boolean;
  /** approve / reject pending stock requests */
  canReviewRequests: boolean;
  /** issue stock against approved requests */
  canFulfillRequests: boolean;
  /** submit new stock requests (sales reps) */
  canCreateRequests: boolean;
  /** branch module (owner + manager only) */
  canViewBranches: boolean;
  /** add products to the shared catalogue (storekeeper) */
  canManageProducts: boolean;
  /** full inventory interface: value, movements, thresholds (not sales reps) */
  canViewInventoryAdmin: boolean;
  /** open the full Targets module and set/edit rep targets (owner only) */
  canManageTargets: boolean;
  /** Team module: owner = whole org, manager = own branch staff */
  canManageTeam: boolean;
  /** Reports module (owner + manager, scoped by branchIds) */
  canViewReports: boolean;
  /** everyone; the audit selector limits rows (owner org, manager branch, others own) */
  canViewAuditLogs: boolean;
  /** owner: edit business + organization settings */
  canManageSettings: boolean;
  /** owner + manager: see business + organization details */
  canViewOrganizationSettings: boolean;
  /** review permission requests: manager = storekeeper stock additions + product deactivations in own branch; owner = everything incl. new team members */
  canReviewApprovals: boolean;
  /** deactivate products directly (owner + manager); storekeepers must request it */
  canDeactivateProducts: boolean;
  /** confirm receipt of fulfilled stock (sales reps) */
  canAcknowledgeStock: boolean;
  /** payment chain step 2: acknowledge rep and customer payments (manager only) */
  canAcknowledgePayments: boolean;
  /** payment chain step 3: confirm or decline acknowledged payments (owner only) */
  canConfirmPayments: boolean;
  /** Customers module (sales rep, storekeeper, owner) */
  canViewCustomers: boolean;
  /** create/edit customers, raise customer orders, record customer payments (sales rep) */
  canManageCustomers: boolean;
  /** set a customer's credit limit (owner) */
  canSetCreditLimit: boolean;
};

const none = {
  canManageStock: false,
  canReviewRequests: false,
  canFulfillRequests: false,
  canCreateRequests: false,
  canViewBranches: false,
  canManageProducts: false,
  canViewInventoryAdmin: true,
  canManageTargets: false,
  canManageTeam: false,
  canViewReports: false,
};
export function getAccessScope(db: Db, userId: string): AccessScope {
  const s = baseScope(db, userId);
  const r = s.user.role;
  return {
    ...s,
    canViewAuditLogs: true,
    canManageSettings: r === "owner",
    canViewOrganizationSettings: r === "owner" || r === "manager",
    canReviewApprovals: r === "owner" || r === "manager",
    canDeactivateProducts: r === "owner" || r === "manager",
    canAcknowledgeStock: r === "sales_rep",
    canAcknowledgePayments: r === "manager",
    canConfirmPayments: r === "owner",
    canViewCustomers: r === "sales_rep" || r === "storekeeper" || r === "owner",
    canManageCustomers: r === "sales_rep",
    canSetCreditLimit: r === "owner",
  };
}
type Extra =
  | "canViewAuditLogs"
  | "canManageSettings"
  | "canViewOrganizationSettings"
  | "canReviewApprovals"
  | "canDeactivateProducts"
  | "canAcknowledgeStock"
  | "canAcknowledgePayments"
  | "canConfirmPayments"
  | "canViewCustomers"
  | "canManageCustomers"
  | "canSetCreditLimit";
function baseScope(db: Db, userId: string): Omit<AccessScope, Extra> {
  const user = (db.users.find((x) => x.id === userId) ?? db.users[0])!;
  const own = user.branchId ? [user.branchId] : [];
  switch (user.role) {
    case "owner":
      return {
        user,
        branchIds: null,
        canManageBranches: true,
        canRecordSales: true,
        canViewSales: true,
        ...none,
        canViewBranches: true,
        canManageProducts: true,
        canManageTargets: true,
        canManageTeam: true,
        canViewReports: true,
      };
    // Managers supervise: no sales entry, no catalogue additions, no rep stock-request review, no Branches module.
    case "manager":
      return {
        user,
        branchIds: own,
        canManageBranches: false,
        canRecordSales: false,
        canViewSales: true,
        ...none,
        canViewBranches: false,
        canManageProducts: false,
        canManageTargets: false,
        canManageTeam: true,
        canViewReports: true,
      };
    case "storekeeper":
      return {
        user,
        branchIds: own,
        canManageBranches: false,
        canRecordSales: false,
        canViewSales: false,
        canManageStock: true,
        canReviewRequests: true,
        canFulfillRequests: true,
        canCreateRequests: false,
        canViewBranches: false,
        canManageProducts: true,
        canViewInventoryAdmin: true,
        canManageTargets: false,
        canManageTeam: false,
        canViewReports: false,
      };
    case "sales_rep":
      return {
        user,
        branchIds: own,
        repId: user.id,
        canManageBranches: false,
        canRecordSales: true,
        canViewSales: true,
        ...none,
        canCreateRequests: true,
        canViewInventoryAdmin: false,
      };
  }
}
export const canSeeBranch = (scope: AccessScope, branchId: string) =>
  !scope.branchIds || scope.branchIds.includes(branchId);
