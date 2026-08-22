@echo off
cd C:\dyeflow-react
git add app/api/shade-master/route.ts
git add app/setup/shade-master/page.tsx
git commit -m "feat: shade-master - migrate 2892 rules from settings.shadeRules to shade_master table; /api/shade-master CRUD; page uses Supabase table with optimistic updates, group filter chips, no blink"
git push origin main
echo.
echo Done! 2892 shade rules now in shade_master table.
pause
