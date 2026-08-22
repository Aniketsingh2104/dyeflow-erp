const fs = require('fs')

// Fix 1: Update /api/fob GET to join batches and orders for all fields
const apiContent = `import { NextRequest, NextResponse } from 'next/server'
import { dbSelect, dbInsert, dbUpdate, sb } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const type = searchParams.get('type')
    const query: Record<string,string> = { order: 'created_at.desc', limit: '2000' }
    if (type && type !== 'all') query['fob_type'] = \`eq.\${type}\`

    const { data: records, error } = await dbSelect('fob_records', query,
      'id,batch_id,order_id,order_number,party,fob_kg,process_code,fob_type,status,notes,reported_by,created_at,updated_at')
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })

    // Enrich with batch and order details
    const batchIds = [...new Set((records || []).map((r: any) => r.batch_id).filter(Boolean))]
    const orderIds = [...new Set((records || []).map((r: any) => r.order_id).filter(Boolean))]

    let batchMap: Record<string,any> = {}
    let orderMap: Record<string,any> = {}

    if (batchIds.length) {
      const { data: batches } = await dbSelect('batches',
        { id: \`in.(\${batchIds.join(',')})\`, limit: '2000' },
        'id,batch_id,kg,mtr,taka,sent_at,created_at,machines(id,name)'
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
        kg:              batch.kg         || r.fob_kg,
        qty_mtr:         batch.mtr        || order.qty_mtr    || '-',
        no_of_taka:      batch.taka       || order.no_of_taka || '-',
        machine:         batch.machines?.name || '-',
        sent_at:         batch.sent_at    || batch.created_at,
        order_number:    order.order_number || r.order_number,
        party:           order.party       || r.party,
        sub_party:       order.sub_party   || '-',
        article:         order.article     || '-',
        blend:           order.blend       || '-',
        width:           order.width       || '-',
        gsm:             order.gsm         || '-',
        color:           order.color       || '-',
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

  if (action === 'create') {
    const { data, error } = await dbInsert('fob_records', {
      batch_id:     payload.batch_id,
      order_id:     payload.order_id,
      order_number: payload.order_number,
      party:        payload.party,
      fob_kg:       payload.fob_kg || 0,
      process_code: payload.process_code,
      fob_type:     payload.fob_type || 'dyeing',
      status:       'open',
      notes:        payload.notes || '',
    })
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    return NextResponse.json({ ok: true, data })
  }

  if (action === 'update') {
    if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })
    const patch: Record<string,any> = {}
    if (payload.status !== undefined) patch.status = payload.status
    if (payload.notes  !== undefined) patch.notes  = payload.notes
    const { error } = await dbUpdate('fob_records', { id }, patch)
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (action === 'delete') {
    if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })
    const { error } = await sb('/fob_records', { method: 'DELETE', params: { id: \`eq.\${id}\` } })
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 })
}
`
fs.writeFileSync('app/api/fob/route.ts', apiContent, 'utf8')
console.log('✓ /api/fob GET now joins batches and orders')

// Fix 2: Rewrite FOB page with all columns
const pageContent = `'use client'

import { useEffect, useState, useCallback } from 'react'

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
  const [records,     setRecords]     = useState<any[]>([])
  const [loading,     setLoading]     = useState(true)
  const [search,      setSearch]      = useState('')
  const [typeFilter,  setTypeFilter]  = useState<'all'|'dyeing'|'rolling'>('all')
  const [statusFilter,setStatusFilter]= useState('all')
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
      const url = typeFilter !== 'all' ? \`/api/fob?type=\${typeFilter}\` : '/api/fob'
      const res = await fetch(url, { cache:'no-store' }).then(r => r.json())
      if (res.ok) setRecords(res.data || [])
    } finally { setLoading(false) }
  }, [typeFilter])

  useEffect(() => { load() }, [load])

  const filtered = records.filter(r => {
    if (statusFilter !== 'all' && r.status !== statusFilter) return false
    if (search.trim()) {
      const q = search.toLowerCase()
      return [r.order_number, r.party, r.batch_id_str, r.color, r.fob_type, r.article]
        .some(v => String(v ?? '').toLowerCase().includes(q))
    }
    return true
  })

  const handleUpdate = async () => {
    if (!editModal) return
    setSaving(true)
    try {
      const res = await fetch('/api/fob', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ action:'update', id:editModal.id, ...editData })
      }).then(r => r.json())
      if (!res.ok) { alert('Error: ' + res.error); return }
      showToast('✓ Record updated'); setEditModal(null); load()
    } finally { setSaving(false) }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this FOB record?')) return
    const res = await fetch('/api/fob', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ action:'delete', id })
    }).then(r => r.json())
    if (!res.ok) { alert('Error: ' + res.error); return }
    showToast('✓ Deleted'); load()
  }

  const stats = {
    total:   records.length,
    dyeing:  records.filter(r => r.fob_type === 'dyeing').length,
    rolling: records.filter(r => r.fob_type === 'rolling').length,
    open:    records.filter(r => r.status === 'open').length,
  }

  const visibleCols = COLUMNS.filter(c => !hiddenCols.has(c.key))

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center',
      height:'60vh', color:'var(--text-tertiary)', fontSize:14 }}>Loading FOB records…</div>
  )

  return (
    <div className="content" style={{ display:'flex', flexDirection:'column',
      height:'calc(100vh - 42px)', padding:'12px 16px 0', gap:0 }}>

      {/* Stats */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:12, flexShrink:0 }}>
        {[
          { label:'Total',   value:stats.total,   color:'var(--text-primary)' },
          { label:'Dyeing',  value:stats.dyeing,  color:'var(--accent)'  },
          { label:'Rolling', value:stats.rolling, color:'var(--purple)'  },
          { label:'Open',    value:stats.open,    color:'var(--danger)'  },
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
        {(['all','open','resolved'] as const).map(f => (
          <button key={f} onClick={() => setStatusFilter(f)}
            style={{ fontSize:11, padding:'5px 12px', borderRadius:6, cursor:'pointer', border:'none',
              fontWeight: statusFilter===f ? 700 : 400,
              background: statusFilter===f ? 'var(--danger)' : 'var(--bg-secondary)',
              color: statusFilter===f ? '#fff' : 'var(--text-secondary)' }}>
            {f === 'all' ? 'All Status' : f.charAt(0).toUpperCase()+f.slice(1)}
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
                              background: r.status==='open' ? 'var(--danger-light)' : 'var(--success-light)',
                              color: r.status==='open' ? 'var(--danger)' : 'var(--success)' }}>
                              {r.status}
                            </span>
                          </td>
                        )
                        case 'actions': return (
                          <td key={col.key} style={{...s, overflow:'visible'}}>
                            <div style={{ display:'flex', gap:4 }}>
                              <button className="xs"
                                onClick={() => { setEditModal(r); setEditData({ status:r.status, notes:r.notes||'' }) }}>
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
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

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
            <div className="form-group" style={{ marginBottom:12 }}>
              <label>Status</label>
              <select value={editData.status}
                onChange={e => setEditData((p: any) => ({ ...p, status:e.target.value }))}>
                <option value="open">Open</option>
                <option value="resolved">Resolved</option>
              </select>
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
    </div>
  )
}
`
fs.writeFileSync('app/fob/page.tsx', pageContent, 'utf8')
console.log('✓ FOB page rewritten with all order fields and column hide/show')
