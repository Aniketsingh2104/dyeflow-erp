const fs = require('fs')
const filePath = 'app/date-calculator/page.tsx'
let c = fs.readFileSync(filePath, 'utf8')

// Fix: backward walk should also respect capacity
// Instead of just assigning the date directly, call fitDate (but walk backward means
// we need a backward fitDate — find nearest date <= candidate that has capacity)

const OLD_BACK = `      // STEP 2: Walk BACKWARD from anchor (no capacity check — historical estimates)
      let back = ymdToDate(anchorYMD)!
      for (let i = anchorIdx - 1; i >= 0; i--) {
        const c = workSeq[i]
        back = addPD(back, dayMap[c] || 1, false)
        planned[c] = dateToStr(back)
      }`

const NEW_BACK = `      // STEP 2: Walk BACKWARD from anchor WITH capacity check
      // fitDateBack: find nearest working date <= candidate with available capacity
      const fitDateBack = (proc: string, candidateYMD: string, qty: number): string => {
        if (!candidateYMD) return ''
        let cur = ymdToDate(candidateYMD); if (!cur) return candidateYMD
        while (holidaySet.has(dateToStr(cur))) cur = nextWD(cur, false)
        const cap = capMap[proc]
        if (!cap || qty <= 0) return dateToStr(cur)
        if (!loadMap[proc]) loadMap[proc] = {}
        for (let i = 0; i < 730; i++) {
          const ymd = dateToStr(cur)
          if (holidaySet.has(ymd)) { cur = nextWD(cur, false); continue }
          const existing = loadMap[proc][ymd] || 0
          if (existing + qty <= cap + 0.001) {
            loadMap[proc][ymd] = existing + qty
            return ymd
          }
          cur = nextWD(cur, false)  // go further back if over capacity
        }
        return dateToStr(cur)
      }

      let back = ymdToDate(anchorYMD)!
      for (let i = anchorIdx - 1; i >= 0; i--) {
        const c = workSeq[i]
        back = addPD(back, dayMap[c] || 1, false)
        planned[c] = fitDateBack(c, dateToStr(back), qty)
        back = ymdToDate(planned[c]) || back
      }`

if (c.includes(OLD_BACK)) {
  c = c.replace(OLD_BACK, NEW_BACK)
  fs.writeFileSync(filePath, c, 'utf8')
  console.log('✓ Backward walk now has capacity check via fitDateBack')
  console.log('  If C process is full on 07-Aug, it pushes to 06-Aug, 05-Aug etc')
} else {
  console.error('✗ Pattern not found')
}
