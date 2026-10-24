/**
 * Supabase client configuration for SalesFlow Pro.
 * 
 * This client is configured with the project's URL and anon key,
 * which allows client-side queries with Row Level Security (RLS) enforcement.
 * 
 * The anon key is safe to expose in the browser because:
 * 1. All data access is controlled by RLS policies
 * 2. Users must authenticate to access tenant-scoped data
 * 3. Database functions enforce business rules server-side
 */

import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'

const supabaseUrl = import.meta.env["VITE_SUPABASE_URL"] as string
const supabaseAnonKey = import.meta.env["VITE_SUPABASE_ANON_KEY"] as string

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. Please check your .env.local file.\n' +
    'Required: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY'
  )
}

/**
 * Main Supabase client for application use.
 * Automatically includes auth session in all requests.
 */
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
  },
})

/**
 * Helper to get the current authenticated user.
 * Returns null if not authenticated.
 */
export async function getCurrentUser() {
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error) {
    console.error('Error fetching current user:', error)
    return null
  }
  return user
}

/**
 * Helper to get the current session.
 * Returns null if no active session.
 */
export async function getCurrentSession() {
  const { data: { session }, error } = await supabase.auth.getSession()
  if (error) {
    console.error('Error fetching session:', error)
    return null
  }
  return session
}

/**
 * Sign out the current user.
 */
export async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) {
    console.error('Error signing out:', error)
    throw error
  }
}
