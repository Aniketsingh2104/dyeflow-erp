const fs = require('fs')
const filePath = 'app/date-calculator/page.tsx'
let c = fs.readFileSync(filePath, 'utf8')

// Fix 1: Tail should only append items NOT already in the route
// Fix 2: Forward walk uses pDays[prev] but when no processDurations set,
//        we need to make sure Qa/QA case-insensitive matching works

const OLD_TAIL = `      // STEP 4: Append tail (QA, Packing, Dispatch) with capacity check
      const TAIL = ['QA', 'Packing', 'Dispatch']
      let endDate = ymdToDate(planned[workSeq[workSeq.length - 1]])!
      for (const c of TAIL) {
        endDate = addPD(endDate, dayMap[c] || 1, true)
        planned[c] = fitDate(c, dateToStr(endDate), qty)
        endDate = ymdToDate(planned[c]) || endDate
      }`

const NEW_TAIL = `      // STEP 4: Append tail (QA, Packing, Dispatch) ONLY if not already in route
      const TAIL = ['QA', 'Packing', 'Dispatch']
      const workSeqLower = workSeq.map((x: string) => x.toLowerCase())
      let endDate = ymdToDate(planned[workSeq[workSeq.length - 1]])!
      for (const tc of TAIL) {
        // Skip if already handled in main route walk
        if (workSeqLower.includes(tc.toLowerCase())) continue
        endDate = addPD(endDate, dayMap[tc] || dayMap[workSeq[workSeq.length-1]] || 1, true)
        planned[tc] = fitDate(tc, dateToStr(endDate), qty)
        endDate = ymdToDate(planned[tc]) || endDate
      }`

if (c.includes(OLD_TAIL)) {
  c = c.replace(OLD_TAIL, NEW_TAIL)
  console.log('✓ Tail only appends QA/Packing/Dispatch if not already in route')
} else {
  console.error('✗ Tail pattern not found')
}

// Fix 2: dayMap should be case-insensitive — normalize all keys to match
// The route has 'QA' but processDurations might store 'Qa'
// Solution: when building dayMap, add both cases
const OLD_BUILDMAP = `  const buildMaps = () => {
    const dayMap: Record<string, number> = {}
    const capMap: Record<string, number> = {}
    processDurations.forEach(d => {
      const code = String(d.code || '').trim(); if (!code) return
      dayMap[code] = d.days > 0 ? d.days : 1
      if (d.capacity && d.capacity > 0) capMap[code] = d.capacity
    })
    ALL_PROCESS_CODES.forEach(c => { if (!dayMap[c]) dayMap[c] = 1 })
    return { dayMap, capMap }
  }`

const NEW_BUILDMAP = `  const buildMaps = () => {
    const dayMap: Record<string, number> = {}
    const capMap: Record<string, number> = {}
    processDurations.forEach(d => {
      const code = String(d.code || '').trim(); if (!code) return
      const days = d.days > 0 ? d.days : 1
      dayMap[code] = days
      // Also store lowercase alias for case-insensitive matching
      dayMap[code.toLowerCase()] = days
      if (d.capacity && d.capacity > 0) {
        capMap[code] = d.capacity
        capMap[code.toLowerCase()] = d.capacity
      }
    })
    // Default 1 day for all known process codes
    ALL_PROCESS_CODES.forEach(code => {
      if (!dayMap[code]) dayMap[code] = 1
      if (!dayMap[code.toLowerCase()]) dayMap[code.toLowerCase()] = 1
    })
    return { dayMap, capMap }
  }`

if (c.includes(OLD_BUILDMAP)) {
  c = c.replace(OLD_BUILDMAP, NEW_BUILDMAP)
  console.log('✓ buildMaps now case-insensitive')
} else {
  console.error('✗ buildMaps pattern not found')
}

fs.writeFileSync(filePath, c, 'utf8')
console.log('\n✓ Done')
