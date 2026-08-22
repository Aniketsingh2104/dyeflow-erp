@echo off
cd C:\dyeflow-react
git add app/pending-approvals/page.tsx
git commit -m "fix: pending approvals - show only core order columns (party, sub-party, sales-person, article, blend, width, gsm, color, lab-no, lot-no, challan-no, qty-kg, qty-mtr, no-of-taka, type-of-finish, type-of-packing, remarks) + sheet, row, status, submitted-on; removed hold-reason, delivery-date, order-number, process, current-stage, rejection-reason"
git push origin main
echo.
echo Done!
pause
