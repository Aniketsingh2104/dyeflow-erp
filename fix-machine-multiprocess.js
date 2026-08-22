// Run from C:\dyeflow-react: node fix-machine-multiprocess.js
// Directly replaces the loadData batch mapping section in machine detail page
// to show one row per process per batch when machine handles multiple processes

const fs   = require('fs')
const path = require('path')

const filePath = path.join(__dirname, 'app', 'machines', '[machineId]', 'page.tsx')
let content = fs.readFileSync(filePath, 'utf8')

// Find and replace the exact block
const OLD = `      // Filter batches that belong to this machine
      const machineBatches = allBatches
        .filter((b: any) => b.machine_id === foundMachine.id)
        .map((b: any) => {
          const o = oMap[b.order_id] || {}
          // Use batch route if non-empty, else fall back to order route ([] is truthy so must check .length)
          const processRoute: string[] = (b.process_route?.length ? b.process_route : null) || (o.process_route?.length ? o.process_route : null) || []
          const shadeType = getShadeTypeByColor(o.color || '')

          // Find which process code this machine handles using process_machines map on the order
          // process_machines: { processCode: [machineId1, machineId2] }
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

const NEW = `      // Filter batches that belong to this machine.
      // KEY RULE: if machine handles MULTIPLE processes (e.g. SCQ + Dyeing),
      // the batch appears ONCE PER PROCESS on this machine sheet.
      const MACHINE_REQUIRED = ['S', 'D', 'S2', 'Add', 'Lev', 'Fix', 'Wash', 'Rc']
      const machineBatches: any[] = []

      for (const b of allBatches) {
        if (b.machine_id !== foundMachine.id) continue

        const o = oMap[b.order_id] || {}
        const processRoute: string[] = (b.process_route?.length ? b.process_route : null)
          || (o.process_route?.length ? o.process_route : null) || []
        const shadeType = getShadeTypeByColor(o.color || '')

        // Find ALL process codes this machine handles for this order
        const processMachinesMap: Record<string, string[]> = o.process_machines || {}
        const machineProcessCodes: string[] = []
        for (const [code, machineIds] of Object.entries(processMachinesMap)) {
          if ((machineIds as string[]).includes(foundMachine.id)) {
            machineProcessCodes.push(code)
          }
        }

        // Fallback: if no process_machines entry, use first MACHINE_REQUIRED step
        if (machineProcessCodes.length === 0) {
          const fallback = b.current_process
            || processRoute.find((c: string) => MACHINE_REQUIRED.includes(c))
            || ''
          if (fallback) machineProcessCodes.push(fallback)
        }

        // Create one row per process (SCQ → row1, Dyeing → row2 for same batch)
        for (const displayProcess of machineProcessCodes) {
          const processName = displayProcess ? (procMap[displayProcess] || displayProcess) : '-'
          machineBatches.push({
            rowKey:         \`\${b.batch_id}-\${displayProcess}\`,   // unique per process
            batchId:        b.batch_id,
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

if (content.includes(OLD)) {
  content = content.replace(OLD, NEW)
  console.log('✓ loadData now creates one row per process per batch')
} else {
  console.error('✗ Pattern not found')
  process.exit(1)
}

// Also fix React key to use rowKey
content = content.replace(
  `                    key={batch.batchId || idx}`,
  `                    key={batch.rowKey || batch.batchId + idx}`
)
console.log('✓ React key updated to use rowKey')

fs.writeFileSync(filePath, content, 'utf8')
console.log('\n✓ Done.')
