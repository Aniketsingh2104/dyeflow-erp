@echo off
cd C:\dyeflow-react
git add middleware.ts
git commit -m "fix: middleware.ts must export a function not empty object - Turbopack build error"
git push origin main
echo.
echo Pushed! This should be the final build fix.
pause
