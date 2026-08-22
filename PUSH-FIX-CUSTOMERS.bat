@echo off
cd C:\dyeflow-react

git add middleware.ts
git add app/api/customers/route.ts
git add app/setup/customer-master/page.tsx

git commit -m "fix: middleware.ts export function (build fix); create /api/customers route; rewrite customer-master to use /api/customers with bulk_upsert for Excel import; was broken because /api/masters was deleted in cleanup"

git push origin main
echo.
echo Done! Build should pass and customer Excel import will work.
pause
