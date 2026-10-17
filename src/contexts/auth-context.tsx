/**
 * Authentication Context
 * 
 * Provides authentication state and user profile throughout the app.
 * Listens to Supabase auth state changes and syncs with users table.
 */
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useNavigate } from "@tanstack/react-router";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { onAuthStateChange } from "@/services/auth";
import { setAuthUserRef } from "@/lib/session";
import type { User } from "@/data/mock-db";

type AuthContextType = {
  /** Supabase auth user */
  authUser: SupabaseUser | null;
  /** User profile from users table */
  user: User | null;
  /** Loading state during initialization */
  loading: boolean;
  /** Sign out function */
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authUser, setAuthUser] = useState<SupabaseUser | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setAuthUser(session?.user ?? null);
      if (session?.user) {
        loadUserProfile(session.user.id);
      } else {
        setLoading(false);
      }
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = onAuthStateChange(async (event, session) => {
      console.log("Auth state change:", event);
      setAuthUser(session?.user ?? null);

      if (session?.user) {
        await loadUserProfile(session.user.id);
      } else {
        setUser(null);
        setAuthUserRef(null); // Clear auth user ref on sign out
        setLoading(false);
        
        // Redirect to login on signout
        if (event === "SIGNED_OUT") {
          navigate({ to: "/login" });
        }
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [navigate]);

  async function loadUserProfile(authUserId: string) {
    try {
      type UserRow = {
        id: string; tenant_id: string; branch_id: string | null;
        first_name: string; last_name: string; email: string | null;
        phone: string | null; role: string; status: string;
        joined_at: string; deactivated_at: string | null;
      };

      // First try to find by auth_id
      const { data: byAuthId, error: e1 } = await supabase
        .from("users")
        .select("*")
        .eq("auth_id", authUserId)
        .maybeSingle();

      let userProfile: UserRow | null = byAuthId as UserRow | null;

      // Fallback: try to find by email if auth_id not set
      if (e1 || !userProfile) {
        const { data: authData } = await supabase.auth.getUser();
        if (authData.user?.email) {
          const { data: byEmail } = await supabase
            .from("users")
            .select("*")
            .eq("email", authData.user.email)
            .maybeSingle();

          if (byEmail) {
            userProfile = byEmail as UserRow;

            // Update auth_id for future lookups
            await (supabase as any)
              .from("users")
              .update({ auth_id: authUserId })
              .eq("id", (byEmail as UserRow).id);
          }
        }
      }

      if (userProfile) {
        // Transform database user to app User type
        const appUser: User = {
          id: userProfile.id,
          tenantId: userProfile.tenant_id,
          branchId: userProfile.branch_id ?? null,
          firstName: userProfile.first_name,
          lastName: userProfile.last_name,
          // Derive `name` so all components using scope.user.name never get undefined
          name: [userProfile.first_name, userProfile.last_name].filter(Boolean).join(" ") || userProfile.email || "User",
          email: userProfile.email ?? "",
          phone: userProfile.phone ?? null,
          role: userProfile.role as "owner" | "manager" | "storekeeper" | "sales_rep",
          status: userProfile.status as "active" | "inactive" | "pending",
          joinedAt: userProfile.joined_at,
          deactivatedAt: userProfile.deactivated_at ?? null,
          authId: authUserId,
          managerId: null,
          createdAt: userProfile.joined_at ?? new Date().toISOString(),
        };
        setUser(appUser);
        setAuthUserRef(appUser); // Make available to getAccessScope without db.users
      }
    } catch (err) {
      console.error("Failed to load user profile:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
  }

  return (
    <AuthContext.Provider
      value={{
        authUser,
        user,
        loading,
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

/**
 * Hook to require authentication
 * Redirects to login if not authenticated
 */
export function useRequireAuth() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) {
      navigate({ to: "/login" });
    }
  }, [user, loading, navigate]);

  return { user, loading };
}
