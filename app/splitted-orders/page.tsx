'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'

const STATUS_MAP: Record<string, { bg: string; color: string; label: string }> = {
  new:          { bg: 'var(--accent-light)',   color: 'var(--accent)',   label: 'New'        },
  pending:      { bg: 'var(--warning-light)',  color: 'var(--warning)',  label: 'Pending'    },
  'in-process': { bg: 'var(--accent-light)',   color: 'var(--accent)',   label: 'In Process' },
  done:         { bg: 'var(--success-light)',  color: 'var(--success)',  label: 'Done'       },
  faulty:       { bg: 'var(--danger-light)',   color: 'var(--danger)',   label: 'Faulty'     },
  hold:         { bg: 'var(--danger-light)',   color: 'var(--danger)',   label: 'On Hold'    },
  repairing:    { bg: '#FEF3C7',              color: '#D97706',          label: '🔄 Repairing'},
}

function Badge({ status }: { status: string }) {
  const b = STATUS_MAP[status] || { bg: 'var(--bg-secondary)', color: 'var(--text-tertiary)', label: status }
  return (
    <span style={{ padding: '3px 9px', borderRadius: 4, fontSize: 11,
      fontWeight: 600, background: b.bg, color: b.color, whiteSpace: 'nowrap' }}>
      {b.label}
    </span>
  )
}

const COLS = [
  { id: 'created_at',      label: 'TIMESTAMP',        w: 150, on: true  },
  { id: 'order_number',    label: 'ORDER #',           w: 130, on: true  },
  { id: 'party',           label: 'PARTY',             w: 140, on: true  },
  { id: 'sub_party',       label: 'SUB PARTY',         w: 120, on: false },
  { id: 'sales_person',    label: 'SALES PERSON',      w: 130, on: false },
  { id: 'article',         label: 'ARTICLE',           w: 120, on: true  },
  { id: 'blend',           label: 'BLEND',             w:  90, on: false },
  { id: 'width',           label: 'WIDTH',             w:  75, on: true  },
  { id: 'gsm',             label: 'GSM',               w:  75, on: true  },
  { id: 'color',           label: 'COLOR',             w: 110, on: true  },
  { id: 'lab_no',          label: 'LAB NO.',           w: 110, on: true  },
  { id: 'lot_no',          label: 'LOT NO.',           w:  95, on: false },
  { id: 'challan_no',      label: 'CHALLAN NO.',       w: 120, on: true  },
  { id: 'type_of_finish',  label: 'FINISH',            w: 120, on: true  },
  { id: 'type_of_packing', label: 'PACKING',           w: 100, on: true  },
  { id: 'order_qty_kg',    label: 'ORDER QTY (KG)',    w: 120, on: false },
  { id: 'supervisor',      label: 'SUPERVISOR',        w: 120, on: true  },
  { id: 'process_route',   label: 'PROCESS ROUTE',     w: 220, on: true  },
  { id: 'machine',         label: 'MACHINE',           w: 160, on: true  },
  { id: 'batch_id',        label: 'BATCH ID',          w: 140, on: true  },
  { id: 'kg',              label: 'BATCH QTY (KG)',    w: 120, on: true  },
  { id: 'mtr',             label: 'BATCH QTY (MTR)',   w: 130, on: true  },
  { id: 'taka',            label: 'TAKA',              w:  80, on: true  },
  { id: 'batch_status',    label: 'BATCH STATUS',      w: 110, on: true  },
  { id: 'current_process', label: 'CURRENT PROCESS',   w: 140, on: true  },
  { id: 'actions',         label: 'ACTIONS',           w: 180, on: true  },
]

export default function SplittedOrdersPage() {
  const [rows,       setRows]       = useState<any[]>([])
  const [loading,    setLoading]    = useState(true)
  const [toast,      setToast]      = useState<{msg:string;err?:boolean}|null>(null)
  const [cols,       setCols]       = useState(COLS)
  const [showCols,   setShowCols]   = useState(false)
  const [colFilters, setColFilters] = useState<Record<string,string>>({})
  const [resizing,   setResizing]   = useState<{id:string;startX:number;startW:number}|null>(null)

  const showToast = (msg: string, err = false) => {
    setToast({msg, err})
    setTimeout(() => setToast(null), 3500)
  }

  // ── Load ──────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
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

      setRows(batches.map(b => {
        const o = oMap[b.order_id] || {}
        return {
          ...b,
          order_number:    o.order_number     || '-',
          party:           o.party            || '-',
          sub_party:       o.sub_party        || '-',
          sales_person:    o.sales_person     || '-',
          article:         o.article          || '-',
          color:           o.color            || '-',
          blend:           o.blend            || '-',
          width:           o.width            || '-',
          gsm:             o.gsm              || '-',
          lab_no:          o.lab_no           || '-',
          lot_no:          o.lot_no           || '-',
          challan_no:      o.challan_no       || '-',
          type_of_finish:  o.type_of_finish   || '-',
          type_of_packing: o.type_of_packing  || '-',
          order_qty_kg:    o.qty_kg           || '-',
          supervisor:      o.supervisors?.name || '-',
          process_route:   (b.process_route?.length ? b.process_route : o.process_route) || [],
          machine_name:    b.machines?.name   || '-',
        }
      }))
    } catch (e: any) {
      showToast('Failed to load: ' + e.message, true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // ── Column resize ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!resizing) return
    const onMove = (e: MouseEvent) => {
      const w = Math.max(60, resizing.startW + e.clientX - resizing.startX)
      setCols(p => p.map(c => c.id === resizing.id ? { ...c, w } : c))
    }
    const onUp = () => {
      setResizing(null)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
  }, [resizing])

  // ── Column filters ─────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return rows.filter(row =>
      Object.entries(colFilters).every(([key, val]) => {
        if (!val.trim()) return true
        const cellVal = String(row[key] ?? '').toLowerCase()
        return cellVal.includes(val.toLowerCase())
      })
    )
  }, [rows, colFilters])

  // ── Delete batch ───────────────────────────────────────────────────────────
  const handleDelete = async (row: any) => {
    if (row.is_done || row.status === 'done' || row.status === 'in-process') {
      alert('Cannot delete — this batch is already in process or completed.')
      return
    }
    if (!confirm(`Delete batch ${row.batch_id} (${row.kg} Kg)?\nThis qty will be available for re-splitting on order ${row.order_number}.`)) return
    try {
      const res  = await fetch('/api/batches', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete_batch', id: row.id, order_id: row.order_id }),
      })
      const data = await res.json()
      if (!data.ok) { alert('Error: ' + (data.error || 'Unknown')); return }
      showToast(`✓ Batch ${row.batch_id} deleted — ${row.kg} Kg available for re-splitting`)
      load()
    } catch (err: any) { alert('Network error: ' + err.message) }
  }

  // ── Mark done ──────────────────────────────────────────────────────────────
  const handleDone = async (row: any) => {
    const route: string[] = row.process_route || []
    const idx  = route.findIndex((c: string) => c === row.current_process)
    const next = idx >= 0 ? route[idx + 1] : undefined
    if (!confirm(`Mark ${row.batch_id} done in ${row.current_process}?`)) return
    try {
      const res  = await fetch('/api/batches', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'process_done', batch_id: row.id, process_code: row.current_process, next_process: next }),
      })
      const data = await res.json()
      if (!data.ok) { alert('Error: ' + data.error); return }
      showToast(`✓ ${row.batch_id} ${next ? '→ ' + next : 'completed!'}`)
      load()
    } catch (err: any) { alert('Network error: ' + err.message) }
  }

  const visible = cols.filter(c => c.on)

  const renderCell = (col: typeof COLS[number], row: any) => {
    switch (col.id) {
      case 'created_at':
        return <span style={{fontSize:11,color:'var(--text-tertiary)'}}>
          {row.created_at ? new Date(row.created_at).toLocaleString('en-GB',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}) : '-'}
        </span>
      case 'order_number':
        return <strong style={{color:'var(--accent)'}}>{row.order_number}</strong>
      case 'party':           return row.party
      case 'sub_party':       return row.sub_party
      case 'sales_person':    return row.sales_person
      case 'article':         return <span style={{fontWeight:500}}>{row.article}</span>
      case 'blend':           return <span style={{color:'var(--text-secondary)',fontSize:11}}>{row.blend}</span>
      case 'width':           return row.width
      case 'gsm':             return row.gsm
      case 'color':           return row.color
      case 'lab_no':          return row.lab_no
      case 'lot_no':          return row.lot_no
      case 'challan_no':      return row.challan_no
      case 'type_of_finish':  return row.type_of_finish
      case 'type_of_packing': return row.type_of_packing
      case 'order_qty_kg':    return <strong>{row.order_qty_kg} Kg</strong>
      case 'supervisor':      return row.supervisor
      case 'process_route':
        return (
          <div style={{display:'flex',flexWrap:'wrap',gap:2}}>
            {(row.process_route as string[]).map((c:string,i:number) => (
              <span key={i} style={{fontSize:10,fontWeight:600,padding:'1px 5px',borderRadius:3,
                background: c===row.current_process ? 'var(--accent)' : 'var(--accent-light)',
                color:      c===row.current_process ? '#fff'          : 'var(--accent)'}}>
                {c}
              </span>
            ))}
          </div>
        )
      case 'machine':
        return row.machine_name !== '-' ? (
          <span style={{fontSize:11,fontWeight:600,padding:'2px 8px',
            background:'var(--purple-light)',color:'var(--purple)',borderRadius:4}}>
            {row.machine_name}
          </span>
        ) : '-'
      case 'batch_id':
        return <strong style={{color:'var(--accent)'}}>{row.batch_id}</strong>
      case 'kg':
        return <strong>{row.kg} Kg</strong>
      case 'mtr':
        return row.mtr != null
          ? <span>{Number(row.mtr).toLocaleString()} Mtr</span>
          : <span style={{color:'var(--text-tertiary)'}}>-</span>
      case 'taka':
        return row.taka != null
          ? <span>{row.taka}</span>
          : <span style={{color:'var(--text-tertiary)'}}>-</span>
      case 'batch_status':
        return <Badge status={row.status || 'pending'} />
      case 'current_process':
        return row.current_process ? (
          <span style={{fontSize:11,fontWeight:600,padding:'2px 8px',
            background:'var(--accent)',color:'#fff',borderRadius:4}}>
            {row.current_process}
          </span>
        ) : <span style={{color:'var(--text-tertiary)'}}>—</span>
      case 'actions':
        return (
          <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
            {row.current_process && (
              <button className="xs" onClick={() => window.location.href=`/fms/${row.current_process}`}>
                FMS →
              </button>
            )}
            {row.status !== 'done' && row.current_process && (
              <button className="xs"
                style={{background:'var(--success)',color:'#fff',border:'none',cursor:'pointer'}}
                onClick={() => handleDone(row)}>
                ✓ Done
              </button>
            )}
            {!row.is_done && row.status !== 'done' && row.status !== 'in-process' && (
              <button className="xs"
                style={{background:'var(--danger-light)',color:'var(--danger)',
                  border:'1px solid var(--danger)',cursor:'pointer'}}
                onClick={() => handleDelete(row)}>
                🗑 Delete
              </button>
            )}
          </div>
        )
      default: return '-'
    }
  }

  if (loading) return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'60vh',color:'var(--text-tertiary)',fontSize:14}}>
      Loading batches…
    </div>
  )

  if (rows.length === 0) return (
    <div className="content" style={{padding:20}}>
      <div style={{textAlign:'center',padding:60}}>
        <div style={{fontSize:36,marginBottom:10}}>✂</div>
        <div style={{fontSize:15,fontWeight:600,marginBottom:6}}>No Split Batches Yet</div>
        <div style={{fontSize:12,color:'var(--text-tertiary)',marginBottom:20}}>Split orders from the Orders page.</div>
        <button className="primary" onClick={() => window.location.href='/orders'}>Go to Orders →</button>
      </div>
    </div>
  )

  const hasFilter = Object.values(colFilters).some(v => v.trim())

  return (
    <div className="content" style={{display:'flex',flexDirection:'column',height:'calc(100vh - 42px)',padding:'12px 16px 0'}}>

      {/* Header */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10,flexShrink:0}}>
        <div>
          <span style={{fontSize:15,fontWeight:700}}>Splitted Orders</span>
          <span style={{fontSize:12,color:'var(--text-tertiary)',marginLeft:10}}>
            {filtered.length}{filtered.length !== rows.length ? ` of ${rows.length}` : ''} batch{rows.length!==1?'es':''}
          </span>
          {hasFilter && (
            <button onClick={() => setColFilters({})}
              style={{marginLeft:10,fontSize:11,color:'var(--danger)',background:'none',border:'none',cursor:'pointer',textDecoration:'underline'}}>
              Clear filters
            </button>
          )}
        </div>
        <div style={{display:'flex',gap:8}}>
          <button className="small" onClick={() => setShowCols(v => !v)}>
            ⚙ Columns ({visible.length}/{cols.length})
          </button>
          <button className="small" onClick={load}>⟳ Refresh</button>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div style={{flexShrink:0,borderRadius:8,padding:'8px 14px',marginBottom:8,fontSize:13,fontWeight:600,
          background: toast.err ? 'var(--danger-light)' : 'var(--success-light)',
          color:      toast.err ? 'var(--danger)'       : 'var(--success)',
          border: `1px solid ${toast.err ? 'var(--danger)' : 'var(--success)'}`}}>
          {toast.msg}
        </div>
      )}

      {/* Column picker */}
      {showCols && (
        <div style={{flexShrink:0,padding:'10px 14px',background:'var(--bg-secondary)',
          border:'1px solid var(--border-light)',borderRadius:8,marginBottom:10}}>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))',gap:6}}>
            {cols.map(col => (
              <label key={col.id} style={{display:'flex',alignItems:'center',gap:6,fontSize:12,cursor:'pointer'}}>
                <input type="checkbox" checked={col.on}
                  onChange={() => setCols(p => p.map(c => c.id===col.id ? {...c,on:!c.on} : c))}
                  style={{accentColor:'var(--accent)',cursor:'pointer'}} />
                {col.label}
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Table */}
      <div style={{flex:1,minHeight:0,background:'var(--bg-primary)',border:'1px solid var(--border-light)',borderRadius:8,overflow:'auto'}}>
        <table style={{borderCollapse:'collapse',tableLayout:'fixed',
          width: visible.reduce((s,c)=>s+c.w,0)+'px',minWidth:'100%'}}>
          <colgroup>{visible.map(c => <col key={c.id} style={{width:c.w}} />)}</colgroup>
          <thead style={{position:'sticky',top:0,zIndex:10}}>

            {/* ── Filter row ── */}
            <tr style={{background:'var(--bg-secondary)'}}>
              {visible.map(col => (
                <th key={`f-${col.id}`} style={{padding:'5px 8px',
                  borderBottom:'1px solid var(--border-light)',
                  borderRight:'1px solid var(--border-light)',width:col.w}}>
                  {col.id !== 'actions' && col.id !== 'process_route' && col.id !== 'batch_status' ? (
                    <input
                      value={colFilters[col.id] || ''}
                      onChange={e => setColFilters(p => ({...p,[col.id]:e.target.value}))}
                      placeholder="Filter…"
                      style={{width:'100%',padding:'3px 6px',fontSize:11,
                        border:'1px solid var(--border-medium)',borderRadius:4,
                        background:'var(--bg-primary)',color:'var(--text-primary)'}} />
                  ) : null}
                </th>
              ))}
            </tr>

            {/* ── Header row ── */}
            <tr style={{background:'var(--bg-secondary)'}}>
              {visible.map(col => (
                <th key={col.id} style={{padding:'8px 12px',textAlign:'left',fontSize:10,
                  fontWeight:700,color:'var(--text-tertiary)',textTransform:'uppercase',
                  letterSpacing:'0.05em',borderBottom:'2px solid var(--border-light)',
                  borderRight:'1px solid var(--border-light)',
                  width:col.w,position:'relative',userSelect:'none',whiteSpace:'nowrap'}}>
                  {col.label}
                  <div onMouseDown={e => {e.preventDefault();setResizing({id:col.id,startX:e.clientX,startW:col.w})}}
                    style={{position:'absolute',right:0,top:0,bottom:0,width:6,cursor:'col-resize',zIndex:1}} />
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={visible.length} style={{padding:40,textAlign:'center',color:'var(--text-tertiary)',fontSize:13}}>
                  No batches match your filters.{' '}
                  <button onClick={() => setColFilters({})} style={{color:'var(--accent)',background:'none',border:'none',cursor:'pointer',fontSize:13}}>Clear</button>
                </td>
              </tr>
            ) : filtered.map((row,i) => (
              <tr key={row.id||i} style={{
                background: row.status==='done'||row.is_done ? 'var(--success-light)'
                          : i%2===0 ? 'var(--bg-primary)' : 'var(--bg-secondary)',
                borderBottom:'1px solid var(--border-light)'}}>
                {visible.map(col => (
                  <td key={col.id} style={{padding:'9px 12px',fontSize:12,color:'var(--text-primary)',
                    overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',
                    borderRight:'1px solid var(--border-light)',width:col.w}}>
                    {renderCell(col,row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
