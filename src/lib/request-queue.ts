/**
 * Request queue for database calls.
 *
 * A dashboard opens about twenty queries at once. Sent together they compete for
 * the browser's connections and the database's, and the slowest can time out.
 * The queue sends at most MAX_IN_FLIGHT at a time and holds the rest until a slot
 * frees up. Saves (anything that is not a read) go ahead of waiting reads, so a
 * user's save is never stuck behind a page of background loads.
 *
 * Sign-in and token refresh bypass the queue so a session is never kept waiting
 * behind data loads. A request whose caller gives up (its AbortSignal fires) while
 * still waiting leaves the queue without being sent.
 */

export const MAX_IN_FLIGHT = 6;

type Waiting = {
  start: () => void;
  signal?: AbortSignal | null;
  onAbort?: () => void;
};

const writes: Waiting[] = [];
const reads: Waiting[] = [];
let inFlight = 0;

function next() {
  while (inFlight < MAX_IN_FLIGHT) {
    const job = writes.shift() ?? reads.shift();
    if (!job) return;
    if (job.signal && job.onAbort) job.signal.removeEventListener("abort", job.onAbort);
    inFlight++;
    job.start();
  }
}

function abortError(signal: AbortSignal) {
  return signal.reason instanceof Error ? signal.reason : new DOMException("The request was aborted.", "AbortError");
}

function urlOf(input: RequestInfo | URL) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function bypassesQueue(url: string) {
  return url.includes("/auth/v1/");
}

/** A `fetch` that runs through the queue. Pass it to the Supabase client as `global.fetch`. */
export function queuedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (bypassesQueue(urlOf(input))) return fetch(input, init);

  const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  const isRead = method === "GET" || method === "HEAD";
  const signal = init?.signal ?? (input instanceof Request ? input.signal : null);
  if (signal?.aborted) return Promise.reject(abortError(signal));

  return new Promise<Response>((resolve, reject) => {
    const job: Waiting = {
      signal,
      start: () => {
        fetch(input, init)
          .then(resolve, reject)
          .finally(() => {
            inFlight--;
            next();
          });
      },
    };
    if (signal) {
      job.onAbort = () => {
        const lane = isRead ? reads : writes;
        const at = lane.indexOf(job);
        if (at >= 0) {
          lane.splice(at, 1);
          reject(abortError(signal));
        }
      };
      signal.addEventListener("abort", job.onAbort, { once: true });
    }
    (isRead ? reads : writes).push(job);
    next();
  });
}

/** For tests and diagnostics. */
export function queueState() {
  return { inFlight, waitingWrites: writes.length, waitingReads: reads.length };
}
