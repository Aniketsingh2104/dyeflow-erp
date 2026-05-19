'use client'

import { useEffect, useState, useCallback } from 'react'
import { loadOrSeedProcessList } from '@/lib/processMap'
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

const STATUS_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  overdue:  { bg: '#FEF2F2', border: '#FCA5A5', text: '#991B1B' },
  urgent:   { bg: '#FEF3C7', border: '#FCD34D', text: '#92400E' },
  normal:   { bg: '#EFF6FF', border: '#BFDBFE', text: '#1E40AF' },
  done:     { bg: '#F0FDF4', border: '#86EFAC', text: '#166534' },
}

function getCardUrgency(daysLeft: number | null): keyof typeof STATUS_COLORS {
  if (daysLeft === null) return 'normal'
  if (daysLeft < 0) return 'overdue'
  if (daysLeft <= 2) return 'urgent'
  return 'normal'
}

export default function ProductionPage() {
  const [columns, setColumns] = useState<KanbanColumn[]>([])
  const [unstarted, setUnstarted] = useState<any[]>([])
  const [stats, setStats] = useState({ totalBatches: 0, overdue: 0, active: 0 })
  const [search, setSearch] = useState('')
  const [view, setView] = useState<'kanban' | 'list'>('kanban')
  const [lastRefresh, setLastRefresh] = useState('')

  useEffect(() => {
    load()
    const t = setInterval(load, 60000)
    return () => clearInterval(t)
  }, [])

  const load = useCallback(() => {
    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return
    const db = JSON.parse(stored)
    const processList = loadOrSeedProcessList()
      .filter(p => p.enabled)
      .sort((a, b) => a.order - b.order)

    const now = new Date()
    const colMap: Record<string, KanbanCard[]> = {}
    processList.forEach(p => { colMap[p.code] = [] })

    let totalBatches = 0, overdue = 0, active = 0
    const unstartedBatches: any[] = []

    ;(db.orders || []).forEach((order: any) => {
      ;(order.splits || []).forEach((batch: any) => {
        if (batch.status === 'done' || batch.fmsDone) return
        totalBatches++

        // Planned dispatch date
        const dispatchDateStr = order.plannedDates?.['Dispatch'] || batch.dateCalcPlan?.['Dispatch'] || ''
        let daysLeft: number | null = null
        if (dispatchDateStr) {
          const d = new Date(dispatchDateStr)
          if (!isNaN(d.getTime())) {
            daysLeft = Math.round((d.getTime() - now.getTime()) / 86400000)
            if (daysLeft < 0) overdue++
          }
        }

        const card: KanbanCard = {
          batchId: batch.batchId || '-',
          orderId: order.id,
          orderNo: order.orderNumber || '-',
          party: order.party || '-',
          article: order.article || '-',
          color: order.color || '-',
          kg: batch.kg || order.qtyKg || '-',
          supervisor: order.supervisor || '-',
          machine: batch.machine || order.machine || '-',
          isFaulty: !!(batch.fmsFaulty?.active),
          plannedDate: dispatchDateStr,
          daysLeft,
        }

        const currentProcess = batch.fmsCurrentProcess || ''
        if (currentProcess && colMap[currentProcess] !== undefined) {
          colMap[currentProcess].push(card)
          active++
        } else if (batch.fmsDispatch && Object.keys(batch.fmsDispatch).length > 0) {
          // In FMS but process not in current list — put in first matching col
          const firstSentCode = Object.keys(batch.fmsDispatch)[0]
          if (colMap[firstSentCode]) {
            colMap[firstSentCode].push(card)
            active++
          } else {
            unstartedBatches.push(card)
          }
        } else {
          unstartedBatches.push(card)
        }
      })
    })

    setColumns(processList.map(p => ({ code: p.code, name: p.name, cards: colMap[p.code] || [] })))
    setUnstarted(unstartedBatches)
    setStats({ totalBatches, overdue, active })
    setLastRefresh(now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }))
  }, [])

  const filtered = (cards: KanbanCard[]) => {
    if (!search.trim()) return cards
    const s = search.toLowerCase()
    return cards.filter(c =>
      c.batchId.toLowerCase().includes(s) ||
      c.orderNo.toLowerCase().includes(s) ||
      c.party.toLowerCase().includes(s) ||
      c.color.toLowerCase().includes(s) ||
      c.supervisor.toLowerCase().includes(s)
    )
  }

  const Card = ({ card }: { card: KanbanCard }) => {
    const urgency = getCardUrgency(card.daysLeft)
    const c = STATUS_COLORS[urgency]
    return (
      <div style={{
        background: card.isFaulty ? '#FFF1F2' : c.bg,
        border: `1px solid ${card.isFaulty ? '#FCA5A5' : c.border}`,
        borderRadius: 8,
        padding: '10px 12px',
        marginBottom: 8,
        cursor: 'default',
        position: 'relative',
      }}>
        {card.isFaulty && (
          <div style={{ position: 'absolute', top: 6, right: 8, fontSize: 11, fontWeight: 700, color: '#DC2626' }}>⚠ FAULTY</div>
        )}
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
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 600 }}>Production Kanban</div>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>
            {stats.totalBatches} batches · {stats.active} active · {stats.overdue > 0 && <span style={{ color: '#DC2626', fontWeight: 600 }}>{stats.overdue} overdue · </span>}
            refreshed {lastRefresh}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Filter batches…"
            style={{ width: 180, fontSize: 12 }}
          />
          <div style={{ display: 'flex', border: '1px solid var(--border-medium)', borderRadius: 6, overflow: 'hidden' }}>
            {(['kanban', 'list'] as const).map(v => (
              <button key={v} onClick={() => setView(v)} style={{ padding: '5px 12px', fontSize: 12, border: 'none', borderRadius: 0, background: view === v ? 'var(--accent)' : 'var(--bg-primary)', color: view === v ? '#fff' : 'var(--text-secondary)', fontWeight: view === v ? 600 : 400 }}>
                {v === 'kanban' ? '⊞ Kanban' : '☰ List'}
              </button>
            ))}
          </div>
          <button className="small" onClick={load}>↻ Refresh</button>
          <Link href="/batches"><button className="small">All Batches →</button></Link>
        </div>
      </div>

      {/* Overdue alert */}
      {stats.overdue > 0 && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 8, padding: '10px 14px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 18 }}>⚠️</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#991B1B' }}>
            {stats.overdue} batch{stats.overdue !== 1 ? 'es' : ''} past planned dispatch date
          </span>
        </div>
      )}

      {/* ── KANBAN VIEW ── */}
      {view === 'kanban' && (
        <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 12, alignItems: 'flex-start' }}>
          {/* Unstarted column */}
          {unstarted.length > 0 && (
            <div style={{ flexShrink: 0, width: 200, background: 'var(--bg-secondary)', borderRadius: 10, padding: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                Not Started <span style={{ background: 'var(--bg-primary)', borderRadius: 20, padding: '1px 7px', marginLeft: 4 }}>{filtered(unstarted).length}</span>
              </div>
              {filtered(unstarted).map(card => <Card key={card.batchId} card={card} />)}
            </div>
          )}

          {/* Process columns */}
          {columns.map(col => {
            const cards = filtered(col.cards)
            if (cards.length === 0 && !search) return null
            return (
              <div key={col.code} style={{ flexShrink: 0, width: 210, background: 'var(--bg-secondary)', borderRadius: 10, padding: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{col.name}</div>
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
      )}

      {/* ── LIST VIEW ── */}
      {view === 'list' && (
        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrap">
            <table style={{ minWidth: 800 }}>
              <thead>
                <tr>
                  <th>BATCH</th><th>ORDER #</th><th>PARTY</th><th>COLOR</th><th>KG</th>
                  <th>CURRENT PROCESS</th><th>SUPERVISOR</th><th>DAYS LEFT</th><th>STATUS</th>
                </tr>
              </thead>
              <tbody>
                {columns.flatMap(col =>
                  filtered(col.cards).map(card => (
                    <tr key={card.batchId}>
                      <td style={{ fontWeight: 700, color: 'var(--accent)' }}>{card.batchId}</td>
                      <td>{card.orderNo}</td>
                      <td>{card.party}</td>
                      <td>{card.color}</td>
                      <td style={{ fontWeight: 600 }}>{card.kg}</td>
                      <td><span style={{ background: 'var(--accent-light)', color: 'var(--accent-dark)', padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 700 }}>{col.name}</span></td>
                      <td>{card.supervisor}</td>
                      <td style={{ fontWeight: 600, color: card.daysLeft === null ? 'var(--text-tertiary)' : card.daysLeft < 0 ? '#DC2626' : card.daysLeft <= 2 ? '#D97706' : '#059669' }}>
                        {card.daysLeft === null ? '—' : card.daysLeft < 0 ? `${Math.abs(card.daysLeft)}d overdue` : `${card.daysLeft}d`}
                      </td>
                      <td>{card.isFaulty ? <span style={{ color: '#DC2626', fontWeight: 600 }}>⚠ Faulty</span> : <span style={{ color: '#059669' }}>Active</span>}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {totalActive === 0 && unstarted.length === 0 && (
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
