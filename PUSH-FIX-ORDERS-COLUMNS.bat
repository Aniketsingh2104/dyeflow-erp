@echo off
cd C:\dyeflow-react
git add app/api/orders/route.ts
git add app/pending-approvals/page.tsx
git add app/orders/page.tsx
git commit -m "fix: orders GET now selects all new columns (sub_party, sales_person, width, gsm, lab_no, lot_no, qty_mtr, no_of_taka, type_of_finish, type_of_packing, delivery_date); pending approvals creates order via direct API not lib/db; orders page already has all columns in COLUMNS definition"
git push origin main
echo.
echo Done! All fields will show in orders page now.
pause
