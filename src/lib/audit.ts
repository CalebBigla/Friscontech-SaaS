/**
 * Centralized audit selectors over the single audit dataset (db.activities).
 * Permission filtering happens HERE, before rows reach any component:
 * owner = organization, manager = own branch(es), storekeeper / sales rep = own actions only.
 */
import type { Activity, AuditEntity, Db, DateFormatPref } from "@/data/mock-db";
import type { AccessScope } from "@/lib/session";
import { verbFromAction, type AuditVerb } from "@/data/auditLogs";
import { addDays, type DateRange } from "@/lib/dates";

export type AuditRow = Activity & { verb: AuditVerb; branchId: string | undefined };

const branchOf = (db: Db, a: Activity) => a.metadata?.branchId ?? db.users.find((u) => u.id === a.actorId)?.branchId ?? undefined;
const toRow = (db: Db, a: Activity): AuditRow => ({ ...a, verb: verbFromAction(a.action), branchId: branchOf(db, a) });

function permitted(db: Db, scope: AccessScope, a: Activity) {
  if (a.tenantId !== scope.user.tenantId || !scope.canViewAuditLogs) return false;
  if (a.createdAt.slice(0, 10) > db.tenant.referenceDate) return false;
  switch (scope.user.role) {
    case "owner": return true;
    case "manager": { const b = branchOf(db, a); return a.actorId === scope.user.id || (!!b && !!scope.branchIds?.includes(b)); }
    default: return a.actorId === scope.user.id;
  }
}

/** Every entry the current role may see, newest first. */
export function getAuditLogs(db: Db, scope: AccessScope): AuditRow[] {
  return db.activities.filter((a) => permitted(db, scope, a)).map((a) => toRow(db, a)).sort((x, y) => y.createdAt.localeCompare(x.createdAt));
}
export const getAuditLogsForUser = (db: Db, scope: AccessScope, userId: string) => getAuditLogs(db, scope).filter((a) => a.actorId === userId);
export const getAuditLogsForRole = (db: Db, scope: AccessScope, role: string) => getAuditLogs(db, scope).filter((a) => db.users.find((u) => u.id === a.actorId)?.role === role);
export const getAuditLogsByEntity = (db: Db, scope: AccessScope, entity: AuditEntity) => getAuditLogs(db, scope).filter((a) => a.entity === entity);
export const getAuditLogsByDateRange = (db: Db, scope: AccessScope, range: DateRange) => filterByRange(getAuditLogs(db, scope), range);
export const filterByRange = (rows: AuditRow[], range: DateRange) => rows.filter((a) => a.createdAt.slice(0, 10) >= range.from && a.createdAt.slice(0, 10) <= range.to);

export function getAuditSummary(rows: AuditRow[], today: string) {
  const week = addDays(today, -6);
  return {
    total: rows.length,
    today: rows.filter((a) => a.createdAt.startsWith(today)).length,
    week: rows.filter((a) => a.createdAt.slice(0, 10) >= week).length,
    activeUsers: new Set(rows.filter((a) => a.createdAt.slice(0, 10) >= week).map((a) => a.actorId)).size,
  };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** Applies the user's date-format preference. */
export function formatPrefDate(iso: string, fmt: DateFormatPref) {
  const [y = "", m = "01", d = "01"] = iso.slice(0, 10).split("-");
  if (fmt === "DD/MM/YYYY") return `${d}/${m}/${y}`;
  if (fmt === "YYYY-MM-DD") return `${y}-${m}-${d}`;
  return `${MONTHS[Number(m) - 1]} ${Number(d)}, ${y}`;
}
