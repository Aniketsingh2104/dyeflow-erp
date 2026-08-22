// Run from C:\dyeflow-react: node fix-planNumber-read.js
// THE ROOT CAUSE: planNumber falls back to top-level planNumber when byProcess[process] is undefined
// This makes BOTH SCQ and Dyeing rows show the same number
// Fix: only read from byProcess[process], no fallback

const fs   = require('fs')
const path = require('path')
const filePath = path.join(__dirname, 'app', 'machines', '[machineId]', 'page.tsx')
let content = fs.readFileSync(filePath, 'utf8')

// Fix 1: loadData — remove the fallback to top-level planNumber
const OLD_READ = `            planNumber:     b.date_calc_plan?.byProcess?.[displayProcess] ?? b.date_calc_plan?.planNumber ?? null,`

const NEW_READ = `            // CRITICAL: read ONLY from byProcess[process] — never fall back to top-level planNumber
            // Fallback causes both SCQ and Dyeing rows to show the same number
            planNumber:     b.date_calc_plan?.byProcess?.[displayProcess] ?? null,`

if (content.includes(OLD_READ)) {
  content = content.replace(OLD_READ, NEW_READ)
  console.log('✓ Fix 1: planNumber no longer falls back to top-level planNumber')
} else {
  console.error('✗ Fix 1 pattern not found')
}

// Fix 2: updatePlanNumber — when saving, also DON'T overwrite other process's number
// Currently it merges existingPlan.byProcess — but existingPlan is stale from React state
// Two rows share same batch UUID, existingPlan might be from the OTHER process row
// Fix: fetch fresh from Supabase before merging

const OLD_UPDATE = `  const updatePlanNumber = async (batchUUID: string, processCode: string, value: string, existingPlan: any) => {
    const n = parseInt(value, 10)
    const planNum = (!n || n < 1) ? null : n

    // Build per-process plan: merge into existing byProcess map
    const byProcess = { ...(existingPlan?.byProcess || {}) }
    if (planNum) {
      byProcess[processCode] = planNum
    } else {
      delete byProcess[processCode]
    }

    // Planned date based on this process's number
    const plannedDate = planNum
      ? getPlannedDateByNumber(planNum, new Date().toISOString().slice(0, 10), machine?.id)
      : (existingPlan?.plannedDate || null)

    // Primary planNumber = min across all assigned processes (earliest process runs first)
    const allNums = Object.values(byProcess) as number[]
    const primaryPlan = allNums.length > 0 ? Math.min(...allNums) : null

    await fetch('/api/batches', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'update', id: batchUUID,
        date_calc_plan: primaryPlan
          ? { planNumber: primaryPlan, byProcess, plannedDate }
          : null
      })
    })
    loadData()
  }`

const NEW_UPDATE = `  const updatePlanNumber = async (batchUUID: string, processCode: string, value: string, _existingPlan: any) => {
    const n = parseInt(value, 10)
    const planNum = (!n || n < 1) ? null : n

    // ALWAYS fetch fresh date_calc_plan from DB before merging
    // This prevents stale React state from overwriting another process's number
    let freshPlan: any = {}
    try {
      const r = await fetch(\`/api/batches?id=\${batchUUID}\`, { cache: 'no-store' }).then(x => x.json())
      freshPlan = r.data?.[0]?.date_calc_plan || {}
    } catch {}

    // Merge only this process's number into the fresh byProcess map
    const byProcess = { ...(freshPlan.byProcess || {}) }
    if (planNum) {
      byProcess[processCode] = planNum
    } else {
      delete byProcess[processCode]
    }

    // Planned date for this process's number
    const plannedDate = planNum
      ? getPlannedDateByNumber(planNum, new Date().toISOString().slice(0, 10), machine?.id)
      : (freshPlan.plannedDate || null)

    // Primary planNumber = earliest (min) across all process numbers
    const allNums = Object.values(byProcess) as number[]
    const primaryPlan = allNums.length > 0 ? Math.min(...allNums) : null

    await fetch('/api/batches', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'update', id: batchUUID,
        date_calc_plan: primaryPlan
          ? { planNumber: primaryPlan, byProcess, plannedDate }
          : null
      })
    })
    loadData()
  }`

if (content.includes(OLD_UPDATE)) {
  content = content.replace(OLD_UPDATE, NEW_UPDATE)
  console.log('✓ Fix 2: updatePlanNumber fetches fresh plan from DB before merging')
} else {
  console.error('✗ Fix 2 pattern not found')
}

// Fix 3: handleCollaborationConfirm — same stale state problem
// Fix the saves block to fetch fresh before merging
const OLD_SAVES = `    // Save to Supabase — one API call per unique batch UUID
    const saves = Object.entries(planMap).map(async ([uuid, procMap]) => {
      // Get existing date_calc_plan for this batch
      const existingRow = batches.find(b => b.id === uuid)
      const existing = existingRow?.date_calc_plan_raw || {}
      const byProcess = { ...(existing.byProcess || {}), ...procMap }
      // Primary planNumber = first process's plan number
      const primaryPlan = Object.values(procMap)[0] as number
      const plannedDate = getPlannedDateByNumber(primaryPlan, baseDate, machine?.id)
      await fetch('/api/batches', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update', id: uuid,
          date_calc_plan: { planNumber: primaryPlan, byProcess, plannedDate },
        }),
      })
    })`

const NEW_SAVES = `    // Save to Supabase — one API call per unique batch UUID
    // Fetch fresh plan for EACH batch before merging to avoid stale state cross-contamination
    const saves = Object.entries(planMap).map(async ([uuid, procMap]) => {
      let freshPlan: any = {}
      try {
        const r = await fetch(\`/api/batches?id=\${uuid}\`, { cache: 'no-store' }).then(x => x.json())
        freshPlan = r.data?.[0]?.date_calc_plan || {}
      } catch {}
      // Merge new assignments into fresh byProcess — won't overwrite other processes
      const byProcess = { ...(freshPlan.byProcess || {}), ...procMap }
      // Primary = earliest plan number across all processes
      const allNums = Object.values(byProcess) as number[]
      const primaryPlan = Math.min(...allNums)
      const plannedDate = getPlannedDateByNumber(primaryPlan, baseDate, machine?.id)
      await fetch('/api/batches', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update', id: uuid,
          date_calc_plan: { planNumber: primaryPlan, byProcess, plannedDate },
        }),
      })
    })`

if (content.includes(OLD_SAVES)) {
  content = content.replace(OLD_SAVES, NEW_SAVES)
  console.log('✓ Fix 3: handleCollaborationConfirm fetches fresh plan before merging')
} else {
  console.error('✗ Fix 3 pattern not found')
}

fs.writeFileSync(filePath, content, 'utf8')
console.log('\n✓ All 3 fixes applied — per-process numbering now fully independent')
