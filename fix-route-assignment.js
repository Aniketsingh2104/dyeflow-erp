// Run from C:\dyeflow-react using: node fix-route-assignment.js

const fs = require('fs')
const path = require('path')

const filePath = path.join(__dirname, 'app', 'supervisor', '[name]', 'RouteAssignment.tsx')
let content = fs.readFileSync(filePath, 'utf8')

// ── Fix 1: loadDb — read routes/machines from Supabase APIs ──────────────────
const oldLoadDb = `  const loadDb = () => {
    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return
    const database = JSON.parse(stored)
    setDb(database)
  }`

const newLoadDb = `  const loadDb = async () => {
    try {
      const [machRes, procRes, routeRes, articleRouteRes] = await Promise.all([
        fetch('/api/machines',        { cache: 'no-store' }).then(r => r.json()).catch(() => ({ data: [] })),
        fetch('/api/processes',       { cache: 'no-store' }).then(r => r.json()).catch(() => ({ data: [] })),
        fetch('/api/route-templates', { cache: 'no-store' }).then(r => r.json()).catch(() => ({ data: [] })),
        fetch('/api/article-routes',  { cache: 'no-store' }).then(r => r.json()).catch(() => ({ data: [] })),
      ])

      const processList = procRes.data || []

      const database: any = {
        machines:    machRes.data || [],
        processList,
        // process_route_templates has steps as [{processCode, name}]
        processRouteMaster: (routeRes.data || []).map((t: any) => ({
          name:  t.name || t.template_name,
          steps: (t.steps || []).map((s: any) => ({
            processCode: s.processCode || s.process_code || s,
            name:        s.name || processList.find((p: any) => p.code === (s.processCode || s))?.name || s.processCode || s,
          })),
        })),
        // article_process_routes has article + route (string "C/S/D")
        articleProcessMap: (articleRouteRes.data || []).reduce((acc: any, r: any) => {
          if (r.article && r.route) {
            acc[r.article] = typeof r.route === 'string'
              ? r.route.split('/').map((c: string) => c.trim()).filter(Boolean)
              : r.route
          }
          return acc
        }, {}),
      }
      setDb(database)
    } catch (err) {
      console.error('RouteAssignment loadDb error:', err)
    }
  }`

if (content.includes('const stored = localStorage.getItem')) {
  content = content.replace(oldLoadDb, newLoadDb)
  console.log('✓ Fix 1: loadDb reads from Supabase APIs')
} else {
  console.error('✗ Fix 1 not found — check pattern')
}

// ── Fix 2: handleConfirm — save to Supabase ───────────────────────────────────
const oldConfirm = `    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return

    const database = JSON.parse(stored)

    let orderToUpdate = database.orders?.find((o: any) => o.id === order.id)
    let isRepairingOrder = false

    if (!orderToUpdate) {
      orderToUpdate = database.repairingOrders?.find((r: any) => r.id === order.id)
      isRepairingOrder = true
    }

    if (!orderToUpdate) {
      alert('Order not found in database')
      return
    }

    const codes = rt.steps.map((s: any) => s.processCode)
    orderToUpdate.processRoute = isRepairingOrder ? codes.join('/') : codes
    orderToUpdate.routeTemplateName = rt.name

    // Machine assignments
    const processMachines: {[key: string]: string[]} = {}
    const articleIntel = getArticleIntelligence(order.article, database)
    const qtyKg = parseFloat(order.qtyKg) || 0
    let primaryMachine = ''

    for (const step of rt.steps) {
      if (!MACHINE_REQUIRED.includes(step.processCode)) continue
      let machine = machineInputs[step.processCode] || ''
      if (!machine) machine = getSmartMachine(step.processCode, qtyKg, articleIntel, database)
      if (machine) {
        processMachines[step.processCode] = [machine]
        if (!primaryMachine) primaryMachine = machine
      }
    }

    orderToUpdate.processMachines = processMachines
    orderToUpdate.machine = primaryMachine
    orderToUpdate.supervisorConfirmed = true
    orderToUpdate.supervisorConfirmedAt = new Date().toISOString()

    localStorage.setItem('dyeflow_db', JSON.stringify(database))
    onUpdate()`

const newConfirm = `    const codes = rt.steps.map((s: any) => s.processCode)

    // Build machine assignments
    const processMachines: {[key: string]: string[]} = {}
    const articleIntel = db ? getArticleIntelligence(order.article, db) : null
    const qtyKg = parseFloat(order.qtyKg || order.qty_kg) || 0
    let primaryMachine = ''

    for (const step of rt.steps) {
      if (!MACHINE_REQUIRED.includes(step.processCode)) continue
      let machine = machineInputs[step.processCode] || ''
      if (!machine && db) machine = getSmartMachine(step.processCode, qtyKg, articleIntel, db) || ''
      if (machine) {
        processMachines[step.processCode] = [machine]
        if (!primaryMachine) primaryMachine = machine
      }
    }

    // Resolve machine name → machine_id for orders table
    const machineRecord = (db?.machines || []).find((m: any) =>
      m.name === primaryMachine || m.id === primaryMachine
    )
    const machineId = machineRecord?.id || null

    try {
      const res = await fetch('/api/orders', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action:                  'update',
          id:                      order.id,
          process_route:           codes,
          machine_id:              machineId,
          status:                  'splitting',
          supervisor_confirmed:    true,
          supervisor_confirmed_at: new Date().toISOString(),
        }),
      })
      const data = await res.json()
      if (!data.ok) {
        alert('Error saving: ' + (data.error || 'Unknown error'))
        return
      }
      onUpdate()
    } catch (err: any) {
      alert('Network error: ' + err.message)
    }`

if (content.includes("alert('Order not found in database')")) {
  content = content.replace(oldConfirm, newConfirm)
  // Also make handleConfirm async
  content = content.replace('  const handleConfirm = () => {', '  const handleConfirm = async () => {')
  console.log('✓ Fix 2: handleConfirm saves to Supabase via /api/orders')
} else {
  console.error('✗ Fix 2 not found')
}

fs.writeFileSync(filePath, content, 'utf8')
console.log('\n✓ RouteAssignment.tsx fixed.')
