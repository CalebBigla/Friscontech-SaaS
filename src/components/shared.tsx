import type { ReactNode } from "react";
import { Search, type LucideIcon } from "lucide-react";
import type { StockRequest, StockRequestStatus } from "@/data/mock-db";
import { getRequestDisplayStatus, inventoryStatusLabel, requestDisplayLabel, type InventoryStatus, type RequestDisplayStatus } from "@/lib/inventory-calculations";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { PerformanceBand } from "@/lib/calculations";
import { bandLabel } from "@/lib/calculations";

export const ALL = "all";

export function MetricCard({ icon: Icon, tone, label, value, detail, badge }: { icon: LucideIcon; tone: "success" | "brand" | "violet" | "warning"; label: string; value: string; detail?: string | undefined; badge?: string | undefined }) {
  return (
    <article className="min-w-0 rounded-lg border border-border bg-card p-4 shadow-panel sm:p-5">
      <div className="flex items-start justify-between"><span className={`metric-icon metric-icon-${tone}`}><Icon className="size-5" /></span>{badge && <span className={`status status-${tone}`}>{badge}</span>}</div>
      <p className="mt-5 text-xs text-muted-foreground">{label}</p><p className="mt-1 truncate text-lg font-bold sm:text-2xl">{value}</p>{detail && <p className="mt-2 text-[11px] text-muted-foreground">{detail}</p>}
    </article>
  );
}

export function FilterSelect({ value, onChange, options, label, className = "w-full sm:w-44" }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; label: string; className?: string }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label} className={`h-9 bg-card text-xs ${className}`}><SelectValue /></SelectTrigger>
      <SelectContent>{options.map((o) => <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>)}</SelectContent>
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
    <section className={`rounded-lg border border-border bg-card shadow-panel ${className}`}>
      <div className="flex flex-col gap-3 border-b border-border p-5 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="panel-title">{title}</h2>{subtitle && <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>}</div>{action}</div>
      {children}
    </section>
  );
}
export function EmptyState({ title, detail }: { title: string; detail?: string }) {
  return <div className="p-10 text-center"><p className="text-sm font-bold">{title}</p>{detail && <p className="mt-1 text-xs text-muted-foreground">{detail}</p>}</div>;
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
    <label className={`flex h-9 items-center gap-2 rounded-md border border-border bg-muted px-3 ${className}`}>
      <Search className="size-4 text-muted-foreground" /><input value={value} onChange={(e) => onChange(e.target.value)} className="w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground" placeholder={placeholder} aria-label={placeholder} />
    </label>
  );
}
export function DetailItem({ label, children }: { label: string; children: ReactNode }) {
  return <div className="min-w-0"><p className="text-[11px] text-muted-foreground">{label}</p><div className="mt-1 truncate text-sm font-semibold">{children}</div></div>;
}
