'use client'
// With Issue = requests that have open issues
import { useEffect, useState, useCallback } from 'react'
import { labApi, labPost, StatCard, IssuesModal, fmtDateTime, genIssueId } from '../_shared'

export default function LabWithIssuePage() {
  const [requests, setRequests] = useState<any[]>([])
  const [issues,   setIssues]   = useState<any[]>([])
  const [loading,  setLoading]  = useState(true)
  const [toast,    setToast]    = useState('')
  const [issuesModal, setIssuesModal] = useState<string|null>(null)

  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3000) }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [reqRes, issRes] = await Promise.all([
        labApi({ type: 'requests' }),
        labApi({ type: 'issues' }),
      ])
      const allIssues = issRes.data || []
      setIssues(allIssues)
      // Only requests that have at least one open issue
      const withIssue = (reqRes.data || []).filter((r: any) =>
        allIssues.some((i: any) => i.request_id === r.id && !i.solved)
      )
      setRequests(withIssue)
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const openCount = (id: string) => issues.filter(i => i.request_id === id && !i.solved).length

  const toggleIssue = async (id: string) => {
    await labPost({ action: 'toggle_issue', id })
    load()
  }

  const addIssue = async (requestId: string, desc: string, priority: string) => {
    const all = await labApi({ type: 'issues' })
    const newId = genIssueId(all.data || [])
    await labPost({ action: 'create_issue', id: newId, requestId, description: desc, priority })
    showToast('✓ Issue raised')
    load()
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '60vh', color: 'var(--text-tertiary)', fontSize: 14 }}>Loading…</div>
  )

  return (
    <div className="content" style={{ padding: '16px 20px' }}>
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <StatCard label="With Open Issues" value={requests.length}                                                  color="var(--danger)" />
        <StatCard label="Total Open Issues" value={issues.filter(i=>!i.solved).length}                             color="var(--warning)" />
      </div>

      {toast && (
        <div style={{ background: 'var(--success-light)', color: 'var(--success)',
          border: '1px solid var(--success)', borderRadius: 8, padding: '8px 14px',
          marginBottom: 10, fontSize: 13, fontWeight: 600 }}>{toast}</div>
      )}

      <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)',
        borderRadius: 10, overflow: 'auto' }}>
        {requests.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 48, color: 'var(--success)', fontSize: 15, fontWeight: 600 }}>
            ✓ No open issues right now.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
            <thead style={{ background: 'var(--bg-secondary)' }}>
              <tr>
                {['Request No','Date','Unit','Party','Shade/Pantone','Open Issues','Status','Actions'].map(h => (
                  <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontSize: 10,
                    fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase',
                    letterSpacing: '0.05em', borderBottom: '1px solid var(--border-light)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {requests.map((r, i) => (
                <tr key={r.id} style={{
                  background: i % 2 === 0 ? 'var(--bg-primary)' : 'var(--bg-secondary)',
                  borderBottom: '1px solid var(--border-light)' }}>
                  <td style={{ ...td, fontWeight: 700, color: 'var(--danger)' }}>{r.id}</td>
                  <td style={{ ...td, fontSize: 11, color: 'var(--text-tertiary)' }}>{fmtDateTime(r.created_at)}</td>
                  <td style={td}>{r.unit || '-'}</td>
                  <td style={{ ...td, fontWeight: 500 }}>{r.party || '-'}</td>
                  <td style={td}>{r.shade_pantone || '-'}</td>
                  <td style={td}>
                    <span style={{ padding: '3px 9px', borderRadius: 4, fontSize: 12, fontWeight: 700,
                      background: 'var(--danger-light)', color: 'var(--danger)' }}>
                      {openCount(r.id)} Open
                    </span>
                  </td>
                  <td style={td}>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 4,
                      background: r.confirmed ? 'var(--success-light)' : 'var(--warning-light)',
                      color: r.confirmed ? 'var(--success)' : 'var(--warning)' }}>
                      {r.confirmed ? 'In FMS' : 'Pending'}
                    </span>
                  </td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>
                    <button className="xs danger" onClick={() => setIssuesModal(r.id)}>View Issues</button>
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
