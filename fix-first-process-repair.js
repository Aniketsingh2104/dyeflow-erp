const fs = require('fs')
let c = fs.readFileSync('app/first-process-batch/page.tsx', 'utf8')

// Fix 1: Add repairing_orders fetch to load function
const OLD_LOAD = `      const [bRes, oRes, dpRes] = await Promise.all([
        fetch('/api/batches?limit=5000', { cache:'no-store' }).then(r=>r.json()),
        fetch('/api/orders?limit=2000',  { cache:'no-store' }).then(r=>r.json()),
        fetch('/api/date-plans',          { cache:'no-store' }).then(r=>r.json()).catch(()=>({data:[]})),
      ])
      const allBatches: any[] = bRes.data  || []
      const allOrders:  any[] = oRes.data  || []
      const datePlans:  any[] = dpRes.data || []`

const NEW_LOAD = `      const [bRes, oRes, dpRes, repairRes] = await Promise.all([
        fetch('/api/batches?limit=5000', { cache:'no-store' }).then(r=>r.json()),
        fetch('/api/orders?limit=2000',  { cache:'no-store' }).then(r=>r.json()),
        fetch('/api/date-plans',          { cache:'no-store' }).then(r=>r.json()).catch(()=>({data:[]})),
        fetch('/api/repairing-orders',    { cache:'no-store' }).then(r=>r.json()).catch(()=>({data:[]})),
      ])
      const allBatches: any[] = bRes.data  || []
      const allOrders:  any[] = oRes.data  || []
      const datePlans:  any[] = dpRes.data || []
      // Build set of batch UUIDs in repairing_orders with status='pending' (not yet split)
      const repairPendingUUIDs = new Set(
        ((repairRes.data || []) as any[])
          .filter((r: any) => r.status === 'pending')
          .map((r: any) => r.batch_id)
          .filter(Boolean)
      )`

if (c.includes(OLD_LOAD)) {
  c = c.replace(OLD_LOAD, NEW_LOAD)
  console.log('✓ Added repairing_orders fetch to First Process load')
} else console.error('✗ Load pattern not found')

// Fix 2: Update filter to exclude repairing status AND pending repair batches
const OLD_FILTER = `      const rows = allBatches
        .filter(b => b.status === 'pending' || !b.current_process)`

const NEW_FILTER = `      const rows = allBatches
        .filter(b =>
          b.status === 'pending' &&           // must be pending
          !repairPendingUUIDs.has(b.id)       // exclude unsplit repair batches
        )`

if (c.includes(OLD_FILTER)) {
  c = c.replace(OLD_FILTER, NEW_FILTER)
  fs.writeFileSync('app/first-process-batch/page.tsx', c, 'utf8')
  console.log('✓ First Process filter: only status=pending AND not in pending repair orders')
  console.log('  - DYE26-0004-B1-R (repairing, ro=pending) -> excluded')
  console.log('  - DYE26-0001-B1-R (pending, ro=In Repair) -> shown')
  console.log('  - DYE26-0003-B2-R (pending, ro=In Repair) -> shown')
} else console.error('✗ Filter pattern not found')
