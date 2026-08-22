@echo off
cd C:\dyeflow-react
git add app/api/route-templates/route.ts
git add app/setup/process-route-master/page.tsx
git commit -m "feat: migrate 97 process route templates from settings blob to process_route_templates table; new /api/route-templates CRUD; process-route-master page reads/writes Supabase table directly"
git push origin main
echo.
echo Done! Live in ~60 seconds.
pause
