'use client'
/**
 * /batches/<batch id> — Batch Trace: the full journey of one batch.
 *
 *   • order details (party, article, colour, supervisor, machine)
 *   • every process on its route: planned date, arrived, done, time spent,
 *     late / on time — from batch_date_plans, batches.fms_enter_at and
 *     batch_processes
 *   • faulty / FOB records and repairs for this batch, and its repair batches
 *   • history: every recorded action (sent, done, faulty, FOB, moves) from
 *     the audit log
 *
 * <batch id> can be the batch code (DYE26-0004-B1) or its internal id.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { canonicalCode, dateColFor, sameCode } from '@/lib/processCodes'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function fmtDT(s?: string | null) {
  if (!s) return '—'
  const d = new Date(s)
  if (isNaN(d.getTime())) return String(s)
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}
function fmtD(s?: string | null) {
  if (!s) return '—'
  const d = new Date(String(s).length === 10 ? s + 'T00:00:00' : s)
  if (isNaN(d.getTime())) return String(s)
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })
}
function dur(from?: string | null, to?: string | null) {
  if (!from) return '—'
  const ms = (to ? new Date(to).getTime() : Date.now()) - new Date(from).getTime()
  if (!isFinite(ms) || ms < 0) return '—'
  const h = Math.floor(ms / 3600000), d = Math.floor(h / 24)
  return d > 0 ? `${d}d ${h % 24}h` : `${h}h ${Math.floor((ms % 3600000) / 60000)}m`
}

const ACTION_LABEL: Record<string, string> = {
  split: 'Split', full_split: 'Split', batch_move: 'Moved', process_done: 'Process done',
  faulty_mark: 'Marked faulty', faulty_ok: 'Faulty → OK', faulty_reprocess: 'Faulty → reprocess',
  fob_create: 'FOB raised', fob_sent: 'FOB sample sent', fob_approved: 'FOB approved', fob_reprocess: 'FOB → reprocess',
  delete_batch: 'Batch deleted', repair_split: 'Repair split', repair_full_split: 'Repair split',
}

export default function BatchTracePage() {
  const params = useParams()
  const router = useRouter()
  const raw = decodeURIComponent(String(params?.batchId || '')).trim()

  const [batch,   setBatch]   = useState<any>(null)
  const [order,   setOrder]   = useState<any>(null)
  const [plan,    setPlan]    = useState<any>(null)
  const [procs,   setProcs]   = useState<Record<string, string>>({})
  const [faulty,  setFaulty]  = useState<any[]>([])
  const [fob,     setFob]     = useState<any[]>([])
  const [repairs, setRepairs] = useState<any[]>([])
  const [related, setRelated] = useState<any[]>([])
  const [history, setHistory] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')
  const [search,  setSearch]  = useState('')

  useEffect(() => { if (!raw) router.replace('/batches/search') }, [raw, router])

  const load = useCallback(async () => {
    if (!raw) return
    setLoading(true); setError('')
    try {
      const get = (u: string) => fetch(u, { cache: 'no-store' }).then(r => r.json()).catch(() => ({ ok: false, data: [] }))
      const bRes = await get(UUID_RE.test(raw) ? `/api/batches?id=${raw}` : `/api/batches?batch_id=${encodeURIComponent(raw)}`)
      const b = bRes.data?.[0]
      if (!b) { setBatch(null); setError(`Batch "${raw}" not found.`); return }
      setBatch(b)

      const [oRes, dpRes, pRes, fRes, fobRes, roRes, sibRes] = await Promise.all([
        get(`/api/orders?id=${b.order_id}`),
        get(`/api/date-plans?batch_id=${b.id}`),
        get('/api/processes'),
        get('/api/faulty'),
        get('/api/fob'),
        get('/api/repairing-orders'),
        get(`/api/batches?order_id=${b.order_id}`),
      ])
      setOrder(oRes.data?.[0] || null)
      setPlan(dpRes.data?.[0] || null)
      const names: Record<string, string> = {}
      for (const p of pRes.data || []) names[p.code] = p.name
      setProcs(names)
      const myFaulty = (fRes.data || []).filter((r: any) => r.batch_id === b.id)
      const myFob    = (fobRes.data || []).filter((r: any) => r.batch_id === b.id)
      setFaulty(myFaulty); setFob(myFob)
      setRepairs((roRes.data || []).filter((r: any) => r.batch_id === b.id
        || myFaulty.some((f: any) => f.id === r.faulty_id) || myFob.some((f: any) => f.id === r.fob_id)))
      // Repair batches made from this one (B2 → B2-R, B2-R2 …) and the batch this one was repaired from
      const base = String(b.batch_id || '').replace(/-R+\d*$/, '')
      setRelated((sibRes.data || []).filter((x: any) => x.id !== b.id &&
        (String(x.batch_id || '').startsWith(b.batch_id + '-R') || (base !== b.batch_id && x.batch_id === base))))

      const ids = [b.id, b.batch_id, ...myFaulty.map((r: any) => r.id), ...myFob.map((r: any) => r.id)].filter(Boolean)
      const aRes = await get(`/api/audit?limit=500&entity_id=${encodeURIComponent(ids.join(','))}`)
      setHistory((aRes.data || []).slice().sort((x: any, y: any) => String(x.created_at).localeCompare(String(y.created_at))))
    } catch (e: any) {
      setError(e?.message || String(e))
    } finally { setLoading(false) }
  }, [raw])

  useEffect(() => { load() }, [load])

  const route: string[] = useMemo(() => {
    const r = (batch?.process_route?.length ? batch.process_route : order?.process_route) || []
    return r.filter(Boolean)
  }, [batch, order])

  const stages = useMemo(() => route.map((code, idx) => {
    const bp = (batch?.batch_processes || []).find((p: any) => sameCode(p.process_code, code))
    const enter = batch?.fms_enter_at?.[canonicalCode(code)]
      || Object.entries(batch?.fms_enter_at || {}).find(([k]) => sameCode(k, code))?.[1] as string | undefined
      || (idx === 0 ? batch?.sent_at : undefined)
    const col = dateColFor(code)
    const planned = col && plan?.[col] ? String(plan[col]).slice(0, 10) : ''
    const isCurrent = sameCode(batch?.current_process, code) && batch?.status !== 'done'
    const status: string = bp?.status === 'done' ? 'done'
      : bp?.status === 'faulty' ? 'faulty' : bp?.status === 'fob' ? 'fob'
      : isCurrent ? 'here' : 'pending'
    const doneAt = bp?.done_at || null
    const doneDay = doneAt ? new Date(doneAt).toLocaleDateString('en-CA') : ''
    const today = new Date().toLocaleDateString('en-CA')
    const late = !!planned && (doneDay ? doneDay > planned : status === 'here' && today > planned)
    return { code, name: procs[code] || code, status, enter: enter || null, doneAt, planned, late }
  }), [route, batch, plan, procs])

  if (!raw) return null

  return (
    <div className="content" style={{ maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800 }}>🔍 Batch Trace</div>
          <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 2 }}>The full journey of a batch through every process</div>
        </div>
        <form onSubmit={e => { e.preventDefault(); if (search.trim()) router.push(`/batches/${encodeURIComponent(search.trim().toUpperCase())}`) }}
          style={{ display: 'flex', gap: 6 }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Another batch, e.g. DYE26-0004-B1"
            style={{ width: 240, padding: '6px 10px', fontSize: 13 }} />
          <button className="small primary" type="submit">Trace</button>
          <Link href="/batches/search"><button className="small" type="button">Search list</button></Link>
        </form>
      </div>

      {loading ? (
        <div className="card"><div className="empty-state">Loading {raw}…</div></div>
      ) : error ? (
        <div className="card"><div className="empty-state">{error} <Link href="/batches/search">Search batches</Link></div></div>
      ) : batch && (
        <>
          {/* Header */}
          <div className="card" style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
              <div>
                <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--accent)' }}>{batch.batch_id}</div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>
                  Order <strong>{order?.order_number || '—'}</strong> · {order?.party || '—'} · {order?.article || '—'} · {order?.color || '—'}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <StatusBadge status={batch.is_faulty ? 'faulty' : batch.status} />
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 6 }}>
                  {batch.current_process ? <>Now at <strong>{procs[batch.current_process] || batch.current_process}</strong></> : batch.status === 'done' ? 'All processes finished' : 'Not at any process'}
                </div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 10, marginTop: 14 }}>
              {[
                ['Kg', batch.kg], ['Mtr', batch.mtr || '—'], ['Taka', batch.taka || '—'],
                ['Machine', batch.machines?.name || '—'], ['Supervisor', order?.supervisors?.name || '—'],
                ['Created', fmtD(batch.created_at)], ['Planned dispatch', fmtD(plan?.d_dispatch || plan?.d_finaldispatch)],
              ].map(([k, v]) => (
                <div key={String(k)} style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: '8px 12px' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>{k}</div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{String(v ?? '—')}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Route timeline */}
          <div className="card" style={{ marginBottom: 14 }}>
            <div className="card-title" style={{ marginBottom: 10 }}>Route</div>
            {!stages.length ? <div className="empty-state">No route set for this batch.</div> : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-secondary)' }}>
                      {['#', 'Process', 'Status', 'Planned', 'Arrived', 'Done', 'Time there', ''].map(h => (
                        <th key={h} style={{ textAlign: 'left', padding: '8px 10px', fontSize: 10, textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {stages.map((s, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border-light)', background: s.status === 'here' ? 'rgba(59,130,246,0.06)' : undefined }}>
                        <td style={td}>{i + 1}</td>
                        <td style={{ ...td, fontWeight: 600 }}>
                          <Link href={`/fms/${encodeURIComponent(s.code)}`}>{s.name}</Link>
                          <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}> · {s.code}</span>
                        </td>
                        <td style={td}><StatusBadge status={s.status} /></td>
                        <td style={td}>{fmtD(s.planned)}</td>
                        <td style={td}>{fmtDT(s.enter)}</td>
                        <td style={td}>{fmtDT(s.doneAt)}</td>
                        <td style={td}>{s.enter ? dur(s.enter, s.doneAt) : '—'}</td>
                        <td style={{ ...td, color: s.late ? 'var(--danger)' : 'var(--success)', fontWeight: 600 }}>
                          {s.planned && (s.doneAt || s.status === 'here') ? (s.late ? 'Late' : 'On time') : ''}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Faulty / FOB / repairs */}
          {(faulty.length > 0 || fob.length > 0 || repairs.length > 0 || related.length > 0) && (
            <div className="card" style={{ marginBottom: 14 }}>
              <div className="card-title" style={{ marginBottom: 10 }}>Faulty, FOB and repairs</div>
              {faulty.map(r => (
                <Line key={r.id} color="#DC2626" title={`Faulty at ${procs[r.process_code] || r.process_code} — ${r.faulty_type || 'faulty'} · ${r.faulty_kg ?? '?'} Kg`}
                  sub={`${fmtDT(r.created_at)} · status: ${r.status}${r.notes ? ' · ' + r.notes : ''}`} href="/faulty" />
              ))}
              {fob.map(r => (
                <Line key={r.id} color="#7C3AED" title={`FOB at ${procs[r.process_code] || r.process_code} — ${r.fob_type || ''} · ${r.fob_kg ?? '?'} Kg`}
                  sub={`${fmtDT(r.created_at)} · status: ${r.status}${r.sent_at ? ' · sent ' + fmtD(r.sent_at) : ''}${r.approved_at ? ' · approved ' + fmtD(r.approved_at) : ''}`} href="/fob" />
              ))}
              {repairs.map(r => (
                <Line key={r.id} color="#D97706" title={`Repair order — ${r.repair_kg ?? '?'} Kg (${r.reprocess_type || 'full'}, from ${r.source_type || 'faulty'})`}
                  sub={`${fmtDT(r.created_at)} · status: ${r.status}`} href="/repairing-order" />
              ))}
              {related.map(x => (
                <Line key={x.id} color="var(--accent)" title={`${x.batch_id} — ${x.kg} Kg · ${x.status}`}
                  sub={x.batch_id.startsWith(batch.batch_id) ? 'Repair batch made from this batch' : 'Original batch this was repaired from'}
                  href={`/batches/${encodeURIComponent(x.batch_id)}`} />
              ))}
            </div>
          )}

          {/* History */}
          <div className="card">
            <div className="card-title" style={{ marginBottom: 10 }}>History</div>
            {!history.length ? (
              <div className="empty-state">No recorded actions yet for this batch.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {history.map(h => (
                  <div key={h.id} style={{ display: 'flex', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--border-light)', fontSize: 12 }}>
                    <div style={{ width: 120, flexShrink: 0, color: 'var(--text-tertiary)' }}>{fmtDT(h.created_at)}</div>
                    <div style={{ flex: 1 }}>
                      <strong>{ACTION_LABEL[h.action] || h.action}</strong>
                      {(h.old_value || h.new_value) && (
                        <span style={{ color: 'var(--text-secondary)' }}>
                          {' '}{h.old_value ? `${procs[h.old_value] || h.old_value} → ` : ''}{h.new_value ? (procs[h.new_value] || h.new_value) : ''}
                        </span>
                      )}
                      {h.note && <span style={{ color: 'var(--text-tertiary)' }}> · {h.note}</span>}
                    </div>
                    <div style={{ color: 'var(--text-tertiary)', flexShrink: 0 }}>{h.username || ''}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

const td: React.CSSProperties = { padding: '8px 10px', verticalAlign: 'middle' }

const BADGE: Record<string, [string, string, string]> = {
  done:         ['var(--success-light)', 'var(--success)', 'Done'],
  here:         ['#DBEAFE', '#1D4ED8', 'Here now'],
  'in-process': ['#DBEAFE', '#1D4ED8', 'In process'],
  pending:      ['var(--bg-secondary)', 'var(--text-tertiary)', 'Pending'],
  faulty:       ['#FEE2E2', '#991B1B', 'Faulty'],
  fob:          ['#EDE9FE', '#5B21B6', 'FOB'],
  repairing:    ['#FEF3C7', '#92400E', 'Repairing'],
  hold:         ['#FEE2E2', '#991B1B', 'Hold'],
}
function StatusBadge({ status }: { status: string }) {
  const [bg, fg, label] = BADGE[status] || ['var(--bg-secondary)', 'var(--text-secondary)', status || '—']
  return <span style={{ padding: '3px 9px', borderRadius: 10, background: bg, color: fg, fontSize: 11, fontWeight: 700 }}>{label}</span>
}

function Line({ color, title, sub, href }: { color: string; title: string; sub: string; href: string }) {
  return (
    <Link href={href} style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}>
      <div style={{ borderLeft: `3px solid ${color}`, padding: '6px 12px', marginBottom: 8, background: 'var(--bg-secondary)', borderRadius: 6 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{title}</div>
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{sub}</div>
      </div>
    </Link>
  )
}
