@echo off
cd /d C:\dyeflow-react
echo Building dual machine + split machine picker...
node fix-dual-machine-split.js
echo.
git add "app/supervisor/[name]/RouteAssignment.tsx"
git add app/api/orders/route.ts
git add app/orders/page.tsx
git commit -m "feat: dual machine per process in RouteAssignment - supervisor can assign 2 machines per process (Machine 1 required, Machine 2 optional); process_machines saved as JSONB {processCode:[machineId1,machineId2]}; SplitModal shows machine dropdown per batch when 2 machines assigned; each batch gets its own machine_id at split time"
git push origin main
echo.
echo Done! Wait 60s then refresh.
pause
