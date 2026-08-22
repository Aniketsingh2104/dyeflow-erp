@echo off
cd /d C:\dyeflow-react
echo Force pushing latest files...
git add app/api/batches/route.ts
git add app/splitted-orders/page.tsx
git commit --allow-empty -m "force: cache bust - batches API has mtr,taka in select; delete_batch implemented; splitted orders page complete rewrite with filters"
git push origin main
echo.
echo Done! Wait 90s for Vercel to rebuild, then hard refresh with Ctrl+Shift+R
pause
