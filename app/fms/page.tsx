'use client'
/**
 * /fms — FMS overview: one card per process (Process Master order) showing
 *   • batches at that process now
 *   • how many are late (planned date for that process has passed)
 *   • how many are stuck (there longer than the process's default days,
 *     timed from batches.fms_enter_at)
 *   • steps done today at that process
 *   • open faulty / FOB reported at that process
 * Click a card to open that process's FMS page.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { canonicalCode, dateColFor, sameCode } from '@/lib/processCodes'

interface Proc { code: string; name: string; display_order: number; default_days: number; is_enabled: boolean }
interface CardData {
  code: string; name: string
  atNow: number; kg: number; late: number; stuck: number; doneToday: number
  faulty: number; fob: number; oldestDays: number | null
}

const COLORS = ['#3B82F6', '#10B981', '#8B5CF6', '#06B6D4', '#F59E0B', '#EC4899', '#6366F1', '#059669', '#EF4444', '#0EA5E9']
const todayStr = () => new Date().toLocaleDateString('en-CA')   // YYYY-MM-DD, local time

export default function FmsOverviewPage() {
  const router = useRouter()
  const [cards,   setCards]   = useState<CardData[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')
  const [updated, setUpdated] = useState('')
  const [onlyActive, setOnlyActive] = useState(false)

  const load = useCallback(async () => {
    setError('')
    try {
      const get = (u: string) => fetch(u, { cache: 'no-store' }).then(r => r.json()).catch(() => ({ ok: false, data: [] }))
      const [pRes, bRes, dpRes, fRes, fobRes] = await Promise.all([
        get('/api/processes'), get('/api/batches'), get('/api/date-plans'), get('/api/faulty'), get('/api/fob'),
      ])
      if (!pRes.ok || !bRes.ok) throw new Error(pRes.error || bRes.error || 'Could not load data')

      const procs: Proc[] = (pRes.data || []).filter((p: Proc) => p.is_enabled)
        .sort((a: Proc, b: Proc) => (a.display_order || 0) - (b.display_order || 0))
      const known = procs.map(p => p.code)
      const batches: any[] = bRes.data || []
      const plans: Record<string, any> = {}
      for (const dp of dpRes.data || []) plans[dp.batch_id] = dp
      const today = todayStr()
      const now = Date.now()

      const out: CardData[] = procs.map(p => {
        const code = p.code
        const here = batches.filter(b => b.status !== 'done' && sameCode(b.current_process, code))
        let late = 0, stuck = 0, oldest: number | null = null
        for (const b of here) {
          const col = dateColFor(code)
          const planned = col && plans[b.id]?.[col] ? String(plans[b.id][col]).slice(0, 10) : ''
          if (planned && planned < today) late++
          const enter = b.fms_enter_at?.[canonicalCode(code, known)] || b.fms_enter_at?.[code] || b.sent_at
          if (enter) {
            const days = Math.floor((now - new Date(enter).getTime()) / 86400000)
            if (days > (p.default_days || 1)) stuck++
            if (oldest === null || days > oldest) oldest = days
          }
        }
        const doneToday = batches.filter(b => (b.batch_processes || []).some((bp: any) =>
          sameCode(bp.process_code, code) && bp.status === 'done' && bp.done_at &&
          new Date(bp.done_at).toLocaleDateString('en-CA') === today)).length
        return {
          code, name: p.name || code,
          atNow: here.length,
          kg: Math.round(here.reduce((s, b) => s + (parseFloat(b.kg) || 0), 0)),
          late, stuck, doneToday, oldestDays: oldest,
          faulty: (fRes.data || []).filter((r: any) => sameCode(r.process_code, code) && (r.status || 'open') === 'open').length,
          fob:    (fobRes.data || []).filter((r: any) => sameCode(r.process_code, code) && ['open', 'sent'].includes(r.status || 'open')).length,
        }
      })
      setCards(out)
      setUpdated(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }))
    } catch (e: any) {
      setError(e?.message || String(e))
    } finally { setLoading(false) }
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(load, 120_000)
    const h = () => load()
    window.addEventListener('dyeflow-db-updated', h)
    return () => { clearInterval(t); window.removeEventListener('dyeflow-db-updated', h) }
  }, [load])

  const totals = useMemo(() => cards.reduce((t, c) => ({
    atNow: t.atNow + c.atNow, late: t.late + c.late, stuck: t.stuck + c.stuck, doneToday: t.doneToday + c.doneToday,
  }), { atNow: 0, late: 0, stuck: 0, doneToday: 0 }), [cards])

  const shown = onlyActive ? cards.filter(c => c.atNow > 0 || c.faulty > 0 || c.fob > 0) : cards

  return (
    <div className="content">
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <div>
            <span className="card-title">FMS Overview</span>
            <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>
              Where every running batch is right now. Late = planned date for that process has passed ·
              Stuck = there longer than the process&apos;s normal days.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {updated && <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Updated {updated}</span>}
            <label style={{ fontSize: 12, display: 'flex', gap: 4, alignItems: 'center', cursor: 'pointer' }}>
              <input type="checkbox" checked={onlyActive} onChange={e => setOnlyActive(e.target.checked)} /> Only busy
            </label>
            <button className="small" onClick={load}>↻ Refresh</button>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 10 }}>
          {[
            { label: 'Batches running',  value: totals.atNow,     color: 'var(--accent)' },
            { label: 'Late',             value: totals.late,      color: totals.late ? 'var(--danger)' : undefined },
            { label: 'Stuck',            value: totals.stuck,     color: totals.stuck ? '#D97706' : undefined },
            { label: 'Steps done today', value: totals.doneToday, color: 'var(--success)' },
          ].map(s => (
            <div key={s.label} style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: '10px 14px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.label}</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: s.color || 'var(--text-primary)' }}>{s.value}</div>
            </div>
          ))}
        </div>
      </div>

      {error && <div className="card" style={{ color: 'var(--danger)', marginBottom: 16 }}>⚠ {error}</div>}

      {loading && !cards.length ? (
        <div className="card"><div className="empty-state">Loading…</div></div>
      ) : shown.length === 0 ? (
        <div className="card"><div className="empty-state">
          {cards.length ? 'No batches are running at any process right now.' : 'No processes yet — add them in Process Master.'}
        </div></div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
          {shown.map((c, i) => {
            const color = COLORS[i % COLORS.length]
            const go = () => router.push(`/fms/${encodeURIComponent(c.code)}`)
            return (
              <div key={c.code} role="link" tabIndex={0} onClick={go}
                onKeyDown={e => { if (e.key === 'Enter') go() }}
                style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderLeft: `4px solid ${color}`,
                  borderRadius: 12, padding: 16, cursor: 'pointer' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700 }}>{c.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{c.code} · {c.kg.toLocaleString('en-IN')} Kg here</div>
                  </div>
                  <div style={{ fontSize: 28, fontWeight: 800, color: c.atNow ? color : 'var(--text-tertiary)' }}>{c.atNow}</div>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, fontSize: 11 }}>
                  {c.late > 0      && <Pill bg="var(--danger-light)" fg="var(--danger)">{c.late} late</Pill>}
                  {c.stuck > 0     && <Pill bg="#FEF3C7" fg="#92400E">{c.stuck} stuck</Pill>}
                  {c.faulty > 0    && <Pill bg="#FEE2E2" fg="#991B1B">{c.faulty} faulty</Pill>}
                  {c.fob > 0       && <Pill bg="#EDE9FE" fg="#5B21B6">{c.fob} FOB</Pill>}
                  {c.doneToday > 0 && <Pill bg="var(--success-light)" fg="var(--success)">{c.doneToday} done today</Pill>}
                  {c.atNow === 0 && c.doneToday === 0 && !c.faulty && !c.fob && <span style={{ color: 'var(--text-tertiary)' }}>Nothing here</span>}
                </div>
                {c.oldestDays !== null && c.atNow > 0 && (
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 8 }}>
                    Oldest batch here: {c.oldestDays === 0 ? 'arrived today' : `${c.oldestDays} day${c.oldestDays === 1 ? '' : 's'}`}
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

function Pill({ bg, fg, children }: { bg: string; fg: string; children: React.ReactNode }) {
  return <span style={{ padding: '2px 8px', borderRadius: 10, background: bg, color: fg, fontWeight: 600 }}>{children}</span>
}
