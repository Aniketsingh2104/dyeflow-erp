@echo off
cd C:\dyeflow-react
git add app/setup/shade-master/page.tsx
git commit -m "design: shade-master complete UI redesign - stat cards with progress bars, group filter pill tabs, table/grid toggle, inline group change buttons, emoji icons, monospace keywords, cleaner modal with visual group picker"
git push origin main
echo.
echo Done! New shade master UI live in ~60s.
pause
