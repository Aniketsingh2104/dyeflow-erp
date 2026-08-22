@echo off
cd C:\dyeflow-react
git add app/pending-approvals/page.tsx
git commit -m "feat: bulk approval in pending-approvals - checkbox per row, select-all header, approve selected batch creates all orders in sequence with progress bar, sheet filter chips, click row to toggle selection, single approve still available per row"
git push origin main
echo.
echo Done! Bulk approval live in ~60s.
pause
