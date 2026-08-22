const fs = require('fs')
const filePath = 'app/date-calculator/page.tsx'
let c = fs.readFileSync(filePath, 'utf8')

// Fix 1: persistDateChange — merge flat dates into existing plan, don't overwrite machine keys
const OLD_PERSIST = `  const persistDateChange = useCallback((batchDbId: string, dateCalcPlan: Record<string, string>) => {
    // Debounce: save 400ms after last keystroke
    const key = batchDbId
    if (pendingDateChanges.current[key]) clearTimeout(pendingDateChanges.current[key])
    pendingDateChanges.current[key] = setTimeout(async () => {
      try {
        await fetch('/api/batches', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'update', id: batchDbId, date_calc_plan: dateCalcPlan }),
        })
      } catch { /* fire-and-forget */ }
      delete pendingDateChanges.current[key]
    }, 400)
  }, [])`

const NEW_PERSIST = `  const persistDateChange = useCallback((batchDbId: string, dateCalcPlan: Record<string, string>) => {
    // Debounce: save 400ms after last keystroke
    const key = batchDbId
    if (pendingDateChanges.current[key]) clearTimeout(pendingDateChanges.current[key])
    pendingDateChanges.current[key] = setTimeout(async () => {
      try {
        // Fetch fresh plan to preserve machine keys (byProcess, byProcessDates, planNumber, plannedDate)
        let freshPlan: any = {}
        try {
          const r = await fetch(\`/api/batches?id=\${batchDbId}\`, { cache: 'no-store' }).then(x => x.json())
          freshPlan = r.data?.[0]?.date_calc_plan || {}
        } catch {}
        // Merge: keep machine keys, overwrite only flat date keys
        const MACHINE_KEYS = ['byProcess', 'byProcessDates', 'planNumber', 'plannedDate']
        const merged: Record<string, any> = { ...dateCalcPlan }
        for (const k of MACHINE_KEYS) {
          if (freshPlan[k] !== undefined) merged[k] = freshPlan[k]
        }
        await fetch('/api/batches', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'update', id: batchDbId, date_calc_plan: merged }),
        })
      } catch { /* fire-and-forget */ }
      delete pendingDateChanges.current[key]
    }, 400)
  }, [])`

if (c.includes(OLD_PERSIST)) {
  c = c.replace(OLD_PERSIST, NEW_PERSIST)
  console.log('✓ persistDateChange now merges machine keys before saving')
} else {
  console.error('✗ persistDateChange pattern not found')
}

// Fix 2: savePlannedDatesToOrders — same issue when saving all batch plans
const OLD_SAVE = `      // Also persist date_calc_plan back to each batch
      const batchUpdates = sourceRows.filter(r => r._batchId && Object.keys(r.batch.dateCalcPlan || {}).length)
      await Promise.all(batchUpdates.map(r =>
        fetch('/api/batches', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'update', id: r._batchId, date_calc_plan: r.batch.dateCalcPlan, dc_generated_once: r.batch.dcGeneratedOnce }),
        }).catch(() => {})
      ))`

const NEW_SAVE = `      // Also persist date_calc_plan back to each batch
      // IMPORTANT: fetch fresh plan per batch to preserve machine keys
      const batchUpdates = sourceRows.filter(r => r._batchId && Object.keys(r.batch.dateCalcPlan || {}).length)
      await Promise.all(batchUpdates.map(async r => {
        let freshPlan: any = {}
        try {
          const fr = await fetch(\`/api/batches?id=\${r._batchId}\`, { cache: 'no-store' }).then(x => x.json())
          freshPlan = fr.data?.[0]?.date_calc_plan || {}
        } catch {}
        const MACHINE_KEYS = ['byProcess', 'byProcessDates', 'planNumber', 'plannedDate']
        const merged: Record<string, any> = { ...r.batch.dateCalcPlan }
        for (const k of MACHINE_KEYS) {
          if (freshPlan[k] !== undefined) merged[k] = freshPlan[k]
        }
        return fetch('/api/batches', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'update', id: r._batchId, date_calc_plan: merged, dc_generated_once: r.batch.dcGeneratedOnce }),
        }).catch(() => {})
      }))`

if (c.includes(OLD_SAVE)) {
  c = c.replace(OLD_SAVE, NEW_SAVE)
  console.log('✓ savePlannedDatesToOrders now merges machine keys before saving each batch')
} else {
  console.error('✗ savePlannedDatesToOrders batch save pattern not found')
}

fs.writeFileSync(filePath, c, 'utf8')
console.log('\n✓ Done — machine planned dates will never be cleared by Date Calculator saves')
