'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'

function fmt(n: number) { return n.toLocaleString('en-IN', { maximumFractionDigits: 1 }) }
function fmtDate(s: string) {
  if (!s) return '—'
  try { return new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) } catch { return s }
}

const STATUS_COLOR: Record<string, string> = {
  new: '#D97706', assigned: '#185FA5', splitting: '#7C3AED',
  'in-process': '#185FA5', done: '#1D9E75', hold: '#DC2626',
}
const STATUS_BG: Record<string, string> = {
  new: '#FEF3C7', assigned: '#EFF6FF', splitting: '#EDE9FE',
  'in-process': '#EFF6FF', done: '#D1FAE5', hold: '#FEE2E2',
}

export default function PartyPage() {
  const params    = useParams()
  const router    = useRouter()
  const partyName = decodeURIComponent(String(params?.name || ''))

  const [orders,      setOrders]      = useState<any[]>([])
  const [faulty,      setFaulty]      = useState<any[]>([])
  const [loading,     setLoading]     = useState(true)
  const [activeTab,   setActiveTab]   = useState<'overview'|'orders'>('overview')
  const [searchOrder, setSearchOrder] = useState('')

  const load = useCallback(async () => {
    if (!partyName) return
    setLoading(true)
    try {
      // Fetch orders for this party
      const [oRes, bRes] = await Promise.all([
        fetch(`/api/orders?limit=500`, { cache: 'no-store' }).then(r => r.json()),
        fetch(`/api/batches?limit=5000`, { cache: 'no-store' }).then(r => r.json()),
      ])

      const allOrders: any[] = (oRes.data || []).filter((o: any) =>
        (o.party || '').toLowerCase() === partyName.toLowerCase()
      )
      const allBatches: any[] = bRes.data || []

      // Attach batches to orders as splits-compatible format
      const batchByOrder: Record<string, any[]> = {}
      for (const b of allBatches) {
        if (!batchByOrder[b.order_id]) batchByOrder[b.order_id] = []
        batchByOrder[b.order_id].push({
          batchId: b.batch_id, kg: b.kg, status: b.status,
          fmsCurrentProcess: b.current_process, fmsDone: b.status === 'done',
        })
      }

      const shaped = allOrders.map(o => ({
        id:           o.id,
        orderNumber:  o.order_number,
        party:        o.party,
        article:      o.article,
        color:        o.color,
        qtyKg:        o.qty_kg,
        status:       o.status,
        supervisor:   o.supervisors?.name || '',
        machine:      o.machines?.name || '',
        plannedDates: o.planned_dates || {},
        holdReason:   o.hold_reason || '',
        timestamp:    o.created_at,
        splits:       batchByOrder[o.id] || [],
      })).sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime())

      setOrders(shaped)
      setFaulty([]) // faulty by party — would need a separate query; skipping for now
    } finally { setLoading(false) }
  }, [partyName])

  useEffect(() => { load() }, [load])

  // ── Compute stats ────────────────────────────────────────────────────────
  const totalKg       = orders.reduce((s, o) => s + (parseFloat(o.qtyKg) || 0), 0)
  const completedOrders = orders.filter(o => o.status === 'done')
  const completedKg   = completedOrders.reduce((s, o) => s + (parseFloat(o.qtyKg) || 0), 0)
  const completionRate = totalKg > 0 ? Math.round((completedKg / totalKg) * 100) : 0
  const pendingOrders  = orders.filter(o => !['done','hold'].includes(o.status)).length

  const delays: number[] = []
  for (const o of completedOrders) {
    const planned = (o.plannedDates || {})['Dispatch'] || ''
    const actual  = o.timestamp || ''
    if (planned && actual) {
      const diff = (new Date(actual).getTime() - new Date(planned).getTime()) / 86400000
      if (!isNaN(diff)) delays.push(diff)
    }
  }
  const avgDelayDays = delays.length > 0
    ? Math.round(delays.reduce((s, d) => s + d, 0) / delays.length * 10) / 10
    : null

  const articles    = [...new Set(orders.map(o => o.article).filter(Boolean))] as string[]
  const supervisors = [...new Set(orders.map(o => o.supervisor).filter(Boolean))] as string[]
  const timestamps  = orders.map(o => o.timestamp).filter(Boolean).sort()
  const firstOrder  = timestamps[0] || ''
  const lastOrder   = timestamps[timestamps.length - 1] || ''

  const statusBreakdown: Record<string, number> = {}
  orders.forEach(o => { statusBreakdown[o.status || 'new'] = (statusBreakdown[o.status || 'new'] || 0) + 1 })

  const totalBatches = orders.reduce((s, o) => s + (o.splits || []).length, 0)
  const faultyRate   = totalBatches > 0 ? Math.round((faulty.length / totalBatches) * 100) : 0

  const filteredOrders = orders.filter(o =>
    !searchOrder.trim() ||
    [o.orderNumber, o.article, o.color, o.supervisor, o.status].some(v =>
      String(v || '').toLowerCase().includes(searchOrder.toLowerCase())
    )
  )

  const Stat = ({ label, value, sub, color }: { label: string; value: string|number; sub?: string; color?: string }) => (
    <div style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: '12px 14px' }}>
      <div style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: color || 'var(--text-primary)', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 3 }}>{sub}</div>}
    </div>
  )

  const tabStyle = (t: string) => ({
    padding: '6px 14px', fontSize: 13, fontWeight: activeTab === t ? 600 : 400,
    border: 'none', borderRadius: 6, cursor: 'pointer',
    background: activeTab === t ? 'var(--accent)' : 'var(--bg-secondary)',
    color: activeTab === t ? '#fff' : 'var(--text-secondary)',
  })

  if (loading) return (
    <div className="content" style={{ textAlign: 'center', padding: 80 }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
      <div style={{ fontSize: 14, color: 'var(--text-tertiary)' }}>Loading party data from Supabase…</div>
    </div>
  )

  return (
    <div className="content" style={{ maxWidth: 1000, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>{partyName}</div>
          <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 2 }}>
            Party / Customer · First order {fmtDate(firstOrder)} · Last order {fmtDate(lastOrder)}
          </div>
          {articles.length > 0 && (
            <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {articles.map(a => (
                <span key={a} style={{ background: 'var(--bg-secondary)', padding: '2px 8px', borderRadius: 12, fontSize: 11, color: 'var(--text-secondary)', fontWeight: 500 }}>{a}</span>
              ))}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="small" onClick={() => router.back()}>← Back</button>
          <Link href="/orders"><button className="small">All Orders</button></Link>
        </div>
      </div>

      {orders.length === 0 ? (
        <div className="card">
          <div className="empty-state" style={{ padding: '48px' }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>🏭</div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>No orders found for "{partyName}"</div>
            <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 4 }}>This party has no orders in the system yet.</div>
          </div>
        </div>
      ) : (
        <>
          {/* Tabs */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
            <button style={tabStyle('overview')} onClick={() => setActiveTab('overview')}>📊 Overview</button>
            <button style={tabStyle('orders')} onClick={() => setActiveTab('orders')}>📋 All Orders ({orders.length})</button>
          </div>

          {activeTab === 'overview' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10, marginBottom: 14 }}>
                <Stat label="Total Orders"   value={orders.length} />
                <Stat label="Total Kg"       value={`${fmt(totalKg)} Kg`}       color="var(--accent)" />
                <Stat label="Kg Completed"   value={`${fmt(completedKg)} Kg`}   color="var(--success)" sub={`${completionRate}% done`} />
                <Stat label="Pending"        value={pendingOrders}               color={pendingOrders > 0 ? 'var(--warning)' : undefined} sub="in production" />
                <Stat label="Avg Delay"
                  value={avgDelayDays === null ? '—' : avgDelayDays > 0 ? `+${avgDelayDays}d` : `${avgDelayDays}d`}
                  color={avgDelayDays !== null && avgDelayDays > 0 ? 'var(--danger)' : avgDelayDays !== null ? 'var(--success)' : undefined}
                  sub="vs planned dispatch" />
                <Stat label="Faulty Rate"   value={`${faultyRate}%`} color={faultyRate > 5 ? 'var(--danger)' : undefined} sub={`${faulty.length} records`} />
              </div>

              {/* Completion bar */}
              <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: 10, padding: '14px 16px', marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
                  <span>Completion rate</span>
                  <span style={{ color: 'var(--accent)' }}>{completionRate}%</span>
                </div>
                <div style={{ background: 'var(--bg-secondary)', borderRadius: 20, height: 10, overflow: 'hidden' }}>
                  <div style={{ width: `${completionRate}%`, height: '100%', background: 'var(--accent)', borderRadius: 20, transition: 'width 0.4s' }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-tertiary)', marginTop: 5 }}>
                  <span>{fmt(completedKg)} Kg done</span>
                  <span>{fmt(totalKg - completedKg)} Kg remaining</span>
                </div>
              </div>

              {/* Status breakdown */}
              <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: 10, padding: '14px 16px', marginBottom: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Order Status Breakdown</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {Object.entries(statusBreakdown).sort(([,a],[,b]) => b-a).map(([status, count]) => (
                    <div key={status} style={{ background: STATUS_BG[status] || '#F3F4F6', color: STATUS_COLOR[status] || '#6B7280', padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700 }}>
                      {count} {status}
                    </div>
                  ))}
                </div>
              </div>

              {/* Supervisors */}
              {supervisors.length > 0 && (
                <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: 10, padding: '14px 16px' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Supervisors who handled orders</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {supervisors.map(s => (
                      <Link key={s} href={`/supervisor/${encodeURIComponent(s)}`} style={{ textDecoration: 'none' }}>
                        <span style={{ background: 'var(--accent-light)', color: 'var(--accent-dark)', padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>{s}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {activeTab === 'orders' && (
            <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', gap: 10 }}>
                <input value={searchOrder} onChange={e => setSearchOrder(e.target.value)}
                  placeholder="Filter by order #, article, color, status…"
                  style={{ flex: 1, maxWidth: 300, fontSize: 12, padding: '6px 10px' }} />
                <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{filteredOrders.length} of {orders.length}</span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-secondary)' }}>
                      {['ORDER #','DATE','ARTICLE','COLOR','QTY KG','SUPERVISOR','STATUS','PLANNED DISPATCH','ACTION'].map(h => (
                        <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border-light)', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOrders.map((o, i) => {
                      const pd = (o.plannedDates || {})['Dispatch']
                      const isOverdue = pd && new Date(pd) < new Date() && o.status !== 'done'
                      return (
                        <tr key={o.id} style={{ borderBottom: '1px solid var(--border-light)', background: i%2===0 ? 'var(--bg-primary)' : 'var(--bg-secondary)' }}>
                          <td style={{ padding: '8px 10px', fontWeight: 700, color: 'var(--accent)' }}>{o.orderNumber}</td>
                          <td style={{ padding: '8px 10px', color: 'var(--text-tertiary)', fontSize: 11 }}>{fmtDate(o.timestamp)}</td>
                          <td style={{ padding: '8px 10px', fontWeight: 500 }}>{o.article}</td>
                          <td style={{ padding: '8px 10px' }}>{o.color}</td>
                          <td style={{ padding: '8px 10px', fontWeight: 700 }}>{o.qtyKg}</td>
                          <td style={{ padding: '8px 10px', color: 'var(--text-secondary)' }}>{o.supervisor || '—'}</td>
                          <td style={{ padding: '8px 10px' }}>
                            <span style={{ background: STATUS_BG[o.status] || '#F3F4F6', color: STATUS_COLOR[o.status] || '#6B7280', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700 }}>
                              {o.status}
                            </span>
                          </td>
                          <td style={{ padding: '8px 10px', fontSize: 11, color: isOverdue ? 'var(--danger)' : 'var(--text-secondary)' }}>
                            {pd ? fmtDate(pd) : '—'}
                            {isOverdue && <span style={{ marginLeft: 4, fontWeight: 600 }}> ⚠</span>}
                          </td>
                          <td style={{ padding: '8px 10px' }}>
                            <Link href="/orders" style={{ fontSize: 11, color: 'var(--accent)', textDecoration: 'none' }}>View →</Link>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
