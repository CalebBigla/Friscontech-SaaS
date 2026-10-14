# SalesFlow Pro - Production Deployment Guide

## Prerequisites Checklist

Before deploying to production:

- [ ] Supabase account created (https://app.supabase.com)
- [ ] Supabase project created
- [ ] Cloudinary account created (https://cloudinary.com)
- [ ] npm dependencies installed
- [ ] Environment variables configured

---

## Step 1: Create Supabase Production Project

### A. Sign up/Login to Supabase
1. Go to https://app.supabase.com
2. Sign up or log in with GitHub/Google/Email

### B. Create New Project
1. Click **"New Project"**
2. Fill in the details:
   - **Name:** `salesflow-pro-production` (or your preferred name)
   - **Database Password:** Create a strong password (save this securely!)
   - **Region:** Select closest to Nigeria (e.g., `eu-west-2` - London)
   - **Pricing Plan:** Free tier is fine for testing, Pro for production
3. Click **"Create new project"**
4. Wait ~2 minutes for provisioning

### C. Get Your Credentials
Once project is ready:

1. Go to **Settings** → **API**
2. Copy these values:

```
Project URL: https://xxxxxxxxxxxxx.supabase.co
anon public key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
service_role key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

3. Go to **Settings** → **Database**
4. Copy the Connection String (URI format)

---

## Step 2: Configure Environment Variables

### A. Update `.env.local`

Edit your `.env.local` file with the actual credentials:

```env
# Supabase Production
VITE_SUPABASE_URL=https://your-actual-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.your-actual-anon-key

# Cloudinary (get from https://console.cloudinary.com)
VITE_CLOUDINARY_CLOUD_NAME=your-cloud-name
VITE_CLOUDINARY_UPLOAD_PRESET=your-unsigned-preset

# Server-Only (NEVER expose to browser)
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.your-service-role-key
DATABASE_URL=postgresql://postgres:your-db-password@db.your-project-ref.supabase.co:5432/postgres

# Cloudinary Private Keys (server-only)
CLOUDINARY_API_KEY=123456789012345
CLOUDINARY_API_SECRET=abcdefghijklmnopqrstuvwxyz
```

### B. Verify File
```bash
# Make sure .env.local is NOT committed
git status .env.local
# Should show: "nothing to commit" or not listed
```

---

## Step 3: Install Dependencies

```bash
# Install all packages
npm install

# If it times out or fails, try:
npm install --legacy-peer-deps

# Or install critical ones first:
npm install @supabase/supabase-js
npm install -D supabase
```

### Verify Installation
```bash
# Check Supabase CLI
npx supabase --version

# Check client library
npm list @supabase/supabase-js
```

---

## Step 4: Link to Production Project

```bash
# Link local project to remote Supabase
npx supabase link --project-ref your-project-ref
```

**Get your project ref:**
- Go to Supabase Dashboard → **Settings** → **General**
- Copy the **Reference ID** (looks like: `abcdefghijklmn`)

---

## Step 5: Apply Migrations to Production

### A. Review Migrations Locally (Optional but Recommended)

If you have Docker installed and want to test first:

```bash
# Start local Supabase
npm run db:start

# This will auto-apply migrations locally
# Check in Studio: http://localhost:54323
```

### B. Review What Will Be Applied

```bash
# See pending migrations
npx supabase migration list

# View diff (if remote has schema already)
npm run db:diff
```

### C. Apply Migrations to Production

**⚠️ IMPORTANT: This will modify your production database!**

```bash
# Push all migrations
npm run db:push
```

You should see output like:
```
Applying migration 20260114120000_create_initial_schema.sql...
Applying migration 20260114140000_create_products_and_inventory.sql...
... (all 7 migrations)
Finished supabase db push.
```

### D. Generate TypeScript Types

```bash
# Generate types from production schema
npm run db:types
```

This creates/updates: `src/types/database.types.ts`

---

## Step 6: Verify Deployment

### A. Check Supabase Dashboard

1. Go to **Table Editor** in Supabase Dashboard
2. Verify all tables exist:
   - tenants
   - branches
   - users
   - products
   - inventory_records
   - sales
   - customers
   - payments
   - (and 13 more...)

3. Go to **Database** → **Functions**
   - Verify helper functions exist
   - Check: `get_user_tenant_id`, `get_customer_balance`, etc.

4. Go to **Database** → **Policies**
   - Verify RLS is enabled on all tables
   - Check policies exist (should see 60+)

### B. Test Database Connection

In Supabase Dashboard → **SQL Editor**, run:

```sql
-- Test basic query
SELECT version();

-- Check tables
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public'
ORDER BY table_name;

-- Check RLS is enabled
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public';
```

All tables should show `rowsecurity = true`.

### C. Test Authentication Setup

```sql
-- Check auth schema exists
SELECT * FROM auth.users LIMIT 1;

-- This should return empty (no users yet)
```

---

## Step 7: Cloudinary Setup

### A. Create Cloudinary Account
1. Go to https://cloudinary.com
2. Sign up for free account
3. Verify email

### B. Get Credentials
From Cloudinary Dashboard:

```
Cloud Name: your-cloud-name
API Key: 123456789012345
API Secret: abcdefghijklmnopqrstuvwxyz
```

### C. Create Upload Preset
1. Go to **Settings** → **Upload**
2. Scroll to **Upload presets**
3. Click **Add upload preset**
4. Configure:
   - **Preset name:** `salesflow-public` (for product images)
   - **Signing Mode:** Unsigned
   - **Folder:** `products`
   - **Access mode:** Public
5. Save

6. Create another preset:
   - **Preset name:** `salesflow-private` (for documents)
   - **Signing Mode:** Signed (requires API secret)
   - **Folder:** `onboarding`
   - **Access mode:** Private

### D. Update `.env.local`
Add the Cloudinary credentials you got above.

---

## Step 8: Test the Application

### A. Start Development Server

```bash
npm run dev
```

Application should start at: http://localhost:5173

### B. Initial Tests

1. **Check Connection:**
   - Open browser console
   - Should see no Supabase connection errors

2. **Test Login Page:**
   - Navigate to `/login`
   - Page should load (even if auth not working yet)

3. **Check Database:**
   - Open Supabase Dashboard
   - Go to **Authentication** → **Users**
   - Should be empty (Phase D will add auth)

---

## Step 9: Create Initial Data (Optional)

For testing, you can manually create a tenant and owner user:

### A. Create Tenant

In Supabase Dashboard → **SQL Editor**:

```sql
INSERT INTO tenants (
  id, name, legal_name, business_email, phone, 
  currency, timezone, plan, expiry_alert_months
) VALUES (
  gen_random_uuid(),
  'Friscontech',
  'Friscontech Limited',
  'admin@friscontech.com',
  '+234 800 000 0000',
  'NGN',
  'Africa/Lagos',
  'Growth',
  6
) RETURNING *;
```

Copy the returned `id` (tenant UUID).

### B. Create Auth User

1. Go to **Authentication** → **Users** → **Add user**
2. Fill in:
   - Email: `owner@friscontech.com`
   - Password: (create strong password)
   - Auto Confirm User: ✅ Yes
3. Click **Add user**
4. Copy the user's UUID

### C. Create User Profile

Back in SQL Editor:

```sql
INSERT INTO users (
  id, tenant_id, name, email, role, status
) VALUES (
  '<user-uuid-from-auth>', -- Replace with actual UUID
  '<tenant-uuid>', -- Replace with tenant UUID
  'System Owner',
  'owner@friscontech.com',
  'owner',
  'active'
);
```

### D. Test Login

1. Go to http://localhost:5173/login
2. Login with owner@friscontech.com and password
3. Should work once Phase D (Auth) is complete

---

## Step 10: Build for Production

### A. Test Production Build

```bash
# Build the application
npm run build

# Preview production build
npm run preview
```

Visit: http://localhost:4173

### B. Deploy to Hosting

Choose your hosting platform:

**Option 1: Vercel (Recommended)**
```bash
npm install -g vercel
vercel login
vercel
```

**Option 2: Netlify**
```bash
npm install -g netlify-cli
netlify login
netlify deploy --prod
```

**Option 3: Cloudflare Pages**
- Connect GitHub repo to Cloudflare Pages
- Set build command: `npm run build`
- Set output directory: `dist`

### C. Set Environment Variables on Host

In your hosting platform dashboard, add these environment variables:

```
VITE_SUPABASE_URL=<your-production-url>
VITE_SUPABASE_ANON_KEY=<your-anon-key>
VITE_CLOUDINARY_CLOUD_NAME=<your-cloud-name>
VITE_CLOUDINARY_UPLOAD_PRESET=<your-preset>
```

**Do NOT add service role keys or secrets to hosting environment variables!**

---

## Troubleshooting

### npm install fails
```bash
# Clear cache
npm cache clean --force

# Try with legacy deps
npm install --legacy-peer-deps

# Or use yarn
npm install -g yarn
yarn install
```

### Supabase CLI not found
```bash
# Install globally
npm install -g supabase

# Or use npx
npx supabase --version
```

### Migration fails
```bash
# Check connection
npx supabase db ping

# Reset local (if using local)
npm run db:stop
npm run db:start

# Check remote project
npx supabase projects list
```

### RLS blocking queries
- Check policies exist: Supabase Dashboard → Database → Policies
- Verify user is authenticated
- Use service role key for admin access (server-side only)

### Cannot connect to database
- Verify `.env.local` has correct URL and keys
- Check project is active in Supabase dashboard
- Try recreating the project if needed

---

## Security Checklist

Before going live:

- [ ] `.env.local` is in `.gitignore`
- [ ] No credentials committed to Git
- [ ] RLS enabled on all tables
- [ ] Service role key only on server
- [ ] Cloudinary private uploads use signed URLs
- [ ] Strong database password
- [ ] HTTPS enforced on hosting
- [ ] Regular database backups configured

---

## Next Steps After Deployment

1. ✅ Phase D: Authentication integration
2. ✅ Phase E: Service layer migration (replace mock data)
3. ✅ Phase F: Cloudinary file uploads
4. ✅ Phase G: Testing
5. ✅ Phase H: Production rollout

---

## Support Resources

- **Supabase Docs:** https://supabase.com/docs
- **Supabase Discord:** https://discord.supabase.com
- **Cloudinary Docs:** https://cloudinary.com/documentation
- **Project Issues:** Check SUPABASE_SETUP.md and QUICK_REFERENCE.md

---

**Current Status:** Ready for production deployment once environment is configured.

**Next Action:** Complete Steps 1-6 above, then proceed to Phase D!
