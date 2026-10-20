'use client'

/**
 * Mobile FMS — live Supabase version.
 *
 * Previously this page read and wrote browser localStorage only, so "Mark as
 * Done" on a phone never reached the database. It now uses exactly the same
 * server actions as the desktop FMS page (app/fms/[process]/page.tsx):
 *   • Done   → /api/batches  action 'process_done'  (moves batch to next process)
 *   • Faulty → /api/batches  action 'mark_faulty'   (creates faulty record)
 * and the same collab hold (lib/collab.ts) — a batch can't be marked Done or
 * Faulty while its collab partners haven't arrived at this process yet.
 */

import { useEffect, useState, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { getBatches, getOrders, getProcessList, markProcessDone, markBatchFaulty } from '@/lib/db'
import { collabBlockMessage } from '@/lib/collab'
import { SubProdTag } from '@/components/SubProd'

interface ProcOpt { code: string; name: string; allowFaulty: boolean }

interface FmsRow {
  id: string            // batch uuid
  batchId: string       // e.g. DYE26-0102-B1
  subProd: string       // Sub Prod No. ('' = none)
  orderId: string
  orderNo: string
  party: string
  article: string
  color: string
  kg: string
  machine: string
  routeCode: string     // exact process code as stored on the batch route
  next?: string
  plannedDate: string
  doneAt: string
  isDone: boolean
  raw: any
}

// process code → batch_date_plans column (accepts both old and new spellings)
const PROC_COL: Record<string, string> = {
  C:'d_c', S:'d_s', H:'d_h', D:'d_d', S2:'d_s2', Rx:'d_rx', O:'d_o',
  G:'d_g', F:'d_f', Co:'d_co', Tu:'d_tu', Add:'d_add', Lev:'d_level', Level:'d_level',
  Rc:'d_rc', Fix:'d_fix', Wash:'d_wash', Dry:'d_dry', B:'d_b', R:'d_r', K:'d_k',
  Qa:'d_qa', QA:'d_qa', Packing:'d_packing', Dispatch:'d_dispatch',
}
const procCol = (code: string) =>
  PROC_COL[code] || PROC_COL[Object.keys(PROC_COL).find(k => k.toUpperCase() === code.toUpperCase()) || ''] || ''

const same = (a?: string | null, b?: string | null) =>
  !!a && !!b && a.toUpperCase() === b.toUpperCase()

const fmt = (d: string) => {
  if (!d) return '-'
  const [y, m, dd] = d.slice(0, 10).split('-')
  return y && m && dd ? `${dd}-${m}-${y}` : d
}

function FmsContent() {
  const searchParams   = useSearchParams()
  const initialProcess = searchParams.get('process') || ''

  const [processes, setProcesses]   = useState<ProcOpt[]>([])
  const [selected,  setSelected]    = useState(initialProcess)
  const [rows,      setRows]        = useState<FmsRow[]>([])
  const [allBatches, setAllBatches] = useState<any[]>([])
  const [loading,   setLoading]     = useState(false)
  const [saving,    setSaving]      = useState(false)
  const [search,    setSearch]      = useState('')
  const [alertMsg,  setAlertMsg]    = useState<{ text: string; ok: boolean } | null>(null)
  const [faultyRow, setFaultyRow]   = useState<FmsRow | null>(null)
  const [faultyReason, setFaultyReason] = useState('')

  const flash = (text: string, ok = true) => {
    setAlertMsg({ text, ok })
    setTimeout(() => setAlertMsg(null), ok ? 3000 : 6000)
  }

  // ── Process list from Supabase ────────────────────────────────────────────
  useEffect(() => {
    getProcessList().then(({ data }) => {
      const list: ProcOpt[] = (data || [])
        .filter((p: any) => p.is_enabled !== false)
        .map((p: any) => ({ code: p.code, name: p.name || p.code, allowFaulty: p.allow_faulty !== false }))
      setProcesses(list)
      // URL ?process=add → match the real code case-insensitively
      const hit = initialProcess ? list.find(p => same(p.code, initialProcess)) : null
      if (hit) setSelected(hit.code)
      else if (list.length) setSelected(list[0].code)
    })
  }, [initialProcess])

  // ── Load batches for the selected process ─────────────────────────────────
  const load = useCallback(async (code: string) => {
    if (!code) return
    setLoading(true)
    try {
      const [bRes, oRes, dpRes] = await Promise.all([
        getBatches(),
        getOrders(),
        fetch('/api/date-plans', { cache: 'no-store' }).then(r => r.json()).catch(() => ({ data: [] })),
      ])
      const batches: any[] = bRes.data || []
      setAllBatches(batches)
      const orderMap: Record<string, any> = {}
      for (const o of oRes.data || []) orderMap[o.id] = o
      const dpMap: Record<string, any> = {}
      for (const dp of dpRes.data || []) dpMap[dp.batch_id] = dp
      const col = procCol(code)

      const out: FmsRow[] = []
      for (const b of batches) {
        const bp = (b.batch_processes || []).find((p: any) => same(p.process_code, code))
        const active   = same(b.current_process, code) && b.status === 'in-process'
        const doneHere = bp?.status === 'done'
        if (!active && !doneHere) continue

        const o = orderMap[b.order_id] || {}
        const route: string[] = (b.process_route?.length ? b.process_route : o.process_route) || []
        const idx = route.findIndex(c => same(c, code))
        const routeCode = idx >= 0 ? route[idx] : (b.current_process || code)
        const dp = dpMap[b.id] || {}

        out.push({
          id:          b.id,
          batchId:     b.batch_id || '-',
          subProd:     b.sub_prod_no || '',
          orderId:     b.order_id,
          orderNo:     o.order_number || '-',
          party:       o.party   || '-',
          article:     o.article || '-',
          color:       o.color   || '-',
          kg:          String(b.kg ?? '-'),
          machine:     b.machines?.name || '-',
          routeCode,
          next:        idx >= 0 ? route[idx + 1] : undefined,
          plannedDate: col && dp[col] ? String(dp[col]).slice(0, 10) : '',
          doneAt:      bp?.done_at ? String(bp.done_at).slice(0, 10) : '',
          isDone:      !active && doneHere,
          raw:         b,
        })
      }
      // pending first (earliest planned date first), then done (latest first)
      out.sort((a, b) => {
        if (a.isDone !== b.isDone) return a.isDone ? 1 : -1
        if (!a.isDone) return (a.plannedDate || '9999').localeCompare(b.plannedDate || '9999')
        return (b.doneAt || '').localeCompare(a.doneAt || '')
      })
      setRows(out)
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { if (selected) load(selected) }, [selected, load])

  // Refresh when another screen changes data
  useEffect(() => {
    const h = () => { if (selected) load(selected) }
    window.addEventListener('dyeflow-db-updated', h)
    return () => window.removeEventListener('dyeflow-db-updated', h)
  }, [selected, load])

  const procName = (code: string) => processes.find(p => same(p.code, code))?.name || code
  const current  = processes.find(p => same(p.code, selected))

  // ── Actions (same server actions as desktop FMS) ──────────────────────────
  const markDone = async (r: FmsRow) => {
    if (r.isDone || saving) return
    const block = collabBlockMessage(r.raw, r.routeCode, allBatches)
    if (block) { flash(block, false); return }
    const nextTxt = r.next ? `\nIt will move to ${procName(r.next)}.` : '\nThis is the last process — the batch will be completed.'
    if (!confirm(`Mark ${r.batchId} DONE in ${procName(r.routeCode)}?${nextTxt}`)) return
    setSaving(true)
    try {
      const { error, next_process } = await markProcessDone(r.id, r.routeCode, r.next)
      if (error) { flash('Not saved: ' + error, false); load(selected); return }
      flash(`✅ ${r.batchId} ${next_process ? '→ ' + procName(next_process) : 'completed'}`)
      load(selected)
    } finally { setSaving(false) }
  }

  const submitFaulty = async () => {
    const r = faultyRow
    if (!r || !faultyReason.trim() || saving) return
    const block = collabBlockMessage(r.raw, r.routeCode, allBatches)
    if (block) { flash(block, false); setFaultyRow(null); return }
    setSaving(true)
    try {
      const { error } = await markBatchFaulty({
        batch_id:     r.id,
        order_id:     r.orderId,
        order_number: r.orderNo,
        party:        r.party,
        color:        r.color,
        faulty_type:  faultyReason.trim(),
        faulty_kg:    parseFloat(r.kg) || 0,
        process_code: r.routeCode,
      })
      if (error) { flash('Not saved: ' + error, false); return }
      flash(`⚠ ${r.batchId} marked faulty`)
      setFaultyRow(null); setFaultyReason('')
      load(selected)
    } finally { setSaving(false) }
  }

  const filtered = rows.filter(r => {
    if (!search.trim()) return true
    const s = search.toLowerCase()
    return [r.batchId, r.subProd, r.orderNo, r.party, r.color, r.article].some(v => v.toLowerCase().includes(s))
  })
  const pending = filtered.filter(r => !r.isDone)
  const done    = filtered.filter(r => r.isDone).slice(0, 30)
  const today   = new Date().toLocaleDateString('en-CA') // YYYY-MM-DD in local time

  return (
    <div style={{ minHeight: '100vh', background: '#F1F5F9' }}>
      {/* Header */}
      <div style={{ background: '#185FA5', padding: '16px 16px 0', position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>FMS</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>{pending.length} pending · {done.length} done</div>
          </div>
          <button
            onClick={() => selected && load(selected)}
            style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', borderRadius: 8, padding: '6px 12px', fontSize: 13 }}
          >
            ↻ Refresh
          </button>
        </div>

        {/* Process selector — horizontal scroll */}
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 12, WebkitOverflowScrolling: 'touch' }}>
          {processes.map(p => (
            <button
              key={p.code}
              onClick={() => setSelected(p.code)}
              style={{
                flexShrink: 0, padding: '6px 14px', borderRadius: 20, border: 'none',
                fontSize: 12, fontWeight: 600, cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
                background: same(selected, p.code) ? '#fff' : 'rgba(255,255,255,0.15)',
                color:      same(selected, p.code) ? '#185FA5' : '#fff',
              }}
            >
              {p.name}
            </button>
          ))}
        </div>
      </div>

      {/* Search */}
      <div style={{ padding: '10px 12px 4px' }}>
        <div style={{ position: 'relative' }}>
          <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }}>🔍</span>
          <input
            type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search batch, order, party…"
            style={{ width: '100%', padding: '11px 12px 11px 36px', fontSize: 14, border: '1px solid #E2E8F0', borderRadius: 10, background: '#fff', outline: 'none', boxSizing: 'border-box' }}
          />
        </div>
      </div>

      {/* Result message */}
      {alertMsg && (
        <div style={{
          margin: '8px 12px 0', borderRadius: 10, padding: '12px 16px', fontSize: 14, fontWeight: 600, textAlign: 'center',
          background: alertMsg.ok ? '#D1FAE5' : '#FEE2E2', color: alertMsg.ok ? '#065F46' : '#991B1B',
        }}>
          {alertMsg.text}
        </div>
      )}

      {loading && rows.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#94A3B8' }}>Loading…</div>
      ) : (
        <div style={{ paddingTop: 8 }}>
          {pending.length > 0 && (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '8px 16px 4px' }}>
                Pending ({pending.length})
              </div>
              {pending.map(r => {
                const overdue = !!r.plannedDate && r.plannedDate < today
                return (
                  <div key={r.id} style={{ background: '#fff', margin: '0 12px 10px', borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', borderLeft: `4px solid ${overdue ? '#EF4444' : '#185FA5'}` }}>
                    <div style={{ padding: '14px 14px 10px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                        <div>
                          <div style={{ fontSize: 16, fontWeight: 700, color: '#185FA5' }}>{r.batchId}<SubProdTag value={r.subProd} /></div>
                          <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>{r.orderNo} · {r.party}</div>
                        </div>
                        {overdue && (
                          <span style={{ fontSize: 10, fontWeight: 700, background: '#FEE2E2', color: '#991B1B', padding: '3px 8px', borderRadius: 20 }}>OVERDUE</span>
                        )}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px', fontSize: 12, color: '#64748B' }}>
                        <div><span style={{ color: '#94A3B8' }}>Article </span>{r.article}</div>
                        <div><span style={{ color: '#94A3B8' }}>Color </span>{r.color}</div>
                        <div><span style={{ color: '#94A3B8' }}>Qty </span><strong style={{ color: '#1A1A18' }}>{r.kg} Kg</strong></div>
                        <div><span style={{ color: '#94A3B8' }}>Planned </span>{fmt(r.plannedDate)}</div>
                        <div><span style={{ color: '#94A3B8' }}>Machine </span>{r.machine}</div>
                        <div><span style={{ color: '#94A3B8' }}>Next </span>{r.next ? procName(r.next) : 'Complete'}</div>
                      </div>
                    </div>
                    <div style={{ padding: '0 14px 14px', display: 'flex', gap: 8 }}>
                      <button
                        onClick={() => markDone(r)} disabled={saving}
                        style={{
                          flex: 1, padding: '13px', fontSize: 14, fontWeight: 700,
                          background: '#059669', color: '#fff', border: 'none', borderRadius: 10,
                          cursor: 'pointer', opacity: saving ? 0.6 : 1, WebkitTapHighlightColor: 'transparent',
                        }}
                      >
                        ✓ Mark as Done
                      </button>
                      {current?.allowFaulty !== false && (
                        <button
                          onClick={() => { setFaultyRow(r); setFaultyReason('') }} disabled={saving}
                          style={{
                            padding: '13px 14px', fontSize: 14, fontWeight: 700,
                            background: '#FEE2E2', color: '#991B1B', border: 'none', borderRadius: 10,
                            cursor: 'pointer', opacity: saving ? 0.6 : 1, WebkitTapHighlightColor: 'transparent',
                          }}
                        >
                          ⚠ Faulty
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </>
          )}

          {done.length > 0 && (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '8px 16px 4px' }}>
                Completed here ({done.length})
              </div>
              {done.map(r => (
                <div key={r.id} style={{ background: '#F0FDF4', margin: '0 12px 8px', borderRadius: 12, padding: '12px 14px', boxShadow: '0 1px 2px rgba(0,0,0,0.04)', borderLeft: '4px solid #059669' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#065F46' }}>{r.batchId}<SubProdTag value={r.subProd} /></div>
                      <div style={{ fontSize: 11, color: '#059669', marginTop: 2 }}>{r.orderNo} · {r.party} · {r.kg} Kg · {fmt(r.doneAt)}</div>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, background: '#D1FAE5', color: '#065F46', padding: '4px 10px', borderRadius: 20 }}>✓ Done</span>
                  </div>
                </div>
              ))}
            </>
          )}

          {filtered.length === 0 && !loading && (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: '#94A3B8' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>⚙</div>
              <div style={{ fontSize: 14 }}>No batches in {current?.name || selected} right now.</div>
            </div>
          )}
        </div>
      )}

      {/* Faulty reason sheet */}
      {faultyRow && (
        <div onClick={() => setFaultyRow(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 100, display: 'flex', alignItems: 'flex-end' }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: '#fff', width: '100%', borderRadius: '16px 16px 0 0', padding: 16, boxSizing: 'border-box' }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Mark {faultyRow.batchId} faulty</div>
            <div style={{ fontSize: 12, color: '#64748B', marginBottom: 12 }}>
              {procName(faultyRow.routeCode)} · {faultyRow.kg} Kg
            </div>
            <input
              autoFocus value={faultyReason} onChange={e => setFaultyReason(e.target.value)}
              placeholder="Fault reason (e.g. shade variation, patchy)"
              style={{ width: '100%', padding: '12px', fontSize: 15, border: '1px solid #E2E8F0', borderRadius: 10, boxSizing: 'border-box', marginBottom: 12 }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setFaultyRow(null)}
                style={{ flex: 1, padding: 13, fontSize: 14, borderRadius: 10, border: '1px solid #E2E8F0', background: '#fff' }}>
                Cancel
              </button>
              <button onClick={submitFaulty} disabled={!faultyReason.trim() || saving}
                style={{ flex: 1, padding: 13, fontSize: 14, fontWeight: 700, borderRadius: 10, border: 'none', background: '#DC2626', color: '#fff', opacity: !faultyReason.trim() || saving ? 0.5 : 1 }}>
                {saving ? 'Saving…' : 'Mark Faulty'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function MobileFmsPage() {
  return (
    <Suspense fallback={<div style={{ textAlign: 'center', padding: '60px 20px', color: '#94A3B8' }}>Loading…</div>}>
      <FmsContent />
    </Suspense>
  )
}
