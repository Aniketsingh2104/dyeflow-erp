const fs = require('fs')
const path = require('path')
const filePath = path.join('app', 'machines', '[machineId]', 'page.tsx')
let c = fs.readFileSync(filePath, 'utf8')

// THE ROOT CAUSE: plannedDate falls back to b.date_calc_plan?.plannedDate
// which belongs to Dyeing, but SCQ row reads it too since it's top-level
// Fix: calculate planned date from byProcess[displayProcess] directly, never use top-level plannedDate

const OLD = `            // plannedDate per-process: only show date if THIS process has a plan number
            plannedDate:    b.date_calc_plan?.byProcess?.[displayProcess]
              ? (b.date_calc_plan?.byProcessDates?.[displayProcess] || b.date_calc_plan?.plannedDate || '')
              : '',`

const NEW = `            // plannedDate per-process: ONLY show date if THIS process has a plan number
            // NEVER fall back to top-level plannedDate — that belongs to a different process
            plannedDate:    (() => {
              const procNum = b.date_calc_plan?.byProcess?.[displayProcess]
              if (!procNum) return ''  // no number for this process = no date
              // Use per-process date if saved, otherwise calculate from the number
              return b.date_calc_plan?.byProcessDates?.[displayProcess]
                || getPlannedDateByNumber(procNum, new Date().toISOString().slice(0, 10), foundMachine.id)
            })(),`

if (c.includes(OLD)) {
  c = c.replace(OLD, NEW)
  fs.writeFileSync(filePath, c, 'utf8')
  console.log('✓ plannedDate now strictly per-process - never shows top-level plannedDate')
} else {
  // Try alternate pattern (if fix-all-final.js already ran with different text)
  const OLD2 = `            plannedDate:    b.date_calc_plan?.plannedDate || '',`
  const NEW2 = `            // plannedDate per-process: ONLY show date if THIS process has a plan number
            plannedDate:    (() => {
              const procNum = b.date_calc_plan?.byProcess?.[displayProcess]
              if (!procNum) return ''
              return b.date_calc_plan?.byProcessDates?.[displayProcess]
                || getPlannedDateByNumber(procNum, new Date().toISOString().slice(0, 10), foundMachine.id)
            })(),`
  if (c.includes(OLD2)) {
    c = c.replace(OLD2, NEW2)
    fs.writeFileSync(filePath, c, 'utf8')
    console.log('✓ plannedDate fixed (alt pattern)')
  } else {
    console.error('✗ Neither pattern found')
    // Show what exists around plannedDate
    const idx = c.indexOf('plannedDate:')
    if (idx > -1) console.log('Current plannedDate line:', c.substring(idx, idx + 200))
  }
}
