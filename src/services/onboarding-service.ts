/**
 * Onboarding writes (Phase 4). Demo-only: tokens and files live in the in-memory store.
 * See the security note in src/data/onboarding.ts for what a real backend must add.
 */
import type { Db } from "@/data/mock-db";
import {
  emptyEmployeeData,
  LINK_VALID_DAYS,
  type EmployeeData,
  type GuarantorResponse,
  type Onboarding,
  type StoredFile,
} from "@/data/onboarding";
import { roleLabel } from "@/lib/format";
import {
  findOnboardingByGuarantorToken,
  findOnboardingByToken,
  onboardingLinkState,
  validateStep,
  type StepErrors,
} from "@/lib/onboarding";
import { getDb, setDb } from "@/services/mock-store";
import { createAuditLog, createNotification } from "@/services/services";
import { mockAuth } from "@/services/mock-auth";

type R<T> = { ok: true; data: T } | { ok: false; errors: StepErrors };
const latency = () => new Promise((r) => setTimeout(r, 250));
const fail = (form: string): { ok: false; errors: StepErrors } => ({ ok: false, errors: { form } });
const newToken = () => crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "").slice(0, 8);
const expiry = () => new Date(Date.now() + LINK_VALID_DAYS * 864e5).toISOString();
const ownerId = (db: Db) => db.users.find((u) => u.role === "owner")?.id ?? "user-001";
const isOwner = (db: Db, actorId: string) => db.users.find((u) => u.id === actorId)?.role === "owner";

function nextEmployeeId(db: Db) {
  const n = db.onboardings.reduce((m, o) => Math.max(m, Number(o.employeeId.slice(3)) || 0), 0) + 1;
  return `FT-${String(n).padStart(4, "0")}`;
}

/** Builds the onboarding record for a newly created pending user. Used by team create + approval. */
export function buildOnboarding(db: Db, userId: string, createdAt: string): Onboarding {
  const user = db.users.find((u) => u.id === userId);
  const [first = "", ...rest] = (user?.name ?? "").split(" ");
  return {
    id: `onb-${db.onboardings.length + 1}-${Math.random().toString(36).slice(2, 6)}`,
    tenantId: db.tenant.id,
    userId,
    employeeId: nextEmployeeId(db),
    jobTitle: user ? roleLabel[user.role] : "",
    department: user?.role === "storekeeper" ? "Inventory" : user?.role === "manager" ? "Operations" : "Sales",
    startDate: db.tenant.referenceDate,
    status: "invited",
    token: newToken(),
    tokenExpiresAt: expiry(),
    tokenRevoked: false,
    tokenUsed: false,
    step: 0,
    data: { ...emptyEmployeeData(), firstName: first, lastName: rest.join(" "), email: user?.email ?? "" },
    photo: null,
    credentials: [],
    passwordSet: false,
    guarantorStatus: "not_sent",
    guarantorToken: null,
    guarantorResponse: null,
    createdAt,
  };
}

function update(id: string, patch: (o: Onboarding) => Onboarding, log?: (d: Db, o: Onboarding) => Db["activities"][number], extra?: (d: Db, o: Onboarding) => Partial<Db>) {
  let out: Onboarding | null = null;
  setDb((d) => {
    const cur = d.onboardings.find((o) => o.id === id);
    if (!cur) return d;
    const next = patch(cur);
    out = next;
    return {
      ...d,
      ...(extra ? extra(d, next) : {}),
      onboardings: d.onboardings.map((o) => (o.id === id ? next : o)),
      activities: log ? [log(d, next), ...d.activities] : d.activities,
    };
  });
  return out as Onboarding | null;
}
const memberName = (d: Db, o: Onboarding) => d.users.find((u) => u.id === o.userId)?.name ?? o.employeeId;

export const onboardingService = {
  /** Owner: create an onboarding record for an existing pending user that has none. */
  async invite(userId: string, actorId: string): Promise<R<Onboarding>> {
    await latency();
    const db = getDb();
    if (!isOwner(db, actorId)) return fail("Only the Owner can send onboarding links.");
    if (db.onboardings.some((o) => o.userId === userId)) return fail("This member already has an onboarding record.");
    const o = buildOnboarding(db, userId, new Date().toISOString());
    setDb((d) => ({ ...d, onboardings: [o, ...d.onboardings], activities: [createAuditLog(d, actorId, "Team onboarding link created", `${o.employeeId} · ${memberName(d, o)}`, { entityId: o.userId }), ...d.activities] }));
    return { ok: true, data: o };
  },
  async regenerate(id: string, actorId: string): Promise<R<Onboarding>> {
    await latency();
    const db = getDb();
    const o = db.onboardings.find((x) => x.id === id);
    if (!o || !isOwner(db, actorId)) return fail("Only the Owner can manage onboarding links.");
    if (o.status === "submitted" || o.status === "active" || o.tokenUsed) return fail("This link was already used. Onboarding links are one-time only.");
    const r = update(id, (x) => ({ ...x, token: newToken(), tokenExpiresAt: expiry(), tokenRevoked: false, tokenUsed: false, status: x.status }),
      (d, x) => createAuditLog(d, actorId, "Team onboarding link regenerated", `${x.employeeId} · ${memberName(d, x)}`, { entityId: x.userId }));
    return r ? { ok: true, data: r } : fail("Not found");
  },
  async revoke(id: string, actorId: string): Promise<R<Onboarding>> {
    await latency();
    const db = getDb();
    if (!isOwner(db, actorId)) return fail("Only the Owner can manage onboarding links.");
    const r = update(id, (x) => ({ ...x, tokenRevoked: true }),
      (d, x) => createAuditLog(d, actorId, "Team onboarding link revoked", `${x.employeeId} · ${memberName(d, x)}`, { entityId: x.userId }));
    return r ? { ok: true, data: r } : fail("Not found");
  },
  async updateJob(id: string, job: { jobTitle: string; department: string; startDate: string }, actorId: string): Promise<R<Onboarding>> {
    await latency();
    if (!isOwner(getDb(), actorId)) return fail("Only the Owner can set job details.");
    if (!job.jobTitle.trim() || !job.department.trim() || !job.startDate) return fail("Job title, department and start date are required.");
    const r = update(id, (x) => ({ ...x, jobTitle: job.jobTitle.trim(), department: job.department.trim(), startDate: job.startDate }),
      (d, x) => createAuditLog(d, actorId, "Team onboarding job details updated", `${x.employeeId} · ${x.jobTitle}`, { entityId: x.userId }));
    return r ? { ok: true, data: r } : fail("Not found");
  },

  // ---- public (token-holder) actions; the actor in audit rows is the member themselves ----
  async saveProgress(token: string, data: EmployeeData, step: number, files?: { photo?: StoredFile | null; credentials?: StoredFile[] }): Promise<R<Onboarding>> {
    await latency();
    const o = findOnboardingByToken(getDb(), token);
    if (onboardingLinkState(o) !== "valid") return fail("This onboarding link is no longer valid.");
    const r = update(o!.id, (x) => ({
      ...x, data, step: Math.max(x.step, step), status: "in_progress",
      ...(files?.photo !== undefined ? { photo: files.photo } : {}),
      ...(files?.credentials ? { credentials: files.credentials } : {}),
    }), x0(o!) ? (d, x) => createAuditLog(d, x.userId, "Team onboarding started", `${x.employeeId} · ${memberName(d, x)}`, { entityId: x.userId }) : undefined);
    return r ? { ok: true, data: r } : fail("Not found");
  },
  async sendGuarantorLink(token: string): Promise<R<Onboarding>> {
    await latency();
    const o = findOnboardingByToken(getDb(), token);
    if (onboardingLinkState(o) !== "valid") return fail("This onboarding link is no longer valid.");
    const e = validateStep(o!, o!.data, 3);
    if (Object.keys(e).length) return { ok: false, errors: e };
    const r = update(o!.id, (x) => ({ ...x, guarantorToken: x.guarantorToken ?? newToken(), guarantorStatus: x.guarantorStatus === "completed" ? "completed" : "sent" }),
      (d, x) => createAuditLog(d, x.userId, "Team onboarding guarantor link created", `${x.employeeId} · ${x.data.guarantorFirstName} ${x.data.guarantorSurname}`, { entityId: x.userId }));
    return r ? { ok: true, data: r } : fail("Not found");
  },
  /** Final submit. The password goes to the (future) auth provider and is never stored here. */
  async submit(token: string, data: EmployeeData, password: { pw: string; confirm: string }): Promise<R<Onboarding>> {
    await latency();
    const o = findOnboardingByToken(getDb(), token);
    if (onboardingLinkState(o) !== "valid") return fail("This onboarding link is no longer valid.");
    for (let s = 0; s < 6; s++) {
      const e = validateStep(o!, data, s, s === 5 ? password : undefined);
      if (Object.keys(e).length) return { ok: false, errors: { ...e, form: `Please complete step ${s + 1}.` } };
    }
    const acct = await mockAuth.register(o!.userId, data.email, password.pw);
    if (!acct.ok) return { ok: false, errors: { password: acct.error, form: acct.error } };
    const at = new Date().toISOString();
    const r = update(o!.id, (x) => ({ ...x, data, step: 5, status: "submitted", tokenUsed: true, passwordSet: true, submittedAt: at, correctionNote: undefined }),
      (d, x) => createAuditLog(d, x.userId, "Team onboarding submitted", `${x.employeeId} · ${memberName(d, x)}`, { entityId: x.userId }),
      (d, x) => ({ notifications: [createNotification(d, ownerId(d), "onboarding_submitted", "onboarding", x.id, `${memberName(d, x)} submitted their onboarding form`), ...d.notifications] }));
    return r ? { ok: true, data: r } : fail("Not found");
  },
  async submitGuarantor(token: string, resp: Omit<GuarantorResponse, "submittedAt">): Promise<R<Onboarding>> {
    await latency();
    const o = findOnboardingByGuarantorToken(getDb(), token);
    if (!o) return fail("This guarantor link is not valid.");
    if (o.guarantorStatus === "completed") return fail("This guarantor form was already submitted. Thank you.");
    const errors: StepErrors = {};
    if (!resp.yearsKnown.trim() || !resp.relationship.trim() || !resp.character.trim() || resp.signature.trim().length < 3 || !resp.signedDate)
      errors.form = "Please answer every required question, sign and date the form.";
    if (Object.keys(errors).length) return { ok: false, errors };
    const r = update(o.id, (x) => ({ ...x, guarantorStatus: "completed", guarantorResponse: { ...resp, submittedAt: new Date().toISOString() } }),
      (d, x) => createAuditLog(d, x.userId, "Team onboarding guarantor response received", `${x.employeeId} · ${memberName(d, x)}`, { entityId: x.userId }),
      (d, x) => ({ notifications: [createNotification(d, ownerId(d), "guarantor_completed", "onboarding", x.id, `Guarantor responded for ${memberName(d, x)}`), ...d.notifications] }));
    return r ? { ok: true, data: r } : fail("Not found");
  },

  // ---- owner review ----
  async requestCorrections(id: string, note: string, actorId: string): Promise<R<Onboarding>> {
    await latency();
    if (!isOwner(getDb(), actorId)) return fail("Only the Owner can review onboarding.");
    return fail("Onboarding links are one-time only; submitted forms can't be reopened.");
    if (note.trim().length < 5) return { ok: false, errors: { form: "Explain what needs correcting." } };
    const r = update(id, (x) => ({ ...x, status: "in_progress", tokenUsed: false, tokenRevoked: false, tokenExpiresAt: expiry(), correctionNote: note.trim() }),
      (d, x) => createAuditLog(d, actorId, "Team onboarding corrections requested", `${x.employeeId} · ${note.trim()}`, { entityId: x.userId }));
    return r ? { ok: true, data: r } : fail("Not found");
  },
  async reviewGuarantor(id: string, decision: "accepted" | "declined", reason: string, actorId: string): Promise<R<Onboarding>> {
    await latency();
    const db = getDb();
    const o = db.onboardings.find((x) => x.id === id);
    if (!o || !isOwner(db, actorId)) return fail("Only the Owner can review guarantor responses.");
    if (o.guarantorStatus !== "completed") return fail("The guarantor hasn't submitted the form yet.");
    if (o.guarantorDecision) return fail("This guarantor response was already reviewed.");
    if (decision === "declined" && reason.trim().length < 5) return { ok: false, errors: { form: "Give a reason for declining." } };
    const r = update(id, (x) => ({ ...x, guarantorDecision: decision, guarantorDecisionReason: reason.trim() || undefined, guarantorDecidedAt: new Date().toISOString() }),
      (d, x) => createAuditLog(d, actorId, decision === "accepted" ? "Team onboarding guarantor accepted" : "Team onboarding guarantor declined", `${x.employeeId} · ${memberName(d, x)}${reason.trim() ? ` · ${reason.trim()}` : ""}`, { entityId: x.userId }));
    return r ? { ok: true, data: r } : fail("Not found");
  },
  async activate(id: string, actorId: string): Promise<R<Onboarding>> {
    await latency();
    const db = getDb();
    const o = db.onboardings.find((x) => x.id === id);
    if (!o || !isOwner(db, actorId)) return fail("Only the Owner can activate members.");
    if (o.status !== "submitted") return fail("The member must submit their onboarding form first.");
    if (o.guarantorDecision !== "accepted") return fail("Accept the guarantor's response before activating.");
    const at = new Date().toISOString();
    const r = update(id, (x) => ({ ...x, status: "active", activatedAt: at }),
      (d, x) => createAuditLog(d, actorId, "Team member activated after onboarding", `${x.employeeId} · ${memberName(d, x)}`, { entityId: x.userId }),
      (d, x) => ({ users: d.users.map((u) => (u.id === x.userId ? { ...u, status: "active" } : u)) }));
    return r ? { ok: true, data: r } : fail("Not found");
  },
};
function x0(o: Onboarding) { return o.status === "invited"; }
