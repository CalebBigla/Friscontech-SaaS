# Phase H: Production Deployment Guide

## Overview
Deploy SalesFlow Pro to production with Vercel + Supabase.

## Prerequisites
- ✅ Supabase project created: `kdbgeprzntwojdvtghoh`
- ✅ Database migrations applied (all 8 files)
- ✅ Supabase Auth configured
- ⏳ Component migration (in progress)
- ⏳ Environment variables configured

## Deployment Stack

### Frontend: Vercel
- **Why**: Free tier, automatic deployments, edge network
- **Features**: CI/CD from GitHub, preview deployments, custom domains

### Backend: Supabase (Already Set Up)
- **Database**: PostgreSQL with RLS
- **Auth**: Built-in authentication
- **Storage**: For Cloudinary alternative (optional)
- **Edge Functions**: For serverless logic (optional)

## Step 1: Prepare for Deployment

### 1.1 Environment Variables

Create `.env.production`:
```bash
# Supabase (Production)
VITE_SUPABASE_URL=https://kdbgeprzntwojdvtghoh.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key_here

# Cloudinary (Optional - if implemented)
VITE_CLOUDINARY_CLOUD_NAME=
VITE_CLOUDINARY_UPLOAD_PRESET=
```

### 1.2 Build Configuration

Verify `package.json`:
```json
{
  "scripts": {
    "dev": "vinxi dev",
    "build": "vinxi build",
    "start": "vinxi start"
  }
}
```

### 1.3 Test Production Build Locally

```bash
npm run build
npm run start
```

Visit `http://localhost:3000` and test:
- ✓ Login/signup works
- ✓ Dashboard loads
- ✓ Products page works
- ✓ Sales recording works

## Step 2: Deploy to Vercel

### 2.1 Install Vercel CLI (Optional)
```bash
npm install -g vercel
```

### 2.2 Deploy via GitHub (Recommended)

1. **Push to GitHub**
   ```bash
   git add -A
   git commit -m "Ready for production deployment"
   git push origin master
   ```

2. **Connect to Vercel**
   - Go to https://vercel.com
   - Click "Import Project"
   - Select your GitHub repository
   - Vercel auto-detects TanStack Start

3. **Configure Build Settings**
   - **Framework Preset**: Vite
   - **Build Command**: `npm run build`
   - **Output Directory**: `.output/public`
   - **Install Command**: `npm install`

4. **Add Environment Variables**
   In Vercel dashboard:
   - Go to Project Settings → Environment Variables
   - Add all variables from `.env`:
     ```
     VITE_SUPABASE_URL
     VITE_SUPABASE_ANON_KEY
     ```

5. **Deploy**
   - Click "Deploy"
   - Wait 2-3 minutes
   - Get production URL: `https://your-project.vercel.app`

### 2.3 Deploy via CLI (Alternative)

```bash
vercel

# Follow prompts:
# Set up and deploy? Yes
# Which scope? Your account
# Link to existing project? No
# Project name? salesflow-pro
# Directory? ./
# Override settings? No

# Deploy to production
vercel --prod
```

## Step 3: Configure Custom Domain (Optional)

1. **Buy domain** (e.g., Namecheap, Google Domains)
2. **Add to Vercel**:
   - Project Settings → Domains
   - Add domain: `yourdomain.com`
3. **Update DNS records**:
   ```
   Type: A
   Name: @
   Value: 76.76.21.21

   Type: CNAME  
   Name: www
   Value: cname.vercel-dns.com
   ```
4. **Wait for DNS propagation** (5-30 minutes)

## Step 4: Post-Deployment Checks

### 4.1 Test Production App

Visit your Vercel URL and test:

**Authentication Flow**
- [ ] Sign up new account
- [ ] Receive confirmation email (if enabled)
- [ ] Login works
- [ ] Logout works
- [ ] Password reset works

**Core Features**
- [ ] Owner dashboard loads
- [ ] Create branch works
- [ ] Add product works
- [ ] Add team member works
- [ ] Record sale works
- [ ] View reports works

**RBAC**
- [ ] Owner sees all features
- [ ] Manager sees branch-scoped data
- [ ] Sales rep sees limited view
- [ ] URLs are protected (no unauthorized access)

### 4.2 Monitor Logs

**Vercel Logs**
- Dashboard → Deployments → Latest → Logs
- Check for errors or warnings

**Supabase Logs**
- Dashboard → Logs → Query Performance
- Monitor slow queries
- Check auth events

### 4.3 Performance Check

Use Lighthouse or PageSpeed Insights:
- Performance score > 80
- First Contentful Paint < 2s
- Time to Interactive < 3.5s

## Step 5: Database Seeding (Optional)

If you want demo data for testing:

1. **Create seed script** `scripts/seed-production.ts`
2. **Run once manually**:
   ```bash
   npm run seed:production
   ```

**Important**: Don't seed automatically on every deploy!

## Step 6: Continuous Deployment

### Automatic Deployments

Vercel automatically deploys on:
- **Push to `master`** → Production deployment
- **Push to other branches** → Preview deployment
- **Pull requests** → Preview deployment with unique URL

### Deployment Workflow

```
1. Make changes locally
2. Test locally (npm run dev)
3. Commit to feature branch
4. Push to GitHub
5. Vercel creates preview deployment
6. Test preview deployment
7. Merge to master
8. Automatic production deployment
```

## Step 7: Environment-Specific Config

### Development
```bash
# .env.local
VITE_SUPABASE_URL=https://kdbgeprzntwojdvtghoh.supabase.co
```

### Staging (Optional)
Create separate Supabase project:
```bash
# .env.staging
VITE_SUPABASE_URL=https://staging-project.supabase.co
```

### Production
```bash
# Vercel Environment Variables
VITE_SUPABASE_URL=https://kdbgeprzntwojdvtghoh.supabase.co
```

## Troubleshooting

### Build Fails
**Error**: "Cannot find module X"
- **Fix**: Check imports, verify dependencies in package.json

**Error**: "Environment variable not defined"
- **Fix**: Add missing env vars in Vercel dashboard

### App Doesn't Load
**Blank screen**
- Check browser console for errors
- Verify Supabase URL and anon key
- Check Vercel deployment logs

**404 errors**
- Verify build output directory
- Check routing configuration

### Database Connection Fails
**CORS errors**
- Add Vercel domain to Supabase allowed origins
- Supabase Dashboard → Authentication → URL Configuration

**RLS Policy errors**
- Check policies in Supabase
- Verify user authentication state

## Security Checklist

- [ ] Environment variables are secret (not in git)
- [ ] Supabase RLS policies enabled on all tables
- [ ] CORS configured correctly
- [ ] API keys are not exposed in client code
- [ ] Auth required for protected routes
- [ ] Tenant isolation working (users can't see other tenants)

## Monitoring & Maintenance

### Uptime Monitoring
- Use Vercel Analytics (built-in)
- Or UptimeRobot (free, 5-minute checks)

### Error Tracking
- Sentry.io (free tier: 5K events/month)
- Or Vercel Monitoring (paid)

### Database Backups
- Supabase automatic backups (Pro plan)
- Or manual exports weekly

## Cost Estimate (Monthly)

### Free Tier
- **Vercel**: Free (hobby plan)
- **Supabase**: Free (up to 500MB database, 2GB bandwidth)
- **Cloudinary**: Free (25GB storage, 25GB bandwidth)
- **Total**: $0/month ✨

### After Growth
- **Vercel Pro**: $20/month (team features, more bandwidth)
- **Supabase Pro**: $25/month (8GB database, dedicated resources)
- **Cloudinary Pro**: $89/month (149GB storage)
- **Total**: ~$134/month

## Next Steps After Deployment

1. **Monitor for 24 hours** - Watch logs, fix issues
2. **User testing** - Have real users test the app
3. **Performance optimization** - Fix slow queries
4. **Feature additions** - Cloudinary, reports, etc.
5. **Marketing** - Launch, get users!

## Emergency Rollback

If production breaks:

```bash
# Via Vercel Dashboard
1. Go to Deployments
2. Find last working deployment
3. Click "..." → "Promote to Production"

# Via CLI
vercel rollback
```

## Support Resources

- **Vercel Docs**: https://vercel.com/docs
- **Supabase Docs**: https://supabase.com/docs
- **TanStack Start**: https://tanstack.com/router/latest/docs/framework/react/start/overview

---

## Quick Deploy Checklist

- [ ] All environment variables added to Vercel
- [ ] Production build tested locally
- [ ] Database migrations applied
- [ ] GitHub repository connected to Vercel
- [ ] First deployment successful
- [ ] Production URL tested
- [ ] Auth flow works
- [ ] Core features work
- [ ] Custom domain configured (optional)
- [ ] Monitoring set up

**Ready to deploy?** Push to GitHub and watch Vercel magic! 🚀
