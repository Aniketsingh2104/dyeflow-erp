'use client'
// Leave Requests — a user asks for leave; an approver approves it with a COVER
// user and the pages that pass to the cover for those days (lib/leaveCover.ts).
// The cover gets those pages on top of their own only while the leave runs.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchPageList, type PageDef } from '@/lib/permissions'
import { useAutoRefresh, RefreshStamp } from '@/components/useAutoRefresh'

const NEVER = ['/setup', '/leave/approve']
const transferable = (p: string) => !NEVER.some(n => p === n || p.startsWith(n + '/'))
const dmy = (ymd?: string | null) => (ymd ? ymd.slice(0, 10).split('-').reverse().join('/') : '—')
const dt = (iso?: string | null) => {
  if (!iso) return ''
  const d = new Date(iso); if (isNaN(d.getTime())) return ''
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
const days = (a: string, b: string) => Math.round((Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))) / 86400000) + 1
const rights = (p: any) => [p?.view || p?.edit || p?.delete ? 'View' : '', p?.edit ? 'Edit' : '', p?.delete ? 'Delete' : ''].filter(Boolean).join(' + ')

const STATUS: Record<string, { bg: string; fg: string; label: string }> = {
  pending:   { bg: '#FEF3C7', fg: '#92400E', label: '⏳ Pending' },
  approved:  { bg: '#D1FAE5', fg: '#065F46', label: '✓ Approved' },
  rejected:  { bg: '#FEE2E2', fg: '#991B1B', label: '✕ Rejected' },
  cancelled: { bg: '#F3F4F6', fg: '#6B7280', label: 'Cancelled' },
}

export default function LeavePage() {
  const [data, setData] = useState<any>(null)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<'mine' | 'approve' | 'all'>('mine')
  const [pageDefs, setPageDefs] = useState<PageDef[]>([])
  const [reqOpen, setReqOpen] = useState(false)
  const [review, setReview] = useState<any>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/leave', { cache: 'no-store' }).then(x => x.json())
      if (!r.ok) { setError(r.error || 'Could not load'); return }
      setError(''); setData(r)
    } catch { setError('Network error') }
  }, [])
  useEffect(() => { load(); fetchPageList().then(setPageDefs).catch(() => {}) }, [load])
  useAutoRefresh(load)
  useEffect(() => { if (data?.me?.isApprover && data.queue?.length && tab === 'mine' && !data.mine?.length) setTab('approve') }, [data]) // eslint-disable-line

  const labelOf = useMemo(() => {
    const m = new Map(pageDefs.map(p => [p.path, `${p.group} · ${p.label}`]))
    return (path: string) => m.get(path) || path
  }, [pageDefs])

  const post = async (body: any, okMsg?: string) => {
    setBusy(true)
    try {
      const r = await fetch('/api/leave', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        .then(x => x.json()).catch(() => ({ ok: false, error: 'Network error' }))
      if (!r.ok) { alert(r.error || 'Failed'); if (r.stale) load(); return false }
      if (okMsg) alert(okMsg)
      await load()
      return true
    } finally { setBusy(false) }
  }

  if (error && !data) return <div className="content"><div className="card" style={{ padding: 24, color: '#991B1B' }}>⚠ {error}</div></div>
  if (!data) return <div className="content" style={{ textAlign: 'center', padding: 60, color: 'var(--text-tertiary)' }}>Loading…</div>

  const me = data.me
  const rows: any[] = tab === 'mine' ? data.mine : tab === 'approve' ? data.queue : data.all
  const actionsFor = (l: any) => {
    const out: React.ReactElement[] = []
    const own = l.user_id === me.id
    if (tab === 'approve' && l.status === 'pending' && (!own || me.isAdmin))
      out.push(<button key="r" className="small primary" disabled={busy} onClick={() => setReview(l)}>Review</button>)
    if (l.status === 'pending' && (own || me.isApprover))
      out.push(<button key="c" className="small" disabled={busy} onClick={() => confirm(`Cancel leave ${dmy(l.from_date)} – ${dmy(l.to_date)} for ${l.username}?`) && post({ action: 'cancel', id: l.id })}>Cancel</button>)
    if (l.status === 'approved' && me.isApprover && l.from_date > data.today)
      out.push(<button key="c2" className="small" disabled={busy} onClick={() => confirm(`Cancel the approved leave of ${l.username} (${dmy(l.from_date)} – ${dmy(l.to_date)})? The cover will not start.`) && post({ action: 'cancel', id: l.id })}>Cancel</button>)
    if (l.status === 'approved' && me.isApprover && l.from_date <= data.today && l.to_date >= data.today)
      out.push(<button key="e" className="small" disabled={busy} onClick={() => confirm(`${l.username} is back today? The cover by ${l.cover_username} ends today.`) && post({ action: 'end_today', id: l.id })}>End leave today</button>)
    return out
  }

  return (
    <div className="content" style={{ padding: '12px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <span style={{ fontSize: 17, fontWeight: 800 }}>🏖 Leave Requests</span>
        <span style={{ flex: 1 }} />
        <RefreshStamp />
        <button className="small" onClick={load}>⟳ Refresh</button>
        <button className="small primary" onClick={() => setReqOpen(true)}>+ Request Leave</button>
      </div>

      {/* today */}
      {(data.coveringToday?.length > 0 || data.onLeaveToday?.length > 0) && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
          {data.coveringToday.map((c: any) => (
            <div key={c.leave_id} style={{ flex: '1 1 320px', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 10, padding: '10px 14px', fontSize: 13 }}>
              <div style={{ fontWeight: 700, color: '#1D4ED8' }}>You are covering {c.username} until {dmy(c.to_date)}</div>
              <div style={{ fontSize: 12, color: '#1E3A8A', marginTop: 4 }}>Added to your menu for these days: {c.pages.map(labelOf).join(' · ') || '—'}</div>
            </div>
          ))}
          {data.onLeaveToday?.length > 0 && (
            <div style={{ flex: '1 1 320px', background: 'var(--bg-secondary)', border: '1px solid var(--border-light)', borderRadius: 10, padding: '10px 14px', fontSize: 13 }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>On leave today</div>
              {data.onLeaveToday.map((l: any) => (
                <div key={l.id} style={{ fontSize: 12 }}>🏖 <strong>{l.username}</strong> till {dmy(l.to_date)} · covered by <strong>{l.cover_username || '—'}</strong></div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        {([['mine', `My requests (${data.mine.length})`], ...(me.isApprover ? [['approve', `To approve (${data.queue.length})`], ['all', 'All']] : [])] as [typeof tab, string][]).map(([k, l]) => (
          <button key={k} className="small" onClick={() => setTab(k)}
            style={{ background: tab === k ? 'var(--accent)' : undefined, color: tab === k ? '#fff' : undefined, borderColor: tab === k ? 'var(--accent)' : undefined, fontWeight: tab === k ? 700 : 500 }}>{l}</button>
        ))}
      </div>

      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        {rows.length === 0 ? (
          <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-tertiary)' }}>
            {tab === 'mine' ? 'No leave requests yet — use "+ Request Leave".' : tab === 'approve' ? '✓ Nothing waiting for approval.' : 'No leave requests.'}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--bg-secondary)' }}>
                {['Employee', 'From', 'To', 'Days', 'Reason', 'Cover', 'Pages', 'Status', 'Decided', 'Actions'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '8px 10px', fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border-light)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(l => {
                const st = STATUS[l.status] || STATUS.pending
                const live = l.status === 'approved' && l.from_date <= data.today && l.to_date >= data.today
                const pages = Object.keys(l.pages || {})
                return (
                  <tr key={l.id} style={{ borderBottom: '1px solid var(--border-light)', background: live ? '#F0FDF4' : undefined }}>
                    <td style={{ padding: '8px 10px', fontWeight: 700, whiteSpace: 'nowrap' }}>{l.username}
                      {l.requested_by && l.requested_by !== l.username && <div style={{ fontSize: 10, fontWeight: 500, color: 'var(--text-tertiary)' }}>asked by {l.requested_by}</div>}
                    </td>
                    <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>{dmy(l.from_date)}</td>
                    <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>{dmy(l.to_date)}</td>
                    <td style={{ padding: '8px 10px' }}>{days(l.from_date, l.to_date)}</td>
                    <td style={{ padding: '8px 10px', maxWidth: 240 }}>{l.reason}</td>
                    <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>{l.cover_username || (l.status === 'pending' && l.suggested_cover_id
                      ? <span style={{ color: 'var(--text-tertiary)' }}>suggested: {data.users.find((u: any) => u.id === l.suggested_cover_id)?.username || '—'}</span> : '—')}</td>
                    <td style={{ padding: '8px 10px', maxWidth: 260 }} title={pages.map(labelOf).join('\n')}>
                      {pages.length ? <span>{pages.length} page{pages.length === 1 ? '' : 's'} <span style={{ color: 'var(--text-tertiary)' }}>· {pages.slice(0, 2).map(p => labelOf(p).split(' · ').pop()).join(', ')}{pages.length > 2 ? '…' : ''}</span></span> : '—'}
                    </td>
                    <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                      <span style={{ background: st.bg, color: st.fg, padding: '2px 9px', borderRadius: 12, fontSize: 11, fontWeight: 700 }}>{st.label}</span>
                      {live && <div style={{ fontSize: 10, fontWeight: 700, color: '#065F46', marginTop: 2 }}>on leave now</div>}
                    </td>
                    <td style={{ padding: '8px 10px', fontSize: 11, color: 'var(--text-secondary)', maxWidth: 220 }}>
                      {l.decided_by ? <>{l.decided_by} · {dt(l.decided_at)}</> : l.cancelled_by ? <>cancelled by {l.cancelled_by} · {dt(l.cancelled_at)}</> : '—'}
                      {l.decision_note && <div style={{ color: 'var(--text-tertiary)' }}>“{l.decision_note}”</div>}
                    </td>
                    <td style={{ padding: '8px 10px' }}><div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>{actionsFor(l)}</div></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {reqOpen && <RequestModal data={data} busy={busy} onClose={() => setReqOpen(false)}
        onSave={async b => { if (await post({ action: 'request', ...b }, '✓ Leave requested — waiting for approval.')) setReqOpen(false) }} />}
      {review && <ReviewModal leave={review} data={data} pageDefs={pageDefs} labelOf={labelOf} busy={busy} onClose={() => setReview(null)}
        onApprove={async b => { if (await post({ action: 'approve', id: review.id, ...b }, `✓ Approved — ${review.username}'s pages go to the cover for ${dmy(review.from_date)} – ${dmy(review.to_date)}.`)) setReview(null) }}
        onReject={async note => { if (await post({ action: 'reject', id: review.id, note })) setReview(null) }} />}
    </div>
  )
}

function RequestModal({ data, busy, onClose, onSave }: { data: any; busy: boolean; onClose: () => void; onSave: (b: any) => void }) {
  const [userId, setUserId] = useState(data.me.id)
  const [from, setFrom] = useState(data.today)
  const [to, setTo] = useState(data.today)
  const [reason, setReason] = useState('')
  const [cover, setCover] = useState('')
  const others = data.users.filter((u: any) => u.id !== userId)
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 460 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header"><span className="modal-title">🏖 Request Leave</span><button className="small" onClick={onClose}>✕</button></div>
        {data.me.isApprover && (
          <div className="form-group"><label>For</label>
            <select value={userId} onChange={e => { setUserId(e.target.value); if (cover === e.target.value) setCover('') }}>
              {data.users.map((u: any) => <option key={u.id} value={u.id}>{u.username}{u.id === data.me.id ? ' (me)' : ''}</option>)}
            </select>
          </div>
        )}
        <div style={{ display: 'flex', gap: 10 }}>
          <div className="form-group" style={{ flex: 1 }}><label>From</label>
            <input type="date" value={from} min={data.me.isAdmin ? undefined : data.today} onChange={e => { setFrom(e.target.value); if (to < e.target.value) setTo(e.target.value) }} /></div>
          <div className="form-group" style={{ flex: 1 }}><label>To</label>
            <input type="date" value={to} min={from} onChange={e => setTo(e.target.value)} /></div>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: '-4px 0 10px' }}>{from && to && to >= from ? `${days(from, to)} day${days(from, to) === 1 ? '' : 's'} (full days)` : ''}</div>
        <div className="form-group"><label>Reason</label>
          <textarea rows={2} value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Family function" /></div>
        <div className="form-group"><label>Suggested cover <span style={{ fontWeight: 400, color: 'var(--text-tertiary)' }}>(optional — the approver decides)</span></label>
          <select value={cover} onChange={e => setCover(e.target.value)}>
            <option value="">— None —</option>
            {others.map((u: any) => <option key={u.id} value={u.id}>{u.username}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose}>Cancel</button>
          <button className="primary" disabled={busy || !from || !to || to < from || !reason.trim()}
            onClick={() => onSave({ user_id: userId, from_date: from, to_date: to, reason, suggested_cover_id: cover || null })}>{busy ? 'Saving…' : 'Send request'}</button>
        </div>
      </div>
    </div>
  )
}

function ReviewModal({ leave, data, pageDefs, labelOf, busy, onClose, onApprove, onReject }: {
  leave: any; data: any; pageDefs: PageDef[]; labelOf: (p: string) => string; busy: boolean
  onClose: () => void; onApprove: (b: any) => void; onReject: (note: string) => void
}) {
  // the requester's pages (an admin requester: any page except Setup)
  const offered: { path: string; perm: any }[] = useMemo(() => {
    if (leave.requester_pages) return Object.entries(leave.requester_pages).map(([path, perm]) => ({ path, perm }))
    return pageDefs.filter(p => transferable(p.path)).map(p => ({ path: p.path, perm: { view: true, edit: true, delete: true } }))
  }, [leave, pageDefs])
  const [cover, setCover] = useState(leave.suggested_cover_id || '')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  useEffect(() => { setPicked(new Set(offered.map(o => o.path))) }, [offered])
  const [note, setNote] = useState('')
  const others = data.users.filter((u: any) => u.id !== leave.user_id)
  const toggle = (p: string) => setPicked(prev => { const n = new Set(prev); n.has(p) ? n.delete(p) : n.add(p); return n })
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 620 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header"><span className="modal-title">Review leave — {leave.username}</span><button className="small" onClick={onClose}>✕</button></div>
        <div style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 13 }}>
          <strong>{dmy(leave.from_date)} – {dmy(leave.to_date)}</strong> · {days(leave.from_date, leave.to_date)} day(s)
          <div style={{ color: 'var(--text-secondary)', marginTop: 4 }}>“{leave.reason}”</div>
        </div>
        <div className="form-group"><label>Cover person</label>
          <select value={cover} onChange={e => setCover(e.target.value)}>
            <option value="">— Pick who does the work —</option>
            {others.map((u: any) => <option key={u.id} value={u.id}>{u.username}{u.id === leave.suggested_cover_id ? ' (suggested)' : ''}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
          <label style={{ fontWeight: 700, fontSize: 12 }}>Pages that go to the cover for these days</label>
          <span style={{ flex: 1 }} />
          <button className="xs" onClick={() => setPicked(new Set(offered.map(o => o.path)))}>All</button>
          <button className="xs" onClick={() => setPicked(new Set())}>None</button>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 6 }}>
          {leave.requester_is_admin ? `${leave.username} is an admin — tick only the pages the cover really needs.` : `${leave.username}'s own rights on each page.`} Setup pages never pass to a cover.
        </div>
        <div style={{ maxHeight: 260, overflowY: 'auto', border: '1px solid var(--border-light)', borderRadius: 8, padding: 6, marginBottom: 12 }}>
          {offered.length === 0 && <div style={{ padding: 10, color: 'var(--text-tertiary)' }}>{leave.username} has no pages that can pass to a cover.</div>}
          {offered.map(o => (
            <label key={o.path} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 6px', fontSize: 12, cursor: 'pointer' }}>
              <input type="checkbox" checked={picked.has(o.path)} onChange={() => toggle(o.path)} style={{ width: 'auto', margin: 0 }} />
              <span style={{ flex: 1 }}>{labelOf(o.path)}</span>
              <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>{rights(o.perm)}</span>
            </label>
          ))}
        </div>
        <div className="form-group"><label>Note <span style={{ fontWeight: 400, color: 'var(--text-tertiary)' }}>(optional)</span></label>
          <input value={note} onChange={e => setNote(e.target.value)} /></div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button onClick={onClose}>Close</button>
          <button disabled={busy} style={{ color: '#991B1B', borderColor: '#FCA5A5' }}
            onClick={() => confirm(`Reject ${leave.username}'s leave?`) && onReject(note)}>✕ Reject</button>
          <button className="primary" disabled={busy || !cover || picked.size === 0}
            onClick={() => onApprove({ cover_user_id: cover, pages: [...picked], note })}>{busy ? 'Saving…' : `✓ Approve · ${picked.size} page${picked.size === 1 ? '' : 's'} to cover`}</button>
        </div>
      </div>
    </div>
  )
}
