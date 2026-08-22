@echo off
cd C:\dyeflow-react
git add app/sheet/SheetPageContent.tsx
git commit -m "fix: sheet Submit for Approval checkbox now sets approvalStatus=pending + submittedOn timestamp; Request Edit checkbox initializes editHistory; extracted handleCheckbox() function; existing rows fixed in Supabase directly"
git push origin main
echo.
echo Done! Approval status will now update correctly.
pause
