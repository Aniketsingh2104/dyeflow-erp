// Run from C:\dyeflow-react: node fix-machine-process-lookup.js

const fs   = require('fs')
const path = require('path')

const filePath = path.join(__dirname, 'app', 'machines', '[machineId]', 'page.tsx')
let content = fs.readFileSync(filePath, 'utf8')

// Replace the process name lookup logic in loadData
// Old: uses processRoute[0] as fallback — wrong, shows first route step (CBR) not machine-specific step
// New: uses process_machines JSONB on the order to find which process codes are assigned to THIS machine
const old = `          // Use batch route if non-empty, else fall back to order route ([] is truthy so must check length)
          const processRoute: string[] = (b.process_route?.length ? b.process_route : null) || (o.process_route?.length ? o.process_route : null) || []
          const currentProcess = b.current_process || processRoute[0] || ''
          const shadeType = getShadeTypeByColor(o.color || '')

          // For pending batches with no current process, show first route step as "next"
          const displayProcess = currentProcess || processRoute[0] || ''
          const processName = displayProcess
            ? (procMap[displayProcess] || displayProcess)
            : '-'`

const fixed = `          // Use batch route if non-empty, else fall back to order route ([] is truthy so must check .length)
          const processRoute: string[] = (b.process_route?.length ? b.process_route : null) || (o.process_route?.length ? o.process_route : null) || []
          const shadeType = getShadeTypeByColor(o.color || '')

          // Find which process code in the route is assigned to THIS machine.
          // process_machines on the order: { processCode: [machineId1, machineId2] }
          // We look for any process whose machine list includes foundMachine.id
          const processMachinesMap: Record<string, string[]> = o.process_machines || {}
          const machineProcessCode = (() => {
            for (const [code, machineIds] of Object.entries(processMachinesMap)) {
              if ((machineIds as string[]).includes(foundMachine.id)) return code
            }
            return null
          })()

          // Priority: actual current_process > machine-matched process from order > first route step
          const displayProcess = b.current_process || machineProcessCode || processRoute[0] || ''
          const processName = displayProcess ? (procMap[displayProcess] || displayProcess) : '-'`

if (content.includes(old)) {
  content = content.replace(old, fixed)
  fs.writeFileSync(filePath, content, 'utf8')
  console.log('✓ Process name now uses process_machines map to find machine-specific process code')
} else {
  console.error('✗ Pattern not found — trying alternate...')
  // Check what's there
  const idx = content.indexOf('displayProcess')
  if (idx > -1) console.log('Found displayProcess at:', content.substring(idx - 100, idx + 200))
}
