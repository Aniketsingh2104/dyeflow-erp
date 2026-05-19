'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function BatchesPage() {
  const router = useRouter()
  const [batches, setBatches] = useState<any[]>([])
  const [stats, setStats] = useState({ pending: 0, inProcess: 0, done: 0 })
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [doneAlert, setDoneAlert] = useState('')

  useEffect(() => {
    loadBatches()
  }, [])

  const loadBatches = () => {
    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return

    const db = JSON.parse(stored)
    const allBatches = (db.orders || []).flatMap((o: any) =>
      (o.splits || []).map((s: any) => ({
        ...s,
        orderId: o.id,
        orderNo: o.orderNumber,
        party: o.party,
        article: o.article,
        color: o.color,
        processRoute: o.processRoute || [],
        machine: s.machine || o.machine,
        supervisor: o.supervisor,
      }))
    )

    // Sort: active first by priority, then done
    allBatches.sort((a: any, b: any) => {
      if (a.fmsDone && !b.fmsDone) return 1
      if (!a.fmsDone && b.fmsDone) return -1
      return 0
    })

    setBatches(allBatches)

    const done = allBatches.filter((b: any) => b.status === 'done' || b.fmsDone).length
    const inProcess = allBatches.filter((b: any) => b.fmsCurrentProcess && !b.fmsDone).length
    const pending = allBatches.filter((b: any) => !b.fmsCurrentProcess && !b.fmsDone && b.status !== 'done').length

    setStats({ pending, inProcess, done })
  }

  // ── Mark Done — real FMS logic ────────────────────────────────────────────
  const markDone = (batch: any) => {
    const processLabel = batch.fmsCurrentProcess || '(current process)'
    if (!confirm(`Mark batch ${batch.batchId} as done in ${processLabel}?`)) return

    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return
    const db = JSON.parse(stored)

    const order = (db.orders || []).find((o: any) => o.id === batch.orderId)
    if (!order) return
    const b = (order.splits || []).find((s: any) => s.batchId === batch.batchId)
    if (!b) return

    const today = new Date().toISOString().split('T')[0]
    if (!b.fmsActualDates) b.fmsActualDates = {}
    const code = b.fmsCurrentProcess
    if (code) b.fmsActualDates[code] = today

    const route: string[] = order.processRoute || []
    const idx = code ? route.indexOf(code) : -1
    const next = idx >= 0 ? route[idx + 1] : ''

    if (next) {
      if (!b.fmsActiveProcesses) b.fmsActiveProcesses = {}
      b.fmsActiveProcesses[next] = true
      b.fmsCurrentProcess = next
      if (!b.fmsDispatch) b.fmsDispatch = {}
      b.fmsDispatch[next] = { sent: true, sentAt: new Date().toISOString() }
    } else {
      b.fmsDone = true
      b.status = 'done'
    }

    localStorage.setItem('dyeflow_db', JSON.stringify(db))
    window.dispatchEvent(new Event('dyeflow-db-updated'))

    setDoneAlert(`✅ Batch ${batch.batchId} marked done${next ? ` — moved to ${next}` : ' — all processes complete'}`)
    setTimeout(() => setDoneAlert(''), 3000)
    loadBatches()
  }

  const getMachineName = (machineId: string) => {
    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return machineId
    const db = JSON.parse(stored)
    const machine = (db.machines || []).find((m: any) => m.id === machineId)
    return machine ? machine.name.replace(/^Machine\s*/i, 'M ').trim() : machineId
  }

  const getStatusBadge = (batch: any) => {
    if (batch.fmsDone || batch.status === 'done') return <span className="badge badge-done">done</span>
    if (batch.fmsCurrentProcess) return <span className="badge badge-in-process">in-process</span>
    if (batch.fmsDispatch && Object.keys(batch.fmsDispatch).length > 0) return <span className="badge badge-assigned">dispatched</span>
    return <span className="badge badge-pending">pending</span>
  }

  const isDone = (batch: any) => batch.fmsDone || batch.status === 'done'
  const isActive = (batch: any) => !!batch.fmsCurrentProcess && !isDone(batch)

  const filtered = batches.filter(b => {
    if (filterStatus === 'active' && !isActive(b)) return false
    if (filterStatus === 'done' && !isDone(b)) return false
    if (filterStatus === 'pending' && (isActive(b) || isDone(b))) return false
    if (search.trim()) {
      const s = search.toLowerCase()
      return (
        (b.batchId || '').toLowerCase().includes(s) ||
        (b.orderNo || '').toLowerCase().includes(s) ||
        (b.party || '').toLowerCase().includes(s) ||
        (b.color || '').toLowerCase().includes(s)
      )
    }
    return true
  })

  if (batches.length === 0) {
    return (
      <div className="content">
        <div className="empty-state" style={{ padding: '60px' }}>
          No batches created yet. Assign process routes and split orders from the Supervisor Sheets.
        </div>
      </div>
    )
  }

  return (
    <div className="content">
      {/* Stats */}
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: '16px' }}>
        <div className="stat-card">
          <div className="stat-label">Pending</div>
          <div className="stat-value">{stats.pending}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">In Process</div>
          <div className="stat-value" style={{ color: 'var(--accent)' }}>{stats.inProcess}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Completed</div>
          <div className="stat-value" style={{ color: 'var(--success)' }}>{stats.done}</div>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search batch, order, party, color…"
          style={{ width: '260px', fontSize: '13px' }}
        />
        {(['all', 'active', 'pending', 'done'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilterStatus(f)}
            style={{
              fontSize: '12px', fontWeight: filterStatus === f ? 600 : 400,
              background: filterStatus === f ? 'var(--accent)' : 'var(--bg-secondary)',
              color: filterStatus === f ? '#fff' : 'var(--text-secondary)',
              border: 'none', borderRadius: 6, padding: '5px 12px'
            }}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
        <button className="small" onClick={loadBatches} style={{ marginLeft: 'auto' }}>↻ Refresh</button>
      </div>

      {/* Done alert */}
      {doneAlert && (
        <div style={{ background: 'var(--success-light)', color: 'var(--success)', border: '1px solid #c6f6d5', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 13, fontWeight: 600 }}>
          {doneAlert}
        </div>
      )}

      {/* Batch Cards */}
      {filtered.length === 0 ? (
        <div className="empty-state">No batches match your filters.</div>
      ) : filtered.map((batch, idx) => {
        const route: string[] = batch.processRoute || []
        const curCode = batch.fmsCurrentProcess || ''
        const curIdx = route.indexOf(curCode)
        const done = isDone(batch)

        return (
          <div
            key={batch.batchId || idx}
            style={{
              background: 'var(--bg-primary)',
              border: '1px solid var(--border-light)',
              borderLeft: `4px solid ${done ? 'var(--success)' : batch.fmsFaulty?.active ? '#EF4444' : 'var(--accent)'}`,
              borderRadius: 10,
              padding: '14px 16px',
              marginBottom: 10,
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
              <div>
                <span style={{ fontSize: 15, fontWeight: 700, color: done ? 'var(--success)' : 'var(--accent)' }}>
                  {batch.batchId || 'N/A'}
                </span>
                {batch.fmsFaulty?.active && (
                  <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, color: '#EF4444', background: '#FEE2E2', padding: '2px 7px', borderRadius: 10 }}>⚠ FAULTY</span>
                )}
                <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginLeft: 10 }}>
                  {batch.orderNo} · {batch.party}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                {batch.machine && (
                  <span className="machine-badge">{getMachineName(batch.machine)}</span>
                )}
                {getStatusBadge(batch)}
              </div>
            </div>

            {/* Detail row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '6px 16px', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10 }}>
              <div><span style={{ color: 'var(--text-tertiary)' }}>Article </span>{batch.article || '-'}</div>
              <div><span style={{ color: 'var(--text-tertiary)' }}>Color </span>{batch.color || '-'}</div>
              <div><span style={{ color: 'var(--text-tertiary)' }}>Qty </span><strong style={{ color: 'var(--text-primary)' }}>{batch.kg || '-'} Kg</strong></div>
              <div><span style={{ color: 'var(--text-tertiary)' }}>Supervisor </span>{batch.supervisor || '-'}</div>
              {curCode && !done && <div><span style={{ color: 'var(--text-tertiary)' }}>At </span><span style={{ fontWeight: 600, color: 'var(--accent)' }}>{curCode}</span></div>}
            </div>

            {/* Process Route Visual */}
            {route.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px', marginBottom: 10 }}>
                {route.map((code: string, i: number) => {
                  const actual = batch.fmsActualDates?.[code]
                  const isCurrent = code === curCode && !done
                  const isPast = actual || (done) || i < curIdx
                  return (
                    <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                      <span style={{
                        fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 4,
                        background: isCurrent ? 'var(--accent)' : isPast ? 'var(--success-light)' : 'var(--bg-secondary)',
                        color: isCurrent ? '#fff' : isPast ? 'var(--success)' : 'var(--text-tertiary)',
                      }}>
                        {code}
                      </span>
                      {i < route.length - 1 && <span style={{ fontSize: 10, color: 'var(--border-medium)' }}>→</span>}
                    </span>
                  )
                })}
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: 6 }}>
              {/* Sheet → navigates to the FMS page for this batch's current process */}
              <button
                className="xs"
                onClick={() => router.push(`/fms/${curCode || route[0] || ''}`)}
                disabled={!curCode && !route[0]}
              >
                Open in FMS →
              </button>

              {/* Mark Done — real write-back */}
              {!done && curCode && (
                <button
                  className="xs success"
                  onClick={() => markDone(batch)}
                >
                  ✓ Mark Done
                </button>
              )}

              {done && (
                <span style={{ fontSize: 11, color: 'var(--success)', fontWeight: 600, alignSelf: 'center' }}>
                  ✓ All processes complete
                </span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
