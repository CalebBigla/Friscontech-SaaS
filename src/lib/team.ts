/**
 * Team selectors. "Team" is a view over db.users — no separate dataset.
 * Every selector takes the caller's AccessScope so unauthorised members are never returned.
 */
import type { Db, Role, User, UserStatus } from "@/data/mock-db";
import type { AccessScope } from "@/lib/session";
import { filterSales, saleTotal } from "@/lib/calculations";
import { findRepTarget, getTargetProgress } from "@/lib/catalog-calculations";

export const userStatusLabel: Record<UserStatus, string> = { active: "Active", inactive: "Inactive", pending: "Pending" };

/** Can `scope` see/manage this user? Owner: everyone. Manager: storekeepers/reps in their branch or reporting to them. */
export function canAccessMember(scope: AccessScope, u: User) {
  if (!scope.canManageTeam || u.tenantId !== scope.user.tenantId) return false;
  if (scope.user.role === "owner") return true;
  if (u.id === scope.user.id) return true;
  if (u.role !== "storekeeper" && u.role !== "sales_rep") return false;
  return u.managerId === scope.user.id || (!!u.branchId && !!scope.branchIds?.includes(u.branchId));
}
/** Can `scope` edit/deactivate this user (never themselves, never the owner). */
export const canEditMember = (scope: AccessScope, u: User) => u.id !== scope.user.id && u.role !== "owner" && canAccessMember(scope, u);

export function getTeamMembers(db: Db, scope: AccessScope): User[] {
  return db.users.filter((u) => canAccessMember(scope, u));
}
export function getTeamMember(db: Db, scope: AccessScope, id: string) {
  const u = db.users.find((x) => x.id === id);
  return u && canAccessMember(scope, u) ? u : null;
}

/** Roles the caller may assign. Owners are never created through the Team form. */
export function assignableRoles(scope: AccessScope): Role[] {
  if (scope.user.role === "owner") return ["manager", "storekeeper", "sales_rep"];
  if (scope.user.role === "manager") return ["storekeeper", "sales_rep"];
  return [];
}
export const roleNeedsBranch = (role: Role) => role === "storekeeper" || role === "sales_rep";

/** Latest timestamp the user authored anything: sales, requests, reviews, stock movements or logged activities. */
export function getLastActivity(db: Db, userId: string): string | null {
  let last = "";
  const bump = (at?: string) => { if (at && at > last) last = at; };
  for (const s of db.sales) if (s.salesRepId === userId) bump(s.createdAt);
  for (const r of db.stockRequests) {
    if (r.repId === userId) bump(r.requestedAt);
    if (r.processedBy === userId) bump(r.fulfilledAt ?? r.rejectedAt ?? r.approvedAt);
  }
  for (const m of db.inventoryMovements) if (m.performedBy === userId) bump(m.createdAt);
  for (const a of db.activities) if (a.actorId === userId) bump(a.createdAt);
  return last || null;
}

export function getTeamSummary(members: User[]) {
  return {
    total: members.length,
    active: members.filter((u) => u.status === "active").length,
    managers: members.filter((u) => u.role === "manager").length,
    reps: members.filter((u) => u.role === "sales_rep").length,
    storekeepers: members.filter((u) => u.role === "storekeeper").length,
  };
}

/** Reps' monthly target + sales for a month, using the shared Targets logic. */
export function getRepPerformance(db: Db, repId: string, month: string, range: { from: string; to: string }) {
  const target = findRepTarget(db, repId, month);
  const progress = target ? getTargetProgress(db, target) : null;
  const sales = filterSales(db, { repId, range });
  return { target, progress, salesCount: sales.length, revenue: sales.reduce((s, x) => s + saleTotal(x), 0) };
}

export function getStorekeeperActivity(db: Db, userId: string) {
  const movements = db.inventoryMovements.filter((m) => m.performedBy === userId && m.type !== "sale");
  const processed = db.stockRequests.filter((r) => r.processedBy === userId);
  return {
    movements: movements.length,
    unitsAdded: movements.filter((m) => m.type === "stock_added").reduce((s, m) => s + m.quantity, 0),
    requestsProcessed: processed.length,
    fulfilled: processed.filter((r) => r.status === "fulfilled" || r.status === "partially_fulfilled").length,
    rejected: processed.filter((r) => r.status === "rejected").length,
  };
}

/** A manager's direct team: staff reporting to them or in the branch they run. */
export function getManagerTeam(db: Db, manager: User) {
  return db.users.filter((u) => (u.role === "sales_rep" || u.role === "storekeeper") && (u.managerId === manager.id || (!!manager.branchId && u.branchId === manager.branchId)));
}

export type TeamSortKey = "name" | "role" | "joined" | "activity";
const roleOrder: Record<Role, number> = { owner: 0, manager: 1, storekeeper: 2, sales_rep: 3 };
export function sortTeam(db: Db, list: User[], key: TeamSortKey, dir: "asc" | "desc") {
  const m = dir === "asc" ? 1 : -1;
  const act = new Map(list.map((u) => [u.id, getLastActivity(db, u.id) ?? ""]));
  return [...list].sort((a, b) => m * (key === "role" ? roleOrder[a.role] - roleOrder[b.role] || a.name.localeCompare(b.name)
    : key === "joined" ? a.createdAt.localeCompare(b.createdAt)
    : key === "activity" ? act.get(a.id)!.localeCompare(act.get(b.id)!) : a.name.localeCompare(b.name)));
}
