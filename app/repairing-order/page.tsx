'use client'

import { useEffect, useState, useCallback } from 'react'

function fmtDateTime(d: any) {
  if (!d) return '-'
  try {
    const dt = new Date(d)
    return dt.toLocaleDateString('en-GB') + ' ' + dt.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' })
  } catch { return String(d) }
}

const COLUMNS = [
  { key:'created_at',       label:'TIMESTAMP',      width:145 },
  { key:'order_number',     label:'ORDER #',         width:120 },
  { key:'batch_id_str',     label:'BATCH #',         width:140 },
  { key:'party',            label:'PARTY',           width:100 },
  { key:'sub_party',        label:'SUB PARTY',       width:100 },
  { key:'article',          label:'ARTICLE',         width:90  },
  { key:'blend',            label:'BLEND',           width:70  },
  { key:'gsm',              label:'GSM',             width:60  },
  { key:'color',            label:'COLOR',           width:90  },
  { key:'lab_no',           label:'LAB NO.',         width:90  },
  { key:'challan_no',       label:'CHALLAN NO.',     width:100 },
  { key:'repair_kg',        label:'REPAIR KG',       width:90  },
  { key:'repair_mtr',       label:'REPAIR MTR',      width:90  },
  { key:'repair_taka',      label:'REPAIR TAKA',     width:90  },
  { key:'type_of_finish',   label:'FINISH',          width:100 },
  { key:'type_of_packing',  label:'PACKING',         width:90  },
  { key:'supervisor',       label:'SUPERVISOR',      width:110 },
  { key:'machine',          label:'MACHINE',         width:150 },
  { key:'process_route',    label:'PROCESS ROUTE',   width:200 },
  { key:'source_type',      label:'SOURCE',          width:80  },
  { key:'reprocess_type',   label:'TYPE',            width:80  },
  { key:'status',           label:'STATUS',          width:90  },
  { key:'notes',            label:'NOTES',           width:160 },
  { key:'actions',          label:'ACTIONS',         width:110 },
]

export default function RepairingOrderPage() {
  const [records,     setRecords]     = useState<any[]>([])
  const [loading,     setLoading]     = useState(true)
  const [statusFilter,setStatusFilter]= useState('all')
  const [search,      setSearch]      = useState('')
  const [toast,       setToast]       = useState('')
  const [editModal,   setEditModal]   = useState<any>(null)
  const [editData,    setEditData]    = useState<any>({})
  const [saving,      setSaving]      = useState(false)
  const [hiddenCols,  setHiddenCols]  = useState<Set<string>>(new Set())
  const [showColMenu, setShowColMenu] = useState(false)

  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3000) }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/repairing-orders', { cache:'no-store' }).then(r=>r.json())
      if (res.ok) setRecords(res.data || [])
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = records.filter(r => {
    if (statusFilter !== 'all' && r.status !== statusFilter) return false
    if (search.trim()) {
      const q = search.toLowerCase()
      return [r.order_number, r.party, r.batch_id_str, r.color, r.article]
        .some(v => String(v ?? '').toLowerCase().includes(q))
    }
    return true
  })

  const handleUpdate = async () => {
    if (!editModal) return
    setSaving(true)
    try {
      const res = await fetch('/api/repairing-orders', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ action:'update', id:editModal.id, ...editData })
      }).then(r=>r.json())
      if (!res.ok) { alert('Error: ' + res.error); return }
      showToast('✓ Updated'); setEditModal(null); load()
    } finally { setSaving(false) }
  }

  const stats = {
    total:     records.length,
    pending:   records.filter(r => r.status === 'pending').length,
    inRepair:  records.filter(r => r.status === 'In Repair').length,
    completed: records.filter(r => r.status === 'completed').length,
  }

  const visibleCols = COLUMNS.filter(c => !hiddenCols.has(c.key))

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center',
      height:'60vh', color:'var(--text-tertiary)', fontSize:14 }}>
      Loading repairing orders…
    </div>
  )

  return (
    <div className="content" style={{ display:'flex', flexDirection:'column',
      height:'calc(100vh - 42px)', padding:'12px 16px 0', gap:0 }}>

      {/* Stats */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:12, flexShrink:0 }}>
        {[
          { label:'Total',     value:stats.total,     color:'var(--text-primary)' },
          { label:'Pending',   value:stats.pending,   color:'var(--warning)' },
          { label:'In Repair', value:stats.inRepair,  color:'var(--accent)' },
          { label:'Completed', value:stats.completed, color:'var(--success)' },
        ].map(s => (
          <div key={s.label} style={{ background:'var(--bg-secondary)',
            border:'1px solid var(--border-light)', borderRadius:8, padding:'10px 14px' }}>
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
        {(['all','pending','In Repair','completed','rejected'] as const).map(f => (
          <button key={f} onClick={() => setStatusFilter(f)}
            style={{ fontSize:11, padding:'5px 12px', borderRadius:6, cursor:'pointer', border:'none',
              fontWeight: statusFilter===f ? 700 : 400,
              background: statusFilter===f ? 'var(--accent)' : 'var(--bg-secondary)',
              color: statusFilter===f ? '#fff' : 'var(--text-secondary)' }}>
            {f === 'all' ? 'All' : f === 'In Repair' ? 'In Repair' : f.charAt(0).toUpperCase()+f.slice(1)}
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
              <button onClick={() => setHiddenCols(new Set())}
                style={{ fontSize:11, padding:'3px 8px', border:'1px solid var(--border-medium)',
                  borderRadius:4, cursor:'pointer', marginBottom:8 }}>Show All</button>
              {COLUMNS.map(col => (
                <label key={col.key} style={{ display:'flex', alignItems:'center', gap:8,
                  padding:'3px 0', cursor:'pointer', fontSize:12 }}>
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
          marginBottom:8, fontSize:13, fontWeight:600 }}>{toast}</div>
      )}

      {/* Table */}
      <div style={{ flex:1, minHeight:0, background:'var(--bg-primary)',
        border:'1px solid var(--border-light)', borderRadius:8, overflow:'hidden',
        display:'flex', flexDirection:'column' }}>
        {filtered.length === 0 ? (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center',
            flex:1, color:'var(--text-tertiary)', fontSize:14 }}>
            {records.length === 0 ? 'No repairing orders yet.' : 'No records match your filters.'}
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
                {filtered.map((r, i) => (
                  <tr key={r.id||i} style={{
                    background: i%2===0 ? 'var(--bg-primary)' : 'var(--bg-secondary)',
                    borderBottom:'1px solid var(--border-light)',
                    borderLeft: `3px solid ${r.status==='completed'?'var(--success)':r.status==='rejected'?'var(--danger)':'var(--warning)'}` }}>
                    {visibleCols.map(col => {
                      const s: React.CSSProperties = { padding:'9px 10px', fontSize:12,
                        color:'var(--text-primary)', overflow:'hidden',
                        textOverflow:'ellipsis', whiteSpace:'nowrap', width:col.width }
                      switch(col.key) {
                        case 'created_at': return (
                          <td key={col.key} style={{...s, fontSize:11, color:'var(--text-tertiary)'}}>
                            {fmtDateTime(r.created_at)}
                          </td>
                        )
                        case 'order_number': return (
                          <td key={col.key} style={{...s, fontWeight:700, color:'var(--accent)'}}>
                            {r.order_number || '-'}
                          </td>
                        )
                        case 'batch_id_str': return (
                          <td key={col.key} style={{...s, fontWeight:700, color:'var(--accent)'}}>
                            {r.batch_id_str || r.batch_id || '-'}
                          </td>
                        )
                        case 'repair_kg': return (
                          <td key={col.key} style={{...s, fontWeight:700, color:'var(--danger)'}}>
                            {r.repair_kg ? `${r.repair_kg} Kg` : '-'}
                          </td>
                        )
                        case 'repair_mtr': return (
                          <td key={col.key} style={{...s, fontWeight:600, color:'var(--accent)'}}>
                            {r.repair_mtr || '-'}
                          </td>
                        )
                        case 'repair_taka': return (
                          <td key={col.key} style={{...s, fontWeight:600, color:'var(--accent)'}}>
                            {r.repair_taka || '-'}
                          </td>
                        )
                        case 'gsm': return (
                          <td key={col.key} style={{...s, fontWeight:700, color:'var(--accent)'}}>
                            {r.gsm || '-'}
                          </td>
                        )
                        case 'color': return (
                          <td key={col.key} style={{...s, color:'var(--accent)'}}>{r.color || '-'}</td>
                        )
                        case 'process_route': return (
                          <td key={col.key} style={{...s, fontSize:11, whiteSpace:'normal'}}>
                            {Array.isArray(r.process_route) ? r.process_route.join(' → ') : (r.process_route || '-')}
                          </td>
                        )
                        case 'source_type': return (
                          <td key={col.key} style={s}>
                            <span style={{ fontSize:11, fontWeight:700, padding:'2px 7px',
                              borderRadius:4,
                              background: r.source_type==='fob' ? 'var(--purple-light)' : 'var(--danger-light)',
                              color: r.source_type==='fob' ? 'var(--purple)' : 'var(--danger)' }}>
                              {r.source_type || 'faulty'}
                            </span>
                          </td>
                        )
                        case 'reprocess_type': return (
                          <td key={col.key} style={s}>
                            <span style={{ fontSize:11, fontWeight:600, padding:'2px 7px',
                              borderRadius:4,
                              background: r.reprocess_type==='partial' ? '#FEF3C7' : '#F3F4F6',
                              color: r.reprocess_type==='partial' ? '#D97706' : '#6B7280' }}>
                              {r.reprocess_type || 'full'}
                            </span>
                          </td>
                        )
                        case 'status': return (
                          <td key={col.key} style={s}>
                            <span style={{ padding:'3px 8px', borderRadius:4, fontSize:11,
                              fontWeight:600,
                              background: r.status==='pending'?'var(--warning-light)':r.status==='completed'?'var(--success-light)':r.status==='rejected'?'var(--danger-light)':'var(--accent-light)',
                              color: r.status==='pending'?'var(--warning)':r.status==='completed'?'var(--success)':r.status==='rejected'?'var(--danger)':'var(--accent)' }}>
                              {r.status}
                            </span>
                          </td>
                        )
                        case 'actions': return (
                          <td key={col.key} style={{...s, overflow:'visible'}}>
                            <button className="xs"
                              onClick={() => { setEditModal(r); setEditData({ status:r.status, notes:r.notes||'', repair_kg:r.repair_kg }) }}>
                              Edit
                            </button>
                          </td>
                        )
                        default: return <td key={col.key} style={s}>{r[col.key] ?? '-'}</td>
                      }
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {editModal && (
        <div className="modal-overlay" onClick={() => setEditModal(null)}>
          <div className="modal" style={{ maxWidth:440 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Update Repairing Order</span>
              <button className="small" onClick={() => setEditModal(null)}>✕</button>
            </div>
            <div style={{ background:'var(--bg-secondary)', borderRadius:8,
              padding:'10px 14px', marginBottom:14, fontSize:13 }}>
              <strong style={{ color:'var(--accent)' }}>{editModal.batch_id_str || editModal.batch_id}</strong>
              <span style={{ color:'var(--text-secondary)', marginLeft:8 }}>
                {editModal.party} · {editModal.color} · {editModal.repair_kg} Kg
              </span>
            </div>
            <div className="form-group" style={{ marginBottom:12 }}>
              <label>Status</label>
              <select value={editData.status}
                onChange={e => setEditData((p:any) => ({ ...p, status:e.target.value }))}>
                <option value="pending">Pending</option>
                <option value="In Repair">In Repair</option>
                <option value="completed">Completed</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>
            <div className="form-group" style={{ marginBottom:12 }}>
              <label>Repair Kg</label>
              <input type="number" value={editData.repair_kg || ''}
                onChange={e => setEditData((p:any) => ({ ...p, repair_kg:parseFloat(e.target.value)||0 }))} />
            </div>
            <div className="form-group" style={{ marginBottom:14 }}>
              <label>Notes</label>
              <textarea value={editData.notes} rows={3}
                onChange={e => setEditData((p:any) => ({ ...p, notes:e.target.value }))} />
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
    </div>
  )
}
