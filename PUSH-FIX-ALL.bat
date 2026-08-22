@echo off
cd C:\dyeflow-react

git add lib/db.ts
git add app/api/route-templates/route.ts
git add app/api/article-routes/route.ts
git add app/setup/process-route-master/page.tsx

git commit -m "fix: restore lib/db.ts stub to fix build (Module not found crash); ensure route-templates + article-routes API and updated process-route-master page are all included in same build"

git push origin main

echo.
echo Pushed! Build should pass in ~60s. Check https://vercel.com/aniket-s-projects11/dyeflow-erp-gzeh
pause
