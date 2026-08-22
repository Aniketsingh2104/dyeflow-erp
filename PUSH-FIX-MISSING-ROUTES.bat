@echo off
cd C:\dyeflow-react
git add app/api/shade-master/route.ts
git add app/setup/shade-master/page.tsx
git add app/api/colour-chemicals/route.ts
git add app/api/article-supervisor-map/route.ts
git add app/api/route-templates/route.ts
git add app/api/article-routes/route.ts
git add app/api/customers/route.ts
git commit -m "fix: add missing API routes to git - shade-master, colour-chemicals, article-supervisor-map, route-templates, article-routes, customers were never staged in previous pushes"
git push origin main
echo.
echo Done! All API routes now deployed.
pause
