/**
 * In-memory store standing in for the future API/PostgreSQL layer.
 * Components read through useDb(); writes go through the services in ./services.ts,
 * so swapping mock services for API services later touches only that file.
 */
import { useSyncExternalStore } from "react";
import { createSeedDb, type Db } from "@/data/mock-db";

let db: Db = createSeedDb();
const listeners = new Set<() => void>();

export function getDb() { return db; }
export function setDb(update: (current: Db) => Db) {
  db = update(db);
  listeners.forEach((l) => l());
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export function useDb(): Db {
  return useSyncExternalStore(subscribe, getDb, getDb);
}
