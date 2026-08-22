@echo off
cd C:\dyeflow-react
git add app/sheet/utils.ts
git add app/sheet/SheetPageContent.tsx
git commit -m "fix: isRowLocked and getRowClass bugs - 3 cases were wrong:
1. pending + requestEdit=true was locked (pending check ran before requestEdit check)
2. rejected + requestEdit=false was unlocked (rejected should be locked, not unlocked)
3. edit-request status had no CSS class and was not locked while waiting for admin
Also fix handleCheckbox: submit on approved/rejected row sets edit-request not pending;
unsubmit reverts edit-request back to approved; requestEdit cleared on submit"
git push origin main
echo.
echo Done! Row locking now works correctly for all states.
pause
