const fs = require('fs')
const filePath = 'app/date-calculator/page.tsx'
let c = fs.readFileSync(filePath, 'utf8')

// Complete fix for handleClearSelected
// The page reads from batch_date_plans (new table)
// So clear MUST clear batch_date_plans d_* columns AND batches.date_calc_plan flat keys

const OLD = `  // ── Clear selected ──────────────────────────────────────────────────────────
  const handleClearSelected = async () => {
    if (!selectedBatches.size) { alert('Select batches first'); return }
    if (!confirm(\`Clear Date Calculator dates for \${selectedBatches.size} batch(es)?\\nMachine plan numbers will NOT be cleared.\`)) return
    let cleared = 0
    for (const row of rows) {
      if (!selectedBatches.has(row.batchId)) continue

      // Fetch fresh batches.date_calc_plan to preserve machine keys only
      let freshPlan: any = {}
      try {
        const r = await fetch(\`/api/batches?id=\${row.batchUUID}\`, { cache:'no-store' }).then(x=>x.json())
        freshPlan = r.data?.[0]?.date_calc_plan || {}
      } catch {}

      // Keep ONLY machine numbering keys — wipe all flat date keys
      const MACHINE_KEYS = ['byProcess','byProcessDates','planNumber','plannedDate']
      const preserved: Record<string,any> = {}
      for (const k of MACHINE_KEYS) {
        if (freshPlan[k] !== undefined) preserved[k] = freshPlan[k]
      }

      // Save to batches table — this is the primary store
      await fetch('/api/batches', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          action:'update', id: row.batchUUID,
          date_calc_plan: Object.keys(preserved).length ? preserved : null,
          dc_generated_once: false, dc_regenerate: false
        })
      }).catch(console.error)

      // Also clear d_* in batch_date_plans if row exists there
      await fetch('/api/date-plans', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ action:'clear', batch_id: row.batchUUID })
      }).catch(() => {})

      // Update local state immediately so UI shows cleared
      setRows(prev => prev.map(r => r.batchUUID === row.batchUUID
        ? { ...r, dates: {}, dcGeneratedOnce: false, dcRegenerate: false }
        : r
      ))
      cleared++
    }
    setSelectedBatches(new Set())
    // Reload from DB to confirm
    await loadData()
    alert(\`✓ Cleared Date Calculator dates for \${cleared} batch(es).\`)
  }`

const NEW = `  // ── Clear selected ──────────────────────────────────────────────────────────
  const handleClearSelected = async () => {
    if (!selectedBatches.size) { alert('Select batches first'); return }
    if (!confirm(\`Clear Date Calculator dates for \${selectedBatches.size} batch(es)?\\nMachine plan numbers will NOT be cleared.\`)) return

    const selectedRows = rows.filter(r => selectedBatches.has(r.batchId))
    let cleared = 0

    await Promise.all(selectedRows.map(async row => {
      // Step 1: Fetch fresh batches.date_calc_plan to get machine keys
      let freshPlan: any = {}
      try {
        const r = await fetch(\`/api/batches?id=\${row.batchUUID}\`, { cache:'no-store' }).then(x=>x.json())
        freshPlan = r.data?.[0]?.date_calc_plan || {}
      } catch {}

      // Step 2: Keep ONLY machine keys, wipe everything else
      const MACHINE_KEYS = ['byProcess','byProcessDates','planNumber','plannedDate']
      const preserved: Record<string,any> = {}
      for (const k of MACHINE_KEYS) {
        if (freshPlan[k] !== undefined) preserved[k] = freshPlan[k]
      }

      // Step 3: Clear batches.date_calc_plan (keep machine keys only)
      const res1 = await fetch('/api/batches', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          action:'update', id: row.batchUUID,
          date_calc_plan: Object.keys(preserved).length ? preserved : null,
          dc_generated_once: false, dc_regenerate: false
        })
      })
      const d1 = await res1.json()
      if (!d1.ok) console.error('Failed to clear batches:', d1.error)

      // Step 4: Clear batch_date_plans d_* columns directly via Supabase API
      // Use update_anchors action but with empty dates to reset dc flags
      const res2 = await fetch('/api/date-plans', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ action:'clear', batch_id: row.batchUUID })
      })
      const d2 = await res2.json()
      if (!d2.ok) console.error('Failed to clear date-plans:', d2.error)

      cleared++
    }))

    setSelectedBatches(new Set())
    await loadData()
    alert(\`✓ Cleared Date Calculator dates for \${cleared} batch(es).\`)
  }`

if (c.includes(OLD)) {
  c = c.replace(OLD, NEW)
  fs.writeFileSync(filePath, c, 'utf8')
  console.log('✓ handleClearSelected fixed with parallel clearing + error logging')
} else {
  console.error('✗ Pattern not found — checking what is there:')
  const i = c.indexOf('handleClearSelected')
  console.log(c.substring(i, i + 200))
}
