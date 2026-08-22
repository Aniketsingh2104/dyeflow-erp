@echo off
cd C:\dyeflow-react
git add lib/db.ts
git commit -m "fix: restore lib/db.ts as compatibility stub - was deleted in cleanup causing build failures; re-exports supabase helpers + async wrappers around API routes so existing page imports compile without modification"
git push origin main
echo.
echo Fix pushed! Build should succeed in ~60 seconds.
pause
