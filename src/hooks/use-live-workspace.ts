import { useMemo } from "react";
import { useAuth } from "@/contexts/auth-context";
import type { Db, Tenant } from "@/data/mock-db";
import { useApprovalRequests } from "@/hooks/use-approvals";
import { AUDIT_LOG_LIMIT, useAuditLogs } from "@/hooks/use-audit-logs";
import { useBranches } from "@/hooks/use-branches";
import { useAllCustomerPayments } from "@/hooks/use-customer-payments";
import { useCustomers } from "@/hooks/use-customers";
import { useExpenses } from "@/hooks/use-expenses";
import { useAllInventoryMovements, useAllStockBatches, useInventory } from "@/hooks/use-inventory";
import { useNotifications } from "@/hooks/use-notifications";
import { useOnboardings } from "@/hooks/use-onboardings";
import { usePayments } from "@/hooks/use-payments";
import { usePreferences } from "@/hooks/use-preferences";
import { useProducts } from "@/hooks/use-products";
import { useManagerRemittances, useOwnerRemittances } from "@/hooks/use-remittances";
import { useSales } from "@/hooks/use-sales";
import { useStockRequests } from "@/hooks/use-stock-requests";
import { useTargets } from "@/hooks/use-targets";
import { useTenant } from "@/hooks/use-tenant";
import { useUsers } from "@/hooks/use-users";
import { todayInTimezone } from "@/lib/type-adapters";

/** Heavy datasets are loaded only by the screens that list them. */
export type WorkspaceOptions = {
  movements?: boolean;
  batches?: boolean;
  activities?: boolean;
};

/** Column defaults from 20260114120000_create_initial_schema.sql. */
const TENANT_DEFAULT_TIMEZONE = "Africa/Lagos";
const TENANT_DEFAULT_EXPIRY_ALERT_MONTHS = 6;

/**
 * Calculation-friendly snapshot built only from Supabase queries.
 *
 * Every field is read from its table. `isLoading` stays true until every enabled
 * query has resolved, and `error` carries the first failure, so a screen can show
 * a real error instead of an empty list.
 */
export function useLiveWorkspace(options: WorkspaceOptions = {}) {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const userId = user?.id ?? "";

  const tenant = useTenant();
  const branches = useBranches();
  const users = useUsers();
  const products = useProducts();
  const sales = useSales();
  const inventory = useInventory();
  const targets = useTargets(tenantId);
  const customers = useCustomers();
  const customerPayments = useAllCustomerPayments();
  const stockRequests = useStockRequests();
  const payments = usePayments();
  const approvals = useApprovalRequests(tenantId);
  const expenses = useExpenses();
  const remittances = useManagerRemittances(tenantId);
  const ownerRemittances = useOwnerRemittances(tenantId);
  const notifications = useNotifications(userId);
  const onboardings = useOnboardings(tenantId);
  const preferences = usePreferences();
  const movements = useAllInventoryMovements(!!options.movements);
  const batches = useAllStockBatches(!!options.batches);
  const activities = useAuditLogs(tenantId, { limit: AUDIT_LOG_LIMIT }, !!options.activities);

  const db = useMemo<Db>(() => ({
    tenant: tenant.data ?? hiddenTenant(tenantId),
    branches: branches.data ?? [],
    users: users.data ?? [],
    products: products.data ?? [],
    sales: sales.data ?? [],
    inventory: inventory.data ?? [],
    inventoryMovements: movements.data ?? [],
    stockBatches: batches.data ?? [],
    targets: targets.data ?? [],
    customers: customers.data ?? [],
    customerPayments: customerPayments.data ?? [],
    stockRequests: stockRequests.data ?? [],
    payments: payments.data ?? [],
    approvals: approvals.data ?? [],
    expenses: expenses.data ?? [],
    remittances: remittances.data ?? [],
    ownerRemittances: ownerRemittances.data ?? [],
    notifications: notifications.data ?? [],
    onboardings: onboardings.data ?? [],
    preferences: preferences.data ? [preferences.data] : [],
    activities: activities.data ?? [],
  }), [
    tenantId, tenant.data, branches.data, users.data, products.data, sales.data,
    inventory.data, movements.data, batches.data, targets.data, customers.data,
    customerPayments.data, stockRequests.data, payments.data, approvals.data,
    expenses.data, remittances.data, ownerRemittances.data, notifications.data,
    onboardings.data, preferences.data, activities.data,
  ]);

  const queries = [
    tenant, branches, users, products, sales, inventory, targets, customers,
    customerPayments, stockRequests, payments, approvals, expenses, remittances,
    ownerRemittances, notifications, onboardings, preferences, movements, batches,
    activities,
  ];
  const failed = queries.findIndex((query) => query.error);
  return {
    db,
    isLoading: queries.some((query) => query.isLoading),
    error: failed < 0 ? null : new WorkspaceLoadError(QUERY_LABELS[failed]!, queries[failed]!.error),
    /** False when RLS hides the tenant row (only owners and managers may read it). */
    tenantVisible: tenant.data != null,
  };
}

/** Names for the queries above, in the same order, for error messages. */
const QUERY_LABELS = [
  "business profile", "branches", "team members", "products", "sales", "inventory", "targets", "customers",
  "customer payments", "stock requests", "payments", "approvals", "expenses", "manager remittances",
  "owner remittances", "notifications", "onboardings", "preferences", "stock movements", "stock batches",
  "audit log",
];

/** A workspace query failed; the message names which data could not load. */
export class WorkspaceLoadError extends Error {
  constructor(readonly source: string, readonly failure: unknown) {
    const detail = failure instanceof Error && failure.message ? failure.message : "The database request failed.";
    super(`Couldn't load ${source}: ${detail}`);
    this.name = "WorkspaceLoadError";
  }
}

/**
 * The tenant row is readable only by owners and managers. For other roles the
 * business profile stays blank; dates and the expiry window use the column defaults.
 */
function hiddenTenant(tenantId: string): Tenant {
  return {
    id: tenantId,
    name: "",
    currency: "NGN",
    referenceDate: todayInTimezone(TENANT_DEFAULT_TIMEZONE),
    lastSyncTime: "",
    legalName: "",
    businessEmail: "",
    phone: "",
    timezone: TENANT_DEFAULT_TIMEZONE,
    plan: "",
    expiryAlertMonths: TENANT_DEFAULT_EXPIRY_ALERT_MONTHS,
    maxRepDiscountPercent: null,
    createdAt: "",
    updatedAt: "",
  };
}
