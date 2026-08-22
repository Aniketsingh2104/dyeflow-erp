const fs = require('fs')
const filePath = 'app/date-calculator/page.tsx'
let c = fs.readFileSync(filePath, 'utf8')

// Fix handleClearSelected — also clear batches.date_calc_plan flat keys
const OLD = `  // ── Clear selected ──────────────────────────────────────────────────────────
  const handleClearSelected = async () => {
    if (!selectedBatches.size) { alert('Select batches first'); return }
    if (!confirm(\`Clear Date Calculator dates for \${selectedBatches.size} batch(es)?\\nMachine anchor dates (S/D) will NOT be cleared.\`)) return
    let cleared = 0
    for (const row of rows) {
      if (!selectedBatches.has(row.batchId)) continue
      await fetch('/api/date-plans', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ action:'clear', batch_id: row.batchUUID })
      }).catch(() => {})
      cleared++
    }
    setSelectedBatches(new Set())
    await loadData()
    alert(\`✓ Cleared \${cleared} batch(es). Machine anchor dates preserved.\`)
  }`

const NEW = `  // ── Clear selected ──────────────────────────────────────────────────────────
  const handleClearSelected = async () => {
    if (!selectedBatches.size) { alert('Select batches first'); return }
    if (!confirm(\`Clear Date Calculator dates for \${selectedBatches.size} batch(es)?\\nMachine anchor dates (S/D) will NOT be cleared.\`)) return
    let cleared = 0
    for (const row of rows) {
      if (!selectedBatches.has(row.batchId)) continue
      // 1. Clear d_* columns in batch_date_plans (new table)
      await fetch('/api/date-plans', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ action:'clear', batch_id: row.batchUUID })
      }).catch(() => {})
      // 2. Also clear flat date keys in batches.date_calc_plan (old storage)
      // Fetch fresh to preserve machine keys
      let freshPlan: any = {}
      try {
        const r = await fetch(\`/api/batches?id=\${row.batchUUID}\`, { cache:'no-store' }).then(x=>x.json())
        freshPlan = r.data?.[0]?.date_calc_plan || {}
      } catch {}
      const MACHINE_KEYS = ['byProcess','byProcessDates','planNumber','plannedDate']
      const preserved: Record<string,any> = {}
      for (const k of MACHINE_KEYS) {
        if (freshPlan[k] !== undefined) preserved[k] = freshPlan[k]
      }
      await fetch('/api/batches', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          action:'update', id: row.batchUUID,
          date_calc_plan: Object.keys(preserved).length ? preserved : null,
          dc_generated_once: false, dc_regenerate: false
        })
      }).catch(() => {})
      cleared++
    }
    setSelectedBatches(new Set())
    await loadData()
    alert(\`✓ Cleared \${cleared} batch(es). Machine anchor dates preserved.\`)
  }`

if (c.includes(OLD)) {
  c = c.replace(OLD, NEW)
  fs.writeFileSync(filePath, c, 'utf8')
  console.log('✓ handleClearSelected now clears both batch_date_plans AND batches.date_calc_plan')
} else {
  console.error('✗ Pattern not found')
}
