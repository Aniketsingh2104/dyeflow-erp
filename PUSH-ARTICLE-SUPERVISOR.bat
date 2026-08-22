@echo off
cd C:\dyeflow-react
git add app/api/article-supervisor-map/route.ts
git add app/setup/article-master/page.tsx
git commit -m "feat: migrate article-supervisor map from settings blob to article_supervisor_map table (4180 mappings); new /api/article-supervisor-map CRUD; article-master page reads/writes Supabase table with filter by supervisor, bulk import, export JSON"
git push origin main
echo.
echo Done! Live in ~60 seconds.
pause
