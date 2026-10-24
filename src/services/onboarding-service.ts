/**
 * Onboarding service — Supabase-backed.
 *
 * Invite-first flow:
 *   1. Owner creates an invite  -> a raw token is generated, SHA-256-hashed, and the HASH
 *      is stored in onboardings.token_hash. The raw token is returned to the owner ONCE so
 *      they can share /onboard/<token>; it is never persisted.
 *   2. The invitee opens the link; the form is fetched via get_onboarding_by_token (the
 *      RPC hashes the token server-side). Progress is saved via save_onboarding_progress.
 *   3. The invitee uploads a photo + credentials to the private `onboarding-files`
 *      Storage bucket; each upload is registered via register_onboarding_file (enforces
 *      4 MB photo / 5 MB credential caps).
 *   4. On submit, submit_onboarding marks the onboarding 'submitted', then the invitee's
 *      Supabase auth account is created with supabase.auth.signUp carrying the onboarding
 *      id + token hash. handle_new_user() validates the invite and creates the pending profile
 *      linked to the onboarding. The invitee cannot sign in until the owner
 *      approves.
 *   5. The owner reviews, assigns role + branch, and calls approve_onboarding (atomic)
 *      or reject_onboarding.
 *
 * All reads/writes are Supabase.
 */
import { supabase } from "@/lib/supabase";
import {
  emptyEmployeeData,
  LINK_VALID_DAYS,
  type EmployeeData,
  type GuarantorResponse,
  type Onboarding,
  type StoredFile,
} from "@/data/onboarding";
import { validateStep, type StepErrors } from "@/lib/onboarding";

type R<T> = { ok: true; data: T } | { ok: false; errors: StepErrors };
const fail = (form: string): R<never> => ({ ok: false, errors: { form } });

const BUCKET = "onboarding-files";
const PHOTO_MAX_BYTES = 4 * 1024 * 1024;     // 4 MiB hard cap for images
const CREDENTIAL_MAX_BYTES = 5 * 1024 * 1024; // 5 MiB for credentials
const SIGNED_URL_TTL = 60 * 60 * 24;        // 24h

const newRawToken = () =>
  crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "").slice(0, 8);
const expiryIso = () => new Date(Date.now() + LINK_VALID_DAYS * 864e5).toISOString();
const safeName = (name: string) => name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 60) || "file";

/** SHA-256 hex hash (client-side), matching the server hash_token() function. */
async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Create a signed Storage URL for an uploaded file. */
async function signedUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, SIGNED_URL_TTL);
  if (error || !data?.signedUrl) return "";
  return data.signedUrl;
}

/** A DB onboarding row (loosely typed — RPC + direct select both return similar shapes). */
type OnbRow = {
  id: string;
  tenant_id: string;
  user_id: string | null;
  created_by: string | null;
  employee_id: string;
  job_title: string;
  department: string;
  start_date: string;
  status: Onboarding["status"];
  token_hash: string;
  token_expires_at: string;
  token_revoked: boolean;
  used_at: string | null;
  step: number;
  data: EmployeeData | Record<string, string> | null;
  correction_note: string | null;
  guarantor_status: Onboarding["guarantorStatus"];
  guarantor_token: string | null;
  guarantor_response: GuarantorResponse | null;
  guarantor_decision: "accepted" | "declined" | null;
  guarantor_decision_reason: string | null;
  guarantor_decided_at: string | null;
  submitted_at: string | null;
  activated_at: string | null;
  created_at: string;
};

/** Build the Onboarding view-model the components expect. Files are filled by the caller. */
function rowToOnboarding(row: OnbRow, rawToken: string, files: { photo: StoredFile | null; credentials: StoredFile[] }): Onboarding {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    userId: row.user_id ?? "",
    employeeId: row.employee_id,
    jobTitle: row.job_title,
    department: row.department,
    startDate: row.start_date,
    status: row.status,
    token: rawToken, // only meaningful when the caller holds the raw token (form page)
    tokenExpiresAt: row.token_expires_at,
    tokenRevoked: row.token_revoked,
    tokenUsed: row.used_at !== null,
    step: row.step,
    data: (row.data ?? emptyEmployeeData()) as EmployeeData,
    photo: files.photo,
    credentials: files.credentials,
    passwordSet: row.user_id !== null, // account created at signUp
    correctionNote: row.correction_note ?? undefined,
    guarantorStatus: row.guarantor_status,
    guarantorToken: row.guarantor_token,
    guarantorResponse: row.guarantor_response,
    guarantorDecision: row.guarantor_decision ?? undefined,
    guarantorDecisionReason: row.guarantor_decision_reason ?? undefined,
    guarantorDecidedAt: row.guarantor_decided_at ?? undefined,
    submittedAt: row.submitted_at === null ? undefined : row.submitted_at,
    activatedAt: row.activated_at ?? undefined,
    createdAt: row.created_at,
  } as Onboarding;
}

/** Fetch the onboarding's files (photo + credentials) as the view-model expects, with signed URLs. */
async function fetchFiles(onboardingId: string): Promise<{ photo: StoredFile | null; credentials: StoredFile[] }> {
  const { data, error } = await supabase
    .from("onboarding_files")
    .select("id, file_type, file_name, cloudinary_url, file_size, mime_type")
    .eq("onboarding_id", onboardingId)
    .order("uploaded_at", { ascending: true });
  if (error || !data) return { photo: null, credentials: [] };

  const rows = data as Array<{ id: string; file_type: "photo" | "credential"; file_name: string; cloudinary_url: string; file_size: number; mime_type: string }>;
  let photo: StoredFile | null = null;
  const credentials: StoredFile[] = [];
  for (const r of rows) {
    const url = await signedUrl(r.cloudinary_url);
    const f: StoredFile = { name: r.file_name, type: r.mime_type, size: r.file_size, dataUrl: url, id: r.id, path: r.cloudinary_url };
    if (r.file_type === "photo") photo = f;
    else credentials.push(f);
  }
  return { photo, credentials };
}

/** Fetch via the public RPC (anon, by raw token). Returns the view model with files. */
async function fetchByToken(rawToken: string): Promise<Onboarding | null> {
  const { data, error } = await supabase.rpc("get_onboarding_by_token", { p_token: rawToken });
  if (error || !data || !Array.isArray(data) || data.length === 0) return null;
  const row = data[0] as OnbRow;
  const files = await fetchFiles(row.id);
  return rowToOnboarding(row, rawToken, files);
}

/** Fetch by id for the owner (authenticated, owner RLS). */
async function fetchById(id: string): Promise<Onboarding | null> {
  const { data, error } = await supabase
    .from("onboardings")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  const files = await fetchFiles(id);
  return rowToOnboarding(data as OnbRow, "", files);
}

export interface InviteInput {
  firstName: string;
  lastName: string;
  email: string;
  jobTitle: string;
  department: string;
  startDate: string;
}

export const onboardingService = {
  // ---------------- owner: invite management ----------------

  /** Create an invite. Returns the onboarding + the raw token (shown ONCE to the owner). */
  async createInvite(input: InviteInput, actorId: string): Promise<R<{ onboarding: Onboarding; token: string }>> {
    if (!input.firstName.trim() || !input.lastName.trim() || !input.email.trim())
      return fail("First name, last name and email are required.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) return fail("Enter a valid email.");
    if (!input.jobTitle.trim() || !input.department.trim() || !input.startDate) return fail("Job title, department and start date are required.");

    // Resolve the owner's tenant.
    const { data: me, error: meErr } = await supabase
      .from("users")
      .select("tenant_id, role, status")
      .eq("id", actorId)
      .maybeSingle();
    if (meErr || !me || me.role !== "owner" || me.status !== "active")
      return fail("Only the Owner can send onboarding links.");

    const rawToken = newRawToken();
    const tokenHash = await sha256Hex(rawToken);
    const data = emptyEmployeeData();
    data.firstName = input.firstName.trim();
    data.lastName = input.lastName.trim();
    data.email = input.email.trim().toLowerCase();

    const employeeId = `FT-${Date.now().toString().slice(-6)}`;

    const insert = {
      tenant_id: me.tenant_id,
      created_by: actorId,
      employee_id: employeeId,
      job_title: input.jobTitle.trim(),
      department: input.department.trim(),
      start_date: input.startDate,
      status: "invited" as const,
      token_hash: tokenHash,
      token_expires_at: expiryIso(),
      step: 0,
      data,
    };

    const { data: row, error } = await supabase.from("onboardings").insert(insert).select("*").single();
    if (error) return fail(error.message || "Could not create the invite.");

    return { ok: true, data: { onboarding: rowToOnboarding(row as OnbRow, rawToken, { photo: null, credentials: [] }), token: rawToken } };
  },

  /** Generate a fresh token for an existing invite (the old token stops working). */
  async regenerate(id: string, actorId: string): Promise<R<string>> {
    const { data: me } = await supabase.from("users").select("tenant_id, role").eq("id", actorId).maybeSingle();
    if (!me || me.role !== "owner") return fail("Only the Owner can manage onboarding links.");

    const { data: existing } = await supabase
      .from("onboardings")
      .select("status, user_id, tenant_id")
      .eq("id", id)
      .eq("tenant_id", me.tenant_id)
      .maybeSingle();
    if (!existing) return fail("Not found.");
    if (existing.status === "submitted" || existing.status === "approved" || existing.user_id)
      return fail("This link was already used. Onboarding links are one-time only.");

    const rawToken = newRawToken();
    const tokenHash = await sha256Hex(rawToken);
    const { error } = await supabase
      .from("onboardings")
      .update({ token_hash: tokenHash, token_expires_at: expiryIso(), token_revoked: false, used_at: null })
      .eq("id", id);
    if (error) return fail(error.message || "Could not regenerate the link.");
    return { ok: true, data: rawToken };
  },

  async revoke(id: string, actorId: string): Promise<R<Onboarding>> {
    const { data: me } = await supabase.from("users").select("tenant_id, role").eq("id", actorId).maybeSingle();
    if (!me || me.role !== "owner") return fail("Only the Owner can manage onboarding links.");

    const { error } = await supabase
      .from("onboardings")
      .update({ token_revoked: true })
      .eq("id", id)
      .eq("tenant_id", me.tenant_id);
    if (error) return fail(error.message);
    const o = await fetchById(id);
    return o ? { ok: true, data: o } : fail("Not found");
  },

  async updateJob(id: string, job: { jobTitle: string; department: string; startDate: string }, actorId: string): Promise<R<Onboarding>> {
    if (!job.jobTitle.trim() || !job.department.trim() || !job.startDate) return fail("Job title, department and start date are required.");
    const { data: me } = await supabase.from("users").select("tenant_id, role").eq("id", actorId).maybeSingle();
    if (!me || me.role !== "owner") return fail("Only the Owner can set job details.");
    const { error } = await supabase
      .from("onboardings")
      .update({ job_title: job.jobTitle.trim(), department: job.department.trim(), start_date: job.startDate })
      .eq("id", id)
      .eq("tenant_id", me.tenant_id);
    if (error) return fail(error.message);
    const o = await fetchById(id);
    return o ? { ok: true, data: o } : fail("Not found");
  },

  /** Owner: fetch an onboarding by id (for the review panel). */
  async getById(id: string): Promise<Onboarding | null> {
    return fetchById(id);
  },

  // ---------------- public (token-holder) ----------------

  /** Validate and load an invite by the raw token from the URL. */
  async getInviteByToken(rawToken: string): Promise<Onboarding | null> {
    return fetchByToken(rawToken);
  },

  /** Save form progress (data + step). */
  async saveProgress(rawToken: string, data: EmployeeData, step: number): Promise<R<Onboarding>> {
    const { error } = await supabase.rpc("save_onboarding_progress", {
      p_token: rawToken,
      p_data: data,
      p_step: step,
    });
    if (error) return fail(error.message);
    const o = await fetchByToken(rawToken);
    return o ? { ok: true, data: o } : fail("Not found");
  },

  /** Create / refresh the guarantor link. Returns the raw guarantor token. */
  async sendGuarantor(rawToken: string): Promise<R<string>> {
    const { data, error } = await supabase.rpc("send_guarantor_link", { p_token: rawToken });
    if (error) return fail(error.message);
    if (!data) return fail("Could not create the guarantor link.");
    return { ok: true, data: data as string };
  },

  /** Submit the guarantor reference (by guarantor token). */
  async submitGuarantor(rawToken: string, resp: Omit<GuarantorResponse, "submittedAt">): Promise<R<Onboarding>> {
    const { error } = await supabase.rpc("submit_guarantor", {
      p_guarantor_token: rawToken,
      p_response: { ...resp, submittedAt: new Date().toISOString() },
    });
    if (error) return fail(error.message);
    // The guarantor token is different from the invite token; return the invite as-is via fetchById is not possible here.
    // Callers (the guarantor page) only need the ok status.
    return { ok: true, data: {} as Onboarding };
  },

  /** Final submit: persist the form, then create the auth account (which creates the pending profile). */
  async submit(rawToken: string, data: EmployeeData, password: { pw: string; confirm: string }): Promise<R<Onboarding>> {
    // Re-run all step validations so we never submit incomplete data.
    for (let s = 0; s < 6; s++) {
      const e = validateStep({ photo: null }, data, s, s === 5 ? password : undefined);
      if (Object.keys(e).length) return { ok: false, errors: { ...e, form: `Please complete step ${s + 1}.` } };
    }
    if (password.pw !== password.confirm) return fail("Passwords don't match.");

    const email = (data.email || "").trim().toLowerCase();
    if (!email) return fail("Email is required.");

    // A retry after the account was already created (e.g. the first response was
    // lost): nothing to redo, the member only confirms their email and waits.
    const before = await fetchByToken(rawToken);
    if (before?.passwordSet)
      return fail("Your account was already created. Confirm your email, then wait for the Owner to approve you.");

    // 1. mark the onboarding submitted (RPC validates the token; a submitted invite
    //    without an account can be submitted again, so a failed sign-up is retryable)
    const { error: submitErr } = await supabase.rpc("submit_onboarding", {
      p_token: rawToken,
      p_data: data,
      p_email: email,
    });
    if (submitErr) return fail(submitErr.message);

    // 2. look up the onboarding id (so we can pass it to signUp metadata)
    const onb = await fetchByToken(rawToken); // after submit, get_onboarding_by_token still returns it (status submitted, user_id NULL)
    if (!onb) return fail("Could not load the submission.");
    const tokenHash = await sha256Hex(rawToken);

    // 3. create the auth account; handle_new_user() validates the invite + creates the pending profile
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password: password.pw,
      options: {
        data: {
          onboarding_id: onb.id,
          onboarding_token_hash: tokenHash,
          first_name: data.firstName || "",
          last_name: data.lastName || "",
        },
      },
    });
    if (authError) {
      // The onboarding is 'submitted' but no account. The owner can still see the data.
      return fail(authError.message || "Could not create your account. Contact the Owner.");
    }
    if (!authData.user) return fail("Could not create your account.");

    return { ok: true, data: onb };
  },

  // ---------------- file uploads (token-holder) ----------------

  /** Upload the passport photo. Enforces 4 MB image cap. */
  async uploadPhoto(rawToken: string, onboardingId: string, file: File): Promise<R<StoredFile>> {
    if (!file.type.startsWith("image/")) return fail("Upload an image (JPG or PNG).");
    if (file.size > PHOTO_MAX_BYTES) return fail("Photo must be 4 MB or smaller.");
    return this._uploadFile(rawToken, onboardingId, "photo", file);
  },

  /** Upload a credential document. Enforces 5 MB cap. */
  async uploadCredential(rawToken: string, onboardingId: string, file: File): Promise<R<StoredFile>> {
    if (!(file.type.startsWith("image/") || file.type === "application/pdf")) return fail("Images or PDF only.");
    if (file.size > CREDENTIAL_MAX_BYTES) return fail("Credential must be 5 MB or smaller.");
    return this._uploadFile(rawToken, onboardingId, "credential", file);
  },

  async _uploadFile(rawToken: string, onboardingId: string, fileType: "photo" | "credential", file: File): Promise<R<StoredFile>> {
    const path = `${onboardingId}/${fileType}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName(file.name)}`;
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
    if (upErr) return fail(upErr.message || "Upload failed.");

    const { data: fileId, error: regErr } = await supabase.rpc("register_onboarding_file", {
      p_token: rawToken,
      p_file_type: fileType,
      p_file_name: file.name,
      p_storage_path: path,
      p_size: file.size,
      p_mime: file.type,
    });
    if (regErr) {
      // Clean up the orphaned storage object if registration failed.
      await supabase.storage.from(BUCKET).remove([path]).catch(() => {});
      return fail(regErr.message);
    }
    const url = await signedUrl(path);
    return { ok: true, data: { name: file.name, type: file.type, size: file.size, dataUrl: url, id: fileId as unknown as string, path } };
  },

  /** Remove an uploaded file (by its storage path). */
  async removeFile(rawToken: string, fileId: string, storagePath: string): Promise<R<true>> {
    const { error } = await supabase.rpc("delete_onboarding_file", { p_token: rawToken, p_file_id: fileId });
    if (error) return fail(error.message);
    await supabase.storage.from(BUCKET).remove([storagePath]).catch(() => {});
    return { ok: true, data: true };
  },

  // ---------------- owner review ----------------

  async reviewGuarantor(id: string, decision: "accepted" | "declined", reason: string, actorId: string): Promise<R<Onboarding>> {
    const { error } = await supabase.rpc("review_guarantor", {
      p_onboarding_id: id,
      p_decision: decision,
      p_reason: reason || "",
    });
    if (error) return fail(error.message);
    const o = await fetchById(id);
    return o ? { ok: true, data: o } : fail("Not found");
  },

  async approve(id: string, role: "manager" | "storekeeper" | "sales_rep", branchId: string | null, _actorId: string): Promise<R<Onboarding>> {
    const { error } = await supabase.rpc("approve_onboarding", {
      p_onboarding_id: id,
      p_role: role,
      // Generated Args type this as string; the function accepts NULL (no branch).
      p_branch_id: branchId as string,
    });
    if (error) return fail(error.message);
    const o = await fetchById(id);
    return o ? { ok: true, data: o } : fail("Not found");
  },

  async reject(id: string, reason: string, _actorId: string): Promise<R<Onboarding>> {
    const { error } = await supabase.rpc("reject_onboarding", {
      p_onboarding_id: id,
      p_reason: reason,
    });
    if (error) return fail(error.message);
    const o = await fetchById(id);
    return o ? { ok: true, data: o } : fail("Not found");
  },
};