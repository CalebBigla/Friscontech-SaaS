/**
 * Centralized audit log dataset (PRD AuditLogs: id, tenant_id, user_id, action, entity, entity_id, timestamp).
 * Field mapping on Activity: actorId = user_id, createdAt = timestamp, subject = human description.
 * Rows are written server-side (RPCs, triggers, create_audit_log) into public.activities.
 * Never put passwords, tokens, keys or credentials in an entry.
 */
import type { AuditEntity } from "./mock-db";

export const auditEntityLabel: Record<AuditEntity, string> = {
  product: "Product", sale: "Sale", payment: "Payment", expense: "Expense", remittance: "Remittance", stock_request: "Stock Request", target: "Target", team_member: "Team Member",
  branch: "Branch", inventory: "Inventory", settings: "Settings", session: "Session", customer: "Customer",
};

/** Infers the entity from the action text so every service call is classified the same way. */
export function entityFromAction(action: string): AuditEntity {
  const a = action.toLowerCase();
  if (a.startsWith("customer payment")) return "payment";
  if (a.startsWith("customer")) return "customer";
  if (a.startsWith("payment") || a.startsWith("payment_")) return "payment";
  if (a.startsWith("expense")) return "expense";
  if (a.startsWith("remittance")) return "remittance";
  if (a.startsWith("product")) return "product";
  if (a.startsWith("sale")) return "sale";
  if (a.startsWith("stock request")) return "stock_request";
  if (a.startsWith("stock") || a.includes("emergency")) return "inventory";
  if (a.includes("target")) return "target";
  if (a.startsWith("branch created") || a.startsWith("branch updated") || a.startsWith("branch deactivated") || a.startsWith("branch activated")) return "branch";
  if (a.startsWith("team") || a.startsWith("role") || a.startsWith("branch assignment") || a.includes("sales rep added")) return "team_member";
  if (a.includes("setting") || a.includes("preference") || a.includes("password")) return "settings";
  if (a === "login" || a === "logout") return "session";
  return "settings";
}

/** Short verb used by the Action filter. */
export const auditVerbs = ["Created", "Updated", "Activated", "Deactivated", "Approved", "Rejected", "Fulfilled", "Submitted", "Acknowledged", "Confirmed", "Reconciled", "Declined", "Voided", "Recorded", "Added", "Adjusted", "Login", "Logout"] as const;
export type AuditVerb = (typeof auditVerbs)[number];
export function verbFromAction(action: string): AuditVerb {
  const a = action.toLowerCase();
  if (a === "login") return "Login";
  if (a === "logout") return "Logout";
  if (a.includes("deactivated")) return "Deactivated";
  if (a.includes("activated")) return "Activated";
  if (a.includes("approved")) return "Approved";
  if (a.includes("rejected")) return "Rejected";
  if (a.includes("fulfilled")) return "Fulfilled";
  if (a.includes("acknowledged")) return "Acknowledged";
  if (a.includes("confirmed")) return "Confirmed";
  if (a.includes("reconciled")) return "Reconciled";
  if (a.includes("declined")) return "Declined";
  if (a.includes("voided")) return "Voided";
  if (a.includes("submitted") || a.includes("requested")) return "Submitted";
  if (a.includes("recorded")) return "Recorded";
  if (a.includes("adjusted")) return "Adjusted";
  if (a.includes("stock added")) return "Added";
  if (a.includes("created") || a.includes("added")) return "Created";
  return "Updated";
}
