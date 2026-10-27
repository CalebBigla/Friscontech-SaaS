import type { ReactNode } from "react";
import { AlertTriangle, Inbox, Search, type LucideIcon } from "lucide-react";
import type { StockRequest, StockRequestStatus } from "@/data/mock-db";
import { getRequestDisplayStatus, inventoryStatusLabel, requestDisplayLabel, type InventoryStatus, type RequestDisplayStatus } from "@/lib/inventory-calculations";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { PerformanceBand } from "@/lib/calculations";
import { bandLabel } from "@/lib/calculations";

export const ALL = "all";

export function MetricCard({ icon: Icon, tone, label, value, detail, badge }: { icon: LucideIcon; tone: "success" | "brand" | "violet" | "warning"; label: string; value: string; detail?: string | undefined; badge?: string | undefined }) {
  return (
    <article className="h-full min-w-0 rounded-xl border border-border bg-card p-4 shadow-panel transition-shadow hover:shadow-raised sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 truncate text-[13px] font-medium text-muted-foreground">{label}</p>
        <span className={`metric-icon metric-icon-${tone} shrink-0`}><Icon className="size-[18px]" /></span>
      </div>
      <p className="mt-2 truncate text-xl font-semibold tracking-tight tabular-nums sm:text-[26px] sm:leading-8">{value}</p>
      <div className="mt-2 flex min-h-5 items-center gap-2">
        {badge && <span className={`status status-${tone}`}>{badge}</span>}
        {detail && <p className="min-w-0 truncate text-xs text-muted-foreground">{detail}</p>}
      </div>
    </article>
  );
}

export function FilterSelect({ value, onChange, options, label, className = "w-full sm:w-44" }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; label: string; className?: string }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label} className={`h-9 bg-card text-[13px] shadow-none ${className}`}><SelectValue /></SelectTrigger>
      <SelectContent>{options.map((o) => <SelectItem key={o.value} value={o.value} className="text-[13px]">{o.label}</SelectItem>)}</SelectContent>
    </Select>
  );
}

export function BranchStatusBadge({ status }: { status: "active" | "inactive" }) {
  return <span className={`status ${status === "active" ? "status-success" : "status-warning"}`}>{status === "active" ? "Active" : "Inactive"}</span>;
}
export function BandBadge({ band }: { band: PerformanceBand }) {
  return <span className={`status ${band === "exceeding" ? "status-success" : band === "on_track" ? "status-brand" : "status-danger"}`}>{bandLabel[band]}</span>;
}
export function ProgressBar({ value, band }: { value: number; band: PerformanceBand }) {
  return <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full ${band === "exceeding" ? "bg-success" : band === "on_track" ? "bg-warning" : "bg-destructive"}`} style={{ width: `${Math.min(value, 100)}%` }} /></div>;
}
export function Panel({ title, subtitle, action, children, className = "" }: { title: string; subtitle?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-border bg-card shadow-panel ${className}`}>
      <div className="flex flex-col gap-3 border-b border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0"><h2 className="panel-title">{title}</h2>{subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}</div>
        {action}
      </div>
      {children}
    </section>
  );
}
export function EmptyState({ title, detail, icon: Icon = Inbox }: { title: string; detail?: string; icon?: LucideIcon }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <span className="grid size-11 place-items-center rounded-full bg-muted text-muted-foreground"><Icon className="size-5" /></span>
      <p className="mt-3 text-sm font-semibold">{title}</p>
      {detail && <p className="mt-1 max-w-sm text-xs text-muted-foreground">{detail}</p>}
    </div>
  );
}
export function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "The database request failed.";
}
/** Placeholder layout while data loads: metric tiles and a panel of rows. */
export function LoadingState({ label = "Loading data…" }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" aria-label={label} className="animate-pulse space-y-4">
      <span className="sr-only">{label}</span>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-[118px] rounded-xl border border-border bg-card" />)}
      </div>
      <div className="rounded-xl border border-border bg-card">
        <div className="border-b border-border px-5 py-4"><div className="h-4 w-40 rounded bg-muted" /></div>
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-4 border-b border-border px-5 py-4 last:border-0">
            <div className="size-8 rounded-full bg-muted" /><div className="h-3 flex-1 rounded bg-muted" /><div className="h-3 w-20 rounded bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}
export function ErrorState({ title = "Could not load data", error }: { title?: string; error: unknown }) {
  return (
    <div role="alert" className="flex gap-3 rounded-xl border border-destructive/25 bg-danger-soft p-4 text-sm">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
      <div className="min-w-0"><p className="font-semibold text-destructive">{title}</p><p className="mt-1 text-xs text-muted-foreground">{errorMessage(error)}</p></div>
    </div>
  );
}
/** Renders children only once data has loaded, so a failed request never looks like an empty list. */
export function DataGate({ isLoading, error, children }: { isLoading: boolean; error: unknown; children: ReactNode }) {
  if (error) return <ErrorState error={error} />;
  if (isLoading) return <LoadingState />;
  return <>{children}</>;
}
export function FieldError({ message }: { message?: string | undefined }) {
  return message ? <p className="mt-1 text-[11px] font-medium text-destructive">{message}</p> : null;
}

const stockTone: Record<InventoryStatus, string> = { in_stock: "status-success", low_stock: "status-warning", out_of_stock: "status-danger" };
export function StockStatusBadge({ status }: { status: InventoryStatus }) {
  return <span className={`status whitespace-nowrap ${stockTone[status]}`}>{inventoryStatusLabel[status]}</span>;
}
const requestTone: Record<RequestDisplayStatus, string> = { pending: "status-warning", approved: "status-brand", partially_fulfilled: "status-violet", fulfilled: "status-success", rejected: "status-danger", awaiting_ack: "status-warning", acknowledged: "status-success" };
/** Pass `request` to show the acknowledgement state on fulfilled requests. */
export function RequestStatusBadge({ status, request }: { status?: StockRequestStatus; request?: StockRequest }) {
  const s: RequestDisplayStatus = request ? getRequestDisplayStatus(request) : status ?? "pending";
  return <span className={`status whitespace-nowrap ${requestTone[s]}`}>{requestDisplayLabel[s]}</span>;
}
export function SearchBox({ value, onChange, placeholder, className = "sm:w-60" }: { value: string; onChange: (v: string) => void; placeholder: string; className?: string }) {
  return (
    <label className={`flex h-9 items-center gap-2 rounded-md border border-input bg-card px-3 transition-colors focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/20 ${className}`}>
      <Search className="size-4 shrink-0 text-muted-foreground" /><input value={value} onChange={(e) => onChange(e.target.value)} className="w-full bg-transparent text-[13px] outline-none placeholder:text-muted-foreground" placeholder={placeholder} aria-label={placeholder} />
    </label>
  );
}
export function DetailItem({ label, children }: { label: string; children: ReactNode }) {
  return <div className="min-w-0"><p className="text-xs text-muted-foreground">{label}</p><div className="mt-1 truncate text-sm font-medium">{children}</div></div>;
}
/** Compact summary tile for dense overview rows. */
export function StatTile({ label, value, detail, tone = "brand" }: { label: string; value: string; detail?: string | undefined; tone?: "success" | "brand" | "violet" | "warning" | "danger" }) {
  return (
    <article className="min-w-0 rounded-xl border border-border bg-card px-4 py-3 shadow-panel">
      <div className="flex items-center gap-2"><span className={`size-2 shrink-0 rounded-full ${tone === "success" ? "bg-success" : tone === "warning" ? "bg-warning" : tone === "danger" ? "bg-destructive" : tone === "violet" ? "bg-violet" : "bg-primary"}`} /><p className="truncate text-[11px] text-muted-foreground">{label}</p></div>
      <p className="mt-1 truncate text-base font-semibold tracking-tight tabular-nums sm:text-lg">{value}</p>
      {detail && <p className="truncate text-[10px] text-muted-foreground">{detail}</p>}
    </article>
  );
}

/**
 * Round profile image: the member's onboarding photo when available,
 * otherwise their initials.
 */
export function UserAvatar({ name, src, size = "md", className = "" }: { name: string; src?: string | null | undefined; size?: "sm" | "md" | "lg" | "xl"; className?: string }) {
  const box = { sm: "size-7 text-[10px]", md: "size-9 text-xs", lg: "size-14 text-base", xl: "size-20 text-xl" }[size];
  const letters = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";
  return src
    ? <img src={src} alt={name} loading="lazy" className={`${box} shrink-0 rounded-full border border-border object-cover ${className}`} />
    : <span aria-hidden className={`${box} grid shrink-0 place-items-center rounded-full bg-avatar font-semibold text-primary ${className}`}>{letters}</span>;
}
