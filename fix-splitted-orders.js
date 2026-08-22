// Run from C:\dyeflow-react: node fix-splitted-orders.js

const fs = require('fs')
const path = require('path')

// ── Fix 1: orders/page.tsx — SplitModal pre-fill mtr/taka proportionally ────
const ordersPath = path.join(__dirname, 'app', 'orders', 'page.tsx')
let orders = fs.readFileSync(ordersPath, 'utf8')

// Fix openSplitModal to calculate proportional mtr/taka for the remaining qty
const oldOpen = `  const openSplitModal = async (o: any) => {
    setSelectedOrder(o)
    // Fetch existing batches to calculate already-allocated qty
    try {
      const res = await fetch(\`/api/batches?order_id=\${o.id}\`, { cache: 'no-store' })
      const data = await res.json()
      const existingBatches: any[] = data.data || []
      const allocatedKg = existingBatches.reduce((sum: number, b: any) => sum + (parseFloat(b.kg) || 0), 0)
      const remainingKg = Math.max(0, (parseFloat(o.qty_kg) || 0) - allocatedKg)
      // Start with one row pre-filled with remaining qty
      setSplitParts([{ kg: remainingKg, mtr: 0, taka: 0 }])
    } catch {
      // Fallback to full qty if fetch fails
      setSplitParts([{ kg: o.qty_kg, mtr: o.qty_mtr || 0, taka: o.no_of_taka || 0 }])
    }
    setModal('split')
  }`

const newOpen = `  const openSplitModal = async (o: any) => {
    setSelectedOrder(o)
    try {
      const res = await fetch(\`/api/batches?order_id=\${o.id}\`, { cache: 'no-store' })
      const data = await res.json()
      const existingBatches: any[] = data.data || []
      const allocatedKg  = existingBatches.reduce((sum: number, b: any) => sum + (parseFloat(b.kg) || 0), 0)
      const totalKg      = parseFloat(o.qty_kg)    || 0
      const totalMtr     = parseFloat(o.qty_mtr)   || 0
      const totalTaka    = parseInt(o.no_of_taka)  || 0
      const remainingKg  = Math.max(0, totalKg - allocatedKg)
      // Calculate proportional mtr and taka for the remaining qty
      const ratio        = totalKg > 0 ? remainingKg / totalKg : 0
      const remainingMtr = Math.round(totalMtr  * ratio)
      const remainingTaka= Math.round(totalTaka * ratio)
      setSplitParts([{ kg: remainingKg, mtr: remainingMtr, taka: remainingTaka }])
    } catch {
      setSplitParts([{ kg: o.qty_kg, mtr: o.qty_mtr || 0, taka: o.no_of_taka || 0 }])
    }
    setModal('split')
  }`

if (orders.includes(oldOpen)) {
  orders = orders.replace(oldOpen, newOpen)
  console.log('✓ Fix 1a: openSplitModal pre-fills mtr/taka proportionally')
} else {
  console.error('✗ Fix 1a pattern not found')
}

// Fix saveSplits to save mtr and taka to batches table
const oldSaveBatches = `      const batches = splitParts.map((p, idx) => ({
        batch_id:   \`\${selectedOrder.order_number}-B\${startIdx + idx + 1}\`,
        kg:          parseFloat(p.kg) || 0,
        machine_id:  selectedOrder.machine_id || null,
      }))`

const newSaveBatches = `      const batches = splitParts.map((p, idx) => ({
        batch_id:   \`\${selectedOrder.order_number}-B\${startIdx + idx + 1}\`,
        kg:          parseFloat(p.kg)  || 0,
        mtr:         parseFloat(p.mtr) || 0,
        taka:        parseInt(p.taka)  || 0,
        machine_id:  selectedOrder.machine_id || null,
      }))`

if (orders.includes(oldSaveBatches)) {
  orders = orders.replace(oldSaveBatches, newSaveBatches)
  console.log('✓ Fix 1b: saveSplits saves mtr and taka to batches')
} else {
  console.error('✗ Fix 1b pattern not found')
}

fs.writeFileSync(ordersPath, orders, 'utf8')

// ── Fix 2: splitted-orders/page.tsx — add all columns + delete button ────────
const splitPath = path.join(__dirname, 'app', 'splitted-orders', 'page.tsx')
let split = fs.readFileSync(splitPath, 'utf8')

// Add more columns to COLS
const oldCols = `const COLS = [
  { id: 'created_at',      label: 'BATCH CREATED',    w: 150, on: true  },
  { id: 'order_number',    label: 'ORDER #',           w: 120, on: true  },
  { id: 'party',           label: 'PARTY',             w: 150, on: true  },
  { id: 'article',         label: 'ARTICLE',           w: 150, on: true  },
  { id: 'color',           label: 'COLOR',             w: 130, on: true  },
  { id: 'blend',           label: 'BLEND',             w: 100, on: false },
  { id: 'qty_kg',          label: 'ORDER QTY (KG)',    w: 120, on: false },
  { id: 'supervisor',      label: 'SUPERVISOR',        w: 120, on: true  },
  { id: 'process_route',   label: 'PROCESS ROUTE',     w: 200, on: true  },
  { id: 'machine',         label: 'MACHINE',           w: 130, on: true  },
  { id: 'batch_id',        label: 'BATCH ID',          w: 140, on: true  },
  { id: 'kg',              label: 'BATCH QTY (KG)',    w: 120, on: true  },
  { id: 'batch_status',    label: 'BATCH STATUS',      w: 120, on: true  },
  { id: 'current_process', label: 'CURRENT PROCESS',   w: 140, on: true  },
  { id: 'actions',         label: 'ACTIONS',           w: 160, on: true  },
]`

const newCols = `const COLS = [
  { id: 'created_at',      label: 'BATCH CREATED',    w: 150, on: true  },
  { id: 'order_number',    label: 'ORDER #',           w: 120, on: true  },
  { id: 'party',           label: 'PARTY',             w: 150, on: true  },
  { id: 'sub_party',       label: 'SUB PARTY',         w: 130, on: false },
  { id: 'sales_person',    label: 'SALES PERSON',      w: 130, on: false },
  { id: 'article',         label: 'ARTICLE',           w: 150, on: true  },
  { id: 'blend',           label: 'BLEND',             w: 100, on: false },
  { id: 'width',           label: 'WIDTH',             w:  80, on: false },
  { id: 'gsm',             label: 'GSM',               w:  80, on: false },
  { id: 'color',           label: 'COLOR',             w: 130, on: true  },
  { id: 'lab_no',          label: 'LAB NO.',           w: 100, on: false },
  { id: 'lot_no',          label: 'LOT NO.',           w: 100, on: false },
  { id: 'challan_no',      label: 'CHALLAN NO.',       w: 110, on: false },
  { id: 'type_of_finish',  label: 'FINISH',            w: 110, on: false },
  { id: 'type_of_packing', label: 'PACKING',           w: 110, on: false },
  { id: 'qty_kg',          label: 'ORDER QTY (KG)',    w: 120, on: false },
  { id: 'supervisor',      label: 'SUPERVISOR',        w: 120, on: true  },
  { id: 'process_route',   label: 'PROCESS ROUTE',     w: 200, on: true  },
  { id: 'machine',         label: 'MACHINE',           w: 130, on: true  },
  { id: 'batch_id',        label: 'BATCH ID',          w: 140, on: true  },
  { id: 'kg',              label: 'BATCH QTY (KG)',    w: 120, on: true  },
  { id: 'mtr',             label: 'BATCH QTY (MTR)',   w: 120, on: true  },
  { id: 'taka',            label: 'TAKA',              w:  90, on: true  },
  { id: 'batch_status',    label: 'BATCH STATUS',      w: 120, on: true  },
  { id: 'current_process', label: 'CURRENT PROCESS',   w: 140, on: true  },
  { id: 'actions',         label: 'ACTIONS',           w: 200, on: true  },
]`

if (split.includes(oldCols)) {
  split = split.replace(oldCols, newCols)
  console.log('✓ Fix 2a: Added all order columns + mtr/taka to COLS')
} else {
  console.error('✗ Fix 2a pattern not found')
}

// Add enriched fields in the load function
const oldEnriched = `      const enriched = batches.map(b => ({
        ...b,
        order_number:   oMap[b.order_id]?.order_number   || '-',
        party:          oMap[b.order_id]?.party           || '-',
        article:        oMap[b.order_id]?.article         || '-',
        color:          oMap[b.order_id]?.color           || '-',
        blend:          oMap[b.order_id]?.blend           || '',
        qty_kg:         oMap[b.order_id]?.qty_kg          || '',
        process_route:  oMap[b.order_id]?.process_route   || [],
        supervisor:     oMap[b.order_id]?.supervisors?.name || '-',
        machine_name:   b.machines?.name || '-',
      }))`

const newEnriched = `      const enriched = batches.map(b => ({
        ...b,
        order_number:    oMap[b.order_id]?.order_number     || '-',
        party:           oMap[b.order_id]?.party             || '-',
        sub_party:       oMap[b.order_id]?.sub_party         || '-',
        sales_person:    oMap[b.order_id]?.sales_person      || '-',
        article:         oMap[b.order_id]?.article           || '-',
        color:           oMap[b.order_id]?.color             || '-',
        blend:           oMap[b.order_id]?.blend             || '-',
        width:           oMap[b.order_id]?.width             || '-',
        gsm:             oMap[b.order_id]?.gsm               || '-',
        lab_no:          oMap[b.order_id]?.lab_no            || '-',
        lot_no:          oMap[b.order_id]?.lot_no            || '-',
        challan_no:      oMap[b.order_id]?.challan_no        || '-',
        type_of_finish:  oMap[b.order_id]?.type_of_finish    || '-',
        type_of_packing: oMap[b.order_id]?.type_of_packing   || '-',
        qty_kg:          oMap[b.order_id]?.qty_kg             || '',
        process_route:   oMap[b.order_id]?.process_route      || b.process_route || [],
        supervisor:      oMap[b.order_id]?.supervisors?.name  || '-',
        machine_name:    b.machines?.name                     || '-',
        order_qty_kg:    parseFloat(oMap[b.order_id]?.qty_kg) || 0,
        order_qty_mtr:   parseFloat(oMap[b.order_id]?.qty_mtr)|| 0,
        order_no_of_taka:parseInt(oMap[b.order_id]?.no_of_taka)||0,
      }))`

if (split.includes(oldEnriched)) {
  split = split.replace(oldEnriched, newEnriched)
  console.log('✓ Fix 2b: Enriched batches with all order fields')
} else {
  console.error('✗ Fix 2b pattern not found')
}

// Add delete handler
const oldHandleDone = `  const handleDone = async (row: any) => {`

const newHandleDone = `  const handleDelete = async (row: any) => {
    if (row.status === 'done' || row.status === 'in-process' || row.is_done) {
      alert('Cannot delete — this batch is already in process or completed.')
      return
    }
    if (!confirm(\`Delete batch \${row.batch_id} (\${row.kg} Kg)? The quantity will be restored to order \${row.order_number}.\`)) return
    try {
      const res = await fetch('/api/batches', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete_batch', id: row.id, order_id: row.order_id })
      })
      const data = await res.json()
      if (!data.ok) { alert('Error: ' + (data.error || 'Unknown')); return }
      showToast(\`✓ Batch \${row.batch_id} deleted — \${row.kg} Kg restored to \${row.order_number}\`)
      load()
    } catch (err: any) { alert('Network error: ' + err.message) }
  }

  const handleDone = async (row: any) => {`

if (split.includes(oldHandleDone)) {
  split = split.replace(oldHandleDone, newHandleDone)
  console.log('✓ Fix 2c: Added handleDelete function')
} else {
  console.error('✗ Fix 2c pattern not found')
}

// Add renderCell cases for new columns + delete button in actions
const oldRenderCells = `      case 'kg':              return <strong>{row.kg} Kg</strong>
      case 'batch_status':    return <Badge status={row.status || 'pending'} />`

const newRenderCells = `      case 'kg':              return <strong>{row.kg} Kg</strong>
      case 'mtr':             return row.mtr ? <span>{row.mtr} Mtr</span> : <span style={{color:'var(--text-tertiary)'}}>-</span>
      case 'taka':            return row.taka ? <span>{row.taka}</span> : <span style={{color:'var(--text-tertiary)'}}>-</span>
      case 'sub_party':       return row.sub_party || '-'
      case 'sales_person':    return row.sales_person || '-'
      case 'width':           return row.width || '-'
      case 'gsm':             return row.gsm || '-'
      case 'lab_no':          return row.lab_no || '-'
      case 'lot_no':          return row.lot_no || '-'
      case 'challan_no':      return row.challan_no || '-'
      case 'type_of_finish':  return row.type_of_finish || '-'
      case 'type_of_packing': return row.type_of_packing || '-'
      case 'batch_status':    return <Badge status={row.status || 'pending'} />`

if (split.includes(oldRenderCells)) {
  split = split.replace(oldRenderCells, newRenderCells)
  console.log('✓ Fix 2d: Added renderCell cases for new columns')
} else {
  console.error('✗ Fix 2d pattern not found')
}

// Add delete button to actions
const oldActions = `      case 'actions': return (
        <div style={{ display: 'flex', gap: 4 }}>
          {row.current_process && (
            <button className="xs"
              onClick={() => window.location.href = \`/fms/\${row.current_process}\`}>
              FMS →
            </button>
          )}
          {row.status !== 'done' && row.current_process && (
            <button className="xs" style={{ background: 'var(--success)', color: '#fff',
              border: 'none', cursor: 'pointer' }}
              onClick={() => handleDone(row)}>
              ✓ Done
            </button>
          )}
        </div>
      )`

const newActions = `      case 'actions': return (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {row.current_process && (
            <button className="xs"
              onClick={() => window.location.href = \`/fms/\${row.current_process}\`}>
              FMS →
            </button>
          )}
          {row.status !== 'done' && row.current_process && (
            <button className="xs" style={{ background: 'var(--success)', color: '#fff',
              border: 'none', cursor: 'pointer' }}
              onClick={() => handleDone(row)}>
              ✓ Done
            </button>
          )}
          {row.status !== 'done' && row.status !== 'in-process' && !row.is_done && (
            <button className="xs" style={{ background: 'var(--danger-light)', color: 'var(--danger)',
              border: '1px solid var(--danger)', cursor: 'pointer' }}
              onClick={() => handleDelete(row)}>
              🗑 Delete
            </button>
          )}
        </div>
      )`

if (split.includes(oldActions)) {
  split = split.replace(oldActions, newActions)
  console.log('✓ Fix 2e: Added Delete button to actions column')
} else {
  console.error('✗ Fix 2e pattern not found')
}

fs.writeFileSync(splitPath, split, 'utf8')
console.log('\n✓ splitted-orders/page.tsx and orders/page.tsx both fixed.')
