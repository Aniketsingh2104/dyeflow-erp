'use client'

import { useEffect, useState } from 'react'

export default function MobileOrdersPage() {
  const [orders, setOrders] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => { load() }, [])

  const load = () => {
    const raw = localStorage.getItem('dyeflow_db')
    if (!raw) return
    const db = JSON.parse(raw)
    setOrders([...(db.orders || [])].reverse())
  }

  const statuses = ['all', 'new', 'assigned', 'in-process', 'done', 'hold']
  const statusCfg: Record<string, { bg: string; color: string; border: string }> = {
    new:          { bg: '#FEF3C7', color: '#92400E', border: '#FDE68A' },
    assigned:     { bg: '#DBEAFE', color: '#1E40AF', border: '#BFDBFE' },
    'in-process': { bg: '#EDE9FE', color: '#5B21B6', border: '#DDD6FE' },
    splitting:    { bg: '#EDE9FE', color: '#5B21B6', border: '#DDD6FE' },
    done:         { bg: '#D1FAE5', color: '#065F46', border: '#A7F3D0' },
    hold:         { bg: '#FCE7F3', color: '#9D174D', border: '#FBCFE8' },
  }

  const counts: Record<string, number> = { all: orders.length }
  orders.forEach(o => { counts[o.status] = (counts[o.status] || 0) + 1 })

  const filtered = orders.filter(o => {
    const s = search.toLowerCase().trim()
    const matchS = !s || (o.orderNumber || '').toLowerCase().includes(s) || (o.party || '').toLowerCase().includes(s) || (o.color || '').toLowerCase().includes(s) || (o.article || '').toLowerCase().includes(s)
    const matchF = statusFilter === 'all' || o.status === statusFilter
    return matchS && matchF
  })

  return (
    <div style={{ minHeight: '100vh', background: '#F1F5F9' }}>
      {/* Header */}
      <div style={{ background: '#059669', padding: '16px 16px 0', position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>Orders</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>{filtered.length} shown</div>
          </div>
          <button onClick={load} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', borderRadius: 8, padding: '6px 12px', fontSize: 13 }}>↻</button>
        </div>
        {/* Status filter scroll */}
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 12, WebkitOverflowScrolling: 'touch' }}>
          {statuses.map(s => (
            <button key={s} onClick={() => setStatusFilter(s)} style={{ flexShrink: 0, padding: '5px 12px', borderRadius: 20, border: 'none', fontSize: 12, fontWeight: 600, background: statusFilter === s ? '#fff' : 'rgba(255,255,255,0.15)', color: statusFilter === s ? '#059669' : '#fff', cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}>
              {s === 'all' ? 'All' : s} {counts[s] ? `(${counts[s]})` : ''}
            </button>
          ))}
        </div>
      </div>

      {/* Search */}
      <div style={{ padding: '10px 12px 6px' }}>
        <div style={{ position: 'relative' }}>
          <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }}>🔍</span>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Order #, party, color, article…" style={{ width: '100%', padding: '11px 12px 11px 36px', fontSize: 14, border: '1px solid #E2E8F0', borderRadius: 10, background: '#fff', outline: 'none', boxSizing: 'border-box' }} />
        </div>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#94A3B8' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
          <div>No orders found</div>
        </div>
      ) : (
        <div style={{ padding: '4px 12px 8px' }}>
          {filtered.map(o => {
            const cfg = statusCfg[o.status] || statusCfg.new
            const isExpanded = expanded === o.id
            const batches = o.splits || []
            return (
              <div key={o.id} onClick={() => setExpanded(isExpanded ? null : o.id)} style={{ background: '#fff', borderRadius: 14, marginBottom: 10, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.07)', cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}>
                {/* Main row */}
                <div style={{ padding: '14px', borderLeft: `4px solid ${cfg.border}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: '#1A1A18' }}>{o.orderNumber}</div>
                      <div style={{ fontSize: 13, color: '#64748B', marginTop: 2 }}>{o.party}</div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: cfg.bg, color: cfg.color }}>{o.status}</span>
                      <span style={{ fontSize: 10, color: '#94A3B8' }}>{isExpanded ? '▲ less' : '▼ more'}</span>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px', fontSize: 12, color: '#64748B' }}>
                    <div><span style={{ color: '#94A3B8' }}>Article </span>{o.article}</div>
                    <div><span style={{ color: '#94A3B8' }}>Color </span>{o.color}</div>
                    <div><span style={{ color: '#94A3B8' }}>Qty </span><strong style={{ color: '#1A1A18' }}>{o.qtyKg} Kg</strong></div>
                    <div><span style={{ color: '#94A3B8' }}>Supervisor </span>{o.supervisor || '—'}</div>
                  </div>
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div style={{ borderTop: '1px solid #F1F5F9', padding: '12px 14px', background: '#FAFAFA' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px', fontSize: 12, color: '#64748B', marginBottom: 10 }}>
                      <div><span style={{ color: '#94A3B8' }}>Blend </span>{o.blend || '—'}</div>
                      <div><span style={{ color: '#94A3B8' }}>Width </span>{o.width || '—'}</div>
                      <div><span style={{ color: '#94A3B8' }}>GSM </span>{o.gsm || '—'}</div>
                      <div><span style={{ color: '#94A3B8' }}>Machine </span>{o.machine || '—'}</div>
                      <div><span style={{ color: '#94A3B8' }}>Lab No. </span>{o.labNo || '—'}</div>
                      <div><span style={{ color: '#94A3B8' }}>Lot No. </span>{o.lotNo || '—'}</div>
                    </div>
                    {/* Route */}
                    {(o.processRoute || []).length > 0 && (
                      <div style={{ marginBottom: 10 }}>
                        <div style={{ fontSize: 11, color: '#94A3B8', marginBottom: 4 }}>PROCESS ROUTE</div>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {(o.processRoute || []).map((code: string) => (
                            <span key={code} style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', background: '#DBEAFE', color: '#1E40AF', borderRadius: 20 }}>{code}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {/* Batches */}
                    {batches.length > 0 && (
                      <div>
                        <div style={{ fontSize: 11, color: '#94A3B8', marginBottom: 4 }}>BATCHES ({batches.length})</div>
                        {batches.map((b: any) => (
                          <div key={b.batchId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #F1F5F9' }}>
                            <span style={{ fontSize: 12, fontWeight: 600, color: '#185FA5' }}>{b.batchId}</span>
                            <span style={{ fontSize: 12, color: '#64748B' }}>{b.kg} Kg</span>
                            <span style={{ fontSize: 11, color: '#94A3B8' }}>{b.fmsCurrentProcess || b.status || '—'}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
