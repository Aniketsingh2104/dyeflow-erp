const fs = require('fs')
let c = fs.readFileSync('app/date-calculator/page.tsx', 'utf8')

// The filter references repairPendingUUIDs which was never defined
// Fix: replace the broken filter with a simple status check
const OLD_FILTER = `      // Exclude batches that are in repairing_orders with status='pending' (not yet split)
      // Also exclude batches with status='repairing'
      const filteredRows = batchRows.filter(r =>
        r.route.length > 0 &&
        !repairPendingUUIDs.has(r.batchUUID) &&
        (bRes.data || []).find((b: any) => b.id === r.batchUUID)?.status !== 'repairing'
      )
      setRows(filteredRows)`

const NEW_FILTER = `      // Build set of batch UUIDs in repairing_orders with status='pending' (not yet split)
      const repairRes = await fetch('/api/repairing-orders', { cache: 'no-store' })
        .then(r => r.json()).catch(() => ({ data: [] }))
      const repairPendingUUIDs = new Set(
        ((repairRes.data || []) as any[])
          .filter((r: any) => r.status === 'pending')
          .map((r: any) => r.batch_id)
          .filter(Boolean)
      )
      // Exclude: repairing status + pending repair batches (not yet split)
      const batchStatusMap: Record<string, string> = {}
      for (const b of batches) batchStatusMap[b.id] = b.status
      const filteredRows = batchRows.filter(r =>
        r.route.length > 0 &&
        batchStatusMap[r.batchUUID] !== 'repairing' &&
        !repairPendingUUIDs.has(r.batchUUID)
      )
      setRows(filteredRows)`

if (c.includes(OLD_FILTER)) {
  c = c.replace(OLD_FILTER, NEW_FILTER)
  fs.writeFileSync('app/date-calculator/page.tsx', c, 'utf8')
  console.log('✓ Date Calculator filter fixed — repairPendingUUIDs now defined inline')
} else {
  console.error('✗ Filter pattern not found')
  // Show what's around setRows
  const i = c.indexOf('setRows(')
  console.log('Around setRows:', c.substring(i - 200, i + 100))
}
