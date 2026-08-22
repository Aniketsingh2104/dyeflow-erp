@echo off
cd /d C:\dyeflow-react
git add app/splitted-orders/page.tsx
git commit -m "fix: splitted orders - add per-column filter row above headers (same as orders page); mtr/taka now show correctly (backfilled in Supabase); clear filters button; filter count in header"
git push origin main
echo.
echo Done! Wait 60s then refresh.
pause
