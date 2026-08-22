@echo off
cd C:\dyeflow-react
git add app/api/sheet-rows/route.ts
git add app/sheet/SheetPageContent.tsx
git commit -m "feat: migrate order sheet rows from JSONB blob to dedicated order_sheet_rows table; new /api/sheet-rows with upsert_row (per-cell saves), bulk_upsert, add_row, delete_row, update_approval; sheet viewer saves each row individually (debounced 600ms) instead of full blob rewrite; legacy blob auto-migrates on first open; pending approvals reads from new table"
git push origin main
echo.
echo Done! Sheet rows now save individually. 100+ orders/day supported.
pause
