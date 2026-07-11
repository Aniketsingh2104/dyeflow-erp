'use client'

import { useEffect, useState, useCallback } from 'react'
import { fetchProcessList, ProcessDef } from '@/lib/processMap'
import Link from 'next/link'

interface KanbanCard {
  batchId: string
  orderId: string
  orderNo: string
  party: string
  article: string
  color: string
  kg: string
  supervisor: string
  machine: string
  isFaulty: boolean
  plannedDate: string
  daysLeft: number | null
}

interface KanbanColumn {
  code: string
  name: string
  cards: KanbanCard[]
}

const STATUS_COLORS = {
  overdue: { bg: '#FEF2F2', border: '#FCA5A5' },
  urgent:  { bg: '#FEF3C7', border: '#FCD34D' },
  normal:  { bg: '#EFF6FF', border: '#BFDBFE' },
}

function getUrgency(daysLeft: number | null) {
  if (daysLeft === null) return 'normal' as const
  if (daysLeft < 0) return 'overdue' as const
  if (daysLeft <= 2) return 'urgent' as const
  return 'normal' as const
}

export default function ProductionPage() {
  const [columns,     setColumns]     = useState<KanbanColumn[]>([])
  const [unstarted,   setUnstarted]   = useState<KanbanCard[]>([])
  const [stats,       setStats]       = useState({ total: 0, overdue: 0, active: 0 })
  const [search,      setSearch]      = useState('')
  const [view,        setView]        = useState<'kanban'|'list'>('kanban')
  const [lastRefresh, setLastRefresh] = useState('')
  const [loading,     setLoading]     = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [processList, oRes, bRes] = await Promise.all([
        fetchProcessList(),
        fetch('/api/orders?limit=1000', { cache: 'no-store' }).then(r => r.json()),
        fetch('/api/batches?limit=5000', { cache: 'no-store' }).then(r => r.json()),
      ])

      const orders: any[]  = oRes.data  || []
      const batches: any[] = bRes.data  || []

      const enabled = processList.filter(p => p.enabled).sort((a, b) => a.order - b.order)
      const orderMap: Record<string, any> = {}
      for (const o of orders) orderMap[o.id] = o

      const now = new Date()
      const colMap: Record<string, KanbanCard[]> = {}
      enabled.forEach(p => { colMap[p.code] = [] })

      let total = 0, overdue = 0, active = 0
      const unstartedCards: KanbanCard[] = []

      for (const b of batches) {
        if (b.status === 'done') continue
        total++
        const order = orderMap[b.order_id] || {}
        const dispatchDate = (order.planned_dates || {})['Dispatch'] || ''
        let daysLeft: number | null = null
        if (dispatchDate) {
          const d = new Date(dispatchDate)
          if (!isNaN(d.getTime())) {
            daysLeft = Math.round((d.getTime() - now.getTime()) / 86400000)
            if (daysLeft < 0) overdue++
          }
        }

        const card: KanbanCard = {
          batchId:     b.batch_id || '-',
          orderId:     b.order_id || '-',
          orderNo:     order.order_number || '-',
          party:       order.party || '-',
          article:     order.article || '-',
          color:       order.color || '-',
          kg:          String(b.kg || '-'),
          supervisor:  order.supervisors?.name || '-',
          machine:     b.machines?.name || '-',
          isFaulty:    !!b.is_faulty,
          plannedDate: dispatchDate,
          daysLeft,
        }

        const cur = b.current_process
        if (cur && colMap[cur] !== undefined) {
          colMap[cur].push(card)
          active++
        } else if (b.status === 'in-process') {
          // in FMS but process not in list
          const firstEnabled = enabled[0]?.code
          if (firstEnabled && colMap[firstEnabled]) {
            colMap[firstEnabled].push(card)
            active++
          } else {
            unstartedCards.push(card)
          }
        } else {
          unstartedCards.push(card)
        }
      }

      setColumns(enabled.map(p => ({ code: p.code, name: p.name, cards: colMap[p.code] || [] })))
      setUnstarted(unstartedCards)
      setStats({ total, overdue, active })
      setLastRefresh(now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }))
    } finally { setLoading(false) }
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(load, 60000)
    return () => clearInterval(t)
  }, [load])

  const filtered = (cards: KanbanCard[]) => {
    if (!search.trim()) return cards
    const s = search.toLowerCase()
    return cards.filter(c =>
      c.batchId.toLowerCase().includes(s) || c.orderNo.toLowerCase().includes(s) ||
      c.party.toLowerCase().includes(s) || c.color.toLowerCase().includes(s) || c.supervisor.toLowerCase().includes(s)
    )
  }

  const Card = ({ card }: { card: KanbanCard }) => {
    const u = getUrgency(card.daysLeft)
    const c = STATUS_COLORS[u]
    return (
      <div style={{ background: card.isFaulty ? '#FFF1F2' : c.bg, border: `1px solid ${card.isFaulty ? '#FCA5A5' : c.border}`, borderRadius: 8, padding: '10px 12px', marginBottom: 8, position: 'relative' }}>
        {card.isFaulty && <div style={{ position: 'absolute', top: 6, right: 8, fontSize: 11, fontWeight: 700, color: '#DC2626' }}>⚠ FAULTY</div>}
        <div style={{ fontSize: 13, fontWeight: 700, color: '#185FA5', marginBottom: 4 }}>{card.batchId}</div>
        <div style={{ fontSize: 11, color: '#64748B', marginBottom: 6 }}>{card.orderNo} · {card.party}</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 8px', fontSize: 11, color: '#475569' }}>
          <div><span style={{ color: '#94A3B8' }}>Color </span>{card.color}</div>
          <div><span style={{ color: '#94A3B8' }}>Kg </span><strong>{card.kg}</strong></div>
          <div><span style={{ color: '#94A3B8' }}>Sup. </span>{card.supervisor}</div>
          {card.daysLeft !== null && (
            <div style={{ color: card.daysLeft < 0 ? '#DC2626' : card.daysLeft <= 2 ? '#D97706' : '#059669', fontWeight: 600 }}>
              {card.daysLeft < 0 ? `${Math.abs(card.daysLeft)}d overdue` : `${card.daysLeft}d left`}
            </div>
          )}
        </div>
      </div>
    )
  }

  const totalActive = columns.reduce((s, c) => s + c.cards.length, 0)

  return (
    <div className="content" style={{ maxWidth: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 600 }}>Production Kanban</div>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>
            {stats.total} batches · {stats.active} active ·
            {stats.overdue > 0 && <span style={{ color: '#DC2626', fontWeight: 600 }}> {stats.overdue} overdue ·</span>}
            {' '}refreshed {lastRefresh}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Filter batches…" style={{ width: 180, fontSize: 12 }} />
          <div style={{ display: 'flex', border: '1px solid var(--border-medium)', borderRadius: 6, overflow: 'hidden' }}>
            {(['kanban','list'] as const).map(v => (
              <button key={v} onClick={() => setView(v)} style={{ padding: '5px 12px', fontSize: 12, border: 'none', borderRadius: 0, background: view === v ? 'var(--accent)' : 'var(--bg-primary)', color: view === v ? '#fff' : 'var(--text-secondary)', fontWeight: view === v ? 600 : 400 }}>
                {v === 'kanban' ? '⊞ Kanban' : '☰ List'}
              </button>
            ))}
          </div>
          <button className="small" onClick={load} disabled={loading}>{loading ? '…' : '↻ Refresh'}</button>
          <Link href="/batches"><button className="small">All Batches →</button></Link>
        </div>
      </div>

      {stats.overdue > 0 && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 8, padding: '10px 14px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 18 }}>⚠️</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#991B1B' }}>
            {stats.overdue} batch{stats.overdue !== 1 ? 'es' : ''} past planned dispatch date
          </span>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-tertiary)' }}>Loading production data…</div>
      ) : view === 'kanban' ? (
        <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 12, alignItems: 'flex-start' }}>
          {unstarted.length > 0 && (
            <div style={{ flexShrink: 0, width: 200, background: 'var(--bg-secondary)', borderRadius: 10, padding: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                Not Started <span style={{ background: 'var(--bg-primary)', borderRadius: 20, padding: '1px 7px', marginLeft: 4 }}>{filtered(unstarted).length}</span>
              </div>
              {filtered(unstarted).map(card => <Card key={card.batchId} card={card} />)}
            </div>
          )}
          {columns.map(col => {
            const cards = filtered(col.cards)
            if (cards.length === 0 && !search) return null
            return (
              <div key={col.code} style={{ flexShrink: 0, width: 210, background: 'var(--bg-secondary)', borderRadius: 10, padding: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700 }}>{col.name}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{col.code}</div>
                  </div>
                  <span style={{ background: cards.length > 0 ? 'var(--accent)' : 'var(--bg-primary)', color: cards.length > 0 ? '#fff' : 'var(--text-tertiary)', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20 }}>
                    {cards.length}
                  </span>
                </div>
                {cards.length === 0
                  ? <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textAlign: 'center', padding: '20px 0' }}>—</div>
                  : cards.map(card => <Card key={card.batchId} card={card} />)
                }
              </div>
            )
          })}
        </div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrap">
            <table style={{ minWidth: 800 }}>
              <thead>
                <tr><th>BATCH</th><th>ORDER #</th><th>PARTY</th><th>COLOR</th><th>KG</th><th>CURRENT PROCESS</th><th>SUPERVISOR</th><th>DAYS LEFT</th><th>STATUS</th></tr>
              </thead>
              <tbody>
                {columns.flatMap(col => filtered(col.cards).map(card => (
                  <tr key={card.batchId}>
                    <td style={{ fontWeight: 700, color: 'var(--accent)' }}>{card.batchId}</td>
                    <td>{card.orderNo}</td><td>{card.party}</td><td>{card.color}</td>
                    <td style={{ fontWeight: 600 }}>{card.kg}</td>
                    <td><span style={{ background: 'var(--accent-light)', color: 'var(--accent-dark)', padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 700 }}>{col.name}</span></td>
                    <td>{card.supervisor}</td>
                    <td style={{ fontWeight: 600, color: card.daysLeft === null ? 'var(--text-tertiary)' : card.daysLeft < 0 ? '#DC2626' : card.daysLeft <= 2 ? '#D97706' : '#059669' }}>
                      {card.daysLeft === null ? '—' : card.daysLeft < 0 ? `${Math.abs(card.daysLeft)}d overdue` : `${card.daysLeft}d`}
                    </td>
                    <td>{card.isFaulty ? <span style={{ color: '#DC2626', fontWeight: 600 }}>⚠ Faulty</span> : <span style={{ color: '#059669' }}>Active</span>}</td>
                  </tr>
                )))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {totalActive === 0 && unstarted.length === 0 && !loading && (
        <div className="card">
          <div className="empty-state" style={{ padding: 60 }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>🏭</div>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>No active batches in production</div>
            <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>Split orders and send batches to FMS to see them here.</div>
          </div>
        </div>
      )}
    </div>
  )
}
