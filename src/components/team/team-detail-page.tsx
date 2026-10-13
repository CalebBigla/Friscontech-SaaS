import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Pencil, Power, Trash2 } from "lucide-react";

import { AppShell, RestrictedNotice } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { DetailItem, MetricCard, Panel } from "@/components/shared";
import {
  MemberStatusBadge,
  MemberStatusDialog,
  RoleBadge,
  TeamMemberDialog,
} from "@/components/team/team-dialogs";
import { TargetProgressBar, TargetStatusBadge } from "@/components/targets/target-shared";
import {
  CircleDollarSign,
  ClipboardCheck,
  PackagePlus,
  Target as TargetIcon,
  Users,
} from "lucide-react";
import { useDb } from "@/services/mock-store";
import { getAccessScope, useCurrentUserId } from "@/lib/session";
import { filterSales, monthRange, saleTotal, getSalesRevenue } from "@/lib/calculations";
import {
  formatDate,
  formatDayTime,
  formatMonth,
  formatNaira,
  formatNumber,
  initials,
  roleLabel,
} from "@/lib/format";
import {
  canEditMember,
  getLastActivity,
  getManagerTeam,
  getRepPerformance,
  getStorekeeperActivity,
  getTeamMember,
} from "@/lib/team";

export function TeamDetailPage({ userId: memberId }: { userId: string }) {
  const db = useDb();
  const userId = useCurrentUserId();
  const scope = getAccessScope(db, userId);
  const [editing, setEditing] = useState(false);
  const [toggling, setToggling] = useState(false);
  const u = getTeamMember(db, scope, memberId);
  if (!u)
    return (
      <AppShell title="Team member">
        <RestrictedNotice message="This team member doesn't exist or isn't part of your team." />
      </AppShell>
    );

  const today = db.tenant.referenceDate;
  const month = today.slice(0, 7);
  const range = monthRange(month, today);
  const branch = db.branches.find((b) => b.id === u.branchId);
  const reportsTo = db.users.find((x) => x.id === u.managerId);
  const last = getLastActivity(db, u.id);
  const editable = canEditMember(scope, u);

  return (
    <AppShell
      title={u.name}
      subtitle={`${roleLabel[u.role]} · ${branch?.name ?? "Unassigned"}`}
      actions={
        editable ? (
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className={scope.user.role === "owner" && u.status !== "inactive" ? "border-destructive/40 text-destructive" : undefined}
              onClick={() => setToggling(true)}
            >
              {scope.user.role === "owner" && u.status !== "inactive" ? <Trash2 className="size-4" /> : <Power className="size-4" />}
              <span className="hidden sm:inline">
                {u.status === "inactive" ? "Activate" : scope.user.role === "owner" ? "Delete" : "Deactivate"}
              </span>
            </Button>
            <Button size="sm" onClick={() => setEditing(true)}>
              <Pencil className="size-4" />
              <span className="hidden sm:inline">Edit</span>
            </Button>
          </div>
        ) : undefined
      }
    >
      <Link
        to="/team"
        className="mb-4 inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        Back to Team
      </Link>
      <Panel title="Profile" className="mb-5">
        <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center">
          <span className="grid size-14 shrink-0 place-items-center rounded-full bg-avatar text-base font-bold text-primary">
            {initials(u.name)}
          </span>
          <div className="grid flex-1 grid-cols-2 gap-4 lg:grid-cols-4">
            <DetailItem label="Email">{u.email}</DetailItem>
            <DetailItem label="Role">
              <RoleBadge role={u.role} />
            </DetailItem>
            <DetailItem label="Branch">
              {branch ? (
                <Link
                  to="/branches/$branchId"
                  params={{ branchId: branch.id }}
                  className="hover:text-primary"
                >
                  {branch.name}
                </Link>
              ) : (
                "Unassigned"
              )}
            </DetailItem>
            <DetailItem label="Account status">
              <MemberStatusBadge status={u.status} />
            </DetailItem>
            <DetailItem label="Joined">{formatDate(u.createdAt.slice(0, 10))}</DetailItem>
            <DetailItem label="Last activity">
              {last ? formatDayTime(last, today) : "No activity yet"}
            </DetailItem>
            {reportsTo && <DetailItem label="Reports to">{reportsTo.name}</DetailItem>}
          </div>
        </div>
      </Panel>
      {u.role === "sales_rep" && (
        <RepSection
          repId={u.id}
          month={month}
          range={range}
          managerView={scope.user.role === "manager"}
        />
      )}
      {u.role === "storekeeper" && <StorekeeperSection userId={u.id} />}
      {u.role === "manager" && <ManagerSection managerId={u.id} month={month} range={range} />}
      <TeamMemberDialog open={editing} onOpenChange={setEditing} scope={scope} member={u} />
      <MemberStatusDialog
        member={toggling ? u : null}
        onClose={() => setToggling(false)}
        actorId={userId}
      />
    </AppShell>
  );
}

function RepSection({
  repId,
  month,
  range,
  managerView,
}: {
  repId: string;
  month: string;
  range: { from: string; to: string };
  managerView: boolean;
}) {
  const db = useDb();
  if (managerView) {
    const sales = filterSales(db, { repId, range });
    const revenue = sales.reduce((sum, sale) => sum + saleTotal(sale), 0);
    return (
      <Panel
        title={`Sales activity · ${formatMonth(month)}`}
        subtitle="Completed sales recorded by this representative"
      >
        <div className="grid grid-cols-2 gap-3 p-5">
          <MetricCard
            icon={CircleDollarSign}
            tone="success"
            label="Monthly sales"
            value={formatNaira(revenue)}
            detail={`${formatNumber(sales.length)} sales`}
          />
        </div>
      </Panel>
    );
  }
  const p = getRepPerformance(db, repId, month, range);
  return (
    <Panel
      title={`Performance · ${formatMonth(month)}`}
      subtitle="Achievement is calculated from recorded sales"
      action={
        p.target ? (
          <Button variant="outline" size="sm" asChild>
            <Link to="/targets/$targetId" params={{ targetId: p.target.id }}>
              View target
            </Link>
          </Button>
        ) : undefined
      }
    >
      <div className="grid grid-cols-2 gap-3 p-5 xl:grid-cols-3">
        <MetricCard
          icon={TargetIcon}
          tone="brand"
          label="Monthly target"
          value={p.progress ? formatNaira(p.progress.amount) : "Not set"}
        />
        <MetricCard
          icon={CircleDollarSign}
          tone="success"
          label="Monthly sales"
          value={formatNaira(p.revenue)}
          detail={`${formatNumber(p.salesCount)} sales`}
        />
        <div className="col-span-2 rounded-lg border border-border bg-card p-4 shadow-panel xl:col-span-1">
          <p className="text-xs text-muted-foreground">Target progress</p>
          {p.progress ? (
            <>
              <div className="mt-3">
                <TargetProgressBar p={p.progress} />
              </div>
              <div className="mt-3">
                <TargetStatusBadge status={p.progress.status} />
              </div>
            </>
          ) : (
            <p className="mt-3 text-sm font-semibold">No target for this month</p>
          )}
        </div>
      </div>
    </Panel>
  );
}

function StorekeeperSection({ userId }: { userId: string }) {
  const db = useDb();
  const a = getStorekeeperActivity(db, userId);
  return (
    <Panel title="Stock activity" subtitle="From inventory movements and processed requests">
      <div className="grid grid-cols-2 gap-3 p-5 xl:grid-cols-3">
        <MetricCard
          icon={PackagePlus}
          tone="brand"
          label="Stock movements"
          value={formatNumber(a.movements)}
          detail={`${formatNumber(a.unitsAdded)} units added`}
        />
        <MetricCard
          icon={ClipboardCheck}
          tone="success"
          label="Requests processed"
          value={formatNumber(a.requestsProcessed)}
          detail={`${a.fulfilled} issued · ${a.rejected} rejected`}
        />
      </div>
    </Panel>
  );
}

function ManagerSection({
  managerId,
  month,
  range,
}: {
  managerId: string;
  month: string;
  range: { from: string; to: string };
}) {
  const db = useDb();
  const manager = db.users.find((x) => x.id === managerId)!;
  const team = getManagerTeam(db, manager);
  const revenue = team
    .filter((member) => member.role === "sales_rep")
    .reduce((sum, member) => sum + getSalesRevenue(db, { repId: member.id, range }), 0);
  return (
    <Panel title={`Team summary · ${formatMonth(month)}`}>
      <div className="grid grid-cols-2 gap-3 p-5 xl:grid-cols-3">
        <MetricCard
          icon={Users}
          tone="brand"
          label="Team size"
          value={String(team.length)}
          detail={`${team.filter((x) => x.role === "sales_rep").length} reps · ${team.filter((x) => x.role === "storekeeper").length} storekeepers`}
        />
        <MetricCard
          icon={CircleDollarSign}
          tone="success"
          label="Branch sales this month"
          value={formatNaira(revenue)}
        />
      </div>
    </Panel>
  );
}
