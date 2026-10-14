# Supabase Setup Guide for SalesFlow Pro

## Phase B Completion Status

### ✅ Completed
- [x] Supabase project structure created (`supabase/` directory)
- [x] Configuration files added (`config.toml`, `seed.sql`)
- [x] Package.json updated with Supabase scripts and dependencies
- [x] Environment template created (`.env.example`)
- [x] Supabase client configured (`src/lib/supabase.ts`)
- [x] TypeScript types placeholder created (`src/types/database.types.ts`)
- [x] `.gitignore` updated for environment files

### ⏳ Next Steps (Manual)

#### 1. Install Dependencies

Run this command in your terminal:
```bash
npm install
```

This will install:
- `@supabase/supabase-js` (client library)
- `supabase` (CLI tool)

**Note:** If npm install times out, try:
```bash
npm install --legacy-peer-deps
```

Or install individually:
```bash
npm install @supabase/supabase-js
npm install -D supabase
```

#### 2. Create Supabase Project

**Option A: Create New Project**
1. Go to https://app.supabase.com
2. Click "New Project"
3. Fill in:
   - Name: `salesflow-pro`
   - Database Password: (save this securely)
   - Region: (choose closest to your users)
4. Wait for project to be created (~2 minutes)

**Option B: Use Existing Project**
If you already have a Supabase project, skip to step 3.

#### 3. Get Your Credentials

From your Supabase project dashboard:

1. Go to **Settings** → **API**
2. Copy the following:
   - **Project URL** (looks like: `https://xxxxx.supabase.co`)
   - **Anon/Public Key** (safe to expose in browser)
   - **Service Role Key** (keep this secret!)

#### 4. Create Environment File

Create `.env.local` in the project root:

```bash
# Copy from template
cp .env.example .env.local
```

Then edit `.env.local` with your actual credentials:

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-actual-anon-key

VITE_CLOUDINARY_CLOUD_NAME=your-cloud-name
VITE_CLOUDINARY_UPLOAD_PRESET=your-preset

# Server-only (DO NOT commit)
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
DATABASE_URL=postgresql://postgres:[YOUR-PASSWORD]@db.your-project-ref.supabase.co:5432/postgres
```

#### 5. Link Local Project to Remote

```bash
npx supabase link --project-ref your-project-ref
```

Get your project ref from the Project Settings → General in Supabase dashboard.

#### 6. Initialize Local Development (Optional)

If you want to run Supabase locally with Docker:

```bash
# Start local Supabase (requires Docker Desktop)
npm run db:start
```

This will:
- Download PostgreSQL, Auth, Storage, and Studio images
- Start all services locally
- Show connection details in terminal

**Access Supabase Studio:** http://localhost:54323

## What's Next: Phase C - Database Schema

After completing the setup above, we'll create the database schema with migrations:

1. **Foundation Tables** (tenants, branches, users)
2. **Catalog & Inventory** (products, inventory_records, stock_batches)
3. **Sales & Customers** (customers, sales, customer_payments)
4. **Financial Workflows** (payments, expenses, remittances)
5. **Operations** (stock_requests, targets, approvals)
6. **System** (onboardings, activities, notifications, preferences)

Each migration will include:
- Table definitions with proper constraints
- Foreign keys and indexes
- Row Level Security (RLS) policies
- Helper functions for business logic
- Triggers for automated tasks

## Verification Checklist

Before proceeding to Phase C, verify:

- [ ] Dependencies installed successfully (`npm list @supabase/supabase-js`)
- [ ] `.env.local` file created with real credentials
- [ ] Supabase project accessible at dashboard URL
- [ ] Can connect to database (test with Supabase Studio or SQL editor)
- [ ] Local Supabase running (if using local development)

## Troubleshooting

### npm install fails
- Try: `npm install --legacy-peer-deps`
- Or: `npm cache clean --force && npm install`

### Cannot connect to Supabase
- Verify `.env.local` has correct URL and keys
- Check that project is active in Supabase dashboard
- Ensure no firewall blocking connection

### Docker issues (local development)
- Ensure Docker Desktop is running
- Try: `npm run db:stop` then `npm run db:start`
- Check ports 54321-54326 are not in use

### Supabase CLI not found
- Verify installation: `npx supabase --version`
- If missing: `npm install -D supabase`

## Resources

- **Supabase Docs:** https://supabase.com/docs
- **Supabase CLI:** https://supabase.com/docs/guides/cli
- **Database Design Guide:** See `supabase/README.md`
- **Implementation Plan:** See the artifact created earlier

## Support

If you encounter issues:
1. Check the troubleshooting section above
2. Review `supabase/README.md` for detailed guides
3. Consult Supabase documentation
4. Check project logs in Supabase dashboard

---

**Current Status:** Phase B infrastructure complete. Ready for Phase C (database migrations) after manual setup steps above.
