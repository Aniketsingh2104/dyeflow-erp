const fs = require('fs')

// Fix 1: repair-assign API — support supervisor_id query param
let api = fs.readFileSync('app/api/repair-assign/route.ts', 'utf8')

const OLD_GET = `export async function GET() {
  try {
    // Get ALL repairing orders (pending or In Repair)
    const { data: repairs, error: repErr } = await dbSelect("repairing_orders",
      { limit: "1000" },
      "id,batch_id,repair_kg,repair_mtr,repair_taka,source_type,reprocess_type,notes,status"
    )`

const NEW_GET = `export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const supervisorId = searchParams.get('supervisor_id')

    // Get repairing orders — filter by supervisor if provided
    const repairQuery: any = { limit: "1000" }
    const { data: repairs, error: repErr } = await dbSelect("repairing_orders",
      repairQuery,
      "id,batch_id,repair_kg,repair_mtr,repair_taka,source_type,reprocess_type,notes,status"
    )`

if (api.includes(OLD_GET)) {
  api = api.replace(OLD_GET, NEW_GET)
  console.log('✓ repair-assign GET: accepts supervisor_id param')
} else console.error('✗ GET pattern not found')

// Add supervisor filter when fetching batches
const OLD_BATCH_QUERY = `    // Fetch those batches (status = repairing OR pending = assigned but not yet in process)
    const { data: batches, error: bErr } = await dbSelect("batches",
      { id: \`in.(${batchIds.join(",")})\`, limit: "1000" },
      "id,batch_id,kg,mtr,taka,status,process_route,machine_id,supervisor_id,order_id,machines(id,name),supervisors(id,name)"
    )`

const NEW_BATCH_QUERY = `    // Fetch those batches — filter by supervisor_id if provided
    const batchQuery: any = { id: \`in.(\${batchIds.join(",")})\`, limit: "1000" }
    if (supervisorId) batchQuery.supervisor_id = \`eq.\${supervisorId}\`
    const { data: batches, error: bErr } = await dbSelect("batches",
      batchQuery,
      "id,batch_id,kg,mtr,taka,status,process_route,machine_id,supervisor_id,order_id,machines(id,name),supervisors(id,name)"
    )`

if (api.includes(OLD_BATCH_QUERY)) {
  api = api.replace(OLD_BATCH_QUERY, NEW_BATCH_QUERY)
  console.log('✓ repair-assign GET: filters batches by supervisor_id')
} else console.error('✗ Batch query pattern not found')

// Also fix import to include NextRequest
const OLD_IMPORT = `import { NextRequest, NextResponse } from "next/server"`
// Already imported — check
if (!api.includes('NextRequest')) {
  api = api.replace(
    `import { NextResponse } from "next/server"`,
    `import { NextRequest, NextResponse } from "next/server"`
  )
  console.log('✓ Added NextRequest import')
} else {
  console.log('✓ NextRequest already imported')
}

fs.writeFileSync('app/api/repair-assign/route.ts', api, 'utf8')

// Fix 2: Supervisor page — pass resolvedId to repair-assign API
let page = fs.readFileSync('app/supervisor/[name]/page.tsx', 'utf8')

const OLD_REPAIR_FETCH = `      const repairApiRes = await fetch('/api/repair-assign', { cache: 'no-store' })
        .then(r => r.json()).catch(() => ({ data: [] }))`

const NEW_REPAIR_FETCH = `      // Pass supervisor_id so only this supervisor's repair batches are shown
      const repairApiRes = await fetch(\`/api/repair-assign?supervisor_id=\${resolvedId}\`, { cache: 'no-store' })
        .then(r => r.json()).catch(() => ({ data: [] }))`

if (page.includes(OLD_REPAIR_FETCH)) {
  page = page.replace(OLD_REPAIR_FETCH, NEW_REPAIR_FETCH)
  fs.writeFileSync('app/supervisor/[name]/page.tsx', page, 'utf8')
  console.log('✓ Supervisor page: passes supervisor_id to repair-assign API')
} else console.error('✗ Supervisor fetch pattern not found')

console.log('\n✓ All done')
