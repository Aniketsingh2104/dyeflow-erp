const fs = require('fs')
const filePath = 'app/date-calculator/page.tsx'
let c = fs.readFileSync(filePath, 'utf8')

// THE FIX: In loadData, byProcessDates should only fill columns that are
// EMPTY in the flat plan — not overwrite engine-generated dates
// If flat plan already has D=09/08/2026 (engine date), keep it
// Only use byProcessDates.D if flat plan has no D date at all

const OLD = `          // Then merge machine-numbered dates from byProcessDates (convert YYYY-MM-DD to DD/MM/YYYY)
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

const NEW = `          // Merge machine-numbered dates from byProcessDates
          // RULE: only fill a column if flat plan does NOT already have a date for it
          // This preserves engine-generated dates while still providing machine dates as fallback anchor
          const byProcessDates: Record<string, string> = rawPlan.byProcessDates || {}
          const machineAnchors: string[] = []
          for (const [processCode, isoDate] of Object.entries(byProcessDates)) {
            if (isoDate && typeof isoDate === 'string') {
              const parts = isoDate.slice(0, 10).split('-')
              if (parts.length === 3) {
                const displayDate = \`\${parts[2]}/\${parts[1]}/\${parts[0]}\`
                // Only overwrite if flat plan has no date for this process
                if (!dateCalcPlan[processCode]) {
                  dateCalcPlan[processCode] = displayDate
                }
                machineAnchors.push(processCode)  // mark as anchor regardless
              }
            }
          }`

if (c.includes(OLD)) {
  c = c.replace(OLD, NEW)
  fs.writeFileSync(filePath, c, 'utf8')
  console.log('✓ Fixed: byProcessDates only fills empty columns, never overwrites engine-generated dates')
} else {
  console.error('✗ Pattern not found')
}
