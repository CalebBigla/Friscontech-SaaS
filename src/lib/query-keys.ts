/**
 * React Query Key Factory
 * 
 * Centralized query key management for consistent caching and invalidation
 * Following TanStack Query best practices
 */

export const queryKeys = {
  // Branches
  branches: {
    all: (tenantId: string) => ['branches', tenantId] as const,
    detail: (id: string) => ['branches', 'detail', id] as const,
  },
  
  // Products
  products: {
    all: (tenantId: string) => ['products', tenantId] as const,
    detail: (id: string) => ['products', 'detail', id] as const,
    active: (tenantId: string) => ['products', tenantId, 'active'] as const,
  },
  
  // Users/Team
  users: {
    all: (tenantId: string) => ['users', tenantId] as const,
    detail: (id: string) => ['users', 'detail', id] as const,
    byBranch: (branchId: string) => ['users', 'branch', branchId] as const,
    byRole: (tenantId: string, role: string) => ['users', tenantId, 'role', role] as const,
  },
  
  // Inventory
  inventory: {
    all: (tenantId: string) => ['inventory', tenantId] as const,
    byBranch: (branchId: string) => ['inventory', 'branch', branchId] as const,
    detail: (id: string) => ['inventory', 'detail', id] as const,
    movements: (inventoryId: string) => ['inventory', inventoryId, 'movements'] as const,
    batches: (productId: string, branchId: string) => ['inventory', 'batches', productId, branchId] as const,
  },
  
  // Sales
  sales: {
    all: (tenantId: string) => ['sales', tenantId] as const,
    byBranch: (branchId: string) => ['sales', 'branch', branchId] as const,
    byRep: (repId: string) => ['sales', 'rep', repId] as const,
    byPeriod: (start: string, end: string) => ['sales', 'period', start, end] as const,
  },
  
  // Customers
  customers: {
    all: (tenantId: string) => ['customers', tenantId] as const,
    byBranch: (branchId: string) => ['customers', 'branch', branchId] as const,
    detail: (id: string) => ['customers', 'detail', id] as const,
    payments: (customerId: string) => ['customers', customerId, 'payments'] as const,
  },
  
  // Stock Requests
  stockRequests: {
    all: (tenantId: string) => ['stockRequests', tenantId] as const,
    byBranch: (branchId: string) => ['stockRequests', 'branch', branchId] as const,
    byRequester: (requesterId: string) => ['stockRequests', 'requester', requesterId] as const,
    detail: (id: string) => ['stockRequests', 'detail', id] as const,
  },
  
  // Targets
  targets: {
    all: (tenantId: string) => ['targets', tenantId] as const,
    byMonth: (month: string) => ['targets', 'month', month] as const,
    byRep: (repId: string) => ['targets', 'rep', repId] as const,
    detail: (id: string) => ['targets', 'detail', id] as const,
  },
  
  // Payments
  payments: {
    all: (tenantId: string) => ['payments', tenantId] as const,
    byRep: (repId: string) => ['payments', 'rep', repId] as const,
    byPeriod: (period: string) => ['payments', 'period', period] as const,
    pending: (tenantId: string) => ['payments', tenantId, 'pending'] as const,
  },
  
  // Expenses
  expenses: {
    all: (tenantId: string) => ['expenses', tenantId] as const,
    byBranch: (branchId: string) => ['expenses', 'branch', branchId] as const,
    byManager: (managerId: string) => ['expenses', 'manager', managerId] as const,
  },
  
  // Remittances
  remittances: {
    manager: {
      all: (tenantId: string) => ['remittances', 'manager', tenantId] as const,
      byBranch: (branchId: string) => ['remittances', 'manager', 'branch', branchId] as const,
      detail: (id: string) => ['remittances', 'manager', 'detail', id] as const,
    },
    owner: {
      all: (tenantId: string) => ['remittances', 'owner', tenantId] as const,
      detail: (id: string) => ['remittances', 'owner', 'detail', id] as const,
    },
  },
  
  // Approvals
  approvals: {
    all: (tenantId: string) => ['approvals', tenantId] as const,
    pending: (tenantId: string) => ['approvals', tenantId, 'pending'] as const,
    byType: (tenantId: string, type: string) => ['approvals', tenantId, 'type', type] as const,
  },
  
  // Notifications
  notifications: {
    all: (userId: string) => ['notifications', userId] as const,
    unread: (userId: string) => ['notifications', userId, 'unread'] as const,
  },
  
  // Audit Logs
  auditLogs: {
    all: (tenantId: string) => ['auditLogs', tenantId] as const,
    byUser: (userId: string) => ['auditLogs', 'user', userId] as const,
    byEntity: (entityType: string, entityId: string) => ['auditLogs', 'entity', entityType, entityId] as const,
  },
  
  // Preferences
  preferences: {
    byUser: (userId: string) => ['preferences', userId] as const,
  },
  
  // Onboardings
  onboardings: {
    all: (tenantId: string) => ['onboardings', tenantId] as const,
    byToken: (token: string) => ['onboardings', 'token', token] as const,
  },
} as const;
