const fs = require('fs')
const filePath = 'app/date-calculator/page.tsx'
let c = fs.readFileSync(filePath, 'utf8')

// Fix 1: In loadData — after merging byProcessDates into dateCalcPlan,
// mark those process codes as "machine-anchored" so engine never overwrites them
// We store them in a special key: __machineAnchors: ['D','S']

const OLD_MERGE = `          // Then merge machine-numbered dates from byProcessDates (convert YYYY-MM-DD to DD/MM/YYYY)
          const byProcessDates: Record<string, string> = rawPlan.byProcessDates || {}
          for (const [processCode, isoDate] of Object.entries(byProcessDates)) {
            if (isoDate && typeof isoDate === 'string') {
              // Convert 2026-08-03 → 03/08/2026 for Date Calculator display format
              const parts = isoDate.slice(0, 10).split('-')
              if (parts.length === 3) {
                dateCalcPlan[processCode] = \`\${parts[2]}/\${parts[1]}/\${parts[0]}\`
              }
            }
          }`

const NEW_MERGE = `          // Then merge machine-numbered dates from byProcessDates (convert YYYY-MM-DD to DD/MM/YYYY)
          // These are FIXED ANCHORS — the engine must never overwrite them
          const byProcessDates: Record<string, string> = rawPlan.byProcessDates || {}
          const machineAnchors: string[] = []
          for (const [processCode, isoDate] of Object.entries(byProcessDates)) {
            if (isoDate && typeof isoDate === 'string') {
              const parts = isoDate.slice(0, 10).split('-')
              if (parts.length === 3) {
                dateCalcPlan[processCode] = \`\${parts[2]}/\${parts[1]}/\${parts[0]}\`
                machineAnchors.push(processCode)  // mark as machine-anchored
              }
            }
          }`

if (c.includes(OLD_MERGE)) {
  c = c.replace(OLD_MERGE, NEW_MERGE)
  console.log('✓ loadData marks machine-anchored process codes')
} else {
  console.error('✗ merge pattern not found')
}

// Fix 2: Pass machineAnchors into batch object so engine can see them
const OLD_BATCH = `          const batch: Batch = {
            batchId:          b.batch_id || b.id,
            batchNumber:      b.batch_number || 0,
            kg:               parseFloat(b.kg) || 0,
            plannedDate:      machineDateSummary,   // shows machine process dates in DATE column
            dateCalcPlan,
            dcGeneratedOnce:  b.dc_generated_once || false,
            dcRegenerate:     b.dc_regenerate     || false,
          }`

const NEW_BATCH = `          const batch: Batch = {
            batchId:          b.batch_id || b.id,
            batchNumber:      b.batch_number || 0,
            kg:               parseFloat(b.kg) || 0,
            plannedDate:      machineDateSummary,
            dateCalcPlan,
            machineAnchors,   // process codes whose dates must not be overwritten by engine
            dcGeneratedOnce:  b.dc_generated_once || false,
            dcRegenerate:     b.dc_regenerate     || false,
          }`

if (c.includes(OLD_BATCH)) {
  c = c.replace(OLD_BATCH, NEW_BATCH)
  console.log('✓ batch object carries machineAnchors list')
} else {
  console.error('✗ batch object pattern not found')
}

// Fix 3: Update Batch interface to include machineAnchors
const OLD_IFACE = `interface Batch {
  batchId: string
  batchNumber: number
  kg: number
  date?: string
  dateCalcPlan: Record<string, string>
  dcRegenerate?: boolean
  dcGeneratedOnce?: boolean
  plannedDate?: string
}`

const NEW_IFACE = `interface Batch {
  batchId: string
  batchNumber: number
  kg: number
  date?: string
  dateCalcPlan: Record<string, string>
  machineAnchors?: string[]  // process codes fixed by machine numbering - engine must not overwrite
  dcRegenerate?: boolean
  dcGeneratedOnce?: boolean
  plannedDate?: string
}`

if (c.includes(OLD_IFACE)) {
  c = c.replace(OLD_IFACE, NEW_IFACE)
  console.log('✓ Batch interface updated with machineAnchors')
} else {
  console.error('✗ Batch interface pattern not found')
}

// Fix 4: In dcPlanAllRows engine — never overwrite machine-anchored dates
// The anchor selection already picks the machine date as anchor
// But fitDate on the anchor might move it — skip fitDate for machine-anchored codes
// Also when writing planned[] back to plan[], skip machine-anchored codes

const OLD_ANCHOR_FIT = `      // STEP 1: Pick anchor = latest date among anchors in route
      let anchorProc = '', anchorYMD = ''
      for (const [proc, ymd] of Object.entries(anchorsInRoute)) {
        if (!anchorYMD || ymd > anchorYMD) { anchorYMD = ymd; anchorProc = proc }
      }
      const anchorIdx = workSeq.indexOf(anchorProc)
      if (anchorIdx < 0) { result.skipped++; continue }

      const planned: Record<string, string> = { [anchorProc]: anchorYMD }`

const NEW_ANCHOR_FIT = `      // STEP 1: Pick anchor = latest date among anchors in route
      let anchorProc = '', anchorYMD = ''
      for (const [proc, ymd] of Object.entries(anchorsInRoute)) {
        if (!anchorYMD || ymd > anchorYMD) { anchorYMD = ymd; anchorProc = proc }
      }
      const anchorIdx = workSeq.indexOf(anchorProc)
      if (anchorIdx < 0) { result.skipped++; continue }

      // Machine anchors: dates fixed by machine numbering — engine must NEVER overwrite these
      const machineAnchorSet = new Set<string>(batch.machineAnchors || [])

      // Use anchor date as-is (no fitDate) — machine date is fixed
      const planned: Record<string, string> = { [anchorProc]: anchorYMD }`

if (c.includes(OLD_ANCHOR_FIT)) {
  c = c.replace(OLD_ANCHOR_FIT, NEW_ANCHOR_FIT)
  console.log('✓ Engine uses machineAnchorSet to protect fixed dates')
} else {
  console.error('✗ anchor fit pattern not found')
}

// Fix 5: When writing planned back to plan, skip machine-anchored codes
const OLD_WRITE = `      // Write to plan in display format DD/MM/YYYY
      workSeq.forEach(c => { if (planned[c]) plan[c] = toDisplay(planned[c]) })
      TAIL.forEach(c => { if (planned[c]) plan[c] = toDisplay(planned[c]) })`

const NEW_WRITE = `      // Write to plan in display format DD/MM/YYYY
      // NEVER overwrite machine-anchored dates — they are fixed by machine numbering
      workSeq.forEach(c => {
        if (machineAnchorSet.has(c)) return  // skip — machine date is sacred
        if (planned[c]) plan[c] = toDisplay(planned[c])
      })
      TAIL.forEach(c => {
        if (machineAnchorSet.has(c)) return  // skip
        if (planned[c]) plan[c] = toDisplay(planned[c])
      })`

if (c.includes(OLD_WRITE)) {
  c = c.replace(OLD_WRITE, NEW_WRITE)
  console.log('✓ Engine write-back skips machine-anchored process codes')
} else {
  console.error('✗ write-back pattern not found')
}

// Fix 6: Forward and backward walk — also skip machine-anchored codes (don't overwrite)
const OLD_BACK_WRITE = `        back = addPD(back, dayMap[c] || 1, false)
        planned[c] = fitDateBack(c, dateToStr(back), qty)
        back = ymdToDate(planned[c]) || back`

const NEW_BACK_WRITE = `        back = addPD(back, dayMap[c] || 1, false)
        if (!machineAnchorSet.has(c)) {
          planned[c] = fitDateBack(c, dateToStr(back), qty)
          back = ymdToDate(planned[c]) || back
        }`

if (c.includes(OLD_BACK_WRITE)) {
  c = c.replace(OLD_BACK_WRITE, NEW_BACK_WRITE)
  console.log('✓ Backward walk skips machine-anchored codes')
} else {
  console.error('✗ backward walk write pattern not found')
}

const OLD_FWD_WRITE = `          planned[c] = fitDate(c, dateToStr(fwd), qty)
          fwd = ymdToDate(planned[c]) || fwd
        }
        t.pushed = true
      } else {
        // STEP 3B: Future anchor → keep backward dates, walk forward from anchor with capacity check
        let fwd = ymdToDate(anchorYMD)!
        for (let i = anchorIdx + 1; i < workSeq.length; i++) {
          const c    = workSeq[i]
          const prev = workSeq[i - 1]
          fwd = addPD(fwd, dayMap[prev] || 1, true)
          planned[c] = fitDate(c, dateToStr(fwd), qty)
          fwd = ymdToDate(planned[c]) || fwd
        }
      }`

const NEW_FWD_WRITE = `          if (!machineAnchorSet.has(c)) {
            planned[c] = fitDate(c, dateToStr(fwd), qty)
            fwd = ymdToDate(planned[c]) || fwd
          }
        }
        t.pushed = true
      } else {
        // STEP 3B: Future anchor → keep backward dates, walk forward from anchor with capacity check
        let fwd = ymdToDate(anchorYMD)!
        for (let i = anchorIdx + 1; i < workSeq.length; i++) {
          const c    = workSeq[i]
          const prev = workSeq[i - 1]
          fwd = addPD(fwd, dayMap[prev] || 1, true)
          if (!machineAnchorSet.has(c)) {
            planned[c] = fitDate(c, dateToStr(fwd), qty)
            fwd = ymdToDate(planned[c]) || fwd
          }
        }
      }`

if (c.includes(OLD_FWD_WRITE)) {
  c = c.replace(OLD_FWD_WRITE, NEW_FWD_WRITE)
  console.log('✓ Forward walk skips machine-anchored codes')
} else {
  console.error('✗ forward walk write pattern not found')
}

fs.writeFileSync(filePath, c, 'utf8')
console.log('\n✓ All fixes applied — machine dates are now sacred, engine never overwrites them')
