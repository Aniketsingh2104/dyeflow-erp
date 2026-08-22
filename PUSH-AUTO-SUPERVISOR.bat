@echo off
cd C:\dyeflow-react
git add app/api/orders/route.ts
git add app/api/sheet-rows/route.ts
git commit -m "fix: two fixes in one push:
1. orders/create - auto-assign supervisor from article_supervisor_map on every new order; article_supervisor_map.supervisor stores name so we resolve to UUID via supervisors table; sets status=assigned automatically if supervisor found
2. sheet-rows/upsert_row - use dbUpdate(PATCH by id) for existing rows instead of sb() POST with merge-duplicates; the Prefer header was conflicting with sb() default causing silent save failures on Accept/Reject"
git push origin main
echo.
echo Done! Supervisors will now auto-assign on new orders.
pause
