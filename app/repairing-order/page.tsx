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
  { key:'actions',          label:'ACTIONS',         width:220 },
]

export default function RepairingOrderPage() {
  const [records,       setRecords]       = useState<any[]>([])
  const [loading,       setLoading]       = useState(true)
  const [statusFilter,  setStatusFilter]  = useState('all')
  const [search,        setSearch]        = useState('')
  const [toast,         setToast]         = useState('')
  const [saving,        setSaving]        = useState(false)
  const [hiddenCols,    setHiddenCols]    = useState<Set<string>>(new Set())
  const [showColMenu,   setShowColMenu]   = useState(false)

  const [editModal,     setEditModal]     = useState<any>(null)
  const [editData,      setEditData]      = useState<any>({})
  const [splitModal,    setSplitModal]    = useState<any>(null)
  const [splitParts,    setSplitParts]    = useState<any[]>([])
  const [assignModal,   setAssignModal]   = useState<any>(null)
  const [chosenSup,     setChosenSup]     = useState('')
  const [supervisors,   setSupervisors]   = useState<any[]>([])
  const [machines,      setMachines]      = useState<any[]>([])

  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3000) }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [repRes, supRes, machRes] = await Promise.all([
        fetch('/api/repairing-orders', { cache:'no-store' }).then(r=>r.json()),
        fetch('/api/supervisors',      { cache:'no-store' }).then(r=>r.json()).catch(()=>({data:[]})),
        fetch('/api/machines',         { cache:'no-store' }).then(r=>r.json()).catch(()=>({data:[]})),
      ])
      if (repRes.ok) setRecords(repRes.data || [])
      setSupervisors(supRes.data || [])
      setMachines(machRes.data || [])
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

  const revertId = (batchId: string) => {
    if (!batchId) return batchId
    if (batchId.match(/-R{2,}$/)) return batchId.slice(0, -1)
    if (batchId.endsWith('-R')) return batchId.slice(0, -2)
    return batchId
  }

  const getSplitId = (baseBatchId: string, idx: number) => `${baseBatchId}-S${idx}`

  const handleDelete = async (r: any) => {
    const msg = `Roll back batch ${r.batch_id_str} to ${r.source_type === 'fob' ? 'FOB' : 'Faulty'} page?\nBatch ID will revert: ${r.batch_id_str} -> ${revertId(r.batch_id_str)}`
    if (!confirm(msg)) return
    setSaving(true)
    try {
      const res = await fetch('/api/repairing-orders', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', id: r.id })
      }).then(x => x.json())
      if (!res.ok) { alert('Error: ' + res.error); return }
      showToast('Batch ' + res.reverted_batch_id + ' returned to ' + (res.source_type === 'fob' ? 'FOB' : 'Faulty') + ' page')
      load()
    } finally { setSaving(false) }
  }

  const handleUpdate = async () => {
    if (!editModal) return
    setSaving(true)
    try {
      const res = await fetch('/api/repairing-orders', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ action:'update', id:editModal.id, ...editData })
      }).then(r=>r.json())
      if (!res.ok) { alert('Error: ' + res.error); return }
      showToast('Updated'); setEditModal(null); load()
    } finally { setSaving(false) }
  }

  const doFullSplit = async (r: any) => {
    if (!r.batch_id) { alert('Error: Batch not linked. Refresh and try again.'); return }
    if (!confirm('Full Split: ' + r.batch_id_str + ' (' + r.repair_kg + ' Kg) will appear on Splitted Orders as a single batch.')) return
    setSaving(true)
    try {
      const res = await fetch('/api/batches', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ action:'update', id:r.batch_id, status:'pending' })
      }).then(x=>x.json())
      if (!res.ok) { alert('Error updating batch: ' + res.error); return }
      await fetch('/api/repairing-orders', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ action:'update', id:r.id, status:'In Repair' })
      })
      showToast(r.batch_id_str + ' now on Splitted Orders page')
      load()
    } finally { setSaving(false) }
  }

  const openSplitModal = (r: any) => {
    const kg   = parseFloat(r.repair_kg)  || 0
    const mtr  = parseFloat(r.repair_mtr) || 0
    const taka = parseInt(r.repair_taka)  || 0
    setSplitModal(r)
    setSplitParts([
      { kg: +(kg/2).toFixed(1), mtr: Math.round(mtr/2), taka: Math.round(taka/2), machine_id: '' },
      { kg: +(kg/2).toFixed(1), mtr: Math.round(mtr/2), taka: Math.round(taka/2), machine_id: '' },
    ])
  }

  const saveSplits = async () => {
    if (!splitModal) return
    const totalKg = splitParts.reduce((s,p) => s + (parseFloat(p.kg)||0), 0)
    if (totalKg <= 0) { alert('Enter batch quantities.'); return }
    setSaving(true)
    try {
      const baseId    = splitModal.batch_id_str
      const batchUUID = splitModal.batch_id
      if (!batchUUID) { alert('Error: Batch not linked. Refresh and try again.'); setSaving(false); return }
      await fetch('/api/batches', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          action:'update', id: batchUUID,
          kg: parseFloat(splitParts[0].kg)||0,
          mtr: parseFloat(splitParts[0].mtr)||0,
          taka: parseInt(splitParts[0].taka)||0,
          machine_id: splitParts[0].machine_id || splitModal.machine_id || null,
          status: 'pending',
        })
      })
      for (let i = 1; i < splitParts.length; i++) {
        const p = splitParts[i]
        await fetch('/api/batches', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({
            action: 'create',
            batch_id: getSplitId(baseId, i),
            order_id: splitModal.order_id,
            kg: parseFloat(p.kg)||0,
            mtr: parseFloat(p.mtr)||0,
            taka: parseInt(p.taka)||0,
            machine_id: p.machine_id || splitModal.machine_id || null,
            process_route: splitModal.process_route || [],
            status: 'pending',
          })
        })
      }
      if (splitModal.id) {
        await fetch('/api/repairing-orders', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ action:'update', id:splitModal.id, status:'In Repair' })
        })
      }
      showToast('Split into ' + splitParts.length + ' batches - now on Splitted Orders page')
      setSplitModal(null); setSplitParts([]); load()
    } finally { setSaving(false) }
  }

  const doReassign = async () => {
    if (!assignModal || !chosenSup) return
    const sup = supervisors.find((s:any) => s.name === chosenSup)
    if (!sup) { alert('Supervisor not found'); return }
    setSaving(true)
    try {
      await fetch('/api/batches', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ action:'update', id: assignModal.batch_id, supervisor_id: sup.id })
      })
      showToast('Reassigned to ' + chosenSup)
      setAssignModal(null); setChosenSup(''); load()
    } finally { setSaving(false) }
  }

  const stats = {
    total:     records.length,
    pending:   records.filter(r => r.status === 'pending').length,
    inRepair:  records.filter(r => r.status === 'In Repair').length,
    completed: records.filter(r => r.status === 'completed').length,
  }

  const visibleCols = COLUMNS.filter(c => !hiddenCols.has(c.key))

  // Only blank the page on the true first load; handleDelete/handleUpdate/
  // doFullSplit/saveSplits/doReassign all call load() again afterward.
  if (loading && records.length === 0) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center',
      height:'60vh', color:'var(--text-tertiary)', fontSize:14 }}>
      Loading repairing orders...
    </div>
  )

  return (
    <div className="content" style={{ display:'flex', flexDirection:'column',
      height:'calc(100vh - 42px)', padding:'12px 16px 0', gap:0 }}>

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

      <div style={{ display:'flex', gap:8, marginBottom:10, flexShrink:0, alignItems:'center', flexWrap:'wrap' }}>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search batch, order, party..."
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
            Columns ({visibleCols.length}/{COLUMNS.length})
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
        <button className="small" onClick={load}>Refresh</button>
      </div>

      {toast && (
        <div style={{ flexShrink:0, background:'var(--success-light)', color:'var(--success)',
          border:'1px solid var(--success)', borderRadius:8, padding:'8px 14px',
          marginBottom:8, fontSize:13, fontWeight:600 }}>{toast}</div>
      )}

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
                            {Array.isArray(r.process_route) ? r.process_route.join(' -> ') : (r.process_route || '-')}
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
                            <span style={{ padding:'3px 8px', borderRadius:4, fontSize:11, fontWeight:600,
                              background: r.status==='pending'?'var(--warning-light)':r.status==='completed'?'var(--success-light)':r.status==='rejected'?'var(--danger-light)':'var(--accent-light)',
                              color: r.status==='pending'?'var(--warning)':r.status==='completed'?'var(--success)':r.status==='rejected'?'var(--danger)':'var(--accent)' }}>
                              {r.status}
                            </span>
                          </td>
                        )
                        case 'actions': return (
                          <td key={col.key} style={{...s, overflow:'visible'}}>
                            <div style={{ display:'flex', gap:4, flexWrap:'wrap', alignItems:'center' }}>
                              <button className="xs"
                                onClick={() => { setEditModal(r); setEditData({ status:r.status, notes:r.notes||'', repair_kg:r.repair_kg }) }}>
                                Edit
                              </button>
                              {r.status === 'pending' ? (<>
                                <button onClick={() => openSplitModal(r)} disabled={saving}
                                  style={{ padding:'3px 8px', fontSize:11, fontWeight:600,
                                    border:'1px solid var(--accent)', borderRadius:4,
                                    cursor:'pointer', background:'transparent', color:'var(--accent)' }}>
                                  Split
                                </button>
                                <button onClick={() => doFullSplit(r)} disabled={saving}
                                  style={{ padding:'3px 8px', fontSize:11, fontWeight:600,
                                    border:'none', borderRadius:4, cursor:'pointer',
                                    background:'#7C3AED', color:'white' }}>
                                  Full Split
                                </button>
                              </>) : (
                                <span style={{ fontSize:11, fontWeight:700, padding:'3px 8px',
                                  borderRadius:4, background:'#DCFCE7', color:'#166534' }}>
                                  Split Done
                                </span>
                              )}
                              <button onClick={() => { setAssignModal(r); setChosenSup(r.supervisor||'') }}
                                disabled={saving}
                                style={{ padding:'3px 8px', fontSize:11, fontWeight:600,
                                  border:'1px solid #D97706', borderRadius:4,
                                  cursor:'pointer', background:'#FFFBEB', color:'#92400E' }}>
                                Reassign
                              </button>
                              <button onClick={() => handleDelete(r)} disabled={saving}
                                style={{ padding:'3px 8px', fontSize:11, fontWeight:600,
                                  border:'1px solid #DC2626', borderRadius:4,
                                  cursor:'pointer', background:'transparent', color:'#DC2626' }}>
                                Delete
                              </button>
                            </div>
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

      {editModal && (
        <div className="modal-overlay" onClick={() => setEditModal(null)}>
          <div className="modal" style={{ maxWidth:440 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Update Repairing Order</span>
              <button className="small" onClick={() => setEditModal(null)}>X</button>
            </div>
            <div style={{ background:'var(--bg-secondary)', borderRadius:8, padding:'10px 14px', marginBottom:14, fontSize:13 }}>
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
                {saving ? 'Saving...' : 'Save'}
              </button>
              <button onClick={() => setEditModal(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {splitModal && (
        <div className="modal-overlay" onClick={() => setSplitModal(null)}>
          <div className="modal" style={{ maxWidth:620 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Split — {splitModal.batch_id_str}</span>
              <button className="small" onClick={() => setSplitModal(null)}>X</button>
            </div>
            <div style={{ background:'#FFF5F5', borderRadius:8, padding:'10px 14px',
              marginBottom:14, border:'1px solid #FCA5A5', fontSize:13 }}>
              <strong style={{ color:'#DC2626' }}>{splitModal.batch_id_str}</strong>
              <span style={{ marginLeft:8, color:'#374151' }}>
                {splitModal.color} · Repair: <strong>{splitModal.repair_kg} Kg</strong>
              </span>
              <div style={{ fontSize:11, color:'#6B7280', marginTop:4 }}>
                Original batch keeps its ID · New splits: {getSplitId(splitModal.batch_id_str, 1)}, {getSplitId(splitModal.batch_id_str, 2)}...
              </div>
            </div>
            <table style={{ width:'100%', borderCollapse:'collapse', marginBottom:12 }}>
              <thead>
                <tr style={{ background:'var(--bg-secondary)' }}>
                  {['BATCH ID','KG','MTR','TAKA','MACHINE',''].map(h => (
                    <th key={h} style={{ padding:'6px 8px', fontSize:11, textAlign:'left',
                      borderBottom:'1px solid var(--border-light)', fontWeight:700,
                      color:'var(--text-tertiary)', textTransform:'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {splitParts.map((part, i) => (
                  <tr key={i} style={{ borderBottom:'1px solid var(--border-light)' }}>
                    <td style={{ padding:'6px 8px', fontSize:11, fontWeight:700, color:'#DC2626' }}>
                      {i === 0 ? splitModal.batch_id_str : getSplitId(splitModal.batch_id_str, i)}
                    </td>
                    {(['kg','mtr','taka'] as const).map(f => (
                      <td key={f} style={{ padding:'6px 8px' }}>
                        <input type="number" value={(part as any)[f] || ''}
                          onChange={e => setSplitParts(p => p.map((b,j) => j===i ? {...b,[f]:e.target.value} : b))}
                          style={{ width:75, padding:'4px 6px', fontSize:12,
                            border:'1px solid var(--border-medium)', borderRadius:4 }} />
                      </td>
                    ))}
                    <td style={{ padding:'6px 8px' }}>
                      <select value={part.machine_id || ''}
                        onChange={e => setSplitParts(p => p.map((b,j) => j===i ? {...b, machine_id:e.target.value} : b))}
                        style={{ padding:'4px 8px', fontSize:11, border:'1px solid var(--border-medium)',
                          borderRadius:4, minWidth:130 }}>
                        <option value="">— Machine —</option>
                        {machines.map((m:any) => (
                          <option key={m.id} value={m.id}>{m.name}</option>
                        ))}
                      </select>
                    </td>
                    <td style={{ padding:'6px 8px' }}>
                      {splitParts.length > 2 && (
                        <button className="xs danger"
                          onClick={() => setSplitParts(p => p.filter((_,j) => j !== i))}>X</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ display:'flex', gap:8, marginBottom:14 }}>
              <button className="small"
                onClick={() => setSplitParts(p => [...p, { kg:0, mtr:0, taka:0, machine_id:'' }])}>
                Add Batch
              </button>
              <button className="small"
                onClick={() => {
                  const total = parseFloat(splitModal.repair_kg) || 0
                  const per   = +(total / splitParts.length).toFixed(1)
                  setSplitParts(p => p.map(b => ({ ...b, kg: per })))
                }}>
                Auto-Balance
              </button>
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <button className="primary" onClick={saveSplits} disabled={saving}>
                {saving ? 'Saving...' : 'Save Splits'}
              </button>
              <button onClick={() => setSplitModal(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {assignModal && (
        <div className="modal-overlay" onClick={() => setAssignModal(null)}>
          <div className="modal" style={{ maxWidth:420 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Reassign — {assignModal.batch_id_str}</span>
              <button className="small" onClick={() => setAssignModal(null)}>X</button>
            </div>
            <div style={{ background:'var(--bg-secondary)', borderRadius:8, padding:'10px 14px', marginBottom:14, fontSize:13 }}>
              <strong>{assignModal.batch_id_str}</strong>
              <span style={{ marginLeft:8, color:'var(--text-secondary)' }}>
                {assignModal.party} · {assignModal.color} · {assignModal.repair_kg} Kg
              </span>
              <div style={{ fontSize:11, color:'#6B7280', marginTop:4 }}>
                Current Supervisor: <strong>{assignModal.supervisor || 'Unassigned'}</strong>
              </div>
            </div>
            <div className="form-group" style={{ marginBottom:16 }}>
              <label>Select New Supervisor</label>
              <select value={chosenSup} onChange={e => setChosenSup(e.target.value)}>
                <option value="">— Select Supervisor —</option>
                {supervisors.map((s:any) => (
                  <option key={s.id} value={s.name}>{s.name}</option>
                ))}
              </select>
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <button className="primary" onClick={doReassign} disabled={saving || !chosenSup}>
                {saving ? 'Saving...' : 'Reassign'}
              </button>
              <button onClick={() => setAssignModal(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
