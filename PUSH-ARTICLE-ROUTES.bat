@echo off
cd C:\dyeflow-react
git add app/api/article-routes/route.ts
git add app/setup/process-route-master/page.tsx
git commit -m "feat: migrate article process routes from settings blob to dedicated article_process_routes table; new /api/article-routes CRUD endpoint; process-route-master page now reads/writes Supabase table directly; JSON import/export supported"
git push origin main
echo.
echo Done! Live in ~60 seconds.
pause
