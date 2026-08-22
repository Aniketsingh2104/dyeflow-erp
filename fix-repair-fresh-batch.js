const fs = require('fs')

// ── Fix 1: Date Calculator — exclude unsplit repair batches ───────────────────
let dc = fs.readFileSync('app/date-calculator/page.tsx', 'utf8')

// Add repairing_orders fetch to loadData and filter out pending repair batches
const OLD_DC_LOAD = `      const [oRes, bRes, dpRes, hRes, pdRes, procList] = await Promise.all([
        fetch('/api/orders?limit=2000',  { cache:'no-store' }).then(r=>r.json()),
        fetch('/api/batches?limit=10000',{ cache:'no-store' }).then(r=>r.json()),
        fetch('/api/date-plans',          { cache:'no-store' }).then(r=>r.json()),
        fetch('/api/setup/holidays',      { cache:'no-store' }).then(r=>r.json()).catch(()=>({data:[]})),
        fetch('/api/setup/settings?key=processDurations',{ cache:'no-store' }).then(r=>r.json()).catch(()=>({value:[]})),
        fetchProcessList(),
      ])`

const NEW_DC_LOAD = `      const [oRes, bRes, dpRes, hRes, pdRes, procList, repairRes] = await Promise.all([
        fetch('/api/orders?limit=2000',  { cache:'no-store' }).then(r=>r.json()),
        fetch('/api/batches?limit=10000',{ cache:'no-store' }).then(r=>r.json()),
        fetch('/api/date-plans',          { cache:'no-store' }).then(r=>r.json()),
        fetch('/api/setup/holidays',      { cache:'no-store' }).then(r=>r.json()).catch(()=>({data:[]})),
        fetch('/api/setup/settings?key=processDurations',{ cache:'no-store' }).then(r=>r.json()).catch(()=>({value:[]})),
        fetchProcessList(),
        fetch('/api/repairing-orders',   { cache:'no-store' }).then(r=>r.json()).catch(()=>({data:[]})),
      ])
      // Build set of batch UUIDs that are in repairing_orders with status='pending'
      // These have NOT been split yet — exclude from Date Calculator
      const repairPendingUUIDs = new Set(
        ((repairRes.data || []) as any[])
          .filter((r: any) => r.status === 'pending')
          .map((r: any) => r.batch_id)
          .filter(Boolean)
      )`

if (dc.includes(OLD_DC_LOAD)) {
  dc = dc.replace(OLD_DC_LOAD, NEW_DC_LOAD)
  console.log('✓ Date Calculator: added repairing_orders fetch')
} else console.error('✗ Date Calculator load pattern not found')

// Filter out pending repair batches and also treat split ones as fresh (no old dates)
const OLD_DC_FILTER = `      setRows(batchRows.filter(r => r.route.length > 0))`

const NEW_DC_FILTER = `      // Exclude batches that are in repairing_orders with status='pending' (not yet split)
      // Also exclude batches with status='repairing'
      const filteredRows = batchRows.filter(r =>
        r.route.length > 0 &&
        !repairPendingUUIDs.has(r.batchUUID) &&
        (bRes.data || []).find((b: any) => b.id === r.batchUUID)?.status !== 'repairing'
      )
      setRows(filteredRows)`

if (dc.includes(OLD_DC_FILTER)) {
  dc = dc.replace(OLD_DC_FILTER, NEW_DC_FILTER)
  console.log('✓ Date Calculator: filters out pending repair batches')
} else console.error('✗ Date Calculator filter pattern not found')

// Fix machine name — read from batch.machine_id not order.machines
const OLD_DC_MACHINE = `          machine:     o.machines?.name || '',`
const NEW_DC_MACHINE = `          // Prefer batch machine (set by supervisor for repair) over order machine
          machine:     b.machines?.name || o.machines?.name || '',`

if (dc.includes(OLD_DC_MACHINE)) {
  dc = dc.replace(OLD_DC_MACHINE, NEW_DC_MACHINE)
  console.log('✓ Date Calculator: batch machine takes priority over order machine')
} else console.error('✗ Date Calculator machine pattern not found')

fs.writeFileSync('app/date-calculator/page.tsx', dc, 'utf8')

// ── Fix 2: Machine Sheet — exclude pending repair batches ────────────────────
let machines = fs.readFileSync('app/machines/page.tsx', 'utf8')

const OLD_MACH_LOAD = `      const [machRes, batchRes, orderRes] = await Promise.all([
        getMachines(),
        getBatches(),
        getOrders({ limit: 1000 }),
      ])`

const NEW_MACH_LOAD = `      const [machRes, batchRes, orderRes, repairRes2] = await Promise.all([
        getMachines(),
        getBatches(),
        getOrders({ limit: 1000 }),
        fetch('/api/repairing-orders', { cache: 'no-store' }).then(r => r.json()).catch(() => ({ data: [] })),
      ])
      // Exclude batches in repairing_orders with status='pending' (not yet split/full-split)
      const repairPendingSet = new Set(
        ((repairRes2.data || []) as any[])
          .filter((r: any) => r.status === 'pending')
          .map((r: any) => r.batch_id)
          .filter(Boolean)
      )`

if (machines.includes(OLD_MACH_LOAD)) {
  machines = machines.replace(OLD_MACH_LOAD, NEW_MACH_LOAD)
  console.log('✓ Machine Sheet: added repairing_orders fetch')
} else console.error('✗ Machine Sheet load pattern not found')

// Filter enriched batches to exclude pending repair batches and repairing status
const OLD_MACH_FILTER = `        const mb = enriched
          .filter(b => b.machine_id === mach.id)
          .sort((a, b) => getShadeOrder(a.color) - getShadeOrder(b.color))`

const NEW_MACH_FILTER = `        const mb = enriched
          .filter(b =>
            b.machine_id === mach.id &&
            b.status !== 'repairing' &&           // exclude before supervisor assigns
            !repairPendingSet.has(b.id)            // exclude not-yet-split repair batches
          )
          .sort((a, b) => getShadeOrder(a.color) - getShadeOrder(b.color))`

if (machines.includes(OLD_MACH_FILTER)) {
  machines = machines.replace(OLD_MACH_FILTER, NEW_MACH_FILTER)
  console.log('✓ Machine Sheet: filters out pending repair batches')
} else console.error('✗ Machine Sheet filter pattern not found')

fs.writeFileSync('app/machines/page.tsx', machines, 'utf8')

// ── Fix 3: Repairing Orders — clear old plan data on Full Split and Split ────
let ro = fs.readFileSync('app/repairing-order/page.tsx', 'utf8')

// In doFullSplit — clear old plan data after setting status to pending
const OLD_FULLSPLIT = `      const res = await fetch('/api/batches', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ action:'update', id:r.batch_id, status:'pending' })
      }).then(x=>x.json())
      if (!res.ok) { alert('Error updating batch: ' + res.error); return }
      // Update repairing order status to In Repair
      await fetch('/api/repairing-orders', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ action:'update', id:r.id, status:'In Repair' })
      })`

const NEW_FULLSPLIT = `      // Set batch to pending AND clear old plan data (treat as fresh batch)
      const res = await fetch('/api/batches', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          action:'update', id:r.batch_id, status:'pending',
          // Clear old machine numbering and date calc data
          date_calc_plan: null,
          dc_generated_once: false,
          dc_regenerate: false,
          sent_at: null,
          current_process: null,
        })
      }).then(x=>x.json())
      if (!res.ok) { alert('Error updating batch: ' + res.error); return }
      // Clear old date plans
      await fetch('/api/date-plans', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ action:'clear', batch_id: r.batch_id })
      }).catch(() => {})
      // Update repairing order status to In Repair
      await fetch('/api/repairing-orders', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ action:'update', id:r.id, status:'In Repair' })
      })`

if (ro.includes(OLD_FULLSPLIT)) {
  ro = ro.replace(OLD_FULLSPLIT, NEW_FULLSPLIT)
  console.log('✓ Full Split: clears old plan data — treated as fresh batch')
} else console.error('✗ Full Split pattern not found')

// In saveSplits — clear old plan data on first part, new parts are already fresh
const OLD_SPLIT_UPDATE = `      // First part: update original batch — set to pending so it shows on Splitted Orders
      await fetch('/api/batches', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          action:'update', id: batchUUID,
          kg:         parseFloat(splitParts[0].kg)||0,
          mtr:        parseFloat(splitParts[0].mtr)||0,
          taka:       parseInt(splitParts[0].taka)||0,
          machine_id: splitParts[0].machine_id || splitModal.machine_id || null,
          status:     'pending',
        })
      })`

const NEW_SPLIT_UPDATE = `      // First part: update original batch — set pending, clear old plan data (fresh batch)
      await fetch('/api/batches', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          action:'update', id: batchUUID,
          kg:         parseFloat(splitParts[0].kg)||0,
          mtr:        parseFloat(splitParts[0].mtr)||0,
          taka:       parseInt(splitParts[0].taka)||0,
          machine_id: splitParts[0].machine_id || splitModal.machine_id || null,
          status:     'pending',
          // Clear old numbering and date calc — treated as fresh
          date_calc_plan:    null,
          dc_generated_once: false,
          dc_regenerate:     false,
          sent_at:           null,
          current_process:   null,
        })
      })
      // Clear old date plans for original batch
      await fetch('/api/date-plans', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ action:'clear', batch_id: batchUUID })
      }).catch(() => {})`

if (ro.includes(OLD_SPLIT_UPDATE)) {
  ro = ro.replace(OLD_SPLIT_UPDATE, NEW_SPLIT_UPDATE)
  console.log('✓ Split: clears old plan data on original batch — treated as fresh')
} else console.error('✗ Split update pattern not found')

fs.writeFileSync('app/repairing-order/page.tsx', ro, 'utf8')
console.log('\n✓ All three fixes applied')
