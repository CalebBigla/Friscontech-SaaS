/**
 * Type Adapters
 * 
 * Transform between database types (snake_case) and app types (camelCase)
 * Maintains separation between database schema and application domain
 */

import type { Row } from "@/lib/supabase-helpers";
import type { Branch, BranchStatus, User, Product, ProductStatus } from "@/data/mock-db";

/**
 * Transform database branch row to app Branch type
 */
export function transformBranch(dbRow: Row<'branches'>): Branch {
  return {
    id: dbRow.id,
    tenantId: dbRow.tenant_id,
    name: dbRow.name,
    code: dbRow.code,
    location: dbRow.location || undefined,
    status: dbRow.status as BranchStatus,
    managerId: dbRow.manager_id || undefined,
    createdAt: dbRow.created_at,
    deactivatedAt: dbRow.deactivated_at || undefined,
  };
}

/**
 * Transform app Branch input to database insert
 */
export function branchToDb(branch: Partial<Branch>, tenantId: string): any {
  const result: any = {
    tenant_id: tenantId,
  };
  
  if (branch.id) result.id = branch.id;
  if (branch.name) result.name = branch.name;
  if (branch.code) result.code = branch.code;
  if (branch.location !== undefined) result.location = branch.location || null;
  if (branch.status) result.status = branch.status;
  if (branch.managerId !== undefined) result.manager_id = branch.managerId || null;
  if (branch.deactivatedAt !== undefined) result.deactivated_at = branch.deactivatedAt || null;
  
  return result;
}

/**
 * Transform database user row to app User type
 */
export function transformUser(dbRow: Row<'users'>): User {
  return {
    id: dbRow.id,
    tenantId: dbRow.tenant_id,
    branchId: dbRow.branch_id || undefined,
    firstName: dbRow.first_name,
    lastName: dbRow.last_name,
    email: dbRow.email || undefined,
    phone: dbRow.phone || undefined,
    role: dbRow.role as any,
    status: dbRow.status as any,
    joinedAt: dbRow.joined_at,
    deactivatedAt: dbRow.deactivated_at || undefined,
  };
}

/**
 * Transform database product row to app Product type
 */
export function transformProduct(dbRow: Row<'products'>): Product {
  return {
    id: dbRow.id,
    tenantId: dbRow.tenant_id,
    name: dbRow.name,
    sku: dbRow.sku,
    category: dbRow.category,
    unit: dbRow.unit,
    unitCost: dbRow.unit_cost,
    unitPrice: dbRow.unit_price,
    status: dbRow.status as ProductStatus,
    lowStockThreshold: dbRow.low_stock_threshold || undefined,
    description: dbRow.description || undefined,
    imageUrl: dbRow.image_url || undefined,
    createdAt: dbRow.created_at,
    deactivatedAt: dbRow.deactivated_at || undefined,
  };
}

// Add more transformers as we migrate each entity...
