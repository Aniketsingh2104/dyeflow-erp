'use client'

import { useEffect, useState, useCallback } from 'react'
import { getBatches, getOrders, markProcessDone } from '@/lib/db'

const STATUS_MAP: Record<string, { bg: string; color: string; label: string }> = {
  new:          { bg: 'var(--accent-light)',   color: 'var(--accent)',   label: 'New' },
  pending:      { bg: 'var(--warning-light)',  color: 'var(--warning)',  label: 'Pending' },
  'in-process': { bg: 'var(--accent-light)',   color: 'var(--accent)',   label: 'In Process' },
  done:         { bg: 'var(--success-light)',  color: 'var(--success)',  label: 'Done' },
  faulty:       { bg: 'var(--danger-light)',   color: 'var(--danger)',   label: 'Faulty' },
  hold:         { bg: 'var(--danger-light)',   color: 'var(--danger)',   label: 'On Hold' },
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
  { id: 'created_at',      label: 'BATCH CREATED',    w: 150, on: true  },
  { id: 'order_number',    label: 'ORDER #',           w: 120, on: true  },
  { id: 'party',           label: 'PARTY',             w: 150, on: true  },
  { id: 'article',         label: 'ARTICLE',           w: 150, on: true  },
  { id: 'color',           label: 'COLOR',             w: 130, on: true  },
  { id: 'blend',           label: 'BLEND',             w: 100, on: false },
  { id: 'qty_kg',          label: 'ORDER QTY (KG)',    w: 120, on: false },
  { id: 'supervisor',      label: 'SUPERVISOR',        w: 120, on: true  },
  { id: 'process_route',   label: 'PROCESS ROUTE',     w: 200, on: true  },
  { id: 'machine',         label: 'MACHINE',           w: 130, on: true  },
  { id: 'batch_id',        label: 'BATCH ID',          w: 140, on: true  },
  { id: 'kg',              label: 'BATCH QTY (KG)',    w: 120, on: true  },
  { id: 'batch_status',    label: 'BATCH STATUS',      w: 120, on: true  },
  { id: 'current_process', label: 'CURRENT PROCESS',   w: 140, on: true  },
  { id: 'actions',         label: 'ACTIONS',           w: 160, on: true  },
]

export default function SplittedOrdersPage() {
  const [rows,     setRows]     = useState<any[]>([])
  const [loading,  setLoading]  = useState(true)
  const [toast,    setToast]    = useState('')
  const [cols,     setCols]     = useState(COLS)
  const [showCols, setShowCols] = useState(false)
  const [resizing, setResizing] = useState<{ id: string; startX: number; startW: number } | null>(null)

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [batchRes, orderRes] = await Promise.all([
        getBatches(),
        getOrders({ limit: 1000 }),
      ])
      const batches: any[] = batchRes.data  || []
      const orders:  any[] = orderRes.data  || []
      const oMap: Record<string, any> = {}
      for (const o of orders) oMap[o.id] = o

      const enriched = batches.map(b => ({
        ...b,
        order_number:   oMap[b.order_id]?.order_number   || '-',
        party:          oMap[b.order_id]?.party           || '-',
        article:        oMap[b.order_id]?.article         || '-',
        color:          oMap[b.order_id]?.color           || '-',
        blend:          oMap[b.order_id]?.blend           || '',
        qty_kg:         oMap[b.order_id]?.qty_kg          || '',
        process_route:  oMap[b.order_id]?.process_route   || [],
        supervisor:     oMap[b.order_id]?.supervisors?.name || '-',
        machine_name:   b.machines?.name || '-',
      }))

      setRows(enriched)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const h = () => load()
    window.addEventListener('dyeflow-db-updated', h)
    return () => window.removeEventListener('dyeflow-db-updated', h)
  }, [load])

  // Column resize
  useEffect(() => {
    if (!resizing) return
    const onMove = (e: MouseEvent) => {
      const w = Math.max(60, resizing.startW + e.clientX - resizing.startX)
      setCols(p => p.map(c => c.id === resizing.id ? { ...c, w } : c))
    }
    const onUp = () => { setResizing(null); document.body.style.cursor = document.body.style.userSelect = '' }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
  }, [resizing])

  const handleDone = async (row: any) => {
    const route: string[] = row.process_route || []
    const idx  = route.findIndex((c: string) => c === row.current_process)
    const next = idx >= 0 ? route[idx + 1] : undefined
    if (!confirm(`Mark ${row.batch_id} done in ${row.current_process}?`)) return
    const { error } = await markProcessDone(row.id, row.current_process, next)
    if (error) { alert('Error: ' + error); return }
    showToast(`✓ ${row.batch_id} ${next ? '→ ' + next : 'complete'}`)
    load()
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '60vh', color: 'var(--text-tertiary)', fontSize: 14 }}>
      Loading batches…
    </div>
  )

  if (rows.length === 0) return (
    <div className="content" style={{ padding: 20 }}>
      <div style={{ textAlign: 'center', padding: 60 }}>
        <div style={{ fontSize: 36, marginBottom: 10 }}>✂</div>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>No Split Batches Yet</div>
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 20 }}>
          Split orders from the Orders page to see batches here.
        </div>
        <button className="primary" onClick={() => window.location.href = '/orders'}>Go to Orders →</button>
      </div>
    </div>
  )

  const visible = cols.filter(c => c.on)

  const renderCell = (col: typeof COLS[number], row: any) => {
    switch (col.id) {
      case 'created_at':      return <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{row.created_at ? new Date(row.created_at).toLocaleString('en-GB') : '-'}</span>
      case 'order_number':    return <strong style={{ color: 'var(--accent)' }}>{row.order_number}</strong>
      case 'party':           return row.party
      case 'article':         return <span style={{ fontWeight: 500 }}>{row.article}</span>
      case 'color':           return row.color
      case 'blend':           return <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>{row.blend || '-'}</span>
      case 'qty_kg':          return <strong>{row.qty_kg}</strong>
      case 'supervisor':      return row.supervisor
      case 'process_route':   return (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
          {(row.process_route as string[]).map((c: string, i: number) => (
            <span key={i} style={{ fontSize: 10, fontWeight: 600, padding: '1px 5px',
              background: c === row.current_process ? 'var(--accent)' : 'var(--accent-light)',
              color: c === row.current_process ? '#fff' : 'var(--accent)', borderRadius: 3 }}>
              {c}
            </span>
          ))}
        </div>
      )
      case 'machine':         return row.machine_name !== '-' ? (
        <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px',
          background: 'var(--purple-light)', color: 'var(--purple)', borderRadius: 4 }}>
          {row.machine_name}
        </span>
      ) : '-'
      case 'batch_id':        return <strong style={{ color: 'var(--accent)' }}>{row.batch_id}</strong>
      case 'kg':              return <strong>{row.kg} Kg</strong>
      case 'batch_status':    return <Badge status={row.status || 'pending'} />
      case 'current_process': return row.current_process ? (
        <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px',
          background: 'var(--accent)', color: '#fff', borderRadius: 4 }}>
          {row.current_process}
        </span>
      ) : <span style={{ color: 'var(--text-tertiary)' }}>—</span>
      case 'actions': return (
        <div style={{ display: 'flex', gap: 4 }}>
          {row.current_process && (
            <button className="xs"
              onClick={() => window.location.href = `/fms/${row.current_process}`}>
              FMS →
            </button>
          )}
          {row.status !== 'done' && row.current_process && (
            <button className="xs" style={{ background: 'var(--success)', color: '#fff',
              border: 'none', cursor: 'pointer' }}
              onClick={() => handleDone(row)}>
              ✓ Done
            </button>
          )}
        </div>
      )
      default: return '-'
    }
  }

  return (
    <div className="content" style={{ display: 'flex', flexDirection: 'column',
      height: 'calc(100vh - 42px)', padding: '12px 16px 0' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 10, flexShrink: 0 }}>
        <div>
          <span style={{ fontSize: 15, fontWeight: 700 }}>Splitted Orders</span>
          <span style={{ fontSize: 12, color: 'var(--text-tertiary)', marginLeft: 10 }}>
            {rows.length} batch{rows.length !== 1 ? 'es' : ''}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="small" onClick={() => setShowCols(v => !v)}>
            ⚙ Columns ({visible.length}/{cols.length})
          </button>
          <button className="small" onClick={load}>⟳ Refresh</button>
        </div>
      </div>

      {toast && (
        <div style={{ flexShrink: 0, background: 'var(--success-light)', color: 'var(--success)',
          border: '1px solid var(--success)', borderRadius: 8, padding: '8px 14px',
          marginBottom: 8, fontSize: 13, fontWeight: 600 }}>
          {toast}
        </div>
      )}

      {/* Column picker */}
      {showCols && (
        <div style={{ flexShrink: 0, padding: '10px 14px', background: 'var(--bg-secondary)',
          border: '1px solid var(--border-light)', borderRadius: 8, marginBottom: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px,1fr))', gap: 6 }}>
            {cols.map(col => (
              <label key={col.id} style={{ display: 'flex', alignItems: 'center',
                gap: 6, fontSize: 12, cursor: 'pointer' }}>
                <input type="checkbox" checked={col.on}
                  onChange={() => setCols(p => p.map(c => c.id === col.id ? { ...c, on: !c.on } : c))}
                  style={{ accentColor: 'var(--accent)', cursor: 'pointer' }} />
                {col.label}
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Table */}
      <div style={{ flex: 1, minHeight: 0, background: 'var(--bg-primary)',
        border: '1px solid var(--border-light)', borderRadius: 8, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <colgroup>{visible.map(c => <col key={c.id} style={{ width: c.w }} />)}</colgroup>
          <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
            <tr style={{ background: 'var(--bg-secondary)' }}>
              {visible.map(col => (
                <th key={col.id} style={{ padding: '9px 12px', textAlign: 'left', fontSize: 10,
                  fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase',
                  letterSpacing: '0.05em', borderBottom: '2px solid var(--border-light)',
                  width: col.w, position: 'relative', userSelect: 'none', whiteSpace: 'nowrap' }}>
                  {col.label}
                  <div onMouseDown={e => { e.preventDefault(); setResizing({ id: col.id, startX: e.clientX, startW: col.w }) }}
                    style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 6,
                      cursor: 'col-resize', zIndex: 1 }} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.id || i} style={{
                background: row.status === 'done' ? 'var(--success-light)'
                          : i % 2 === 0 ? 'var(--bg-primary)' : 'var(--bg-secondary)',
                borderBottom: '1px solid var(--border-light)' }}>
                {visible.map(col => (
                  <td key={col.id} style={{ padding: '10px 12px', fontSize: 12,
                    color: 'var(--text-primary)', overflow: 'hidden',
                    textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: col.w }}>
                    {renderCell(col, row)}
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
