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
 * Error thrown by every hook. Keeps the Postgres code and HINT so the UI can
 * tell an RLS denial (42501) apart from bad input, and show RPC validation
 * errors next to the form field named in the HINT.
 */
export class SupabaseRequestError extends Error {
  readonly code: string | undefined;
  readonly hint: string | undefined;
  readonly details: string | undefined;
  constructor(error: { message?: string; code?: string; hint?: string; details?: string }) {
    super(error.message || 'Database operation failed');
    this.name = 'SupabaseRequestError';
    this.code = error.code || undefined;
    this.hint = error.hint || undefined;
    this.details = error.details || undefined;
  }
}

/**
 * Standard error handler for Supabase queries
 */
export function handleSupabaseError(error: any): never {
  console.error('Supabase error:', error);
  throw new SupabaseRequestError(error ?? {});
}

/** True when RLS refused the operation (record it; never work around it). */
export function isRlsDenied(error: unknown): boolean {
  return error instanceof SupabaseRequestError
    && (error.code === '42501' || /row-level security/i.test(error.message));
}

/**
 * Map a failed write to form field errors. RPCs name the offending form field
 * in the error HINT; anything else is shown as a general (`form`) error.
 */
export function fieldErrorsFrom<K extends string>(error: unknown, fields: readonly K[]): Partial<Record<K | 'form', string>> {
  const message = isRlsDenied(error)
    ? 'You do not have permission to do this.'
    : error instanceof Error && error.message ? error.message : 'The request failed. Please try again.';
  const hint = error instanceof SupabaseRequestError ? error.hint : undefined;
  if (hint && (fields as readonly string[]).includes(hint)) {
    return { [hint]: message } as Partial<Record<K | 'form', string>>;
  }
  return { form: message } as Partial<Record<K | 'form', string>>;
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

