@echo off
cd C:\dyeflow-react
git add lib/db.ts
git commit -m "fix: complete lib/db.ts stub - add all missing exports (bulkUpdateOrders, createSplits, markProcessDone, getCurrentUser, getCustomers, getProcessList, getOrders with opts, getBatches) so all legacy pages compile and proxy to Supabase API routes"
git push origin main
echo.
echo Pushed! Build should pass now. Watch https://vercel.com/aniket-s-projects11/dyeflow-erp-gzeh
pause
