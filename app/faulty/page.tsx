'use client'

import { useEffect, useState, useCallback } from 'react'

function fmtDateTime(d: any) {
  if (!d) return '-'
  try {
    const dt = new Date(d)
    return dt.toLocaleDateString('en-GB') + ' ' + dt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  } catch { return String(d) }
}

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  open:          { bg: '#FEE2E2', color: '#991B1B' },
  repairing:     { bg: '#FEF3C7', color: '#92400E' },
  resolved:      { bg: '#D1FAE5', color: '#065F46' },
  'written-off': { bg: '#F3F4F6', color: '#6B7280' },
}

const COLUMNS = [
  { key: 'sent_at',        label: 'TIMESTAMP',    width: 145 },
  { key: 'order_number',   label: 'ORDER #',       width: 120 },
  { key: 'batch_id_str',   label: 'BATCH #',       width: 140 },
  { key: 'party',          label: 'PARTY',         width: 100 },
  { key: 'article',        label: 'ARTICLE',       width: 90  },
  { key: 'blend',          label: 'BLEND',         width: 70  },
  { key: 'gsm',            label: 'GSM',           width: 60  },
  { key: 'color',          label: 'COLOR',         width: 90  },
  { key: 'lab_no',         label: 'LAB NO.',       width: 90  },
  { key: 'challan_no',     label: 'CHALLAN NO.',   width: 100 },
  { key: 'kg',             label: 'QTY (KG)',      width: 80  },
  { key: 'qty_mtr',        label: 'QTY (MTR)',     width: 80  },
  { key: 'no_of_taka',     label: 'TAKA',          width: 60  },
  { key: 'type_of_finish', label: 'FINISH',        width: 100 },
  { key: 'type_of_packing',label: 'PACKING',       width: 90  },
  { key: 'supervisor',     label: 'SUPERVISOR',    width: 110 },
  { key: 'machine',        label: 'MACHINE',       width: 150 },
  { key: 'process_code',   label: 'PROCESS',       width: 80  },
  { key: 'faulty_type',    label: 'FAULTY TYPE',   width: 110 },
  { key: 'faulty_kg',      label: 'FAULTY KG',     width: 80  },
  { key: 'status',         label: 'STATUS',        width: 90  },
  { key: 'if_ok',          label: 'IF OK',         width: 60  },
  { key: 'notes',          label: 'NOTES',         width: 160 },
  { key: 'actions',        label: 'ACTIONS',       width: 110 },
]

export default function FaultyPage() {
  const [records,      setRecords]      = useState<any[]>([])
  const [loading,      setLoading]      = useState(true)
  const [search,       setSearch]       = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [toast,        setToast]        = useState('')
  const [editModal,    setEditModal]    = useState<any>(null)
  const [editData,     setEditData]     = useState<any>({})
  const [saving,          setSaving]       = useState(false)
  const [hiddenCols,      setHiddenCols]   = useState<Set<string>>(new Set())
  const [showColMenu,     setShowColMenu]  = useState(false)
  const [okModal,         setOkModal]      = useState<any>(null)
  const [reprocessModal,  setReprocessModal]= useState<any>(null)
  const [reprocessReason, setReprocessReason] = useState('')

  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3000) }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/faulty', { cache: 'no-store' }).then(r => r.json())
      if (res.ok) setRecords(res.data || [])
      else console.error('Faulty load error:', res.error)
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = records.filter(r => {
    if (statusFilter !== 'all' && r.status !== statusFilter) return false
    if (search.trim()) {
      const q = search.toLowerCase()
      return [r.order_number, r.party, r.batch_id_str, r.color, r.faulty_type, r.article]
        .some(v => String(v ?? '').toLowerCase().includes(q))
    }
    return true
  })

  // ── Mark OK ─────────────────────────────────────────────────────────────
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
      showToast(next ? `✓ Batch marked OK → sent to ${next}` : '✓ Batch marked OK — completed')
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

  const handleUpdate = async () => {
    if (!editModal) return
    setSaving(true)
    try {
      const res = await fetch('/api/faulty', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update', id: editModal.id, ...editData })
      }).then(r => r.json())
      if (!res.ok) { alert('Error: ' + res.error); return }
      showToast('✓ Record updated')
      setEditModal(null)
      load()
    } finally { setSaving(false) }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this faulty record?')) return
    const res = await fetch('/api/faulty', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', id })
    }).then(r => r.json())
    if (!res.ok) { alert('Error: ' + res.error); return }
    showToast('✓ Deleted')
    load()
  }

  const stats = {
    total:     records.length,
    open:      records.filter(r => r.status === 'open').length,
    repairing: records.filter(r => r.status === 'repairing').length,
    resolved:  records.filter(r => r.status === 'resolved').length,
  }

  const visibleCols = COLUMNS.filter(c => !hiddenCols.has(c.key))

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center',
      height:'60vh', color:'var(--text-tertiary)', fontSize:14 }}>
      Loading faulty records…
    </div>
  )

  return (
    <div className="content" style={{ display:'flex', flexDirection:'column',
      height:'calc(100vh - 42px)', padding:'12px 16px 0', gap:0 }}>

      {/* Stats */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:12, flexShrink:0 }}>
        {[
          { label:'Total',     value:stats.total,     color:'var(--text-primary)' },
          { label:'Open',      value:stats.open,      color:'var(--danger)'  },
          { label:'Repairing', value:stats.repairing, color:'var(--warning)' },
          { label:'Resolved',  value:stats.resolved,  color:'var(--success)' },
        ].map(s => (
          <div key={s.label} style={{ background:'var(--bg-secondary)', border:'1px solid var(--border-light)',
            borderRadius:8, padding:'10px 14px' }}>
            <div style={{ fontSize:10, fontWeight:700, color:'var(--text-tertiary)',
              textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:2 }}>{s.label}</div>
            <div style={{ fontSize:24, fontWeight:800, color:s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{ display:'flex', gap:8, marginBottom:10, flexShrink:0, alignItems:'center', flexWrap:'wrap' }}>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search batch, order, party…"
          style={{ width:240, padding:'6px 10px', fontSize:12,
            border:'1px solid var(--border-medium)', borderRadius:5,
            background:'var(--bg-primary)', color:'var(--text-primary)' }} />
        {(['all','open','repairing','resolved','written-off'] as const).map(f => (
          <button key={f} onClick={() => setStatusFilter(f)}
            style={{ fontSize:11, padding:'5px 12px', borderRadius:6, cursor:'pointer', border:'none',
              fontWeight: statusFilter === f ? 700 : 400,
              background: statusFilter === f ? 'var(--danger)' : 'var(--bg-secondary)',
              color: statusFilter === f ? '#fff' : 'var(--text-secondary)' }}>
            {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
        <div style={{ position:'relative', marginLeft:'auto' }}>
          <button onClick={() => setShowColMenu(v => !v)}
            style={{ padding:'6px 12px', fontSize:12, border:'1px solid var(--border-medium)',
              borderRadius:6, background:'var(--bg-primary)', cursor:'pointer' }}>
            ⊞ Columns ({visibleCols.length}/{COLUMNS.length})
          </button>
          {showColMenu && (
            <div style={{ position:'absolute', right:0, top:'110%', zIndex:100,
              background:'white', border:'1px solid var(--border-medium)', borderRadius:8,
              padding:12, minWidth:200, boxShadow:'0 4px 16px rgba(0,0,0,0.12)',
              maxHeight:360, overflowY:'auto' }}>
              <div style={{ display:'flex', gap:6, marginBottom:8 }}>
                <button onClick={() => setHiddenCols(new Set())}
                  style={{ fontSize:11, padding:'3px 8px', border:'1px solid var(--border-medium)', borderRadius:4, cursor:'pointer' }}>
                  Show All
                </button>
              </div>
              {COLUMNS.map(col => (
                <label key={col.key} style={{ display:'flex', alignItems:'center', gap:8, padding:'3px 0', cursor:'pointer', fontSize:12 }}>
                  <input type="checkbox" checked={!hiddenCols.has(col.key)}
                    onChange={() => setHiddenCols(prev => {
                      const n = new Set(prev); n.has(col.key) ? n.delete(col.key) : n.add(col.key); return n
                    })} style={{ accentColor:'var(--accent)' }} />
                  {col.label}
                </label>
              ))}
            </div>
          )}
        </div>
        <button className="small" onClick={load}>⟳</button>
      </div>

      {toast && (
        <div style={{ flexShrink:0, background:'var(--success-light)', color:'var(--success)',
          border:'1px solid var(--success)', borderRadius:8, padding:'8px 14px',
          marginBottom:8, fontSize:13, fontWeight:600 }}>
          {toast}
        </div>
      )}

      {/* Table */}
      <div style={{ flex:1, minHeight:0, background:'var(--bg-primary)',
        border:'1px solid var(--border-light)', borderRadius:8, overflow:'hidden',
        display:'flex', flexDirection:'column' }}>
        {filtered.length === 0 ? (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center',
            flex:1, color:'var(--text-tertiary)', fontSize:14 }}>
            {records.length === 0 ? 'No faulty records yet.' : 'No records match your filters.'}
          </div>
        ) : (
          <div style={{ flex:1, overflow:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', tableLayout:'fixed' }}>
              <colgroup>{visibleCols.map(c => <col key={c.key} style={{ width:c.width }} />)}</colgroup>
              <thead style={{ position:'sticky', top:0, zIndex:10, background:'var(--bg-secondary)' }}>
                <tr>
                  {visibleCols.map(col => (
                    <th key={col.key} style={{ padding:'9px 10px', textAlign:'left', fontSize:10,
                      fontWeight:700, color:'var(--text-tertiary)', textTransform:'uppercase',
                      letterSpacing:'0.05em', borderBottom:'2px solid var(--border-light)',
                      borderRight:'1px solid var(--border-light)', whiteSpace:'nowrap',
                      overflow:'hidden', width:col.width }}>
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => {
                  const sc = STATUS_COLORS[r.status] || STATUS_COLORS['written-off']
                  return (
                    <tr key={r.id || i} style={{
                      background: i%2===0 ? 'var(--bg-primary)' : 'var(--bg-secondary)',
                      borderBottom:'1px solid var(--border-light)' }}>
                      {visibleCols.map(col => {
                        const s: React.CSSProperties = { padding:'9px 10px', fontSize:12,
                          color:'var(--text-primary)', overflow:'hidden',
                          textOverflow:'ellipsis', whiteSpace:'nowrap', width:col.width }
                        switch(col.key) {
                          case 'sent_at': return (
                            <td key={col.key} style={{...s, fontSize:11, color:'var(--text-tertiary)'}}>
                              {fmtDateTime(r.sent_at || r.created_at)}
                            </td>
                          )
                          case 'order_number': return (
                            <td key={col.key} style={{...s, fontWeight:700, color:'var(--accent)'}}>
                              {r.order_number}
                            </td>
                          )
                          case 'batch_id_str': return (
                            <td key={col.key} style={{...s, fontWeight:700, color:'var(--accent)'}}>
                              {r.batch_id_str || r.batch_id}
                            </td>
                          )
                          case 'kg': return (
                            <td key={col.key} style={{...s, fontWeight:700, color:'var(--accent)'}}>
                              {r.kg} Kg
                            </td>
                          )
                          case 'faulty_kg': return (
                            <td key={col.key} style={{...s, fontWeight:700, color:'var(--danger)'}}>
                              {r.faulty_kg} Kg
                            </td>
                          )
                          case 'gsm': return (
                            <td key={col.key} style={{...s, fontWeight:700, color:'var(--accent)'}}>
                              {r.gsm}
                            </td>
                          )
                          case 'color': return (
                            <td key={col.key} style={{...s, color:'var(--accent)'}}>
                              {r.color}
                            </td>
                          )
                          case 'lab_no': return (
                            <td key={col.key} style={{...s, fontSize:11, color:'var(--accent)'}}>
                              {r.lab_no}
                            </td>
                          )
                          case 'challan_no': return (
                            <td key={col.key} style={{...s, fontSize:11, color:'var(--accent)'}}>
                              {r.challan_no}
                            </td>
                          )
                          case 'qty_mtr': return (
                            <td key={col.key} style={{...s, fontWeight:600, color:'var(--accent)'}}>
                              {r.qty_mtr}
                            </td>
                          )
                          case 'process_code': return (
                            <td key={col.key} style={{...s, textAlign:'center'}}>
                              <span style={{ display:'inline-flex', alignItems:'center', justifyContent:'center',
                                width:28, height:28, borderRadius:'50%', background:'var(--accent)',
                                color:'#fff', fontSize:11, fontWeight:700 }}>
                                {r.process_code}
                              </span>
                            </td>
                          )
                          case 'faulty_type': return (
                            <td key={col.key} style={{...s, color:'var(--danger)', fontWeight:600}}>
                              {r.faulty_type}
                            </td>
                          )
                          case 'status': return (
                            <td key={col.key} style={s}>
                              <span style={{ padding:'3px 8px', borderRadius:4, fontSize:11,
                                fontWeight:600, background:sc.bg, color:sc.color }}>
                                {r.status}
                              </span>
                            </td>
                          )
                          case 'if_ok': return (
                            <td key={col.key} style={{...s, textAlign:'center'}}>
                              {r.if_ok ? <span style={{ color:'var(--success)', fontWeight:700 }}>✓ OK</span> : '-'}
                            </td>
                          )
                          case 'actions': return (
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
                          )
                          default: return <td key={col.key} style={s}>{r[col.key] ?? '-'}</td>
                        }
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit modal */}
      {editModal && (
        <div className="modal-overlay" onClick={() => setEditModal(null)}>
          <div className="modal" style={{ maxWidth:480 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Edit Faulty Record — {editModal.batch_id_str || editModal.batch_id}</span>
              <button className="small" onClick={() => setEditModal(null)}>✕</button>
            </div>
            <div style={{ background:'var(--bg-secondary)', borderRadius:8, padding:'10px 14px', marginBottom:14, fontSize:13 }}>
              <strong style={{ color:'var(--danger)' }}>{editModal.batch_id_str}</strong>
              <span style={{ color:'var(--text-secondary)', marginLeft:8 }}>
                {editModal.party} · {editModal.color} · {editModal.faulty_kg} Kg · {editModal.process_code}
              </span>
            </div>
            <div className="form-group" style={{ marginBottom:12 }}>
              <label>Status</label>
              <select value={editData.status}
                onChange={e => setEditData((p: any) => ({ ...p, status:e.target.value }))}>
                <option value="open">Open</option>
                <option value="repairing">Repairing</option>
                <option value="resolved">Resolved</option>
                <option value="written-off">Written Off</option>
              </select>
            </div>
            <div className="form-group" style={{ marginBottom:12 }}>
              <label>Notes</label>
              <textarea value={editData.notes} rows={3}
                onChange={e => setEditData((p: any) => ({ ...p, notes:e.target.value }))} />
            </div>
            <div className="form-group" style={{ marginBottom:14 }}>
              <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer' }}>
                <input type="checkbox" checked={!!editData.if_ok}
                  onChange={e => setEditData((p: any) => ({ ...p, if_ok:e.target.checked }))}
                  style={{ accentColor:'var(--success)' }} />
                Mark as "If OK" (batch passes inspection)
              </label>
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <button className="primary" onClick={handleUpdate} disabled={saving}>
                {saving ? 'Saving…' : '✓ Save'}
              </button>
              <button onClick={() => setEditModal(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
      {/* Mark OK Modal */}
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
                    ? `→ Batch will be sent to ${next} process`
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
