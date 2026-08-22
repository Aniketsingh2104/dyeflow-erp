const fs = require('fs')
const filePath = 'app/machines/[machineId]/page.tsx'
let c = fs.readFileSync(filePath, 'utf8')

// Fix updatePlanNumber to also save anchor dates to batch_date_plans
const OLD = `  const updatePlanNumber = async (batchUUID: string, processCode: string, value: string, _existingPlan: any) => {
    const n = parseInt(value, 10)
    const planNum = (!n || n < 1) ? null : n

    // ALWAYS fetch fresh date_calc_plan from DB before merging
    // This prevents stale React state from overwriting another process's number
    let freshPlan: any = {}
    try {
      const r = await fetch(\`/api/batches?id=\${batchUUID}\`, { cache: 'no-store' }).then(x => x.json())
      freshPlan = r.data?.[0]?.date_calc_plan || {}
    } catch {}`

const NEW = `  const updatePlanNumber = async (batchUUID: string, processCode: string, value: string, _existingPlan: any) => {
    const n = parseInt(value, 10)
    const planNum = (!n || n < 1) ? null : n

    // ALWAYS fetch fresh date_calc_plan from DB before merging
    let freshPlan: any = {}
    try {
      const r = await fetch(\`/api/batches?id=\${batchUUID}\`, { cache: 'no-store' }).then(x => x.json())
      freshPlan = r.data?.[0]?.date_calc_plan || {}
    } catch {}`

// Already same — the key change is adding anchor save after the existing save
const OLD_LOAD_AFTER = `    await fetch('/api/batches', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'update', id: batchUUID,
        date_calc_plan: primaryPlan
          ? { planNumber: primaryPlan, byProcess, byProcessDates, plannedDate }
          : null
      })
    })
    loadData()
  }`

const NEW_LOAD_AFTER = `    await fetch('/api/batches', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'update', id: batchUUID,
        date_calc_plan: primaryPlan
          ? { planNumber: primaryPlan, byProcess, byProcessDates, plannedDate }
          : null
      })
    })

    // Also save anchor dates to batch_date_plans table (used by Date Calculator)
    if (planNum) {
      const batchRow = batches.find(b => b.id === batchUUID)
      if (batchRow) {
        const anchors: Record<string, string> = {}
        // Merge all existing byProcessDates into anchors
        for (const [code, isoDate] of Object.entries(byProcessDates)) {
          if (isoDate) anchors[code] = String(isoDate).slice(0, 10)
        }
        await fetch('/api/date-plans', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'update_anchors',
            batch_id: batchUUID,
            batch_id_str: batchRow.batchId,
            anchors
          })
        }).catch(() => {})
      }
    }
    loadData()
  }`

if (c.includes(OLD_LOAD_AFTER)) {
  c = c.replace(OLD_LOAD_AFTER, NEW_LOAD_AFTER)
  fs.writeFileSync(filePath, c, 'utf8')
  console.log('✓ Machine page updatePlanNumber now saves anchors to batch_date_plans')
} else {
  console.error('✗ updatePlanNumber save pattern not found')
}

// Also fix handleCollaborationConfirm to save anchors after numbering
const OLD_COLLAB_SAVE = `    await Promise.all(saves)
    await loadData()
    setShowCollabModal(false)
  }`

const NEW_COLLAB_SAVE = `    await Promise.all(saves)

    // Save anchor dates to batch_date_plans for all numbered batches
    const anchorSaves = Object.entries(planMap).map(async ([uuid, procMap]) => {
      const batchRow = batches.find(b => b.id === uuid)
      if (!batchRow) return
      // Build anchors from all byProcessDates for this batch
      let freshPlan: any = {}
      try {
        const r = await fetch(\`/api/batches?id=\${uuid}\`, { cache: 'no-store' }).then(x => x.json())
        freshPlan = r.data?.[0]?.date_calc_plan || {}
      } catch {}
      const anchors: Record<string, string> = {}
      for (const [code, isoDate] of Object.entries(freshPlan.byProcessDates || {})) {
        if (isoDate) anchors[code] = String(isoDate).slice(0, 10)
      }
      if (!Object.keys(anchors).length) return
      return fetch('/api/date-plans', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_anchors', batch_id: uuid,
          batch_id_str: batchRow.batchId, anchors
        })
      }).catch(() => {})
    })
    await Promise.all(anchorSaves)

    await loadData()
    setShowCollabModal(false)
  }`

if (c.includes(OLD_COLLAB_SAVE)) {
  c = c.replace(OLD_COLLAB_SAVE, NEW_COLLAB_SAVE)
  fs.writeFileSync(filePath, c, 'utf8')
  console.log('✓ handleCollaborationConfirm also saves anchors to batch_date_plans')
} else {
  console.error('✗ collab save pattern not found')
}
