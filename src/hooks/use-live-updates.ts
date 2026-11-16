/**
 * Keeps every screen current without a manual refresh.
 *
 * Each person's notifications are checked every 15 seconds (a small query). When a
 * new one arrives (an order raised or fulfilled, a payment, an approval...),
 * everything on screen is reloaded at once, so the change the notification is about
 * shows up straight away. Everything else refreshes every 45 seconds while the tab
 * is open (see router.tsx), and on returning to the tab or reconnecting.
 */
import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth-context";
import { useNotifications } from "@/hooks/use-notifications";

export const NOTIFICATION_CHECK_MS = 15_000;

export function useLiveUpdates() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data } = useNotifications(user?.id ?? "", {}, NOTIFICATION_CHECK_MS);
  const newest = data?.reduce<string>((latest, n) => (n.createdAt > latest ? n.createdAt : latest), "") ?? null;
  const seen = useRef<string | null>(null);

  useEffect(() => {
    if (newest === null) return;
    // The first load only sets the starting point; later arrivals trigger a reload.
    if (seen.current !== null && newest > seen.current) {
      void queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] !== "notifications" });
    }
    seen.current = newest;
  }, [newest, queryClient]);
}
