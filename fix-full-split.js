// Run from C:\dyeflow-react: node fix-full-split.js

const fs   = require('fs')
const path = require('path')

// ── Fix 1: Add full_split action to batches API ───────────────────────────
const batchesPath = path.join(__dirname, 'app', 'api', 'batches', 'route.ts')
let batches = fs.readFileSync(batchesPath, 'utf8')

const oldUnknown = `    return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 })`

const newFullSplit = `    // ── Full split: entire order qty as one single batch ────────────────────
    if (action === 'full_split') {
      const { order_id, order_number, qty_kg, qty_mtr, no_of_taka, machine_id, process_route } = payload
      if (!order_id) return NextResponse.json({ ok: false, error: 'order_id required' }, { status: 400 })

      // Check if already has batches
      const { data: existing } = await dbSelect('batches', { order_id: \`eq.\${order_id}\`, limit: '1' }, 'id,kg')
      if (existing?.length) {
        return NextResponse.json({ ok: false, error: 'Order already has batches. Use Split to add more.' }, { status: 400 })
      }

      const batch = {
        batch_id:     \`\${order_number}-B1\`,
        order_id,
        machine_id:   machine_id || null,
        batch_number: 1,
        kg:           parseFloat(qty_kg)    || 0,
        mtr:          parseFloat(qty_mtr)   || null,
        taka:         parseInt(no_of_taka)  || null,
        status:       'pending',
        process_route: process_route || [],
      }

      const { data: created, error } = await sb<any[]>('/batches', {
        method: 'POST', body: JSON.stringify([batch]),
        headers: { 'Prefer': 'return=representation' },
      })
      if (error) return NextResponse.json({ ok: false, error }, { status: 500 })

      // Update order status to splitting
      await dbUpdate('orders', { id: order_id }, { status: 'splitting' })

      // Create batch_processes
      if (created?.length && process_route?.length) {
        const bpRows = process_route.map((code: string) => ({
          batch_id: created[0].id, process_code: code, status: 'pending'
        }))
        await sb('/batch_processes', {
          method: 'POST', body: JSON.stringify(bpRows),
          headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
        })
      }

      await auditLog({ username: _user, action: 'full_split', entity_type: 'order',
        entity_id: order_id, new_value: \`1 batch · \${qty_kg}kg\` })

      return NextResponse.json({ ok: true, data: created })
    }

    return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 })`

if (batches.includes(oldUnknown)) {
  batches = batches.replace(oldUnknown, newFullSplit)
  console.log('✓ Added full_split action to batches API')
} else {
  console.error('✗ batches Unknown action pattern not found')
}

fs.writeFileSync(batchesPath, batches, 'utf8')

// ── Fix 2: orders/page.tsx — Full Split button + Fully Splitted state ────
const ordersPath = path.join(__dirname, 'app', 'orders', 'page.tsx')
let orders = fs.readFileSync(ordersPath, 'utf8')

// Add allocated_kg tracking — add state for batch allocations
const oldOrdersState = `  // Modals
  const [modal,         setModal]         = useState<string | null>(null)`

const newOrdersState = `  // Batch allocation map: orderId → allocated kg (to show Fully Splitted)
  const [allocations, setAllocations] = useState<Record<string, number>>({})

  // Modals
  const [modal,         setModal]         = useState<string | null>(null)`

if (orders.includes(oldOrdersState)) {
  orders = orders.replace(oldOrdersState, newOrdersState)
  console.log('✓ Added allocations state')
} else {
  console.error('✗ allocations state pattern not found')
}

// Load allocations after orders load
const oldLoadAll = `    if (ordersRes.data)  setOrders(ordersRes.data as any[])
    if (supsRes.data)    setSupervisors(supsRes.data as any[])
    if (machRes.data)    setMachines(machRes.data as any[])
    if (custRes.data)    setCustomers(custRes.data as any[])
    if (procRes.data)    setProcessList(procRes.data as any[])
    setLoading(false)`

const newLoadAll = `    if (ordersRes.data)  setOrders(ordersRes.data as any[])
    if (supsRes.data)    setSupervisors(supsRes.data as any[])
    if (machRes.data)    setMachines(machRes.data as any[])
    if (custRes.data)    setCustomers(custRes.data as any[])
    if (procRes.data)    setProcessList(procRes.data as any[])

    // Load batch allocations to determine "Fully Splitted" state
    if (ordersRes.data?.length) {
      try {
        const batchRes = await fetch('/api/batches?limit=5000', { cache: 'no-store' }).then(r => r.json())
        const batchMap: Record<string, number> = {}
        for (const b of (batchRes.data || [])) {
          batchMap[b.order_id] = (batchMap[b.order_id] || 0) + (parseFloat(b.kg) || 0)
        }
        setAllocations(batchMap)
      } catch {}
    }
    setLoading(false)`

if (orders.includes(oldLoadAll)) {
  orders = orders.replace(oldLoadAll, newLoadAll)
  console.log('✓ Added batch allocation loading')
} else {
  console.error('✗ loadAll pattern not found')
}

// Add fullSplit handler before saveSplits
const oldSaveSplits = `  const saveSplits = async () => {`

const newFullSplitHandler = `  // ── Full Split — one click creates single batch with full order qty ────────
  const doFullSplit = async (order: any) => {
    if (!order.process_route?.length) { alert('Route not assigned yet.'); return }
    const allocatedKg = allocations[order.id] || 0
    const remaining   = (parseFloat(order.qty_kg) || 0) - allocatedKg
    if (remaining < 0.5) {
      showToast('Order is already fully splitted'); return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/batches', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action:        'full_split',
          order_id:      order.id,
          order_number:  order.order_number,
          qty_kg:        remaining,
          qty_mtr:       order.qty_mtr    || 0,
          no_of_taka:    order.no_of_taka || 0,
          machine_id:    order.machine_id || null,
          process_route: order.process_route || [],
        }),
      })
      const data = await res.json()
      if (!data.ok) { alert('Error: ' + (data.error || 'Unknown')); return }
      showToast(\`✓ \${order.order_number} fully splitted as 1 batch\`)
      loadAll()
    } catch (err: any) { alert('Network error: ' + err.message) }
    finally { setSaving(false) }
  }

  const saveSplits = async () => {`

if (orders.includes(oldSaveSplits)) {
  orders = orders.replace(oldSaveSplits, newFullSplitHandler)
  console.log('✓ Added doFullSplit handler')
} else {
  console.error('✗ saveSplits pattern not found')
}

// Fix actions buttons — replace Split button area with Split + Full Split + Fully Splitted
const oldSplitBtn = `                        {order.supervisor_id && (order.process_route || []).length > 0 && (
                          <button className="xs primary" onClick={() => openSplitModal(order)}>Split</button>
                        )}`

const newSplitBtns = `                        {order.supervisor_id && (order.process_route || []).length > 0 && (() => {
                          const allocated = allocations[order.id] || 0
                          const qtyKg     = parseFloat(order.qty_kg) || 0
                          const isFull    = qtyKg > 0 && (qtyKg - allocated) < 0.5
                          if (isFull) return (
                            <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px',
                              background: 'var(--success-light)', color: 'var(--success)',
                              borderRadius: 4, border: '1px solid var(--success)', whiteSpace: 'nowrap' }}>
                              ✅ Fully Splitted
                            </span>
                          )
                          return (<>
                            <button className="xs primary" onClick={() => openSplitModal(order)}>Split</button>
                            <button className="xs"
                              style={{ background: '#7C3AED', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600 }}
                              onClick={() => doFullSplit(order)}
                              disabled={saving}>
                              ⚡ Full Split
                            </button>
                          </>)
                        })()}`

if (orders.includes(oldSplitBtn)) {
  orders = orders.replace(oldSplitBtn, newSplitBtns)
  console.log('✓ Added Full Split button and Fully Splitted state')
} else {
  console.error('✗ Split button pattern not found')
}

fs.writeFileSync(ordersPath, orders, 'utf8')
console.log('\n✓ All fixes written.')
