'use client'
// Submitted = confirmed requests that have had 1st Submission marked on the
// Lab FMS page (fms_data.firstSubmissionAt set) — shows the full picture
// with all Indent/Request details plus the Lab Number(s) entered.
import { useEffect, useState, useCallback } from 'react'
import { labApi, StatCard, fmtDateTime } from '../_shared'

export default function LabSubmittedPage() {
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
        const submitted = (reqRes.data || []).filter((r: any) => r.confirmed && r.fms_data?.firstSubmissionAt)
        setRequests(submitted)
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
        <StatCard label="Submitted"      value={requests.length}                                    color="var(--accent)" />
        <StatCard label="With Delivery"  value={requests.filter(r=>r.fms_data?.deliveryDate).length} color="var(--success)" />
        <StatCard label="Lab Approved"   value={requests.filter(r=>r.fms_data?.labApprovalAt).length} color="#8E24AA" />
      </div>
      <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)',
        borderRadius: 10, overflow: 'auto' }}>
        {requests.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-tertiary)', fontSize: 14 }}>
            No submitted requests yet. Tick 1st Submission in Lab FMS page.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1500, fontSize: 11 }}>
            <thead style={{ background: 'var(--bg-secondary)' }}>
              <tr>
                {['Request No','Indent No','Date','Unit','Party','Quality','Request Given By','Order Status','Branch',
                  'Light Source','Yarn Design','Shade/Pantone','Fastness','Fastness Remark','Other Remark',
                  'Chart No','Delivery Date','Lab No(s)','1st Submission','Lab Approval','L Value','A Value','B Value','DE Value','Remark'].map(h => (
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
                  <td style={{ ...td, fontWeight: 700, color: 'var(--accent)' }}>{r.id}</td>
                  <td style={td}>{r.indent_id || '-'}</td>
                  <td style={{ ...td, fontSize: 11, color: 'var(--text-tertiary)' }}>{fmtDateTime(r.confirmed_at || r.created_at)}</td>
                  <td style={td}>{r.unit || '-'}</td>
                  <td style={{ ...td, fontWeight: 500 }}>{r.party || '-'}</td>
                  <td style={td}>{r.quality || '-'}</td>
                  <td style={td}>{indentById(r.indent_id)?.request_given_by || '-'}</td>
                  <td style={td}>{indentById(r.indent_id)?.order_status || '-'}</td>
                  <td style={td}>{indentById(r.indent_id)?.branch || '-'}</td>
                  <td style={td}>{r.light_source === 'Other' ? (r.light_source_other || 'Other') : (r.light_source || '-')}</td>
                  <td style={td}>{r.yarn_design || '-'}</td>
                  <td style={td}>{r.shade_pantone || '-'}</td>
                  <td style={td}>{r.fastness_type || '-'}</td>
                  <td style={{ ...td, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.fastness_remark || '-'}</td>
                  <td style={{ ...td, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.other_remark || '-'}</td>
                  <td style={{ ...td, fontWeight: 700, color: 'var(--success)' }}>{fd.chartNumber || '-'}</td>
                  <td style={td}>{fd.deliveryDate || '-'}</td>
                  <td style={{ ...td, whiteSpace: 'normal', minWidth: 100 }}>
                    {fd.labNumbers?.length > 0 ? (
                      <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                        {fd.labNumbers.map((ln: string, idx: number) => (
                          <span key={idx} style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px',
                            borderRadius: 6, background: '#E65100', color: '#fff' }}>{ln}</span>
                        ))}
                      </div>
                    ) : '-'}
                  </td>
                  <td style={{ ...td, fontSize: 11 }}>{fmtDateTime(fd.firstSubmissionAt)}</td>
                  <td style={{ ...td, fontSize: 11 }}>{fd.labApprovalAt ? fmtDateTime(fd.labApprovalAt) : '-'}</td>
                  <td style={td}>{fd.lValue || '-'}</td>
                  <td style={td}>{fd.aValue || '-'}</td>
                  <td style={td}>{fd.bValue || '-'}</td>
                  <td style={td}>{fd.deValue || '-'}</td>
                  <td style={{ ...td, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis' }}>{fd.remark || '-'}</td>
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
