'use client'
/**
 * /delivery — Delivery Tracker: when will each order be ready to dispatch?
 *
 * For every order that has batches:
 *   • Dispatch date = the LATEST planned dispatch date of its batches
 *     (Date Calculator → batch_date_plans.d_dispatch / d_finaldispatch),
 *     or the order's own delivery date when one is set
 *   • progress = Kg of its batches that are done / order Kg
 *   • at risk = a batch is already late at the process it is in now
 *     (that process's planned date has passed), even if dispatch is still ahead
 * Tabs: Overdue · Due this week · All open · Not planned yet · Dispatched.
 */
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { toCsv } from '@/lib/csv'
import Link from 'next/link'
import { getUrgency, URGENCY_CELL_STYLE } from '@/lib/dateUrgency'
import { dateColFor } from '@/lib/processCodes'
import { isBatchFinished } from '@/lib/batchStatus'

type Tab = 'overdue' | 'week' | 'open' | 'unplanned' | 'done'

interface Row {
  id: string; orderNumber: string; party: string; article: string; color: string
  supervisor: string; status: string; qtyKg: number
  batches: any[]; doneKg: number; splitKg: number
  dispatch: string        // YYYY-MM-DD or ''
  dispatchFrom: 'plan' | 'order' | ''
  atRisk: number          // batches late at their current process
  where: string           // short "D ×2, H ×1"
}

const today = () => new Date().toLocaleDateString('en-CA')
const fmtD = (s: string) => s ? new Date(s + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'

export default function DeliveryTrackerPage() {
  const [rows,    setRows]    = useState<Row[]>([])
  const [unplannedCount, setUnplannedCount] = useState(0)
  const [unplanned, setUnplanned] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')
  const [tab,     setTab]     = useState<Tab>('overdue')
  const [q,       setQ]       = useState('')
  const [open,    setOpen]    = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const get = (u: string) => fetch(u, { cache: 'no-store' }).then(r => r.json()).catch(() => ({ ok: false, data: [] }))
      const [oRes, bRes, dpRes] = await Promise.all([get('/api/orders'), get('/api/batches'), get('/api/date-plans')])
      if (!oRes.ok || !bRes.ok) throw new Error(oRes.error || bRes.error || 'Could not load data')

      const plans: Record<string, any> = {}
      for (const dp of dpRes.data || []) plans[dp.batch_id] = dp
      const byOrder: Record<string, any[]> = {}
      for (const b of bRes.data || []) (byOrder[b.order_id] ||= []).push(b)
      const t = today()

      const out: Row[] = []
      const noPlan: any[] = []
      for (const o of oRes.data || []) {
        const bs = byOrder[o.id] || []
        if (!bs.length) {
          if (!['done', 'hold'].includes(o.status)) noPlan.push(o)
          continue
        }
        let dispatch = '', atRisk = 0
        const where: Record<string, number> = {}
        for (const b of bs) {
          const p = plans[b.id] || {}
          const d = String(p.d_dispatch || p.d_finaldispatch || '').slice(0, 10)
          b._dispatch = d
          if (d && d > dispatch) dispatch = d
          if (b.status !== 'done' && b.current_process) {
            where[b.current_process] = (where[b.current_process] || 0) + 1
            const col = dateColFor(b.current_process)
            const due = col && p[col] ? String(p[col]).slice(0, 10) : ''
            b._late = !!due && due < t
            if (b._late) atRisk++
          }
        }
        let from: Row['dispatchFrom'] = dispatch ? 'plan' : ''
        const own = String(o.delivery_date || '').slice(0, 10)
        if (/^\d{4}-\d{2}-\d{2}$/.test(own)) { dispatch = own; from = 'order' }
        const doneKg  = bs.filter(b => isBatchFinished(b)).reduce((s, b) => s + (parseFloat(b.kg) || 0), 0)
        const splitKg = bs.reduce((s, b) => s + (parseFloat(b.kg) || 0), 0)
        out.push({
          id: o.id, orderNumber: o.order_number || '—', party: o.party || '—', article: o.article || '—',
          color: o.color || '—', supervisor: o.supervisors?.name || '—', status: o.status,
          qtyKg: parseFloat(o.qty_kg) || 0, batches: bs, doneKg, splitKg,
          dispatch, dispatchFrom: from, atRisk,
          where: Object.entries(where).map(([c, n]) => n > 1 ? `${c} ×${n}` : c).join(', '),
        })
      }
      out.sort((a, b) => (a.dispatch || '9999').localeCompare(b.dispatch || '9999'))
      setRows(out)
      setUnplannedCount(noPlan.length)
      setUnplanned(noPlan.slice(0, 300))
    } catch (e: any) { setError(e?.message || String(e)) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const isDone = (r: Row) => r.status === 'done'
  const counts = useMemo(() => {
    const t = today()
    const in7 = new Date(Date.now() + 7 * 86400000).toLocaleDateString('en-CA')
    return {
      overdue: rows.filter(r => !isDone(r) && r.dispatch && r.dispatch < t).length,
      week:    rows.filter(r => !isDone(r) && r.dispatch && r.dispatch >= t && r.dispatch <= in7).length,
      open:    rows.filter(r => !isDone(r)).length,
      done:    rows.filter(isDone).length,
      atRisk:  rows.filter(r => !isDone(r) && r.atRisk > 0).length,
    }
  }, [rows])

  const shown = useMemo(() => {
    const t = today()
    const in7 = new Date(Date.now() + 7 * 86400000).toLocaleDateString('en-CA')
    const s = q.trim().toLowerCase()
    return rows.filter(r => {
      if (tab === 'overdue' && !(!isDone(r) && r.dispatch && r.dispatch < t)) return false
      if (tab === 'week'    && !(!isDone(r) && r.dispatch && r.dispatch >= t && r.dispatch <= in7)) return false
      if (tab === 'open'    && isDone(r)) return false
      if (tab === 'done'    && !isDone(r)) return false
      if (!s) return true
      return [r.orderNumber, r.party, r.article, r.color, r.supervisor, ...r.batches.map(b => b.batch_id)]
        .some(v => String(v || '').toLowerCase().includes(s))
    })
  }, [rows, tab, q])

  const exportCsv = () => {
    const head = ['Order', 'Party', 'Article', 'Colour', 'Supervisor', 'Order Kg', 'Split Kg', 'Done Kg', 'Dispatch date', 'Status', 'Now at', 'Late batches']
    const body = shown.map(r => [r.orderNumber, r.party, r.article, r.color, r.supervisor, r.qtyKg, r.splitKg, r.doneKg,
      r.dispatch, r.status, r.where, r.atRisk])
    const csv = toCsv([head, ...body])
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = `delivery-tracker-${today()}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const TABS: { key: Tab; label: string; n: number; color?: string }[] = [
    { key: 'overdue',   label: 'Overdue',          n: counts.overdue, color: 'var(--danger)' },
    { key: 'week',      label: 'Due in 7 days',    n: counts.week,    color: '#D97706' },
    { key: 'open',      label: 'All open',         n: counts.open },
    { key: 'unplanned', label: 'Not split yet',    n: unplannedCount },
    { key: 'done',      label: 'Finished',         n: counts.done,    color: 'var(--success)' },
  ]

  return (
    <div className="content">
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-header">
          <div>
            <span className="card-title">🚚 Delivery Tracker</span>
            <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>
              Dispatch date = latest planned dispatch of the order&apos;s batches (Date Calculator), or the order&apos;s own delivery date.
              {counts.atRisk > 0 && <> <strong style={{ color: 'var(--danger)' }}>{counts.atRisk} open order{counts.atRisk === 1 ? ' has' : 's have'}</strong> a batch already late at its current process.</>}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="small" onClick={exportCsv} disabled={tab === 'unplanned' || !shown.length}>⬇ CSV</button>
            <button className="small" onClick={load}>↻ Refresh</button>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              style={{ fontSize: 12, padding: '6px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
                fontWeight: tab === t.key ? 700 : 500,
                background: tab === t.key ? (t.color || 'var(--accent)') : 'var(--bg-secondary)',
                color: tab === t.key ? '#fff' : (t.color || 'var(--text-secondary)') }}>
              {t.label} ({t.n})
            </button>
          ))}
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search order, party, article, batch…"
            style={{ marginLeft: 'auto', width: 260, padding: '6px 10px', fontSize: 12 }} />
        </div>
      </div>

      <div className="card">
        {loading ? <div className="empty-state">Loading…</div>
        : error ? <div className="empty-state" style={{ color: 'var(--danger)' }}>⚠ {error}</div>
        : tab === 'unplanned' ? (
          <UnplannedList orders={unplanned} total={unplannedCount} q={q} />
        ) : !shown.length ? (
          <div className="empty-state">{tab === 'overdue' ? 'Nothing overdue 🎉' : 'No orders here.'}</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--bg-secondary)' }}>
                  {['Dispatch', 'Order', 'Party', 'Article / Colour', 'Supervisor', 'Progress', 'Now at', ''].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '8px 10px', fontSize: 10, textTransform: 'uppercase', color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map(r => {
                  const u = isDone(r) ? null : getUrgency(r.dispatch)
                  const pct = r.qtyKg > 0 ? Math.min(100, Math.round(r.doneKg / r.qtyKg * 100)) : 0
                  const isOpen = open === r.id
                  return (
                    <Fragment key={r.id}>
                      <tr onClick={() => setOpen(isOpen ? null : r.id)} style={{ cursor: 'pointer', borderBottom: '1px solid var(--border-light)' }}>
                        <td style={{ ...td, whiteSpace: 'nowrap', fontWeight: 700, ...(u ? URGENCY_CELL_STYLE[u.status] : {}) }}>
                          {fmtD(r.dispatch)}
                          {u?.label && <div style={{ fontSize: 10, fontWeight: 600 }}>{u.label}</div>}
                          {r.dispatchFrom === 'order' && <div style={{ fontSize: 10, fontWeight: 400 }}>order date</div>}
                        </td>
                        <td style={{ ...td, fontWeight: 700 }}>{r.orderNumber}</td>
                        <td style={td}>{r.party}</td>
                        <td style={td}>{r.article} · {r.color}</td>
                        <td style={td}>{r.supervisor}</td>
                        <td style={{ ...td, minWidth: 140 }}>
                          <div style={{ height: 6, background: 'var(--bg-secondary)', borderRadius: 3, overflow: 'hidden' }}>
                            <div style={{ width: `${pct}%`, height: '100%', background: pct >= 100 ? 'var(--success)' : 'var(--accent)' }} />
                          </div>
                          <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 3 }}>
                            {Math.round(r.doneKg)} / {Math.round(r.qtyKg)} Kg done
                            {r.splitKg < r.qtyKg - 0.5 && <span style={{ color: '#D97706' }}> · {Math.round(r.qtyKg - r.splitKg)} Kg not split</span>}
                          </div>
                        </td>
                        <td style={td}>
                          {r.where || (isDone(r) ? 'Finished' : '—')}
                          {r.atRisk > 0 && <div style={{ fontSize: 10, color: 'var(--danger)', fontWeight: 700 }}>{r.atRisk} late at process</div>}
                        </td>
                        <td style={{ ...td, color: 'var(--text-tertiary)' }}>{isOpen ? '▲' : '▼'}</td>
                      </tr>
                      {isOpen && (
                        <tr>
                          <td colSpan={8} style={{ padding: '6px 10px 12px 30px', background: 'var(--bg-secondary)' }}>
                            {r.batches.map(b => (
                              <div key={b.id} style={{ display: 'flex', gap: 14, padding: '4px 0', fontSize: 12, alignItems: 'center' }}>
                                <Link href={`/batches/${encodeURIComponent(b.batch_id)}`} style={{ fontWeight: 700, minWidth: 140 }}>{b.batch_id}</Link>
                                <span style={{ minWidth: 60 }}>{b.kg} Kg</span>
                                <span style={{ minWidth: 110 }}>{b.status === 'done' ? '✓ Done' : b.is_faulty ? '⚠ Faulty' : b.current_process ? `at ${b.current_process}` : b.status}</span>
                                <span style={{ color: 'var(--text-tertiary)' }}>dispatch {fmtD(b._dispatch)}</span>
                                {b._late && <span style={{ color: 'var(--danger)', fontWeight: 700 }}>late at {b.current_process}</span>}
                              </div>
                            ))}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function UnplannedList({ orders, total, q }: { orders: any[]; total: number; q: string }) {
  const s = q.trim().toLowerCase()
  const list = orders.filter(o => !s || [o.order_number, o.party, o.article, o.color, o.supervisors?.name]
    .some(v => String(v || '').toLowerCase().includes(s)))
  if (!list.length) return <div className="empty-state">No orders waiting to be split.</div>
  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 8 }}>
        {total} open order{total === 1 ? '' : 's'} have no batches yet, so no dispatch date can be planned.
        {total > orders.length && ` Showing the first ${orders.length}.`} Split them on the <Link href="/orders">Orders</Link> page.
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ background: 'var(--bg-secondary)' }}>
            {['Order', 'Party', 'Article / Colour', 'Kg', 'Supervisor', 'Status', 'Created'].map(h => (
              <th key={h} style={{ textAlign: 'left', padding: '8px 10px', fontSize: 10, textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {list.map(o => (
            <tr key={o.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
              <td style={{ ...td, fontWeight: 700 }}>{o.order_number}</td>
              <td style={td}>{o.party}</td>
              <td style={td}>{o.article} · {o.color}</td>
              <td style={td}>{o.qty_kg}</td>
              <td style={td}>{o.supervisors?.name || '—'}</td>
              <td style={td}>{o.status}</td>
              <td style={td}>{o.created_at ? new Date(o.created_at).toLocaleDateString('en-GB') : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const td: React.CSSProperties = { padding: '8px 10px', verticalAlign: 'middle' }
