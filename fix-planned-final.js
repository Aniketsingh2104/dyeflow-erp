const fs = require('fs')
const path = require('path')
const filePath = path.join('app', 'machines', '[machineId]', 'page.tsx')
let c = fs.readFileSync(filePath, 'utf8')

// Run debug first
const hasByProcessDates = c.includes('byProcessDates')
const hasIIFE = c.includes('const procNum = b.date_calc_plan?.byProcess?.[displayProcess]')
const hasOldFallback = c.includes('|| b.date_calc_plan?.plannedDate ||')
const idx = c.indexOf('plannedDate:')
console.log('Has byProcessDates:', hasByProcessDates)
console.log('Has IIFE:', hasIIFE)
console.log('Has old fallback:', hasOldFallback)
console.log('plannedDate snippet:', c.substring(idx, idx + 300))
console.log()

// Remove ALL variants of plannedDate line and replace with strict version
// Strategy: find the plannedDate line in the batch push object and replace it entirely

// Pattern 1: old simple fallback
const P1 = `            plannedDate:    b.date_calc_plan?.plannedDate || '',`
// Pattern 2: conditional with old fallback  
const P2 = `            // plannedDate per-process: only show date if THIS process has a plan number
            plannedDate:    b.date_calc_plan?.byProcess?.[displayProcess]
              ? (b.date_calc_plan?.byProcessDates?.[displayProcess] || b.date_calc_plan?.plannedDate || '')
              : '',`
// Pattern 3: IIFE version (correct)
const P3 = `            // plannedDate per-process: ONLY show date if THIS process has a plan number
            // NEVER fall back to top-level plannedDate — that belongs to a different process
            plannedDate:    (() => {
              const procNum = b.date_calc_plan?.byProcess?.[displayProcess]
              if (!procNum) return ''  // no number for this process = no date
              // Use per-process date if saved, otherwise calculate from the number
              return b.date_calc_plan?.byProcessDates?.[displayProcess]
                || getPlannedDateByNumber(procNum, new Date().toISOString().slice(0, 10), foundMachine.id)
            })(),`

// The CORRECT replacement - strict: no number = no date, period
const CORRECT = `            // RULE: no plan number for this process = no planned date, period
            plannedDate:    (() => {
              const num = b.date_calc_plan?.byProcess?.[displayProcess]
              if (!num) return ''
              return getPlannedDateByNumber(num, new Date().toISOString().slice(0, 10), foundMachine.id)
            })(),`

let replaced = false
if (c.includes(P1)) { c = c.replace(P1, CORRECT); replaced = true; console.log('Replaced P1') }
else if (c.includes(P2)) { c = c.replace(P2, CORRECT); replaced = true; console.log('Replaced P2') }
else if (c.includes(P3)) { c = c.replace(P3, CORRECT); replaced = true; console.log('Replaced P3') }
else { console.error('No pattern matched! Manual fix needed.') }

if (replaced) {
  fs.writeFileSync(filePath, c, 'utf8')
  console.log('File saved.')
  console.log('\nVerify - new plannedDate code:')
  const newIdx = c.indexOf('plannedDate:')
  console.log(c.substring(newIdx, newIdx + 200))
}
