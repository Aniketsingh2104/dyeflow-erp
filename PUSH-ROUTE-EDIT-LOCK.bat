@echo off
cd /d C:\dyeflow-react
git add "app/supervisor/[name]/RouteAssignment.tsx"
git commit -m "feat: RouteAssignment edit lock - confirmed orders show Edit button only if all batches are pending; locked with reason if any batch is in-process or done; edit mode shows cancel button and Update label"
git push origin main
echo.
echo Done! Wait 60s then hard refresh.
pause
