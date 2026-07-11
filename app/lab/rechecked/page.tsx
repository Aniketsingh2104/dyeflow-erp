'use client'

import { useEffect, useState, useCallback } from 'react'
import { labApi, labPost, StatCard, IssuesModal, fmtDateTime, genIssueId } from '../_shared'

// Rechecked = isRecheck requests
export default function RecheckedLabPage() {
  const [requests, setRequests] = useState<any[]>([])
  const [issues,   setIssues]   = useState<any[]>([])
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)
  const [toast,    setToast]    = useState('')
  const [issuesModal, setIssuesModal] = useState<string|null>(null)

  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3000) }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [reqRes, issRes] = await Promise.all([
        labApi({ type: 'requests', recheck: '1' }),
        labApi({ type: 'issues' }),
      ])
      if (reqRes.ok) setRequests(reqRes.data || [])
      if (issRes.ok) setIssues(issRes.data  || [])
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const confirm = async (id: string) => {
    if (!confirm('Confirm this recheck to move to FMS?')) return
    setSaving(true)
    try {
      await labPost({ action: 'confirm_request', id })
      showToast('✓ Confirmed')
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

  const openCount = (id: string) => issues.filter(i => i.request_id === id && !i.solved).length

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '60vh', color: 'var(--text-tertiary)', fontSize: 14 }}>Loading…</div>
  )

  return (
    <div className="content" style={{ padding: '16px 20px' }}>
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <StatCard label="Recheck Requests" value={requests.length}                         color="var(--purple)" />
        <StatCard label="Pending"          value={requests.filter(r=>!r.confirmed).length} color="var(--warning)" />
        <StatCard label="In FMS"           value={requests.filter(r=>r.confirmed).length}  color="var(--success)" />
      </div>

      {toast && (
        <div style={{ background: 'var(--success-light)', color: 'var(--success)',
          border: '1px solid var(--success)', borderRadius: 8, padding: '8px 14px',
          marginBottom: 10, fontSize: 13, fontWeight: 600 }}>{toast}</div>
      )}

      <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)',
        borderRadius: 10, overflow: 'auto' }}>
        {requests.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-tertiary)', fontSize: 14 }}>
            No rechecked lab requests yet.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1000 }}>
            <thead style={{ background: 'var(--bg-secondary)' }}>
              <tr>
                {['Recheck No','Linked Request','Date','Unit','Party','Shade/Pantone','Recheck Remark','Issues','Status','Actions'].map(h => (
                  <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontSize: 10,
                    fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase',
                    letterSpacing: '0.05em', borderBottom: '1px solid var(--border-light)',
                    whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {requests.map((r, i) => (
                <tr key={r.id} style={{
                  background: i % 2 === 0 ? 'var(--bg-primary)' : 'var(--bg-secondary)',
                  borderBottom: '1px solid var(--border-light)' }}>
                  <td style={{ ...td, fontWeight: 700, color: 'var(--purple)' }}>{r.id}</td>
                  <td style={td}>{r.recheck_from_request_id || '-'}</td>
                  <td style={{ ...td, fontSize: 11, color: 'var(--text-tertiary)' }}>{fmtDateTime(r.created_at)}</td>
                  <td style={td}>{r.unit || '-'}</td>
                  <td style={{ ...td, fontWeight: 500 }}>{r.party || '-'}</td>
                  <td style={td}>{r.shade_pantone || '-'}</td>
                  <td style={td}>{r.recheck_remark || '-'}</td>
                  <td style={td}>
                    <span style={{ padding: '3px 9px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                      background: openCount(r.id) > 0 ? 'var(--warning-light)' : 'var(--success-light)',
                      color: openCount(r.id) > 0 ? 'var(--warning)' : 'var(--success)' }}>
                      {openCount(r.id) > 0 ? `${openCount(r.id)} Open` : 'Clear'}
                    </span>
                  </td>
                  <td style={td}>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 4,
                      background: r.confirmed ? 'var(--purple-light)' : 'var(--warning-light)',
                      color: r.confirmed ? 'var(--purple)' : 'var(--warning)' }}>
                      {r.confirmed ? 'In FMS' : 'Pending'}
                    </span>
                  </td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>
                    {!r.confirmed && <button className="xs primary" disabled={saving} onClick={() => confirm(r.id)}>Confirm</button>}
                    <button className="xs" style={{ marginLeft: r.confirmed ? 0 : 4 }} onClick={() => setIssuesModal(r.id)}>Issues</button>
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
