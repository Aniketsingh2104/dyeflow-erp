'use client'
// Approval = confirmed requests with DE <= threshold (approved)
import { useEffect, useState, useCallback } from 'react'
import { labApi, StatCard, fmtDateTime } from '../_shared'

export default function LabApprovalPage() {
  const [requests, setRequests] = useState<any[]>([])
  const [loading,  setLoading]  = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await labApi({ type: 'requests' })
      if (res.ok) {
        // Approved = confirmed + has chart + DE value filled
        const approved = (res.data || []).filter((r: any) =>
          r.confirmed && r.fms_data?.chartNumber && r.fms_data?.deValue
        )
        setRequests(approved)
      }
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '60vh', color: 'var(--text-tertiary)', fontSize: 14 }}>Loading…</div>
  )

  return (
    <div className="content" style={{ padding: '16px 20px' }}>
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <StatCard label="Approved"       value={requests.length}                                                    color="var(--success)" />
        <StatCard label="Avg DE"         value={requests.length ? (requests.reduce((s,r)=>s+(parseFloat(r.fms_data?.deValue)||0),0)/requests.length).toFixed(2) : '—'} color="var(--accent)" />
      </div>
      <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)',
        borderRadius: 10, overflow: 'auto' }}>
        {requests.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-tertiary)', fontSize: 14 }}>
            No approved lab requests yet.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 800 }}>
            <thead style={{ background: 'var(--bg-secondary)' }}>
              <tr>
                {['Request No','Date','Unit','Party','Shade/Pantone','Chart No','DE Value','Delivery Date','L*','a*','b*'].map(h => (
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
                  <td style={{ ...td, fontWeight: 700, color: 'var(--success)' }}>{r.id}</td>
                  <td style={{ ...td, fontSize: 11, color: 'var(--text-tertiary)' }}>{fmtDateTime(r.confirmed_at)}</td>
                  <td style={td}>{r.unit || '-'}</td>
                  <td style={{ ...td, fontWeight: 500 }}>{r.party || '-'}</td>
                  <td style={td}>{r.shade_pantone || '-'}</td>
                  <td style={{ ...td, fontWeight: 700 }}>{r.fms_data?.chartNumber || '-'}</td>
                  <td style={{ ...td, fontWeight: 700, color: parseFloat(r.fms_data?.deValue) <= 1 ? 'var(--success)' : 'var(--warning)' }}>{r.fms_data?.deValue || '-'}</td>
                  <td style={td}>{r.fms_data?.deliveryDate || '-'}</td>
                  <td style={td}>{r.fms_data?.lValue || '-'}</td>
                  <td style={td}>{r.fms_data?.aValue || '-'}</td>
                  <td style={td}>{r.fms_data?.bValue || '-'}</td>
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
