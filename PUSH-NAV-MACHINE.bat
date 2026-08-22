@echo off
cd /d C:\dyeflow-react
echo Step 1: Fix planNumber read + updatePlanNumber fresh fetch...
node fix-planNumber-read.js
echo.
echo Step 2: Add ?id= filter to batches API...
node -e "
const fs = require('fs');
const f = 'app/api/batches/route.ts';
let c = fs.readFileSync(f, 'utf8');
const OLD1 = \"    const order_id   = searchParams.get('order_id')\";
const NEW1 = \"    const uuid_id    = searchParams.get('id')\n    const order_id   = searchParams.get('order_id')\";
const OLD2 = \"    if (order_id)   query['order_id']   = \`eq.\${order_id}\`\";
const NEW2 = \"    if (uuid_id)    query['id']         = \`eq.\${uuid_id}\`\n    if (order_id)   query['order_id']   = \`eq.\${order_id}\`\";
let changed = 0;
if (c.includes(OLD1)) { c = c.replace(OLD1, NEW1); changed++; console.log('id param extracted'); }
else { console.log('id param already exists or pattern not found'); }
if (c.includes(OLD2)) { c = c.replace(OLD2, NEW2); changed++; console.log('id filter added'); }
else { console.log('id filter already exists or pattern not found'); }
fs.writeFileSync(f, c, 'utf8');
console.log('Done, changed:', changed);
"
echo.
git add "app/machines/[machineId]/page.tsx"
git add app/api/batches/route.ts
git commit -m "fix: FINAL per-process plan number - remove planNumber fallback so SCQ row never shows Dyeing number; updatePlanNumber and handleCollaborationConfirm fetch fresh DB plan before merging byProcess; batches API supports ?id= UUID filter"
git push origin main
echo.
echo Done! Wait 90s then test. Dyeing and SCQ numbers will be completely independent.
pause
