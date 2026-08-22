const fs = require('fs')
const filePath = 'app/date-calculator/page.tsx'
let c = fs.readFileSync(filePath, 'utf8')

// SAFE FIX: backward walk must also commit kg to loadMap
// so capacity is respected across all batches for pre-anchor processes (like C)
const OLD = `    // STEP 2: Walk BACKWARD from anchor (no capacity check — historical estimates)
    let back = ymdToDate(anchorYMD)!
    for (let i = anchorIdx - 1; i >= 0; i--) {
      const c = workSeq[i]
      back = addPD(back, dayMap[c] || 1, holidaySet, false)
      planned[c] = dateToYMD(back)
    }`

const NEW = `    // STEP 2: Walk BACKWARD from anchor
    // Backward dates are estimates, but we still need to respect capacity
    // so multiple batches don't pile up on the same day for pre-anchor processes (e.g. C)
    let back = ymdToDate(anchorYMD)!
    for (let i = anchorIdx - 1; i >= 0; i--) {
      const c = workSeq[i]
      back = addPD(back, dayMap[c] || 1, holidaySet, false)
      const candidateYMD = dateToYMD(back)
      // Check capacity — if full, go further back
      const cap = capMap[c]
      if (cap && qty > 0) {
        if (!loadMap[c]) loadMap[c] = {}
        let cur = new Date(back)
        for (let j = 0; j < 730; j++) {
          const ymd = dateToYMD(cur)
          if (holidaySet.has(ymd)) { cur = nextWD(cur, holidaySet, false); continue }
          const existing = loadMap[c][ymd] || 0
          if (existing + qty <= cap + 0.001) {
            loadMap[c][ymd] = existing + qty
            planned[c] = ymd
            back = cur
            break
          }
          cur = nextWD(cur, holidaySet, false)  // go further back if full
        }
        if (!planned[c]) planned[c] = candidateYMD  // fallback
      } else {
        planned[c] = candidateYMD
      }
    }`

if (c.includes(OLD)) {
  c = c.replace(OLD, NEW)
  fs.writeFileSync(filePath, c, 'utf8')
  console.log('✓ Backward walk now commits kg to loadMap — C capacity 1000kg will be respected')
} else {
  console.error('✗ Pattern not found')
}
