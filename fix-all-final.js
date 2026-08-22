const fs = require('fs')

// Fix 1: batches API - add ?id= filter
const batchPath = 'app/api/batches/route.ts'
let batch = fs.readFileSync(batchPath, 'utf8')
const OLD1 = `    const order_id   = searchParams.get('order_id')`
const NEW1 = `    const uuid_id    = searchParams.get('id')\n    const order_id   = searchParams.get('order_id')`
const OLD2 = `    if (order_id)   query['order_id']   = \`eq.\${order_id}\``
const NEW2 = `    if (uuid_id)    query['id']         = \`eq.\${uuid_id}\`\n    if (order_id)   query['order_id']   = \`eq.\${order_id}\``
if (batch.includes(OLD1)) { batch = batch.replace(OLD1, NEW1); console.log('✓ id param added') }
else console.log('- id param already exists')
if (batch.includes(OLD2)) { batch = batch.replace(OLD2, NEW2); console.log('✓ id filter added') }
else console.log('- id filter already exists')
fs.writeFileSync(batchPath, batch, 'utf8')

// Fix 2: machine page - plannedDate must be per-process too
const pagePath = 'app/machines/[machineId]/page.tsx'
let page = fs.readFileSync(pagePath, 'utf8')

// Fix plannedDate in loadData - read from byProcess planned dates too
const OLD_PLAN = `            // CRITICAL: read ONLY from byProcess[process] — never fall back to top-level planNumber
            // Fallback causes both SCQ and Dyeing rows to show the same number
            planNumber:     b.date_calc_plan?.byProcess?.[displayProcess] ?? null,
            plannedDate_db: b.date_calc_plan?.plannedDate || '',
            date_calc_plan_raw: b.date_calc_plan || null,`

const NEW_PLAN = `            // CRITICAL: read ONLY from byProcess[process] — never fall back to top-level planNumber
            // Fallback causes both SCQ and Dyeing rows to show the same number
            planNumber:     b.date_calc_plan?.byProcess?.[displayProcess] ?? null,
            // plannedDate also per-process: read from byProcessDates[processCode] if exists
            plannedDate_db: b.date_calc_plan?.byProcessDates?.[displayProcess] || '',
            date_calc_plan_raw: b.date_calc_plan || null,`

if (page.includes(OLD_PLAN)) {
  page = page.replace(OLD_PLAN, NEW_PLAN)
  console.log('✓ plannedDate_db reads from byProcessDates per-process')
} else {
  console.error('✗ OLD_PLAN not found')
}

// Fix plannedDate field at bottom of batch object
const OLD_PDATE = `            plannedDate:    b.date_calc_plan?.plannedDate || '',`
const NEW_PDATE = `            // plannedDate per-process: only show date if THIS process has a plan number
            plannedDate:    b.date_calc_plan?.byProcess?.[displayProcess]
              ? (b.date_calc_plan?.byProcessDates?.[displayProcess] || b.date_calc_plan?.plannedDate || '')
              : '',`

if (page.includes(OLD_PDATE)) {
  page = page.replace(OLD_PDATE, NEW_PDATE)
  console.log('✓ plannedDate only shows when this process has a number')
} else {
  console.error('✗ OLD_PDATE not found')
}

// Fix updatePlanNumber to save byProcessDates too
const OLD_UPDATE = `    // Planned date for this process's number
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
    })`

const NEW_UPDATE = `    // Planned date per-process
    const byProcessDates = { ...(freshPlan.byProcessDates || {}) }
    if (planNum) {
      byProcessDates[processCode] = getPlannedDateByNumber(planNum, new Date().toISOString().slice(0, 10), machine?.id)
    } else {
      delete byProcessDates[processCode]
    }

    // Primary planNumber = earliest (min) across all process numbers
    const allNums = Object.values(byProcess) as number[]
    const primaryPlan = allNums.length > 0 ? Math.min(...allNums) : null
    // Primary plannedDate = date of the earliest process
    const primaryDate = primaryPlan
      ? Object.entries(byProcess).reduce((earliest: any, [code, num]: any) => {
          if (!earliest || num <= (byProcess as any)[earliest]) return code
          return earliest
        }, null)
      : null
    const plannedDate = primaryDate ? byProcessDates[primaryDate] : null

    await fetch('/api/batches', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'update', id: batchUUID,
        date_calc_plan: primaryPlan
          ? { planNumber: primaryPlan, byProcess, byProcessDates, plannedDate }
          : null
      })
    })`

if (page.includes(OLD_UPDATE)) {
  page = page.replace(OLD_UPDATE, NEW_UPDATE)
  console.log('✓ updatePlanNumber saves byProcessDates per-process')
} else {
  console.error('✗ OLD_UPDATE not found')
}

// Fix handleCollaborationConfirm saves to also store byProcessDates
const OLD_SAVES = `      // Merge new assignments into fresh byProcess — won't overwrite other processes
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
      })`

const NEW_SAVES = `      // Merge new assignments into fresh byProcess — won't overwrite other processes
      const byProcess = { ...(freshPlan.byProcess || {}), ...procMap }
      // Build per-process dates
      const byProcessDates = { ...(freshPlan.byProcessDates || {}) }
      for (const [code, num] of Object.entries(procMap)) {
        byProcessDates[code] = getPlannedDateByNumber(num as number, baseDate, machine?.id)
      }
      // Primary = earliest plan number across all processes
      const allNums = Object.values(byProcess) as number[]
      const primaryPlan = Math.min(...allNums)
      // Primary date = date of earliest process
      const primaryCode = Object.entries(byProcess).reduce((a: any, b: any) => b[1] <= byProcess[a] ? b[0] : a, Object.keys(byProcess)[0])
      const plannedDate = byProcessDates[primaryCode] || getPlannedDateByNumber(primaryPlan, baseDate, machine?.id)
      await fetch('/api/batches', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update', id: uuid,
          date_calc_plan: { planNumber: primaryPlan, byProcess, byProcessDates, plannedDate },
        }),
      })`

if (page.includes(OLD_SAVES)) {
  page = page.replace(OLD_SAVES, NEW_SAVES)
  console.log('✓ handleCollaborationConfirm saves byProcessDates per-process')
} else {
  console.error('✗ OLD_SAVES not found')
}

fs.writeFileSync(pagePath, page, 'utf8')
console.log('\n✓ All fixes applied')
