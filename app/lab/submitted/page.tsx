'use client'
// Submitted = confirmed requests that have had 1st Submission marked on the
// Lab FMS page (fms_data.firstSubmissionAt set).
import { useEffect, useState, useCallback } from 'react'
import { labApi, StatCard, fmtDateTime } from '../_shared'

export default function LabSubmittedPage() {
  const [requests, setRequests] = useState<any[]>([])
  const [loading,  setLoading]  = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await labApi({ type: 'requests' })
      if (res.ok) {
        const submitted = (res.data || []).filter((r: any) => r.confirmed && r.fms_data?.firstSubmissionAt)
        setRequests(submitted)
      }
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  // Only blank the page on the true first load; actions here call load()
  // again afterward, which would otherwise wipe the whole page every time.
  if (loading && requests.length === 0) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '60vh', color: 'var(--text-tertiary)', fontSize: 14 }}>Loading…</div>
  )

  return (
    <div className="content" style={{ padding: '16px 20px' }}>
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <StatCard label="Submitted"      value={requests.length}                                    color="var(--accent)" />
        <StatCard label="With Delivery"  value={requests.filter(r=>r.fms_data?.deliveryDate).length} color="var(--success)" />
      </div>
      <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)',
        borderRadius: 10, overflow: 'auto' }}>
        {requests.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-tertiary)', fontSize: 14 }}>
            No submitted requests yet. Use Submit ✓ (1st Submission) in Lab FMS page.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
            <thead style={{ background: 'var(--bg-secondary)' }}>
              <tr>
                {['Request No','Date','Unit','Party','Shade/Pantone','Chart No','1st Submission','Delivery Date','DE Value','Remark'].map(h => (
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
                  <td style={{ ...td, fontWeight: 700, color: 'var(--accent)' }}>{r.id}</td>
                  <td style={{ ...td, fontSize: 11, color: 'var(--text-tertiary)' }}>{fmtDateTime(r.confirmed_at)}</td>
                  <td style={td}>{r.unit || '-'}</td>
                  <td style={{ ...td, fontWeight: 500 }}>{r.party || '-'}</td>
                  <td style={td}>{r.shade_pantone || '-'}</td>
                  <td style={{ ...td, fontWeight: 700, color: 'var(--success)' }}>{r.fms_data?.chartNumber || '-'}</td>
                  <td style={{ ...td, fontSize: 11 }}>{fmtDateTime(r.fms_data?.firstSubmissionAt)}</td>
                  <td style={td}>{r.fms_data?.deliveryDate || '-'}</td>
                  <td style={td}>{r.fms_data?.deValue || '-'}</td>
                  <td style={td}>{r.fms_data?.remark || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

const td: React.CSSProperties = { padding: '10px 12px', fontSize: 12, color: 'var(--text-primary)' }
