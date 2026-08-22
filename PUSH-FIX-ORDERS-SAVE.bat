@echo off
cd /d C:\dyeflow-react
node fix-orders.js
git add app/orders/page.tsx app/api/orders/route.ts app/api/sheet-rows/route.ts
git commit -m "fix: orders saveOrder strips join objects before update; Re-assign button always visible; auto-assign supervisor on create; sheet-rows upsert uses PATCH by id"
git push origin main
echo.
echo Done!
pause
