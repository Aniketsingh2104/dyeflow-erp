# DyeFlow ERP — Live Deployment Guide
# Vercel (hosting) + Supabase (database) + Groq (all AI features)

# ════════════════════════════════════════════════════════
# WHAT AI FEATURES WORK ON VERCEL
# ════════════════════════════════════════════════════════
#
# ALL AI features use /api/ai → Groq (llama-3.3-70b-versatile, FREE)
#
# ✅ Dashboard AI Insights        → /api/ai (Groq)
# ✅ AI Assistant — Chat          → /api/ai (Groq)
# ✅ AI Assistant — Daily Briefing → /api/ai (Groq)
# ✅ AI Assistant — Smart Assign   → /api/ai (Groq)
# ✅ AI Assistant — Faulty Analyzer → /api/ai (Groq)
# ✅ AI Assistant — Delay Predictor → /api/ai (Groq)
# ✅ AI Assistant — Actions Agent  → /api/ai (Groq)
# ✅ AI Assistant — Weekly Report  → /api/ai (Groq)
# ✅ AI Assistant — Customer Reply → /api/ai (Groq)
# ✅ AI Assistant — Scheduler      → /api/ai (Groq)
# ✅ AI Assistant — Cost Estimator → /api/ai (Groq)
# ✅ Report Agent                  → /api/ai (Groq)
#
# All 12 AI features work — just add GROQ_API_KEY to Vercel.

# ════════════════════════════════════════════════════════
# STEP 1 — Push code to GitHub (5 min)
# ════════════════════════════════════════════════════════

Open PowerShell in C:\dyeflow-react and run:

    git init
    git add .
    git commit -m "DyeFlow ERP with Supabase backend"

Go to github.com → New repository → name: dyeflow-erp → Private → Create

Then run (replace YOUR_USERNAME):

    git remote add origin https://github.com/YOUR_USERNAME/dyeflow-erp.git
    git branch -M main
    git push -u origin main

# ════════════════════════════════════════════════════════
# STEP 2 — Deploy to Vercel (5 min)
# ════════════════════════════════════════════════════════

1. Go to vercel.com → Sign up free (use GitHub account)
2. Click "Add New Project"
3. Click "Import" next to your dyeflow-erp repository
4. Framework Preset: Next.js (auto-detected)
5. Root Directory: ./ (leave as is)
6. Click "Deploy" — first deploy takes ~2 min

Your app will be live at: https://dyeflow-erp.vercel.app

# ════════════════════════════════════════════════════════
# STEP 3 — Add Environment Variables in Vercel (3 min)
# ════════════════════════════════════════════════════════

Go to: Vercel Dashboard → dyeflow-erp project → Settings → Environment Variables

Add these (copy from VERCEL-ENV-VARS.txt):

  Name                  Value
  ─────────────────────────────────────────────────────
  SUPABASE_URL          https://gsaupqjmuqbogvezvhci.supabase.co
  SUPABASE_SERVICE_KEY  eyJhbGci... (your service role key)
  SUPABASE_ANON_KEY     eyJhbGci... (your anon key)
  GROQ_API_KEY          gsk_... (your Groq key)

For each variable:
  - Set Environment: ✅ Production ✅ Preview ✅ Development
  - Click Save

After adding all 4 variables → click "Redeploy" (top right)

# ════════════════════════════════════════════════════════
# STEP 4 — Migrate your factory data (2 min)
# ════════════════════════════════════════════════════════

Open your live Vercel URL in the browser where you already have your factory data:

    https://dyeflow-erp.vercel.app/migrate

Click "Migrate to Server" — pushes localStorage data to Supabase.

# ════════════════════════════════════════════════════════
# STEP 5 — Share with your 150 users
# ════════════════════════════════════════════════════════

Send this URL to everyone:
    https://dyeflow-erp.vercel.app

Default login: admin / dyeflow123
Change password after first login in Supabase → Table Editor → dyeflow_users

Add users in Supabase → Table Editor → dyeflow_users:
  username  | password    | full_name         | role
  ──────────┼─────────────┼───────────────────┼──────────
  admin     | changeme!   | Admin             | admin
  ravi_sup  | ravi123     | Ravi Supervisor   | supervisor
  mohan_op  | mohan123    | Mohan Operator    | operator

Roles:
  admin      → full access to everything
  supervisor → assign orders, approve, FMS
  operator   → update batch status only (FMS pages)
  viewer     → read-only

# ════════════════════════════════════════════════════════
# COSTS (for 100-150 users)
# ════════════════════════════════════════════════════════

  Vercel Free tier:   100 GB bandwidth, unlimited deploys    → ₹0/month
  Supabase Free tier: 500 MB DB, 50,000 API requests/day    → ₹0/month
  Groq Free tier:     14,400 requests/day (AI features)     → ₹0/month

  TOTAL: ₹0/month

# ════════════════════════════════════════════════════════
# AUTO-DEPLOY ON CODE CHANGES
# ════════════════════════════════════════════════════════

Every time you push to GitHub, Vercel auto-deploys in ~90 seconds:

    git add .
    git commit -m "fix: whatever you changed"
    git push

# ════════════════════════════════════════════════════════
# CUSTOM DOMAIN (optional, ₹600-800/year)
# ════════════════════════════════════════════════════════

1. Buy a domain (e.g. dyeflow.in) from GoDaddy/Namecheap
2. Vercel Dashboard → Project → Settings → Domains → Add
3. Add your domain, follow DNS setup instructions
4. Free HTTPS/SSL included automatically

# ════════════════════════════════════════════════════════
# TROUBLESHOOTING
# ════════════════════════════════════════════════════════

AI not working on Vercel:
  → Check GROQ_API_KEY is set correctly in Vercel env vars
  → Go to Vercel → Deployments → latest → Functions logs
  → Should see POST /api/ai 200

Database not connecting:
  → Check SUPABASE_URL and SUPABASE_SERVICE_KEY in Vercel env vars
  → Go to Vercel → Deployments → latest → Functions logs
  → Should see GET /api/db 200

Login not working:
  → Go to Supabase → Table Editor → dyeflow_users
  → Confirm user exists with is_active = true

Build failed:
  → Go to Vercel → Deployments → latest → Build Logs
  → Most common cause: TypeScript error — check the error and fix in code
