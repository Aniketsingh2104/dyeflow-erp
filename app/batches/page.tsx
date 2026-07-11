'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { getBatches, getOrders, markProcessDone } from '@/lib/db'

export default function BatchesPage() {
  const router = useRouter()

  const [batches,      setBatches]      = useState<any[]>([])
  const [loading,      setLoading]      = useState(true)
  const [search,       setSearch]       = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [toast,        setToast]        = useState('')
  const [stats,        setStats]        = useState({ pending: 0, inProcess: 0, done: 0 })

  // ── Load ──────────────────────────────────────────────────────────────────

  const loadBatches = useCallback(async () => {
    setLoading(true)
    try {
      // Fetch all batches with their nested batch_processes and machine info
      const { data, error } = await getBatches()
      if (error || !data) { setLoading(false); return }

      // Also fetch orders so we can join party, article, color, supervisor
      const { data: orders } = await getOrders({ limit: 1000 })
      const orderMap: Record<string, any> = {}
      for (const o of (orders || [])) orderMap[o.id] = o

      // Enrich batches with order info
      const enriched = (data as any[]).map(b => ({
        ...b,
        order:      orderMap[b.order_id] || {},
        orderNo:    orderMap[b.order_id]?.order_number || '-',
        party:      orderMap[b.order_id]?.party        || '-',
        article:    orderMap[b.order_id]?.article      || '-',
        color:      orderMap[b.order_id]?.color        || '-',
        supervisor: orderMap[b.order_id]?.supervisors?.name || '-',
        processRoute: orderMap[b.order_id]?.process_route || [],
      }))

      // Sort: active first, then pending, then done
      enriched.sort((a, b) => {
        const aD = a.status === 'done'
        const bD = b.status === 'done'
        if (aD && !bD) return 1
        if (!aD && bD) return -1
        const aA = a.current_process && a.status !== 'done'
        const bA = b.current_process && b.status !== 'done'
        if (aA && !bA) return -1
        if (!aA && bA) return 1
        return 0
      })

      setBatches(enriched)
      setStats({
        pending:   enriched.filter(b => !b.current_process && b.status !== 'done').length,
        inProcess: enriched.filter(b =>  b.current_process && b.status !== 'done').length,
        done:      enriched.filter(b => b.status === 'done').length,
      })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadBatches()
    const handle = () => loadBatches()
    window.addEventListener('dyeflow-db-updated', handle)
    window.addEventListener('dyeflow-refresh',    handle)
    return () => {
      window.removeEventListener('dyeflow-db-updated', handle)
      window.removeEventListener('dyeflow-refresh',    handle)
    }
  }, [loadBatches])

  // ── Toast ─────────────────────────────────────────────────────────────────

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 3500)
  }

  // ── Mark process done ─────────────────────────────────────────────────────

  const handleMarkDone = async (batch: any) => {
    const curCode = batch.current_process
    const route: string[]  = batch.processRoute || []
    const curIdx = route.indexOf(curCode)
    const nextProcess = curIdx >= 0 ? route[curIdx + 1] : undefined

    if (!confirm(`Mark batch ${batch.batch_id} as done in ${curCode || '(current process)'}?`)) return

    const { error } = await markProcessDone(batch.id, curCode, nextProcess)
    if (error) { alert('Error: ' + error); return }

    showToast(
      nextProcess
        ? `✓ ${batch.batch_id} moved to ${nextProcess}`
        : `✓ ${batch.batch_id} — all processes complete`
    )
    loadBatches()
  }

  // ── Filtering ─────────────────────────────────────────────────────────────

  const filtered = batches.filter(b => {
    const done   = b.status === 'done'
    const active = !!b.current_process && !done

    if (filterStatus === 'active'  && !active) return false
    if (filterStatus === 'done'    && !done)   return false
    if (filterStatus === 'pending' && (active || done)) return false

    if (search.trim()) {
      const s = search.toLowerCase()
      return (
        (b.batch_id  || '').toLowerCase().includes(s) ||
        (b.orderNo   || '').toLowerCase().includes(s) ||
        (b.party     || '').toLowerCase().includes(s) ||
        (b.color     || '').toLowerCase().includes(s) ||
        (b.article   || '').toLowerCase().includes(s)
      )
    }
    return true
  })

  // ── Helpers ───────────────────────────────────────────────────────────────

  const getStatusBadge = (b: any) => {
    if (b.status === 'done')       return <span className="badge badge-done">done</span>
    if (b.is_faulty)               return <span className="badge badge-danger">faulty</span>
    if (b.current_process)         return <span className="badge badge-in-process">in-process</span>
    return                                <span className="badge badge-pending">pending</span>
  }

  const getProcessSteps = (batch: any) => {
    const route: string[] = batch.processRoute || []
    const curCode = batch.current_process || ''
    const curIdx  = route.indexOf(curCode)
    const done    = batch.status === 'done'

    // Build a map of done processes from batch_processes array
    const doneSet = new Set<string>(
      ((batch.batch_processes || []) as any[])
        .filter((bp: any) => bp.status === 'done')
        .map((bp: any) => bp.process_code)
    )

    return route.map((code, i) => {
      const isDone    = doneSet.has(code) || done
      const isCurrent = code === curCode && !done
      const isPast    = isDone || i < curIdx
      return { code, isDone, isCurrent, isPast }
    })
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '60vh', color: 'var(--text-tertiary)', fontSize: 14 }}>
      Loading batches…
    </div>
  )

  return (
    <div className="content" style={{ padding: '16px 20px' }}>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 12, marginBottom: 16 }}>
        {[
          { label: 'Pending',    value: stats.pending,   color: 'var(--text-secondary)' },
          { label: 'In Process', value: stats.inProcess, color: 'var(--accent)' },
          { label: 'Completed',  value: stats.done,      color: 'var(--success)' },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--bg-secondary)',
            border: '1px solid var(--border-light)', borderRadius: 10,
            padding: '14px 18px' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)',
              textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
              {s.label}
            </div>
            <div style={{ fontSize: 26, fontWeight: 700, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Filter bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14,
        flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search batch, order, party, color…"
          style={{ width: 260, fontSize: 13, padding: '6px 10px',
            border: '1px solid var(--border-medium)', borderRadius: 6,
            background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
        />
        {(['all', 'active', 'pending', 'done'] as const).map(f => (
          <button key={f} onClick={() => setFilterStatus(f)}
            style={{ fontSize: 12, fontWeight: filterStatus === f ? 600 : 400,
              background: filterStatus === f ? 'var(--accent)' : 'var(--bg-secondary)',
              color:      filterStatus === f ? '#fff' : 'var(--text-secondary)',
              border: 'none', borderRadius: 6, padding: '5px 12px', cursor: 'pointer' }}>
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
        <button onClick={loadBatches} className="small"
          style={{ marginLeft: 'auto', cursor: 'pointer' }}>
          ⟳ Refresh
        </button>
      </div>

      {/* Toast */}
      {toast && (
        <div style={{ background: 'var(--success-light)', color: 'var(--success)',
          border: '1px solid var(--success)', borderRadius: 8,
          padding: '10px 14px', marginBottom: 14, fontSize: 13, fontWeight: 600 }}>
          {toast}
        </div>
      )}

      {/* Empty state */}
      {batches.length === 0 && (
        <div style={{ textAlign: 'center', padding: 60,
          color: 'var(--text-tertiary)', fontSize: 14 }}>
          No batches yet. Split orders from the Orders page to create batches.
        </div>
      )}

      {batches.length > 0 && filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: 40,
          color: 'var(--text-tertiary)', fontSize: 14 }}>
          No batches match your filters.
        </div>
      )}

      {/* Batch cards */}
      {filtered.map((batch, idx) => {
        const done    = batch.status === 'done'
        const faulty  = batch.is_faulty
        const curCode = batch.current_process || ''
        const steps   = getProcessSteps(batch)
        const mach    = batch.machines

        return (
          <div key={batch.id || idx} style={{
            background: 'var(--bg-primary)',
            border: '1px solid var(--border-light)',
            borderLeft: `4px solid ${done ? 'var(--success)' : faulty ? 'var(--danger)' : 'var(--accent)'}`,
            borderRadius: 10,
            padding: '14px 16px',
            marginBottom: 10,
          }}>

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between',
              alignItems: 'flex-start', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 15, fontWeight: 700,
                  color: done ? 'var(--success)' : 'var(--accent)' }}>
                  {batch.batch_id || `Batch #${batch.batch_number}`}
                </span>
                {faulty && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--danger)',
                    background: 'var(--danger-light)', padding: '2px 7px', borderRadius: 10 }}>
                    ⚠ FAULTY
                  </span>
                )}
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  {batch.orderNo} · {batch.party}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                {mach && (
                  <span style={{ fontSize: 11, fontWeight: 600,
                    background: 'var(--purple-light)', color: 'var(--purple)',
                    padding: '3px 9px', borderRadius: 4 }}>
                    {mach.name}
                  </span>
                )}
                {getStatusBadge(batch)}
              </div>
            </div>

            {/* Detail grid */}
            <div style={{ display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
              gap: '4px 16px', fontSize: 12,
              color: 'var(--text-secondary)', marginBottom: 10 }}>
              <div><span style={{ color: 'var(--text-tertiary)' }}>Article </span>{batch.article}</div>
              <div><span style={{ color: 'var(--text-tertiary)' }}>Color </span>{batch.color}</div>
              <div>
                <span style={{ color: 'var(--text-tertiary)' }}>Qty </span>
                <strong style={{ color: 'var(--text-primary)' }}>{batch.kg} Kg</strong>
              </div>
              <div><span style={{ color: 'var(--text-tertiary)' }}>Supervisor </span>{batch.supervisor}</div>
              {curCode && !done && (
                <div>
                  <span style={{ color: 'var(--text-tertiary)' }}>At </span>
                  <span style={{ fontWeight: 600, color: 'var(--accent)' }}>{curCode}</span>
                </div>
              )}
            </div>

            {/* Process route visual */}
            {steps.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginBottom: 10 }}>
                {steps.map(({ code, isDone, isCurrent, isPast }, i) => (
                  <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <span style={{
                      fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4,
                      background: isCurrent ? 'var(--accent)'
                                : isDone    ? 'var(--success-light)'
                                : isPast    ? 'var(--success-light)'
                                : 'var(--bg-secondary)',
                      color:      isCurrent ? '#fff'
                                : isDone    ? 'var(--success)'
                                : isPast    ? 'var(--success)'
                                : 'var(--text-tertiary)',
                    }}>
                      {code}
                    </span>
                    {i < steps.length - 1 && (
                      <span style={{ fontSize: 9, color: 'var(--border-medium)' }}>→</span>
                    )}
                  </span>
                ))}
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              {curCode && (
                <button className="xs" onClick={() => router.push(`/fms/${curCode}`)}>
                  Open in FMS →
                </button>
              )}
              {!curCode && (steps[0]?.code) && (
                <button className="xs" onClick={() => router.push(`/fms/${steps[0].code}`)}>
                  Open FMS →
                </button>
              )}
              {!done && curCode && (
                <button className="xs" style={{ background: 'var(--success)',
                  color: '#fff', border: 'none', cursor: 'pointer' }}
                  onClick={() => handleMarkDone(batch)}>
                  ✓ Mark Done
                </button>
              )}
              {done && (
                <span style={{ fontSize: 11, color: 'var(--success)',
                  fontWeight: 600, alignSelf: 'center' }}>
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
