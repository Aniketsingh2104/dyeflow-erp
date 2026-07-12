@echo off
cd C:\dyeflow-react

git add components/Navigation.tsx
git add app/import/page.tsx
git add app/migrate/page.tsx
git add lib/auditLog.ts
git add lib/dbContext.ts
git add lib/processMap.ts

git commit -m "feat: Phase 12 - localStorage fully removed; Navigation reads Supabase (machines/processes/supervisors/inbox); import page saves to Supabase; auditLog writes Supabase-only; processMap/dbContext localStorage fallbacks stripped; migrate page retired"

git push origin main

echo.
echo Done! Live in ~60 seconds at https://dyeflow-erp-gzeh.vercel.app
pause
