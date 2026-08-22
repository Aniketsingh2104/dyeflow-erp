@echo off
cd /d C:\dyeflow-react
git add "app/supervisor/[name]/RouteAssignment.tsx"
git add "app/supervisor/[name]/page.tsx"
git status
git commit -m "fix: RouteAssignment clean rewrite - supervisor_confirmed check at top before db loads"
git push origin main
echo.
echo Done - refresh the supervisor inbox in 60 seconds
pause
