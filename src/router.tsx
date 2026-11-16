import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { isRetryable } from "@/lib/supabase-helpers";

export const getRouter = () => {
  // Cached data is served without asking the database again for 30 seconds; after
  // that it is refreshed in the background the next time a screen needs it. Every
  // save invalidates the data it changes, so the person who saved sees it at once.
  // Unused data is dropped from memory after 10 minutes.
  // Live updates: what is on screen refreshes every 45 seconds while the tab is open,
  // and when the tab comes back into view or the connection returns. New
  // notifications reload everything at once (useLiveUpdates in the app shell).
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 10 * 60_000,
        refetchInterval: 45_000,
        refetchIntervalInBackground: false,
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
        // Up to two retries, and only for failures a retry can fix (see isRetryable).
        retry: (failureCount, error) => failureCount < 2 && isRetryable(error),
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
