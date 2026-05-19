'use client'

import { useEffect, useState } from 'react'

export default function MobileBatchesPage() {
  const [batches, setBatches] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'active' | 'done' | 'faulty'>('active')

  useEffect(() => { load() }, [])

  const load = () => {
    const raw = localStorage.getItem('dyeflow_db')
    if (!raw) return
    const db = JSON.parse(raw)
    const rows: any[] = []
    ;(db.orders || []).forEach((o: any) => {
      ;(o.splits || []).forEach((b: any) => {
        rows.push({
          batchId: b.batchId || '-',
          orderId: o.id,
          orderNo: o.orderNumber || '-',
          party: o.party || '-',
          article: o.article || '-',
          color: o.color || '-',
          kg: b.kg || o.qtyKg || '-',
          supervisor: o.supervisor || '-',
          status: b.status || 'pending',
          currentProcess: b.fmsCurrentProcess || '-',
          isFaulty: !!(b.fmsFaulty?.active),
          isDone: b.status === 'done' || b.fmsDone,
        })
      })
    })
    setBatches(rows.sort((a, b) => (a.isDone ? 1 : 0) - (b.isDone ? 1 : 0)))
  }

  const filtered = batches.filter(b => {
    const s = search.toLowerCase().trim()
    const matchSearch = !s || b.batchId.toLowerCase().includes(s) || b.orderNo.toLowerCase().includes(s) || b.party.toLowerCase().includes(s) || b.color.toLowerCase().includes(s) || b.supervisor.toLowerCase().includes(s)
    const matchFilter =
      filter === 'all' ? true :
      filter === 'active' ? (!b.isDone && !b.isFaulty) :
      filter === 'done' ? b.isDone :
      filter === 'faulty' ? b.isFaulty : true
    return matchSearch && matchFilter
  })

  const statusColor = (b: any) => {
    if (b.isFaulty) return '#EF4444'
    if (b.isDone) return '#059669'
    return '#185FA5'
  }

  const statusLabel = (b: any) => {
    if (b.isFaulty) return '⚠ Faulty'
    if (b.isDone) return '✓ Done'
    return b.currentProcess && b.currentProcess !== '-' ? `⚙ ${b.currentProcess}` : '● Pending'
  }

  const counts = {
    all: batches.length,
    active: batches.filter(b => !b.isDone && !b.isFaulty).length,
    done: batches.filter(b => b.isDone).length,
    faulty: batches.filter(b => b.isFaulty).length,
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F1F5F9' }}>
      {/* Header */}
      <div style={{ background: '#7C3AED', padding: '16px 16px 0', position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>Batch Tracker</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>{filtered.length} of {batches.length} batches</div>
          </div>
          <button onClick={load} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', borderRadius: 8, padding: '6px 12px', fontSize: 13 }}>↻</button>
        </div>
        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: 6, paddingBottom: 12 }}>
          {(['active', 'all', 'done', 'faulty'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{ flexShrink: 0, padding: '5px 12px', borderRadius: 20, border: 'none', fontSize: 12, fontWeight: 600, background: filter === f ? '#fff' : 'rgba(255,255,255,0.15)', color: filter === f ? '#7C3AED' : '#fff', cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}>
              {f.charAt(0).toUpperCase() + f.slice(1)} ({counts[f]})
            </button>
          ))}
        </div>
      </div>

      {/* Search */}
      <div style={{ padding: '10px 12px 6px' }}>
        <div style={{ position: 'relative' }}>
          <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }}>🔍</span>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Batch ID, order, party, color…" style={{ width: '100%', padding: '11px 12px 11px 36px', fontSize: 14, border: '1px solid #E2E8F0', borderRadius: 10, background: '#fff', outline: 'none', boxSizing: 'border-box' }} />
        </div>
      </div>

      {/* Batch list */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#94A3B8' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📦</div>
          <div>No batches found</div>
        </div>
      ) : (
        <div style={{ padding: '4px 12px 8px' }}>
          {filtered.map(b => (
            <div key={b.batchId} style={{ background: b.isDone ? '#F0FDF4' : b.isFaulty ? '#FEF2F2' : '#fff', borderRadius: 12, marginBottom: 8, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', borderLeft: `4px solid ${statusColor(b)}` }}>
              <div style={{ padding: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: statusColor(b) }}>{b.batchId}</div>
                    <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>{b.orderNo} · {b.party}</div>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, background: b.isDone ? '#D1FAE5' : b.isFaulty ? '#FEE2E2' : '#DBEAFE', color: statusColor(b), padding: '4px 10px', borderRadius: 20, whiteSpace: 'nowrap', flexShrink: 0 }}>
                    {statusLabel(b)}
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px', fontSize: 12, color: '#64748B' }}>
                  <div><span style={{ color: '#94A3B8' }}>Article </span>{b.article}</div>
                  <div><span style={{ color: '#94A3B8' }}>Color </span>{b.color}</div>
                  <div><span style={{ color: '#94A3B8' }}>Qty </span><strong style={{ color: '#1A1A18' }}>{b.kg} Kg</strong></div>
                  <div><span style={{ color: '#94A3B8' }}>Supervisor </span>{b.supervisor}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
