@echo off
cd C:\dyeflow-react
git add app/api/sheet-rows/route.ts
git commit -m "fix: upsert_row was using sb() POST with merge-duplicates but sb() default Prefer header conflicted - now uses dbUpdate(PATCH by id) for existing rows (has id) and POST for new rows (no id); this is why Accept/Reject in pending approvals was not persisting to Supabase"
git push origin main
echo.
echo Done! Accept and Reject will now correctly update Supabase and disappear from list.
pause
