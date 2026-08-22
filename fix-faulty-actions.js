const fs = require('fs')

// ── Fix 1: /api/faulty — add mark_ok and reprocess actions ───────────────────
const apiContent = `import { NextRequest, NextResponse } from 'next/server'
import { dbSelect, dbUpdate, dbInsert, sb, auditLog } from '@/lib/supabase'

export async function GET() {
  try {
    const { data: records, error } = await dbSelect(
      'faulty_records',
      { order: 'created_at.desc', limit: '2000' },
      'id,batch_id,order_id,order_number,party,color,faulty_type,faulty_kg,process_code,status,if_ok,notes,reported_by,resolved_at,created_at,updated_at'
    )
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })

    const batchIds = [...new Set((records || []).map((r: any) => r.batch_id).filter(Boolean))]
    const orderIds = [...new Set((records || []).map((r: any) => r.order_id).filter(Boolean))]

    let batchMap: Record<string, any> = {}
    let orderMap: Record<string, any> = {}

    if (batchIds.length) {
      const { data: batches } = await dbSelect('batches',
        { id: \`in.(\${batchIds.join(',')})\`, limit: '2000' },
        'id,batch_id,kg,mtr,taka,sent_at,created_at,process_route,machines(id,name)'
      )
      for (const b of batches || []) batchMap[b.id] = b
    }

    if (orderIds.length) {
      const { data: orders } = await dbSelect('orders',
        { id: \`in.(\${orderIds.join(',')})\`, limit: '2000' },
        'id,order_number,party,sub_party,article,blend,width,gsm,color,lab_no,lot_no,challan_no,qty_kg,qty_mtr,no_of_taka,type_of_finish,type_of_packing,remarks,supervisors(id,name)'
      )
      for (const o of orders || []) orderMap[o.id] = o
    }

    const enriched = (records || []).map((r: any) => {
      const batch = batchMap[r.batch_id] || {}
      const order = orderMap[r.order_id] || {}
      return {
        ...r,
        batch_id_str:    batch.batch_id   || r.batch_id,
        batch_uuid:      r.batch_id,
        process_route:   batch.process_route || [],
        kg:              batch.kg          || r.faulty_kg,
        qty_mtr:         batch.mtr         || order.qty_mtr || '-',
        no_of_taka:      batch.taka        || order.no_of_taka || '-',
        machine:         batch.machines?.name || '-',
        sent_at:         batch.sent_at     || batch.created_at,
        order_number:    order.order_number || r.order_number,
        party:           order.party       || r.party,
        sub_party:       order.sub_party   || '-',
        article:         order.article     || '-',
        blend:           order.blend       || '-',
        width:           order.width       || '-',
        gsm:             order.gsm         || '-',
        color:           order.color || r.color || '-',
        lab_no:          order.lab_no      || '-',
        lot_no:          order.lot_no      || '-',
        challan_no:      order.challan_no  || '-',
        type_of_finish:  order.type_of_finish  || '-',
        type_of_packing: order.type_of_packing || '-',
        remarks:         order.remarks     || '-',
        supervisor:      order.supervisors?.name || '-',
      }
    })

    return NextResponse.json({ ok: true, data: enriched })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { action, id, ...payload } = body

  // ── Mark OK: batch goes to next process ───────────────────────────────────
  if (action === 'mark_ok') {
    const { batch_id, process_code, process_route } = payload
    if (!id || !batch_id) return NextResponse.json({ ok: false, error: 'id and batch_id required' }, { status: 400 })

    // Find next process after where faulty was marked
    const route: string[] = process_route || []
    const faultyIdx = route.findIndex((c: string) =>
      c.toUpperCase() === (process_code || '').toUpperCase() || c === process_code
    )
    const nextProcess = faultyIdx >= 0 && faultyIdx < route.length - 1
      ? route[faultyIdx + 1]
      : null

    // 1. Update faulty record — mark resolved
    await dbUpdate('faulty_records', { id }, {
      status:      'resolved',
      if_ok:       true,
      resolved_at: new Date().toISOString(),
      notes:       payload.notes || 'Marked OK — sent to next process',
    })

    // 2. Update batch — send to next process
    await dbUpdate('batches', { id: batch_id }, {
      is_faulty:       false,
      status:          nextProcess ? 'in-process' : 'done',
      current_process: nextProcess || null,
      sent_at:         new Date().toISOString(),
    })

    await auditLog({ action: 'faulty_ok', entity_type: 'faulty_record', entity_id: id,
      new_value: nextProcess ? \`sent to \${nextProcess}\` : 'completed' })
    return NextResponse.json({ ok: true, next_process: nextProcess })
  }

  // ── Reprocess: batch goes to Repairing Orders ─────────────────────────────
  if (action === 'reprocess') {
    const { batch_id, order_id, reprocess_reason, process_route } = payload
    if (!id || !batch_id) return NextResponse.json({ ok: false, error: 'id and batch_id required' }, { status: 400 })
    if (!reprocess_reason?.trim()) return NextResponse.json({ ok: false, error: 'Reprocess reason required' }, { status: 400 })

    // 1. Update faulty record — mark repairing
    await dbUpdate('faulty_records', { id }, {
      status: 'repairing',
      notes:  reprocess_reason,
    })

    // 2. Create repairing order entry
    const { error: repErr } = await dbInsert('repairing_orders', {
      faulty_id:     id,
      order_id:      order_id || null,
      batch_id:      batch_id,
      repair_kg:     payload.faulty_kg || 0,
      process_route: process_route || [],
      status:        'pending',
      notes:         reprocess_reason,
    })
    if (repErr) return NextResponse.json({ ok: false, error: repErr }, { status: 500 })

    // 3. Update batch — send to repairing
    await dbUpdate('batches', { id: batch_id }, {
      is_faulty:       false,
      status:          'repairing',
      current_process: null,
    })

    await auditLog({ action: 'faulty_reprocess', entity_type: 'faulty_record', entity_id: id,
      new_value: reprocess_reason })
    return NextResponse.json({ ok: true })
  }

  // ── Standard update ───────────────────────────────────────────────────────
  if (action === 'update') {
    if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })
    const patch: Record<string, any> = {}
    if (payload.status !== undefined) patch.status = payload.status
    if (payload.notes  !== undefined) patch.notes  = payload.notes
    if (payload.if_ok  !== undefined) patch.if_ok  = payload.if_ok
    if (payload.status === 'resolved') patch.resolved_at = new Date().toISOString()
    const { error } = await dbUpdate('faulty_records', { id }, patch)
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    await auditLog({ action: 'faulty_update', entity_type: 'faulty_record', entity_id: id, new_value: payload.status })
    return NextResponse.json({ ok: true })
  }

  // ── Delete ────────────────────────────────────────────────────────────────
  if (action === 'delete') {
    if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })
    const { error } = await sb('/faulty_records', { method: 'DELETE', params: { id: \`eq.\${id}\` } })
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 })
}
`
fs.writeFileSync('app/api/faulty/route.ts', apiContent, 'utf8')
console.log('✓ /api/faulty updated with mark_ok and reprocess actions')

// ── Fix 2: Update Faulty page — add Mark OK and Reprocess buttons ─────────────
const pagePath = 'app/faulty/page.tsx'
let page = fs.readFileSync(pagePath, 'utf8')

// Add okModal and reprocessModal states
const OLD_STATES = `  const [saving,       setSaving]       = useState(false)
  const [hiddenCols,   setHiddenCols]   = useState<Set<string>>(new Set())
  const [showColMenu,  setShowColMenu]  = useState(false)`

const NEW_STATES = `  const [saving,          setSaving]       = useState(false)
  const [hiddenCols,      setHiddenCols]   = useState<Set<string>>(new Set())
  const [showColMenu,     setShowColMenu]  = useState(false)
  const [okModal,         setOkModal]      = useState<any>(null)
  const [reprocessModal,  setReprocessModal]= useState<any>(null)
  const [reprocessReason, setReprocessReason] = useState('')`

if (page.includes(OLD_STATES)) {
  page = page.replace(OLD_STATES, NEW_STATES)
  console.log('✓ Added okModal and reprocessModal states')
} else console.error('✗ States pattern not found')

// Add handlers before handleUpdate
const OLD_HANDLE = `  const handleUpdate = async () => {`

const NEW_HANDLE = `  // ── Mark OK ─────────────────────────────────────────────────────────────
  const handleMarkOk = async () => {
    if (!okModal) return
    setSaving(true)
    try {
      const res = await fetch('/api/faulty', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action:         'mark_ok',
          id:             okModal.id,
          batch_id:       okModal.batch_uuid,
          process_code:   okModal.process_code,
          process_route:  okModal.process_route || [],
        })
      }).then(r => r.json())
      if (!res.ok) { alert('Error: ' + res.error); return }
      const next = res.next_process
      showToast(next ? \`✓ Batch marked OK → sent to \${next}\` : '✓ Batch marked OK — completed')
      setOkModal(null)
      load()
    } finally { setSaving(false) }
  }

  // ── Reprocess ────────────────────────────────────────────────────────────
  const handleReprocess = async () => {
    if (!reprocessModal || !reprocessReason.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/faulty', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action:           'reprocess',
          id:               reprocessModal.id,
          batch_id:         reprocessModal.batch_uuid,
          order_id:         reprocessModal.order_id,
          faulty_kg:        reprocessModal.faulty_kg,
          process_route:    reprocessModal.process_route || [],
          reprocess_reason: reprocessReason,
        })
      }).then(r => r.json())
      if (!res.ok) { alert('Error: ' + res.error); return }
      showToast('🔄 Batch sent to Repairing Orders')
      setReprocessModal(null)
      setReprocessReason('')
      load()
    } finally { setSaving(false) }
  }

  const handleUpdate = async () => {`

if (page.includes(OLD_HANDLE)) {
  page = page.replace(OLD_HANDLE, NEW_HANDLE)
  console.log('✓ Added handleMarkOk and handleReprocess handlers')
} else console.error('✗ handleUpdate pattern not found')

// Add Mark OK and Reprocess buttons in actions column
const OLD_ACTIONS = `                          case 'actions': return (
                            <td key={col.key} style={{...s, overflow:'visible'}}>
                              <div style={{ display:'flex', gap:4 }}>
                                <button className="xs"
                                  onClick={() => { setEditModal(r); setEditData({ status:r.status, notes:r.notes||'', if_ok:r.if_ok }) }}>
                                  Edit
                                </button>
                                <button className="xs danger" onClick={() => handleDelete(r.id)}>Del</button>
                              </div>
                            </td>
                          )`

const NEW_ACTIONS = `                          case 'actions': return (
                            <td key={col.key} style={{...s, overflow:'visible'}}>
                              <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
                                {r.status === 'open' && (<>
                                  <button
                                    onClick={() => setOkModal(r)}
                                    style={{ padding:'3px 8px', fontSize:11, fontWeight:700,
                                      border:'none', borderRadius:4, cursor:'pointer',
                                      background:'#16A34A', color:'white' }}>
                                    ✓ OK
                                  </button>
                                  <button
                                    onClick={() => { setReprocessModal(r); setReprocessReason('') }}
                                    style={{ padding:'3px 8px', fontSize:11, fontWeight:700,
                                      border:'none', borderRadius:4, cursor:'pointer',
                                      background:'#D97706', color:'white' }}>
                                    🔄 Reprocess
                                  </button>
                                </>)}
                                {r.status === 'repairing' && (
                                  <span style={{ fontSize:11, fontWeight:600, color:'#D97706' }}>🔄 In Repair</span>
                                )}
                                {r.status === 'resolved' && (
                                  <span style={{ fontSize:11, fontWeight:600, color:'#16A34A' }}>✓ Resolved</span>
                                )}
                                <button className="xs"
                                  onClick={() => { setEditModal(r); setEditData({ status:r.status, notes:r.notes||'', if_ok:r.if_ok }) }}>
                                  Edit
                                </button>
                                <button className="xs danger" onClick={() => handleDelete(r.id)}>Del</button>
                              </div>
                            </td>
                          )`

if (page.includes(OLD_ACTIONS)) {
  page = page.replace(OLD_ACTIONS, NEW_ACTIONS)
  console.log('✓ Added OK and Reprocess buttons to actions column')
} else console.error('✗ Actions pattern not found')

// Add modals before closing return
const OLD_CLOSE = `    </div>
  )
}
`

const NEW_CLOSE = `      {/* Mark OK Modal */}
      {okModal && (
        <div className="modal-overlay" onClick={() => setOkModal(null)}>
          <div className="modal" style={{ maxWidth:440 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Mark Batch as OK</span>
              <button className="small" onClick={() => setOkModal(null)}>✕</button>
            </div>
            <div style={{ background:'#F0FDF4', borderRadius:8, padding:'12px 14px', marginBottom:14 }}>
              <div style={{ fontSize:13, fontWeight:700, color:'#16A34A', marginBottom:4 }}>
                ✓ Batch passes inspection
              </div>
              <div style={{ fontSize:12, color:'#374151' }}>
                <strong>{okModal.batch_id_str}</strong> was faulty at <strong>{okModal.process_code}</strong>
              </div>
              <div style={{ fontSize:12, color:'#6B7280', marginTop:6 }}>
                {(() => {
                  const route = okModal.process_route || []
                  const idx = route.findIndex((c: string) => c.toUpperCase() === okModal.process_code?.toUpperCase() || c === okModal.process_code)
                  const next = idx >= 0 && idx < route.length - 1 ? route[idx + 1] : null
                  return next
                    ? \`→ Batch will be sent to \${next} process\`
                    : '→ Batch has no next process — will be marked complete'
                })()}
              </div>
            </div>
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
              <button onClick={() => setOkModal(null)}>Cancel</button>
              <button onClick={handleMarkOk} disabled={saving}
                style={{ padding:'8px 20px', fontSize:13, fontWeight:700, border:'none',
                  borderRadius:6, cursor:'pointer', background:'#16A34A', color:'white' }}>
                {saving ? 'Processing…' : '✓ Confirm OK'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reprocess Modal */}
      {reprocessModal && (
        <div className="modal-overlay" onClick={() => setReprocessModal(null)}>
          <div className="modal" style={{ maxWidth:480 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Send to Repairing Orders</span>
              <button className="small" onClick={() => setReprocessModal(null)}>✕</button>
            </div>
            <div style={{ background:'#FFFBEB', borderRadius:8, padding:'12px 14px', marginBottom:14 }}>
              <div style={{ fontSize:13, fontWeight:700, color:'#D97706', marginBottom:4 }}>
                🔄 Batch will be sent for reprocessing
              </div>
              <div style={{ fontSize:12, color:'#374151' }}>
                <strong>{reprocessModal.batch_id_str}</strong> — {reprocessModal.color} · {reprocessModal.faulty_kg} Kg
              </div>
              <div style={{ fontSize:11, color:'#6B7280', marginTop:4 }}>
                Faulty at: <strong>{reprocessModal.process_code}</strong> · Type: {reprocessModal.faulty_type}
              </div>
            </div>
            <div className="form-group" style={{ marginBottom:14 }}>
              <label>Reprocess Reason <span style={{ color:'var(--danger)' }}>*</span></label>
              <textarea value={reprocessReason} rows={3} autoFocus
                placeholder="e.g. Shade variation — needs re-dyeing, Crease mark — needs heat-set again…"
                onChange={e => setReprocessReason(e.target.value)}
                style={{ width:'100%', fontSize:13 }} />
            </div>
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
              <button onClick={() => setReprocessModal(null)}>Cancel</button>
              <button onClick={handleReprocess}
                disabled={!reprocessReason.trim() || saving}
                style={{ padding:'8px 20px', fontSize:13, fontWeight:700, border:'none',
                  borderRadius:6, cursor: reprocessReason.trim() ? 'pointer' : 'not-allowed',
                  background: reprocessReason.trim() ? '#D97706' : '#CBD5E0', color:'white' }}>
                {saving ? 'Processing…' : '🔄 Send to Repairing'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
`

if (page.includes(OLD_CLOSE)) {
  page = page.replace(OLD_CLOSE, NEW_CLOSE)
  console.log('✓ Added OK and Reprocess modals')
} else console.error('✗ Close pattern not found')

fs.writeFileSync(pagePath, page, 'utf8')
console.log('\n✓ All Faulty page changes applied')
