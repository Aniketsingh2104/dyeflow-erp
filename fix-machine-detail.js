const fs = require('fs')
let c = fs.readFileSync('app/machines/[machineId]/page.tsx', 'utf8')

// Fix: add repairing_orders fetch and exclude pending repair batches
const OLD_LOAD = `      const [machRes, batchRes, orderRes, procRes, holRes] = await Promise.all([
        fetch('/api/machines', { cache: 'no-store' }).then(r => r.json()),
        fetch('/api/batches?limit=5000', { cache: 'no-store' }).then(r => r.json()),
        fetch('/api/orders?limit=2000', { cache: 'no-store' }).then(r => r.json()),
        fetch('/api/processes', { cache: 'no-store' }).then(r => r.json()),
        fetch(\`/api/holidays?machine_id=\${machineId}\`, { cache: 'no-store' }).then(r => r.json()).catch(() => ({ data: [] })),
      ])`

const NEW_LOAD = `      const [machRes, batchRes, orderRes, procRes, holRes, repairRes] = await Promise.all([
        fetch('/api/machines', { cache: 'no-store' }).then(r => r.json()),
        fetch('/api/batches?limit=5000', { cache: 'no-store' }).then(r => r.json()),
        fetch('/api/orders?limit=2000', { cache: 'no-store' }).then(r => r.json()),
        fetch('/api/processes', { cache: 'no-store' }).then(r => r.json()),
        fetch(\`/api/holidays?machine_id=\${machineId}\`, { cache: 'no-store' }).then(r => r.json()).catch(() => ({ data: [] })),
        fetch('/api/repairing-orders', { cache: 'no-store' }).then(r => r.json()).catch(() => ({ data: [] })),
      ])
      // Build set of batch UUIDs in repairing_orders with status='pending' (not yet split)
      const repairPendingUUIDs = new Set(
        ((repairRes.data || []) as any[])
          .filter((r: any) => r.status === 'pending')
          .map((r: any) => r.batch_id)
          .filter(Boolean)
      )`

if (c.includes(OLD_LOAD)) {
  c = c.replace(OLD_LOAD, NEW_LOAD)
  console.log('✓ Added repairing_orders fetch to machine detail page')
} else console.error('✗ Load pattern not found')

// Fix: exclude repairing batches from the loop
const OLD_LOOP = `      for (const b of allBatches) {
        if (b.machine_id !== foundMachine.id) continue`

const NEW_LOOP = `      for (const b of allBatches) {
        if (b.machine_id !== foundMachine.id) continue
        // Skip repairing batches not yet split/full-split
        if (b.status === 'repairing') continue
        if (repairPendingUUIDs.has(b.id)) continue`

if (c.includes(OLD_LOOP)) {
  c = c.replace(OLD_LOOP, NEW_LOOP)
  fs.writeFileSync('app/machines/[machineId]/page.tsx', c, 'utf8')
  console.log('✓ Machine detail page excludes repairing/pending-repair batches')
} else console.error('✗ Loop pattern not found')
