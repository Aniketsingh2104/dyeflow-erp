const fs = require('fs')
const path = require('path')
const filePath = path.join('app', 'date-calculator', 'page.tsx')
let c = fs.readFileSync(filePath, 'utf8')

// Fix: when building dateCalcPlan from batch, merge byProcess dates into it
// Machine numbering saves: date_calc_plan = { byProcess: {D: 2, S: 5}, byProcessDates: {D: "2026-08-03", S: "2026-08-05"} }
// Date Calculator expects: dateCalcPlan = { D: "03/08/2026", S: "05/08/2026" }

const OLD = `          // date_calc_plan is stored in batches.date_calc_plan (jsonb) or rebuild empty
          const dateCalcPlan: Record<string, string> = b.date_calc_plan || {}`

const NEW = `          // date_calc_plan is stored in batches.date_calc_plan (jsonb) or rebuild empty
          // Machine numbering saves dates in byProcessDates — merge them into flat dateCalcPlan
          const rawPlan = b.date_calc_plan || {}
          const dateCalcPlan: Record<string, string> = {}
          // First copy any existing flat dates (from Generate Dates)
          for (const [k, v] of Object.entries(rawPlan)) {
            if (k !== 'byProcess' && k !== 'byProcessDates' && k !== 'planNumber' && k !== 'plannedDate' && v) {
              dateCalcPlan[k] = String(v)
            }
          }
          // Then merge machine-numbered dates from byProcessDates (convert YYYY-MM-DD to DD/MM/YYYY)
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

if (c.includes(OLD)) {
  c = c.replace(OLD, NEW)
  fs.writeFileSync(filePath, c, 'utf8')
  console.log('✓ Date Calculator now reads byProcessDates from machine numbering')
  console.log('  D: "2026-08-03" → dateCalcPlan.D = "03/08/2026"')
  console.log('  S: "2026-08-05" → dateCalcPlan.S = "05/08/2026"')
} else {
  console.error('✗ Pattern not found')
  const i = c.indexOf('date_calc_plan is stored')
  if (i > -1) console.log('Current code:', c.substring(i, i + 200))
}
