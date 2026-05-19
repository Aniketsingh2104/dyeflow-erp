'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { loadOrSeedProcessList } from '@/lib/processMap'

interface StageEvent {
  code: string
  name: string
  enteredAt: string | null   // fmsEnterAt or dispatch sentAt
  completedAt: string | null // fmsActualDates
  daysSpent: number | null
  status: 'done' | 'active' | 'pending'
  isFaulty: boolean
}

interface TraceData {
  batchId: string
  orderId: string
  orderNo: string
  party: string
  article: string
  color: string
  kg: number
  blend: string
  supervisor: string
  machine: string
  status: string
  createdAt: string
  route: string[]
  stages: StageEvent[]
  faultyHistory: { processCode: string; note: string; flaggedAt: string }[]
  repairingOrders: any[]
}

function msDiff(a: string | null, b: string | null): number | null {
  if (!a || !b) return null
  const da = new Date(a), db = new Date(b)
  if (isNaN(da.getTime()) || isNaN(db.getTime())) return null
  return db.getTime() - da.getTime()
}

function fmtDur(ms: number | null): string {
  if (ms === null || ms < 0) return '—'
  const h = Math.floor(ms / 3600000)
  const d = Math.floor(h / 24)
  const rh = h % 24
  if (d > 0) return `${d}d ${rh}h`
  return `${h}h`
}

function fmtDate(s: string | null): string {
  if (!s) return '—'
  try {
    const d = new Date(s)
    if (isNaN(d.getTime())) return s
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  } catch { return s }
}

function buildTrace(batchId: string): TraceData | null {
  const raw = localStorage.getItem('dyeflow_db')
  if (!raw) return null
  const db = JSON.parse(raw)

  const processList = loadOrSeedProcessList()
  const procName: Record<string, string> = {}
  processList.forEach(p => { procName[p.code] = p.name })

  for (const order of (db.orders || [])) {
    const batch = (order.splits || []).find((b: any) => b.batchId === batchId)
    if (!batch) continue

    const route: string[] = order.processRoute || []
    const fullRoute = [...route]
    ;['Qa', 'Packing', 'Dispatch'].forEach(x => { if (!fullRoute.includes(x)) fullRoute.push(x) })

    const stages: StageEvent[] = fullRoute.map(code => {
      const name = procName[code] || code
      const dispatch = batch.fmsDispatch?.[code]
      const enteredAt = batch.fmsEnterAt?.[code] || dispatch?.sentAt || null
      const completedAt = batch.fmsActualDates?.[code] || null

      let status: 'done' | 'active' | 'pending' = 'pending'
      if (completedAt) status = 'done'
      else if (batch.fmsCurrentProcess === code || batch.fmsActiveProcesses?.[code]) status = 'active'

      const ms = msDiff(enteredAt, completedAt)
      const daysSpent = ms !== null ? Math.round(ms / 86400000 * 10) / 10 : null

      return {
        code, name,
        enteredAt: enteredAt || null,
        completedAt: completedAt || null,
        daysSpent,
        status,
        isFaulty: !!(batch.fmsFaulty?.active && batch.fmsFaulty.processCode === code),
      }
    })

    // Faulty history — from fmsFaulty flag
    const faultyHistory: any[] = []
    if (batch.fmsFaulty?.flaggedAt) {
      faultyHistory.push({
        processCode: batch.fmsFaulty.processCode,
        note: batch.fmsFaulty.note,
        flaggedAt: batch.fmsFaulty.flaggedAt,
      })
    }
    // Also from db.faultyRecords
    for (const fr of (db.faultyRecords || [])) {
      if (fr.batchId === batchId && !faultyHistory.find(f => f.flaggedAt === fr.date)) {
        faultyHistory.push({ processCode: fr.faultyFrom || '?', note: fr.remarks, flaggedAt: fr.date })
      }
    }

    const repairingOrders = (db.repairingOrders || []).filter(
      (r: any) => r.batchId === batchId || r.batchId === `${batchId}-R`
    )

    const machineName = (() => {
      const m = (db.machines || []).find((mx: any) => mx.id === (batch.machine || order.machine))
      return m ? m.name : (batch.machine || order.machine || '—')
    })()

    return {
      batchId,
      orderId: order.id,
      orderNo: order.orderNumber,
      party: order.party,
      article: order.article,
      color: order.color,
      kg: parseFloat(batch.kg) || 0,
      blend: order.blend || '',
      supervisor: order.supervisor || '—',
      machine: machineName,
      status: batch.status || 'pending',
      createdAt: batch.fmsDispatch?.[fullRoute[0]]?.sentAt || order.timestamp || '',
      route: fullRoute,
      stages,
      faultyHistory,
      repairingOrders,
    }
  }
  return null
}

export default function BatchTracePage() {
  const params = useParams()
  const batchId = decodeURIComponent(String(params?.batchId || ''))
  const [trace, setTrace] = useState<TraceData | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [search, setSearch] = useState(batchId)
  const [inputVal, setInputVal] = useState(batchId)

  useEffect(() => {
    if (!search) return
    const t = buildTrace(search)
    if (t) { setTrace(t); setNotFound(false) }
    else    { setTrace(null); setNotFound(true) }
  }, [search])

  const totalDone = trace?.stages.filter(s => s.status === 'done').length || 0
  const totalStages = trace?.stages.length || 0

  const progressPct = totalStages > 0 ? Math.round((totalDone / totalStages) * 100) : 0

  const STATUS_COLOR: Record<string, string> = {
    done:    '#1D9E75',
    active:  '#185FA5',
    pending: '#9CA3AF',
  }
  const STATUS_BG: Record<string, string> = {
    done:    '#EAF3DE',
    active:  '#E6F1FB',
    pending: '#F3F4F6',
  }

  return (
    <div className="content" style={{ maxWidth: 900, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800 }}>🔍 Batch Trace</div>
          <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 2 }}>Complete journey of any batch through FMS</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={inputVal}
            onChange={e => setInputVal(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') setSearch(inputVal.trim()) }}
            placeholder="Enter Batch ID…"
            style={{ width: 200, fontSize: 13, padding: '6px 10px' }}
          />
          <button className="primary small" onClick={() => setSearch(inputVal.trim())}>Search</button>
          <Link href="/batches"><button className="small">← Batches</button></Link>
        </div>
      </div>

      {notFound && (
        <div className="card">
          <div className="empty-state" style={{ padding: '48px' }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>🔍</div>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>Batch "{search}" not found</div>
            <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>Check the batch ID and try again.</div>
          </div>
        </div>
      )}

      {trace && (
        <>
          {/* Batch info card */}
          <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: 12, padding: '16px 20px', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--accent)' }}>{trace.batchId}</div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 3 }}>
                  <Link href={`/orders`} style={{ color: 'var(--accent)', fontWeight: 600, textDecoration: 'none' }}>{trace.orderNo}</Link>
                  {' · '}{trace.party}{' · '}{trace.article}{' · '}{trace.color}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {trace.faultyHistory.length > 0 && (
                  <span style={{ background: '#FEE2E2', color: '#DC2626', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>⚠ FAULTY HISTORY</span>
                )}
                <span style={{ background: STATUS_BG[trace.status] || '#F3F4F6', color: STATUS_COLOR[trace.status] || '#9CA3AF', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>
                  {trace.status.toUpperCase()}
                </span>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '8px 16px', marginTop: 14, fontSize: 12 }}>
              {[
                ['Qty', `${trace.kg} Kg`],
                ['Blend', trace.blend || '—'],
                ['Supervisor', trace.supervisor],
                ['Machine', trace.machine],
                ['Started', fmtDate(trace.createdAt)],
              ].map(([l, v]) => (
                <div key={l}>
                  <div style={{ color: 'var(--text-tertiary)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{l}</div>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginTop: 1 }}>{v}</div>
                </div>
              ))}
            </div>

            {/* Progress bar */}
            <div style={{ marginTop: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 5 }}>
                <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Progress — {totalDone} of {totalStages} stages done</span>
                <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{progressPct}%</span>
              </div>
              <div style={{ background: 'var(--bg-secondary)', borderRadius: 20, height: 8, overflow: 'hidden' }}>
                <div style={{ width: `${progressPct}%`, height: '100%', background: 'var(--accent)', borderRadius: 20, transition: 'width 0.4s' }} />
              </div>
            </div>
          </div>

          {/* Timeline */}
          <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: 12, padding: '16px 20px', marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 16, paddingBottom: 8, borderBottom: '1px solid var(--border-light)' }}>
              ⚙ FMS Journey
            </div>

            <div style={{ position: 'relative' }}>
              {/* Vertical line */}
              <div style={{ position: 'absolute', left: 18, top: 0, bottom: 0, width: 2, background: 'var(--border-light)' }} />

              {trace.stages.map((stage, i) => (
                <div key={stage.code} style={{ display: 'flex', gap: 16, marginBottom: 20, position: 'relative' }}>
                  {/* Circle */}
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                    background: stage.isFaulty ? '#FEE2E2' : STATUS_BG[stage.status],
                    border: `3px solid ${stage.isFaulty ? '#DC2626' : STATUS_COLOR[stage.status]}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 13, fontWeight: 700,
                    color: stage.isFaulty ? '#DC2626' : STATUS_COLOR[stage.status],
                    zIndex: 1, position: 'relative',
                  }}>
                    {stage.status === 'done' ? '✓' : stage.status === 'active' ? '●' : `${i + 1}`}
                  </div>

                  {/* Content */}
                  <div style={{ flex: 1, paddingTop: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{stage.name}</span>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 10, background: STATUS_BG[stage.status], color: STATUS_COLOR[stage.status] }}>
                        {stage.status.toUpperCase()}
                      </span>
                      <span style={{ background: 'var(--bg-secondary)', color: 'var(--text-tertiary)', padding: '1px 6px', borderRadius: 6, fontSize: 10, fontWeight: 700 }}>{stage.code}</span>
                      {stage.isFaulty && (
                        <span style={{ background: '#FEE2E2', color: '#DC2626', padding: '1px 8px', borderRadius: 10, fontSize: 10, fontWeight: 700 }}>⚠ FAULTY</span>
                      )}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px 12px', marginTop: 8, fontSize: 11 }}>
                      <div>
                        <div style={{ color: 'var(--text-tertiary)', fontSize: 10, textTransform: 'uppercase' }}>Entered</div>
                        <div style={{ fontWeight: 600 }}>{fmtDate(stage.enteredAt)}</div>
                      </div>
                      <div>
                        <div style={{ color: 'var(--text-tertiary)', fontSize: 10, textTransform: 'uppercase' }}>Completed</div>
                        <div style={{ fontWeight: 600, color: stage.completedAt ? 'var(--success)' : 'var(--text-tertiary)' }}>
                          {stage.completedAt ? fmtDate(stage.completedAt) : stage.status === 'active' ? 'In progress…' : '—'}
                        </div>
                      </div>
                      <div>
                        <div style={{ color: 'var(--text-tertiary)', fontSize: 10, textTransform: 'uppercase' }}>Time Spent</div>
                        <div style={{ fontWeight: 700, color: stage.daysSpent !== null && stage.daysSpent > 2 ? 'var(--danger)' : 'var(--text-primary)' }}>
                          {stage.daysSpent !== null ? `${stage.daysSpent}d` : stage.status === 'active' ? '(ongoing)' : '—'}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Faulty History */}
          {trace.faultyHistory.length > 0 && (
            <div style={{ background: 'var(--bg-primary)', border: '1px solid #FCA5A5', borderLeft: '4px solid #DC2626', borderRadius: 12, padding: '16px 20px', marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#DC2626', marginBottom: 12 }}>⚠ Faulty Events</div>
              {trace.faultyHistory.map((f, i) => (
                <div key={i} style={{ padding: '8px 0', borderBottom: i < trace.faultyHistory.length - 1 ? '1px solid var(--border-light)' : 'none' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
                    Process: {f.processCode} · {fmtDate(f.flaggedAt)}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{f.note || '—'}</div>
                </div>
              ))}
            </div>
          )}

          {/* Repairing Orders */}
          {trace.repairingOrders.length > 0 && (
            <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderLeft: '4px solid #7C3AED', borderRadius: 12, padding: '16px 20px', marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#7C3AED', marginBottom: 12 }}>🔧 Repairing Orders</div>
              {trace.repairingOrders.map((r: any, i: number) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: i < trace.repairingOrders.length - 1 ? '1px solid var(--border-light)' : 'none', fontSize: 12 }}>
                  <span style={{ fontWeight: 700, color: '#7C3AED' }}>{r.id}</span>
                  <span style={{ color: 'var(--text-secondary)' }}>{r.issueType}</span>
                  <span style={{ marginLeft: 'auto', background: r.status === 'Completed' ? 'var(--success-light)' : 'var(--warning-light)', color: r.status === 'Completed' ? 'var(--success)' : 'var(--warning)', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600 }}>
                    {r.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
