@echo off
cd /d C:\dyeflow-react
echo Adding mtr,taka to batches GET select...
node fix-batches-select.js
echo.
git add app/api/batches/route.ts
git commit -m "fix: add mtr and taka to batches GET select string - was missing so API never returned them even though columns exist in DB"
git push origin main
echo.
echo Done! Wait 60s then refresh Splitted Orders.
pause
