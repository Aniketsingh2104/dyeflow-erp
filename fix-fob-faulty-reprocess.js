// Shared Reprocess Modal Component
const REPROCESS_MODAL = `
// ── Reprocess Modal ───────────────────────────────────────────────────────────
interface ReprocessModalProps {
  record:          any
  onClose:         () => void
  onConfirm:       (data: ReprocessData) => void
  saving:          boolean
  sourceLabel:     string  // 'Faulty' or 'FOB'
  kgField:         string  // 'faulty_kg' or 'fob_kg'
}

interface ReprocessData {
  reprocess_type:  'full' | 'partial'
  reprocess_kg?:   number
  reprocess_mtr?:  number
  reprocess_taka?: number
  reprocess_reason: string
}

function ReprocessModal({ record, onClose, onConfirm, saving, sourceLabel, kgField }: ReprocessModalProps) {
  const [type,    setType]    = React.useState<'full'|'partial'>('full')
  const [kg,      setKg]      = React.useState('')
  const [mtr,     setMtr]     = React.useState('')
  const [taka,    setTaka]    = React.useState('')
  const [reason,  setReason]  = React.useState('')
  const totalKg = parseFloat(record?.[kgField] || record?.kg || 0)

  const remainKg = type === 'partial' && parseFloat(kg) > 0
    ? Math.max(0, totalKg - parseFloat(kg))
    : 0

  const canSubmit = reason.trim() && (type === 'full' || (parseFloat(kg) > 0 && parseFloat(kg) <= totalKg))

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth:520 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">🔄 Reprocess — {record?.batch_id_str || record?.batch_id}</span>
          <button className="small" onClick={onClose}>✕</button>
        </div>

        <div style={{ background:'#FFFBEB', borderRadius:8, padding:'10px 14px', marginBottom:14, fontSize:13 }}>
          <strong style={{ color:'#D97706' }}>{record?.batch_id_str}</strong>
          <span style={{ color:'#374151', marginLeft:8 }}>
            {record?.color} · Total: <strong>{totalKg} Kg</strong> · {sourceLabel} at <strong>{record?.process_code}</strong>
          </span>
        </div>

        {/* Full / Partial toggle */}
        <div style={{ marginBottom:14 }}>
          <div style={{ fontSize:12, fontWeight:700, color:'var(--text-tertiary)',
            textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:8 }}>
            Reprocess Type
          </div>
          <div style={{ display:'flex', gap:8 }}>
            {(['full','partial'] as const).map(t => (
              <button key={t} onClick={() => setType(t)} style={{
                flex:1, padding:'10px 0', fontSize:13, fontWeight: type===t ? 700 : 400,
                border:\`2px solid \${type===t ? '#D97706' : 'var(--border-medium)'}\`,
                borderRadius:8, cursor:'pointer',
                background: type===t ? '#FEF3C7' : 'var(--bg-primary)',
                color: type===t ? '#D97706' : 'var(--text-secondary)' }}>
                {t === 'full'
                  ? \`♻ Full (\${totalKg} Kg)\`
                  : '✂ Partial (enter qty)'}
              </button>
            ))}
          </div>
        </div>

        {/* Partial inputs */}
        {type === 'partial' && (
          <div style={{ background:'var(--bg-secondary)', borderRadius:8,
            padding:'12px 14px', marginBottom:14 }}>
            <div style={{ fontSize:12, fontWeight:600, marginBottom:10, color:'var(--text-primary)' }}>
              Reprocess Quantity
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10 }}>
              <div>
                <label style={{ fontSize:11, fontWeight:600, color:'var(--text-tertiary)',
                  display:'block', marginBottom:4 }}>KG *</label>
                <input type="number" min="0.1" max={totalKg} step="0.1" value={kg}
                  onChange={e => setKg(e.target.value)}
                  placeholder={\`max \${totalKg}\`}
                  style={{ width:'100%', padding:'6px 8px', fontSize:13,
                    border:\`1px solid \${parseFloat(kg)>totalKg ? 'var(--danger)' : 'var(--border-medium)'}\`,
                    borderRadius:4, background:'var(--bg-primary)' }} />
                {parseFloat(kg) > totalKg && (
                  <div style={{ fontSize:10, color:'var(--danger)', marginTop:2 }}>
                    Cannot exceed {totalKg} Kg
                  </div>
                )}
              </div>
              <div>
                <label style={{ fontSize:11, fontWeight:600, color:'var(--text-tertiary)',
                  display:'block', marginBottom:4 }}>MTR</label>
                <input type="number" min="0" step="0.1" value={mtr}
                  onChange={e => setMtr(e.target.value)}
                  placeholder="optional"
                  style={{ width:'100%', padding:'6px 8px', fontSize:13,
                    border:'1px solid var(--border-medium)', borderRadius:4,
                    background:'var(--bg-primary)' }} />
              </div>
              <div>
                <label style={{ fontSize:11, fontWeight:600, color:'var(--text-tertiary)',
                  display:'block', marginBottom:4 }}>TAKA</label>
                <input type="number" min="0" step="1" value={taka}
                  onChange={e => setTaka(e.target.value)}
                  placeholder="optional"
                  style={{ width:'100%', padding:'6px 8px', fontSize:13,
                    border:'1px solid var(--border-medium)', borderRadius:4,
                    background:'var(--bg-primary)' }} />
              </div>
            </div>
            {parseFloat(kg) > 0 && parseFloat(kg) < totalKg && (
              <div style={{ marginTop:10, padding:'8px 10px', background:'#DCFCE7',
                borderRadius:6, fontSize:12, color:'#166534' }}>
                ✓ Remaining <strong>{remainKg.toFixed(1)} Kg</strong> will continue to next process
              </div>
            )}
          </div>
        )}

        {/* Reason */}
        <div className="form-group" style={{ marginBottom:14 }}>
          <label>Reason / Remark <span style={{ color:'var(--danger)' }}>*</span></label>
          <textarea value={reason} rows={3} autoFocus
            placeholder="e.g. Shade variation — needs re-dyeing…"
            onChange={e => setReason(e.target.value)} />
        </div>

        <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
          <button onClick={onClose}>Cancel</button>
          <button onClick={() => onConfirm({
            reprocess_type: type,
            reprocess_kg:   type==='partial' ? parseFloat(kg)||0 : undefined,
            reprocess_mtr:  type==='partial' ? parseFloat(mtr)||0 : undefined,
            reprocess_taka: type==='partial' ? parseFloat(taka)||0 : undefined,
            reprocess_reason: reason,
          })}
            disabled={!canSubmit || saving}
            style={{ padding:'8px 20px', fontSize:13, fontWeight:700, border:'none',
              borderRadius:6, cursor: canSubmit ? 'pointer' : 'not-allowed',
              background: canSubmit ? '#D97706' : '#CBD5E0', color:'white' }}>
            {saving ? 'Processing…' : \`🔄 Send to Repairing\`}
          </button>
        </div>
      </div>
    </div>
  )
}
`

const fs = require('fs')

// Write shared modal component
fs.writeFileSync('components/ReprocessModal.tsx', `'use client'
import React from 'react'

interface ReprocessData {
  reprocess_type:   'full' | 'partial'
  reprocess_kg?:    number
  reprocess_mtr?:   number
  reprocess_taka?:  number
  reprocess_reason: string
}

interface Props {
  record:      any
  onClose:     () => void
  onConfirm:   (data: ReprocessData) => void
  saving:      boolean
  sourceLabel: string
  kgField:     string
}

export default function ReprocessModal({ record, onClose, onConfirm, saving, sourceLabel, kgField }: Props) {
  const [type,   setType]   = React.useState<'full'|'partial'>('full')
  const [kg,     setKg]     = React.useState('')
  const [mtr,    setMtr]    = React.useState('')
  const [taka,   setTaka]   = React.useState('')
  const [reason, setReason] = React.useState('')
  const totalKg = parseFloat(record?.[kgField] || record?.kg || 0)
  const remainKg = type==='partial' && parseFloat(kg)>0 ? Math.max(0, totalKg - parseFloat(kg)) : 0
  const canSubmit = reason.trim() && (type==='full' || (parseFloat(kg)>0 && parseFloat(kg)<=totalKg))

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth:520 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">🔄 Reprocess — {record?.batch_id_str}</span>
          <button className="small" onClick={onClose}>✕</button>
        </div>
        <div style={{ background:'#FFFBEB', borderRadius:8, padding:'10px 14px', marginBottom:14, fontSize:13 }}>
          <strong style={{ color:'#D97706' }}>{record?.batch_id_str}</strong>
          <span style={{ marginLeft:8, color:'#374151' }}>
            {record?.color} · Total: <strong>{totalKg} Kg</strong> · {sourceLabel} at <strong>{record?.process_code}</strong>
          </span>
        </div>
        <div style={{ marginBottom:14 }}>
          <div style={{ fontSize:12, fontWeight:700, color:'var(--text-tertiary)', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:8 }}>Reprocess Type</div>
          <div style={{ display:'flex', gap:8 }}>
            {(['full','partial'] as const).map(t => (
              <button key={t} onClick={() => setType(t)} style={{
                flex:1, padding:'10px 0', fontSize:13, fontWeight:type===t?700:400,
                border:\`2px solid \${type===t?'#D97706':'var(--border-medium)'}\`,
                borderRadius:8, cursor:'pointer',
                background:type===t?'#FEF3C7':'var(--bg-primary)',
                color:type===t?'#D97706':'var(--text-secondary)' }}>
                {t==='full' ? \`♻ Full (\${totalKg} Kg)\` : '✂ Partial (enter qty)'}
              </button>
            ))}
          </div>
        </div>
        {type==='partial' && (
          <div style={{ background:'var(--bg-secondary)', borderRadius:8, padding:'12px 14px', marginBottom:14 }}>
            <div style={{ fontSize:12, fontWeight:600, marginBottom:10 }}>Reprocess Quantity</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10 }}>
              {[['KG *',kg,setKg,true],['MTR',mtr,setMtr,false],['TAKA',taka,setTaka,false]].map(([lbl,val,setter,req]:any) => (
                <div key={lbl}>
                  <label style={{ fontSize:11, fontWeight:600, color:'var(--text-tertiary)', display:'block', marginBottom:4 }}>{lbl}</label>
                  <input type="number" min="0" step="0.1" value={val}
                    onChange={e => setter(e.target.value)}
                    placeholder={lbl==='KG *' ? \`max \${totalKg}\` : 'optional'}
                    style={{ width:'100%', padding:'6px 8px', fontSize:13,
                      border:\`1px solid \${lbl==='KG *'&&parseFloat(val)>totalKg?'var(--danger)':'var(--border-medium)'}\`,
                      borderRadius:4, background:'var(--bg-primary)' }} />
                </div>
              ))}
            </div>
            {parseFloat(kg)>0 && parseFloat(kg)<totalKg && (
              <div style={{ marginTop:10, padding:'8px 10px', background:'#DCFCE7', borderRadius:6, fontSize:12, color:'#166534' }}>
                ✓ Remaining <strong>{remainKg.toFixed(1)} Kg</strong> will continue to next process
              </div>
            )}
          </div>
        )}
        <div className="form-group" style={{ marginBottom:14 }}>
          <label>Reason <span style={{ color:'var(--danger)' }}>*</span></label>
          <textarea value={reason} rows={3} autoFocus placeholder="e.g. Shade variation — needs re-dyeing…" onChange={e => setReason(e.target.value)} />
        </div>
        <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
          <button onClick={onClose}>Cancel</button>
          <button onClick={() => onConfirm({ reprocess_type:type, reprocess_kg:type==='partial'?parseFloat(kg)||0:undefined, reprocess_mtr:type==='partial'?parseFloat(mtr)||0:undefined, reprocess_taka:type==='partial'?parseFloat(taka)||0:undefined, reprocess_reason:reason })}
            disabled={!canSubmit||saving}
            style={{ padding:'8px 20px', fontSize:13, fontWeight:700, border:'none', borderRadius:6, cursor:canSubmit?'pointer':'not-allowed', background:canSubmit?'#D97706':'#CBD5E0', color:'white' }}>
            {saving ? 'Processing…' : '🔄 Send to Repairing'}
          </button>
        </div>
      </div>
    </div>
  )
}
`, 'utf8')
console.log('✓ Created components/ReprocessModal.tsx')

// Fix Faulty page — update reprocess handler + add ReprocessModal
let faulty = fs.readFileSync('app/faulty/page.tsx', 'utf8')

// Add ReprocessModal import
faulty = \`import ReprocessModal from '@/components/ReprocessModal'\n\` + faulty

// Replace handleReprocess with full/partial version
const OLD_REPROCESS = \`  const handleReprocess = async () => {
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
  }\`

const NEW_REPROCESS = \`  const handleReprocess = async (data: any) => {
    if (!reprocessModal) return
    setSaving(true)
    try {
      const res = await fetch('/api/faulty', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action:            'reprocess',
          id:                reprocessModal.id,
          batch_id:          reprocessModal.batch_uuid,
          order_id:          reprocessModal.order_id,
          faulty_kg:         reprocessModal.faulty_kg,
          process_code:      reprocessModal.process_code,
          process_route:     reprocessModal.process_route || [],
          reprocess_type:    data.reprocess_type,
          reprocess_kg:      data.reprocess_kg,
          reprocess_mtr:     data.reprocess_mtr,
          reprocess_taka:    data.reprocess_taka,
          reprocess_reason:  data.reprocess_reason,
        })
      }).then(r => r.json())
      if (!res.ok) { alert('Error: ' + res.error); return }
      const msg = data.reprocess_type === 'partial' && res.remain_kg > 0
        ? \\\`🔄 \\\${res.repair_kg}Kg sent to Repairing · \\\${res.remain_kg}Kg → \\\${res.next_process}\\\`
        : '🔄 Full batch sent to Repairing Orders'
      showToast(msg)
      setReprocessModal(null)
      load()
    } finally { setSaving(false) }
  }\`

if (faulty.includes(OLD_REPROCESS)) {
  faulty = faulty.replace(OLD_REPROCESS, NEW_REPROCESS)
  console.log('✓ Faulty handleReprocess updated for full/partial')
} else console.error('✗ Faulty handleReprocess pattern not found')

// Replace old reprocess modal with ReprocessModal component
const OLD_REPROCESS_MODAL = \`      {/* Reprocess Modal */}
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
      )}\`

const NEW_REPROCESS_MODAL = \`      {reprocessModal && (
        <ReprocessModal
          record={reprocessModal}
          onClose={() => setReprocessModal(null)}
          onConfirm={handleReprocess}
          saving={saving}
          sourceLabel="Faulty"
          kgField="faulty_kg"
        />
      )}\`

if (faulty.includes(OLD_REPROCESS_MODAL)) {
  faulty = faulty.replace(OLD_REPROCESS_MODAL, NEW_REPROCESS_MODAL)
  console.log('✓ Faulty page uses shared ReprocessModal')
} else console.error('✗ Faulty reprocess modal pattern not found')

fs.writeFileSync('app/faulty/page.tsx', faulty, 'utf8')

// Fix FOB page — add mark_sent, fob_approved, reprocess buttons
let fob = fs.readFileSync('app/fob/page.tsx', 'utf8')

// Add ReprocessModal import
fob = \`import ReprocessModal from '@/components/ReprocessModal'\n\` + fob

// Add new states after saving state
const OLD_FOB_STATES = \`  const [saving,      setSaving]      = useState(false)
  const [hiddenCols,  setHiddenCols]  = useState<Set<string>>(new Set())
  const [showColMenu, setShowColMenu] = useState(false)\`

const NEW_FOB_STATES = \`  const [saving,           setSaving]        = useState(false)
  const [hiddenCols,       setHiddenCols]    = useState<Set<string>>(new Set())
  const [showColMenu,      setShowColMenu]   = useState(false)
  const [reprocessModal,   setReprocessModal]= useState<any>(null)
  const [approvedModal,    setApprovedModal] = useState<any>(null)\`

if (fob.includes(OLD_FOB_STATES)) {
  fob = fob.replace(OLD_FOB_STATES, NEW_FOB_STATES)
  console.log('✓ Added FOB reprocess/approved modal states')
} else console.error('✗ FOB states pattern not found')

// Add handlers before handleUpdate
const OLD_FOB_UPDATE = \`  const handleUpdate = async () => {\`

const NEW_FOB_HANDLERS = \`  const handleMarkSent = async (id: string) => {
    setSaving(true)
    try {
      const res = await fetch('/api/fob', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ action:'mark_sent', id })
      }).then(r => r.json())
      if (!res.ok) { alert('Error: ' + res.error); return }
      showToast('📤 FOB marked as sent — ' + new Date(res.sent_at).toLocaleString('en-GB'))
      load()
    } finally { setSaving(false) }
  }

  const handleFobApproved = async (r: any) => {
    if (!confirm(\\\`FOB Approved for \\\${r.batch_id_str}? Batch will go to next process.\\\`)) return
    setSaving(true)
    try {
      const res = await fetch('/api/fob', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          action:'fob_approved', id:r.id,
          batch_id:r.batch_uuid, process_code:r.process_code,
          process_route:r.process_route||[]
        })
      }).then(x => x.json())
      if (!res.ok) { alert('Error: ' + res.error); return }
      showToast(res.next_process ? \\\`✓ FOB Approved → sent to \\\${res.next_process}\\\` : '✓ FOB Approved — batch complete')
      setApprovedModal(null); load()
    } finally { setSaving(false) }
  }

  const handleReprocess = async (data: any) => {
    if (!reprocessModal) return
    setSaving(true)
    try {
      const res = await fetch('/api/fob', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          action:'reprocess', id:reprocessModal.id,
          batch_id:reprocessModal.batch_uuid, order_id:reprocessModal.order_id,
          fob_kg:reprocessModal.fob_kg, process_code:reprocessModal.process_code,
          process_route:reprocessModal.process_route||[],
          reprocess_type:data.reprocess_type, reprocess_kg:data.reprocess_kg,
          reprocess_mtr:data.reprocess_mtr, reprocess_taka:data.reprocess_taka,
          reprocess_reason:data.reprocess_reason,
        })
      }).then(x => x.json())
      if (!res.ok) { alert('Error: ' + res.error); return }
      const msg = data.reprocess_type==='partial' && res.remain_kg>0
        ? \\\`🔄 \\\${res.repair_kg}Kg sent to Repairing · \\\${res.remain_kg}Kg → \\\${res.next_process}\\\`
        : '🔄 Full batch sent to Repairing Orders'
      showToast(msg)
      setReprocessModal(null); load()
    } finally { setSaving(false) }
  }

  const handleUpdate = async () => {\`

if (fob.includes(OLD_FOB_UPDATE)) {
  fob = fob.replace(OLD_FOB_UPDATE, NEW_FOB_HANDLERS)
  console.log('✓ Added FOB mark_sent, fob_approved, handleReprocess handlers')
} else console.error('✗ FOB update pattern not found')

// Update actions column to add new buttons
const OLD_FOB_ACTIONS = \`                        case 'actions': return (
                          <td key={col.key} style={{...s, overflow:'visible'}}>
                            <div style={{ display:'flex', gap:4 }}>
                              <button className="xs"
                                onClick={() => { setEditModal(r); setEditData({ status:r.status, notes:r.notes||'' }) }}>
                                Edit
                              </button>
                              <button className="xs danger" onClick={() => handleDelete(r.id)}>Del</button>
                            </div>
                          </td>
                        )\`

const NEW_FOB_ACTIONS = \`                        case 'actions': return (
                          <td key={col.key} style={{...s, overflow:'visible'}}>
                            <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
                              {/* Mark Sent — only if not yet sent */}
                              {!r.sent_at && r.status === 'open' && (
                                <button onClick={() => handleMarkSent(r.id)} disabled={saving}
                                  style={{ padding:'3px 8px', fontSize:11, fontWeight:700,
                                    border:'none', borderRadius:4, cursor:'pointer',
                                    background:'#2563EB', color:'white' }}>
                                  📤 Mark Sent
                                </button>
                              )}
                              {r.sent_at && r.status !== 'approved' && r.status !== 'repairing' && (
                                <span style={{ fontSize:10, color:'#2563EB', fontWeight:600,
                                  padding:'3px 6px', background:'#DBEAFE', borderRadius:4 }}>
                                  📤 Sent
                                </span>
                              )}
                              {/* FOB Approved */}
                              {(r.status === 'open' || r.status === 'sent') && (
                                <button onClick={() => handleFobApproved(r)} disabled={saving}
                                  style={{ padding:'3px 8px', fontSize:11, fontWeight:700,
                                    border:'none', borderRadius:4, cursor:'pointer',
                                    background:'#16A34A', color:'white' }}>
                                  ✓ Approved
                                </button>
                              )}
                              {r.status === 'approved' && (
                                <span style={{ fontSize:10, color:'#16A34A', fontWeight:700,
                                  padding:'3px 6px', background:'#DCFCE7', borderRadius:4 }}>
                                  ✓ Approved
                                </span>
                              )}
                              {/* Reprocess */}
                              {(r.status === 'open' || r.status === 'sent') && (
                                <button onClick={() => setReprocessModal(r)} disabled={saving}
                                  style={{ padding:'3px 8px', fontSize:11, fontWeight:700,
                                    border:'none', borderRadius:4, cursor:'pointer',
                                    background:'#D97706', color:'white' }}>
                                  🔄 Reprocess
                                </button>
                              )}
                              {r.status === 'repairing' && (
                                <span style={{ fontSize:10, color:'#D97706', fontWeight:600,
                                  padding:'3px 6px', background:'#FEF3C7', borderRadius:4 }}>
                                  🔄 Repairing
                                </span>
                              )}
                              <button className="xs"
                                onClick={() => { setEditModal(r); setEditData({ status:r.status, notes:r.notes||'' }) }}>
                                Edit
                              </button>
                              <button className="xs danger" onClick={() => handleDelete(r.id)}>Del</button>
                            </div>
                          </td>
                        )\`

if (fob.includes(OLD_FOB_ACTIONS)) {
  fob = fob.replace(OLD_FOB_ACTIONS, NEW_FOB_ACTIONS)
  console.log('✓ FOB actions column updated with Mark Sent, Approved, Reprocess')
} else console.error('✗ FOB actions pattern not found')

// Add ReprocessModal at the end before closing
const OLD_FOB_CLOSE = \`    </div>
  )
}
\`

const NEW_FOB_CLOSE = \`      {reprocessModal && (
        <ReprocessModal
          record={reprocessModal}
          onClose={() => setReprocessModal(null)}
          onConfirm={handleReprocess}
          saving={saving}
          sourceLabel="FOB"
          kgField="fob_kg"
        />
      )}
    </div>
  )
}
\`

if (fob.includes(OLD_FOB_CLOSE)) {
  fob = fob.replace(OLD_FOB_CLOSE, NEW_FOB_CLOSE)
  console.log('✓ Added ReprocessModal to FOB page')
} else console.error('✗ FOB close pattern not found')

fs.writeFileSync('app/fob/page.tsx', fob, 'utf8')
console.log('\n✓ All FOB and Faulty changes applied')
