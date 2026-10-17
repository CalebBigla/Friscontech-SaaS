/**
 * MIGRATION IN PROGRESS: Mock store being phased out
 * 
 * This file is kept temporarily for backward compatibility during Phase E migration.
 * Seed data generation is DISABLED - database returns empty arrays.
 * Components should use Supabase hooks instead of useDb().
 * 
 * TODO: Remove this file entirely after all components migrated to Supabase hooks.
 */
import { useSyncExternalStore } from "react";
import { createSeedDb, type Db } from "@/data/mock-db";

// MIGRATION: Override seed function to return empty database
function createEmptyDb(): Db {
  const seedDb = createSeedDb();
  return {
    ...seedDb,
    // Clear all data arrays - keep only structure
    branches: [],
    users: [],
    products: [],
    sales: [],
    inventory: [],
    inventoryMovements: [],
    stockBatches: [],
    customers: [],
    customerPayments: [],
    payments: [],
    expenses: [],
    remittances: [],
    ownerRemittances: [],
    stockRequests: [],
    targets: [],
    activities: [],
    notifications: [],
    onboardings: [],
    approvals: [],
    escalations: [],
    preferences: [],
  };
}

let db: Db = createEmptyDb(); // MIGRATION: Returns empty DB
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
