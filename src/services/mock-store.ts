/**
 * MIGRATION IN PROGRESS
 * 
 * This file now returns a minimal empty database structure.
 * ALL seed data generation is bypassed completely.
 * Components must use Supabase hooks (src/hooks/) for real data.
 * 
 * The empty tenant record exists only so that session.ts / getAccessScope()
 * doesn't crash while components are being migrated.
 * 
 * TODO: Remove this file entirely once all components use Supabase hooks.
 */
import { useSyncExternalStore } from "react";
import type { Db } from "@/data/mock-db";

/** Minimal tenant shell - no real data, just keeps getAccessScope() from crashing */
const emptyTenant: Db["tenant"] = {
  id: "",
  name: "",
  currency: "NGN",
  referenceDate: new Date().toISOString().slice(0, 10),
  lastSyncTime: "",
  legalName: "",
  businessEmail: "",
  phone: "",
  timezone: "Africa/Lagos",
  plan: "",
  expiryAlertMonths: 3,
  createdAt: "",
  updatedAt: "",
};

const emptyDb: Db = {
  tenant: emptyTenant,
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

let db: Db = { ...emptyDb };
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
