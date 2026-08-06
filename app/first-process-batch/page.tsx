'use client'

import { useEffect, useState, useRef, useMemo, useCallback } from 'react'

// ── Column definitions ────────────────────────────────────────────────────────
const COLUMNS = [
  { key: 'select',          label: '',               defaultWidth: 40  },
  { key: 'batch_id',        label: 'BATCH ID',       defaultWidth: 140 },
  { key: 'order_number',    label: 'ORDER #',         defaultWidth: 120 },
  { key: 'party',           label: 'PARTY',           defaultWidth: 100 },
  { key: 'sub_party',       label: 'SUB PARTY',       defaultWidth: 100 },
  { key: 'sales_person',    label: 'SALES PERSON',    defaultWidth: 120 },
  { key: 'article',         label: 'ARTICLE',         defaultWidth: 100 },
  { key: 'blend',           label: 'BLEND',           defaultWidth: 80  },
  { key: 'width',           label: 'WIDTH',           defaultWidth: 70  },
  { key: 'gsm',             label: 'GSM',             defaultWidth: 70  },
  { key: 'color',           label: 'COLOR',           defaultWidth: 100 },
  { key: 'lab_no',          label: 'LAB NO.',         defaultWidth: 100 },
  { key: 'lot_no',          label: 'LOT NO.',         defaultWidth: 100 },
  { key: 'challan_no',      label: 'CHALLAN NO.',     defaultWidth: 110 },
  { key: 'qty_kg',          label: 'QTY (KG)',        defaultWidth: 90  },
  { key: 'qty_mtr',         label: 'QTY (MTR)',       defaultWidth: 90  },
  { key: 'no_of_taka',      label: 'TAKA',            defaultWidth: 80  },
  { key: 'type_of_finish',  label: 'FINISH',          defaultWidth: 110 },
  { key: 'type_of_packing', label: 'PACKING',         defaultWidth: 100 },
  { key: 'remarks',         label: 'REMARKS',         defaultWidth: 150 },
  { key: 'route',           label: 'ROUTE',           defaultWidth: 220 },
  { key: 'first_process',   label: 'FIRST PROCESS',   defaultWidth: 110 },
  { key: 'planned_date',    label: 'PLANNED DATE',    defaultWidth: 110 },
  { key: 'delivery_date',   label: 'DELIVERY DATE',   defaultWidth: 110 },
  { key: 'supervisor',      label: 'SUPERVISOR',      defaultWidth: 110 },
  { key: 'machine',         label: 'MACHINE',         defaultWidth: 160 },
  { key: 'actions',         label: 'ACTIONS',         defaultWidth: 150 },
]

const PROC_COL_MAP: Record<string,string> = {
  C:'d_c', S:'d_s', H:'d_h', D:'d_d', S2:'d_s2', Rx:'d_rx', O:'d_o',
  G:'d_g', F:'d_f', Co:'d_co', Tu:'d_tu', Add:'d_add', Level:'d_level',
  Rc:'d_rc', Fix:'d_fix', Wash:'d_wash', Dry:'d_dry', B:'d_b',
  R:'d_r', K:'d_k', QA:'d_qa', Packing:'d_packing', Dispatch:'d_dispatch'
}

const toDisplay = (ymd: string) => {
  if (!ymd) return '-'
  const p = ymd.slice(0,10).split('-')
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : ymd
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function FirstProcessBatchPage() {
  const [batches,    setBatches]    = useState<any[]>([])
  const [loading,    setLoading]    = useState(true)
  const [saving,     setSaving]     = useState(false)
  const [colFilters, setColFilters] = useState<Record<string,string>>({})
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(new Set())
  const [showColMenu,setShowColMenu]= useState(false)
  const [colWidths,  setColWidths]  = useState<Record<string,number>>(() =>
    Object.fromEntries(COLUMNS.map(c => [c.key, c.defaultWidth]))
  )
  const [selectedBatches, setSelectedBatches] = useState<Set<string>>(new Set())
  const [sending, setSending] = useState(false)
  const [resizing, setResizing] = useState<{key:string;startX:number;startW:number}|null>(null)
  const colMenuRef = useRef<HTMLDivElement>(null)

  // ── Load ──────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [bRes, oRes, dpRes] = await Promise.all([
        fetch('/api/batches?limit=5000', { cache:'no-store' }).then(r=>r.json()),
        fetch('/api/orders?limit=2000',  { cache:'no-store' }).then(r=>r.json()),
        fetch('/api/date-plans',          { cache:'no-store' }).then(r=>r.json()).catch(()=>({data:[]})),
      ])
      const allBatches: any[] = bRes.data  || []
      const allOrders:  any[] = oRes.data  || []
      const datePlans:  any[] = dpRes.data || []

      const oMap: Record<string,any> = {}
      for (const o of allOrders) oMap[o.id] = o
      const dpMap: Record<string,any> = {}
      for (const dp of datePlans) dpMap[dp.batch_id] = dp

      const rows = allBatches
        .filter(b => b.status === 'pending' || !b.current_process)
        .map(b => {
          const order = oMap[b.order_id] || {}
          const route: string[] = b.process_route || order.process_route || []
          const firstProc = route[0] || ''
          const dp = dpMap[b.id] || {}
          const col = PROC_COL_MAP[firstProc]
          const plannedDate = col && dp[col] ? toDisplay(dp[col]) : '-'
          return {
            id:              b.id,
            batch_id:        b.batch_id || b.id,
            order_id:        b.order_id,
            order_number:    order.order_number   || '-',
            party:           order.party          || '-',
            sub_party:       order.sub_party      || '-',
            sales_person:    order.sales_person   || '-',
            article:         order.article        || '-',
            blend:           order.blend          || '-',
            width:           order.width          || '-',
            gsm:             order.gsm            || '-',
            color:           order.color          || '-',
            lab_no:          order.lab_no         || '-',
            lot_no:          order.lot_no         || '-',
            challan_no:      order.challan_no     || '-',
            qty_kg:          b.kg                 || '-',
            qty_mtr:         b.mtr || order.qty_mtr  || '-',
            no_of_taka:      b.taka || order.no_of_taka || '-',
            type_of_finish:  order.type_of_finish  || '-',
            type_of_packing: order.type_of_packing || '-',
            remarks:         order.remarks        || '-',
            route,
            first_process:   firstProc,
            planned_date:    plannedDate,
            // Delivery date = FinalDispatch date from batch_date_plans, fallback to Dispatch, then order delivery_date
          delivery_date:   (() => {
            if (dp.d_finaldispatch) return toDisplay(dp.d_finaldispatch)
            if (dp.d_dispatch)      return toDisplay(dp.d_dispatch)
            if (order.delivery_date) return toDisplay(order.delivery_date)
            return '-'
          })(),
            supervisor:      order.supervisors?.name || '-',
            machine:         b.machines?.name    || order.machines?.name || '-',
            process_route:   route,
          }
        })
      setBatches(rows)
    } catch(err) { console.error(err) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  // ── Column resize ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!resizing) return
    const onMove = (e: MouseEvent) => {
      const diff = e.pageX - resizing.startX
      setColWidths(prev => ({ ...prev, [resizing.key]: Math.max(50, resizing.startW + diff) }))
    }
    const onUp = () => setResizing(null)
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup',   onUp)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup',   onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [resizing])

  // ── Close col menu on outside click ──────────────────────────────────────
  useEffect(() => {
    if (!showColMenu) return
    const handler = (e: MouseEvent) => {
      if (colMenuRef.current && !colMenuRef.current.contains(e.target as Node))
        setShowColMenu(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showColMenu])

  // ── Filtered rows ─────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return batches.filter(b => {
      for (const [key, val] of Object.entries(colFilters)) {
        if (!val.trim()) continue
        const cell = key === 'route'
          ? b.route.join('/')
          : String(b[key] ?? '').toLowerCase()
        if (!cell.includes(val.toLowerCase())) return false
      }
      return true
    })
  }, [batches, colFilters])

  const visibleCols = COLUMNS.filter(c => !hiddenCols.has(c.key))

  // ── Send to First Process ────────────────────────────────────────────────
  const handleSendToProcess = async () => {
    const selected = batches.filter(b => selectedBatches.has(b.id))
    if (!selected.length) { alert('Select at least one batch'); return }
    if (!confirm(`Send ${selected.length} batch(es) to their first process?`)) return
    setSending(true)
    try {
      await Promise.all(selected.map(b =>
        fetch('/api/batches', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action:          'update',
            id:              b.id,
            current_process: b.first_process,
            status:          'in-process',
          })
        })
      ))
      setSelectedBatches(new Set())
      await load()
      // Group by process for toast message
      const byProcess: Record<string,number> = {}
      selected.forEach(b => { byProcess[b.first_process] = (byProcess[b.first_process]||0)+1 })
      const msg = Object.entries(byProcess).map(([p,n]) => `${n} → ${p}`).join(', ')
      alert(`✓ Sent: ${msg}`)
    } finally { setSending(false) }
  }

  // ── Dispatch ──────────────────────────────────────────────────────────────
  const handleDispatch = async (batch: any) => {
    if (!confirm(`Dispatch ${batch.batch_id}?`)) return
    setSaving(true)
    try {
      await fetch('/api/batches', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ action:'update', id: batch.id, status:'done', is_done: true })
      })
      await load()
    } finally { setSaving(false) }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center',
      height:'60vh', color:'var(--text-tertiary)', fontSize:14 }}>
      Loading…
    </div>
  )

  return (
    <div className="content" style={{ display:'flex', flexDirection:'column',
      height:'calc(100vh - 42px)', padding:'16px 20px 0', gap:0 }}>

      {/* ── Header ── */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
        marginBottom:10, flexShrink:0 }}>
        <div>
          <h2 style={{ margin:0, fontSize:16, fontWeight:700 }}>First Process Batch</h2>
          <div style={{ fontSize:11, color:'var(--text-tertiary)', marginTop:2 }}>
            {filtered.length} batch{filtered.length !== 1?'es':''} awaiting first process
          </div>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          {/* Column hide/show */}
          <div style={{ position:'relative' }} ref={colMenuRef}>
            <button onClick={() => setShowColMenu(v => !v)}
              style={{ padding:'6px 12px', fontSize:12, border:'1px solid var(--border-medium)',
                borderRadius:6, background:'var(--bg-primary)', cursor:'pointer',
                color:'var(--text-primary)', fontWeight:500 }}>
              ⊞ Columns ({visibleCols.length}/{COLUMNS.length})
            </button>
            {showColMenu && (
              <div style={{ position:'absolute', right:0, top:'110%', zIndex:100,
                background:'white', border:'1px solid var(--border-medium)', borderRadius:8,
                padding:12, minWidth:220, boxShadow:'0 4px 16px rgba(0,0,0,0.12)',
                maxHeight:380, overflowY:'auto' }}>
                <div style={{ fontSize:11, fontWeight:700, color:'var(--text-tertiary)',
                  marginBottom:8, textTransform:'uppercase', letterSpacing:'0.05em' }}>
                  Show / Hide Columns
                </div>
                <div style={{ display:'flex', gap:6, marginBottom:10 }}>
                  <button onClick={() => setHiddenCols(new Set())}
                    style={{ fontSize:11, padding:'3px 8px', border:'1px solid var(--border-medium)',
                      borderRadius:4, cursor:'pointer', background:'var(--bg-secondary)' }}>
                    Show All
                  </button>
                  <button onClick={() => setHiddenCols(new Set(COLUMNS.filter(c=>c.key!=='actions'&&c.key!=='batch_id').map(c=>c.key)))}
                    style={{ fontSize:11, padding:'3px 8px', border:'1px solid var(--border-medium)',
                      borderRadius:4, cursor:'pointer', background:'var(--bg-secondary)' }}>
                    Hide Most
                  </button>
                </div>
                {COLUMNS.map(col => (
                  <label key={col.key} style={{ display:'flex', alignItems:'center', gap:8,
                    padding:'4px 0', cursor:'pointer', fontSize:12 }}>
                    <input type="checkbox"
                      checked={!hiddenCols.has(col.key)}
                      onChange={() => setHiddenCols(prev => {
                        const n = new Set(prev)
                        n.has(col.key) ? n.delete(col.key) : n.add(col.key)
                        return n
                      })}
                      style={{ accentColor:'var(--accent)' }} />
                    {col.label}
                  </label>
                ))}
              </div>
            )}
          </div>
          <button onClick={() => window.location.href = '/'}
            style={{ padding:'6px 12px', fontSize:12, border:'1px solid var(--border-medium)',
              borderRadius:6, background:'var(--bg-primary)', cursor:'pointer' }}>
            ⚡ Dispatch All ({filtered.length})
          </button>
          <button onClick={load}
            style={{ padding:'6px 10px', fontSize:13, border:'1px solid var(--border-medium)',
              borderRadius:6, background:'var(--bg-primary)', cursor:'pointer',
              color:'var(--text-secondary)' }}>⟳</button>
        </div>
      </div>

      {/* ── Table ── */}
      <div style={{ flex:1, minHeight:0, background:'var(--bg-primary)', borderRadius:8,
        border:'1px solid var(--border-light)', overflow:'hidden', display:'flex', flexDirection:'column' }}>
        <div style={{ flex:1, overflow:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', tableLayout:'fixed' }}>
            <thead style={{ position:'sticky', top:0, zIndex:10 }}>
              {/* Filter row */}
              <tr style={{ background:'var(--bg-secondary)' }}>
                {visibleCols.map(col => (
                  <th key={`f-${col.key}`}
                    style={{ padding:'6px 8px', borderBottom:'1px solid var(--border-light)',
                      borderRight:'1px solid var(--border-light)',
                      width:colWidths[col.key], minWidth:colWidths[col.key], maxWidth:colWidths[col.key] }}>
                    {col.key !== 'actions' && col.key !== 'select' && (
                      <input value={colFilters[col.key]||''} placeholder="Filter…"
                        onChange={e => setColFilters(p => ({...p,[col.key]:e.target.value}))}
                        style={{ width:'100%', padding:'3px 6px', fontSize:11,
                          border:'1px solid var(--border-medium)', borderRadius:4,
                          background:'var(--bg-primary)', color:'var(--text-primary)' }} />
                    )}
                    {col.key === 'select' && (
                      <input type="checkbox"
                        checked={filtered.length > 0 && filtered.every(b => selectedBatches.has(b.id))}
                        onChange={e => {
                          if (e.target.checked) setSelectedBatches(new Set(filtered.map(b => b.id)))
                          else setSelectedBatches(new Set())
                        }}
                        style={{ cursor:'pointer', accentColor:'var(--accent)' }} />
                    )}
                  </th>
                ))}
              </tr>
              {/* Header row */}
              <tr style={{ background:'var(--bg-secondary)' }}>
                {visibleCols.map(col => (
                  <th key={col.key}
                    style={{ padding:'8px 10px', textAlign:'left', fontSize:10, fontWeight:700,
                      color:'var(--text-tertiary)', textTransform:'uppercase', letterSpacing:'0.05em',
                      borderBottom:'2px solid var(--border-light)',
                      borderRight:'1px solid var(--border-light)',
                      width:colWidths[col.key], minWidth:colWidths[col.key], maxWidth:colWidths[col.key],
                      position:'relative', userSelect:'none', whiteSpace:'nowrap' }}>
                    {col.label}
                    {/* Resize handle */}
                    <div onMouseDown={e => {
                        e.preventDefault()
                        setResizing({key:col.key, startX:e.pageX, startW:colWidths[col.key]})
                      }}
                      style={{ position:'absolute', right:0, top:0, bottom:0, width:6,
                        cursor:'col-resize', zIndex:1,
                        background: resizing?.key === col.key ? 'var(--accent)' : 'transparent' }} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={visibleCols.length}
                    style={{ padding:48, textAlign:'center', color:'var(--text-tertiary)', fontSize:14 }}>
                    {batches.length === 0
                      ? 'No batches awaiting first process.'
                      : 'No batches match your filters.'}
                  </td>
                </tr>
              ) : filtered.map((b, idx) => (
                <tr key={b.id}
                  style={{ background: idx%2===0?'var(--bg-primary)':'var(--bg-secondary)',
                    borderBottom:'1px solid var(--border-light)' }}>
                  {visibleCols.map(col => {
                    const w = colWidths[col.key]
                    const tdStyle: React.CSSProperties = {
                      padding:'9px 10px', fontSize:12, borderRight:'1px solid var(--border-light)',
                      width:w, minWidth:w, maxWidth:w, overflow:'hidden',
                      textOverflow:'ellipsis', whiteSpace:'nowrap', verticalAlign:'middle'
                    }
                    switch(col.key) {
                      case 'select': return (
                        <td key={col.key} style={{...tdStyle, textAlign:'center', padding:'9px 6px'}}>
                          <input type="checkbox"
                            checked={selectedBatches.has(b.id)}
                            onChange={e => setSelectedBatches(prev => {
                              const n = new Set(prev)
                              e.target.checked ? n.add(b.id) : n.delete(b.id)
                              return n
                            })}
                            style={{ cursor:'pointer', accentColor:'var(--accent)', width:15, height:15 }} />
                        </td>
                      )
                      case 'batch_id': return (
                        <td key={col.key} style={{...tdStyle,fontWeight:700,color:'var(--accent)'}}>{b.batch_id}</td>
                      )
                      case 'order_number': return (
                        <td key={col.key} style={{...tdStyle,fontWeight:600,color:'var(--accent)'}}>{b.order_number}</td>
                      )
                      case 'party': return (
                        <td key={col.key} style={{...tdStyle,color:'var(--accent)',fontWeight:500}}>{b.party}</td>
                      )
                      case 'qty_kg': return (
                        <td key={col.key} style={{...tdStyle,fontWeight:700,color:'var(--accent)'}}>{b.qty_kg} Kg</td>
                      )
                      case 'qty_mtr': return (
                        <td key={col.key} style={{...tdStyle,fontWeight:600,color:'var(--accent)'}}>{b.qty_mtr}</td>
                      )
                      case 'no_of_taka': return (
                        <td key={col.key} style={{...tdStyle,fontWeight:600,color:'var(--accent)'}}>{b.no_of_taka}</td>
                      )
                      case 'gsm': return (
                        <td key={col.key} style={{...tdStyle,fontWeight:700,color:'var(--accent)'}}>{b.gsm}</td>
                      )
                      case 'color': return (
                        <td key={col.key} style={{...tdStyle,color:'var(--accent)'}}>{b.color}</td>
                      )
                      case 'lab_no': return (
                        <td key={col.key} style={{...tdStyle,color:'var(--accent)',fontSize:11}}>{b.lab_no}</td>
                      )
                      case 'challan_no': return (
                        <td key={col.key} style={{...tdStyle,color:'var(--accent)',fontSize:11}}>{b.challan_no}</td>
                      )
                      case 'route': return (
                        <td key={col.key} style={{...tdStyle,fontSize:11,color:'var(--text-secondary)',whiteSpace:'normal'}}>
                          {b.route.join(' → ')}
                        </td>
                      )
                      case 'first_process': return (
                        <td key={col.key} style={{...tdStyle,textAlign:'center'}}>
                          {b.first_process ? (
                            <span style={{ display:'inline-flex', alignItems:'center', justifyContent:'center',
                              width:32, height:32, borderRadius:'50%',
                              background:'var(--accent)', color:'#fff',
                              fontSize:12, fontWeight:700 }}>
                              {b.first_process}
                            </span>
                          ) : '-'}
                        </td>
                      )
                      case 'planned_date': return (
                        <td key={col.key} style={{...tdStyle, fontWeight:700,
                          color: b.planned_date !== '-' ? 'var(--success)' : 'var(--text-tertiary)'}}>
                          {b.planned_date}
                        </td>
                      )
                      case 'delivery_date': return (
                        <td key={col.key} style={{...tdStyle,color:'var(--warning)',fontWeight:600}}>
                          {b.delivery_date}
                        </td>
                      )
                      case 'machine': return (
                        <td key={col.key} style={tdStyle}>
                          {b.machine !== '-' ? (
                            <span style={{ background:'var(--purple-light)', color:'var(--purple)',
                              padding:'3px 8px', borderRadius:4, fontSize:11, fontWeight:600 }}>
                              {b.machine}
                            </span>
                          ) : '-'}
                        </td>
                      )
                      case 'actions': return (
                        <td key={col.key} style={{...tdStyle,whiteSpace:'nowrap'}}>
                          <div style={{ display:'flex', gap:4 }}>
                            <button className="xs primary" onClick={() => handleDispatch(b)} disabled={saving}>
                              🚀 Dispatch
                            </button>
                            <button className="xs"
                              onClick={() => window.open(`/machines/${b.id}`, '_blank')}
                              style={{ fontSize:11 }}>
                              FMS →
                            </button>
                          </div>
                        </td>
                      )
                      default: return (
                        <td key={col.key} style={tdStyle}>{b[col.key] ?? '-'}</td>
                      )
                    }
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
