@echo off
cd /d C:\dyeflow-react
echo Fixing confirmed check (snake_case vs camelCase)...
node fix-confirmed-check.js
echo.
echo Fixing inbox filter...
node fix-inbox-filter.js
echo.
echo Fixing split modal...
node fix-split-modal.js
echo.
echo Fixing route assignment APIs...
node fix-route-assignment.js
echo.
echo Fixing supervisor inbox...
node fix-supervisor.js
echo.
echo Fixing orders save...
node fix-orders.js
echo.
git add "app/supervisor/[name]/RouteAssignment.tsx"
git add "app/supervisor/[name]/page.tsx"
git add app/orders/page.tsx
git add app/api/orders/route.ts
git add app/api/sheet-rows/route.ts
git commit -m "fix: RouteAssignment shows readonly confirmed view for orders with supervisor_confirmed=true; was checking camelCase supervisorConfirmed but Supabase returns snake_case supervisor_confirmed; also map processRoute and supervisorConfirmed in loadData"
git push origin main
echo.
echo Done! DYE26-0004 will now show confirmed route and machine, not the entry form.
pause
