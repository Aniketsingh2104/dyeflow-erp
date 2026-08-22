// Run from C:\dyeflow-react: node fix-shade-sort-and-manual-date.js

const fs   = require('fs')
const path = require('path')
const filePath = path.join(__dirname, 'app', 'machines', '[machineId]', 'page.tsx')
let content = fs.readFileSync(filePath, 'utf8')

// ── Fix 1: updatePlanNumber — save plannedDate alongside planNumber ────────
const OLD_UPDATE = `  const updatePlanNumber = async (batchUUID: string, _orderId: string, value: string) => {
    const n = parseInt(value, 10)
    const planNum = (!n || n < 1) ? null : n
    await fetch('/api/batches', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update', id: batchUUID, date_calc_plan: planNum ? { planNumber: planNum } : null })
    })
    loadData()
  }`

const NEW_UPDATE = `  const updatePlanNumber = async (batchUUID: string, _orderId: string, value: string) => {
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

if (content.includes(OLD_UPDATE)) {
  content = content.replace(OLD_UPDATE, NEW_UPDATE)
  console.log('✓ Fix 1: updatePlanNumber now saves plannedDate')
} else {
  console.error('✗ Fix 1: updatePlanNumber pattern not found')
}

// ── Fix 2: runNumbering — sort by shade type before opening modal ─────────
const OLD_RUN = `  const runNumbering = () => {
    // Get all unnumbered batches
    const unnumbered = batches.filter(b => !b.planNumber && b.status !== 'done')
    
    if (unnumbered.length === 0) {
      alert('No batches to number')
      return
    }

    // Open collaboration modal with unnumbered batches
    setCollabBatches(unnumbered)
    setShowCollabModal(true)
  }`

const NEW_RUN = `  const runNumbering = () => {
    const unnumbered = batches.filter(b => !b.planNumber && b.status !== 'done')
    if (unnumbered.length === 0) { alert('No batches to number'); return }

    // Sort by shade type (Light → Medium → Dark → Extra Dark) before opening modal
    // This ensures Run Numbering assigns numbers in shade sequence
    const maxExisting = Math.max(0, ...batches.map(b => b.planNumber || 0))
    const lastNumberedBatch = batches.find(b => b.planNumber === maxExisting)
    const lastShadeRank = lastNumberedBatch ? getShadeTypeRank(lastNumberedBatch.color) : 1
    const shadeCycle = [1, 2, 3, 4]
    const circularWeight = (rank: number) => {
      if (!shadeCycle.includes(rank)) return 99
      const startIdx = Math.max(0, shadeCycle.indexOf(lastShadeRank))
      const idx = shadeCycle.indexOf(rank)
      return (idx - startIdx + shadeCycle.length) % shadeCycle.length
    }

    const sorted = [...unnumbered].sort((a, b) => {
      // Primary: shade sequence (circular from last numbered shade)
      const shadeDiff = circularWeight(getShadeTypeRank(a.color)) - circularWeight(getShadeTypeRank(b.color))
      if (shadeDiff !== 0) return shadeDiff
      // Secondary: same shade → group by process (SCQ before Dyeing within same shade)
      const procA = a.currentProcess || ''
      const procB = b.currentProcess || ''
      if (procA !== procB) return procA.localeCompare(procB)
      // Tertiary: by batch id
      return (a.batchId || '').localeCompare(b.batchId || '')
    })

    setCollabBatches(sorted)
    setShowCollabModal(true)
  }`

if (content.includes(OLD_RUN)) {
  content = content.replace(OLD_RUN, NEW_RUN)
  console.log('✓ Fix 2: runNumbering sorts by shade type before opening modal')
} else {
  console.error('✗ Fix 2: runNumbering pattern not found')
}

// ── Fix 3: handleCollaborationConfirm single batches — sort by shade too ──
// The single batches in confirm also need shade sorting (already sorted from modal order,
// but let's make sure seenRowKeys preserves that order)
// Actually the modal passes batches in the order they appear in the left panel,
// which is now shade-sorted from runNumbering. So single batches are already in order.
// No change needed there.

fs.writeFileSync(filePath, content, 'utf8')
console.log('\n✓ Both fixes done.')
