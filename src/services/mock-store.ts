/**
 * MIGRATION IN PROGRESS: Mock store being phased out
 * 
 * This file is kept temporarily for backward compatibility during Phase E migration.
 * Seed data generation is DISABLED - database is now empty.
 * Components should use Supabase hooks instead of useDb().
 * 
 * TODO: Remove this file entirely after all components migrated to Supabase hooks.
 */
import { useSyncExternalStore } from "react";
import { createSeedDb, type Db } from "@/data/mock-db";

// MIGRATION: Seed data disabled - return empty database structure
let db: Db = createSeedDb(); // TODO: Replace with empty DB structure
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
