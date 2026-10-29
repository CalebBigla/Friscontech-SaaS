/**
 * Authentication Context
 *
 * Authentication and profile loading have separate states so a missing profile
 * can never be mistaken for a Sales Rep session.
 */
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useNavigate } from "@tanstack/react-router";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { onAuthStateChange } from "@/services/auth";
import { setAuthUserRef, setCurrentUserId } from "@/lib/session";
import type { Role, User, UserStatus } from "@/data/mock-db";

export type AuthStatus = "loading" | "unauthenticated" | "authenticated";
export type ProfileStatus =
  | "idle"
  | "loading"
  | "loaded"
  | "failed"
  | "not_found"
  | "inactive"
  | "role_unassigned"
  | "unsupported_role";

type AuthContextType = {
  /** Supabase auth user, if a session exists. */
  authUser: SupabaseUser | null;
  /** Valid active profile only; invalid or unavailable profiles remain null. */
  user: User | null;
  authStatus: AuthStatus;
  profileStatus: ProfileStatus;
  profileError: string | null;
  /** Backwards compatible aggregate state; prefer authStatus/profileStatus. */
  loading: boolean;
  retryProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const validRoles: readonly Role[] = ["owner", "manager", "storekeeper", "sales_rep"];
const isRole = (value: unknown): value is Role =>
  typeof value === "string" && validRoles.includes(value as Role);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authUser, setAuthUser] = useState<SupabaseUser | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [authStatus, setAuthStatus] = useState<AuthStatus>("loading");
  const [profileStatus, setProfileStatus] = useState<ProfileStatus>("idle");
  const [profileError, setProfileError] = useState<string | null>(null);
  const requestId = useRef(0);
  const activeAuthUserId = useRef<string | null>(null);
  const navigate = useNavigate();

  async function loadUserProfile(authUserId: string, currentRequest = ++requestId.current) {
    setProfileStatus("loading");
    setProfileError(null);
    setUser(null);
    setAuthUserRef(null);
    console.info("[PROFILE QUERY] start", { authUserId });

    try {
      // users.id references auth.users.id; there is no separate auth_id column.
      const { data: row, error, status: queryStatus } = await supabase
        .from("users")
        .select("id, tenant_id, first_name, last_name, email, phone, role, status, branch_id, manager_id, joined_at, deactivated_at, created_at")
        .eq("id", authUserId)
        .maybeSingle();

      if (currentRequest !== requestId.current) return;

      if (error) {
        const queryError = error as {
          code?: string;
          message?: string;
          details?: string;
          hint?: string;
          status?: number;
        };
        console.error("[PROFILE QUERY ERROR]", {
          authUserId,
          code: queryError.code ?? null,
          message: queryError.message ?? null,
          details: queryError.details ?? null,
          hint: queryError.hint ?? null,
          status: queryError.status ?? queryStatus ?? null,
        });
        setProfileStatus("failed");
        setProfileError("We couldn't load your FrisconTech profile. Retry or contact support.");
        return;
      }

      if (!row) {
        console.error("[PROFILE RESULT] profile not found", { authUserId, profileUserId: null });
        setProfileStatus("not_found");
        setProfileError("Your authenticated account has no FrisconTech profile. Contact your administrator.");
        return;
      }

      console.info("[PROFILE RESULT] profile received", {
        authUserId,
        profileUserId: row.id,
        databaseRole: row.role,
        status: row.status,
      });

      if (row.id !== authUserId) {
        console.error("[PROFILE RESULT] profile ID does not match authenticated user", {
          authUserId,
          profileUserId: row.id,
        });
        setProfileStatus("failed");
        setProfileError("The loaded profile does not match your authenticated account. Contact support.");
        return;
      }

      if (row.status !== "active") {
        console.warn("[PROFILE RESULT] profile is not active", {
          authUserId,
          profileUserId: row.id,
          status: row.status,
        });
        setProfileStatus("inactive");
        setProfileError("This profile is not active. Contact your administrator.");
        await supabase.auth.signOut();
        return;
      }

      if (row.role == null) {
        console.error("[ROLE] role is not assigned", {
          authUserId,
          profileUserId: row.id,
          databaseRole: row.role,
          resolvedRole: null,
          status: row.status,
        });
        setProfileStatus("role_unassigned");
        setProfileError("A role has not been assigned to your profile. Contact your administrator.");
        return;
      }

      if (!isRole(row.role)) {
        console.error("[ROLE] unsupported database role", {
          authUserId,
          profileUserId: row.id,
          databaseRole: row.role,
          resolvedRole: null,
          status: row.status,
        });
        setProfileStatus("unsupported_role");
        setProfileError("Your profile has an unsupported role. Contact your administrator.");
        return;
      }

      const resolvedRole: Role = row.role;
      console.info("[ROLE] role resolved", {
        authUserId,
        profileUserId: row.id,
        databaseRole: row.role,
        resolvedRole,
        status: row.status,
      });

      const firstName = row.first_name ?? "";
      const lastName = row.last_name ?? "";
      const appUser: User = {
        id: row.id,
        tenantId: row.tenant_id,
        branchId: row.branch_id ?? null,
        firstName,
        lastName,
        name: [firstName, lastName].filter(Boolean).join(" ") || row.email || "User",
        email: row.email ?? "",
        phone: row.phone ?? null,
        role: resolvedRole,
        status: row.status as UserStatus,
        joinedAt: row.joined_at ?? row.created_at,
        deactivatedAt: row.deactivated_at ?? null,
        authId: row.id,
        managerId: row.manager_id ?? null,
        createdAt: row.joined_at ?? row.created_at ?? new Date().toISOString(),
      };
      setUser(appUser);
      setAuthUserRef(appUser);
      setProfileStatus("loaded");
    } catch (error) {
      if (currentRequest !== requestId.current) return;
      console.error("[PROFILE QUERY] unexpected error", { authUserId, error });
      setProfileStatus("failed");
      setProfileError("We couldn't load your FrisconTech profile. Retry or contact support.");
    }
  }

  useEffect(() => {
    let mounted = true;
    let authEventVersion = 0;

    const acceptSession = (session: any, event?: string) => {
      const nextAuthUser = (session?.user ?? null) as SupabaseUser | null;
      if (!mounted) return;

      if (!nextAuthUser) {
        setCurrentUserId(null);
        const wasAuthenticated = activeAuthUserId.current !== null;
        activeAuthUserId.current = null;
        requestId.current += 1;
        setAuthUser(null);
        setUser(null);
        setAuthUserRef(null);
        setAuthStatus("unauthenticated");
        setProfileStatus("idle");
        setProfileError(null);
        if (event === "SIGNED_OUT" && wasAuthenticated) navigate({ to: "/login" });
        return;
      }

      const userId = nextAuthUser.id;
      setAuthUser(nextAuthUser);
      setAuthStatus("authenticated");
      console.info("[AUTH] authenticated Supabase user", { authUserId: userId });

      // INITIAL_SESSION and getSession can both report the same user. Do not
      // start competing profile requests for that unchanged identity.
      if (activeAuthUserId.current === userId) return;
      activeAuthUserId.current = userId;
      void loadUserProfile(userId, ++requestId.current);
    };

    const {
      data: { subscription },
    } = onAuthStateChange((event, session) => {
      authEventVersion += 1;
      acceptSession(session, event);
    });

    const initialAuthEventVersion = authEventVersion;
    void supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (!mounted) return;
      // Do not let the initial snapshot overwrite a newer sign-in/sign-out event.
      if (authEventVersion !== initialAuthEventVersion) return;
      if (error) {
        console.error("[AUTH] session load error", error);
        // A session read failure is not evidence of an authenticated user.
        if (activeAuthUserId.current === null) setAuthStatus("unauthenticated");
        return;
      }
      acceptSession(session);
    }).catch((error) => {
      if (!mounted) return;
      if (authEventVersion !== initialAuthEventVersion) return;
      console.error("[AUTH] session load error", error);
      if (activeAuthUserId.current === null) setAuthStatus("unauthenticated");
    });

    return () => {
      mounted = false;
      requestId.current += 1;
      subscription.unsubscribe();
    };
  }, [navigate]);

  async function retryProfile() {
    if (!authUser) return;
    await loadUserProfile(authUser.id, ++requestId.current);
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
  }

  const loading = authStatus === "loading" || profileStatus === "loading";

  return (
    <AuthContext.Provider
      value={{
        authUser,
        user,
        authStatus,
        profileStatus,
        profileError,
        loading,
        retryProfile,
        signOut: handleSignOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

/** Hook for pages that require a fully loaded active profile. */
export function useRequireAuth() {
  const { user, authStatus, profileStatus } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (authStatus === "unauthenticated") navigate({ to: "/login" });
  }, [authStatus, navigate]);

  return { user, loading: authStatus === "loading" || profileStatus === "loading" };
}
