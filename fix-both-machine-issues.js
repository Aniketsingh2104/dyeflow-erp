// Run from C:\dyeflow-react: node fix-both-machine-issues.js
// Fix 1: RouteAssignment shows UUID in machine input instead of name
// Fix 2: Machine sheet shows batch once per process (SCQ + Dyeing = 2 rows for same batch)

const fs   = require('fs')
const path = require('path')

// ══════════════════════════════════════════════════════════════════
// FIX 1: RouteAssignment.tsx — UUID shown instead of machine name
// In applyTemplate, existing[0] is a UUID from process_machines JSONB
// but the input expects a machine NAME. Resolve UUID → name.
// ══════════════════════════════════════════════════════════════════
const raPath = path.join(__dirname, 'app', 'supervisor', '[name]', 'RouteAssignment.tsx')
let ra = fs.readFileSync(raPath, 'utf8')

const oldApply = `    const inputs: {[key: string]: [string, string]} = {}
    // Load existing process_machines if in edit mode
    const existingPM = order.process_machines || order.processMachines || {}
    for (const step of machineSteps) {
      const existing = existingPM[step.processCode] || []
      const smart    = getSmartMachine(step.processCode, qtyKg, articleIntel, database) || ''
      inputs[step.processCode] = [
        existing[0] || smart,
        existing[1] || '',
      ]
    }`

const newApply = `    const inputs: {[key: string]: [string, string]} = {}
    // Load existing process_machines if in edit mode
    // process_machines stores UUIDs — resolve each to machine name for the input
    const existingPM = order.process_machines || order.processMachines || {}
    const resolveName = (idOrName: string): string => {
      if (!idOrName) return ''
      const found = (database.machines || []).find((m: any) => m.id === idOrName || m.name === idOrName)
      return found?.name || idOrName
    }
    for (const step of machineSteps) {
      const existing = existingPM[step.processCode] || []
      const smart    = getSmartMachine(step.processCode, qtyKg, articleIntel, database) || ''
      inputs[step.processCode] = [
        resolveName(existing[0]) || smart,
        resolveName(existing[1]) || '',
      ]
    }`

if (ra.includes(oldApply)) {
  ra = ra.replace(oldApply, newApply)
  fs.writeFileSync(raPath, ra, 'utf8')
  console.log('✓ Fix 1: RouteAssignment applyTemplate resolves UUID → machine name')
} else {
  console.error('✗ Fix 1 pattern not found')
}

// ══════════════════════════════════════════════════════════════════
// FIX 2: Machine detail page — show batch ONCE PER PROCESS it visits
// When process_machines has multiple process codes pointing to same machine
// (e.g. S: [jet28] AND D: [jet28]), the batch should appear TWICE —
// once labeled SCQ and once labeled Dyeing.
// ══════════════════════════════════════════════════════════════════
const detailPath = path.join(__dirname, 'app', 'machines', '[machineId]', 'page.tsx')
let detail = fs.readFileSync(detailPath, 'utf8')

const oldBatchMap = `      // Filter batches that belong to this machine
      const machineBatches = allBatches
        .filter((b: any) => b.machine_id === foundMachine.id)
        .map((b: any) => {
          const o = oMap[b.order_id] || {}
          const processRoute: string[] = (b.process_route?.length ? b.process_route : null) || (o.process_route?.length ? o.process_route : null) || []
          const shadeType = getShadeTypeByColor(o.color || '')

          // Find which process code this machine handles using process_machines map on the order
          const processMachinesMap: Record<string, string[]> = o.process_machines || {}
          const machineProcessCode = (() => {
            for (const [code, machineIds] of Object.entries(processMachinesMap)) {
              if ((machineIds as string[]).includes(foundMachine.id)) return code
            }
            return null
          })()

          // Priority: actual current_process > machine-matched process from order
          // > first MACHINE_REQUIRED step in route (never fallback to non-machine steps like CBR)
          const MACHINE_REQUIRED = ['S', 'D', 'S2', 'Add', 'Lev', 'Fix', 'Wash', 'Rc']
          const firstMachineStep = processRoute.find((c: string) => MACHINE_REQUIRED.includes(c)) || ''
          const displayProcess = b.current_process || machineProcessCode || firstMachineStep
          const processName = displayProcess ? (procMap[displayProcess] || displayProcess) : '-'

          return {
            // batch fields
            batchId:       b.batch_id,
            id:            b.id,
            kg:            b.kg,
            mtr:           b.mtr,
            taka:          b.taka,
            status:        b.status || 'pending',
            currentProcess: displayProcess,
            planNumber:    b.date_calc_plan?.planNumber || null,
            faulty:        b.is_faulty || false,
            orderId:       b.order_id,
            processRoute,
            // order fields
            orderNo:       o.order_number   || '-',
            timeStamp:     o.created_at     || '',
            party:         o.party          || '-',
            subParty:      o.sub_party      || '-',
            salesPerson:   o.sales_person   || '-',
            article:       o.article        || '-',
            color:         o.color          || '-',
            labNo:         o.lab_no         || '-',
            lotNo:         o.lot_no         || '-',
            challanNo:     o.challan_no     || '-',
            qtyMtr:        b.mtr            || o.qty_mtr    || '',
            noOfTaka:      b.taka           || o.no_of_taka || '',
            typeOfFinish:  o.type_of_finish  || '-',
            typeOfPacking: o.type_of_packing || '-',
            remarks:       o.remarks        || '',
            supervisor:    o.supervisors?.name || '-',
            processName,
            plannedDate:   '',
            shadeType,
            shadeMasterType: shadeType,
          }
        })

      setBatches(machineBatches)`

const newBatchMap = `      // Filter batches that belong to this machine
      // A batch appears ONCE PER PROCESS this machine handles for that order
      // e.g. if machine handles both SCQ and Dyeing → batch shows twice (once per process)
      const MACHINE_REQUIRED = ['S', 'D', 'S2', 'Add', 'Lev', 'Fix', 'Wash', 'Rc']
      const machineBatches: any[] = []

      for (const b of allBatches) {
        if (b.machine_id !== foundMachine.id) continue

        const o = oMap[b.order_id] || {}
        const processRoute: string[] = (b.process_route?.length ? b.process_route : null) || (o.process_route?.length ? o.process_route : null) || []
        const shadeType = getShadeTypeByColor(o.color || '')

        // Find ALL process codes this machine handles for this order
        const processMachinesMap: Record<string, string[]> = o.process_machines || {}
        const machineProcessCodes: string[] = []
        for (const [code, machineIds] of Object.entries(processMachinesMap)) {
          if ((machineIds as string[]).includes(foundMachine.id)) {
            machineProcessCodes.push(code)
          }
        }

        // If no process_machines match, use first MACHINE_REQUIRED step as fallback
        if (machineProcessCodes.length === 0) {
          const fallback = b.current_process ||
            processRoute.find((c: string) => MACHINE_REQUIRED.includes(c)) || ''
          if (fallback) machineProcessCodes.push(fallback)
        }

        // Create one row per process this machine handles
        const displayCodes = machineProcessCodes.length > 0 ? machineProcessCodes : ['']
        for (const displayProcess of displayCodes) {
          const processName = displayProcess ? (procMap[displayProcess] || displayProcess) : '-'
          machineBatches.push({
            // Use batchId + processCode as unique key to avoid React key conflicts
            batchId:        b.batch_id,
            rowKey:         \`\${b.batch_id}-\${displayProcess}\`,
            id:             b.id,
            kg:             b.kg,
            mtr:            b.mtr,
            taka:           b.taka,
            status:         b.status || 'pending',
            currentProcess: displayProcess,
            planNumber:     b.date_calc_plan?.planNumber || null,
            faulty:         b.is_faulty || false,
            orderId:        b.order_id,
            processRoute,
            // order fields
            orderNo:        o.order_number   || '-',
            timeStamp:      o.created_at     || '',
            party:          o.party          || '-',
            subParty:       o.sub_party      || '-',
            salesPerson:    o.sales_person   || '-',
            article:        o.article        || '-',
            color:          o.color          || '-',
            labNo:          o.lab_no         || '-',
            lotNo:          o.lot_no         || '-',
            challanNo:      o.challan_no     || '-',
            qtyMtr:         b.mtr            || o.qty_mtr    || '',
            noOfTaka:       b.taka           || o.no_of_taka || '',
            typeOfFinish:   o.type_of_finish  || '-',
            typeOfPacking:  o.type_of_packing || '-',
            remarks:        o.remarks        || '',
            supervisor:     o.supervisors?.name || '-',
            processName,
            plannedDate:    '',
            shadeType,
            shadeMasterType: shadeType,
          })
        }
      }

      setBatches(machineBatches)`

if (detail.includes(oldBatchMap)) {
  detail = detail.replace(oldBatchMap, newBatchMap)
  console.log('✓ Fix 2: Machine detail page creates one row per process per batch')
} else {
  console.error('✗ Fix 2 pattern not found')
}

// Fix the React key — use rowKey instead of batchId
detail = detail.replace(
  `                  key={batch.batchId || idx}`,
  `                  key={batch.rowKey || batch.batchId || idx}`
)

fs.writeFileSync(detailPath, detail, 'utf8')
console.log('\n✓ Both fixes applied.')
