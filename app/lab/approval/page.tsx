'use client'
// Lab Approval = requests approved on the Submitted page (fms_data.labDecision
// === 'approved'), showing the specific Lab Number that was selected.
import { useEffect, useState, useCallback } from 'react'
import { labApi, StatCard, fmtDateTime } from '../_shared'

export default function LabApprovalPage() {
  const [requests, setRequests] = useState<any[]>([])
  const [indents,  setIndents]  = useState<any[]>([])
  const [loading,  setLoading]  = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [reqRes, indRes] = await Promise.all([
        labApi({ type: 'requests' }),
        labApi({ type: 'indents' }),
      ])
      if (reqRes.ok) {
        const approved = (reqRes.data || []).filter((r: any) => r.fms_data?.labDecision === 'approved')
        setRequests(approved)
      }
      if (indRes.ok) setIndents(indRes.data || [])
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const indentById = (id: string) => indents.find(ind => ind.id === id)

  // Only blank the page on the true first load; actions here call load()
  // again afterward, which would otherwise wipe the whole page every time.
  if (loading && requests.length === 0) return (
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
            No approved lab requests yet. Approve one on the Submitted page.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1300, fontSize: 11 }}>
            <thead style={{ background: 'var(--bg-secondary)' }}>
              <tr>
                {['Request No','Indent No','Date','Unit','Party','Quality','Request Given By','Order Status','Branch',
                  'Shade/Pantone','Chart No','Approved Lab No','Delivery Date','L*','a*','b*','DE Value','Approved At'].map(h => (
                  <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontSize: 9,
                    fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase',
                    letterSpacing: '0.04em', borderBottom: '1px solid var(--border-light)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {requests.map((r, i) => {
                const fd = r.fms_data || {}
                return (
                <tr key={r.id} style={{
                  background: i % 2 === 0 ? 'var(--bg-primary)' : 'var(--bg-secondary)',
                  borderBottom: '1px solid var(--border-light)' }}>
                  <td style={{ ...td, fontWeight: 700, color: 'var(--success)' }}>{r.id}</td>
                  <td style={td}>{r.indent_id || '-'}</td>
                  <td style={{ ...td, fontSize: 11, color: 'var(--text-tertiary)' }}>{fmtDateTime(r.confirmed_at || r.created_at)}</td>
                  <td style={td}>{r.unit || '-'}</td>
                  <td style={{ ...td, fontWeight: 500 }}>{r.party || '-'}</td>
                  <td style={td}>{r.quality || '-'}</td>
                  <td style={td}>{indentById(r.indent_id)?.request_given_by || '-'}</td>
                  <td style={td}>{indentById(r.indent_id)?.order_status || '-'}</td>
                  <td style={td}>{indentById(r.indent_id)?.branch || '-'}</td>
                  <td style={td}>{r.shade_pantone || '-'}</td>
                  <td style={{ ...td, fontWeight: 700 }}>{fd.chartNumber || '-'}</td>
                  <td style={td}>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                      background: 'var(--success)', color: '#fff' }}>{fd.approvedLabNumber || '-'}</span>
                  </td>
                  <td style={td}>{fd.deliveryDate || '-'}</td>
                  <td style={td}>{fd.lValue || '-'}</td>
                  <td style={td}>{fd.aValue || '-'}</td>
                  <td style={td}>{fd.bValue || '-'}</td>
                  <td style={{ ...td, fontWeight: 700, color: parseFloat(fd.deValue) <= 1 ? 'var(--success)' : 'var(--warning)' }}>{fd.deValue || '-'}</td>
                  <td style={{ ...td, fontSize: 11, color: 'var(--text-tertiary)' }}>{fmtDateTime(fd.labApprovalAt)}</td>
                </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

const td: React.CSSProperties = { padding: '7px 10px', fontSize: 11, color: 'var(--text-primary)', whiteSpace: 'nowrap' }
