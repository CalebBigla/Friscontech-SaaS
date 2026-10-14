# SalesFlow Pro - Quick Reference

## Environment Setup

```bash
# 1. Install dependencies
npm install

# 2. Create environment file
cp .env.example .env.local
# Then edit .env.local with your Supabase credentials

# 3. Link to Supabase project
npx supabase link --project-ref your-project-ref
```

## Database Commands

```bash
# Start local Supabase (requires Docker)
npm run db:start

# Stop local Supabase
npm run db:stop

# Create a new migration
npm run db:migration <description>

# Apply all migrations (reset database)
npm run db:reset

# View pending changes
npm run db:diff

# Push migrations to remote
npm run db:push

# Pull schema from remote
npm run db:pull

# Generate TypeScript types
npm run db:types

# Run database tests
npm run db:test
```

## Development

```bash
# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Lint code
npm run lint

# Format code
npm run format
```

## Supabase Dashboard URLs

- **Remote Dashboard:** https://app.supabase.com/project/your-project-ref
- **Local Studio:** http://localhost:54323 (when db:start is running)
- **Local API:** http://localhost:54321
- **Local Database:** postgresql://postgres:postgres@localhost:54322/postgres

## Environment Variables

Required in `.env.local`:

```env
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGc...
VITE_CLOUDINARY_CLOUD_NAME=your-cloud-name
VITE_CLOUDINARY_UPLOAD_PRESET=preset-name
```

Server-only (never expose to browser):

```env
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...
CLOUDINARY_API_KEY=123456789
CLOUDINARY_API_SECRET=abc123xyz
DATABASE_URL=postgresql://postgres:password@db.xxxxx.supabase.co:5432/postgres
```

## Project Structure

```
.
├── src/
│   ├── components/        # React components
│   ├── data/             # Mock data (Phase 1-4)
│   ├── lib/              # Business logic & utilities
│   │   └── supabase.ts   # Supabase client ✨
│   ├── routes/           # Page routes
│   ├── services/         # Service layer (API calls)
│   └── types/
│       └── database.types.ts  # Auto-generated DB types ✨
├── supabase/
│   ├── config.toml       # Local Supabase config
│   ├── migrations/       # SQL migrations ✨
│   ├── seed.sql          # Dev seed data
│   └── tests/            # RLS & constraint tests
├── .env.example          # Template
├── .env.local           # Your credentials (gitignored)
└── package.json          # Dependencies & scripts
```

## Useful Supabase CLI Commands

```bash
# Check CLI version
npx supabase --version

# Check status of local Supabase
npx supabase status

# Check database connection
npx supabase db ping

# Open Studio in browser
npx supabase studio

# View logs
npx supabase logs

# List migrations
npx supabase migration list

# Create function or trigger
npx supabase functions new <name>
```

## Troubleshooting

### npm install fails
```bash
npm install --legacy-peer-deps
# or
npm cache clean --force && npm install
```

### Cannot start local Supabase
```bash
# Ensure Docker Desktop is running
# Check port availability (54321-54326)
# Try stopping and restarting:
npm run db:stop
npm run db:start
```

### Environment variables not loading
```bash
# Verify file name is exactly: .env.local
# Restart dev server after changes
# Check for typos in variable names (must start with VITE_)
```

### TypeScript errors after schema changes
```bash
# Regenerate types
npm run db:types
# Restart TypeScript server in VS Code
# Cmd/Ctrl + Shift + P → "TypeScript: Restart TS Server"
```

### Database connection issues
```bash
# Check credentials in .env.local
# Verify project is active in Supabase dashboard
# Test with: npx supabase db ping
```

## Getting Help

- **Supabase Docs:** https://supabase.com/docs
- **Supabase CLI:** https://supabase.com/docs/guides/cli
- **Project Setup:** See `SUPABASE_SETUP.md`
- **Database Guide:** See `supabase/README.md`
- **Migration Guide:** See `supabase/migrations/README.md`
- **Implementation Plan:** See Phase B completion artifact

## Phase Status

- [x] Phase A: Inspection & Planning
- [x] Phase B: Supabase Setup
- [ ] Phase C: Database Schema ← **Next**
- [ ] Phase D: Authentication
- [ ] Phase E: Service Migration
- [ ] Phase F: Cloudinary Integration
- [ ] Phase G: Testing
- [ ] Phase H: Deployment

## Common Workflows

### Adding a new table
1. `npm run db:migration add_new_table`
2. Edit migration file in `supabase/migrations/`
3. `npm run db:reset` (apply locally)
4. `npm run db:types` (update TypeScript types)
5. Test RLS policies
6. `npm run db:push` (deploy to remote - after approval)

### Updating existing table
1. `npm run db:migration update_table_name`
2. Write ALTER TABLE statements
3. Apply and test locally
4. Generate new types
5. Update service layer code
6. Push to remote

### Testing a feature
1. Start local Supabase: `npm run db:start`
2. Insert test data via Studio or seed.sql
3. Test queries in SQL editor
4. Test RLS with different user roles
5. Verify in application UI
6. Write automated tests in `supabase/tests/`

## Next Steps

After Phase B setup is complete:

1. ✅ Verify all manual setup steps from `SUPABASE_SETUP.md`
2. ⏳ Start Phase C: Create database migrations
3. ⏳ Apply migrations and generate types
4. ⏳ Implement authentication (Phase D)
5. ⏳ Migrate services to Supabase (Phase E)

**Ready to continue?** Type `phase C` to start creating migrations!
