@echo off
cd /d C:\dyeflow-react
echo.
echo Step 1: Running fix script...
node fix-all-final.js
echo.
echo Step 2: Staging files...
git add app/api/batches/route.ts
git add "app/machines/[machineId]/page.tsx"
echo.
echo Step 3: Committing...
git commit -m "fix: plannedDate per-process via byProcessDates - SCQ shows no date when unnumbered; Dyeing shows its own date; batches API ?id= filter added; stale DB data cleared"
echo.
echo Step 4: Pushing...
git push origin main
echo.
echo ============================================
echo Done! Wait 90 seconds then refresh.
echo All plan numbers also cleared from Supabase.
echo Start numbering fresh - each process independent.
echo ============================================
pause
