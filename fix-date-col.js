const fs = require('fs')
const filePath = 'app/date-calculator/page.tsx'
let c = fs.readFileSync(filePath, 'utf8')

// Fix 1: In loadData, batch.plannedDate should come from byProcessDates not order's Dispatch
const OLD = `          const batch: Batch = {
            batchId:          b.batch_id || b.id,
            batchNumber:      b.batch_number || 0,
            kg:               parseFloat(b.kg) || 0,
            plannedDate:      (order.planned_dates || {})['Dispatch'] || '',
            dateCalcPlan,
            dcGeneratedOnce:  b.dc_generated_once || false,
            dcRegenerate:     b.dc_regenerate     || false,
          }`

const NEW = `          // plannedDate for DATE column: show machine process dates summary
          // Format: "S: 05/08 / D: 03/08" from byProcessDates
          const byPD = rawPlan.byProcessDates || {}
          const machineDateSummary = Object.entries(byPD)
            .filter(([, v]) => v)
            .map(([k, v]) => {
              const parts = String(v).slice(0,10).split('-')
              const display = parts.length === 3 ? \`\${parts[2]}/\${parts[1]}/\${parts[0]}\` : String(v)
              return \`\${k}: \${display}\`
            })
            .join(' / ')

          const batch: Batch = {
            batchId:          b.batch_id || b.id,
            batchNumber:      b.batch_number || 0,
            kg:               parseFloat(b.kg) || 0,
            plannedDate:      machineDateSummary,   // shows machine process dates in DATE column
            dateCalcPlan,
            dcGeneratedOnce:  b.dc_generated_once || false,
            dcRegenerate:     b.dc_regenerate     || false,
          }`

if (c.includes(OLD)) {
  c = c.replace(OLD, NEW)
  fs.writeFileSync(filePath, c, 'utf8')
  console.log('✓ DATE column now shows machine process dates (S: 05/08 / D: 03/08)')
} else {
  console.error('✗ Pattern not found')
  const i = c.indexOf('plannedDate:')
  console.log('Current plannedDate line:', c.substring(i, i+100))
}
