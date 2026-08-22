@echo off
cd C:\dyeflow-react
git add app/pending-approvals/page.tsx
git commit -m "feat: pending approvals - two tabs: New Orders + Edit Requests
New Orders tab: same bulk select/approve flow, reads from order_sheet_rows table
Edit Requests tab: card per edit-request row showing inline diff (old->new per field), accept patches orders table with changed fields only, reject restores original values from edit_history back to sheet row; reject modal warns that original values will be restored"
git push origin main
echo.
echo Done! Edit Requests tab live in ~60s.
pause
