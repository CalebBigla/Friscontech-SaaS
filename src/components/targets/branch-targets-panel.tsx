import { Link } from "@tanstack/react-router";
import { Pencil, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState, Panel } from "@/components/shared";
import { TargetProgressBar, TargetStatusBadge } from "@/components/targets/target-shared";
import type { Db, Target } from "@/data/mock-db";
import { findBranchTarget, getTargetProgress } from "@/lib/catalog-calculations";
import type { AccessScope } from "@/lib/session";
import { formatCompactNaira, formatMonth, formatNaira } from "@/lib/format";

/**
 * Every active branch in scope with its monthly target and live progress from
 * the branch's completed sales. Branches without a target offer Set target.
 */
export function BranchTargetsPanel({ db, scope, month, onSet, onEdit, className }: {
  db: Db; scope: AccessScope; month: string;
  onSet: (branchId: string) => void; onEdit: (target: Target) => void; className?: string;
}) {
  const rows = db.branches
    .filter((b) => b.status === "active" && (!scope.branchIds || scope.branchIds.includes(b.id)))
    .map((branch) => {
      const target = findBranchTarget(db, branch.id, month);
      return { branch, target, p: target ? getTargetProgress(db, target) : null };
    })
    .sort((a, b) => (b.p?.achievement ?? -1) - (a.p?.achievement ?? -1) || a.branch.name.localeCompare(b.branch.name));
  const canEdit = scope.canManageTargets;
  const withTarget = rows.filter((r) => r.p).length;

  return (
    <Panel {...(className ? { className } : {})} title={`Branch targets · ${formatMonth(month)}`}
      {...(rows.length ? { subtitle: `${withTarget} of ${rows.length} branches have a target · progress from completed sales` } : {})}>
      {!rows.length ? <EmptyState title="No active branches." /> : (
        <div className="divide-y divide-border">
          {rows.map(({ branch, target, p }) => (
            <div key={branch.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:gap-5">
              <div className="min-w-0 sm:w-44">
                {target
                  ? <Link to="/targets/$targetId" params={{ targetId: target.id }} className="truncate text-sm font-bold hover:text-primary">{branch.name}</Link>
                  : <p className="truncate text-sm font-bold">{branch.name}</p>}
                <p className="text-[11px] text-muted-foreground">
                  {p ? <><span className="font-semibold text-foreground">{formatCompactNaira(p.achieved)}</span> of {formatCompactNaira(p.amount)}</> : "No target set"}
                </p>
              </div>
              {p ? (
                <>
                  <div className="min-w-0 flex-1"><TargetProgressBar p={p} /></div>
                  <div className="flex items-center justify-between gap-3 sm:justify-end">
                    <span className="text-[11px] text-muted-foreground sm:w-32 sm:text-right">{p.remaining > 0 ? `${formatNaira(p.remaining)} to go` : "Target reached"}</span>
                    <TargetStatusBadge status={p.status} />
                    {canEdit && target && <Button variant="ghost" size="icon" className="size-8" aria-label={`Edit ${branch.name} target`} onClick={() => onEdit(target)}><Pencil className="size-4" /></Button>}
                  </div>
                </>
              ) : (
                <div className="flex flex-1 items-center justify-between gap-3 sm:justify-end">
                  <div className="hidden h-1.5 flex-1 rounded-full bg-muted sm:block" aria-hidden />
                  {canEdit && <Button variant="outline" size="sm" onClick={() => onSet(branch.id)}><Plus className="size-4" />Set target</Button>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
