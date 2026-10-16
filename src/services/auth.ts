/**
 * Supabase Authentication Service
 * 
 * Replaces mock-auth.ts with production Supabase Auth.
 * Handles signup, signin, signout, password reset, and session management.
 * Creates user profiles in the users table on signup.
 */
import { supabase } from "@/lib/supabase";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { createAuditLog } from "@/services/services";

export type AuthResult<T = true> = 
  | { ok: true; data: T } 
  | { ok: false; error: string };

/**
 * Password validation (min 8 chars, letters + numbers)
 */
export const passwordProblem = (pw: string) =>
  pw.length < 8 || !/[0-9]/.test(pw) || !/[a-z]/i.test(pw) 
    ? "At least 8 characters with letters and numbers" 
    : null;

/**
 * Check if the owner account already exists
 * (First signup becomes owner, subsequent signups are closed)
 */
export async function ownerHasAccount(): Promise<boolean> {
  const { data, error } = await supabase
    .from("users")
    .select("id, email")
    .eq("role", "owner")
    .single();

  if (error) return false;
  return !!data?.email; // Owner has account if email is set
}

/**
 * Check if a specific user has an auth account
 */
export async function hasAccount(userId: string): Promise<boolean> {
  const { data } = await supabase
    .from("users")
    .select("email")
    .eq("id", userId)
    .single();

  return !!data?.email;
}

/**
 * Sign up the first owner account
 * Only allowed if no owner account exists yet
 */
export async function signUpOwner(
  email: string,
  password: string
): Promise<AuthResult> {
  try {
    // Check if owner already exists
    const ownerExists = await ownerHasAccount();
    if (ownerExists) {
      return {
        ok: false,
        error: "Sign-up is closed. Staff join through an onboarding link.",
      };
    }

    // Validate password
    const pwProblem = passwordProblem(password);
    if (pwProblem) {
      return { ok: false, error: pwProblem };
    }

    // Get the owner user record
    const { data: ownerUser, error: ownerError } = await supabase
      .from("users")
      .select("id, tenant_id")
      .eq("role", "owner")
      .single();

    if (ownerError || !ownerUser) {
      return { ok: false, error: "No owner record found." };
    }

    // Create Supabase auth account
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: {
        data: {
          user_id: ownerUser.id, // Link to our users table
          tenant_id: ownerUser.tenant_id,
          role: "owner",
        },
      },
    });

    if (authError) {
      return { ok: false, error: authError.message };
    }

    if (!authData.user) {
      return { ok: false, error: "Failed to create account." };
    }

    // Update the users table with email and auth_id
    const { error: updateError } = await supabase
      .from("users")
      .update({ 
        email: email.trim().toLowerCase(),
        auth_id: authData.user.id 
      })
      .eq("id", ownerUser.id);

    if (updateError) {
      console.error("Failed to update user profile:", updateError);
    }

    // Create audit log for signup
    await supabase.rpc("create_audit_log", {
      p_user_id: ownerUser.id,
      p_action_type: "Signup",
      p_description: "Owner account created",
      p_entity_type: "User",
      p_entity_id: ownerUser.id,
    });

    return { ok: true, data: true };
  } catch (err) {
    console.error("Owner signup error:", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Signup failed",
    };
  }
}

/**
 * Register an auth account for an existing user (via onboarding)
 * Called when a staff member completes onboarding
 */
export async function register(
  userId: string,
  email: string,
  password: string
): Promise<AuthResult> {
  try {
    // Validate password
    const pwProblem = passwordProblem(password);
    if (pwProblem) {
      return { ok: false, error: pwProblem };
    }

    // Get the user record
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("id, tenant_id, role, status")
      .eq("id", userId)
      .single();

    if (userError || !user) {
      return { ok: false, error: "User not found." };
    }

    // Check if email is already taken
    const { data: existingAuth } = await supabase.auth.admin.listUsers();
    const emailExists = existingAuth?.users?.some(
      (u) => u.email?.toLowerCase() === email.trim().toLowerCase()
    );

    if (emailExists) {
      return { ok: false, error: "This email already has an account." };
    }

    // Create Supabase auth account
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: {
        data: {
          user_id: user.id,
          tenant_id: user.tenant_id,
          role: user.role,
        },
      },
    });

    if (authError) {
      return { ok: false, error: authError.message };
    }

    if (!authData.user) {
      return { ok: false, error: "Failed to create account." };
    }

    // Update the users table with email and auth_id
    const { error: updateError } = await supabase
      .from("users")
      .update({ 
        email: email.trim().toLowerCase(),
        auth_id: authData.user.id 
      })
      .eq("id", userId);

    if (updateError) {
      console.error("Failed to update user profile:", updateError);
    }

    return { ok: true, data: true };
  } catch (err) {
    console.error("Registration error:", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Registration failed",
    };
  }
}

/**
 * Sign in with email and password
 */
export async function signIn(
  email: string,
  password: string
): Promise<AuthResult> {
  try {
    const { data: authData, error: authError } =
      await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

    if (authError) {
      return { ok: false, error: "Wrong email or password." };
    }

    if (!authData.user) {
      return { ok: false, error: "Failed to sign in." };
    }

    // Get the user profile
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("id, status, role")
      .eq("auth_id", authData.user.id)
      .single();

    if (userError || !user) {
      // Try matching by email as fallback
      const { data: userByEmail } = await supabase
        .from("users")
        .select("id, status, role")
        .eq("email", email.trim().toLowerCase())
        .single();

      if (!userByEmail) {
        await supabase.auth.signOut();
        return { ok: false, error: "Account not found." };
      }

      // Update auth_id link
      await supabase
        .from("users")
        .update({ auth_id: authData.user.id })
        .eq("id", userByEmail.id);
    }

    const userProfile = user || (await supabase
      .from("users")
      .select("id, status, role")
      .eq("email", email.trim().toLowerCase())
      .single()).data;

    if (!userProfile) {
      await supabase.auth.signOut();
      return { ok: false, error: "Account not found." };
    }

    // Check user status
    if (userProfile.status === "pending") {
      await supabase.auth.signOut();
      return {
        ok: false,
        error: "Your account is waiting for the Owner to activate it.",
      };
    }

    if (userProfile.status !== "active") {
      await supabase.auth.signOut();
      return { ok: false, error: "This account has been deactivated." };
    }

    // Create audit log for login
    await supabase.rpc("create_audit_log", {
      p_user_id: userProfile.id,
      p_action_type: "Login",
      p_description: "Signed in with email and password",
      p_entity_type: "User",
      p_entity_id: userProfile.id,
    });

    return { ok: true, data: true };
  } catch (err) {
    console.error("Sign in error:", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Sign in failed",
    };
  }
}

/**
 * Sign out current user
 */
export async function signOut(userId?: string): Promise<void> {
  try {
    // Create audit log before signing out
    if (userId) {
      await supabase.rpc("create_audit_log", {
        p_user_id: userId,
        p_action_type: "Logout",
        p_description: "Signed out",
        p_entity_type: "User",
        p_entity_id: userId,
      });
    }

    await supabase.auth.signOut();
  } catch (err) {
    console.error("Sign out error:", err);
  }
}

/**
 * Request password reset email
 * Returns success regardless of whether email exists (no account enumeration)
 */
export async function requestPasswordReset(
  email: string
): Promise<AuthResult<null>> {
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(
      email.trim().toLowerCase(),
      {
        redirectTo: `${window.location.origin}/reset-password`,
      }
    );

    if (error) {
      console.error("Password reset request error:", error);
    }

    // Always return success (no account enumeration)
    return { ok: true, data: null };
  } catch (err) {
    console.error("Password reset error:", err);
    return { ok: true, data: null };
  }
}

/**
 * Reset password with token (from email link)
 * Supabase handles the token validation automatically
 */
export async function resetPassword(newPassword: string): Promise<AuthResult> {
  try {
    // Validate password
    const pwProblem = passwordProblem(newPassword);
    if (pwProblem) {
      return { ok: false, error: pwProblem };
    }

    const { data, error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (error) {
      return { ok: false, error: error.message };
    }

    if (!data.user) {
      return { ok: false, error: "Failed to reset password." };
    }

    // Get user profile for audit log
    const { data: user } = await supabase
      .from("users")
      .select("id")
      .eq("auth_id", data.user.id)
      .single();

    if (user) {
      await supabase.rpc("create_audit_log", {
        p_user_id: user.id,
        p_action_type: "Password reset",
        p_description: "Reset password with a recovery link",
        p_entity_type: "User",
        p_entity_id: user.id,
      });
    }

    return { ok: true, data: true };
  } catch (err) {
    console.error("Password reset error:", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Password reset failed",
    };
  }
}

/**
 * Get current authenticated user
 */
export async function getCurrentUser(): Promise<SupabaseUser | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/**
 * Get current session
 */
export async function getSession() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session;
}

/**
 * Subscribe to auth state changes
 */
export function onAuthStateChange(
  callback: (event: string, session: any) => void
) {
  return supabase.auth.onAuthStateChange(callback);
}
