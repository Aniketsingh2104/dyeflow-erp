'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { getBatches, getOrders, markProcessDone, markBatchFaulty } from '@/lib/db'
import { sb } from '@/lib/supabase'

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizeDate(d: any): Date | null {
  if (!d) return null
  if (typeof d === 'string' && /^\d{2}[\/\-]\d{2}[\/\-]\d{4}$/.test(d)) {
    const [a, b, y] = d.split(/[\/\-]/)
    const dt = new Date(+y, +b - 1, +a)
    return isNaN(dt.getTime()) ? null : dt
  }
  const dt = new Date(d)
  return isNaN(dt.getTime()) ? null : dt
}

function fmtDate(d: any): string {
  const dt = normalizeDate(d)
  if (!dt) return d ? String(d) : '-'
  return `${String(dt.getDate()).padStart(2,'0')}-${String(dt.getMonth()+1).padStart(2,'0')}-${dt.getFullYear()}`
}

function fmtDateTime(d: any): string {
  if (!d) return '-'
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return String(d)
  return `${String(dt.getDate()).padStart(2,'0')}-${String(dt.getMonth()+1).padStart(2,'0')}-${dt.getFullYear()} ${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`
}

function delayMeta(planned: string, actual: string, now: Date): { text: string; late: boolean } {
  if (!planned) return { text: '-', late: false }
  const p = normalizeDate(planned)
  if (!p) return { text: '-', late: false }
  const deadline = new Date(p); deadline.setHours(23, 59, 59, 999)
  const compare  = actual ? (() => { const a = normalizeDate(actual); return a ? new Date(a.setHours(23,59,59,999)) : null })() : now
  if (!compare) return { text: '-', late: false }
  const diff = compare.getTime() - deadline.getTime()
  const abs  = Math.abs(diff)
  const d = Math.floor(abs / 86400000)
  const h = Math.floor((abs % 86400000) / 3600000)
  const m = Math.floor((abs % 3600000) / 60000)
  const late = actual ? diff > 0 : diff > 0
  const sign = diff <= 0 ? '-' : '+'
  return { text: `${sign}${d}d ${h}h ${m}m`, late }
}

// ── Default columns ───────────────────────────────────────────────────────────

const DEFAULT_COLS = [
  { id: 'created_at',     label: 'TIMESTAMP',       visible: true,  width: 150, minWidth: 100 },
  { id: 'orderNo',        label: 'ORDER #',          visible: true,  width: 130, minWidth: 80  },
  { id: 'batch_id',       label: 'BATCH #',          visible: true,  width: 130, minWidth: 80  },
  { id: 'party',          label: 'PARTY',            visible: true,  width: 150, minWidth: 100 },
  { id: 'article',        label: 'ARTICLE',          visible: true,  width: 130, minWidth: 80  },
  { id: 'color',          label: 'COLOR',            visible: true,  width: 120, minWidth: 80  },
  { id: 'blend',          label: 'BLEND',            visible: true,  width: 100, minWidth: 70  },
  { id: 'qty_kg',         label: 'QTY (KG)',         visible: true,  width: 90,  minWidth: 60  },
  { id: 'supervisor',     label: 'SUPERVISOR',       visible: true,  width: 130, minWidth: 80  },
  { id: 'machine',        label: 'MACHINE',          visible: true,  width: 130, minWidth: 80  },
  { id: 'process_route',  label: 'PROCESS ROUTE',    visible: true,  width: 200, minWidth: 120 },
  { id: 'planned_date',   label: 'PLANNED DATE',     visible: true,  width: 120, minWidth: 80  },
  { id: 'actual_date',    label: 'ACTUAL DATE',      visible: true,  width: 120, minWidth: 80  },
  { id: 'actions',        label: 'ACTIONS',          visible: true,  width: 220, minWidth: 160 },
  { id: 'time_delay',     label: 'TIME DELAY',       visible: true,  width: 110, minWidth: 80  },
]

const COL_KEY = 'fms_col_settings_v2'

export default function FmsProcessPage() {
  const params      = useParams()
  const router      = useRouter()
  const processCode = String(params?.process || '').toUpperCase()

  const [rows,     setRows]     = useState<any[]>([])
  const [loading,  setLoading]  = useState(true)
  const [search,   setSearch]   = useState('')
  const [now,      setNow]      = useState(new Date())
  const [cols,     setCols]     = useState<typeof DEFAULT_COLS>(() => {
    try { const s = localStorage.getItem(COL_KEY); return s ? JSON.parse(s) : DEFAULT_COLS } catch { return DEFAULT_COLS }
  })
  const [showCols,   setShowCols]   = useState(false)
  const [resizing,   setResizing]   = useState<string | null>(null)
  const colsRef = useRef(cols); colsRef.current = cols

  // Modals
  const [faultyModal, setFaultyModal] = useState<any>(null)
  const [faultyReason, setFaultyReason] = useState('')
  const [fobModal,     setFobModal]     = useState<any>(null)
  const [fobType,      setFobType]      = useState<'dyeing'|'rolling'>('dyeing')
  const [fobReason,    setFobReason]    = useState('')
  const [saving,       setSaving]       = useState(false)
  const [toast,        setToast]        = useState('')

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  // Clock tick
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(t)
  }, [])

  // ── Load ────────────────────────────────────────────────────────────────────

  const loadRows = useCallback(async () => {
    setLoading(true)
    try {
      const [batchRes, orderRes] = await Promise.all([
        getBatches({ status: 'in-process' }),
        getOrders({ limit: 1000 }),
      ])

      const batches: any[] = batchRes.data  || []
      const orders: any[]  = orderRes.data  || []
      const orderMap: Record<string, any> = {}
      for (const o of orders) orderMap[o.id] = o

      // Filter to batches whose current_process matches this page's code
      const filtered = batches.filter(b => {
        const order = orderMap[b.order_id]
        const route: string[] = order?.process_route || []
        return (
          b.current_process?.toUpperCase() === processCode ||
          route.some((c: string) => c.toUpperCase() === processCode)
        )
      })

      // Get planned dates from batch_processes
      const enriched = filtered.map(b => {
        const order   = orderMap[b.order_id] || {}
        const sup     = order.supervisors?.name || '-'
        const mach    = b.machines?.name || '-'
        const route: string[] = order.process_route || []

        // Find planned date from batch_processes array (nested from getBatches)
        const bp = (b.batch_processes || []).find((p: any) =>
          p.process_code?.toUpperCase() === processCode
        )
        const planned = bp?.planned_date || ''
        const actual  = bp?.done_at ? bp.done_at.split('T')[0] : ''
        const delay   = delayMeta(planned, actual, now)

        return {
          ...b,
          orderNo:      order.order_number || '-',
          party:        order.party        || '-',
          article:      order.article      || '-',
          color:        order.color        || '-',
          blend:        order.blend        || '',
          supervisorName: sup,
          machineName:    mach,
          routeStr:       route.join('/'),
          plannedDate:    planned,
          actualDate:     actual,
          isCompleted:    !!actual,
          delayText:      delay.text,
          delayLate:      delay.late,
          isFaulty:       b.is_faulty,
        }
      })

      enriched.sort((a, b) =>
        String(a.plannedDate || '9999').localeCompare(String(b.plannedDate || '9999'))
      )

      setRows(enriched)
    } finally {
      setLoading(false)
    }
  }, [processCode, now])

  useEffect(() => {
    loadRows()
    const h = () => loadRows()
    window.addEventListener('dyeflow-db-updated', h)
    return () => window.removeEventListener('dyeflow-db-updated', h)
  }, [loadRows])

  // ── Column resize ───────────────────────────────────────────────────────────

  const startResize = (id: string, e: React.MouseEvent) => {
    e.preventDefault()
    setResizing(id)
    const col   = cols.find(c => c.id === id)!
    const startX = e.clientX
    const startW = col.width
    const onMove = (ev: MouseEvent) => {
      const w = Math.max(col.minWidth || 60, startW + ev.clientX - startX)
      setCols(p => p.map(c => c.id === id ? { ...c, width: w } : c))
    }
    const onUp = () => {
      setResizing(null)
      localStorage.setItem(COL_KEY, JSON.stringify(colsRef.current))
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.cursor = document.body.style.userSelect = ''
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }

  const saveCols = (next: typeof DEFAULT_COLS) => {
    setCols(next)
    localStorage.setItem(COL_KEY, JSON.stringify(next))
  }

  // ── Actions ─────────────────────────────────────────────────────────────────

  const handleDone = async (row: any) => {
    const route: string[] = (row.process_route || row.routeStr?.split('/') || [])
    const idx  = route.findIndex((c: string) => c.toUpperCase() === processCode)
    const next = idx >= 0 ? route[idx + 1] : undefined
    if (!confirm(`Mark ${row.batch_id} done in ${processCode}?`)) return
    setSaving(true)
    try {
      const { error } = await markProcessDone(row.id, row.current_process, next)
      if (error) { alert('Error: ' + error); return }
      showToast(`✓ ${row.batch_id} ${next ? '→ ' + next : 'complete'}`)
      loadRows()
    } finally { setSaving(false) }
  }

  const handleFaulty = async () => {
    if (!faultyReason.trim() || !faultyModal) return
    setSaving(true)
    try {
      const row = faultyModal
      const order = { order_number: row.orderNo, party: row.party }
      const { error } = await markBatchFaulty({
        batch_id:    row.id,
        order_id:    row.order_id,
        order_number: row.orderNo,
        party:        row.party,
        faulty_type:  faultyReason,
        faulty_kg:    parseFloat(row.kg) || 0,
        process_code: processCode,
      })
      if (error) { alert('Error: ' + error); return }
      showToast(`✓ ${row.batch_id} marked faulty`)
      setFaultyModal(null); setFaultyReason('')
      loadRows()
    } finally { setSaving(false) }
  }

  const handleFob = async () => {
    if (!fobReason.trim() || !fobModal) return
    setSaving(true)
    try {
      const row = fobModal
      const { error } = await sb('/fob_records', {
        method: 'POST',
        body: JSON.stringify({
          batch_id:    row.id,
          order_id:    row.order_id,
          order_number: row.orderNo,
          party:        row.party,
          fob_kg:       parseFloat(row.kg) || 0,
          process_code: processCode,
          fob_type:     fobType,
          status:       'open',
          notes:        fobReason,
        }),
        headers: { 'Prefer': 'return=minimal' },
      })
      if (error) { alert('Error: ' + error); return }
      showToast(`✓ FOB entry created for ${row.batch_id}`)
      setFobModal(null); setFobReason('')
      loadRows()
    } finally { setSaving(false) }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const visible = cols.filter(c => c.visible)
  const displayRows = search.trim()
    ? rows.filter(r =>
        [r.batch_id, r.orderNo, r.party, r.color, r.article]
          .some(v => String(v || '').toLowerCase().includes(search.toLowerCase()))
      )
    : rows

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '60vh', color: 'var(--text-tertiary)', fontSize: 14 }}>
      Loading {processCode}-FMS…
    </div>
  )

  return (
    <div className="content" style={{ display: 'flex', flexDirection: 'column',
      height: 'calc(100vh - 42px)', padding: '12px 16px 0' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 10, flexShrink: 0 }}>
        <div>
          <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
            {processCode}-FMS
          </span>
          <span style={{ fontSize: 12, color: 'var(--text-tertiary)', marginLeft: 10 }}>
            {displayRows.length} batch{displayRows.length !== 1 ? 'es' : ''}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search batch, order, party…"
            style={{ fontSize: 12, padding: '6px 10px', width: 220,
              border: '1px solid var(--border-medium)', borderRadius: 5,
              background: 'var(--bg-primary)', color: 'var(--text-primary)' }} />
          {search && <button className="xs" onClick={() => setSearch('')}>✕</button>}
          <button className="small" onClick={() => setShowCols(v => !v)}>
            ⚙ Columns ({visible.length}/{cols.length})
          </button>
          <button className="small" onClick={() => router.push('/fms')}>← Back</button>
          <button className="small" onClick={loadRows}>⟳</button>
        </div>
      </div>

      {toast && (
        <div style={{ flexShrink: 0, background: 'var(--success-light)', color: 'var(--success)',
          border: '1px solid var(--success)', borderRadius: 8, padding: '8px 14px',
          marginBottom: 8, fontSize: 13, fontWeight: 600 }}>
          {toast}
        </div>
      )}

      {/* Column panel */}
      {showCols && (
        <div style={{ flexShrink: 0, padding: '10px 14px', background: 'var(--bg-secondary)',
          border: '1px solid var(--border-light)', borderRadius: 8, marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Show / Hide Columns</span>
            <button className="xs" onClick={() => saveCols(DEFAULT_COLS)}>Reset</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 6 }}>
            {cols.map(col => (
              <label key={col.id} style={{ display: 'flex', alignItems: 'center',
                gap: 6, fontSize: 12, cursor: 'pointer' }}>
                <input type="checkbox" checked={col.visible}
                  onChange={() => saveCols(cols.map(c => c.id === col.id ? { ...c, visible: !c.visible } : c))}
                  style={{ accentColor: 'var(--accent)', cursor: 'pointer' }} />
                {col.label}
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Table */}
      <div style={{ flex: 1, minHeight: 0, background: 'var(--bg-primary)',
        border: '1px solid var(--border-light)', borderRadius: 8, overflow: 'hidden',
        display: 'flex', flexDirection: 'column' }}>
        {rows.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
            flex: 1, color: 'var(--text-tertiary)', fontSize: 14 }}>
            No batches at {processCode} right now.
          </div>
        ) : (
          <div style={{ flex: 1, overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
              <colgroup>
                {visible.map(c => <col key={c.id} style={{ width: c.width }} />)}
              </colgroup>
              <thead style={{ position: 'sticky', top: 0, zIndex: 10,
                background: 'var(--bg-secondary)' }}>
                <tr>
                  {visible.map(col => (
                    <th key={col.id} style={{ padding: '9px 8px', textAlign: 'left',
                      fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)',
                      textTransform: 'uppercase', letterSpacing: '0.05em',
                      borderBottom: '2px solid var(--border-light)',
                      width: col.width, minWidth: col.minWidth,
                      position: 'relative', userSelect: 'none',
                      background: col.id === 'actions' ? 'var(--accent-light)' : 'var(--bg-secondary)',
                      whiteSpace: 'nowrap', overflow: 'hidden' }}>
                      {col.label}
                      <div onMouseDown={e => startResize(col.id, e)}
                        style={{ position: 'absolute', right: 0, top: 0, bottom: 0,
                          width: 6, cursor: 'col-resize', zIndex: 1,
                          background: resizing === col.id ? 'var(--accent)' : 'transparent' }}
                        onMouseEnter={e => { if (!resizing) (e.target as HTMLElement).style.background = 'var(--border-medium)' }}
                        onMouseLeave={e => { if (!resizing) (e.target as HTMLElement).style.background = 'transparent' }} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayRows.map((row, idx) => (
                  <tr key={row.id || idx} style={{
                    background: row.isCompleted ? 'var(--success-light)'
                              : row.isFaulty   ? 'var(--danger-light)'
                              : idx % 2 === 0  ? 'var(--bg-primary)' : 'var(--bg-secondary)',
                    borderBottom: '1px solid var(--border-light)',
                    opacity: row.isCompleted ? 0.85 : 1 }}>
                    {visible.map(col => {
                      const s: React.CSSProperties = { padding: '9px 8px', fontSize: 12,
                        color: 'var(--text-primary)', overflow: 'hidden',
                        textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: col.width }
                      switch (col.id) {
                        case 'created_at':    return <td key={col.id} style={{ ...s, fontSize: 11, color: 'var(--text-tertiary)' }}>{fmtDateTime(row.created_at)}</td>
                        case 'orderNo':       return <td key={col.id} style={{ ...s, fontWeight: 700 }}>{row.orderNo}</td>
                        case 'batch_id':      return <td key={col.id} style={{ ...s, fontWeight: 700, color: 'var(--accent)' }}>{row.batch_id}</td>
                        case 'party':         return <td key={col.id} style={s}>{row.party}</td>
                        case 'article':       return <td key={col.id} style={{ ...s, fontWeight: 500 }}>{row.article}</td>
                        case 'color':         return <td key={col.id} style={s}>{row.color}</td>
                        case 'blend':         return <td key={col.id} style={{ ...s, color: 'var(--text-secondary)' }}>{row.blend || '-'}</td>
                        case 'qty_kg':        return <td key={col.id} style={{ ...s, fontWeight: 700 }}>{row.kg}</td>
                        case 'supervisor':    return <td key={col.id} style={s}>{row.supervisorName}</td>
                        case 'machine':       return <td key={col.id} style={s}>{row.machineName}</td>
                        case 'process_route': return <td key={col.id} style={{ ...s, fontWeight: 600, color: 'var(--accent)' }}>{row.routeStr}</td>
                        case 'planned_date':  return <td key={col.id} style={{ ...s, fontWeight: 700, color: row.plannedDate ? 'var(--accent)' : 'var(--text-tertiary)' }}>{fmtDate(row.plannedDate)}</td>
                        case 'actual_date':   return <td key={col.id} style={{ ...s, fontWeight: 700, color: row.actualDate ? 'var(--success)' : 'var(--text-tertiary)' }}>{fmtDate(row.actualDate)}</td>
                        case 'time_delay':    return <td key={col.id} style={{ ...s, fontWeight: 700, color: row.delayLate ? 'var(--danger)' : 'var(--success)' }}>{row.delayText}</td>
                        case 'actions': {
                          const done   = row.isCompleted
                          const faulty = row.isFaulty
                          return (
                            <td key={col.id} style={{ ...s, overflow: 'visible' }}>
                              <div style={{ display: 'flex', gap: 4 }}>
                                <button onClick={() => !done && handleDone(row)} disabled={done || saving}
                                  style={{ padding: '4px 10px', fontSize: 11, fontWeight: 600,
                                    border: 'none', borderRadius: 4, cursor: done ? 'default' : 'pointer',
                                    background: done ? 'var(--success-light)' : 'var(--success)',
                                    color: done ? 'var(--success)' : '#fff' }}>
                                  {done ? '✓ Done' : 'Done'}
                                </button>
                                <button onClick={() => { setFaultyModal(row); setFaultyReason('') }}
                                  disabled={done || saving}
                                  style={{ padding: '4px 10px', fontSize: 11, fontWeight: 600,
                                    border: '1px solid var(--danger)', borderRadius: 4,
                                    cursor: done ? 'not-allowed' : 'pointer',
                                    background: faulty ? 'var(--danger-light)' : 'transparent',
                                    color: 'var(--danger)', opacity: done ? 0.4 : 1 }}>
                                  {faulty ? '⚠ Faulty' : 'Faulty'}
                                </button>
                                <button onClick={() => { setFobModal(row); setFobType('dyeing'); setFobReason('') }}
                                  disabled={done || saving}
                                  style={{ padding: '4px 10px', fontSize: 11, fontWeight: 600,
                                    border: '1px solid var(--purple)', borderRadius: 4,
                                    cursor: done ? 'not-allowed' : 'pointer',
                                    background: 'transparent', color: 'var(--purple)', opacity: done ? 0.4 : 1 }}>
                                  + FOB
                                </button>
                              </div>
                            </td>
                          )
                        }
                        default: return <td key={col.id} style={s}>-</td>
                      }
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Faulty modal */}
      {faultyModal && (
        <div className="modal-overlay" onClick={() => setFaultyModal(null)}>
          <div className="modal" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Mark Batch as Faulty</span>
              <button className="small" onClick={() => setFaultyModal(null)}>✕</button>
            </div>
            <div style={{ background: 'var(--bg-secondary)', borderRadius: 8,
              padding: '10px 14px', marginBottom: 14, fontSize: 13 }}>
              <strong style={{ color: 'var(--accent)' }}>{faultyModal.batch_id}</strong>
              <span style={{ color: 'var(--text-secondary)', marginLeft: 8 }}>
                {faultyModal.party} · {faultyModal.color} · {faultyModal.kg} Kg
              </span>
            </div>
            <div className="form-group" style={{ marginBottom: 14 }}>
              <label>Fault reason / remark *</label>
              <textarea value={faultyReason} rows={3} autoFocus
                placeholder="e.g. Shade variation, Crease mark, Uneven dyeing…"
                onChange={e => setFaultyReason(e.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setFaultyModal(null)}>Cancel</button>
              <button style={{ background: 'var(--danger)', color: '#fff', border: 'none',
                padding: '8px 16px', borderRadius: 6, fontWeight: 700, cursor: 'pointer',
                opacity: faultyReason.trim() ? 1 : 0.5 }}
                disabled={!faultyReason.trim() || saving}
                onClick={handleFaulty}>
                {saving ? 'Saving…' : 'Mark as Faulty'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FOB modal */}
      {fobModal && (
        <div className="modal-overlay" onClick={() => setFobModal(null)}>
          <div className="modal" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Raise FOB Entry</span>
              <button className="small" onClick={() => setFobModal(null)}>✕</button>
            </div>
            <div style={{ background: 'var(--bg-secondary)', borderRadius: 8,
              padding: '10px 14px', marginBottom: 14, fontSize: 13 }}>
              <strong style={{ color: 'var(--purple)' }}>{fobModal.batch_id}</strong>
              <span style={{ color: 'var(--text-secondary)', marginLeft: 8 }}>
                {fobModal.party} · {processCode}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
              {(['dyeing','rolling'] as const).map(t => (
                <button key={t} onClick={() => setFobType(t)} style={{
                  flex: 1, padding: 8, fontSize: 13, fontWeight: fobType === t ? 700 : 400,
                  border: `1px solid ${fobType === t ? 'var(--accent)' : 'var(--border-medium)'}`,
                  borderRadius: 6, cursor: 'pointer',
                  background: fobType === t ? 'var(--accent)' : 'var(--bg-primary)',
                  color: fobType === t ? '#fff' : 'var(--text-primary)' }}>
                  {t === 'dyeing' ? '🔵 Dyeing FOB' : '🟣 Rolling FOB'}
                </button>
              ))}
            </div>
            <div className="form-group" style={{ marginBottom: 14 }}>
              <label>Reason / remark *</label>
              <textarea value={fobReason} rows={3} autoFocus
                placeholder={fobType === 'dyeing' ? 'e.g. Shade variation, Patta…' : 'e.g. Roller mark, Crease…'}
                onChange={e => setFobReason(e.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setFobModal(null)}>Cancel</button>
              <button className="primary" onClick={handleFob}
                disabled={!fobReason.trim() || saving}>
                {saving ? 'Saving…' : 'Add FOB Entry'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
