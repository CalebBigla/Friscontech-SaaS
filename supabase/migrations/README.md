# Database Migrations

This directory contains all SQL migration files for the SalesFlow Pro database schema.

## Migration Naming Convention

Migrations are named with timestamps to ensure proper ordering:
```
YYYYMMDDHHMMSS_description.sql
```

Example: `20260114120000_create_initial_schema.sql`

## Migration Order

Migrations must be applied in sequence to maintain database integrity:

### 1. Foundation (Users & Organization)
- `20260114120000_create_initial_schema.sql` - Core tables (tenants, branches, users)
- `20260114130000_create_auth_functions.sql` - Auth helper functions

### 2. Catalog & Products
- `20260114140000_create_products_tables.sql` - Products and categories
- `20260114141000_create_inventory_tables.sql` - Inventory records, movements, batches

### 3. Customers & Sales
- `20260114150000_create_customers_table.sql` - Customer accounts
- `20260114151000_create_sales_tables.sql` - Sales transactions

### 4. Financial Workflows
- `20260114160000_create_payments_tables.sql` - Payment submissions (rep & customer)
- `20260114161000_create_expenses_tables.sql` - Manager/Owner expenses
- `20260114162000_create_remittances_tables.sql` - Manager & Owner remittances

### 5. Operations
- `20260114170000_create_stock_requests_table.sql` - Stock request workflow
- `20260114171000_create_targets_table.sql` - Branch and rep targets
- `20260114172000_create_approvals_table.sql` - Approval workflow

### 6. System Tables
- `20260114180000_create_onboarding_tables.sql` - Staff onboarding
- `20260114181000_create_activities_table.sql` - Audit logs
- `20260114182000_create_notifications_table.sql` - In-app notifications
- `20260114183000_create_preferences_table.sql` - User preferences

### 7. RLS Policies
- `20260114190000_enable_rls.sql` - Enable RLS on all tables
- `20260114191000_create_tenant_policies.sql` - Tenant isolation
- `20260114192000_create_role_policies.sql` - Role-based access

### 8. Functions & Triggers
- `20260114200000_create_helper_functions.sql` - Business logic functions
- `20260114201000_create_triggers.sql` - Automated tasks (timestamps, inventory)

### 9. Indexes & Performance
- `20260114210000_create_indexes.sql` - Performance indexes

## Creating a New Migration

```bash
# Using npm script
npm run db:migration <description>

# Or directly with Supabase CLI
npx supabase migration new <description>
```

This creates a new file: `supabase/migrations/TIMESTAMP_description.sql`

## Applying Migrations

### Local Development
```bash
# Reset and apply all migrations
npm run db:reset

# Or manually
npx supabase db reset
```

### Remote (Production)
```bash
# Review pending changes
npm run db:diff

# Push to remote
npm run db:push
```

**⚠️ WARNING:** Always test migrations locally before pushing to production!

## Migration Best Practices

### DO:
✅ Include `IF NOT EXISTS` checks
✅ Add comments explaining complex logic
✅ Create migrations in small, focused chunks
✅ Test rollback scenarios
✅ Include both DDL (structure) and DML (data) when needed
✅ Version control all migrations

### DON'T:
❌ Edit migrations after they've been applied
❌ Delete applied migrations
❌ Include sensitive data or credentials
❌ Make breaking changes without data migration
❌ Skip testing locally

## Rollback Strategy

To rollback a migration:

1. Create a new migration that reverses the changes
2. Name it descriptively: `TIMESTAMP_rollback_description.sql`
3. Include SQL to undo the previous migration

Example:
```sql
-- Rollback: 20260114120000_create_initial_schema.sql
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS branches CASCADE;
DROP TABLE IF EXISTS tenants CASCADE;
```

## Testing Migrations

Before applying to production:

1. **Local Test:** `npm run db:reset`
2. **Verify Schema:** Check tables in Supabase Studio
3. **Test Queries:** Run sample queries to verify structure
4. **Check RLS:** Test with different user roles
5. **Performance:** Run EXPLAIN ANALYZE on critical queries
6. **Rollback Test:** Verify rollback migration works

## Migration Template

```sql
-- Migration: <Description>
-- Created: <Date>
-- Author: <Name>

-- Description:
-- <Detailed explanation of what this migration does>

-- Dependencies:
-- <List any required prior migrations>

BEGIN;

-- Your migration SQL here
CREATE TABLE IF NOT EXISTS example (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add comments for documentation
COMMENT ON TABLE example IS 'Description of the table purpose';
COMMENT ON COLUMN example.id IS 'Primary key';

COMMIT;
```

## Verifying Migrations

After applying migrations:

```bash
# Check migration status
npx supabase migration list

# Generate TypeScript types
npm run db:types

# Verify in Studio
# Open http://localhost:54323 (local) or your project dashboard (remote)
```

## Common Issues

### Migration fails to apply
- Check SQL syntax
- Verify dependencies (tables/functions exist)
- Look for missing semicolons
- Review error logs

### RLS blocks queries
- Verify RLS policies are created
- Check user authentication
- Test with service role key for admin access

### Performance issues
- Add missing indexes
- Review query execution plans
- Optimize joins and subqueries

## Next Steps

After migrations are applied:
1. Generate TypeScript types: `npm run db:types`
2. Update service layer to use Supabase client
3. Test all CRUD operations
4. Verify RLS policies with different roles
5. Run integration tests
