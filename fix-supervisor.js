// Run from C:\dyeflow-react using: node fix-supervisor.js

const fs = require('fs')
const path = require('path')

const filePath = path.join(__dirname, 'app', 'supervisor', '[name]', 'page.tsx')
let content = fs.readFileSync(filePath, 'utf8')

const oldLoadData = `  const loadData = () => {
    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return

    const db = JSON.parse(stored)
    if (!db.orders) db.orders = []

    // Resolve supervisor: try ID match first (new URLs), then name match (legacy URLs)
    const supervisors: any[] = db.supervisors || []
    let resolvedName = decodedSlug

    const byId = supervisors.find((s: any) => s.id === decodedSlug)
    if (byId) {
      resolvedName = byId.name
    } else {
      const byName = supervisors.find((s: any) =>
        (s.name || '').toLowerCase().includes(decodedSlug.toLowerCase())
      )
      if (byName) resolvedName = byName.name
    }

    const supervisorOrders = db.orders.filter((o: any) =>
      (o.supervisor || '').toLowerCase().includes(resolvedName.toLowerCase())
    )

    setFullSupervisorName(supervisorOrders.length > 0 ? supervisorOrders[0].supervisor : resolvedName)
    setOrders(supervisorOrders)

    const inbox = supervisorOrders.filter((o: any) => o.status === 'assigned').length

    const repairingOrders = db.repairingOrders || []
    const supervisorFaultyBatches = repairingOrders
      .filter((r: any) => (r.supervisor || '').toLowerCase().includes(resolvedName.toLowerCase()))
      .map((r: any) => ({
        ...r,
        processRoute: r.processRoute ? r.processRoute.split('/') : [],
        qtyKg: String(r.qtyKg || 0)
      }))

    setFaultyBatches(supervisorFaultyBatches)
    setStats({ inbox, faulty: supervisorFaultyBatches.length })
  }`

const newLoadData = `  const loadData = async () => {
    let resolvedName = decodedSlug
    let resolvedId   = decodedSlug
    try {
      // Resolve supervisor name/id
      const supRes = await fetch('/api/supervisors', { cache: 'no-store' }).then(r => r.json())
      const supervisors: any[] = supRes.data || []
      const byId = supervisors.find((s: any) => s.id === decodedSlug)
      if (byId) { resolvedName = byId.name; resolvedId = byId.id }
      else {
        const byName = supervisors.find((s: any) =>
          (s.name || '').toLowerCase().includes(decodedSlug.toLowerCase())
        )
        if (byName) { resolvedName = byName.name; resolvedId = byName.id }
      }
      setFullSupervisorName(resolvedName)

      // Fetch orders from Supabase
      const ordersRes = await fetch(
        \`/api/orders?supervisor_id=\${resolvedId}&limit=500\`,
        { cache: 'no-store' }
      ).then(r => r.json())

      const mappedOrders = (ordersRes.data || []).map((o: any) => ({
        ...o,
        subParty:      o.sub_party,
        salesPerson:   o.sales_person,
        labNo:         o.lab_no,
        lotNo:         o.lot_no,
        challanNo:     o.challan_no,
        qtyKg:         o.qty_kg,
        qtyMtr:        o.qty_mtr,
        noOfTaka:      o.no_of_taka,
        typeOfFinish:  o.type_of_finish,
        typeOfPacking: o.type_of_packing,
        orderNumber:   o.order_number,
        holdApproval:  o.hold_approval,
        holdReason:    o.hold_reason,
        supervisor:    resolvedName,
        timestamp:     o.created_at,
      }))

      setOrders(mappedOrders)
      const inbox = mappedOrders.filter((o: any) =>
        o.status === 'assigned' || o.status === 'new'
      ).length

      // Faulty batches
      const faultyRes = await fetch('/api/faulty', { cache: 'no-store' }).then(r => r.json()).catch(() => ({ data: [] }))
      const supervisorFaulty = (faultyRes.data || [])
        .filter((r: any) => r.supervisor === resolvedName || r.supervisor_id === resolvedId)
        .map((r: any) => ({
          ...r,
          processRoute: r.processRoute ? r.processRoute.split('/') : [],
          qtyKg: String(r.qtyKg || r.qty_kg || 0),
        }))

      setFaultyBatches(supervisorFaulty)
      setStats({ inbox, faulty: supervisorFaulty.length })
    } catch (err) {
      console.error('loadData error:', err)
    }
  }`

if (content.includes('const stored = localStorage.getItem')) {
  content = content.replace(oldLoadData, newLoadData)
  console.log('✓ loadData replaced with Supabase API version')
} else {
  console.error('✗ Pattern not found - checking what is in the file...')
  const idx = content.indexOf('const loadData')
  console.log('loadData found at index:', idx)
  console.log('Context:', content.substring(idx, idx + 200))
}

// Also fix the useEffect that calls loadData — make it work with async
content = content.replace(
  `useEffect(() => { loadData() }, [decodedSlug])`,
  `useEffect(() => { loadData() }, [decodedSlug]) // loadData is now async, effect just fires it`
)

// Also fix toggleCheck to use API instead of localStorage
const oldToggle = `  const toggleCheck = (orderId: string, field: string, checked: boolean) => {
    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return
    const db = JSON.parse(stored)
    const order = db.orders.find((o: any) => o.id === orderId)
    if (!order) return
    const timeFields: any = { labRecheck: 'labRecheckAt', labReceive: 'labReceiveAt', greigeCheck: 'greigeCheckAt' }
    order[field] = checked
    order[timeFields[field]] = checked ? new Date().toISOString() : ''
    localStorage.setItem('dyeflow_db', JSON.stringify(db))
    loadData()
  }`

const newToggle = `  const toggleCheck = async (orderId: string, field: string, checked: boolean) => {
    // Map camelCase field to DB column
    const fieldMap: any = {
      labRecheck: 'lab_recheck', labReceive: 'lab_receive', greigeCheck: 'greige_check'
    }
    const timeFieldMap: any = {
      labRecheck: 'lab_recheck_at', labReceive: 'lab_receive_at', greigeCheck: 'greige_check_at'
    }
    const patch: any = {}
    if (fieldMap[field]) patch[fieldMap[field]] = checked
    if (timeFieldMap[field]) patch[timeFieldMap[field]] = checked ? new Date().toISOString() : null
    await fetch('/api/orders', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update', id: orderId, ...patch })
    })
    loadData()
  }`

if (content.includes(oldToggle)) {
  content = content.replace(oldToggle, newToggle)
  console.log('✓ toggleCheck replaced with API version')
} else {
  console.log('⚠ toggleCheck pattern not found (may already be updated or slightly different)')
}

// Fix updateFaultyStatus to use API
const oldFaultyStatus = `  const updateFaultyStatus = (repairId: string, status: string) => {
    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return
    const db = JSON.parse(stored)
    const repairOrder = (db.repairingOrders || []).find((r: any) => r.id === repairId)
    if (!repairOrder) return
    repairOrder.status = status
    if (status === 'In Repair' && !repairOrder.repairStartDate) repairOrder.repairStartDate = new Date().toISOString()
    if (status === 'Completed' && !repairOrder.repairCompletedDate) repairOrder.repairCompletedDate = new Date().toISOString()
    localStorage.setItem('dyeflow_db', JSON.stringify(db))
    loadData()
  }`

const newFaultyStatus = `  const updateFaultyStatus = async (repairId: string, status: string) => {
    const patch: any = { status }
    if (status === 'In Repair') patch.repair_start_date = new Date().toISOString()
    if (status === 'Completed')  patch.repair_completed_date = new Date().toISOString()
    await fetch('/api/faulty', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update', id: repairId, ...patch })
    }).catch(() => {})
    loadData()
  }`

if (content.includes(oldFaultyStatus)) {
  content = content.replace(oldFaultyStatus, newFaultyStatus)
  console.log('✓ updateFaultyStatus replaced with API version')
} else {
  console.log('⚠ updateFaultyStatus pattern not found')
}

fs.writeFileSync(filePath, content, 'utf8')
console.log('\n✓ Saved. Now run:')
console.log('git add "app/supervisor/[name]/page.tsx" && git commit -m "fix: supervisor inbox reads from Supabase not localStorage" && git push')
