@echo off
cd C:\dyeflow-react
git add app/api/batches/route.ts
git commit -m "fix: add missing batch columns (fms_enter_at, fms_actual_dates, process_route) via migration; wrap batches route in try/catch for better error logging; fixes 500 on /api/batches"
git push origin main
echo.
echo Fix deployed! Live in ~30 seconds.
pause
