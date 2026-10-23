/**
 * React Query Key Factory
 *
 * Centralized query key management for consistent caching and invalidation.
 * Every hook must use these keys — never construct keys inline.
 */

export const queryKeys = {
  // Tenant (business profile)
  tenant: {
    detail: (tenantId: string) => ["tenant", tenantId] as const,
  },

  // Branches
  branches: {
    all: (tenantId: string) => ["branches", tenantId] as const,
    list: (tenantId: string, filters?: object) =>
      ["branches", tenantId, "list", filters] as const,
    detail: (id: string) => ["branches", "detail", id] as const,
  },

  // Products
  products: {
    all: (tenantId: string) => ["products", tenantId] as const,
    list: (tenantId: string, filters?: object) =>
      ["products", tenantId, "list", filters] as const,
    detail: (id: string) => ["products", "detail", id] as const,
    active: (tenantId: string) => ["products", tenantId, "active"] as const,
  },

  // Users / Team
  users: {
    all: (tenantId: string) => ["users", tenantId] as const,
    list: (tenantId: string, filters?: object) =>
      ["users", tenantId, "list", filters] as const,
    detail: (id: string) => ["users", "detail", id] as const,
    byBranch: (branchId: string) => ["users", "branch", branchId] as const,
    byRole: (tenantId: string, role: string) =>
      ["users", tenantId, "role", role] as const,
  },

  // Preferences
  preferences: {
    byUser: (userId: string) => ["preferences", userId] as const,
  },

  // Inventory records, movements, batches
  inventory: {
    /** Prefix of every inventory query (lists, details, movements, lots). */
    root: () => ["inventory"] as const,
    all: (tenantId: string) => ["inventory", tenantId] as const,
    list: (tenantId: string, filters?: object) =>
      ["inventory", tenantId, "list", filters] as const,
    byBranch: (branchId: string) => ["inventory", "branch", branchId] as const,
    detail: (id: string) => ["inventory", "detail", id] as const,
    movements: (inventoryId: string) =>
      ["inventory", inventoryId, "movements"] as const,
    allMovements: (tenantId: string) =>
      ["inventory", tenantId, "movements", "all"] as const,
    batches: (productId: string, branchId: string) =>
      ["inventory", "batches", productId, branchId] as const,
    allBatches: (tenantId: string) =>
      ["inventory", tenantId, "batches", "all"] as const,
  },

  // Sales
  sales: {
    all: (tenantId: string) => ["sales", tenantId] as const,
    list: (tenantId: string, filters?: object) =>
      ["sales", tenantId, "list", filters] as const,
    byBranch: (branchId: string) => ["sales", "branch", branchId] as const,
    byRep: (repId: string) => ["sales", "rep", repId] as const,
    byPeriod: (start: string, end: string) =>
      ["sales", "period", start, end] as const,
    detail: (id: string) => ["sales", "detail", id] as const,
  },

  // Customers
  customers: {
    all: (tenantId: string) => ["customers", tenantId] as const,
    list: (tenantId: string, filters?: object) =>
      ["customers", tenantId, "list", filters] as const,
    byBranch: (branchId: string) =>
      ["customers", "branch", branchId] as const,
    detail: (id: string) => ["customers", "detail", id] as const,
    payments: (customerId: string) =>
      ["customers", customerId, "payments"] as const,
  },

  // Customer payments
  customerPayments: {
    all: (tenantId: string) => ["customerPayments", tenantId] as const,
    byCustomer: (customerId: string) =>
      ["customerPayments", "customer", customerId] as const,
    detail: (id: string) => ["customerPayments", "detail", id] as const,
    pending: (tenantId: string) =>
      ["customerPayments", tenantId, "pending"] as const,
  },

  // Rep payments
  payments: {
    all: (tenantId: string) => ["payments", tenantId] as const,
    list: (tenantId: string, filters?: object) =>
      ["payments", tenantId, "list", filters] as const,
    byRep: (repId: string) => ["payments", "rep", repId] as const,
    byPeriod: (period: string) => ["payments", "period", period] as const,
    pending: (tenantId: string) => ["payments", tenantId, "pending"] as const,
    detail: (id: string) => ["payments", "detail", id] as const,
  },

  // Expenses
  expenses: {
    all: (tenantId: string) => ["expenses", tenantId] as const,
    list: (tenantId: string, filters?: object) =>
      ["expenses", tenantId, "list", filters] as const,
    byBranch: (branchId: string) => ["expenses", "branch", branchId] as const,
    byManager: (managerId: string) =>
      ["expenses", "manager", managerId] as const,
    detail: (id: string) => ["expenses", "detail", id] as const,
  },

  // Stock Requests
  stockRequests: {
    /** Prefix of every stock request query (lists, details, per branch/rep). */
    root: () => ["stockRequests"] as const,
    all: (tenantId: string) => ["stockRequests", tenantId] as const,
    list: (tenantId: string, filters?: object) =>
      ["stockRequests", tenantId, "list", filters] as const,
    byBranch: (branchId: string) =>
      ["stockRequests", "branch", branchId] as const,
    byRequester: (requesterId: string) =>
      ["stockRequests", "requester", requesterId] as const,
    detail: (id: string) => ["stockRequests", "detail", id] as const,
    pending: (tenantId: string) =>
      ["stockRequests", tenantId, "pending"] as const,
  },

  // Targets
  targets: {
    all: (tenantId: string) => ["targets", tenantId] as const,
    list: (tenantId: string, filters?: object) =>
      ["targets", tenantId, "list", filters] as const,
    byMonth: (month: string) => ["targets", "month", month] as const,
    byUser: (userId: string, month?: string) =>
      month
        ? (["targets", "user", userId, month] as const)
        : (["targets", "user", userId] as const),
    byBranch: (branchId: string, month?: string) =>
      month
        ? (["targets", "branch", branchId, month] as const)
        : (["targets", "branch", branchId] as const),
    detail: (id: string) => ["targets", "detail", id] as const,
  },

  // Remittances (manager and owner)
  remittances: {
    manager: {
      all: (tenantId: string) =>
        ["remittances", "manager", tenantId] as const,
      list: (tenantId: string, filters?: object) =>
        ["remittances", "manager", tenantId, "list", filters] as const,
      byBranch: (branchId: string) =>
        ["remittances", "manager", "branch", branchId] as const,
      detail: (id: string) =>
        ["remittances", "manager", "detail", id] as const,
    },
    owner: {
      all: (tenantId: string) => ["remittances", "owner", tenantId] as const,
      list: (tenantId: string, filters?: object) =>
        ["remittances", "owner", tenantId, "list", filters] as const,
      detail: (id: string) => ["remittances", "owner", "detail", id] as const,
    },
  },

  // Approvals
  approvals: {
    all: (tenantId: string) => ["approvals", tenantId] as const,
    list: (tenantId: string, filters?: object) =>
      ["approvals", tenantId, "list", filters] as const,
    detail: (id: string) => ["approvals", "detail", id] as const,
    pending: (tenantId: string, branchId?: string) =>
      branchId
        ? (["approvals", tenantId, "pending", branchId] as const)
        : (["approvals", tenantId, "pending"] as const),
    byType: (tenantId: string, type: string) =>
      ["approvals", tenantId, "type", type] as const,
  },

  // Notifications (scoped per user, not tenant)
  notifications: {
    /** Prefix of every notification query; RPCs notify other users too. */
    root: () => ["notifications"] as const,
    all: (userId: string) => ["notifications", userId] as const,
    list: (userId: string, filters?: object) =>
      ["notifications", userId, "list", filters] as const,
    unread: (userId: string) =>
      ["notifications", userId, "unread"] as const,
    unreadCount: (userId: string) =>
      ["notifications", userId, "unread", "count"] as const,
    detail: (id: string) => ["notifications", "detail", id] as const,
  },

  // Audit logs (activities table)
  activities: {
    all: (tenantId: string) => ["activities", tenantId] as const,
    list: (tenantId: string, filters?: object) =>
      ["activities", tenantId, "list", filters] as const,
    detail: (id: string) => ["activities", "detail", id] as const,
    byUser: (userId: string, limit?: number) =>
      limit
        ? (["activities", "user", userId, limit] as const)
        : (["activities", "user", userId] as const),
    byEntity: (entityType: string, entityId: string) =>
      ["activities", "entity", entityType, entityId] as const,
    byAction: (tenantId: string, actionType: string, limit?: number) =>
      ["activities", tenantId, "action", actionType, limit] as const,
    recent: (tenantId: string, limit?: number) =>
      ["activities", tenantId, "recent", limit] as const,
  },

  // Onboardings
  onboardings: {
    all: (tenantId: string) => ["onboardings", tenantId] as const,
    list: (tenantId: string, filters?: object) =>
      ["onboardings", tenantId, "list", filters] as const,
    detail: (id: string) => ["onboardings", "detail", id] as const,
    byToken: (token: string) => ["onboardings", "token", token] as const,
    pending: (tenantId: string) =>
      ["onboardings", tenantId, "pending"] as const,
    files: (onboardingId: string) =>
      ["onboardings", onboardingId, "files"] as const,
  },
} as const;
