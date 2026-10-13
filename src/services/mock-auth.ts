/**
 * Mock authentication provider standing in for Lovable Cloud auth (email + password).
 * Credentials live here, NOT in app data (db), exactly like a real auth service keeps
 * them apart from business tables. Only a SHA-256 hash is kept. Swapping to real auth
 * means replacing these functions with signUp / signInWithPassword /
 * resetPasswordForEmail / updateUser calls.
 */
import { getDb, setDb } from "@/services/mock-store";
import { setCurrentUserId } from "@/lib/session";
import { createAuditLog } from "@/services/services";

type Credential = { userId: string; email: string; hash: string };
const credentials = new Map<string, Credential>(); // key: lowercased email
const resetTokens = new Map<string, { email: string; expiresAt: number; used: boolean }>();

const norm = (e: string) => e.trim().toLowerCase();
async function hash(pw: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(pw));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
export const passwordProblem = (pw: string) =>
  pw.length < 8 || !/[0-9]/.test(pw) || !/[a-z]/i.test(pw) ? "At least 8 characters with letters and numbers" : null;

type Res<T = true> = { ok: true; data: T } | { ok: false; error: string };
const latency = () => new Promise((r) => setTimeout(r, 300));

export const mockAuth = {
  ownerHasAccount() {
    const owner = getDb().users.find((u) => u.role === "owner");
    return !!owner && [...credentials.values()].some((c) => c.userId === owner.id);
  },
  hasAccount(userId: string) {
    return [...credentials.values()].some((c) => c.userId === userId);
  },
  /** Creates the auth account. Called by the owner's first sign-up and by onboarding submit. */
  async register(userId: string, email: string, pw: string): Promise<Res> {
    const e = norm(email);
    const p = passwordProblem(pw);
    if (p) return { ok: false, error: p };
    const existing = credentials.get(e);
    if (existing && existing.userId !== userId) return { ok: false, error: "This email already has an account." };
    for (const [k, c] of credentials) if (c.userId === userId) credentials.delete(k);
    credentials.set(e, { userId, email: e, hash: await hash(pw) });
    setDb((d) => ({ ...d, users: d.users.map((u) => (u.id === userId ? { ...u, email: e } : u)) }));
    return { ok: true, data: true };
  },
  /** Only the first sign-up becomes the Owner; after that sign-up is closed. */
  async signUpOwner(email: string, pw: string): Promise<Res> {
    await latency();
    if (mockAuth.ownerHasAccount()) return { ok: false, error: "Sign-up is closed. Staff join through an onboarding link." };
    const owner = getDb().users.find((u) => u.role === "owner");
    if (!owner) return { ok: false, error: "No owner record found." };
    const r = await mockAuth.register(owner.id, email, pw);
    if (!r.ok) return r;
    return mockAuth.signIn(email, pw);
  },
  async signIn(email: string, pw: string): Promise<Res> {
    await latency();
    const c = credentials.get(norm(email));
    if (!c || c.hash !== (await hash(pw))) return { ok: false, error: "Wrong email or password." };
    const user = getDb().users.find((u) => u.id === c.userId);
    if (!user) return { ok: false, error: "Account not found." };
    if (user.status === "pending") return { ok: false, error: "Your account is waiting for the Owner to activate it." };
    if (user.status !== "active") return { ok: false, error: "This account has been deactivated." };
    setDb((d) => ({ ...d, activities: [createAuditLog(d, user.id, "Login", "Signed in with email and password", { entityId: user.id }), ...d.activities] }));
    setCurrentUserId(user.id);
    return { ok: true, data: true };
  },
  signOut(userId: string) {
    setDb((d) => ({ ...d, activities: [createAuditLog(d, userId, "Logout", "Signed out", { entityId: userId }), ...d.activities] }));
  },
  /** Returns the reset link. A real backend emails it and returns nothing (no account enumeration). */
  async requestReset(email: string): Promise<Res<string | null>> {
    await latency();
    const e = norm(email);
    if (!credentials.has(e)) return { ok: true, data: null };
    const token = crypto.randomUUID().replace(/-/g, "");
    resetTokens.set(token, { email: e, expiresAt: Date.now() + 60 * 60 * 1000, used: false });
    return { ok: true, data: token };
  },
  resetTokenValid(token: string) {
    const t = resetTokens.get(token);
    return !!t && !t.used && t.expiresAt > Date.now();
  },
  async resetPassword(token: string, pw: string): Promise<Res> {
    await latency();
    const t = resetTokens.get(token);
    if (!t || t.used || t.expiresAt < Date.now()) return { ok: false, error: "This reset link is no longer valid." };
    const c = credentials.get(t.email);
    if (!c) return { ok: false, error: "Account not found." };
    const p = passwordProblem(pw);
    if (p) return { ok: false, error: p };
    c.hash = await hash(pw);
    t.used = true;
    setDb((d) => ({ ...d, activities: [createAuditLog(d, c.userId, "Password reset", "Reset password with a recovery link", { entityId: c.userId }), ...d.activities] }));
    return { ok: true, data: true };
  },
};
