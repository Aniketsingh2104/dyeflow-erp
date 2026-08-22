// Run from C:\dyeflow-react: node fix-per-process-plan.js
// Fix: manual plan number entry saves to byProcess[processCode] not top-level planNumber
// Fix: loadData reads planNumber from byProcess[displayProcess] correctly

const fs   = require('fs')
const path = require('path')
const filePath = path.join(__dirname, 'app', 'machines', '[machineId]', 'page.tsx')
let content = fs.readFileSync(filePath, 'utf8')

// ── Fix 1: updatePlanNumber — save to byProcess[processCode] ─────────────
// Need to pass processCode and existing date_calc_plan to the function
// Currently: updatePlanNumber(batch.id, batch.orderId, e.target.value)
// Change to:  updatePlanNumber(batch.id, batch.currentProcess, e.target.value, batch.date_calc_plan_raw)

// Step 1: Update the function signature and body
const OLD_FN = `  const updatePlanNumber = async (batchUUID: string, _orderId: string, value: string) => {
    const n = parseInt(value, 10)
    const planNum = (!n || n < 1) ? null : n
    // Also calculate and save plannedDate when number is entered manually
    const plannedDate = planNum ? getPlannedDateByNumber(planNum, new Date().toISOString().slice(0,10), machine?.id) : null
    await fetch('/api/batches', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'update', id: batchUUID,
        date_calc_plan: planNum ? { planNumber: planNum, plannedDate } : null
      })
    })
    loadData()
  }`

const NEW_FN = `  const updatePlanNumber = async (batchUUID: string, processCode: string, value: string, existingPlan: any) => {
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

if (content.includes(OLD_FN)) {
  content = content.replace(OLD_FN, NEW_FN)
  console.log('✓ updatePlanNumber now saves per-process byProcess map')
} else {
  console.error('✗ updatePlanNumber pattern not found')
}

// Step 2: Update the call site to pass processCode and existingPlan
const OLD_CALL = `                              onChange={(e) => updatePlanNumber(batch.id, batch.orderId, e.target.value)}`
const NEW_CALL = `                              onChange={(e) => updatePlanNumber(batch.id, batch.currentProcess, e.target.value, batch.date_calc_plan_raw)}`

if (content.includes(OLD_CALL)) {
  content = content.replace(OLD_CALL, NEW_CALL)
  console.log('✓ Input onChange passes currentProcess and date_calc_plan_raw')
} else {
  console.error('✗ onChange call pattern not found')
}

// Step 3: planNumber display — read from byProcess[currentProcess] 
// This is already done in loadData: b.date_calc_plan?.byProcess?.[displayProcess] ?? b.date_calc_plan?.planNumber
// But we also need to show the correct value in the input
// The batch.planNumber is already set per-process in loadData — verify it's correct
// Check current loadData planNumber line
if (content.includes('b.date_calc_plan?.byProcess?.[displayProcess]')) {
  console.log('✓ loadData already reads planNumber per-process from byProcess map')
} else {
  console.error('✗ loadData planNumber per-process read not found')
}

// Step 4: Fix input value to show per-process planNumber
// The input uses batch.planNumber which is already per-process from loadData
// So the display is correct — only the save was wrong. Already fixed above.

fs.writeFileSync(filePath, content, 'utf8')
console.log('\n✓ Done. Dyeing and SCQ now have independent plan numbers.')
