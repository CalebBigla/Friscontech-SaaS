/**
 * Supabase Authentication Service
 *
 * Auth (Supabase) and authorization (FrisconTech `users` profile) are kept separate:
 *   - Authentication = "does this person have a valid Supabase account?"
 *   - Authorization = "is this person an ACTIVE FrisconTech user, and what
 *     organization/role/branch can they access?" (read from the public.users profile)
 *
 * Owner registration: supabase.auth.signUp with user_metadata.is_owner = true. The
 * handle_new_user() trigger (migration 20260118010000) creates the tenant + owner
 * profile (status='active') in the same transaction. No pre-existing row is required.
 *
 * Staff onboarding: the auth account is created by the onboarding form's submit step
 * (see onboarding-service). handle_new_user() creates a PENDING profile linked to the
 * onboarding. The owner activates it via approve_onboarding() (status -> 'active').
 *
 * Sign-in is refused when the profile status is not 'active' (pending / rejected /
 * inactive / suspended), so an unapproved staff member cannot reach the app.
 */
import { supabase } from "@/lib/supabase";
import type { Database } from "@/types/database.types";

type AuditArgs = Database["public"]["Functions"]["create_audit_log"]["Args"];

async function writeAuditBestEffort(action: string, params: AuditArgs) {
  try {
    const { error } = await supabase.rpc("create_audit_log", params);
    if (error) console.warn(`[AUDIT] ${action} log failed`, error);
  } catch (error) {
    console.warn(`[AUDIT] ${action} log failed`, error);
  }
}

export type AuthResult<T = true> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/** Password rules (min 8 chars, letters + numbers). */
export const passwordProblem = (pw: string) =>
  pw.length < 8 || !/[0-9]/.test(pw) || !/[a-z]/i.test(pw)
    ? "At least 8 characters with letters and numbers"
    : null;

/**
 * Does an owner account already exist? Anon cannot read `users` through RLS, so this
 * calls a public SECURITY DEFINER helper. Used by the login page to decide whether to
 * show "Sign in" or "Create owner account".
 */
export async function ownerHasAccount(): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc("owner_account_exists");
    if (error) {
      // Fall back to assuming an owner exists so we don't accidentally open sign-up.
      console.error("owner_account_exists failed", error);
      return true;
    }
    return !!data;
  } catch {
    return true;
  }
}

export interface OwnerSignupInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  orgName: string;
  orgLegalName?: string;
  orgPhone?: string;
}

/**
 * Sign up the FIRST owner. The handle_new_user trigger creates the tenant + owner
 * profile (status='active'). After this, sign-up is closed — staff join by invite only.
 */
export async function signUpOwner(input: OwnerSignupInput): Promise<AuthResult<{ confirmationRequired: boolean }>> {
  try {
    const ownerExists = await ownerHasAccount();
    if (ownerExists) {
      return { ok: false, error: "Sign-up is closed. Staff join through an onboarding link." };
    }
    const pwProblem = passwordProblem(input.password);
    if (pwProblem) return { ok: false, error: pwProblem };

    const email = input.email.trim().toLowerCase();
    const { data, error } = await supabase.auth.signUp({
      email,
      password: input.password,
      options: {
        data: {
          is_owner: true,
          first_name: input.firstName.trim(),
          last_name: input.lastName.trim(),
          org_name: input.orgName.trim(),
          org_legal_name: input.orgLegalName?.trim() || input.orgName.trim(),
          org_phone: input.orgPhone?.trim() || "",
        },
      },
    });

    if (error) return { ok: false, error: error.message };
    if (!data.user) return { ok: false, error: "Failed to create account." };

    // If email confirmation is required on the project, no session is returned.
    if (!data.session) {
      return {
        ok: true,
        data: { confirmationRequired: true },
      };
    }

    // Audit log via the real create_audit_log signature.
    await writeAuditBestEffort("Owner signup", {
      p_tenant_id: data.user.id, // placeholder; the trigger created the real tenant — re-fetched on next load
      p_actor_id: data.user.id,
      p_action: "Owner account created",
      p_subject: `${input.firstName} ${input.lastName} · ${email}`,
      p_entity: "team_member",
      p_entity_id: data.user.id,
    });

    return { ok: true, data: { confirmationRequired: false } };
  } catch (err) {
    console.error("Owner signup error", err);
    return { ok: false, error: err instanceof Error ? err.message : "Signup failed" };
  }
}

/**
 * Sign in with email + password. Authentication is Supabase; authorization is the
 * public.users profile. Refuses sign-in unless the profile status is 'active'.
 */
export async function signIn(email: string, password: string): Promise<AuthResult> {
  try {
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (authError) {
      if ((authError as { code?: string }).code === "email_not_confirmed") {
        return { ok: false, error: "Confirm your email before signing in. Check your inbox for the confirmation link." };
      }
      return { ok: false, error: "Wrong email or password." };
    }
    if (!authData.user) return { ok: false, error: "Failed to sign in." };

    // The profile id IS the auth user id (users.id references auth.users(id)).
    const { data: profile, error: profileError } = await supabase
      .from("users")
      .select("id, status, role, tenant_id")
      .eq("id", authData.user.id)
      .maybeSingle();

    if (profileError || !profile) {
      await supabase.auth.signOut();
      return { ok: false, error: "Your account is not part of an organization. Ask your owner for an invite." };
    }

    if (profile.status === "pending") {
      await supabase.auth.signOut();
      return { ok: false, error: "Your account is waiting for the Owner to activate it." };
    }
    if (profile.status === "rejected") {
      await supabase.auth.signOut();
      return { ok: false, error: "Your onboarding was declined. Contact the Owner." };
    }
    if (profile.status === "suspended") {
      await supabase.auth.signOut();
      return { ok: false, error: "This account has been suspended. Contact the Owner." };
    }
    if (profile.status !== "active") {
      await supabase.auth.signOut();
      return { ok: false, error: "This account has been deactivated." };
    }

    // Audit the login (best-effort; the profile now exists so RLS allows it).
    await writeAuditBestEffort("Login", {
      p_tenant_id: profile.tenant_id,
      p_actor_id: profile.id,
      p_action: "Login",
      p_subject: "Signed in with email and password",
      p_entity: "session",
      p_entity_id: profile.id,
    });

    return { ok: true, data: true };
  } catch (err) {
    console.error("Sign in error", err);
    return { ok: false, error: err instanceof Error ? err.message : "Sign in failed" };
  }
}

/** Sign out the current user. */
export async function signOut(userId?: string): Promise<void> {
  try {
    if (userId) {
      // Best-effort audit; ignore errors.
      const { data: { session } } = await supabase.auth.getSession();
      const tenantId = (session?.user as any)?.user_metadata?.tenant_id;
      await writeAuditBestEffort("Logout", {
        p_tenant_id: tenantId ?? userId,
        p_actor_id: userId,
        p_action: "Logout",
        p_subject: "Signed out",
        p_entity: "session",
        p_entity_id: userId,
      });
    }
    await supabase.auth.signOut();
  } catch (err) {
    console.error("Sign out error", err);
  }
}

/**
 * Request a password reset email. Always returns success (no account enumeration).
 */
export async function requestPasswordReset(email: string): Promise<AuthResult<null>> {
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) console.error("Password reset request error", error);
    return { ok: true, data: null };
  } catch (err) {
    console.error("Password reset error", err);
    return { ok: true, data: null };
  }
}

/** Reset password (the Supabase recovery flow already validated the token). */
export async function resetPassword(newPassword: string): Promise<AuthResult> {
  try {
    const pwProblem = passwordProblem(newPassword);
    if (pwProblem) return { ok: false, error: pwProblem };
    const { data, error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) return { ok: false, error: error.message };
    if (!data.user) return { ok: false, error: "Failed to reset password." };
    return { ok: true, data: true };
  } catch (err) {
    console.error("Password reset error", err);
    return { ok: false, error: err instanceof Error ? err.message : "Password reset failed" };
  }
}

/**
 * Signed-in password change. The current password is re-checked with Supabase
 * Auth first; the new password is then set on the auth account (never stored in
 * app tables) and an audit row is written.
 */
export async function changePassword(
  input: { current: string; next: string },
  profile: { id: string; email: string; tenantId: string },
): Promise<AuthResult> {
  try {
    const { error: checkError } = await supabase.auth.signInWithPassword({ email: profile.email, password: input.current });
    if (checkError) return { ok: false, error: "Your current password is incorrect." };
    const { error } = await supabase.auth.updateUser({ password: input.next });
    if (error) return { ok: false, error: error.message };
    await writeAuditBestEffort("Password changed", {
      p_tenant_id: profile.tenantId,
      p_actor_id: profile.id,
      p_action: "Password changed",
      p_subject: "Changed account password",
      p_entity: "session",
      p_entity_id: profile.id,
    });
    return { ok: true, data: true };
  } catch (err) {
    console.error("Password change error", err);
    return { ok: false, error: err instanceof Error ? err.message : "Password change failed" };
  }
}

export async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function getSession() {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

export function onAuthStateChange(callback: (event: string, session: any) => void) {
  return supabase.auth.onAuthStateChange(callback);
}
