@echo off
cd C:\dyeflow-react
git add lib/db.ts
git commit -m "fix: add markBatchFaulty and fix getBatches to accept options object {status, limit} - final missing exports causing build failure"
git push origin main
echo.
echo Pushed! Build should pass now.
pause
