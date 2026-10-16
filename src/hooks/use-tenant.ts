/**
 * Tenant context hook
 * 
 * Provides easy access to current tenant ID from auth context.
 * Used throughout the app to scope queries to the current tenant.
 */
import { useAuth } from "@/contexts/auth-context";

export function useTenantId(): string {
  const { user } = useAuth();
  
  if (!user?.tenantId) {
    // In production, user should always have tenantId if authenticated
    // This fallback handles edge cases during development
    console.warn("No tenantId found in user context - user may not be authenticated");
    return "";
  }
  
  return user.tenantId;
}
