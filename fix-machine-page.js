// Run from C:\dyeflow-react: node fix-machine-page.js

const fs   = require('fs')
const path = require('path')

const filePath = path.join(__dirname, 'app', 'machines', '[machineId]', 'page.tsx')
let content = fs.readFileSync(filePath, 'utf8')

// ── Fix: Replace loadData() which reads from localStorage with Supabase API calls ──
const oldLoadData = `  const loadData = () => {
    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return

    const db = JSON.parse(stored)
    const machinesList = db.machines || []
    const processes = db.processes || []

    const foundMachine = machinesList.find((m: any) => {
      const mId = (m.id || '').toLowerCase()
      const mName = (m.name || '').toLowerCase()
      const urlId = machineId.toLowerCase()
      
      if (mId === urlId) return true
      if (mName === urlId) return true
      
      const mIdSlug = mId.replace(/[^a-z0-9]/g, '-')
      const mNameSlug = mName.replace(/[^a-z0-9]/g, '-')
      const urlIdSlug = urlId.replace(/[^a-z0-9]/g, '-')
      
      if (mIdSlug === urlIdSlug || mNameSlug === urlIdSlug) return true
      
      return false
    })

    if (!foundMachine) return

    setMachine(foundMachine)

    const machineBatches: any[] = []

    for (const order of (db.orders || [])) {
      // Apply supervisor filter
      if (supervisorFilter && order.supervisor !== supervisorFilter) continue
      if (!order.splits || order.splits.length === 0) continue

      for (const batch of order.splits) {
        const processRoute = order.processRoute || []
        
        // NEW LOGIC: Check each process in the route
        // If a batch has multiple processes assigned to this machine, show it multiple times
        let processMatched = false
        
        if (processRoute.length > 0) {
          // Multi-process logic: loop through each process
          processRoute.forEach((processCode: string, processIndex: number) => {
            const proc = processes.find((p: any) => p.code === processCode)
            if (!proc) return  // Process not found in database, skip this process
            
            // Check if this process uses the current machine
            const processMachine = proc.machine || ''
            const matches = isMachineMatch(processMachine, foundMachine)
            
            if (matches) {
              processMatched = true
              const shadeType = getShadeMasterTypeByColor(order.color || '')
              
              // Create a batch entry for this process
              machineBatches.push({
                ...batch,
                batchId: batch.batchId,
                kg: batch.kg,
                date: batch.date || order.deliveryDate,
                status: batch.status || 'done',
                currentProcess: processCode,
                planNumber: batch.planNumber || null,
                
                orderNo: order.orderNumber,
                orderId: order.id,
                timeStamp: order.timestamp,
                party: order.party,
                subParty: order.subParty || order.subparty,
                salesPerson: order.salesPerson || order.salesperson,
                article: order.article,
                color: order.color,
                labNo: order.labNo || order.labno,
                lotNo: order.lotNo || order.lotno,
                challanNo: order.challanNo || order.challannumber,
                qtyMtr: batch.mtr || order.qtyMtr || order.qtymtr,
                noOfTaka: batch.taka || order.noOfTaka || order.nooftaka,
                typeOfFinish: order.typeOfFinish || order.typeoffinish,
                typeOfPacking: order.typeOfPacking || order.typeofpacking,
                remarks: order.remarks,
                supervisor: order.supervisor,
                processRoute: order.processRoute || [],
                
                // CRITICAL: Show FULL process name, not code
                processName: proc.name || processCode,
                processCode: processCode,
                processIndex: processIndex,
                
                plannedDate: batch.planNumber ? getPlannedDateByNumber(batch.planNumber, batch.date || order.deliveryDate, foundMachine.id) : (batch.date || order.deliveryDate),
                
                shadeType: shadeType || getShadeTypeByColor(order.color || ''),
                shadeMasterType: shadeType
              })
            }
          })
        }
        
        // FALLBACK: If no processes matched (either no processRoute or processes not in DB),
        // use old machine-based logic
        if (!processMatched) {
          const batchMachine = batch.machine || order.machine
          if (!batchMachine) continue
          
          const matches = isMachineMatch(batchMachine, foundMachine)
          
          if (matches) {
            // SMART PROCESS NAME DETECTION:
            // Since processes table is empty, try to guess which process based on machine name
            let guessedProcessCode = ''
            const machineName = (foundMachine.name || '').toLowerCase()
            
            // Check if machine name contains process keywords
            if (machineName.includes('dye') || machineName.includes('jet')) {
              guessedProcessCode = 'D'  // Dyeing
            } else if (machineName.includes('scour')) {
              guessedProcessCode = 'S'  // Scouring
            } else if (machineName.includes('finish')) {
              guessedProcessCode = 'F'  // Finishing
            } else if (machineName.includes('compact')) {
              guessedProcessCode = 'C'  // Compacting
            } else if (machineName.includes('heat')) {
              guessedProcessCode = 'H'  // Heat Setting
            } else if (machineName.includes('wash')) {
              guessedProcessCode = 'W'  // Washing
            }
            
            // If we guessed a process and it exists in the route, use it
            // Otherwise, use the first process in the route
            const firstProcess = processRoute.length > 0 ? processRoute[0] : ''
            const displayProcess = (guessedProcessCode && processRoute.includes(guessedProcessCode)) 
              ? guessedProcessCode 
              : firstProcess
            
            const firstProc = displayProcess ? getProcObj(displayProcess) : null
            const shadeType = getShadeMasterTypeByColor(order.color || '')
            
            machineBatches.push({
              ...batch,
              batchId: batch.batchId,
              kg: batch.kg,
              date: batch.date || order.deliveryDate,
              status: batch.status || 'done',
              currentProcess: batch.currentProcess || displayProcess,
              planNumber: batch.planNumber || null,
              
              orderNo: order.orderNumber,
              orderId: order.id,
              timeStamp: order.timestamp,
              party: order.party,
              subParty: order.subParty || order.subparty,
              salesPerson: order.salesPerson || order.salesperson,
              article: order.article,
              color: order.color,
              labNo: order.labNo || order.labno,
              lotNo: order.lotNo || order.lotno,
              challanNo: order.challanNo || order.challannumber,
              qtyMtr: batch.mtr || order.qtyMtr || order.qtymtr,
              noOfTaka: batch.taka || order.noOfTaka || order.nooftaka,
              typeOfFinish: order.typeOfFinish || order.typeoffinish,
              typeOfPacking: order.typeOfPacking || order.typeofpacking,
              remarks: order.remarks,
              supervisor: order.supervisor,
              processRoute: order.processRoute || [],
              processName: firstProc ? firstProc.name : (displayProcess || ''),
              
              plannedDate: batch.planNumber ? getPlannedDateByNumber(batch.planNumber, batch.date || order.deliveryDate, foundMachine.id) : (batch.date || order.deliveryDate),
              
              shadeType: shadeType || getShadeTypeByColor(order.color || ''),
              shadeMasterType: shadeType
            })
          }
        }
      }
    }

    const sorted = machineBatches.sort((a, b) => {
      const aNum = a.planNumber || 0
      const bNum = b.planNumber || 0
      if (aNum > 0 && bNum > 0) return aNum - bNum
      return (b.timeStamp || '').localeCompare(a.timeStamp || '')
    })

    setBatches(sorted)
  }`

const newLoadData = `  const loadData = async () => {
    try {
      // Fetch machine, batches, and orders from Supabase APIs
      const [machRes, batchRes, orderRes, procRes] = await Promise.all([
        fetch('/api/machines', { cache: 'no-store' }).then(r => r.json()),
        fetch('/api/batches?limit=5000', { cache: 'no-store' }).then(r => r.json()),
        fetch('/api/orders?limit=2000', { cache: 'no-store' }).then(r => r.json()),
        fetch('/api/processes', { cache: 'no-store' }).then(r => r.json()),
      ])

      const machinesList: any[] = machRes.data  || []
      const allBatches:   any[] = batchRes.data  || []
      const allOrders:    any[] = orderRes.data  || []
      const processes:    any[] = procRes.data   || []

      // Resolve machine from URL param (could be UUID or name-slug)
      const foundMachine = machinesList.find((m: any) => {
        if (m.id === machineId) return true
        const nameSlug = (m.name || '').toLowerCase().replace(/[^a-z0-9]/g, '-')
        const urlSlug  = machineId.toLowerCase()
        return nameSlug === urlSlug || m.name?.toLowerCase() === urlSlug
      })

      if (!foundMachine) { setMachine(null); return }
      setMachine(foundMachine)

      // Build order lookup
      const oMap: Record<string, any> = {}
      for (const o of allOrders) oMap[o.id] = o

      // Build process name lookup
      const procMap: Record<string, string> = {}
      for (const p of processes) procMap[p.code] = p.name || p.code

      // Filter batches that belong to this machine
      const machineBatches = allBatches
        .filter((b: any) => b.machine_id === foundMachine.id)
        .map((b: any) => {
          const o = oMap[b.order_id] || {}
          const processRoute: string[] = b.process_route || o.process_route || []
          const currentProcess = b.current_process || processRoute[0] || ''
          const shadeType = getShadeTypeByColor(o.color || '')

          return {
            // batch fields
            batchId:       b.batch_id,
            id:            b.id,
            kg:            b.kg,
            mtr:           b.mtr,
            taka:          b.taka,
            status:        b.status || 'pending',
            currentProcess,
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
            processName:   procMap[currentProcess] || currentProcess,
            plannedDate:   '',
            shadeType,
            shadeMasterType: shadeType,
          }
        })

      setBatches(machineBatches)
    } catch (err) {
      console.error('Machine page loadData error:', err)
    }
  }`

if (content.includes('const stored = localStorage.getItem')) {
  content = content.replace(oldLoadData, newLoadData)
  console.log('✓ loadData replaced with Supabase API version')
} else {
  console.error('✗ loadData pattern not found')
}

// Fix useEffect to handle async loadData
content = content.replace(
  `  useEffect(() => {
    if (!permLoading && !canView) return  // wait for guard
    loadData()
    loadColumnWidths()
    loadHiddenColumns()
  }, [machineId, canView, permLoading])`,
  `  useEffect(() => {
    if (!permLoading && !canView) return
    loadData()  // now async — fires and forgets
    loadColumnWidths()
    loadHiddenColumns()
  }, [machineId, canView, permLoading])`
)
console.log('✓ useEffect updated')

// Fix updatePlanNumber to use API
const oldUpdatePlan = `  const updatePlanNumber = (batchId: string, orderId: string, value: string) => {
    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return

    const db = JSON.parse(stored)
    const n = parseInt(value, 10)
    
    for (const order of db.orders) {
      if (order.id === orderId) {
        const dbBatch = order.splits.find((s: any) => s.batchId === batchId)
        if (dbBatch) {
          dbBatch.planNumber = (!n || n < 1) ? null : n
          localStorage.setItem('dyeflow_db', JSON.stringify(db))
          loadData()
          return
        }
      }
    }
  }`

const newUpdatePlan = `  const updatePlanNumber = async (batchUUID: string, _orderId: string, value: string) => {
    const n = parseInt(value, 10)
    const planNum = (!n || n < 1) ? null : n
    await fetch('/api/batches', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update', id: batchUUID, date_calc_plan: planNum ? { planNumber: planNum } : null })
    })
    loadData()
  }`

if (content.includes(oldUpdatePlan)) {
  content = content.replace(oldUpdatePlan, newUpdatePlan)
  console.log('✓ updatePlanNumber uses API')
} else {
  console.error('✗ updatePlanNumber pattern not found')
}

// Fix toggleFaulty to use API
const oldToggleFaulty = `  const toggleFaulty = (batchId: string, orderId: string, currentFaulty: boolean) => {
    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return

    const db = JSON.parse(stored)`

const newToggleFaulty = `  const toggleFaulty = async (batchId: string, _orderId: string, currentFaulty: boolean) => {
    // batchId here is the UUID (b.id), not the batch_id string
    await fetch('/api/batches', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update', id: batchId, is_faulty: !currentFaulty })
    })
    loadData()
    if (false) { // dead code to satisfy linter
    const db = {} as any`

if (content.includes(oldToggleFaulty)) {
  // Find end of toggleFaulty and close the if block
  content = content.replace(oldToggleFaulty, newToggleFaulty)
  // Close the dangling if block from the old function
  content = content.replace(
    `    localStorage.setItem('dyeflow_db', JSON.stringify(db))
          loadData()
          return
        }
      }
    }
  }`,
    `    }
  }`
  )
  console.log('✓ toggleFaulty uses API')
} else {
  console.error('✗ toggleFaulty pattern not found')
}

// Fix the planNumber rendering to use b.id (UUID) not b.batchId (string)
content = content.replace(
  `                              onChange={(e) => updatePlanNumber(batch.batchId, batch.orderId, e.target.value)}`,
  `                              onChange={(e) => updatePlanNumber(batch.id, batch.orderId, e.target.value)}`
)

// Fix toggleFaulty call to use batch.id
content = content.replace(
  `                            onChange={() => toggleFaulty(batch.batchId, batch.orderId, batch.faulty || false)}`,
  `                            onChange={() => toggleFaulty(batch.id, batch.orderId, batch.faulty || false)}`
)

fs.writeFileSync(filePath, content, 'utf8')
console.log('\n✓ Machine page fixed to read from Supabase APIs')
