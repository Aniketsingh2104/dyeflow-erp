'use client'
import { SubProdCell } from '@/components/SubProd'
import { getActiveUserRecord, isAdminUser } from '@/lib/permissions'
import { useIsMobile } from '@/lib/useIsMobile'
import MobileRecordCards, { mbtn } from '@/components/MobileRecordCards'
import ReprocessModal from '@/components/ReprocessModal'

import { useEffect, useState, useCallback } from 'react'
import { useAutoRefresh, RefreshStamp } from '@/components/useAutoRefresh'

// fob_records.status values (see lib/recordStatus.ts)
const FOB_STATUS_LABEL: Record<string, string> = {
  all: 'All Status', open: 'Open', sent: 'Sample Sent', repairing: 'In Repair', approved: 'Approved',
}
const FOB_BADGE: Record<string, { bg: string; color: string }> = {
  open:      { bg: 'var(--danger-light)',  color: 'var(--danger)'  },
  sent:      { bg: '#DBEAFE',              color: '#2563EB'        },
  repairing: { bg: '#FEF3C7',              color: '#D97706'        },
  approved:  { bg: 'var(--success-light)', color: 'var(--success)' },
}

function fmtDateTime(d: any) {
  if (!d) return '-'
  try {
    const dt = new Date(d)
    return dt.toLocaleDateString('en-GB') + ' ' + dt.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' })
  } catch { return String(d) }
}

const COLUMNS = [
  { key:'sent_at',          label:'TIMESTAMP',     width:145 },
  { key:'order_number',     label:'ORDER #',        width:120 },
  { key:'batch_id_str',     label:'BATCH #',        width:140 },
  { key:'sub_prod_no',      label:'SUB PROD NO.',   width:120 },
  { key:'party',            label:'PARTY',          width:100 },
  { key:'sub_party',        label:'SUB PARTY',      width:100 },
  { key:'article',          label:'ARTICLE',        width:90  },
  { key:'blend',            label:'BLEND',          width:70  },
  { key:'gsm',              label:'GSM',            width:60  },
  { key:'color',            label:'COLOR',          width:90  },
  { key:'lab_no',           label:'LAB NO.',        width:90  },
  { key:'challan_no',       label:'CHALLAN NO.',    width:100 },
  { key:'kg',               label:'QTY (KG)',       width:80  },
  { key:'qty_mtr',          label:'QTY (MTR)',      width:80  },
  { key:'no_of_taka',       label:'TAKA',           width:60  },
  { key:'type_of_finish',   label:'FINISH',         width:100 },
  { key:'type_of_packing',  label:'PACKING',        width:90  },
  { key:'supervisor',       label:'SUPERVISOR',     width:110 },
  { key:'machine',          label:'MACHINE',        width:150 },
  { key:'process_code',     label:'PROCESS',        width:80  },
  { key:'fob_type',         label:'FOB TYPE',       width:90  },
  { key:'fob_kg',           label:'FOB KG',         width:80  },
  { key:'status',           label:'STATUS',         width:80  },
  { key:'notes',            label:'NOTES',          width:160 },
  { key:'actions',          label:'ACTIONS',        width:110 },
]

export default function FobPage() {
  const [isAdmin, setIsAdmin] = useState(false)
  const isMobile = useIsMobile()
  useEffect(() => { setIsAdmin(isAdminUser(getActiveUserRecord())) }, [])
  const [records,     setRecords]     = useState<any[]>([])
  const [loading,     setLoading]     = useState(true)
  const [search,      setSearch]      = useState('')
  const [typeFilter,  setTypeFilter]  = useState<'all'|'dyeing'|'rolling'>('all')
  const [statusFilter,setStatusFilter]= useState('all')
  const [toast,       setToast]       = useState('')
  const [editModal,   setEditModal]   = useState<any>(null)
  const [editData,    setEditData]    = useState<any>({})
  const [saving,         setSaving]        = useState(false)
  const [hiddenCols,     setHiddenCols]    = useState<Set<string>>(new Set())
  const [showColMenu,    setShowColMenu]   = useState(false)
  const [reprocessModal, setReprocessModal] = useState<any>(null)

  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3000) }

  // silent = auto-refresh: no spinner, the table just updates in place
  const load = useCallback(async (silent: boolean | unknown = false) => {
    if (silent !== true) setLoading(true)
    try {
      const url = typeFilter !== 'all' ? `/api/fob?type=${typeFilter}` : '/api/fob'
      const res = await fetch(url, { cache:'no-store' }).then(r => r.json())
      if (res.ok) setRecords(res.data || [])
    } finally { setLoading(false) }
  }, [typeFilter])

  useEffect(() => { load() }, [load])
  useAutoRefresh(() => load(true))

  const filtered = records.filter(r => {
    if (statusFilter !== 'all' && (r.status || 'open') !== statusFilter) return false
    if (search.trim()) {
      const q = search.toLowerCase()
      return [r.order_number, r.party, r.batch_id_str, r.sub_prod_no, r.color, r.fob_type, r.article]
        .some(v => String(v ?? '').toLowerCase().includes(q))
    }
    return true
  })

  const handleMarkSent = async (id: string) => {
    setSaving(true)
    try {
      const res = await fetch('/api/fob', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mark_sent', id })
      }).then(r => r.json())
      if (!res.ok) { alert('Error: ' + res.error); if (res.stale) load(); return }
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
      if (!res.ok) { alert('Error: ' + res.error); if (res.stale) load(); return }
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
      if (!res.ok) { alert('Error: ' + res.error); if (res.stale) load(); return }
      const msg = data.reprocess_type === 'partial' && res.remain_kg > 0
        ? `🔄 ${res.repair_kg}Kg to Repairing · ${res.remain_kg}Kg → ${res.next_process}`
        : '🔄 Full batch sent to Repairing Orders'
      showToast(msg)
      setReprocessModal(null); load()
    } finally { setSaving(false) }
  }

  const handleUpdate = async () => {
    if (!editModal) return
    setSaving(true)
    try {
      const res = await fetch('/api/fob', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ action:'update', id:editModal.id, ...editData })
      }).then(r => r.json())
      if (!res.ok) { alert('Error: ' + res.error); if (res.stale) load(); return }
      showToast('✓ Record updated'); setEditModal(null); load()
    } finally { setSaving(false) }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this FOB record?')) return
    const res = await fetch('/api/fob', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ action:'delete', id })
    }).then(r => r.json())
    if (!res.ok) { alert('Error: ' + res.error); if (res.stale) load(); return }
    showToast('✓ Deleted'); load()
  }

  const stats = {
    total:   records.length,
    dyeing:  records.filter(r => r.fob_type === 'dyeing').length,
    rolling: records.filter(r => r.fob_type === 'rolling').length,
    open:      records.filter(r => r.status === 'open' || !r.status).length,
    sent:      records.filter(r => r.status === 'sent').length,
    repairing: records.filter(r => r.status === 'repairing').length,
    approved:  records.filter(r => r.status === 'approved').length,
  }

  const visibleCols = COLUMNS.filter(c => !hiddenCols.has(c.key))

  // Only blank the page on the true first load; all the action handlers
  // (Mark Sent/Approved/Reprocess/Update/Delete) call load() again afterward.
  if (loading && records.length === 0) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center',
      height:'60vh', color:'var(--text-tertiary)', fontSize:14 }}>Loading FOB records…</div>
  )

  const modals = (<>
      {/* Edit modal */}
      {editModal && (
        <div className="modal-overlay" onClick={() => setEditModal(null)}>
          <div className="modal" style={{ maxWidth:440 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Edit FOB Record — {editModal.batch_id_str || editModal.batch_id}</span>
              <button className="small" onClick={() => setEditModal(null)}>✕</button>
            </div>
            <div style={{ background:'var(--bg-secondary)', borderRadius:8,
              padding:'10px 14px', marginBottom:14, fontSize:13 }}>
              <strong style={{ color:'var(--purple)' }}>{editModal.batch_id_str}</strong>
              <span style={{ color:'var(--text-secondary)', marginLeft:8 }}>
                {editModal.party} · {editModal.color} · {editModal.fob_kg} Kg · {editModal.process_code}
              </span>
            </div>
            <div style={{ fontSize:12, color:'var(--text-secondary)', marginBottom:12 }}>
              Status: <strong>{FOB_STATUS_LABEL[editModal.status || 'open'] || editModal.status}</strong> — change it with
              the Mark Sent / Approved / Reprocess buttons, so the batch moves with it.
            </div>
            <div className="form-group" style={{ marginBottom:14 }}>
              <label>Notes / Resolution</label>
              <textarea value={editData.notes} rows={3}
                onChange={e => setEditData((p: any) => ({ ...p, notes:e.target.value }))} />
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
      {reprocessModal && (
        <ReprocessModal
          record={reprocessModal}
          onClose={() => setReprocessModal(null)}
          onConfirm={handleFobReprocess}
          saving={saving}
          sourceLabel="FOB"
          kgField="fob_kg"
        />
      )}
  </>)

  // ── Phone: card list (components/MobileRecordCards.tsx)
  if (isMobile) {
    const ST: Record<string, [string, string, string]> = { open: ['#FEE2E2', '#991B1B', 'Open'], sent: ['#DBEAFE', '#1E40AF', '📤 Sent'], approved: ['#DCFCE7', '#16A34A', '✓ Approved'], repairing: ['#FEF3C7', '#D97706', '🔄 Repairing'] }
    return (
      <>
        <MobileRecordCards title="FOB" rows={filtered} idOf={r => r.id} onRefresh={load}
          tabs={[{ key: 'open', label: 'Open', match: r => r.status === 'open' || r.status === 'sent' }, { key: 'repairing', label: 'Repairing', match: r => r.status === 'repairing' },
                 { key: 'approved', label: 'Approved', match: r => r.status === 'approved' }, { key: 'all', label: 'All', match: () => true }]}
          searchFields={r => [r.batch_id_str, r.sub_prod_no, r.order_number, r.party, r.color, r.fob_type, r.article]}
          head={r => { const st = ST[r.status] || ['var(--bg-secondary)', 'var(--text-secondary)', r.status]; return {
            title: r.batch_id_str || r.batch_id, subProd: r.sub_prod_no, line1: `${r.order_number} · ${r.party}`, line2: `${r.article} · ${r.color}`,
            big: String(r.fob_kg ?? r.kg ?? ''), bigUnit: 'Kg', small: fmtDateTime(r.sent_at || r.created_at),
            chip: { text: st[2], bg: st[0], fg: st[1] }, edge: r.status === 'approved' ? '#16A34A' : r.status === 'repairing' ? '#D97706' : r.status === 'sent' ? '#2563EB' : '#DC2626',
            tags: [{ text: `at ${r.process_code || '?'}`, bg: '#E0E7FF', fg: '#3730A3' }, { text: r.fob_type === 'rolling' ? '🟣 Rolling FOB' : '🔵 Dyeing FOB', bg: '#F3E8FF', fg: '#7C3AED' },
                   ...(r.sent_at ? [{ text: `📤 ${new Date(r.sent_at).toLocaleDateString('en-GB')}`, bg: '#DBEAFE', fg: '#2563EB' }] : [])] } }}
          details={r => [['Batch kg', r.kg], ['Mtr', r.qty_mtr], ['Taka', r.no_of_taka], ['Machine', r.machine], ['Lab No.', r.lab_no], ['Lot', r.lot_no], ['Challan', r.challan_no], ['Blend', r.blend], ['GSM', r.gsm], ['Supervisor', r.supervisor], ['Finish', r.type_of_finish], ['Notes', r.notes]]}
          actions={r => (<>
            {!r.sent_at && r.status === 'open' && <button className="edit-only" onClick={() => handleMarkSent(r.id)} disabled={saving} style={mbtn('#2563EB', '#fff', undefined, true)}>📤 Mark Sent</button>}
            {(r.status === 'open' || r.status === 'sent') && <button className="edit-only" onClick={() => handleFobApproved(r)} disabled={saving} style={mbtn('#16A34A', '#fff')}>✓ Approved</button>}
            {(r.status === 'open' || r.status === 'sent') && <button className="edit-only" onClick={() => setReprocessModal(r)} disabled={saving} style={mbtn('#D97706', '#fff')}>🔄 Reprocess</button>}
            <button className="edit-only" onClick={() => { setEditModal(r); setEditData({ notes: r.notes || '' }) }} style={mbtn('var(--bg-primary)', 'var(--text-primary)', 'var(--border-medium)', !(isAdmin && r.status === 'approved'))}>Edit</button>
            {isAdmin && r.status === 'approved' && <button onClick={() => handleDelete(r.id)} style={mbtn('var(--bg-primary)', 'var(--danger)', 'var(--danger)')}>Delete</button>}
          </>)}
          batchLink={r => r.batch_id_str ? `/batches/${encodeURIComponent(r.batch_id_str)}` : null} />
        {modals}
      </>
    )
  }

  return (
    <div className="content" style={{ display:'flex', flexDirection:'column',
      height:'calc(100vh - 42px)', padding:'12px 16px 0', gap:0 }}>

      {/* Stats */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(110px,1fr))', gap:10, marginBottom:12, flexShrink:0 }}>
        {[
          { label:'Total',     value:stats.total,     color:'var(--text-primary)' },
          { label:'Dyeing',    value:stats.dyeing,    color:'var(--accent)'  },
          { label:'Rolling',   value:stats.rolling,   color:'var(--purple)'  },
          { label:'Open',      value:stats.open,      color:'var(--danger)'  },
          { label:'Sent',      value:stats.sent,      color:'#2563EB'        },
          { label:'In Repair', value:stats.repairing, color:'#D97706'        },
          { label:'Approved',  value:stats.approved,  color:'var(--success)' },
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
        {(['all','dyeing','rolling'] as const).map(f => (
          <button key={f} onClick={() => setTypeFilter(f)}
            style={{ fontSize:11, padding:'5px 12px', borderRadius:6, cursor:'pointer', border:'none',
              fontWeight: typeFilter===f ? 700 : 400,
              background: typeFilter===f ? 'var(--accent)' : 'var(--bg-secondary)',
              color: typeFilter===f ? '#fff' : 'var(--text-secondary)' }}>
            {f === 'all' ? 'All Types' : f.charAt(0).toUpperCase()+f.slice(1)}
          </button>
        ))}
        {(['all','open','sent','repairing','approved'] as const).map(f => (
          <button key={f} onClick={() => setStatusFilter(f)}
            style={{ fontSize:11, padding:'5px 12px', borderRadius:6, cursor:'pointer', border:'none',
              fontWeight: statusFilter===f ? 700 : 400,
              background: statusFilter===f ? 'var(--danger)' : 'var(--bg-secondary)',
              color: statusFilter===f ? '#fff' : 'var(--text-secondary)' }}>
            {FOB_STATUS_LABEL[f]}
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
        <RefreshStamp />
        <button className="small" onClick={() => load()}>⟳</button>
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
            {records.length === 0 ? 'No FOB records yet.' : 'No records match your filters.'}
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
                        case 'sub_prod_no': return <td key={col.key} style={s}><SubProdCell value={r.sub_prod_no} /></td>
                        case 'kg': return (
                          <td key={col.key} style={{...s, fontWeight:700, color:'var(--accent)'}}>
                            {r.kg} Kg
                          </td>
                        )
                        case 'fob_kg': return (
                          <td key={col.key} style={{...s, fontWeight:700, color:'var(--purple)'}}>
                            {r.fob_kg} Kg
                          </td>
                        )
                        case 'gsm': return (
                          <td key={col.key} style={{...s, fontWeight:700, color:'var(--accent)'}}>
                            {r.gsm}
                          </td>
                        )
                        case 'color': return (
                          <td key={col.key} style={{...s, color:'var(--accent)'}}>{r.color}</td>
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
                            <span style={{ display:'inline-flex', alignItems:'center',
                              justifyContent:'center', width:28, height:28, borderRadius:'50%',
                              background:'var(--accent)', color:'#fff', fontSize:11, fontWeight:700 }}>
                              {r.process_code}
                            </span>
                          </td>
                        )
                        case 'fob_type': return (
                          <td key={col.key} style={s}>
                            <span style={{ fontSize:11, fontWeight:700, padding:'2px 8px',
                              borderRadius:4,
                              background: r.fob_type==='dyeing' ? 'var(--accent-light)' : 'var(--purple-light)',
                              color: r.fob_type==='dyeing' ? 'var(--accent)' : 'var(--purple)' }}>
                              {r.fob_type}
                            </span>
                          </td>
                        )
                        case 'status': return (
                          <td key={col.key} style={s}>
                            <span style={{ padding:'3px 8px', borderRadius:4, fontSize:11,
                              fontWeight:600,
                              background: (FOB_BADGE[r.status || 'open'] || FOB_BADGE.open).bg,
                              color: (FOB_BADGE[r.status || 'open'] || FOB_BADGE.open).color }}>
                              {FOB_STATUS_LABEL[r.status || 'open'] || r.status}
                            </span>
                          </td>
                        )
                        case 'actions': return (
                          <td key={col.key} style={{...s, overflow:'visible'}}>
                            <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
                              {!r.sent_at && r.status === 'open' && (
                                <button className="edit-only" onClick={() => handleMarkSent(r.id)} disabled={saving}
                                  style={{ padding:'3px 8px', fontSize:11, fontWeight:700,
                                    border:'none', borderRadius:4, cursor:'pointer',
                                    background:'#2563EB', color:'white' }}>
                                  📤 Mark Sent
                                </button>
                              )}
                              {r.sent_at && (
                                <span style={{ fontSize:10, color:'#2563EB', fontWeight:600,
                                  padding:'3px 6px', background:'#DBEAFE', borderRadius:4 }}>
                                  📤 {new Date(r.sent_at).toLocaleDateString('en-GB')}
                                </span>
                              )}
                              {(r.status === 'open' || r.status === 'sent') && (<>
                                <button className="edit-only" onClick={() => handleFobApproved(r)} disabled={saving}
                                  style={{ padding:'3px 8px', fontSize:11, fontWeight:700,
                                    border:'none', borderRadius:4, cursor:'pointer',
                                    background:'#16A34A', color:'white' }}>
                                  ✓ Approved
                                </button>
                                <button className="edit-only" onClick={() => setReprocessModal(r)} disabled={saving}
                                  style={{ padding:'3px 8px', fontSize:11, fontWeight:700,
                                    border:'none', borderRadius:4, cursor:'pointer',
                                    background:'#D97706', color:'white' }}>
                                  🔄 Reprocess
                                </button>
                              </>)}
                              {r.status === 'approved' && (
                                <span style={{ fontSize:10, color:'#16A34A', fontWeight:700,
                                  padding:'3px 6px', background:'#DCFCE7', borderRadius:4 }}>
                                  ✓ Approved
                                </span>
                              )}
                              {r.status === 'repairing' && (
                                <span style={{ fontSize:10, color:'#D97706', fontWeight:600,
                                  padding:'3px 6px', background:'#FEF3C7', borderRadius:4 }}>
                                  🔄 Repairing
                                </span>
                              )}
                              <button className="xs edit-only"
                                onClick={() => { setEditModal(r); setEditData({ notes:r.notes||'' }) }}>
                                Edit
                              </button>
                              {/* only an admin, only an approved FOB (the server refuses others) */}
                              {isAdmin && r.status === 'approved' && (
                                <button className="xs danger" onClick={() => handleDelete(r.id)}>Del</button>
                              )}
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

      {modals}
    </div>
  )
}
