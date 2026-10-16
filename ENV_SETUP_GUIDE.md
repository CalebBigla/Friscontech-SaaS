# 🔐 Environment Configuration Guide

## 📋 Quick Setup

You need to fill in **2 values** in both `.env` and `.env.local` files:

1. **VITE_SUPABASE_URL** - Your Supabase project URL
2. **VITE_SUPABASE_ANON_KEY** - Your public API key

---

## 🔍 Where to Find These Values

### Step-by-Step:

1. **Go to Supabase Dashboard**
   - Visit: https://supabase.com/dashboard
   - Select your project (the one where you deployed the migrations)

2. **Navigate to API Settings**
   - Click **Settings** (gear icon in left sidebar)
   - Click **API** from the submenu

3. **Copy the Values**

   **Project URL:**
   ```
   Look for: "Project URL"
   Format: https://xxxxxxxxxxxxx.supabase.co
   Copy to: VITE_SUPABASE_URL=
   ```

   **Anon/Public Key:**
   ```
   Look for: "Project API keys" section
   Find: "anon" "public" key (long string starting with "eyJ...")
   Copy to: VITE_SUPABASE_ANON_KEY=
   ```

---

## 📝 Example (with fake values)

### Your `.env` file should look like:

```env
VITE_SUPABASE_URL=https://abcdefghijklmno.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiY2RlZmdoaWprbG1ubyIsInJvbGUiOiJhbm9uIiwiaWF0IjoxNjc4ODg4ODg4LCJleHAiOjE5OTQ0NjQ4ODh9.abcdefghijklmnopqrstuvwxyz1234567890
```

### Your `.env.local` file should have the **same values**

---

## ⚠️ Important Notes

### Security
- ✅ **VITE_SUPABASE_ANON_KEY is SAFE** for client-side use
  - It's protected by Row Level Security (RLS) policies
  - Users can only access data they're authorized to see
  
- ❌ **NEVER share SERVICE_ROLE_KEY**
  - This bypasses all RLS policies
  - Only use server-side for admin operations
  - We don't need it yet (Phase F)

### Files
- **`.env`** - Production/live deployment configuration
- **`.env.local`** - Local development (use same values for now)
- Both are in `.gitignore` and won't be committed to git

### Verification
After filling in the values, you can verify they're loaded by:
```bash
npm run dev
```
If you see Supabase connection errors, check that the values are correct.

---

## 🧪 Testing Your Configuration

Once you've filled in the values:

1. **Restart dev server** (if running):
   ```bash
   # Stop with Ctrl+C, then:
   npm run dev
   ```

2. **Visit the app**:
   ```
   http://localhost:3000/login
   ```

3. **Try to sign in** (or create owner account):
   - If it works → Configuration is correct! ✅
   - If you get errors → Double-check the values

---

## 🔧 Common Issues

### "Invalid API key"
- You copied the wrong key
- Try copying the `anon` key again (not `service_role`)

### "Failed to fetch"
- URL is incorrect
- Make sure URL includes `https://`
- URL should end with `.supabase.co`

### "Network error"
- Supabase project might be paused
- Check dashboard: Project → Settings → General
- Click "Resume" if paused

### Variables not loading
- File named `.env` (not `.env.txt` or `.env.example`)
- No spaces around `=` sign
- Restart dev server after changes

---

## ✅ Checklist

Before proceeding to Phase E:

- [ ] Opened Supabase Dashboard
- [ ] Navigated to Settings → API
- [ ] Copied Project URL to `.env` file
- [ ] Copied anon/public key to `.env` file
- [ ] Copied same values to `.env.local`
- [ ] Saved both files
- [ ] No extra spaces or quotes around values
- [ ] Ready to test!

---

## 🚀 Next Steps

After filling in the values:

1. **Tell me "done"** or **"configured"**
2. I'll verify the files are correct
3. We'll test the connection
4. Then continue with Phase E (service migration)

---

## 💡 Need Help?

If you're having trouble finding these values:
- Take a screenshot of your Supabase dashboard
- Let me know what error you're seeing
- I can guide you through it step by step
