import { useEffect, useState } from "react";

/**
 * A key for one form submission. It stays the same while the form is open, so
 * retrying a submit (after a timeout or a lost response) cannot apply twice;
 * reopening the form starts a new key.
 */
export function useIdempotencyKey(open: boolean): string {
  const [key, setKey] = useState(() => globalThis.crypto.randomUUID());
  useEffect(() => {
    if (open) setKey(globalThis.crypto.randomUUID());
  }, [open]);
  return key;
}
