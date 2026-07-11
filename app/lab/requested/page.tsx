'use client'

import { useEffect, useState, useCallback } from 'react'
import { labApi, labPost, StatCard, IssuesModal, fmtDateTime, genIssueId } from '../_shared'

export default function LabRequestedPage() {
  const [requests, setRequests] = useState<any[]>([])
  const [issues,   setIssues]   = useState<any[]>([])
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)
  const [toast,    setToast]    = useState('')
  const [issuesModal, setIssuesModal] = useState<string|null>(null)
  const [filter,   setFilter]   = useState('')

  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3000) }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [reqRes, issRes] = await Promise.all([
        labApi({ type: 'requests', recheck: '0' }),
        labApi({ type: 'issues' }),
      ])
      if (reqRes.ok) setRequests(reqRes.data || [])
      if (issRes.ok) setIssues(issRes.data  || [])
    } finally { setLoading(false) }
  }, [])

  useEffect(() => {
    load()
    const h = () => load()
    window.addEventListener('dyeflow-db-updated', h)
    return () => window.removeEventListener('dyeflow-db-updated', h)
  }, [load])

  const pending = requests.filter(r => !r.confirmed)
  const filtered = filter
    ? pending.filter(r => r.indent_id?.toLowerCase().includes(filter.toLowerCase()) ||
        r.party?.toLowerCase().includes(filter.toLowerCase()))
    : pending

  const openCount = (reqId: string) => issues.filter(i => i.request_id === reqId && !i.solved).length

  const confirm = async (id: string) => {
    if (!confirm(`Confirm this request to move to FMS?`)) return
    setSaving(true)
    try {
      const res = await labPost({ action: 'confirm_request', id })
      if (!res.ok) { alert('Error: ' + res.error); return }
      showToast('✓ Moved to FMS')
      load()
    } finally { setSaving(false) }
  }

  const toggleIssue = async (id: string) => {
    await labPost({ action: 'toggle_issue', id })
    const res = await labApi({ type: 'issues' })
    if (res.ok) setIssues(res.data || [])
  }

  const addIssue = async (requestId: string, desc: string, priority: string) => {
    const all = await labApi({ type: 'issues' })
    const newId = genIssueId(all.data || [])
    await labPost({ action: 'create_issue', id: newId, requestId, description: desc, priority })
    const res = await labApi({ type: 'issues' })
    if (res.ok) setIssues(res.data || [])
    showToast('✓ Issue raised')
  }

  const today = pending.filter(r => new Date(r.created_at).toDateString() === new Date().toDateString()).length
  const openTotal = issues.filter(i => !i.solved && pending.some(r => r.id === i.request_id)).length
  const confirmed = requests.filter(r => r.confirmed).length

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '60vh', color: 'var(--text-tertiary)', fontSize: 14 }}>Loading…</div>
  )

  return (
    <div className="content" style={{ padding: '16px 20px' }}>
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <StatCard label="Pending Requests" value={pending.length}  color="var(--success)" />
        <StatCard label="Created Today"    value={today}           color="var(--accent)" />
        <StatCard label="Open Issues"      value={openTotal}       color="var(--warning)" />
        <StatCard label="Moved to FMS"     value={confirmed}       color="var(--purple)" />
        <StatCard label="All Requests"     value={requests.length} color="var(--text-secondary)" />
      </div>

      {toast && (
        <div style={{ background: 'var(--success-light)', color: 'var(--success)',
          border: '1px solid var(--success)', borderRadius: 8, padding: '8px 14px',
          marginBottom: 10, fontSize: 13, fontWeight: 600 }}>{toast}</div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
        <input value={filter} onChange={e => setFilter(e.target.value)}
          placeholder="Filter by indent / party…"
          style={{ width: 240, padding: '6px 10px', fontSize: 12,
            border: '1px solid var(--border-medium)', borderRadius: 5,
            background: 'var(--bg-primary)', color: 'var(--text-primary)' }} />
        {filter && <button className="xs" onClick={() => setFilter('')}>✕</button>}
        <button className="small" onClick={load} style={{ marginLeft: 'auto' }}>⟳</button>
      </div>

      <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)',
        borderRadius: 10, overflow: 'auto' }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-tertiary)', fontSize: 14 }}>
            No pending requests.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1400 }}>
            <thead style={{ background: 'var(--bg-secondary)' }}>
              <tr>
                {['Lab Request No','Indent No','Date','Unit','Party','Quality','Light Source','Yarn Design','Shade/Pantone','Fastness','Remark','Issues','Actions'].map(h => (
                  <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontSize: 10,
                    fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase',
                    letterSpacing: '0.05em', borderBottom: '1px solid var(--border-light)',
                    whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <tr key={r.id} style={{
                  background: i % 2 === 0 ? 'var(--bg-primary)' : 'var(--bg-secondary)',
                  borderBottom: '1px solid var(--border-light)' }}>
                  <td style={{ ...td, fontWeight: 700, color: 'var(--accent)' }}>{r.id}</td>
                  <td style={td}>{r.indent_id || '-'}</td>
                  <td style={{ ...td, fontSize: 11, color: 'var(--text-tertiary)' }}>{fmtDateTime(r.created_at)}</td>
                  <td style={td}>{r.unit || '-'}</td>
                  <td style={{ ...td, fontWeight: 500 }}>{r.party || '-'}</td>
                  <td style={td}>{r.quality || '-'}</td>
                  <td style={td}>{r.light_source === 'Other' ? (r.light_source_other || 'Other') : (r.light_source || '-')}</td>
                  <td style={td}>{r.yarn_design || '-'}</td>
                  <td style={td}>{r.shade_pantone || '-'}</td>
                  <td style={td}>{r.fastness_type || '-'}</td>
                  <td style={{ ...td, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.other_remark || r.fastness_remark || '-'}</td>
                  <td style={td}>
                    <span style={{ padding: '3px 9px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                      background: openCount(r.id) > 0 ? 'var(--warning-light)' : 'var(--success-light)',
                      color: openCount(r.id) > 0 ? 'var(--warning)' : 'var(--success)' }}>
                      {openCount(r.id) > 0 ? `${openCount(r.id)} Open` : 'Clear'}
                    </span>
                  </td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>
                    <button className="xs primary" disabled={saving} onClick={() => confirm(r.id)}>Confirm</button>
                    <button className="xs" style={{ marginLeft: 4 }} onClick={() => setIssuesModal(r.id)}>Issues</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {issuesModal && (
        <IssuesModal requestId={issuesModal} onClose={() => setIssuesModal(null)}
          allIssues={issues} onToggle={toggleIssue}
          onAdd={(desc, pri) => addIssue(issuesModal, desc, pri)} />
      )}
    </div>
  )
}

const td: React.CSSProperties = { padding: '10px 12px', fontSize: 12, color: 'var(--text-primary)' }
