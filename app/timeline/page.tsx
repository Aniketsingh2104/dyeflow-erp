'use client'

import { useEffect, useState } from 'react'
import { loadOrSeedProcessList } from '@/lib/processMap'

interface TimelineOrder {
  id: string
  orderNo: string
  party: string
  article: string
  color: string
  qtyKg: string
  supervisor: string
  status: string
  processRoute: string[]
  plannedDates: Record<string, string>
  startDate: Date | null
  endDate: Date | null
  currentProcess: string
  isOverdue: boolean
  daysLeft: number | null
}

function parseDate(s: string): Date | null {
  if (!s) return null
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d
}

const STATUS_COLORS: Record<string, string> = {
  new: '#EF9F27', assigned: '#185FA5', splitting: '#7C3AED',
  'in-process': '#0EA5E9', done: '#059669', hold: '#DC2626',
}

export default function TimelinePage() {
  const [orders, setOrders] = useState<TimelineOrder[]>([])
  const [processList, setProcessList] = useState<{ code: string; name: string }[]>([])
  const [filter, setFilter] = useState<'active' | 'all' | 'overdue'>('active')
  const [search, setSearch] = useState('')
  const [viewDays, setViewDays] = useState(30)
  const [today] = useState(new Date())

  useEffect(() => { load() }, [])

  const load = () => {
    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return
    const db = JSON.parse(stored)
    const procs = loadOrSeedProcessList().filter(p => p.enabled).sort((a, b) => a.order - b.order)
    setProcessList(procs)

    const now = new Date()
    const result: TimelineOrder[] = (db.orders || []).map((o: any) => {
      const planned: Record<string, string> = o.plannedDates || {}
      const dates = Object.values(planned).map(parseDate).filter(Boolean) as Date[]
      const startDate = dates.length > 0 ? new Date(Math.min(...dates.map(d => d.getTime()))) : null
      const endDate = planned['Dispatch'] ? parseDate(planned['Dispatch']) : dates.length > 0 ? new Date(Math.max(...dates.map(d => d.getTime()))) : null

      const currentProcess = (o.splits || []).reduce((cur: string, b: any) => b.fmsCurrentProcess || cur, '')
      const isOverdue = !!endDate && endDate < now && o.status !== 'done'
      const daysLeft = endDate ? Math.round((endDate.getTime() - now.getTime()) / 86400000) : null

      return {
        id: o.id,
        orderNo: o.orderNumber || '-',
        party: o.party || '-',
        article: o.article || '-',
        color: o.color || '-',
        qtyKg: o.qtyKg || '-',
        supervisor: o.supervisor || '-',
        status: o.status || 'new',
        processRoute: o.processRoute || [],
        plannedDates: planned,
        startDate,
        endDate,
        currentProcess,
        isOverdue,
        daysLeft,
      }
    })

    setOrders(result)
  }

  // ── Gantt helpers ──────────────────────────────────────────────────────────
  const viewStart = new Date(today)
  viewStart.setDate(today.getDate() - 3) // 3 days before today
  const viewEnd = new Date(viewStart)
  viewEnd.setDate(viewStart.getDate() + viewDays)
  const totalMs = viewEnd.getTime() - viewStart.getTime()

  const pct = (date: Date | null): number => {
    if (!date) return 0
    return Math.max(0, Math.min(100, ((date.getTime() - viewStart.getTime()) / totalMs) * 100))
  }

  const barWidth = (start: Date | null, end: Date | null): number => {
    if (!start || !end) return 0
    const s = Math.max(viewStart.getTime(), start.getTime())
    const e = Math.min(viewEnd.getTime(), end.getTime())
    return Math.max(0, ((e - s) / totalMs) * 100)
  }

  // Day ticks for the header
  const ticks: Date[] = []
  const cur = new Date(viewStart)
  while (cur <= viewEnd) {
    ticks.push(new Date(cur))
    cur.setDate(cur.getDate() + (viewDays <= 14 ? 1 : viewDays <= 30 ? 3 : 7))
  }

  const filtered = orders.filter(o => {
    if (filter === 'active' && ['done', 'new'].includes(o.status)) return false
    if (filter === 'overdue' && !o.isOverdue) return false
    if (search.trim()) {
      const s = search.toLowerCase()
      return o.orderNo.toLowerCase().includes(s) || o.party.toLowerCase().includes(s) || o.supervisor.toLowerCase().includes(s)
    }
    return true
  })

  const todayPct = pct(today)

  return (
    <div className="content" style={{ maxWidth: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 600 }}>Order Timeline</div>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>
            Planned dispatch dates · {filtered.length} orders shown
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…" style={{ width: 160, fontSize: 12 }} />
          {(['active', 'overdue', 'all'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{ fontSize: 12, fontWeight: filter === f ? 600 : 400, background: filter === f ? 'var(--accent)' : 'var(--bg-secondary)', color: filter === f ? '#fff' : 'var(--text-secondary)', border: 'none', borderRadius: 6, padding: '5px 12px' }}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
          <select value={viewDays} onChange={e => setViewDays(Number(e.target.value))} style={{ fontSize: 12, width: 100 }}>
            <option value={14}>14 days</option>
            <option value={30}>30 days</option>
            <option value={60}>60 days</option>
            <option value={90}>90 days</option>
          </select>
          <button className="small" onClick={load}>↻</button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="card"><div className="empty-state">No orders match. Set planned dates in Date Calculator first.</div></div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {/* Timeline grid */}
          <div style={{ display: 'flex', overflowX: 'auto' }}>
            {/* Left labels */}
            <div style={{ flexShrink: 0, width: 240, borderRight: '1px solid var(--border-light)' }}>
              {/* Header spacer */}
              <div style={{ height: 36, borderBottom: '1px solid var(--border-light)', background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', padding: '0 14px', fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Order / Party
              </div>
              {filtered.map(o => (
                <div key={o.id} style={{ height: 52, borderBottom: '1px solid var(--border-light)', padding: '8px 14px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.orderNo}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.party} · {o.color}</div>
                </div>
              ))}
            </div>

            {/* Gantt area */}
            <div style={{ flex: 1, minWidth: 600, position: 'relative' }}>
              {/* Day header */}
              <div style={{ height: 36, borderBottom: '2px solid var(--border-light)', background: 'var(--bg-secondary)', position: 'relative' }}>
                {ticks.map((d, i) => (
                  <div key={i} style={{ position: 'absolute', left: `${pct(d)}%`, top: 0, bottom: 0, display: 'flex', alignItems: 'center' }}>
                    <div style={{ width: 1, background: 'var(--border-light)', height: '100%', position: 'absolute' }} />
                    <span style={{ fontSize: 10, color: 'var(--text-tertiary)', paddingLeft: 4, whiteSpace: 'nowrap' }}>
                      {d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                    </span>
                  </div>
                ))}
                {/* Today marker header */}
                {todayPct >= 0 && todayPct <= 100 && (
                  <div style={{ position: 'absolute', left: `${todayPct}%`, top: 0, bottom: 0, display: 'flex', alignItems: 'center' }}>
                    <div style={{ width: 2, background: '#DC2626', height: '100%' }} />
                    <span style={{ fontSize: 10, color: '#DC2626', fontWeight: 700, paddingLeft: 3 }}>TODAY</span>
                  </div>
                )}
              </div>

              {/* Order rows */}
              {filtered.map(o => {
                const barLeft = pct(o.startDate)
                const bw = barWidth(o.startDate, o.endDate)
                const barColor = o.isOverdue ? '#DC2626' : o.status === 'done' ? '#059669' : STATUS_COLORS[o.status] || '#185FA5'

                return (
                  <div key={o.id} style={{ height: 52, borderBottom: '1px solid var(--border-light)', position: 'relative', background: o.isOverdue ? '#FEF2F2' : 'transparent' }}>
                    {/* Vertical day lines */}
                    {ticks.map((d, i) => (
                      <div key={i} style={{ position: 'absolute', left: `${pct(d)}%`, top: 0, bottom: 0, width: 1, background: 'var(--border-light)', opacity: 0.5 }} />
                    ))}
                    {/* Today line */}
                    {todayPct >= 0 && todayPct <= 100 && (
                      <div style={{ position: 'absolute', left: `${todayPct}%`, top: 0, bottom: 0, width: 2, background: 'rgba(220,38,38,0.3)', zIndex: 1 }} />
                    )}
                    {/* Bar */}
                    {o.startDate && o.endDate && bw > 0 && (
                      <div title={`${o.orderNo} · ${o.party}\nStart: ${o.startDate.toLocaleDateString('en-GB')}\nDispatch: ${o.endDate.toLocaleDateString('en-GB')}`}
                        style={{ position: 'absolute', left: `${barLeft}%`, width: `${bw}%`, top: 12, height: 28, background: barColor, borderRadius: 6, display: 'flex', alignItems: 'center', paddingLeft: 8, zIndex: 2, cursor: 'default', minWidth: 4 }}>
                        {bw > 8 && (
                          <span style={{ fontSize: 11, fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {o.currentProcess ? `⚙ ${o.currentProcess}` : o.status}
                          </span>
                        )}
                      </div>
                    )}
                    {/* Process step dots */}
                    {o.processRoute.map(code => {
                      const d = o.plannedDates[code] ? parseDate(o.plannedDates[code]) : null
                      if (!d) return null
                      const p = pct(d)
                      if (p < 0 || p > 100) return null
                      const isDone = !!(o.plannedDates[code] && parseDate(o.plannedDates[code])! < today)
                      return (
                        <div key={code} title={`${code}: ${o.plannedDates[code]}`} style={{ position: 'absolute', left: `${p}%`, top: 20, width: 8, height: 14, marginLeft: -4, background: isDone ? '#059669' : '#fff', border: `2px solid ${barColor}`, borderRadius: 3, zIndex: 3 }} />
                      )
                    })}
                    {/* Right info */}
                    <div style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 10, color: o.isOverdue ? '#DC2626' : 'var(--text-tertiary)', fontWeight: o.isOverdue ? 700 : 400, whiteSpace: 'nowrap' }}>
                      {o.daysLeft === null ? '' : o.daysLeft < 0 ? `${Math.abs(o.daysLeft)}d overdue` : `${o.daysLeft}d`}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Legend */}
          <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border-light)', display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center', fontSize: 11, color: 'var(--text-tertiary)' }}>
            <span style={{ fontWeight: 600 }}>Legend:</span>
            {[['#0EA5E9', 'In Process'], ['#059669', 'Done'], ['#DC2626', 'Overdue'], ['#EF9F27', 'New']].map(([col, label]) => (
              <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 14, height: 10, background: col, borderRadius: 3, display: 'inline-block' }} />{label}
              </span>
            ))}
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 8, height: 12, background: '#fff', border: '2px solid #0EA5E9', borderRadius: 2, display: 'inline-block' }} />Process step
            </span>
            <span style={{ marginLeft: 'auto', fontSize: 11 }}>Hover bars for details · Set planned dates via Date Calculator → Save to Orders</span>
          </div>
        </div>
      )}
    </div>
  )
}
