/**
 * Supabase Helper Functions
 * 
 * Common patterns and utilities for Supabase queries
 * Handles type transformations, error handling, and query building
 */

import type { Database } from "@/types/database.types";

// Type aliases for convenience
export type Tables = Database['public']['Tables'];
export type TableName = keyof Tables;
export type Row<T extends TableName> = Tables[T]['Row'];
export type Insert<T extends TableName> = Tables[T]['Insert'];
export type Update<T extends TableName> = Tables[T]['Update'];

/**
 * Transform database row (snake_case) to app object (camelCase)
 * Generic type transformation helper
 */
export function transformFromDb<T extends Record<string, any>>(
  data: any,
  fieldMap: Record<keyof T, string>
): T {
  const result: any = {};
  
  for (const [appKey, dbKey] of Object.entries(fieldMap)) {
    if (data[dbKey] !== undefined) {
      result[appKey] = data[dbKey];
    }
  }
  
  return result as T;
}

/**
 * Transform app object (camelCase) to database row (snake_case)
 * Generic type transformation helper
 */
export function transformToDb<T extends Record<string, any>>(
  data: T,
  fieldMap: Record<keyof T, string>
): Record<string, any> {
  const result: Record<string, any> = {};
  
  for (const [appKey, dbKey] of Object.entries(fieldMap)) {
    if (data[appKey as keyof T] !== undefined) {
      result[dbKey] = data[appKey as keyof T];
    }
  }
  
  return result;
}

/**
 * Standard error handler for Supabase queries
 */
export function handleSupabaseError(error: any): never {
  console.error('Supabase error:', error);
  
  // Extract meaningful error message
  const message = error?.message || 'Database operation failed';
  
  throw new Error(message);
}

/**
 * Check if error is a "not found" error
 */
export function isNotFoundError(error: any): boolean {
  return error?.code === 'PGRST116' || error?.message?.includes('not found');
}

/**
 * Check if error is a unique constraint violation
 */
export function isUniqueViolation(error: any): boolean {
  return error?.code === '23505' || error?.message?.includes('duplicate key');
}

/**
 * Check if error is a foreign key violation
 */
export function isForeignKeyViolation(error: any): boolean {
  return error?.code === '23503' || error?.message?.includes('foreign key');
}

/**
 * Result type for service operations
 */
export type ServiceResult<T = true> = 
  | { ok: true; data: T }
  | { ok: false; error: string };

/**
 * Wrap async operation with error handling
 */
export async function wrapServiceCall<T>(
  operation: () => Promise<T>
): Promise<ServiceResult<T>> {
  try {
    const data = await operation();
    return { ok: true, data };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Operation failed';
    return { ok: false, error: message };
  }
}
