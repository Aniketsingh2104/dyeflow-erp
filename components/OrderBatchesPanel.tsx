'use client'
// Read-only side panel on the Order Sheet: the batches of one order with
// their current process and progress. Opened from the Order # / Batches cell.
import { useCallback, useEffect, useState } from 'react'
import { useAutoRefresh } from '@/components/useAutoRefresh'
import { workRoute } from '@/lib/routeTail'

const fmt = (d: any) => {
  if (!d) return '—'
  const x = new Date(d); if (isNaN(x.getTime())) return String(d)
  return `${String(x.getDate()).padStart(2, '0')}/${String(x.getMonth() + 1).padStart(2, '0')}/${x.getFullYear()} ${String(x.getHours()).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')}`
}
const kg = (v: any) => { const n = parseFloat(v); return isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: 1 }) : '—' }

const STATUS: Record<string, { label: string; bg: string; fg: string }> = {
  'pending':     { label: 'Waiting',     bg: '#F3F4F6', fg: '#374151' },
  'in-process':  { label: 'In process',  bg: '#DBEAFE', fg: '#1E40AF' },
  'done':        { label: 'Done',        bg: '#D1FAE5', fg: '#065F46' },
  'faulty':      { label: 'Faulty',      bg: '#FEE2E2', fg: '#991B1B' },
  'repair':      { label: 'Repair',      bg: '#FEF3C7', fg: '#92400E' },
  'written-off': { label: 'Written off', bg: '#E5E7EB', fg: '#6B7280' },
}

export default function OrderBatchesPanel({ sheetId, orderNumber, onClose }: { sheetId: string; orderNumber: string; onClose: () => void }) {
  const [data, setData] = useState<{ order: any; batches: any[] } | null>(null)
  const [error, setError] = useState('')
  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/sheet-rows?sheet_id=${sheetId}&order_batches=${encodeURIComponent(orderNumber)}`, { cache: 'no-store' }).then(x => x.json())
      if (!r.ok) { setError(r.error || 'Could not load'); return }
      setData({ order: r.order, batches: r.batches || [] })
    } catch { setError('Network error') }
  }, [sheetId, orderNumber])
  useEffect(() => { setData(null); setError(''); load() }, [load])
  useAutoRefresh(load)
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k)
  }, [onClose])

  const order = data?.order
  const batches = data?.batches || []
  const splitKg = batches.filter(b => !b.is_faulty && b.status !== 'written-off').reduce((s, b) => s + (parseFloat(b.kg) || 0), 0)
  const orderKg = parseFloat(order?.qty_kg) || 0

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 900, background: 'rgba(15,23,42,0.35)' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()}
        style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 'min(760px, 100vw)', background: 'var(--bg-primary)', boxShadow: '-12px 0 40px rgba(0,0,0,0.25)', display: 'flex', flexDirection: 'column', fontSize: 13 }}>
        {/* header */}
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{orderNumber}
              {order && <span style={{ fontWeight: 500, color: 'var(--text-secondary)' }}> · {kg(order.qty_kg)} kg · {batches.length} batch{batches.length === 1 ? '' : 'es'}</span>}
            </div>
            {order && <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {order.article}{order.color ? ` · ${order.color}` : ''}{order.supervisors?.name ? ` · Supervisor ${order.supervisors.name}` : ''}{order.delivery_date ? ` · Delivery ${fmt(order.delivery_date).slice(0, 10)}` : ''}
            </div>}
          </div>
          <button className="small" onClick={load} title="Refresh">↻</button>
          <button className="small" onClick={onClose}>✕</button>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: 18 }}>
          {error && <div style={{ padding: 12, background: '#FEE2E2', color: '#991B1B', borderRadius: 8 }}>{error}</div>}
          {!data && !error && <div style={{ color: 'var(--text-tertiary)', padding: 20, textAlign: 'center' }}>Loading…</div>}
          {data && !order && <div style={{ color: 'var(--text-tertiary)', padding: 20, textAlign: 'center' }}>Order {orderNumber} was not found.</div>}
          {order && batches.length === 0 && (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-tertiary)', border: '2px dashed var(--border-medium)', borderRadius: 10 }}>
              Not split into batches yet{order.supervisors?.name ? ` — with ${order.supervisors.name}` : ''}.
            </div>
          )}
          {order && batches.length > 0 && (
            <>
              {/* split summary */}
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
                {[['Order kg', kg(orderKg)], ['Split kg', kg(splitKg)], ['Balance', kg(orderKg - splitKg)],
                  ['Done', `${batches.filter(b => b.status === 'done').length} / ${batches.length}`]].map(([l, v]) => (
                  <div key={l} style={{ border: '1px solid var(--border-light)', borderRadius: 8, padding: '8px 14px', minWidth: 100 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{l}</div>
                    <div style={{ fontSize: 18, fontWeight: 800 }}>{v}</div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 10 }}>
                {kg(orderKg)} kg split: {batches.filter(b => !b.is_faulty).map(b => kg(b.kg)).join(' + ')}
              </div>

              {batches.map(b => {
                const route: string[] = workRoute(b.process_route || order.process_route || [])
                const full: string[] = Array.isArray(b.process_route) && b.process_route.length ? b.process_route : (order.process_route || route)
                const bp: any[] = b.batch_processes || []
                const doneCodes = new Set(bp.filter(p => p.status === 'done' || p.done_at).map(p => p.process_code))
                const cur = b.current_process
                const curIdx = full.indexOf(cur)
                const next = curIdx >= 0 ? full[curIdx + 1] : full[0]
                const curBp = bp.find(p => p.process_code === cur)
                const st = STATUS[b.is_faulty ? 'faulty' : b.status] || STATUS.pending
                const pct = full.length ? Math.round((full.filter(c => doneCodes.has(c)).length / full.length) * 100) : 0
                return (
                  <div key={b.id} style={{ border: '1px solid var(--border-light)', borderLeft: `5px solid ${st.fg}`, borderRadius: 10, padding: '12px 14px', marginBottom: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                      <a href={`/batches/${encodeURIComponent(b.batch_id)}`} style={{ fontSize: 15, fontWeight: 800, color: 'var(--accent)', textDecoration: 'none' }} title="Open batch trace">{b.batch_id}</a>
                      {b.sub_prod_no && <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>· {b.sub_prod_no}</span>}
                      <span style={{ marginLeft: 'auto', fontSize: 16, fontWeight: 800 }}>{kg(b.kg)} <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-tertiary)' }}>kg</span></span>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8, alignItems: 'center' }}>
                      <span style={{ background: st.bg, color: st.fg, padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>{st.label}</span>
                      {cur && b.status !== 'done' && <span style={{ background: '#EEF2FF', color: '#3730A3', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>at {cur}</span>}
                      {next && b.status !== 'done' && <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>next: {next}</span>}
                      {b.machines?.name && <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>🏭 {b.machines.name}</span>}
                      {b.taka ? <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{b.taka} taka</span> : null}
                    </div>
                    {/* route progress */}
                    <div style={{ display: 'flex', gap: 3, marginTop: 10, flexWrap: 'wrap' }}>
                      {full.map((c, i) => {
                        const done = doneCodes.has(c) || b.status === 'done'
                        const active = c === cur && b.status !== 'done'
                        return (
                          <span key={c + i} title={c} style={{ flex: '1 1 40px', minWidth: 34, textAlign: 'center', fontSize: 10, fontWeight: 700, padding: '3px 0', borderRadius: 4,
                            background: done ? '#059669' : active ? '#2563EB' : '#E5E7EB', color: done || active ? '#fff' : '#6B7280' }}>{c}</span>
                        )
                      })}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-tertiary)', marginTop: 6 }}>
                      <span>{pct}% of route done</span>
                      <span>{b.status === 'done' ? `Done ${fmt(b.actual_date || b.updated_at)}` : curBp?.received_at ? `At ${cur} since ${fmt(curBp.received_at)}` : curBp?.sent_at ? `Sent to ${cur} ${fmt(curBp.sent_at)}` : `Updated ${fmt(b.updated_at)}`}</span>
                    </div>
                  </div>
                )
              })}
            </>
          )}
        </div>
        <div style={{ padding: '8px 18px', borderTop: '1px solid var(--border-light)', fontSize: 11, color: 'var(--text-tertiary)' }}>
          Read-only · refreshes automatically · Esc to close
        </div>
      </div>
    </div>
  )
}
