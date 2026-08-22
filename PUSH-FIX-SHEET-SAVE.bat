@echo off
cd C:\dyeflow-react
git add app/sheet/SheetPageContent.tsx
git add app/sheet/utils.ts
git add app/api/sheet-rows/route.ts
git commit -m "fix: two critical sheet bugs:
1. Old data on re-open: toDB() was dropping the row id, so upsert couldnt match existing rows by PK - every save was a silent no-op. Fixed by including id in upsert payload.
2. Edit not showing in Pending Approvals: handleCheckbox still had old code setting pending for all submissions. Fixed: approved/rejected + requestEdit rows now set edit-request status. 
Also: track editHistory on cell blur; fix isRowLocked + getRowClass for all states in utils.ts"
git push origin main
echo.
echo Done! Sheet saves will now persist correctly.
pause
