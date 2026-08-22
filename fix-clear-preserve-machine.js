const fs = require('fs')
const filePath = 'app/date-calculator/page.tsx'
let c = fs.readFileSync(filePath, 'utf8')

const OLD = `  const handleClearSelected = async () => {
    if (!selectedBatches.size) { alert('Select batches first'); return }
    if (!confirm(\`Clear dates for \${selectedBatches.size} batch(es)?\`)) return
    let cleared = 0
    for (const row of rows) {
      if (!selectedBatches.has(row.batch.batchId)) continue
      const emptyPlan: Record<string, string> = {}
      await fetch('/api/batches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update', id: row._batchId, date_calc_plan: emptyPlan, dc_generated_once: false, dc_regenerate: false }),
      }).catch(() => {})
      cleared++
    }
    setSelectedBatches(new Set())
    await loadData()
    alert(\`✓ Cleared \${cleared} batch(es)\`)
  }`

const NEW = `  const handleClearSelected = async () => {
    if (!selectedBatches.size) { alert('Select batches first'); return }
    if (!confirm(\`Clear Date Calculator dates for \${selectedBatches.size} batch(es)?\\nMachine plan numbers and planned dates will NOT be cleared.\`)) return
    let cleared = 0
    for (const row of rows) {
      if (!selectedBatches.has(row.batch.batchId)) continue
      // Fetch fresh date_calc_plan to preserve machine numbering keys
      let freshPlan: any = {}
      try {
        const r = await fetch(\`/api/batches?id=\${row._batchId}\`, { cache: 'no-store' }).then(x => x.json())
        freshPlan = r.data?.[0]?.date_calc_plan || {}
      } catch {}

      // Only keep machine numbering data — remove all flat process date keys
      const MACHINE_KEYS = ['byProcess', 'byProcessDates', 'planNumber', 'plannedDate']
      const clearedPlan: Record<string, any> = {}
      for (const key of MACHINE_KEYS) {
        if (freshPlan[key] !== undefined) clearedPlan[key] = freshPlan[key]
      }

      await fetch('/api/batches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update',
          id: row._batchId,
          date_calc_plan: Object.keys(clearedPlan).length ? clearedPlan : null,
          dc_generated_once: false,
          dc_regenerate: false
        }),
      }).catch(() => {})
      cleared++
    }
    setSelectedBatches(new Set())
    await loadData()
    alert(\`✓ Cleared Date Calculator dates for \${cleared} batch(es).\\nMachine plan numbers preserved.\`)
  }`

if (c.includes(OLD)) {
  c = c.replace(OLD, NEW)
  fs.writeFileSync(filePath, c, 'utf8')
  console.log('✓ handleClearSelected now preserves machine numbering data (byProcess, byProcessDates, planNumber, plannedDate)')
} else {
  console.error('✗ Pattern not found')
}
