const fs = require('fs')

// ── Fix Faulty page — replace reprocess handler + modal with ReprocessModal ──
let faulty = fs.readFileSync('app/faulty/page.tsx', 'utf8')

// Add import at top
if (!faulty.includes('ReprocessModal')) {
  faulty = `import ReprocessModal from '@/components/ReprocessModal'\n` + faulty
  console.log('✓ Added ReprocessModal import to Faulty page')
}

// Replace old simple reprocess handler with full/partial version
const OLD_H = `  // ── Reprocess ────────────────────────────────────────────────────────────
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
  }`

const NEW_H = `  // ── Reprocess (Full or Partial) ────────────────────────────────────────
  const handleReprocess = async (data: any) => {
    if (!reprocessModal) return
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
          process_code:     reprocessModal.process_code,
          process_route:    reprocessModal.process_route || [],
          reprocess_type:   data.reprocess_type,
          reprocess_kg:     data.reprocess_kg,
          reprocess_mtr:    data.reprocess_mtr,
          reprocess_taka:   data.reprocess_taka,
          reprocess_reason: data.reprocess_reason,
        })
      }).then(r => r.json())
      if (!res.ok) { alert('Error: ' + res.error); return }
      const msg = data.reprocess_type === 'partial' && res.remain_kg > 0
        ? `🔄 ${res.repair_kg}Kg to Repairing · ${res.remain_kg}Kg → ${res.next_process}`
        : '🔄 Full batch sent to Repairing Orders'
      showToast(msg)
      setReprocessModal(null)
      load()
    } finally { setSaving(false) }
  }`

if (faulty.includes(OLD_H)) {
  faulty = faulty.replace(OLD_H, NEW_H)
  console.log('✓ Faulty handleReprocess updated for full/partial')
} else console.error('✗ Faulty handleReprocess pattern not found')

// Replace old reprocess modal with ReprocessModal component
const OLD_M = `      {/* Reprocess Modal */}
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
      )}`

const NEW_M = `      {/* Reprocess Modal — Full or Partial */}
      {reprocessModal && (
        <ReprocessModal
          record={reprocessModal}
          onClose={() => setReprocessModal(null)}
          onConfirm={handleReprocess}
          saving={saving}
          sourceLabel="Faulty"
          kgField="faulty_kg"
        />
      )}`

if (faulty.includes(OLD_M)) {
  faulty = faulty.replace(OLD_M, NEW_M)
  console.log('✓ Faulty page uses ReprocessModal component')
} else console.error('✗ Faulty reprocess modal pattern not found')

fs.writeFileSync('app/faulty/page.tsx', faulty, 'utf8')

// ── Fix FOB page — add mark_sent, fob_approved, reprocess buttons ─────────────
let fob = fs.readFileSync('app/fob/page.tsx', 'utf8')

// Add import
if (!fob.includes('ReprocessModal')) {
  fob = `import ReprocessModal from '@/components/ReprocessModal'\n` + fob
  console.log('✓ Added ReprocessModal import to FOB page')
}

// Add reprocessModal state
const OLD_S = `  const [saving,      setSaving]      = useState(false)
  const [hiddenCols,  setHiddenCols]  = useState<Set<string>>(new Set())
  const [showColMenu, setShowColMenu] = useState(false)`

const NEW_S = `  const [saving,          setSaving]        = useState(false)
  const [hiddenCols,      setHiddenCols]    = useState<Set<string>>(new Set())
  const [showColMenu,     setShowColMenu]   = useState(false)
  const [reprocessModal,  setReprocessModal] = useState<any>(null)`

if (fob.includes(OLD_S)) {
  fob = fob.replace(OLD_S, NEW_S)
  console.log('✓ Added reprocessModal state to FOB')
} else console.error('✗ FOB states pattern not found')

// Add handlers before handleUpdate
const OLD_HU = `  const handleUpdate = async () => {`

const NEW_HU = `  const handleMarkSent = async (id: string) => {
    setSaving(true)
    try {
      const res = await fetch('/api/fob', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mark_sent', id })
      }).then(r => r.json())
      if (!res.ok) { alert('Error: ' + res.error); return }
      showToast('📤 FOB marked as sent')
      load()
    } finally { setSaving(false) }
  }

  const handleFobApproved = async (r: any) => {
    if (!confirm('FOB Approved? Batch will go to next process.')) return
    setSaving(true)
    try {
      const res = await fetch('/api/fob', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'fob_approved', id: r.id,
          batch_id: r.batch_uuid, process_code: r.process_code,
          process_route: r.process_route || []
        })
      }).then(x => x.json())
      if (!res.ok) { alert('Error: ' + res.error); return }
      showToast(res.next_process ? `✓ FOB Approved → ${res.next_process}` : '✓ FOB Approved — complete')
      load()
    } finally { setSaving(false) }
  }

  const handleFobReprocess = async (data: any) => {
    if (!reprocessModal) return
    setSaving(true)
    try {
      const res = await fetch('/api/fob', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reprocess', id: reprocessModal.id,
          batch_id: reprocessModal.batch_uuid, order_id: reprocessModal.order_id,
          fob_kg: reprocessModal.fob_kg, process_code: reprocessModal.process_code,
          process_route: reprocessModal.process_route || [],
          reprocess_type: data.reprocess_type, reprocess_kg: data.reprocess_kg,
          reprocess_mtr: data.reprocess_mtr, reprocess_taka: data.reprocess_taka,
          reprocess_reason: data.reprocess_reason,
        })
      }).then(x => x.json())
      if (!res.ok) { alert('Error: ' + res.error); return }
      const msg = data.reprocess_type === 'partial' && res.remain_kg > 0
        ? `🔄 ${res.repair_kg}Kg to Repairing · ${res.remain_kg}Kg → ${res.next_process}`
        : '🔄 Full batch sent to Repairing Orders'
      showToast(msg)
      setReprocessModal(null); load()
    } finally { setSaving(false) }
  }

  const handleUpdate = async () => {`

if (fob.includes(OLD_HU)) {
  fob = fob.replace(OLD_HU, NEW_HU)
  console.log('✓ Added FOB handlers: mark_sent, fob_approved, handleFobReprocess')
} else console.error('✗ FOB handleUpdate pattern not found')

// Update actions column
const OLD_A = `                        case 'actions': return (
                          <td key={col.key} style={{...s, overflow:'visible'}}>
                            <div style={{ display:'flex', gap:4 }}>
                              <button className="xs"
                                onClick={() => { setEditModal(r); setEditData({ status:r.status, notes:r.notes||'' }) }}>
                                Edit
                              </button>
                              <button className="xs danger" onClick={() => handleDelete(r.id)}>Del</button>
                            </div>
                          </td>
                        )`

const NEW_A = `                        case 'actions': return (
                          <td key={col.key} style={{...s, overflow:'visible'}}>
                            <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
                              {!r.sent_at && r.status === 'open' && (
                                <button onClick={() => handleMarkSent(r.id)} disabled={saving}
                                  style={{ padding:'3px 8px', fontSize:11, fontWeight:700, border:'none',
                                    borderRadius:4, cursor:'pointer', background:'#2563EB', color:'white' }}>
                                  📤 Sent
                                </button>
                              )}
                              {r.sent_at && (
                                <span style={{ fontSize:10, color:'#2563EB', fontWeight:600,
                                  padding:'3px 6px', background:'#DBEAFE', borderRadius:4 }}>
                                  📤 {r.sent_at ? new Date(r.sent_at).toLocaleDateString('en-GB') : ''}
                                </span>
                              )}
                              {(r.status === 'open' || r.status === 'sent') && (<>
                                <button onClick={() => handleFobApproved(r)} disabled={saving}
                                  style={{ padding:'3px 8px', fontSize:11, fontWeight:700, border:'none',
                                    borderRadius:4, cursor:'pointer', background:'#16A34A', color:'white' }}>
                                  ✓ Approved
                                </button>
                                <button onClick={() => setReprocessModal(r)} disabled={saving}
                                  style={{ padding:'3px 8px', fontSize:11, fontWeight:700, border:'none',
                                    borderRadius:4, cursor:'pointer', background:'#D97706', color:'white' }}>
                                  🔄 Reprocess
                                </button>
                              </>)}
                              {r.status === 'approved' && (
                                <span style={{ fontSize:10, color:'#16A34A', fontWeight:700,
                                  padding:'3px 6px', background:'#DCFCE7', borderRadius:4 }}>✓ Approved</span>
                              )}
                              {r.status === 'repairing' && (
                                <span style={{ fontSize:10, color:'#D97706', fontWeight:600,
                                  padding:'3px 6px', background:'#FEF3C7', borderRadius:4 }}>🔄 Repairing</span>
                              )}
                              <button className="xs"
                                onClick={() => { setEditModal(r); setEditData({ status:r.status, notes:r.notes||'' }) }}>
                                Edit
                              </button>
                              <button className="xs danger" onClick={() => handleDelete(r.id)}>Del</button>
                            </div>
                          </td>
                        )`

if (fob.includes(OLD_A)) {
  fob = fob.replace(OLD_A, NEW_A)
  console.log('✓ FOB actions column updated')
} else console.error('✗ FOB actions pattern not found')

// Add ReprocessModal before closing tag
const OLD_C = `    </div>
  )
}
`
const NEW_C = `      {reprocessModal && (
        <ReprocessModal
          record={reprocessModal}
          onClose={() => setReprocessModal(null)}
          onConfirm={handleFobReprocess}
          saving={saving}
          sourceLabel="FOB"
          kgField="fob_kg"
        />
      )}
    </div>
  )
}
`

if (fob.includes(OLD_C)) {
  fob = fob.replace(OLD_C, NEW_C)
  console.log('✓ Added ReprocessModal to FOB page')
} else console.error('✗ FOB close pattern not found')

fs.writeFileSync('app/fob/page.tsx', fob, 'utf8')
console.log('\n✓ All done')
