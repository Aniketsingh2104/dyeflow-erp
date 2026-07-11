'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'

export default function MobileHome() {
  const [stats,     setStats]     = useState({ new: 0, inProcess: 0, done: 0, hold: 0, machines: 0, faulty: 0, overdue: 0 })
  const [processes, setProcesses] = useState<{ code: string; name: string; active: number }[]>([])
  const [time,      setTime]      = useState('')
  const [loading,   setLoading]   = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [oRes, bRes, mRes, pRes] = await Promise.all([
        fetch('/api/orders?limit=1000',  { cache: 'no-store' }).then(r => r.json()),
        fetch('/api/batches?limit=5000', { cache: 'no-store' }).then(r => r.json()),
        fetch('/api/machines',           { cache: 'no-store' }).then(r => r.json()),
        fetch('/api/processes',          { cache: 'no-store' }).then(r => r.json()),
      ])

      const orders:  any[] = oRes.data || []
      const batches: any[] = bRes.data || []
      const procs:   any[] = (pRes.data || []).filter((p: any) => p.is_enabled).sort((a: any, b: any) => a.display_order - b.display_order)

      // Stats
      const now = new Date()
      let overdue = 0
      for (const o of orders) {
        if (['done','new'].includes(o.status)) continue
        const d = (o.planned_dates || {})['Dispatch'] || ''
        if (d && new Date(d) < now) overdue++
      }

      // Active batches per process
      const procMap: Record<string, number> = {}
      for (const b of batches) {
        if (b.status !== 'done' && b.current_process) {
          procMap[b.current_process] = (procMap[b.current_process] || 0) + 1
        }
      }

      const activeProcs = procs
        .map(p => ({ code: p.code, name: p.name, active: procMap[p.code] || 0 }))
        .filter(p => p.active > 0)
        .sort((a, b) => b.active - a.active)

      setStats({
        new:       orders.filter(o => o.status === 'new').length,
        inProcess: orders.filter(o => ['assigned','splitting','in-process'].includes(o.status)).length,
        done:      orders.filter(o => o.status === 'done').length,
        hold:      orders.filter(o => o.status === 'hold').length,
        machines:  (mRes.data || []).length,
        faulty:    0, // would need /api/faulty endpoint
        overdue,
      })
      setProcesses(activeProcs.slice(0, 6))
    } finally { setLoading(false) }
  }, [])

  useEffect(() => {
    load()
    setTime(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }))
    const t = setInterval(() => {
      setTime(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }))
    }, 30000)
    return () => clearInterval(t)
  }, [load])

  return (
    <div style={{ minHeight: '100vh', background: '#F1F5F9' }}>
      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, #0f172a 0%, #185FA5 100%)', padding: '20px 16px 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#fff', letterSpacing: '-0.5px' }}>DyeFlow</div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: 2 }}>Factory Floor</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>{time}</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>
              {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
            </div>
          </div>
        </div>

        {/* Alert banners */}
        {!loading && (
          <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {stats.overdue > 0 && (
              <div style={{ background: '#FEF3C7', borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 18 }}>⚠️</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#92400E' }}>
                  {stats.overdue} order{stats.overdue > 1 ? 's' : ''} overdue
                </span>
              </div>
            )}
            {stats.new > 0 && (
              <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 18 }}>📬</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>
                  {stats.new} new order{stats.new > 1 ? 's' : ''} awaiting assignment
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, padding: '14px 12px 0' }}>
        {[
          { label: 'New',    value: stats.new,       color: '#D97706' },
          { label: 'Active', value: stats.inProcess,  color: '#185FA5' },
          { label: 'Done',   value: stats.done,       color: '#059669' },
          { label: 'Hold',   value: stats.hold,       color: '#BE185D' },
        ].map(s => (
          <div key={s.label} style={{ background: '#fff', borderRadius: 12, padding: '12px 8px', textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: loading ? '#CBD5E1' : s.color }}>{loading ? '…' : s.value}</div>
            <div style={{ fontSize: 10, color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase', marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Quick actions */}
      <div style={{ padding: '14px 12px 0' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Quick Access</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {[
            { href: '/mobile/fms',        icon: '⚙', label: 'FMS Processes',  color: '#185FA5', sub: 'Mark batches done' },
            { href: '/mobile/batches',    icon: '📦', label: 'Batch Tracker',  color: '#7C3AED', sub: 'Find any batch'   },
            { href: '/mobile/orders',     icon: '📋', label: 'Orders',         color: '#059669', sub: 'View all orders'  },
            { href: '/mobile/supervisor', icon: '👷', label: 'Supervisor View', color: '#D97706', sub: 'Inbox & assignments' },
          ].map(a => (
            <Link key={a.href} href={a.href} style={{ textDecoration: 'none' }}>
              <div style={{ background: '#fff', borderRadius: 14, padding: '16px 14px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', borderLeft: `4px solid ${a.color}` }}>
                <div style={{ fontSize: 26, marginBottom: 8 }}>{a.icon}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#1A1A18' }}>{a.label}</div>
                <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 3 }}>{a.sub}</div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Live process activity */}
      {processes.length > 0 && (
        <div style={{ padding: '16px 12px 0' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Live Process Activity</div>
          <div style={{ background: '#fff', borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
            {processes.map((p, i) => (
              <Link key={p.code} href={`/mobile/fms?process=${p.code}`} style={{ textDecoration: 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: i < processes.length - 1 ? '1px solid #F1F5F9' : 'none' }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#1A1A18' }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>{p.code}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ background: '#DBEAFE', color: '#1E40AF', fontSize: 13, fontWeight: 700, padding: '4px 12px', borderRadius: 20 }}>
                      {p.active} active
                    </div>
                    <span style={{ color: '#CBD5E1', fontSize: 16 }}>›</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Refresh + desktop link */}
      <div style={{ padding: '20px 12px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
        <button onClick={load} disabled={loading}
          style={{ fontSize: 12, color: loading ? '#CBD5E1' : '#185FA5', background: 'none', border: 'none', cursor: loading ? 'default' : 'pointer', fontWeight: 600 }}>
          {loading ? '⏳ Loading…' : '↻ Refresh'}
        </button>
        <Link href="/" style={{ fontSize: 12, color: '#94A3B8', textDecoration: 'none' }}>
          Switch to Desktop version →
        </Link>
      </div>
    </div>
  )
}
