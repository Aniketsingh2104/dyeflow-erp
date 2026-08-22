@echo off
cd /d C:\dyeflow-react
echo Fixing confirmed check order...
node fix-confirmed-check.js
echo.
git add "app/supervisor/[name]/RouteAssignment.tsx"
git add "app/supervisor/[name]/page.tsx"
git commit -m "fix: RouteAssignment isConfirmed check moved to TOP of render before db loads; orders with supervisor_confirmed=true now immediately show readonly green confirmed view instead of entry form; checks both snake_case and camelCase field names"
git push origin main
echo.
echo Done!
pause
