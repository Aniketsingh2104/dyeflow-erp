const fs = require('fs')

// ── Fix 1: Splitted Orders — use repairing_orders as source of truth ──────────
let splitted = fs.readFileSync('app/splitted-orders/page.tsx', 'utf8')

// Replace the entire load function's filter logic
const OLD_LOAD = `  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [batchRes, orderRes] = await Promise.all([
        fetch('/api/batches?limit=5000', { cache: 'no-store' }).then(r => r.json()),
        fetch('/api/orders?limit=2000',  { cache: 'no-store' }).then(r => r.json()),
      ])
      const batches: any[] = batchRes.data || []
      const orders:  any[] = orderRes.data || []
      const oMap: Record<string, any> = {}
      for (const o of orders) oMap[o.id] = o

      // Exclude repair batches that haven't been split yet:
      // - status = 'repairing' (not yet assigned by supervisor)
      // - batch_id ends with -R or -RR etc (repair batch, not yet split/full-split)
      //   UNLESS it also has -S suffix (split batch - should show)
      // - status = 'pending' AND batch_id matches repair pattern (assigned but not split)
      const isRepairUnsplit = (b: any) => {
        const id: string = b.batch_id || ''
        // Has -R suffix (repair batch) but NOT -S suffix (not yet split)
        const isRepairBatch = /-R+$/.test(id) || (/-R+-/.test(id) && !/-S\d+$/.test(id))
        // Only exclude if still pending/repairing (not yet through full split)
        return isRepairBatch && (b.status === 'repairing' || b.status === 'pending')
      }
      const splitBatches = batches.filter((b: any) => !isRepairUnsplit(b))`

const NEW_LOAD = `  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [batchRes, orderRes, repairRes] = await Promise.all([
        fetch('/api/batches?limit=5000',        { cache: 'no-store' }).then(r => r.json()),
        fetch('/api/orders?limit=2000',          { cache: 'no-store' }).then(r => r.json()),
        fetch('/api/repairing-orders',           { cache: 'no-store' }).then(r => r.json()).catch(() => ({ data: [] })),
      ])
      const batches: any[] = batchRes.data || []
      const orders:  any[] = orderRes.data || []
      const repairs: any[] = repairRes.data || []
      const oMap: Record<string, any> = {}
      for (const o of orders) oMap[o.id] = o

      // Build set of batch UUIDs that are in repairing_orders but NOT yet split/full-split
      // repairing_orders.status = 'pending' → not yet split → exclude from Splitted Orders
      // repairing_orders.status = 'In Repair' → split done → show on Splitted Orders
      const repairPendingUUIDs = new Set(
        repairs
          .filter((r: any) => r.status === 'pending')
          .map((r: any) => r.batch_id)
          .filter(Boolean)
      )

      // Exclude batches that are in repairing_orders with status='pending'
      const splitBatches = batches.filter((b: any) => !repairPendingUUIDs.has(b.id))`

if (splitted.includes(OLD_LOAD)) {
  splitted = splitted.replace(OLD_LOAD, NEW_LOAD)
  fs.writeFileSync('app/splitted-orders/page.tsx', splitted, 'utf8')
  console.log('✓ Splitted Orders: uses repairing_orders.status as source of truth')
} else console.error('✗ Splitted Orders load pattern not found')

// ── Fix 2: Repairing Orders page — disable Split/Full Split when ro.status='In Repair' ──
let repair = fs.readFileSync('app/repairing-order/page.tsx', 'utf8')

const OLD_ACTIONS = `                        case 'actions': return (
                          <td key={col.key} style={{...s, overflow:'visible'}}>
                            <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
                              {/* Edit */}
                              <button className="xs"
                                onClick={() => { setEditModal(r); setEditData({ status:r.status, notes:r.notes||'', repair_kg:r.repair_kg }) }}>
                                Edit
                              </button>
                              {/* Split */}
                              <button className="xs"
                                onClick={() => openSplitModal(r)}
                                disabled={saving}
                                style={{ padding:'3px 8px', fontSize:11, fontWeight:600,
                                  border:'1px solid var(--accent)', borderRadius:4,
                                  cursor:'pointer', background:'transparent', color:'var(--accent)' }}>
                                ✂ Split
                              </button>
                              {/* Full Split */}
                              <button className="xs"
                                onClick={() => doFullSplit(r)}
                                disabled={saving}
                                style={{ padding:'3px 8px', fontSize:11, fontWeight:600,
                                  border:'none', borderRadius:4, cursor:'pointer',
                                  background:'#7C3AED', color:'white' }}>
                                ⚡ Full
                              </button>
                              {/* Reassign */}
                              <button className="xs"
                                onClick={() => { setAssignModal(r); setChosenSup(r.supervisor||'') }}
                                disabled={saving}
                                style={{ padding:'3px 8px', fontSize:11, fontWeight:600,
                                  border:'1px solid #D97706', borderRadius:4,
                                  cursor:'pointer', background:'#FFFBEB', color:'#92400E' }}>
                                👤 Reassign
                              </button>
                              {/* Delete / Rollback */}
                              <button className="xs"
                                onClick={() => handleDelete(r)}
                                disabled={saving}
                                style={{ padding:'3px 8px', fontSize:11, fontWeight:600,
                                  border:'1px solid #DC2626', borderRadius:4,
                                  cursor:'pointer', background:'transparent', color:'#DC2626' }}
                                title={`Roll back to ${r.source_type === 'fob' ? 'FOB' : 'Faulty'} page`}>
                                ↩ Delete
                              </button>
                            </div>
                          </td>
                        )`

const NEW_ACTIONS = `                        case 'actions': return (
                          <td key={col.key} style={{...s, overflow:'visible'}}>
                            <div style={{ display:'flex', gap:4, flexWrap:'wrap', alignItems:'center' }}>
                              {/* Edit — always available */}
                              <button className="xs"
                                onClick={() => { setEditModal(r); setEditData({ status:r.status, notes:r.notes||'', repair_kg:r.repair_kg }) }}>
                                Edit
                              </button>

                              {r.status === 'pending' ? (<>
                                {/* Split — only when pending (not yet split) */}
                                <button className="xs"
                                  onClick={() => openSplitModal(r)}
                                  disabled={saving}
                                  style={{ padding:'3px 8px', fontSize:11, fontWeight:600,
                                    border:'1px solid var(--accent)', borderRadius:4,
                                    cursor:'pointer', background:'transparent', color:'var(--accent)' }}>
                                  ✂ Split
                                </button>
                                {/* Full Split — only when pending */}
                                <button className="xs"
                                  onClick={() => doFullSplit(r)}
                                  disabled={saving}
                                  style={{ padding:'3px 8px', fontSize:11, fontWeight:600,
                                    border:'none', borderRadius:4, cursor:'pointer',
                                    background:'#7C3AED', color:'white' }}>
                                  ⚡ Full
                                </button>
                              </>) : (
                                /* Already split — show badge */
                                <span style={{ fontSize:11, fontWeight:700, padding:'3px 8px',
                                  borderRadius:4, background:'#DCFCE7', color:'#166534' }}>
                                  ✓ Split Done
                                </span>
                              )}

                              {/* Reassign — always available */}
                              <button className="xs"
                                onClick={() => { setAssignModal(r); setChosenSup(r.supervisor||'') }}
                                disabled={saving}
                                style={{ padding:'3px 8px', fontSize:11, fontWeight:600,
                                  border:'1px solid #D97706', borderRadius:4,
                                  cursor:'pointer', background:'#FFFBEB', color:'#92400E' }}>
                                👤 Reassign
                              </button>
                              {/* Delete / Rollback — always available */}
                              <button className="xs"
                                onClick={() => handleDelete(r)}
                                disabled={saving}
                                style={{ padding:'3px 8px', fontSize:11, fontWeight:600,
                                  border:'1px solid #DC2626', borderRadius:4,
                                  cursor:'pointer', background:'transparent', color:'#DC2626' }}
                                title={`Roll back to ${r.source_type === 'fob' ? 'FOB' : 'Faulty'} page`}>
                                ↩ Delete
                              </button>
                            </div>
                          </td>
                        )`

if (repair.includes(OLD_ACTIONS)) {
  repair = repair.replace(OLD_ACTIONS, NEW_ACTIONS)
  fs.writeFileSync('app/repairing-order/page.tsx', repair, 'utf8')
  console.log('✓ Repairing Orders: Split/Full Split only when status=pending; shows Split Done badge after')
} else console.error('✗ Actions pattern not found')

console.log('\n✓ All done')
