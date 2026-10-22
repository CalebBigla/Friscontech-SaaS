import { CalendarClock } from "lucide-react";

import { EmptyState, Panel } from "@/components/shared";
import type { Db } from "@/data/mock-db";
import { daysToExpiry, expiryTier, expiryTierLabel, getExpirySummary, nearestExpiry } from "@/lib/expiry-calculations";
import { formatDate, formatNumber } from "@/lib/format";

const tierTone = { expired: "status-danger", "1m": "status-danger", "3m": "status-warning", "6m": "status-brand" } as const;

export function ExpiryBadge({ db, expiryDate }: { db: Db; expiryDate: string | null | undefined }) {
  if (!expiryDate) return <span className="text-[11px] text-muted-foreground">—</span>;
  const tier = expiryTier(db, expiryDate);
  const days = daysToExpiry(db, expiryDate);
  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <span className="text-[11px]">{formatDate(expiryDate)}</span>
      {tier ? <span className={`status whitespace-nowrap ${tierTone[tier]}`}>{tier === "expired" ? "Expired" : `${expiryTierLabel[tier]} · ${days}d`}</span> : <span className="status status-success">OK</span>}
    </span>
  );
}

/** Nearest live batch expiry for a product (optionally in one branch). */
export function NearestExpiryBadge({ db, productId, branchIds, branchId }: { db: Db; productId: string; branchIds: string[] | null; branchId?: string }) {
  return <ExpiryBadge db={db} expiryDate={nearestExpiry(db, productId, branchIds, branchId)?.expiryDate} />;
}

export function ExpiringSoonPanel({ db, branchIds, className = "mt-4" }: { db: Db; branchIds: string[] | null; className?: string }) {
  const s = getExpirySummary(db, branchIds);
  const tiles = [
    { label: "Expired", value: s.expired, tone: "text-destructive" },
    { label: "≤ 1 month", value: s.oneMonth, tone: "text-destructive" },
    { label: "≤ 3 months", value: s.threeMonths, tone: "text-warning" },
    { label: `≤ ${db.tenant.expiryAlertMonths} months`, value: s.sixMonths, tone: "text-primary" },
  ];
  return (
    <Panel title="Expiring soon" subtitle={`Batches expiring within ${db.tenant.expiryAlertMonths} months, or already expired`} className={className} action={<CalendarClock className="size-4 text-muted-foreground" />}>
      <div className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-4">
        {tiles.map((t, index) => (
          <div key={index} className="rounded-md border border-border p-3"><p className="text-[11px] text-muted-foreground">{t.label}</p><p className={`mt-1 text-lg font-bold ${t.tone}`}>{formatNumber(t.value)}</p></div>
        ))}
      </div>
      {s.alerts.length ? (
        <ul className="divide-y divide-border border-t border-border">
          {s.alerts.slice(0, 6).map((a) => (
            <li key={a.batch.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-xs">
              <div className="min-w-0"><p className="truncate font-bold">{a.productName}</p><p className="truncate text-[11px] text-muted-foreground">{a.branchName} · batch {a.batch.batchNumber} · {formatNumber(a.batch.quantityRemaining)} left</p></div>
              <ExpiryBadge db={db} expiryDate={a.batch.expiryDate} />
            </li>
          ))}
        </ul>
      ) : <EmptyState title="Nothing expiring soon" detail="No batches fall inside the alert window." />}
    </Panel>
  );
}
