@echo off
cd C:\dyeflow-react
git add app/sheet/SheetPageContent.tsx
git commit -m "fix: sheet viewer - load from Supabase /api/order-sheets?id=X instead of localStorage; save rows back to Supabase via update_rows action; was showing 'Sheet not found' because sheet was in Supabase but viewer read from localStorage"
git push origin main
echo.
echo Done! Sheet viewer now loads from Supabase.
pause
