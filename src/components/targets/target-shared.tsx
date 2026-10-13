import type { TargetProgress, TargetStatus } from "@/lib/catalog-calculations";
import { progressLabel, targetStatusLabel } from "@/lib/catalog-calculations";

const tone: Record<TargetStatus, string> = { not_started: "status-warning", behind: "status-danger", on_track: "status-brand", met: "status-success", exceeded: "status-violet" };
export function TargetStatusBadge({ status }: { status: TargetStatus }) {
  return <span className={`status whitespace-nowrap ${tone[status]}`}>{targetStatusLabel[status]}</span>;
}
const barTone: Record<TargetStatus, string> = { not_started: "bg-muted-foreground", behind: "bg-destructive", on_track: "bg-primary", met: "bg-success", exceeded: "bg-success" };
export function TargetProgressBar({ p }: { p: TargetProgress }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-full min-w-16 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full ${barTone[p.status]}`} style={{ width: `${p.progress}%` }} /></div>
      <span className="w-11 shrink-0 text-right text-[11px] font-semibold">{progressLabel(p)}</span>
    </div>
  );
}
