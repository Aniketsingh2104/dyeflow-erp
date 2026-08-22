@echo off
cd C:\dyeflow-react
git add app/pending-approvals/page.tsx
git add app/api/orders/route.ts
git commit -m "fix: add missing columns to orders table (gsm, width, lab_no, lot_no, sub_party, sales_person, type_of_finish, type_of_packing, qty_mtr, no_of_taka, delivery_date) via Supabase migration; fix createOrder call to use direct API instead of lib/db; update orders GET select to include new columns"
git push origin main
echo.
echo Done! Approve will now work correctly.
pause
