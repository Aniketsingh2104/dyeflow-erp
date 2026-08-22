const fs = require('fs')
const filePath = 'app/fms/[process]/page.tsx'
let c = fs.readFileSync(filePath, 'utf8')

// Fix: planned date should use batch's current_process code, not page's processCode
// Because a batch on C page should show d_c, but a batch that moved from D to C
// via rollback might have different process code stored

const OLD = `        // Planned date from batch_date_plans for THIS process
        const dp = dpMap[b.id] || {}
        const procColKey = PROC_COL[processCode] || PROC_COL[
          Object.keys(PROC_COL).find(k => k.toUpperCase() === processCode) || ''
        ] || ''
        const planned = procColKey && dp[procColKey]
          ? dp[procColKey].slice(0, 10)  // YYYY-MM-DD
          : ''`

const NEW = `        // Planned date from batch_date_plans for THIS process
        // Use the batch's current_process to find the right d_* column
        // This handles case where route stores 'Qa' but URL has 'QA' etc.
        const dp = dpMap[b.id] || {}
        // Try current_process first, then processCode, then case-insensitive match
        const batchProc = b.current_process || processCode
        const procColKey = PROC_COL[batchProc]
          || PROC_COL[processCode]
          || PROC_COL[Object.keys(PROC_COL).find(k =>
              k.toUpperCase() === processCode || k.toUpperCase() === batchProc?.toUpperCase()
            ) || '']
          || ''
        const planned = procColKey && dp[procColKey]
          ? dp[procColKey].slice(0, 10)  // YYYY-MM-DD
          : ''`

if (c.includes(OLD)) {
  c = c.replace(OLD, NEW)
  fs.writeFileSync(filePath, c, 'utf8')
  console.log('✓ Planned date now uses batch current_process for correct d_* column lookup')
} else {
  console.error('✗ Pattern not found')
}
