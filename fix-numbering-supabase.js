// Run from C:\dyeflow-react: node fix-numbering-supabase.js
// Fix 1: handleCollaborationConfirm — use Supabase API not localStorage
// Fix 2: plan number stored per-process so SCQ and Dyeing get independent numbers
// Fix 3: planned date calculated and saved to Supabase

const fs   = require('fs')
const path = require('path')
const filePath = path.join(__dirname, 'app', 'machines', '[machineId]', 'page.tsx')
let content = fs.readFileSync(filePath, 'utf8')

// ── Replace handleCollaborationConfirm ────────────────────────────────────
const OLD_CONFIRM = `  // Handle collaboration confirmation from modal
  const handleCollaborationConfirm = (
    collabGroups: any[], 
    skipBatchIds: string[]
  ) => {
    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return
    const db = JSON.parse(stored)

    // Get next available plan number
    const maxPlanNumber = Math.max(
      0,
      ...batches.map(b => b.planNumber || 0)
    )
    let currentPlanNumber = maxPlanNumber + 1
    const baseDate = new Date().toISOString().slice(0, 10)

    // Process collaboration groups
    collabGroups.forEach((group: any) => {
      // Assign same plan number to all batches in collaboration group
      group.batches.forEach((batch: any) => {
        const order = db.orders.find((o: any) => o.id === batch.orderId)
        if (!order) return

        const batchIndex = order.splits?.findIndex((s: any) => s.batchId === batch.batchId)
        if (batchIndex === -1 || batchIndex === undefined) return

        const dbBatch = order.splits[batchIndex]

        // CRITICAL: Skip planned date generation for repairing and faulty batches
        if (dbBatch.isRepairingBatch || dbBatch.faulty) {
          console.log(\`Skipping planned number for \${dbBatch.isRepairingBatch ? 'repairing' : 'faulty'} batch: \${batch.batchId}\`)
          return
        }

        // Assign plan number
        dbBatch.planNumber = currentPlanNumber
        dbBatch.plannedDate = getPlannedDateByNumber(currentPlanNumber, baseDate, machine?.id)
        dbBatch.isCollab = true
        dbBatch.collabGroupId = group.id
      })
      
      currentPlanNumber++
    })

    // Process remaining single batches (not in any group and not skipped)
    const batchesInGroups = new Set(
      collabGroups.flatMap(g => g.batches.map((b: any) => b.batchId))
    )
    
    const singleBatches = batches.filter(b => 
      !b.planNumber && 
      !skipBatchIds.includes(b.batchId) && 
      !batchesInGroups.has(b.batchId) &&
      b.status !== 'done'
    )

    singleBatches.forEach(batch => {
      const order = db.orders.find((o: any) => o.id === batch.orderId)
      if (!order) return

      const batchIndex = order.splits?.findIndex((s: any) => s.batchId === batch.batchId)
      if (batchIndex === -1 || batchIndex === undefined) return

      const dbBatch = order.splits[batchIndex]

      // CRITICAL: Skip planned date generation for repairing and faulty batches
      if (dbBatch.isRepairingBatch || dbBatch.faulty) {
        console.log(\`Skipping planned number for \${dbBatch.isRepairingBatch ? 'repairing' : 'faulty'} batch: \${batch.batchId}\`)
        return
      }

      dbBatch.planNumber = currentPlanNumber
      dbBatch.plannedDate = getPlannedDateByNumber(currentPlanNumber, baseDate, machine?.id)
      dbBatch.isCollab = false
      
      currentPlanNumber++
    })

    localStorage.setItem('dyeflow_db', JSON.stringify(db))
    loadData() // Reload to show updated data
    setShowCollabModal(false)
  }`

const NEW_CONFIRM = `  // Handle collaboration confirmation — saves to Supabase
  // Plan numbers are stored PER PROCESS: date_calc_plan = { planNumber: N, byProcess: { S: N1, D: N2 } }
  // This way SCQ and Dyeing rows for the same batch get independent plan numbers
  const handleCollaborationConfirm = async (
    collabGroups: any[],
    skipBatchIds: string[]
  ) => {
    // Get max existing plan number across all batch-process rows
    const maxPlanNumber = Math.max(0, ...batches.map(b => b.planNumber || 0))
    let currentPlanNumber = maxPlanNumber + 1
    const baseDate = new Date().toISOString().slice(0, 10)

    // Build map: batchUUID → { processCode → planNumber }
    // We need to accumulate all assignments before saving
    const planMap: Record<string, Record<string, number>> = {}

    // helper to add assignment
    const assignPlan = (batchRowKey: string, planNum: number) => {
      // batchRowKey is like "DYE26-0004-B1-S" — extract UUID from batches state
      const batchRow = batches.find(b => b.rowKey === batchRowKey || b.batchId === batchRowKey)
      if (!batchRow) return
      const uuid = batchRow.id  // Supabase UUID
      const proc = batchRow.currentProcess
      if (!planMap[uuid]) planMap[uuid] = {}
      planMap[uuid][proc] = planNum
    }

    // Process collab groups — all batches in a group get SAME plan number
    collabGroups.forEach((group: any) => {
      group.batches.forEach((batch: any) => {
        // batch.batchId in modal is the rowKey (e.g. DYE26-0004-B1-S)
        assignPlan(batch.batchId, currentPlanNumber)
      })
      currentPlanNumber++
    })

    // Process single batches not in any group and not skipped
    const inGroupKeys = new Set(collabGroups.flatMap((g: any) => g.batches.map((b: any) => b.batchId)))
    const singleRows = batches.filter(b =>
      !b.planNumber &&
      !skipBatchIds.includes(b.rowKey) &&
      !skipBatchIds.includes(b.batchId) &&
      !inGroupKeys.has(b.rowKey) &&
      !inGroupKeys.has(b.batchId) &&
      b.status !== 'done'
    )
    // Deduplicate: process each unique batch UUID only once per process
    const seenRowKeys = new Set<string>()
    for (const b of singleRows) {
      if (seenRowKeys.has(b.rowKey)) continue
      seenRowKeys.add(b.rowKey)
      assignPlan(b.rowKey, currentPlanNumber)
      currentPlanNumber++
    }

    // Save to Supabase — one API call per unique batch UUID
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
    })

    await Promise.all(saves)
    await loadData()
    setShowCollabModal(false)
  }`

if (content.includes(OLD_CONFIRM)) {
  content = content.replace(OLD_CONFIRM, NEW_CONFIRM)
  console.log('✓ handleCollaborationConfirm replaced with Supabase version')
} else {
  console.error('✗ handleCollaborationConfirm pattern not found')
}

// ── Replace clearNumbering to use Supabase ────────────────────────────────
const OLD_CLEAR = `  const clearNumbering = () => {
    if (!confirm('Are you sure you want to clear all plan numbers for this machine?')) return

    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return

    const db = JSON.parse(stored)
    let changed = false

    batches.forEach(batch => {
      for (const order of db.orders) {
        if (order.id === batch.orderId) {
          const dbBatch = order.splits.find((s: any) => s.batchId === batch.batchId)
          if (dbBatch && dbBatch.planNumber) {
            dbBatch.planNumber = null
            changed = true
          }
        }
      }
    })

    if (changed) {
      localStorage.setItem('dyeflow_db', JSON.stringify(db))
      loadData()
      alert('✅ All numbering cleared!')
    }
  }`

const NEW_CLEAR = `  const clearNumbering = async () => {
    if (!confirm('Are you sure you want to clear all plan numbers for this machine?')) return
    // Get unique batch UUIDs (deduplicate since same batch may appear twice for 2 processes)
    const uniqueIds = [...new Set(batches.filter(b => b.planNumber).map(b => b.id))]
    await Promise.all(uniqueIds.map(id =>
      fetch('/api/batches', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update', id, date_calc_plan: null }),
      })
    ))
    await loadData()
    alert('✅ All numbering cleared!')
  }`

if (content.includes(OLD_CLEAR)) {
  content = content.replace(OLD_CLEAR, NEW_CLEAR)
  console.log('✓ clearNumbering replaced with Supabase version')
} else {
  console.error('✗ clearNumbering pattern not found')
}

// ── Fix loadData to read planNumber per process from date_calc_plan.byProcess ──
const OLD_PLAN = `            planNumber:     b.date_calc_plan?.planNumber || null,`
const NEW_PLAN = `            planNumber:     b.date_calc_plan?.byProcess?.[displayProcess] ?? b.date_calc_plan?.planNumber ?? null,
            plannedDate_db: b.date_calc_plan?.plannedDate || '',
            date_calc_plan_raw: b.date_calc_plan || null,`

if (content.includes(OLD_PLAN)) {
  content = content.replace(OLD_PLAN, NEW_PLAN)
  console.log('✓ loadData reads planNumber per process from byProcess map')
} else {
  console.error('✗ planNumber pattern not found')
}

// ── Fix plannedDate to use plannedDate_db ─────────────────────────────────
const OLD_PDATE = `            plannedDate:    '',`
const NEW_PDATE = `            plannedDate:    b.date_calc_plan?.plannedDate || '',`

if (content.includes(OLD_PDATE)) {
  content = content.replace(OLD_PDATE, NEW_PDATE)
  console.log('✓ plannedDate reads from date_calc_plan.plannedDate')
} else {
  console.error('✗ plannedDate pattern not found')
}

fs.writeFileSync(filePath, content, 'utf8')
console.log('\n✓ All fixes done.')
