import { Link } from "@tanstack/react-router";
import { Bell, CheckCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAuth } from "@/contexts/auth-context";
import { toast } from "sonner";
import { useMarkAllNotificationsRead, useMarkNotificationRead, useNotifications } from "@/hooks/use-notifications";
import { errorMessage } from "@/components/shared";
import type { AppNotification } from "@/data/mock-db";
import { formatDayTime } from "@/lib/format";

/** Where a notification leads; every target page re-checks the role itself. */
function target(n: AppNotification) {
  if (n.entityType === "stock_request")
    return { to: "/stock-requests/$requestId" as const, params: { requestId: n.entityId } };
  if (n.entityType === "onboarding") return { to: "/team" as const };
  return { to: "/payment" as const };
}

export function NotificationBell() {
  const { user } = useAuth();
  const userId = user?.id ?? "";
  const { data: mine = [], error } = useNotifications(userId);
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();
  const failed = (failure: unknown) => toast.error("Could not update notifications", { description: errorMessage(failure) });
  const sorted = [...mine].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const unread = sorted.filter((n) => !n.readAt).length;
  const referenceDate = new Date().toISOString().slice(0, 10);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
          className="relative"
        >
          <Bell className="size-4" />
          {unread > 0 && (
            <span className="absolute right-1 top-1 grid min-w-4 place-items-center rounded-full bg-destructive px-1 text-[9px] font-bold leading-4 text-destructive-foreground">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(22rem,calc(100vw-2rem))] p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <p className="text-sm font-bold">Notifications</p>
            <p className="text-[11px] text-muted-foreground">{unread} unread</p>
          </div>
          {unread > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs"
              onClick={() => markAllRead.mutate(userId, { onError: failed })}
            >
              <CheckCheck className="size-3.5" />
              Mark all read
            </Button>
          )}
        </div>
        {error ? (
          <div role="alert" className="px-4 py-10 text-center">
            <p className="text-sm font-semibold text-destructive">Could not load notifications</p>
            <p className="mt-1 text-xs text-muted-foreground">{errorMessage(error)}</p>
          </div>
        ) : sorted.length ? (
          <div className="max-h-96 divide-y divide-border overflow-y-auto">
            {sorted.slice(0, 30).map((n) => (
              <Link
                key={n.id}
                {...target(n)}
                onClick={() => { if (!n.readAt) markRead.mutate(n.id, { onError: failed }); }}
                className={`flex min-h-14 gap-3 px-4 py-3 hover:bg-muted/40 ${n.readAt ? "" : "bg-primary/5"}`}
              >
                <span
                  className={`mt-1.5 size-2 shrink-0 rounded-full ${n.readAt ? "bg-transparent" : "bg-primary"}`}
                />
                <span className="min-w-0">
                  <span className="block text-xs font-semibold leading-snug">{n.message}</span>
                  <span className="mt-1 block text-[10px] text-muted-foreground">
                    {formatDayTime(n.createdAt, referenceDate)}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="px-4 py-10 text-center">
            <p className="text-sm font-semibold">You're all caught up</p>
            <p className="mt-1 text-xs text-muted-foreground">New approvals and updates show here.</p>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
