const fs = require('fs')
let c = fs.readFileSync('app/splitted-orders/page.tsx', 'utf8')

// Replace the entire load function with correct version
const OLD = `  // ── Load ──────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [batchRes, orderRes] = await Promise.all([
        fetch('/api/batches?limit=5000', { cache: 'no-store' }).then(r => r.json()),
        fetch('/api/orders?limit=2000',  { cache: 'no-store' }).then(r => r.json()),
      ])
      const batches: any[] = batchRes.data || []
      const orders:  any[] = orderRes.data || []
      const oMap: Record<string, any> = {}
      for (const o of orders) oMap[o.id] = o

      // Exclude repair batches that haven't been split yet:
      // - status = 'repairing' (not yet assigned by supervisor)
      // - batch_id ends with -R or -RR etc (repair batch, not yet split/full-split)
      //   UNLESS it also has -S suffix (split batch - should show)
      // - status = 'pending' AND batch_id matches repair pattern (assigned but not split)
      const isRepairUnsplit = (b: any) => {
        const id: string = b.batch_id || ''
        // Has -R suffix (repair batch) but NOT -S suffix (not yet split)
        const isRepairBatch = /-R+$/.test(id) || (/-R+-/.test(id) && !/-Sd+$/.test(id))
        // Only exclude if still pending/repairing (not yet through full split)
        return isRepairBatch && (b.status === 'repairing' || b.status === 'pending')
      }
      const splitBatches = batches.filter((b: any) => !isRepairUnsplit(b))`

const NEW = `  // ── Load ──────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [batchRes, orderRes, repairRes] = await Promise.all([
        fetch('/api/batches?limit=5000', { cache: 'no-store' }).then(r => r.json()),
        fetch('/api/orders?limit=2000',  { cache: 'no-store' }).then(r => r.json()),
        fetch('/api/repairing-orders',   { cache: 'no-store' }).then(r => r.json()).catch(() => ({ data: [] })),
      ])
      const batches: any[] = batchRes.data || []
      const orders:  any[] = orderRes.data || []
      const repairs: any[] = repairRes.data || []
      const oMap: Record<string, any> = {}
      for (const o of orders) oMap[o.id] = o

      // Build set of batch UUIDs where repairing_order.status = 'pending'
      // These have NOT been split yet → exclude from Splitted Orders
      // Only after Full Split / Split → ro.status = 'In Repair' → batch shows
      const repairPendingUUIDs = new Set(
        repairs
          .filter((r: any) => r.status === 'pending')
          .map((r: any) => r.batch_id)
          .filter(Boolean)
      )

      // Also exclude batches with status='repairing' (safety net)
      const splitBatches = batches.filter((b: any) =>
        b.status !== 'repairing' && !repairPendingUUIDs.has(b.id)
      )`

if (c.includes(OLD)) {
  c = c.replace(OLD, NEW)
  fs.writeFileSync('app/splitted-orders/page.tsx', c, 'utf8')
  console.log('✓ Splitted Orders load updated with repairing_orders source of truth')
} else {
  console.error('✗ Pattern not found — writing directly')
  // Force write by replacing key section
  c = c.replace(
    "      const isRepairUnsplit = (b: any) => {",
    "      // REPLACED - using repairing_orders"
  )
  console.log('File content around load:', c.substring(c.indexOf('const load'), c.indexOf('const load') + 300))
}
