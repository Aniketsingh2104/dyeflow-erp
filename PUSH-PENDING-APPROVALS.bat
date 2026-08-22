@echo off
cd C:\dyeflow-react
git add app/pending-approvals/page.tsx
git commit -m "feat: pending approvals - show all 25 columns matching sheet exactly (party, sub-party, sales-person, article, blend, width, gsm, color, lab-no, lot-no, challan-no, qty-kg, qty-mtr, no-of-taka, type-of-finish, type-of-packing, remarks, hold-reason, order-number, process, delivery-date, current-stage, approval-status, rejection-reason, submitted-on); sheet name sticky left, actions sticky right, approval status badge, toast on approve/reject"
git push origin main
echo.
echo Done! All fields visible in Pending Approvals.
pause
