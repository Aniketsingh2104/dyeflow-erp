@echo off
cd /d C:\dyeflow-react
echo Adding supervisor_confirmed to orders API select...
node fix-orders-select.js
echo.
git add app/api/orders/route.ts
git commit -m "fix: add supervisor_confirmed and supervisor_confirmed_at to orders GET select - was missing from select string so frontend never received it, causing RouteAssignment to always show entry form even for confirmed orders"
git push origin main
echo.
echo Done! Wait 60s then hard refresh (Ctrl+Shift+R) the supervisor inbox.
pause
