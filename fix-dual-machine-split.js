// Run from C:\dyeflow-react: node fix-dual-machine-split.js

const fs   = require('fs')
const path = require('path')

// ── Fix 1: Add process_machines to orders GET select ─────────────────────
const ordersApiPath = path.join(__dirname, 'app', 'api', 'orders', 'route.ts')
let ordersApi = fs.readFileSync(ordersApiPath, 'utf8')

const oldSelect = `    'supervisor_confirmed,supervisor_confirmed_at,' +
    'created_at,updated_at,supervisors(id,name),machines(id,name,capacity)'`

const newSelect = `    'supervisor_confirmed,supervisor_confirmed_at,process_machines,' +
    'created_at,updated_at,supervisors(id,name),machines(id,name,capacity)'`

if (ordersApi.includes(oldSelect)) {
  ordersApi = ordersApi.replace(oldSelect, newSelect)
  fs.writeFileSync(ordersApiPath, ordersApi, 'utf8')
  console.log('✓ Added process_machines to orders GET select')
} else {
  console.error('✗ orders select pattern not found')
}

// ── Fix 2: SplitModal — add machine picker per batch when dual machines exist ─
const ordersPagePath = path.join(__dirname, 'app', 'orders', 'page.tsx')
let ordersPage = fs.readFileSync(ordersPagePath, 'utf8')

// Replace openSplitModal to also pass machines info
const oldOpenSplit = `  const openSplitModal = async (o: any) => {
    setSelectedOrder(o)`

const newOpenSplit = `  const openSplitModal = async (o: any) => {
    // Attach machines list so SplitModal can show machine picker
    const enriched = { ...o, _machines: machines }
    setSelectedOrder(enriched)`

if (ordersPage.includes(oldOpenSplit)) {
  ordersPage = ordersPage.replace(oldOpenSplit, newOpenSplit)
  console.log('✓ openSplitModal enriched with machines list')
} else {
  console.error('✗ openSplitModal pattern not found')
}

// Also pass machines to doFullSplit — no modal so use process_machines to pick first machine
// Actually full split always uses machine_id (primary). No change needed there.

// Replace SplitModal component to add machine picker per batch
const oldSplitModal = `function SplitModal({ order, splitParts, setSplitParts, onSave, onClose, saving }: {
  order: any; splitParts: any[]; setSplitParts: React.Dispatch<React.SetStateAction<any[]>>;
  onSave: () => void; onClose: () => void; saving: boolean
}) {
  const totalKg   = splitParts.reduce((s, p) => s + (parseFloat(p.kg) || 0), 0)
  const remaining = (order.qty_kg || 0) - totalKg
  const ok        = Math.abs(remaining) < 0.5

  const add    = () => setSplitParts(p => [...p, { kg: 0, mtr: 0, taka: 0 }])
  const remove = (i: number) => setSplitParts(p => p.filter((_, j) => j !== i))
  const upd    = (i: number, field: string, val: string) =>
    setSplitParts(p => p.map((b, j) => j === i ? { ...b, [field]: val } : b))
  const balance = () => {
    const total = splitParts.reduce((s, p) => s + (parseFloat(p.kg) || 0), 0) || (order.qty_kg || 0)
    const per = total / splitParts.length
    setSplitParts(splitParts.map(() => ({ kg: per, mtr: 0, taka: 0 })))
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 640 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">Split Order — {order.order_number}</span>
          <button className="small" onClick={onClose}>✕</button>
        </div>
        <div style={{ background: 'var(--bg-secondary)', padding: '8px 14px', borderRadius: 8,
          marginBottom: 10, fontSize: 13, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <span><strong>Order Total:</strong> {order.qty_kg} Kg</span>
          <span><strong>Article:</strong> {order.article}</span>
          <span><strong>Color:</strong> {order.color}</span>
        </div>
        <div style={{ background: ok ? 'var(--success-light)' : 'var(--danger-light)',
          color: ok ? 'var(--success)' : 'var(--danger)',
          borderRadius: 8, padding: '7px 14px', marginBottom: 10, fontSize: 13, fontWeight: 500 }}>
          This split: {totalKg.toFixed(1)} Kg · Still remaining after save: {remaining.toFixed(1)} Kg {ok ? '✓' : '⚠ (partial split)'}
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 10 }}>
          <thead>
            <tr style={{ background: 'var(--bg-secondary)' }}>
              {['Batch', 'Qty (Kg)', 'Qty (Mtr)', 'Taka', ''].map(h => (
                <th key={h} style={{ padding: '6px 8px', fontSize: 11, textAlign: 'left',
                  borderBottom: '1px solid var(--border-light)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {splitParts.map((part, i) => (
              <tr key={i} style={{ borderBottom: '1px solid var(--border-light)' }}>
                <td style={{ padding: '6px 8px', fontSize: 12, fontWeight: 600 }}>#{i + 1}</td>
                {(['kg', 'mtr', 'taka'] as const).map(f => (
                  <td key={f} style={{ padding: '6px 8px' }}>
                    <input type="number" value={part[f]}
                      onChange={e => upd(i, f, e.target.value)}
                      style={{ width: 80, padding: '4px 6px', fontSize: 12,
                        border: '1px solid var(--border-medium)', borderRadius: 4,
                        background: 'var(--bg-primary)', color: 'var(--text-primary)' }} />
                  </td>
                ))}
                <td style={{ padding: '6px 8px' }}>
                  {splitParts.length > 1 && (
                    <button className="xs danger" onClick={() => remove(i)}>✕</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <button className="small" onClick={add}>➕ Add Batch</button>
          <button className="small" onClick={balance}>Auto-Balance</button>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="primary" onClick={onSave} disabled={saving}>
            {saving ? 'Saving…' : '✓ Save Splits'}
          </button>
          <button onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}`

const newSplitModal = `function SplitModal({ order, splitParts, setSplitParts, onSave, onClose, saving }: {
  order: any; splitParts: any[]; setSplitParts: React.Dispatch<React.SetStateAction<any[]>>;
  onSave: () => void; onClose: () => void; saving: boolean
}) {
  const totalKg   = splitParts.reduce((s, p) => s + (parseFloat(p.kg) || 0), 0)
  const remaining = (order.qty_kg || 0) - totalKg
  const ok        = Math.abs(remaining) < 0.5

  // Build available machines per process from process_machines
  // process_machines: { processCode: [machineId1, machineId2] }
  const processMachines: Record<string, string[]> = order.process_machines || {}
  const allMachines: any[] = order._machines || []

  // Get machine names for a process
  const getMachineOptions = (processCode: string): {id:string;name:string}[] => {
    const ids = processMachines[processCode] || []
    return ids.map((id: string) => {
      const m = allMachines.find((m:any) => m.id === id)
      return m ? { id: m.id, name: m.name } : null
    }).filter(Boolean)
  }

  // Get all unique machine options across all processes (for batch machine picker)
  const allMachineOptions = (() => {
    const seen = new Set<string>()
    const opts: {id:string;name:string}[] = []
    for (const ids of Object.values(processMachines)) {
      for (const id of (ids as string[])) {
        if (!seen.has(id)) {
          const m = allMachines.find((m:any) => m.id === id)
          if (m) { seen.add(id); opts.push({ id: m.id, name: m.name }) }
        }
      }
    }
    // If no process_machines, use order.machine_id as only option
    if (!opts.length && order.machine_id) {
      const m = allMachines.find((m:any) => m.id === order.machine_id)
      if (m) opts.push({ id: m.id, name: m.name })
    }
    return opts
  })()

  const hasDualMachines = allMachineOptions.length > 1

  const add    = () => setSplitParts(p => [...p, { kg: 0, mtr: 0, taka: 0, machine_id: allMachineOptions[0]?.id || '' }])
  const remove = (i: number) => setSplitParts(p => p.filter((_, j) => j !== i))
  const upd    = (i: number, field: string, val: string) =>
    setSplitParts(p => p.map((b, j) => j === i ? { ...b, [field]: val } : b))
  const balance = () => {
    const total = splitParts.reduce((s, p) => s + (parseFloat(p.kg) || 0), 0) || (order.qty_kg || 0)
    const per = total / splitParts.length
    setSplitParts(splitParts.map(p => ({ ...p, kg: per })))
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 700 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">Split Order — {order.order_number}</span>
          <button className="small" onClick={onClose}>✕</button>
        </div>
        <div style={{ background: 'var(--bg-secondary)', padding: '8px 14px', borderRadius: 8,
          marginBottom: 10, fontSize: 13, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <span><strong>Order Total:</strong> {order.qty_kg} Kg</span>
          <span><strong>Article:</strong> {order.article}</span>
          <span><strong>Color:</strong> {order.color}</span>
          {hasDualMachines && (
            <span style={{ color: 'var(--accent)', fontWeight: 600 }}>
              Select machine per batch ↓
            </span>
          )}
        </div>
        <div style={{ background: ok ? 'var(--success-light)' : 'var(--danger-light)',
          color: ok ? 'var(--success)' : 'var(--danger)',
          borderRadius: 8, padding: '7px 14px', marginBottom: 10, fontSize: 13, fontWeight: 500 }}>
          This split: {totalKg.toFixed(1)} Kg · Remaining after save: {remaining.toFixed(1)} Kg {ok ? '✓' : '⚠ (partial split)'}
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 10 }}>
          <thead>
            <tr style={{ background: 'var(--bg-secondary)' }}>
              <th style={{ padding: '6px 8px', fontSize: 11, textAlign: 'left', borderBottom: '1px solid var(--border-light)' }}>Batch</th>
              <th style={{ padding: '6px 8px', fontSize: 11, textAlign: 'left', borderBottom: '1px solid var(--border-light)' }}>Qty (Kg)</th>
              <th style={{ padding: '6px 8px', fontSize: 11, textAlign: 'left', borderBottom: '1px solid var(--border-light)' }}>Qty (Mtr)</th>
              <th style={{ padding: '6px 8px', fontSize: 11, textAlign: 'left', borderBottom: '1px solid var(--border-light)' }}>Taka</th>
              {hasDualMachines && (
                <th style={{ padding: '6px 8px', fontSize: 11, textAlign: 'left', borderBottom: '1px solid var(--border-light)' }}>Machine</th>
              )}
              <th style={{ padding: '6px 8px', borderBottom: '1px solid var(--border-light)' }}></th>
            </tr>
          </thead>
          <tbody>
            {splitParts.map((part, i) => (
              <tr key={i} style={{ borderBottom: '1px solid var(--border-light)' }}>
                <td style={{ padding: '6px 8px', fontSize: 12, fontWeight: 600 }}>#{i + 1}</td>
                {(['kg', 'mtr', 'taka'] as const).map(f => (
                  <td key={f} style={{ padding: '6px 8px' }}>
                    <input type="number" value={part[f]}
                      onChange={e => upd(i, f, e.target.value)}
                      style={{ width: 80, padding: '4px 6px', fontSize: 12,
                        border: '1px solid var(--border-medium)', borderRadius: 4,
                        background: 'var(--bg-primary)', color: 'var(--text-primary)' }} />
                  </td>
                ))}
                {hasDualMachines && (
                  <td style={{ padding: '6px 8px' }}>
                    <select
                      value={part.machine_id || ''}
                      onChange={e => upd(i, 'machine_id', e.target.value)}
                      style={{ padding: '4px 8px', fontSize: 12, border: '1px solid var(--border-medium)',
                        borderRadius: 4, background: 'var(--bg-primary)', color: 'var(--text-primary)',
                        fontWeight: 600, minWidth: 140 }}>
                      <option value="">— Select —</option>
                      {allMachineOptions.map(m => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                  </td>
                )}
                <td style={{ padding: '6px 8px' }}>
                  {splitParts.length > 1 && (
                    <button className="xs danger" onClick={() => remove(i)}>✕</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <button className="small" onClick={add}>➕ Add Batch</button>
          <button className="small" onClick={balance}>Auto-Balance</button>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="primary" onClick={onSave} disabled={saving}>
            {saving ? 'Saving…' : '✓ Save Splits'}
          </button>
          <button onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}`

if (ordersPage.includes(oldSplitModal)) {
  ordersPage = ordersPage.replace(oldSplitModal, newSplitModal)
  console.log('✓ SplitModal updated with dual machine picker per batch')
} else {
  console.error('✗ SplitModal pattern not found')
}

// Fix saveSplits to use per-batch machine_id from splitParts
const oldBatches = `      const batches = splitParts.map((p, idx) => ({
        batch_id:   \`\${selectedOrder.order_number}-B\${startIdx + idx + 1}\`,
        kg:          parseFloat(p.kg)  || 0,
        mtr:         parseFloat(p.mtr) || 0,
        taka:        parseInt(p.taka)  || 0,
        machine_id:  selectedOrder.machine_id || null,
      }))`

const newBatches = `      const batches = splitParts.map((p, idx) => ({
        batch_id:   \`\${selectedOrder.order_number}-B\${startIdx + idx + 1}\`,
        kg:          parseFloat(p.kg)  || 0,
        mtr:         parseFloat(p.mtr) || 0,
        taka:        parseInt(p.taka)  || 0,
        // Use per-batch machine selection if available, else fall back to order's primary machine
        machine_id:  p.machine_id || selectedOrder.machine_id || null,
      }))`

if (ordersPage.includes(oldBatches)) {
  ordersPage = ordersPage.replace(oldBatches, newBatches)
  console.log('✓ saveSplits uses per-batch machine_id')
} else {
  console.error('✗ saveSplits batches pattern not found')
}

// Fix openSplitModal to pre-fill machine_id per part from first machine option
const oldPreFill = `      setSplitParts([{ kg: remainingKg, mtr: remainingMtr, taka: remainingTaka }])`

const newPreFill = `      const pm: Record<string, string[]> = o.process_machines || {}
      const primaryMachineId = (() => {
        // Get first machine from process_machines
        for (const ids of Object.values(pm)) {
          if ((ids as string[]).length) return (ids as string[])[0]
        }
        return o.machine_id || ''
      })()
      setSplitParts([{ kg: remainingKg, mtr: remainingMtr, taka: remainingTaka, machine_id: primaryMachineId }])`

if (ordersPage.includes(oldPreFill)) {
  ordersPage = ordersPage.replace(oldPreFill, newPreFill)
  console.log('✓ openSplitModal pre-fills machine_id per batch')
} else {
  console.error('✗ openSplitModal pre-fill pattern not found')
}

fs.writeFileSync(ordersPagePath, ordersPage, 'utf8')
console.log('\n✓ All fixes written.')
