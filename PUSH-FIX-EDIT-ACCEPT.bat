@echo off
cd C:\dyeflow-react
git add app/pending-approvals/page.tsx
git commit -m "fix: pending approvals edit requests - 3 bugs fixed:
1. updateSheetRow was using row.sheet_id (undefined on client rows) - now uses item.sheet.id
2. acceptEdit set approvalStatus='approved' - now sets 'edit-accepted' so sheet shows green
3. Single global saving state - now per-card (Record<rowId, bool>) so multiple cards work independently
Also: cleaner diff table layout, empty state message improved, card dims during save"
git push origin main
echo.
echo Done! Accept/Reject now works correctly and disappears from list.
pause
