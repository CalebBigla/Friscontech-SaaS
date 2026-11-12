import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Contact,
  Activity,
  ArrowLeftRight,
  BadgeCheck,
  BarChart3,
  Boxes,
  ClipboardCheck,
  ClipboardList,
  Landmark,
  LayoutDashboard,
  Menu,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Receipt,
  Settings,
  ShoppingCart,
  Store,
  Target,
  Users,
  Wallet,
  X,
  Check,
  Monitor,
  Moon,
  Sun,
  type LucideIcon,
} from "lucide-react";
import { useTheme, type ThemeChoice } from "@/lib/theme";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/contexts/auth-context";
import { useBranches } from "@/hooks/use-branches";
import { useTenant } from "@/hooks/use-tenant";
import * as auth from "@/services/auth";
import {
  getScopeForUser,
  setCurrentUserId,
  useCurrentUserId,
  type AccessScope,
} from "@/lib/session";
import { roleLabel } from "@/lib/format";
import { UserAvatar } from "@/components/shared";
import { useMemberPhotos } from "@/hooks/use-onboardings";
import { NotificationBell } from "@/components/notifications/notification-bell";

/** Phone tab bar for field roles; "More" opens the full menu. */
const mobileTabs: Record<string, { label: string; icon: LucideIcon; to: NavTo }[]> = {
  sales_rep: [
    { label: "Home", icon: LayoutDashboard, to: "/" },
    { label: "Sales", icon: ShoppingCart, to: "/sales" },
    { label: "Customers", icon: Contact, to: "/customers" },
    { label: "Payment", icon: Wallet, to: "/payment" },
  ],
  storekeeper: [
    { label: "Home", icon: LayoutDashboard, to: "/" },
    { label: "Inventory", icon: Boxes, to: "/inventory" },
    { label: "Requests", icon: ClipboardList, to: "/stock-requests" },
    { label: "Approvals", icon: BadgeCheck, to: "/approvals" },
  ],
};

type NavTo =
  | "/"
  | "/branches"
  | "/sales"
  | "/payment"
  | "/expenses"
  | "/remittance"
  | "/owner/remittance"
  | "/inventory"
  | "/stock-requests"
  | "/products"
  | "/targets"
  | "/stock-movements"
  | "/audit-log"
  | "/team"
  | "/reports"
  | "/settings"
  | "/approvals"
  | "/customers"
  | "/manager-remittances";
type NavItem = {
  label: string;
  icon: LucideIcon;
  to?: NavTo;
  ownerOnly?: boolean;
  managerOnly?: boolean;
  needsSales?: boolean;
  needsBranches?: boolean;
};
type NavSection = { title: string; items: NavItem[] };
const managementSections: NavSection[] = [
  { title: "Overview", items: [{ label: "Dashboard", icon: LayoutDashboard, to: "/" }] },
  {
    title: "Operations",
    items: [
      { label: "Branches", icon: Store, to: "/branches", needsBranches: true },
      { label: "Sales", icon: ShoppingCart, to: "/sales", needsSales: true },
      { label: "Payment", icon: Wallet, to: "/payment" },
      { label: "Expenses", icon: Receipt, to: "/expenses", managerOnly: true },
      { label: "Manager Remittance", icon: Landmark, to: "/remittance", managerOnly: true },
      { label: "Manager Remittance Approvals", icon: Landmark, to: "/remittance", ownerOnly: true },
      { label: "Inventory", icon: Boxes, to: "/inventory" },
      { label: "Stock Requests", icon: ClipboardList, to: "/stock-requests" },
      { label: "Products", icon: Package, to: "/products" },
      { label: "Targets", icon: Target, to: "/targets", ownerOnly: true },
      { label: "Reports", icon: BarChart3, to: "/reports" },
      { label: "Approvals", icon: BadgeCheck, to: "/approvals" },
    ],
  },
  {
    title: "Administration",
    items: [
      { label: "Team", icon: Users, to: "/team" },
      { label: "Audit Log", icon: ClipboardCheck, to: "/audit-log" },
      { label: "Settings", icon: Settings, to: "/settings" },
    ],
  },
];
const ownerSections: NavSection[] = [
  { title: "Overview", items: [{ label: "Dashboard", icon: LayoutDashboard, to: "/" }] },
  {
    title: "Operations",
    items: [
      { label: "Branches", icon: Store, to: "/branches" },
      { label: "Sales", icon: ShoppingCart, to: "/sales" },
      { label: "Remittance", icon: Landmark, to: "/owner/remittance" },
      { label: "Inventory", icon: Boxes, to: "/inventory" },
      { label: "Products", icon: Package, to: "/products" },
      { label: "Targets", icon: Target, to: "/targets" },
      { label: "Team", icon: Users, to: "/team" },
      { label: "Reports", icon: BarChart3, to: "/reports" },
      { label: "Payment", icon: Wallet, to: "/payment" },
      { label: "Manager Remittances", icon: Landmark, to: "/manager-remittances" },
      { label: "Customers", icon: Contact, to: "/customers" },
      { label: "Expenses", icon: Receipt, to: "/expenses" },
    ],
  },
  {
    title: "Settings",
    items: [
      { label: "Audit Log", icon: ClipboardCheck, to: "/audit-log" },
      { label: "Settings", icon: Settings, to: "/settings" },
    ],
  },
];
const repSections: NavSection[] = [
  { title: "Overview", items: [{ label: "Dashboard", icon: LayoutDashboard, to: "/" }] },
  {
    title: "Sales",
    items: [
      { label: "My Sales", icon: ShoppingCart, to: "/sales" },
      { label: "Customers", icon: Contact, to: "/customers" },
      { label: "Payment", icon: Wallet, to: "/payment" },
      { label: "Stock Requests", icon: ClipboardList, to: "/stock-requests" },
    ],
  },
  {
    title: "Account",
    items: [
      { label: "My Activity", icon: ClipboardCheck, to: "/audit-log" },
      { label: "Settings", icon: Settings, to: "/settings" },
    ],
  },
];
/** Supervisors work from their Reports page (home) and their own settings. */
const supervisorSections: NavSection[] = [
  { title: "Reports", items: [{ label: "Reports", icon: BarChart3, to: "/" }] },
  { title: "Account", items: [{ label: "Settings", icon: Settings, to: "/settings" }] },
];
/** Pages a Supervisor may open; any other page shows a notice instead of an empty screen. */
const supervisorPaths = new Set(["/", "/settings"]);

const storekeeperSections: NavSection[] = [
  { title: "Overview", items: [{ label: "Dashboard", icon: LayoutDashboard, to: "/" }] },
  {
    title: "Inventory",
    items: [
      { label: "Inventory", icon: Boxes, to: "/inventory" },
      { label: "Products", icon: Package, to: "/products" },
      { label: "Stock Movements", icon: ArrowLeftRight, to: "/stock-movements" },
      { label: "Customers", icon: Contact, to: "/customers" },
    ],
  },
  {
    title: "Operations",
    items: [
      { label: "Stock Requests", icon: ClipboardList, to: "/stock-requests" },
      { label: "My Approvals", icon: BadgeCheck, to: "/approvals" },
    ],
  },
  {
    title: "Account",
    items: [
      { label: "Audit Log", icon: ClipboardCheck, to: "/audit-log" },
      { label: "Settings", icon: Settings, to: "/settings" },
    ],
  },
];
const sectionsFor = (role: string) =>
  role === "supervisor"
    ? supervisorSections
    : role === "sales_rep"
    ? repSections
    : role === "storekeeper"
      ? storekeeperSections
      : role === "owner"
        ? ownerSections
        : managementSections;



/**
 * The sidebar preference read once per page load. Every screen renders its own
 * AppShell, so without this each navigation would start expanded and then
 * collapse, which looks like the page reloading.
 */
let sidebarCollapsedPreference: boolean | null = null;

/**
 * Pages render only once the sign-in and profile are loaded. Until then the
 * scope has no role, so a page would show "Access restricted" or empty data for
 * a moment on every refresh. Signed-out visitors go to the sign-in page.
 */
function useSessionReady() {
  const { authStatus, profileStatus, profileError, retryProfile } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (authStatus === "unauthenticated") void navigate({ to: "/login", replace: true });
  }, [authStatus, navigate]);
  if (authStatus === "loading" || (authStatus === "authenticated" && (profileStatus === "idle" || profileStatus === "loading")))
    return { ready: false, gate: <SessionScreen title="Loading your account" detail="Checking your sign-in and role." /> };
  if (authStatus === "unauthenticated")
    return { ready: false, gate: <SessionScreen title="Redirecting to sign in" detail="Sign in to continue." /> };
  if (profileStatus !== "loaded")
    return {
      ready: false,
      gate: <SessionScreen title="We couldn't load your account" detail={profileError ?? "Your profile is not active. Contact the Owner."}
        action={profileStatus === "failed" ? <Button size="sm" onClick={() => void retryProfile()}>Try again</Button> : undefined} />,
    };
  return { ready: true, gate: null };
}

function SessionScreen({ title, detail, action }: { title: string; detail: string; action?: ReactNode }) {
  return (
    <div role="status" aria-live="polite" className="grid min-h-screen place-items-center bg-background p-6 text-center text-foreground">
      <div><p className="text-sm font-semibold">{title}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p>{action && <div className="mt-4">{action}</div>}</div>
    </div>
  );
}

export function AppShell({
  title,
  subtitle,
  headerExtra,
  actions,
  children,
}: {
  title: string;
  subtitle?: string | undefined;
  headerExtra?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(sidebarCollapsedPreference ?? false);
  const [sidebarPreferenceReady, setSidebarPreferenceReady] = useState(sidebarCollapsedPreference !== null);
  useEffect(() => {
    if (sidebarCollapsedPreference !== null) return;
    try {
      sidebarCollapsedPreference = window.localStorage.getItem("friscontech-sidebar-collapsed") === "true";
    } catch {
      sidebarCollapsedPreference = false;
    }
    setSidebarCollapsed(sidebarCollapsedPreference);
    setSidebarPreferenceReady(true);
  }, []);
  useEffect(() => {
    if (!sidebarPreferenceReady) return;
    sidebarCollapsedPreference = sidebarCollapsed;
    try {
      window.localStorage.setItem("friscontech-sidebar-collapsed", String(sidebarCollapsed));
    } catch {
      // The sidebar remains usable if local storage is unavailable.
    }
  }, [sidebarCollapsed, sidebarPreferenceReady]);
  const session = useSessionReady();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { user: authUser } = useAuth();
  const legacyUserId = useCurrentUserId();
  const userId = authUser?.id ?? legacyUserId;
  const scope = getScopeForUser(authUser ?? null, userId);
  const { data: branches = [] } = useBranches();
  const { data: tenant } = useTenant();
  const branch = branches.find((b) => b.id === scope.user.branchId);
  const tabs = mobileTabs[scope.user.role];
  const { data: photos = {} } = useMemberPhotos(!!authUser);

  if (!session.ready) return session.gate;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {open && (
        <div className="fixed inset-0 z-40 bg-overlay lg:hidden" onClick={() => setOpen(false)} />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-border bg-sidebar transition-all lg:translate-x-0 ${sidebarCollapsed ? "lg:w-16" : "lg:w-64"} ${open ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div
          className={`flex h-16 items-center justify-between border-b border-border ${sidebarCollapsed ? "px-2" : "px-5"}`}
        >
          <div className={`flex min-w-0 items-center gap-2.5 ${sidebarCollapsed ? "lg:mx-auto" : ""}`}>
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-primary to-primary/75 text-primary-foreground shadow-sm">
              <Activity className="size-4" />
            </span>
            <div className={`min-w-0 ${sidebarCollapsed ? "lg:hidden" : ""}`}>
              <p className="truncate text-[15px] font-semibold tracking-tight">Friscontech</p>
              <p className="truncate text-[11px] text-muted-foreground">
                {tenant?.name ?? `${roleLabel[scope.user.role]} console`}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="hidden shrink-0 lg:inline-flex"
            onClick={() => setSidebarCollapsed((value) => !value)}
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen className="size-4" />
            ) : (
              <PanelLeftClose className="size-4" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setOpen(false)}
            aria-label="Close menu"
          >
            <X className="size-4" />
          </Button>
        </div>
        <TooltipProvider delayDuration={200}>
          <nav className="flex-1 overflow-y-auto p-3">
            {sectionsFor(scope.user.role).map((section) => {
              const items = section.items.filter(
                (i) =>
                  (!i.ownerOnly || scope.user.role === "owner") &&
                  (!i.managerOnly || scope.user.role === "manager") &&
                  (!i.needsSales || scope.canViewSales) &&
                  (!i.needsBranches || scope.canViewBranches),
              );
              if (!items.length) return null;
              return (
                <div key={section.title}>
                  <p
                    className={`px-3 pb-1.5 pt-5 text-[11px] font-medium tracking-wide text-muted-foreground/80 first:pt-1 ${sidebarCollapsed ? "lg:hidden" : ""}`}
                  >
                    {section.title}
                  </p>
                  <div className="space-y-0.5">
                    {items.map(({ label, icon: Icon, to }) =>
                      to ? (
                        <Tooltip key={label}>
                          <TooltipTrigger asChild>
                            <Link
                              to={to}
                              onClick={() => setOpen(false)}
                              activeOptions={{ exact: to === "/" }}
                              className={`group relative flex h-9 items-center gap-2.5 rounded-lg px-3 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground ${sidebarCollapsed ? "lg:justify-center lg:px-0" : ""}`}
                              activeProps={{ className: "!bg-sidebar-accent !text-sidebar-accent-foreground !font-semibold before:absolute before:inset-y-2 before:-left-3 before:w-[3px] before:rounded-r-full before:bg-primary" }}
                              aria-label={sidebarCollapsed ? label : undefined}
                            >
                              <Icon className="size-4 shrink-0" />
                              <span className={sidebarCollapsed ? "lg:hidden" : ""}>{label}</span>
                            </Link>
                          </TooltipTrigger>
                          {sidebarCollapsed && (
                            <TooltipContent side="right" className="hidden lg:block">
                              {label}
                            </TooltipContent>
                          )}
                        </Tooltip>
                      ) : (
                        <Button
                          key={label}
                          variant="ghost"
                          className="w-full justify-start"
                          onClick={() => toast(`${label} is coming in the next phase`)}
                        >
                          <Icon className="size-4" />
                          {label}
                          <span className="ml-auto text-[9px] font-bold uppercase text-muted-foreground">
                            Soon
                          </span>
                        </Button>
                      ),
                    )}
                  </div>
                </div>
              );
            })}
          </nav>
        </TooltipProvider>
        <div className="border-t border-border p-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className={`flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors hover:bg-muted ${sidebarCollapsed ? "lg:justify-center" : ""}`}
                aria-label="Account menu"
              >
                <UserAvatar name={scope.user.name ?? ""} src={photos[userId]} />
                <div className={sidebarCollapsed ? "min-w-0 lg:hidden" : "min-w-0"}>
                  <p className="truncate text-[13px] font-semibold">{scope.user.name ?? "—"}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {roleLabel[scope.user.role]} · {branch?.name ?? tenant?.name ?? ""}
                  </p>
                </div>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuLabel className="text-xs">
                <p className="font-bold">{scope.user.name ?? "—"}</p>
                <p className="font-normal text-muted-foreground">{scope.user.email ?? ""}</p>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to="/settings" className="text-xs">Settings</Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to="/login" onClick={() => auth.signOut(userId)} className="text-xs font-semibold text-destructive">
                  Sign out
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      <div className={sidebarCollapsed ? "lg:pl-16" : "lg:pl-64"}>
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur-md supports-[backdrop-filter]:bg-background/70 sm:px-6 lg:px-8">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="size-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[15px] font-semibold tracking-tight sm:text-lg">{title}</h1>
            {subtitle && (
              <p className="hidden truncate text-[13px] text-muted-foreground sm:block">{subtitle}</p>
            )}
          </div>
          {headerExtra}
          <ThemeToggle />
          <NotificationBell />
          {actions}
        </header>
        <main
          className={`page-enter mx-auto max-w-[1440px] p-4 sm:p-6 lg:px-8 lg:py-7 ${tabs ? "pb-24 lg:pb-7" : ""}`}
        >
          {scope.user.role === "supervisor" && !supervisorPaths.has(pathname)
            ? <RestrictedNotice message="Supervisors request and open reports from their Reports page." />
            : children}
        </main>
      </div>
      {tabs && (
        <nav
          aria-label="Quick navigation"
          className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
        >
          {tabs.map(({ label, icon: Icon, to }) => (
            <Link
              key={to}
              to={to}
              activeOptions={{ exact: to === "/" }}
              className="relative flex min-h-14 flex-col items-center justify-center gap-1 text-[10px] font-medium text-muted-foreground transition-colors"
              activeProps={{ className: "!text-primary before:absolute before:inset-x-5 before:top-0 before:h-0.5 before:rounded-b-full before:bg-primary" }}
            >
              <Icon className="size-5" />
              {label}
            </Link>
          ))}
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex min-h-14 flex-col items-center justify-center gap-1 text-[10px] font-semibold text-muted-foreground"
          >
            <Menu className="size-5" />
            More
          </button>
        </nav>
      )}
    </div>
  );
}

/** Light / dark / system switch in the top bar (remembered on this device). */
export function ThemeToggle() {
  const { choice, isDark, setTheme } = useTheme();
  const options: { value: ThemeChoice; label: string; icon: LucideIcon }[] = [
    { value: "light", label: "Light", icon: Sun },
    { value: "dark", label: "Dark", icon: Moon },
    { value: "system", label: "System", icon: Monitor },
  ];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Change theme" title="Theme">
          {isDark ? <Moon className="size-[18px]" /> : <Sun className="size-[18px]" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-36">
        {options.map(({ value, label, icon: Icon }) => (
          <DropdownMenuItem key={value} onClick={() => setTheme(value)} className="gap-2 text-[13px]">
            <Icon className="size-4" />
            {label}
            {choice === value && <Check className="ml-auto size-4 text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Renders children only when the current role may use the module; the page itself never mounts otherwise. */
export function RoleGate({
  allow,
  title,
  message,
  children,
}: {
  allow: (scope: AccessScope) => boolean;
  title: string;
  message: string;
  children: ReactNode;
}) {
  const { user: authUser } = useAuth();
  const legacyUserId = useCurrentUserId();
  const userId = authUser?.id ?? legacyUserId;
  const scope = getScopeForUser(authUser ?? null, userId);
  const session = useSessionReady();
  // Decide access only once the role is known, never from the empty pre-load scope.
  if (!session.ready) return session.gate;
  if (!allow(scope))
    return (
      <AppShell title={title}>
        <RestrictedNotice message={message} />
      </AppShell>
    );
  return <>{children}</>;
}

export function RestrictedNotice({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-10 text-center shadow-panel">
      <p className="text-sm font-semibold">Access restricted</p>
      <p className="mt-1 text-xs text-muted-foreground">{message}</p>
    </div>
  );
}
