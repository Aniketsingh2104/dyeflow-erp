# DyeFlow — Live Backend Setup Guide
# Supabase (Mumbai) + Vercel

## DONE ALREADY (by Claude)
- [x] Supabase project created: gsaupqjmuqbogvezvhci (Mumbai)
- [x] Database tables created: dyeflow_db, dyeflow_users, dyeflow_audit
- [x] app/api/db/route.ts  — now reads/writes Supabase instead of local file
- [x] app/api/auth/route.ts — new login API
- [x] app/login/page.tsx   — login screen
- [x] components/DbProvider.tsx — updated with auth check
- [x] .env.local — Supabase keys added

---

## STEP 1 — Install Supabase package (run once)

Open PowerShell in C:\dyeflow-react and run:

    npm install @supabase/supabase-js

---

## STEP 2 — Migrate your existing data to Supabase

Start the dev server:

    npm run dev

Then open: http://localhost:6060/migrate
Click "Migrate to Server" — this pushes your localStorage data to Supabase.

---

## STEP 3 — Test login

Open: http://localhost:6060/login
Login with:  admin / dyeflow123

Change the admin password after first login (see Step 5).

---

## STEP 4 — Deploy to Vercel (free, 5 minutes)

1. Push your code to GitHub:
   - Create a repo at github.com (if not already)
   - git init / git add . / git commit -m "add supabase backend"
   - git push

2. Go to vercel.com → New Project → Import your GitHub repo

3. Add Environment Variables in Vercel dashboard:
   SUPABASE_URL        = https://gsaupqjmuqbogvezvhci.supabase.co
   SUPABASE_SERVICE_KEY = (your service role key)
   GROQ_API_KEY        = (your groq key)

4. Deploy — Vercel gives you a URL like: https://dyeflow-erp.vercel.app

---

## STEP 5 — Add users for your 150 factory staff

Go to Supabase dashboard → Table Editor → dyeflow_users
Add rows for each user:
  username  | password      | full_name        | role
  ----------|---------------|------------------|----------
  admin     | (change this) | Admin            | admin
  sup_ravi  | ravi123       | Ravi Supervisor  | supervisor
  op_mohan  | mohan123      | Mohan Operator   | operator

Roles:
  admin      — full access, can manage users
  supervisor — can approve, assign orders
  operator   — can update batch status (FMS pages)
  viewer     — read only

---

## STEP 6 — Change admin password

In Supabase → Table Editor → dyeflow_users → find admin row → edit password field.

---

## HOW DATA FLOWS NOW

  Factory tablet / phone
       |
       v
  https://dyeflow-erp.vercel.app  (Next.js on Vercel)
       |
       v
  /api/db  →  Supabase Postgres (Mumbai)
               dyeflow_db table
               (data column = your full JSON)
       |
       v  (poll every 5 seconds — all devices stay in sync)
  Other devices auto-update

---

## COSTS

  Supabase Free:  500 MB storage, 50,000 requests/day  →  FREE
  Vercel Free:    100 GB bandwidth/month               →  FREE
  Total:          ₹0/month for 100-150 users

---

## BACKUP

Supabase auto-backups daily on free tier (7 day retention).
Manual backup: Supabase dashboard → Storage → Backups

Or export anytime:
  SELECT data FROM dyeflow_db WHERE id = 'main';
