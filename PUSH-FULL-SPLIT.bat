@echo off
cd /d C:\dyeflow-react
echo Building Full Split feature...
node fix-full-split.js
echo.
git add app/api/batches/route.ts
git add app/orders/page.tsx
git commit -m "feat: Full Split button - one click creates single batch with full order qty; Fully Splitted badge when all qty allocated; doFullSplit calls /api/batches full_split action which creates 1 batch + batch_processes instantly"
git push origin main
echo.
echo Done! Wait 60s then refresh Orders page.
pause
