// Run from C:\dyeflow-react: node fix-machine-process-fallback.js
// Fixes the fallback in machine page to only use MACHINE_REQUIRED process codes
// MACHINE_REQUIRED = ['S', 'D', 'S2', 'Add', 'Lev', 'Fix', 'Wash', 'Rc']

const fs   = require('fs')
const path = require('path')

const MACHINE_REQUIRED = ['S', 'D', 'S2', 'Add', 'Lev', 'Fix', 'Wash', 'Rc']

// Fix machine detail page
const detailPath = path.join(__dirname, 'app', 'machines', '[machineId]', 'page.tsx')
let detail = fs.readFileSync(detailPath, 'utf8')

const oldFallback = `          // Priority: actual current_process > machine-matched process from order > first route step
          const displayProcess = b.current_process || machineProcessCode || processRoute[0] || ''
          const processName = displayProcess ? (procMap[displayProcess] || displayProcess) : '-'`

const newFallback = `          // Priority: actual current_process > machine-matched process from order
          // > first MACHINE_REQUIRED step in route (never fallback to non-machine steps like CBR)
          const MACHINE_REQUIRED = ['S', 'D', 'S2', 'Add', 'Lev', 'Fix', 'Wash', 'Rc']
          const firstMachineStep = processRoute.find((c: string) => MACHINE_REQUIRED.includes(c)) || ''
          const displayProcess = b.current_process || machineProcessCode || firstMachineStep
          const processName = displayProcess ? (procMap[displayProcess] || displayProcess) : '-'`

if (detail.includes(oldFallback)) {
  detail = detail.replace(oldFallback, newFallback)
  fs.writeFileSync(detailPath, detail, 'utf8')
  console.log('✓ machine detail page: fallback now uses first MACHINE_REQUIRED step, not processRoute[0]')
} else {
  console.error('✗ detail page pattern not found')
}

// Fix machine list page
const listPath = path.join(__dirname, 'app', 'machines', 'page.tsx')
let list = fs.readFileSync(listPath, 'utf8')

const oldListFallback = `        const batchRoute: string[] = b.process_route?.length ? b.process_route : (o.process_route || [])
        const displayProcess = b.current_process || machineProcessCode || batchRoute[0] || ''
        const processName = displayProcess ? (procMap[displayProcess] || displayProcess) : '—'`

const newListFallback = `        const batchRoute: string[] = b.process_route?.length ? b.process_route : (o.process_route || [])
        const MACHINE_REQUIRED = ['S', 'D', 'S2', 'Add', 'Lev', 'Fix', 'Wash', 'Rc']
        const firstMachineStep = batchRoute.find((c: string) => MACHINE_REQUIRED.includes(c)) || ''
        const displayProcess = b.current_process || machineProcessCode || firstMachineStep
        const processName = displayProcess ? (procMap[displayProcess] || displayProcess) : '—'`

if (list.includes(oldListFallback)) {
  list = list.replace(oldListFallback, newListFallback)
  fs.writeFileSync(listPath, list, 'utf8')
  console.log('✓ machine list page: fallback now uses first MACHINE_REQUIRED step, not batchRoute[0]')
} else {
  console.error('✗ list page pattern not found')
}

console.log('\n✓ Done — machine pages will never show CBR/Heat-Set/Finish etc as process names')
