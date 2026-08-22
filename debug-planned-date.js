const fs = require('fs')
const path = require('path')
const filePath = path.join('app', 'machines', '[machineId]', 'page.tsx')
let c = fs.readFileSync(filePath, 'utf8')

// THE ONLY FIX NEEDED:
// In loadData, the plannedDate IIFE falls back to getPlannedDateByNumber(procNum,...)
// when byProcessDates is missing. This is CORRECT for numbered rows.
// But for SCQ with NO number (procNum = null/undefined), it should return ''.
// The check `if (!procNum) return ''` should handle this.
//
// PROBLEM: byProcess.S doesn't exist yet when SCQ is unnumbered,
// so procNum = undefined, and we return '' correctly.
// BUT the old code `b.date_calc_plan?.plannedDate` was still there as fallback.
//
// Let's verify what's actually in the file right now:

const hasByProcessDates = c.includes('byProcessDates')
const hasIIFE = c.includes('const procNum = b.date_calc_plan?.byProcess?.[displayProcess]')
const hasOldFallback = c.includes('|| b.date_calc_plan?.plannedDate ||')

console.log('Has byProcessDates:', hasByProcessDates)
console.log('Has IIFE:', hasIIFE)
console.log('Has old fallback:', hasOldFallback)

// Find the exact plannedDate line
const idx = c.indexOf('plannedDate:')
const snippet = c.substring(idx, idx + 400)
console.log('\nCurrent plannedDate code:\n', snippet)
