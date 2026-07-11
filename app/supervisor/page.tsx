'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { getSupervisors, getOrders, assignSupervisor as apiAssignSupervisor } from '@/lib/db'

const SUP_PALETTE = [
  '#185FA5','#7C3AED','#059669','#D97706',
  '#DC2626','#0891B2','#65A30D','#DB2777',
]

function supColor(name: string, all: string[]): string {
  const i = all.indexOf(name)
  return i >= 0 ? SUP_PALETTE[i % SUP_PALETTE.length] : '#6B7280'
}

export default function SupervisorPage() {
  const router = useRouter()
  const [supervisors,      setSupervisors]      = useState<any[]>([])
  const [supNames,         setSupNames]         = useState<string[]>([])
  const [unassigned,       setUnassigned]       = useState<any[]>([])
  const [stats,            setStats]            = useState({ total: 0, inbox: 0, active: 0, done: 0 })
  const [loading,          setLoading]          = useState(true)

  // Assign modal
  const [assignModal,  setAssignModal]  = useState<any>(null)
  const [assignTo,     setAssignTo]     = useState('')
  const [assignSaving, setAssignSaving] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [supRes, orderRes] = await Promise.all([
        getSupervisors(),
        getOrders({ limit: 1000 }),
      ])

      const sups: any[]   = supRes.data   || []
      const orders: any[] = orderRes.data || []

      const names = sups.map(s => s.name)
      setSupNames(names)

      // Enrich supervisors with workload stats
      const enriched = sups.map(sup => {
        const myOrders = orders.filter(o => o.supervisor_id === sup.id)
        const inbox    = myOrders.filter(o => o.status === 'assigned').length
        const active   = myOrders.filter(o => ['splitting','in-process'].includes(o.status)).length
        const done     = myOrders.filter(o => o.status === 'done').length
        const activeKg = myOrders
          .filter(o => ['assigned','splitting','in-process'].includes(o.status))
          .reduce((s, o) => s + (parseFloat(o.qty_kg) || 0), 0)
        return { ...sup, inbox, active, done, totalOrders: myOrders.length, activeKg }
      })

      setSupervisors(enriched)

      // Unassigned orders
      const noSup = orders.filter(o => !o.supervisor_id || o.status === 'new')
      setUnassigned(noSup)

      setStats({
        total: orders.length,
        inbox: enriched.reduce((s, x) => s + x.inbox,  0),
        active: enriched.reduce((s, x) => s + x.active, 0),
        done:   enriched.reduce((s, x) => s + x.done,   0),
      })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
    const h = () => loadData()
    window.addEventListener('dyeflow-db-updated', h)
    return () => window.removeEventListener('dyeflow-db-updated', h)
  }, [loadData])

  // ── Assign ────────────────────────────────────────────────────────────────

  const confirmAssign = async () => {
    if (!assignModal || !assignTo) return
    const sup = supervisors.find(s => s.name === assignTo)
    if (!sup) return
    setAssignSaving(true)
    try {
      const { error } = await apiAssignSupervisor(assignModal.id, sup.id)
      if (error) { alert('Error: ' + error); return }
      setAssignModal(null)
      setAssignTo('')
      loadData()
    } finally {
      setAssignSaving(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '60vh', color: 'var(--text-tertiary)', fontSize: 14 }}>
      Loading supervisors…
    </div>
  )

  return (
    <div className="content" style={{ padding: '16px 20px' }}>

      {/* Stats row */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        {[
          { label: 'Total Orders',  value: stats.total,  color: 'var(--text-primary)' },
          { label: 'Inbox',         value: stats.inbox,  color: '#D97706' },
          { label: 'In Production', value: stats.active, color: 'var(--accent)' },
          { label: 'Completed',     value: stats.done,   color: 'var(--success)' },
        ].map(s => (
          <div key={s.label} style={{ flex: '1 1 140px', minWidth: 140,
            background: 'var(--bg-primary)', border: '1px solid var(--border-light)',
            borderRadius: 10, padding: '14px 16px' }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-tertiary)',
              textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
              {s.label}
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Supervisor cards */}
      <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)',
        borderRadius: 10, padding: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 14 }}>
          Supervisors ({supervisors.length})
        </div>

        {supervisors.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-tertiary)', fontSize: 13 }}>
            No supervisors found. Add them in Setup → Supervisor Master.
          </div>
        ) : (
          <div style={{ display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
            {supervisors.map(sup => {
              const color   = supColor(sup.name, supNames)
              const hasInbox = sup.inbox > 0
              return (
                <div key={sup.id}
                  onClick={() => router.push(`/supervisor/${encodeURIComponent(sup.id || sup.name)}`)}
                  style={{ background: 'var(--bg-primary)', borderRadius: 10, padding: 14,
                    border: `1px solid ${hasInbox ? color + '55' : 'var(--border-light)'}`,
                    cursor: 'pointer', position: 'relative', transition: 'box-shadow 0.15s' }}
                  onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 14px rgba(0,0,0,0.1)'; e.currentTarget.style.borderColor = color }}
                  onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = hasInbox ? color + '55' : 'var(--border-light)' }}>

                  {hasInbox && (
                    <div style={{ position: 'absolute', top: -6, right: -6, background: color,
                      color: '#fff', borderRadius: '50%', width: 24, height: 24,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, fontWeight: 700 }}>
                      {sup.inbox}
                    </div>
                  )}

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: color,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 14, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                      {(sup.name || '?').charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>{sup.name}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                        {(sup.articles || []).slice(0, 2).join(', ') || 'No articles mapped'}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 4, textAlign: 'center' }}>
                    {[
                      { label: 'Inbox',  val: sup.inbox,              hi: hasInbox },
                      { label: 'Active', val: sup.active,             hi: sup.active > 0 },
                      { label: 'Done',   val: sup.done,               hi: false },
                      { label: 'Kg',     val: Math.round(sup.activeKg), hi: false },
                    ].map(({ label, val, hi }) => (
                      <div key={label} style={{ background: hi ? color + '18' : 'var(--bg-secondary)',
                        borderRadius: 6, padding: '4px 2px' }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: hi ? color : 'var(--text-tertiary)' }}>{val}</div>
                        <div style={{ fontSize: 9, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>{label}</div>
                      </div>
                    ))}
                  </div>

                  <div style={{ marginTop: 10, fontSize: 11, color, fontWeight: 600, textAlign: 'center' }}>
                    Open Sheet →
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Unassigned orders */}
      <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)',
        borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-light)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
            Unassigned Orders
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            {unassigned.length} order{unassigned.length !== 1 ? 's' : ''}
          </div>
        </div>

        {unassigned.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--success)', fontSize: 14 }}>
            ✓ All orders assigned to supervisors.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--bg-secondary)' }}>
                  {['Order #','Party','Article','Color','Qty (Kg)','Action'].map(h => (
                    <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10,
                      fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase',
                      letterSpacing: '0.05em', borderBottom: '1px solid var(--border-light)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {unassigned.map((order, i) => (
                  <tr key={order.id}
                    style={{ background: i % 2 === 0 ? 'var(--bg-primary)' : 'var(--bg-secondary)',
                      borderBottom: '1px solid var(--border-light)' }}>
                    <td style={{ ...td, fontWeight: 600, color: 'var(--accent)' }}>{order.order_number}</td>
                    <td style={td}>{order.party}</td>
                    <td style={{ ...td, fontWeight: 500 }}>{order.article}</td>
                    <td style={td}>{order.color}</td>
                    <td style={{ ...td, fontWeight: 600 }}>{order.qty_kg}</td>
                    <td style={td}>
                      <button className="xs primary"
                        onClick={() => { setAssignModal(order); setAssignTo('') }}>
                        Assign
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Assign modal */}
      {assignModal && (
        <div className="modal-overlay" onClick={() => setAssignModal(null)}>
          <div className="modal" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Assign to Supervisor</span>
              <button className="small" onClick={() => setAssignModal(null)}>✕</button>
            </div>
            <div style={{ background: 'var(--bg-secondary)', borderRadius: 8,
              padding: '10px 14px', marginBottom: 14, fontSize: 13 }}>
              <div style={{ fontWeight: 700, color: 'var(--accent)' }}>{assignModal.order_number}</div>
              <div style={{ color: 'var(--text-secondary)', marginTop: 3 }}>
                {assignModal.party} · {assignModal.article} · {assignModal.color} · {assignModal.qty_kg} Kg
              </div>
            </div>
            <div className="form-group" style={{ marginBottom: 14 }}>
              <label>Select Supervisor *</label>
              <select value={assignTo} onChange={e => setAssignTo(e.target.value)}>
                <option value="">— Choose —</option>
                {supNames.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            {assignTo && (() => {
              const sup = supervisors.find(s => s.name === assignTo)
              if (!sup) return null
              const c = supColor(assignTo, supNames)
              return (
                <div style={{ background: c + '12', border: `1px solid ${c}33`,
                  borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 12 }}>
                  <span style={{ fontWeight: 600, color: c }}>Workload: </span>
                  <span style={{ color: 'var(--text-secondary)' }}>
                    {sup.inbox} inbox · {sup.active} active · {Math.round(sup.activeKg)} Kg
                  </span>
                </div>
              )
            })()}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setAssignModal(null)}>Cancel</button>
              <button className="primary" onClick={confirmAssign}
                disabled={!assignTo || assignSaving}>
                {assignSaving ? 'Saving…' : 'Assign'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const td: React.CSSProperties = {
  padding: '10px 12px', fontSize: 12, color: 'var(--text-primary)',
}
