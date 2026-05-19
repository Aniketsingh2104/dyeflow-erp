'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

// ── Dynamic supervisor colour palette — same 8-colour system as AppShell ─────
const SUP_PALETTE = [
  '#185FA5', '#7C3AED', '#059669', '#D97706',
  '#DC2626', '#0891B2', '#65A30D', '#DB2777',
]

function supColor(name: string, allNames: string[]): string {
  const idx = allNames.indexOf(name)
  return idx >= 0 ? SUP_PALETTE[idx % SUP_PALETTE.length] : '#6B7280'
}

export default function SupervisorPage() {
  const router = useRouter()
  const [supervisors, setSupervisors] = useState<any[]>([])
  const [supNames, setSupNames] = useState<string[]>([])
  const [unassignedOrders, setUnassignedOrders] = useState<any[]>([])
  const [stats, setStats] = useState({ totalOrders: 0, inbox: 0, active: 0, completed: 0 })

  // Assign modal state
  const [assignModal, setAssignModal] = useState<{ order: any } | null>(null)
  const [assignTo, setAssignTo] = useState('')
  const [assignSaving, setAssignSaving] = useState(false)

  useEffect(() => { loadData() }, [])

  const loadData = () => {
    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return
    const db = JSON.parse(stored)
    if (!db.supervisors) db.supervisors = []
    if (!db.orders) db.orders = []

    // Build supervisor name list for consistent color mapping
    const names: string[] = db.supervisors.map((s: any) => s.name).filter(Boolean)
    setSupNames(names)

    const supervisorData = db.supervisors.map((sup: any) => {
      const supOrders = db.orders.filter((o: any) =>
        (o.supervisor || '').toLowerCase() === (sup.name || '').toLowerCase()
      )
      const inbox  = supOrders.filter((o: any) => o.status === 'assigned').length
      const active = supOrders.filter((o: any) => ['splitting', 'in-process'].includes(o.status)).length
      const done   = supOrders.filter((o: any) => o.status === 'done').length
      const activeKg = supOrders
        .filter((o: any) => ['assigned', 'splitting', 'in-process'].includes(o.status))
        .reduce((s: number, o: any) => s + (parseFloat(o.qtyKg) || 0), 0)
      const articles = Object.entries(db.articleSupervisorMap || {})
        .filter(([, s]) => s === sup.name)
        .map(([a]) => a)
      return { ...sup, inbox, active, done, totalOrders: supOrders.length, activeKg, articles }
    })

    setSupervisors(supervisorData)

    const unassigned = db.orders.filter((o: any) => !o.supervisor || o.status === 'new')
    setUnassignedOrders(unassigned)

    setStats({
      totalOrders: db.orders.length,
      inbox:    supervisorData.reduce((s: number, x: any) => s + x.inbox, 0),
      active:   supervisorData.reduce((s: number, x: any) => s + x.active, 0),
      completed:supervisorData.reduce((s: number, x: any) => s + x.done, 0),
    })
  }

  // ── Assign order to supervisor ────────────────────────────────────────────
  const openAssignModal = (order: any) => {
    setAssignTo('')
    setAssignModal({ order })
  }

  const confirmAssign = () => {
    if (!assignModal || !assignTo.trim()) return
    setAssignSaving(true)
    try {
      const stored = localStorage.getItem('dyeflow_db')
      if (!stored) return
      const db = JSON.parse(stored)
      const order = (db.orders || []).find((o: any) => o.id === assignModal.order.id)
      if (order) {
        order.supervisor = assignTo
        order.status = 'assigned'
      }
      localStorage.setItem('dyeflow_db', JSON.stringify(db))
      window.dispatchEvent(new Event('dyeflow-db-updated'))
      loadData()
      setAssignModal(null)
    } finally {
      setAssignSaving(false)
    }
  }

  const openSupervisorSheet = (sup: any) => {
    router.push(`/supervisor/${encodeURIComponent(sup.id || sup.name)}`)
  }

  // ── Stat card ─────────────────────────────────────────────────────────────
  const StatCard = ({ label, value, accent, sub }: { label: string; value: number; accent?: string; sub?: string }) => (
    <div style={{
      background: 'var(--bg-primary)', borderRadius: 10, padding: '16px',
      flex: '1 1 160px', minWidth: 160, maxWidth: 200,
      border: `2px solid ${accent ? accent + '55' : 'var(--border-light)'}`,
      position: 'relative', overflow: 'hidden',
    }}>
      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 30, fontWeight: 800, color: accent || 'var(--text-primary)', marginBottom: 2, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{sub}</div>}
    </div>
  )

  return (
    <div className="content">
      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>
          Supervisor Sheets Overview
        </h2>
        <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          Click a supervisor to open their sheet. Unassigned orders are listed below — assign them directly from here.
        </p>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <StatCard label="Total Orders" value={stats.totalOrders} />
        <StatCard label="Inbox"         value={stats.inbox}       accent="#D97706" sub="Assigned, awaiting work" />
        <StatCard label="In Production" value={stats.active}      accent="#185FA5" sub="Active orders" />
        <StatCard label="Completed"     value={stats.completed}   accent="#059669" sub="Done orders" />
      </div>

      {/* Supervisor Cards */}
      <div style={{ background: 'var(--bg-primary)', borderRadius: 8, border: '1px solid var(--border-light)', padding: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 14 }}>
          Supervisors ({supervisors.length})
        </div>

        {supervisors.length === 0 ? (
          <div className="empty-state">No supervisors found. Add supervisors in Setup → Supervisor Master.</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
            {supervisors.map(sup => {
              const color = supColor(sup.name, supNames)
              const hasInbox = sup.inbox > 0
              return (
                <div
                  key={sup.id || sup.name}
                  onClick={() => openSupervisorSheet(sup)}
                  style={{
                    background: 'var(--bg-primary)',
                    border: `1px solid ${hasInbox ? color + '55' : 'var(--border-light)'}`,
                    borderRadius: 10, padding: 14, cursor: 'pointer',
                    transition: 'box-shadow 0.15s', position: 'relative',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 14px rgba(0,0,0,0.1)'; e.currentTarget.style.borderColor = color }}
                  onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = hasInbox ? color + '55' : 'var(--border-light)' }}
                >
                  {/* Inbox badge */}
                  {hasInbox && (
                    <div style={{ position: 'absolute', top: -6, right: -6, background: color, color: '#fff', borderRadius: '50%', width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>
                      {sup.inbox}
                    </div>
                  )}

                  {/* Avatar + name */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                      {(sup.name || '?').charAt(0).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>{sup.name}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-tertiary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {sup.articles.length > 0
                          ? sup.articles.slice(0, 2).join(', ') + (sup.articles.length > 2 ? ` +${sup.articles.length - 2}` : '')
                          : 'No articles mapped'}
                      </div>
                    </div>
                  </div>

                  {/* Mini stats */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4, textAlign: 'center' }}>
                    {[
                      { label: 'Inbox',  val: sup.inbox,  hi: hasInbox },
                      { label: 'Active', val: sup.active, hi: sup.active > 0 },
                      { label: 'Done',   val: sup.done,   hi: false },
                      { label: 'Kg',     val: `${Math.round(sup.activeKg)}`, hi: false },
                    ].map(({ label, val, hi }) => (
                      <div key={label} style={{ background: hi ? color + '18' : 'var(--bg-secondary)', borderRadius: 6, padding: '4px 2px' }}>
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

      {/* Unassigned Orders */}
      <div style={{ background: 'var(--bg-primary)', borderRadius: 8, border: '1px solid var(--border-light)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>Unassigned Orders</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{unassignedOrders.length} order{unassignedOrders.length !== 1 ? 's' : ''}</div>
        </div>

        {unassignedOrders.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--success)', fontSize: 14 }}>
            ✓ All orders have been assigned to supervisors.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--bg-secondary)' }}>
                  {['ORDER #', 'PARTY', 'ARTICLE', 'COLOR', 'QTY (KG)', 'TIMESTAMP', 'ACTION'].map(h => (
                    <th key={h} style={thStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {unassignedOrders.map((order, idx) => (
                  <tr key={order.id} style={{ background: idx % 2 === 0 ? 'var(--bg-primary)' : 'var(--bg-secondary)', borderBottom: '1px solid var(--border-light)' }}>
                    <td style={{ ...tdStyle, fontWeight: 600, color: 'var(--accent)' }}>{order.orderNumber}</td>
                    <td style={tdStyle}>{order.party}</td>
                    <td style={{ ...tdStyle, fontWeight: 500 }}>{order.article}</td>
                    <td style={tdStyle}>{order.color}</td>
                    <td style={{ ...tdStyle, fontWeight: 600 }}>{order.qtyKg}</td>
                    <td style={{ ...tdStyle, fontSize: 11, color: 'var(--text-tertiary)' }}>{order.timestamp}</td>
                    <td style={tdStyle}>
                      <button
                        onClick={() => openAssignModal(order)}
                        style={{ padding: '5px 12px', border: 'none', borderRadius: 5, background: 'var(--accent)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                      >
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

      {/* ── Assign Modal ──────────────────────────────────────────────────── */}
      {assignModal && (
        <div className="modal-overlay" onClick={() => setAssignModal(null)}>
          <div className="modal" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Assign Order to Supervisor</span>
              <button className="small" onClick={() => setAssignModal(null)}>✕</button>
            </div>

            {/* Order summary */}
            <div style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13 }}>
              <div style={{ fontWeight: 700, color: 'var(--accent)' }}>{assignModal.order.orderNumber}</div>
              <div style={{ color: 'var(--text-secondary)', marginTop: 3 }}>
                {assignModal.order.party} · {assignModal.order.article} · {assignModal.order.color} · {assignModal.order.qtyKg} Kg
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: 16 }}>
              <label>Select Supervisor *</label>
              <select value={assignTo} onChange={e => setAssignTo(e.target.value)}>
                <option value="">— Choose supervisor —</option>
                {supNames.map(n => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>

            {/* Supervisor workload preview */}
            {assignTo && (() => {
              const sup = supervisors.find(s => s.name === assignTo)
              if (!sup) return null
              const color = supColor(assignTo, supNames)
              return (
                <div style={{ background: color + '12', border: `1px solid ${color}33`, borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 12 }}>
                  <span style={{ fontWeight: 600, color }}>Workload: </span>
                  <span style={{ color: 'var(--text-secondary)' }}>
                    {sup.inbox} in inbox · {sup.active} active · {Math.round(sup.activeKg)} Kg in pipeline
                  </span>
                </div>
              )
            })()}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setAssignModal(null)}>Cancel</button>
              <button
                className="primary"
                onClick={confirmAssign}
                disabled={!assignTo || assignSaving}
              >
                {assignSaving ? 'Saving…' : 'Assign Supervisor'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const thStyle: React.CSSProperties = {
  padding: '10px 14px', textAlign: 'left', fontSize: 10, fontWeight: 700,
  color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '.05em',
  borderBottom: '1px solid var(--border-light)',
}
const tdStyle: React.CSSProperties = {
  padding: '12px 14px', fontSize: 12, color: 'var(--text-primary)',
}
