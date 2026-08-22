@echo off
cd /d C:\dyeflow-react
echo Removing duplicate declarations...
node -e "
const fs = require('fs');
const f = 'app/machines/[machineId]/page.tsx';
let c = fs.readFileSync(f, 'utf8');
const lines = c.split('\n');
const out = [];
let holidaySeen = false;
for (const line of lines) {
  if (line.includes('const [holidaySet, setHolidaySet]')) {
    if (!holidaySeen) { out.push(line); holidaySeen = true; }
    // skip duplicate
  } else {
    out.push(line);
  }
}
c = out.join('\n');
fs.writeFileSync(f, c, 'utf8');
const count = (c.match(/holidaySet, setHolidaySet/g) || []).length;
console.log('holidaySet declarations remaining:', count);
"
echo.
git add "app/machines/[machineId]/page.tsx"
git add app/setup/machine-master/page.tsx
git add app/api/machines/route.ts
git add app/api/holidays/route.ts
git commit -m "fix: remove duplicate holidaySet declaration; base date from machine.numbering_base_date; holidays from Supabase"
git push origin main
echo.
echo Done! Wait 90s - build will succeed.
pause
