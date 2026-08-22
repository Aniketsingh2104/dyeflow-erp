@echo off
cd C:\dyeflow-react
git add app/setup/article-master/page.tsx
git add app/setup/process-route-master/page.tsx
git add app/setup/customer-master/page.tsx
git commit -m "fix: remove page blink on edit/delete - replace await load() with optimistic state updates on all 3 master pages; toast notifications replace full reload; background silent sync after save"
git push origin main
echo.
echo Done! No more blink on save/delete.
pause
