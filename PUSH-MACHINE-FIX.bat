@echo off
cd /d C:\dyeflow-react
echo Fixing machine links to use UUID...
node fix-machine-links.js
echo.
echo Fixing broken toggleFaulty in machine detail page...
node fix-machine-faulty.js
echo.
git add app/machines/page.tsx
git add "app/machines/[machineId]/page.tsx"
git commit -m "fix: machine list adds Open Sheet button using UUID not name-slug; machine detail page toggleFaulty dead code removed; loadData reads from Supabase"
git push origin main
echo.
echo Done! Wait 90s. Then use Open Sheet button from Machines page to navigate.
pause
