'use client'
import React, { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { buildDbContext, fetchAnomalyContext, AnomalyItem } from '@/lib/dbContext'
import { useSupervisorFilter } from '@/lib/permissions'

interface AiInsight { text: string; type: 'urgent' | 'info' | 'good' }

const statusBadge = (status: string) => {
  const classes: Record<string, string> = {
    'new': 'badge-new', 'assigned': 'badge-assigned', 'splitting': 'badge-splitting',
    'in-process': 'badge-in-process', 'done': 'badge-done', 'hold': 'badge-hold'
  }
  return <span className={`badge ${classes[status] || 'badge-pending'}`}>{status}</span>
}

function parseInsights(text: string): AiInsight[] {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  const insights: AiInsight[] = []
  for (const line of lines) {
    const cleaned = line.replace(/^[-•*\d]+[.)]\s*/, '').trim()
    if (!cleaned || cleaned.length < 10) continue
    const lower = cleaned.toLowerCase()
    let type: AiInsight['type'] = 'info'
    if (lower.includes('overdue') || lower.includes('urgent') || lower.includes('critical') ||
        lower.includes('at risk') || lower.includes('faulty') || lower.includes('hold') ||
        lower.includes('missing') || lower.includes('overloaded') || lower.includes('behind'))
      type = 'urgent'
    else if (lower.includes('completed') || lower.includes('on track') || lower.includes('good') ||
             lower.includes('no issue') || lower.includes('all clear') || lower.includes('running well'))
      type = 'good'
    insights.push({ text: cleaned, type })
    if (insights.length >= 5) break
  }
  return insights
}

// ── AI Insights Panel ─────────────────────────────────────────────────────────
function AiInsightsPanel() {
  const [insights, setInsights] = useState<AiInsight[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null)

  const loadInsights = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const ctxRes = await fetch('/api/context', { cache: 'no-store' })
      const ctxData = await ctxRes.json()
      const fullCtx = ctxData.ok ? ctxData.full : buildDbContext().full

      if (!fullCtx || fullCtx.includes('empty')) {
        setInsights([{ text: 'No orders yet. Add your first order to start seeing insights.', type: 'info' }])
        setLoading(false); return
      }

      const response = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system: `You are a factory operations assistant for a dyeing factory ERP.
Analyze the live database snapshot and return EXACTLY 3-5 short bullet points (one per line, starting with -) about what needs attention RIGHT NOW.
Rules:
- Each bullet must be specific with actual order numbers, machine names, or counts — never generic
- Start with the most urgent issue
- Keep each bullet under 20 words
- Cover: overdue orders, machine loads, supervisor inbox, faulty batches, unassigned orders
- If everything is fine, say so specifically
- NO headers, NO explanations, ONLY bullet points`,
          max_tokens: 400,
          messages: [{ role: 'user', content: `Give me 3-5 urgent attention points from this live factory data:\n\n${fullCtx}` }]
        })
      })
      const data = await response.json()
      const text = (data.content || []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join('')
      const parsed = parseInsights(text)
      setInsights(parsed.length > 0 ? parsed : [{ text: 'Factory data loaded. No urgent issues detected.', type: 'good' }])
      setLastRefreshed(new Date())
    } catch (err: any) {
      setError(err.message || 'Could not load AI insights.')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { loadInsights() }, [loadInsights])

  const iconMap: Record<string, string> = { urgent: '⚠', info: '●', good: '✓' }
  const colorMap: Record<string, any> = {
    urgent: { bg: '#FEF3CD', border: '#F59E0B', icon: '#D97706', text: '#78350F' },
    info:   { bg: 'var(--bg-secondary)', border: 'var(--border-light)', icon: 'var(--accent)', text: 'var(--text-primary)' },
    good:   { bg: '#F0FDF4', border: '#86EFAC', icon: '#16A34A', text: '#14532D' }
  }

  return (
    <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: 12, overflow: 'hidden', marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16 }}>🤖</span>
          <div>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>AI Insights</span>
            <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 8 }}>
              {lastRefreshed ? `Updated ${lastRefreshed.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : 'Loading…'}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Link href="/ai-assistant" style={{ fontSize: 11, color: '#94a3b8', textDecoration: 'none', padding: '3px 8px', border: '1px solid #334155', borderRadius: 4 }}>Open AI Assistant →</Link>
          <button onClick={loadInsights} disabled={loading} style={{ fontSize: 11, color: '#94a3b8', background: 'none', border: '1px solid #334155', borderRadius: 4, padding: '3px 8px', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.5 : 1 }}>
            {loading ? '…' : '↻'}
          </button>
        </div>
      </div>
      <div style={{ padding: '10px 14px' }}>
        {loading ? (
          <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Reading factory data from Supabase…</span>
        ) : error ? (
          <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
            Could not load AI insights — <button onClick={loadInsights} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 12, padding: 0 }}>Retry</button>
          </span>
        ) : (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {insights.map((ins, i) => {
              const c = colorMap[ins.type]
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 7, background: c.bg, border: `1px solid ${c.border}`, borderRadius: 8, padding: '7px 11px', flex: '1 1 220px', minWidth: 180 }}>
                  <span style={{ fontSize: 13, color: c.icon, flexShrink: 0, marginTop: 1 }}>{iconMap[ins.type]}</span>
                  <span style={{ fontSize: 12, color: c.text, lineHeight: 1.5 }}>{ins.text}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Anomaly Panel — now reads from Supabase via fetchAnomalyContext ───────────
const SEVERITY_CFG = {
  critical: { bg: '#FEF2F2', border: '#FCA5A5', color: '#DC2626', icon: '🔴', label: 'Critical' },
  warning:  { bg: '#FEF3C7', border: '#FCD34D', color: '#D97706', icon: '⚠️',  label: 'Warning'  },
  watch:    { bg: '#EFF6FF', border: '#BFDBFE', color: '#185FA5', icon: '🔵', label: 'Watch'    },
}

function AnomalyPanel() {
  const [anomalies,   setAnomalies]   = useState<AnomalyItem[]>([])
  const [expanded,    setExpanded]    = useState(false)
  const [lastChecked, setLastChecked] = useState('')

  const check = useCallback(async () => {
    const { anomalies: found } = await fetchAnomalyContext()
    setAnomalies(found)
    setLastChecked(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }))
  }, [])

  useEffect(() => {
    check()
    const t = setInterval(check, 300000) // re-check every 5 min
    return () => clearInterval(t)
  }, [check])

  if (anomalies.length === 0) return null

  const criticalCount = anomalies.filter(a => a.severity === 'critical').length
  const warningCount  = anomalies.filter(a => a.severity === 'warning').length
  const shown = expanded ? anomalies : anomalies.slice(0, 3)

  return (
    <div style={{ background: 'var(--bg-primary)', border: `1px solid ${criticalCount > 0 ? '#FCA5A5' : '#FCD34D'}`, borderLeft: `4px solid ${criticalCount > 0 ? '#DC2626' : '#D97706'}`, borderRadius: 12, overflow: 'hidden', marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: criticalCount > 0 ? '#FEF2F2' : '#FEF3C7', cursor: 'pointer' }} onClick={() => setExpanded(e => !e)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16 }}>⚠️</span>
          <div>
            <span style={{ fontSize: 13, fontWeight: 700, color: criticalCount > 0 ? '#DC2626' : '#D97706' }}>
              {criticalCount > 0 ? `🔴 ${criticalCount} Critical` : ''}
              {criticalCount > 0 && warningCount > 0 ? ' · ' : ''}
              {warningCount > 0 ? `⚠️ ${warningCount} Warning` : ''}
              {criticalCount === 0 && warningCount === 0 ? `🔵 ${anomalies.length} Watch` : ''}
              {` — Batch Anomalies`}
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-tertiary)', marginLeft: 8 }}>checked {lastChecked}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Link href="/ai-assistant" onClick={e => e.stopPropagation()} style={{ fontSize: 11, color: 'var(--accent)', textDecoration: 'none', padding: '2px 8px', border: '1px solid var(--accent-light)', borderRadius: 4 }}>AI Analysis →</Link>
          <button onClick={e => { e.stopPropagation(); check() }} style={{ fontSize: 11, background: 'none', border: '1px solid var(--border-light)', borderRadius: 4, padding: '2px 8px', cursor: 'pointer' }}>↻</button>
          <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>{expanded ? '▲' : '▼'}</span>
        </div>
      </div>
      <div style={{ padding: '8px 12px' }}>
        {shown.map((a, i) => {
          const cfg = SEVERITY_CFG[a.severity]
          return (
            <div key={a.batchId + i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 10px', marginBottom: 6, background: cfg.bg, border: `1px solid ${cfg.border}`, borderRadius: 8 }}>
              <span style={{ fontSize: 16, flexShrink: 0 }}>{cfg.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: cfg.color }}>{a.batchId}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{a.orderNo} · {a.party}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', background: cfg.color, color: '#fff', borderRadius: 10 }}>{cfg.label}</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3 }}>
                  Stuck in <strong style={{ color: cfg.color }}>{a.processName}</strong> for <strong style={{ color: cfg.color }}>{a.daysStuck}d</strong>
                  {' '}— expected {a.expectedDays}d, over by <strong>{a.overByDays}d</strong> · Supervisor: {a.supervisor}
                </div>
              </div>
            </div>
          )
        })}
        {anomalies.length > 3 && (
          <button onClick={() => setExpanded(e => !e)} style={{ width: '100%', fontSize: 12, padding: '6px', background: 'var(--bg-secondary)', border: '1px solid var(--border-light)', borderRadius: 6, cursor: 'pointer', color: 'var(--text-secondary)', marginTop: 4 }}>
            {expanded ? '▲ Show fewer' : `▼ Show all ${anomalies.length} anomalies`}
          </button>
        )}
      </div>
    </div>
  )
}

// ── Production Heatmap ────────────────────────────────────────────────────────
function ProductionHeatmap() {
  const [cells, setCells] = useState<any[]>([])

  useEffect(() => {
    fetch('/api/batches?limit=5000&status=done', { cache: 'no-store' })
      .then(r => r.json())
      .then(data => {
        const countByDay: Record<string, number> = {}
        for (const b of (data.data || [])) {
          const day = (b.updated_at || b.created_at || '').slice(0, 10)
          if (day) countByDay[day] = (countByDay[day] || 0) + 1
        }
        const today = new Date()
        const days: any[] = []
        for (let i = 34; i >= 0; i--) {
          const d = new Date(today); d.setDate(today.getDate() - i)
          const iso = d.toISOString().slice(0, 10)
          days.push({ date: iso, label: d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }), count: countByDay[iso] || 0, isToday: i === 0, dayOfWeek: d.getDay() })
        }
        setCells(days)
      })
  }, [])

  const maxCount = Math.max(...cells.map(c => c.count), 1)
  const cellColor = (n: number) => {
    if (!n) return 'var(--bg-secondary)'
    const p = n / maxCount
    return p < 0.25 ? '#BAE6FD' : p < 0.5 ? '#38BDF8' : p < 0.75 ? '#0284C7' : '#0C4A6E'
  }

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div className="card-header">
        <span className="card-title">🟥 Production Heatmap <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-tertiary)' }}>Last 35 days</span></span>
        <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--text-tertiary)' }}>
          <span>7d: <strong style={{ color: 'var(--text-primary)' }}>{cells.slice(-7).reduce((s, c) => s + c.count, 0)}</strong></span>
          <span>35d: <strong style={{ color: 'var(--text-primary)' }}>{cells.reduce((s, c) => s + c.count, 0)}</strong></span>
        </div>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', padding: '4px 0' }}>
          {cells.map(c => (
            <div key={c.date} title={`${c.label}: ${c.count} batches`}
              style={{ width: 18, height: Math.max(8, Math.round((c.count / maxCount) * 60)), background: cellColor(c.count), borderRadius: 3, border: c.isToday ? '2px solid var(--accent)' : '2px solid transparent', flexShrink: 0 }} />
          ))}
        </div>
        <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
          {cells.map(c => (
            <div key={c.date} style={{ width: 18, textAlign: 'center', fontSize: 8, color: c.isToday ? 'var(--accent)' : 'var(--text-tertiary)', flexShrink: 0, fontWeight: c.isToday ? 700 : 400, overflow: 'hidden' }}>
              {c.dayOfWeek === 1 || c.isToday ? c.label.slice(0, 3) : ''}
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 8 }}>
        <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>None</span>
        {['#BAE6FD','#38BDF8','#0284C7','#0C4A6E'].map(c => <div key={c} style={{ width: 16, height: 12, background: c, borderRadius: 2 }} />)}
        <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>High</span>
        <Link href="/reports/daily" style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>Daily Report →</Link>
      </div>
    </div>
  )
}

// ── Holiday Warnings ──────────────────────────────────────────────────────────
function HolidayWarnings({ orders }: { orders: any[] }) {
  const [conflicts, setConflicts] = useState<any[]>([])

  useEffect(() => {
    if (!orders.length) return
    fetch('/api/setup/holidays', { cache: 'no-store' })
      .then(r => r.json())
      .then(data => {
        const holidays: any[] = data.data || []
        const now = new Date(), future = new Date(now)
        future.setDate(future.getDate() + 14)
        const holidayMap: Record<string, string> = {}
        holidays.filter(h => h.type === 'global').forEach(h => {
          const iso = String(h.holiday_date || '').slice(0, 10)
          if (iso) holidayMap[iso] = h.reason || 'Holiday'
        })
        const found: any[] = []
        for (const o of orders) {
          if (['done','hold'].includes(o.status)) continue
          for (const [code, dv] of Object.entries(o.planned_dates || {})) {
            const iso = String(dv || '').slice(0, 10)
            if (!iso || !holidayMap[iso]) continue
            const d = new Date(iso)
            if (d < now || d > future) continue
            found.push({ orderNo: o.order_number, party: o.party, date: iso,
              dateLabel: d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
              holidayName: holidayMap[iso], processLabel: code })
          }
        }
        setConflicts(found.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 10))
      })
  }, [orders])

  if (!conflicts.length) return null
  return (
    <div style={{ background: 'var(--bg-primary)', border: '1px solid #FCD34D', borderLeft: '4px solid #D97706', borderRadius: 10, marginBottom: 14, overflow: 'hidden' }}>
      <div style={{ background: '#FEF3C7', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>📅</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#92400E' }}>Holiday Conflicts — {conflicts.length} planned date{conflicts.length > 1 ? 's' : ''} fall on a holiday</span>
        <Link href="/date-calculator" style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--accent)', textDecoration: 'none', padding: '2px 8px', border: '1px solid var(--accent-light)', borderRadius: 4 }}>Fix in Date Calculator →</Link>
      </div>
      <div style={{ padding: '8px 14px' }}>
        {conflicts.map((c, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: i < conflicts.length - 1 ? '1px solid var(--border-light)' : 'none', fontSize: 12 }}>
            <span style={{ background: '#FEF3C7', color: '#92400E', padding: '2px 8px', borderRadius: 8, fontWeight: 700, fontSize: 11, flexShrink: 0 }}>{c.dateLabel}</span>
            <span style={{ fontWeight: 700 }}>{c.orderNo}</span>
            <span style={{ color: 'var(--text-secondary)' }}>{c.party}</span>
            <span style={{ color: 'var(--text-tertiary)' }}>— {c.processLabel}</span>
            <span style={{ marginLeft: 'auto', color: '#D97706', fontWeight: 600, flexShrink: 0 }}>🗓 {c.holidayName}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Dashboard Page ─────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const supervisorFilter = useSupervisorFilter()
  const [orders,   setOrders]   = useState<any[]>([])
  const [batches,  setBatches]  = useState<any[]>([])
  const [machines, setMachines] = useState<any[]>([])
  const [lastRefreshed, setLastRefreshed] = useState('')

  const loadDashboard = useCallback(async () => {
    const [oRes, bRes, mRes] = await Promise.all([
      fetch('/api/orders?limit=500',  { cache: 'no-store' }).then(r => r.json()),
      fetch('/api/batches?limit=2000',{ cache: 'no-store' }).then(r => r.json()),
      fetch('/api/machines',          { cache: 'no-store' }).then(r => r.json()),
    ])
    let allOrders: any[] = oRes.data || []
    if (supervisorFilter) allOrders = allOrders.filter((o: any) => o.supervisors?.name === supervisorFilter)
    setOrders(allOrders)
    setBatches(bRes.data || [])
    setMachines(mRes.data || [])
    setLastRefreshed(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }))
  }, [supervisorFilter])

  useEffect(() => {
    loadDashboard()
    const t = setInterval(loadDashboard, 120000)
    window.addEventListener('dyeflow-db-updated', loadDashboard)
    return () => { clearInterval(t); window.removeEventListener('dyeflow-db-updated', loadDashboard) }
  }, [loadDashboard])

  const newCount    = orders.filter(o => o.status === 'new').length
  const inProcess   = orders.filter(o => ['assigned','splitting','in-process'].includes(o.status)).length
  const done        = orders.filter(o => o.status === 'done').length
  const totalKg     = orders.reduce((s, o) => s + (parseFloat(o.qty_kg) || 0), 0)
  const activeBatch = batches.filter(b => b.status === 'in-process').length

  const machineLoad: Record<string, number> = {}
  batches.filter(b => b.status !== 'done').forEach(b => {
    const mn = b.machines?.name || b.machine_id
    if (mn) machineLoad[mn] = (machineLoad[mn] || 0) + (parseFloat(b.kg) || 0)
  })

  return (
    <div className="content">
      <AiInsightsPanel />
      <AnomalyPanel />

      <div style={{ marginBottom: 0 }}>
        <div className="stat-grid">
          <div className="stat-card"><div className="stat-label">New Orders</div><div className="stat-value">{newCount}</div><div className="stat-sub">Awaiting supervisor</div></div>
          <div className="stat-card"><div className="stat-label">In Production</div><div className="stat-value">{inProcess}</div><div className="stat-sub">{activeBatch} active batches</div></div>
          <div className="stat-card"><div className="stat-label">Completed</div><div className="stat-value">{done}</div><div className="stat-sub">This period</div></div>
          <div className="stat-card"><div className="stat-label">Total Fabric</div><div className="stat-value">{Math.round(totalKg).toLocaleString()}</div><div className="stat-sub">Kg across all orders</div></div>
        </div>
        {lastRefreshed && (
          <div style={{ textAlign: 'right', fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4, marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--success)', display: 'inline-block' }} />
            Updated {lastRefreshed} · auto-refreshes every 2 min
            <button onClick={loadDashboard} style={{ fontSize: 11, border: 'none', background: 'none', color: 'var(--accent)', cursor: 'pointer', padding: '1px 4px', borderRadius: 4 }}>↻ Refresh</button>
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: '14px' }}>
        <div className="card">
          <div className="card-header">
            <span className="card-title">Recent Orders</span>
            <Link href="/orders"><button className="small">View All →</button></Link>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Order #</th><th>Party</th><th>Article</th><th>Color</th><th>Qty(Kg)</th><th>Status</th></tr></thead>
              <tbody>
                {orders.slice(0, 5).map(o => (
                  <tr key={o.id}>
                    <td style={{ fontWeight: 600 }}>{o.order_number}</td>
                    <td>{o.party}</td><td>{o.article}</td><td>{o.color}</td><td>{o.qty_kg}</td>
                    <td>{statusBadge(o.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="card">
          <div className="card-header">
            <span className="card-title">Machine Status</span>
            <Link href="/machines"><button className="small">Sheets →</button></Link>
          </div>
          {machines.map(m => {
            const loadKg = machineLoad[m.name] || 0
            const pct = m.capacity ? Math.min(100, Math.round((loadKg / m.capacity) * 100)) : 0
            return (
              <div key={m.id} style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 500 }}>{m.name}</span>
                  <span className={`badge badge-${m.status || 'idle'}`}>{m.status || 'idle'}</span>
                </div>
                <div style={{ background: 'var(--bg-secondary)', borderRadius: 20, height: 6, overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: pct > 80 ? '#E24B4A' : pct > 50 ? '#EF9F27' : '#1D9E75', borderRadius: 20 }} />
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>{Math.round(loadKg)} / {m.capacity} Kg loaded</div>
              </div>
            )
          })}
        </div>
      </div>

      <ProductionHeatmap />
      <HolidayWarnings orders={orders} />

      <div className="card">
        <div className="card-header">
          <span className="card-title">Active Batches</span>
          <Link href="/batches"><button className="small">All Batches →</button></Link>
        </div>
        {batches.filter(b => b.status === 'in-process').length === 0 ? (
          <div className="empty-state">No active batches at this time.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Batch ID</th><th>Order #</th><th>Party</th><th>Color</th><th>Machine</th><th>Current Process</th><th>Status</th></tr></thead>
              <tbody>
                {batches.filter(b => b.status === 'in-process').slice(0, 20).map(b => {
                  const order = orders.find(o => o.id === b.order_id) || {}
                  return (
                    <tr key={b.id}>
                      <td style={{ fontWeight: 600, color: 'var(--accent)' }}>{b.batch_id}</td>
                      <td>{order.order_number || '-'}</td>
                      <td>{order.party || '-'}</td>
                      <td>{order.color || '-'}</td>
                      <td><span className="machine-badge">{b.machines?.name || '-'}</span></td>
                      <td><span className="process-step active">{b.current_process || '-'}</span></td>
                      <td>{statusBadge(b.status)}</td>
                    </tr>
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
