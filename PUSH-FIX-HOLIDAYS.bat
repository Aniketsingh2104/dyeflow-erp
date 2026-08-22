@echo off
cd C:\dyeflow-react
git add app/api/setup/holidays/route.ts
git commit -m "fix: holidays API - add missing columns (type, machine_id, reason) already added to table via Supabase; fix API to not send machine_id for global holidays; add name field; select all new columns in GET"
git push origin main
echo.
echo Done! Holiday master will work now.
pause
