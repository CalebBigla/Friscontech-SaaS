# Supabase Configuration for SalesFlow Pro

This directory contains all Supabase-related configuration, migrations, and tests for the SalesFlow Pro database.

## Directory Structure

```
supabase/
├── config.toml           # Local Supabase configuration
├── migrations/           # SQL migration files (version controlled)
├── seed.sql             # Optional seed data for local development
├── tests/               # Database tests (RLS policies, constraints)
└── README.md            # This file
```

## Prerequisites

1. **Node.js** (v18 or higher)
2. **Docker Desktop** (for running local Supabase)
3. **Supabase Account** (for remote project)

## Getting Started

### 1. Install Dependencies

```bash
npm install
```

This will install the Supabase CLI (`supabase` package) and the Supabase JavaScript client.

### 2. Start Local Supabase

```bash
npm run db:start
```

This will:
- Start local PostgreSQL database
- Start Supabase Studio (UI) at http://localhost:54323
- Start authentication server
- Start storage server
- Apply all migrations from `migrations/` directory

**First time setup may take a few minutes as Docker images are downloaded.**

### 3. Link to Remote Project (Optional)

If you have a Supabase project already:

```bash
supabase link --project-ref <your-project-ref>
```

Get your project ref from: https://app.supabase.com/project/_/settings/general

### 4. Create Environment File

Copy `.env.example` to `.env.local` and fill in your values:

```bash
cp .env.example .env.local
```

Get your Supabase credentials from:
- **Local:** After running `npm run db:start`, credentials are shown in terminal
- **Remote:** https://app.supabase.com/project/_/settings/api

## Database Commands

### Working with Migrations

**Create a new migration:**
```bash
npm run db:migration <migration_name>
```
Example: `npm run db:migration add_products_table`

**Apply migrations:**
```bash
npm run db:reset
```
This will drop and recreate the local database with all migrations.

**Generate TypeScript types:**
```bash
npm run db:types
```
This creates `src/types/database.types.ts` from your database schema.

### Pushing to Remote

**View pending changes:**
```bash
npm run db:diff
```

**Push migrations to remote:**
```bash
npm run db:push
```
⚠️ **Use with caution in production!**

**Pull remote schema:**
```bash
npm run db:pull
```
This creates a new migration from remote database changes.

### Testing

**Run database tests:**
```bash
npm run db:test
```

Tests should verify:
- Row Level Security policies
- Database constraints
- Business logic functions
- Permission boundaries

## Supabase Studio

Access the local Supabase Studio at: http://localhost:54323

Here you can:
- Browse tables and data
- Run SQL queries
- Test API endpoints
- Manage authentication
- View storage buckets

## Environment Variables

### Required for Application

```env
VITE_SUPABASE_URL=<your-supabase-url>
VITE_SUPABASE_ANON_KEY=<your-anon-key>
```

### Server-Only (Never Expose to Browser)

```env
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
DATABASE_URL=<postgres-connection-string>
```

## Migration Workflow

1. **Create migration**: `npm run db:migration <name>`
2. **Edit migration file** in `supabase/migrations/`
3. **Apply locally**: `npm run db:reset`
4. **Test thoroughly**: Verify data, RLS policies, functions
5. **Generate types**: `npm run db:types`
6. **Commit migration**: Add to Git
7. **Deploy to remote**: `npm run db:push` (after approval)

## Best Practices

### Migrations

- ✅ Keep migrations small and focused
- ✅ Always include `IF NOT EXISTS` checks
- ✅ Add comments explaining complex logic
- ✅ Test rollback scenarios
- ✅ Never edit applied migrations (create new ones)
- ⚠️ Never delete data in migrations without backup

### RLS Policies

- ✅ Enable RLS on all tables: `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`
- ✅ Test policies with different user roles
- ✅ Deny by default, allow explicitly
- ✅ Use helper functions for common checks

### Security

- 🔒 Never commit `.env.local` or credentials
- 🔒 Use service role key only in server-side code
- 🔒 Validate all inputs in database functions
- 🔒 Audit sensitive operations

## Troubleshooting

### Docker Issues

**Port conflicts:**
```bash
npm run db:stop
# Kill conflicting processes, then:
npm run db:start
```

**Reset everything:**
```bash
supabase stop --no-backup
supabase start
```

### Connection Issues

**Cannot connect to database:**
1. Verify Docker is running
2. Check if local Supabase is started: `npm run db:start`
3. Verify environment variables in `.env.local`

**Types not generating:**
1. Ensure migrations are applied: `npm run db:reset`
2. Check that Supabase is running: `supabase status`
3. Verify `src/types/` directory exists

### Migration Errors

**Syntax error in migration:**
- Review SQL syntax
- Test query in Supabase Studio SQL editor
- Check for missing semicolons or quotes

**Migration conflicts:**
- Pull latest: `git pull`
- Reset local DB: `npm run db:reset`
- Resolve conflicts in migration files

## Resources

- [Supabase Documentation](https://supabase.com/docs)
- [Supabase CLI Reference](https://supabase.com/docs/guides/cli)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Row Level Security Guide](https://supabase.com/docs/guides/auth/row-level-security)

## Support

For issues specific to this project, check the main README.md or contact the development team.
