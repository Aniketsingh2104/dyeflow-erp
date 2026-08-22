@echo off
cd C:\dyeflow-react
git add app/api/colour-chemicals/route.ts
git add app/setup/colour-chemical-master/page.tsx
git commit -m "feat: colour-chemical master - migrate 488 items from settings blob to colour_chemicals table; new /api/colour-chemicals CRUD with bulk_insert; page uses optimistic updates, no blink, saves directly to Supabase table"
git push origin main
echo.
echo Done! All 488 chemicals now in colour_chemicals table. New uploads go there too.
pause
