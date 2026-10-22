import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { OwnerDashboard } from "@/components/owner-dashboard";
import { RepDashboard } from "@/components/dashboards/rep-dashboard";
import { ManagerDashboard } from "@/components/dashboards/manager-dashboard";
import { StorekeeperDashboard } from "@/components/dashboards/storekeeper-dashboard";
import { Button } from "@/components/ui/button";
import { useAuth, type ProfileStatus } from "@/contexts/auth-context";
import type { Role } from "@/data/mock-db";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — Friscontech" },
      { name: "description", content: "Monitor sales, inventory, branches, targets, and team performance across your business." },
      { property: "og:title", content: "Dashboard — Friscontech" },
      { property: "og:description", content: "A unified view of business performance, stock health, and team targets." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function StatusScreen({ title, detail, action }: { title: string; detail: string; action?: React.ReactNode }) {
  return (
    <main className="grid min-h-screen place-items-center bg-background px-4 text-foreground">
      <section className="w-full max-w-md rounded-xl border border-border bg-card p-6 text-center shadow-sm">
        <h1 className="text-lg font-semibold">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{detail}</p>
        {action && <div className="mt-5">{action}</div>}
      </section>
    </main>
  );
}

function profileStateMessage(status: ProfileStatus) {
  switch (status) {
    case "failed":
      return { title: "Profile could not be loaded", detail: "We couldn't load your FrisconTech profile. Retry, or contact support if the problem continues." };
    case "not_found":
      return { title: "Profile not found", detail: "Your authenticated account has no matching FrisconTech profile. Contact your administrator." };
    case "role_unassigned":
      return { title: "Role not assigned", detail: "Your profile does not have an assigned role. Contact your administrator." };
    case "unsupported_role":
      return { title: "Unsupported role", detail: "Your profile has a role this application does not recognize. Contact your administrator." };
    case "inactive":
      return { title: "Profile is not active", detail: "This profile cannot access an operational dashboard. Contact your administrator." };
    default:
      return { title: "Profile unavailable", detail: "Your profile is not ready for dashboard access." };
  }
}

function dashboardForRole(role: Role) {
  switch (role) {
    case "owner": return <OwnerDashboard />;
    case "manager": return <ManagerDashboard />;
    case "storekeeper": return <StorekeeperDashboard />;
    case "sales_rep": return <RepDashboard />;
  }
}

function Index() {
  const { authUser, user, authStatus, profileStatus, retryProfile } = useAuth();
  const navigate = useNavigate();

  const dashboardName = profileStatus === "loaded" && user
    ? ({
        owner: "OwnerDashboard",
        manager: "ManagerDashboard",
        storekeeper: "StorekeeperDashboard",
        sales_rep: "RepDashboard",
      } as const)[user.role]
    : null;

  useEffect(() => {
    if (authStatus === "unauthenticated") navigate({ to: "/login", replace: true });
  }, [authStatus, navigate]);

  useEffect(() => {
    if (dashboardName && user) {
      console.info("[DASHBOARD] selected", {
        authUserId: authUser?.id ?? null,
        profileUserId: user.id,
        databaseRole: user.role,
        resolvedRole: user.role,
        status: user.status,
        selectedDashboard: dashboardName,
      });
    }
  }, [authUser?.id, dashboardName, user]);

  if (authStatus === "loading") {
    return <StatusScreen title="Checking your session" detail="Please wait while we confirm your sign-in." />;
  }

  if (authStatus === "unauthenticated") {
    return <StatusScreen title="Redirecting to sign in" detail="Your dashboard requires an authenticated account." />;
  }

  if (profileStatus === "idle" || profileStatus === "loading") {
    return <StatusScreen title="Loading your profile" detail="Please wait while we load your role and access." />;
  }

  if (profileStatus !== "loaded") {
    const message = profileStateMessage(profileStatus);
    return (
      <StatusScreen
        title={message.title}
        detail={message.detail}
        action={profileStatus === "failed"
          ? <Button onClick={() => void retryProfile()}>Retry profile loading</Button>
          : undefined}
      />
    );
  }

  if (!user || !dashboardName) {
    return <StatusScreen title="Account configuration error" detail="A valid active role is required to choose a dashboard. Contact your administrator." />;
  }

  return dashboardForRole(user.role) ?? (
    <StatusScreen title="Unsupported role" detail="Your profile role does not have a dashboard. Contact your administrator." />
  );
}
