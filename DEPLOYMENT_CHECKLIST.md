# 🚀 Production Deployment Checklist

## Current Status: Phase C Complete ✅
**Database migrations ready. Now deploying to production.**

---

## ☑️ Step-by-Step Checklist

### 1. Create Supabase Project (5 minutes)

- [ ] Go to https://app.supabase.com
- [ ] Click "New Project"
- [ ] Enter:
  - Name: `salesflow-pro` or your choice
  - Password: **(Write this down securely!)**
  - Region: `eu-west-2` (London - closest to Nigeria)
- [ ] Click "Create new project"
- [ ] **Wait for provisioning (~2 minutes)**

### 2. Get Supabase Credentials (2 minutes)

- [ ] Go to **Settings** → **API** in dashboard
- [ ] Copy **Project URL** → Paste in `.env.local`
- [ ] Copy **anon public** key → Paste in `.env.local`
- [ ] Copy **service_role** key → Paste in `.env.local`
- [ ] Go to **Settings** → **General**
- [ ] Copy **Reference ID** (for linking)

### 3. Update `.env.local` (1 minute)

```env
VITE_SUPABASE_URL=https://[YOUR-PROJECT-REF].supabase.co
VITE_SUPABASE_ANON_KEY=[YOUR-ANON-KEY]
SUPABASE_SERVICE_ROLE_KEY=[YOUR-SERVICE-ROLE-KEY]

# Cloudinary (can add later for Phase F)
VITE_CLOUDINARY_CLOUD_NAME=
VITE_CLOUDINARY_UPLOAD_PRESET=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
```

### 4. Install Dependencies (5 minutes)

```bash
npm install
```

If it fails or times out:
```bash
npm install --legacy-peer-deps
```

### 5. Link to Supabase Project (1 minute)

```bash
npx supabase link --project-ref [YOUR-REFERENCE-ID]
```

When prompted, enter your database password from Step 1.

### 6. Apply Migrations to Production (2 minutes)

```bash
npm run db:push
```

Expected output:
```
✓ Applying migration 20260114120000_create_initial_schema.sql
✓ Applying migration 20260114140000_create_products_and_inventory.sql
✓ Applying migration 20260114150000_create_customers_and_sales.sql
✓ Applying migration 20260114160000_create_financial_workflows.sql
✓ Applying migration 20260114170000_create_operations_tables.sql
✓ Applying migration 20260114180000_create_system_tables.sql
✓ Applying migration 20260114190000_enable_rls_and_policies.sql
✓ Applying migration 20260114200000_create_business_logic_triggers.sql
Finished supabase db push.
```

### 7. Generate TypeScript Types (30 seconds)

```bash
npm run db:types
```

This updates `src/types/database.types.ts` with your schema.

### 8. Verify in Dashboard (2 minutes)

- [ ] Go to Supabase Dashboard → **Table Editor**
- [ ] Verify these tables exist:
  - tenants
  - branches
  - users
  - products
  - sales
  - customers
  - payments
  - inventory_records
  - *(...13 more tables)*

- [ ] Go to **Database** → **Policies**
- [ ] Should see 60+ policies listed

- [ ] Go to **Database** → **Functions**
- [ ] Should see functions like `get_user_tenant_id`, `get_customer_balance`

### 9. Test Database Connection (1 minute)

In Dashboard → **SQL Editor**, run:

```sql
SELECT COUNT(*) as table_count
FROM information_schema.tables 
WHERE table_schema = 'public';
```

Should return: `21` (our 21 tables)

```sql
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public'
LIMIT 5;
```

All should show `rowsecurity = t` (true).

### 10. Start Development Server (1 minute)

```bash
npm run dev
```

Visit: http://localhost:5173

Application should load (even if login doesn't work yet - that's Phase D).

---

## ✅ Success Criteria

You're ready for Phase D when:

- [x] Supabase project created
- [x] All 7 migrations applied successfully
- [x] 21 tables visible in dashboard
- [x] RLS enabled on all tables
- [x] TypeScript types generated
- [x] No errors in terminal or dashboard
- [x] Development server runs

---

## 🆘 Quick Fixes

### "npm install" times out
```bash
npm install --legacy-peer-deps
```

### "supabase link" fails
```bash
# Install CLI globally
npm install -g supabase
supabase link --project-ref [REF]
```

### "db:push" command not found
```bash
# Run directly
npx supabase db push
```

### Migrations fail partway
1. Check error message in terminal
2. Go to Supabase Dashboard → **SQL Editor**
3. Run: `SELECT * FROM supabase_migrations.schema_migrations;`
4. This shows which migrations succeeded
5. Fix the error in the failing migration file
6. Run `npm run db:push` again

### Cannot connect to database
- Verify `.env.local` has correct URL
- Check Supabase project is active (not paused)
- Check internet connection

---

## 📞 Need Help?

**Issue with Supabase:**
- Check https://status.supabase.com
- Visit https://discord.supabase.com

**Issue with migrations:**
- Review error in terminal
- Check SQL syntax in migration file
- Ask in Supabase Discord #help channel

**Issue with npm:**
- Clear cache: `npm cache clean --force`
- Delete `node_modules` and reinstall
- Try `yarn` instead

---

## 🎯 After Completing This Checklist

**Type:** `phase D` or `continue`

I'll start **Phase D: Authentication Integration** which will:
- Replace mock authentication with Supabase Auth
- Integrate signup/login flows
- Handle password reset
- Link user profiles to auth.users
- Test authentication end-to-end

---

**Estimated time to complete checklist: 15-20 minutes**

Good luck! 🚀
