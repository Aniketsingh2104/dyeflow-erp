@echo off
cd C:\dyeflow-react
git add app/sheet/SheetPageContent.tsx
git add app/api/sheet-rows/route.ts
git commit -m "fix: sheet migration - was only migrating blob when table was completely empty; now also migrates when table has fewer rows than blob (partial migration case); preserves table rows that have latest edits, only fills in missing rows from blob"
git push origin main
echo.
echo Done! Open the CKU sheet and DYE26-0002 row will show requestEdit=true correctly.
pause
