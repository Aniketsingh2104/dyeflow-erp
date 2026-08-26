'use client'
// Lab FMS — confirmed requests (both Sample Received + Parameters OK done on
// the Requested page), tracked in the same visual format as the Greige
// Register (colored section headers, each with Planned/Actual/Status/Delay).
// Delivery Date sits as a plain field beside Chart No (not its own tracked
// section) — only two tracked sections remain: Greige RFS Fabric Received
// and 1st Submission. Planned columns are placeholders ("-") until the
// timing rule (anchor + offset per stage) is defined.

import { useEffect, useState, useCallback } from 'react'
import { labApi, labPost, StatCard, fmtDateTime } from '../_shared'

export default function LabFmsPage() {
  const [requests, setRequests] = useState<any[]>([])
  const [indents,  setIndents]  = useState<any[]>([])
  const [loading,  setLoading]  = useState(true)
  const [toast,    setToast]    = useState('')
  const [saving,   setSaving]   = useState(false)

  // Inline editing (Chart Number, Delivery Date) — same click-to-edit pattern
  // as Greige Register's LOT NO. column.
  const [editingField, setEditingField] = useState<string | null>(null) // `${id}::${field}`
  const [editValue,    setEditValue]    = useState('')

  // Details modal for the secondary lab values (L/A/B/DE, Remark).
  const [detailsModal, setDetailsModal] = useState<any>(null)
  const [detailsForm,  setDetailsForm]  = useState<any>({})

  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3000) }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [reqRes, indRes] = await Promise.all([
        labApi({ type: 'requests' }),
        labApi({ type: 'indents' }),
      ])
      if (reqRes.ok) setRequests((reqRes.data || []).filter((r: any) => r.confirmed))
      if (indRes.ok) setIndents(indRes.data || [])
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const indentById = (id: string) => indents.find(ind => ind.id === id)

  const patchFmsData = async (r: any, extra: Record<string, any>) => {
    const payload = { ...(r.fms_data || {}), ...extra }
    return labPost({ action: 'update_request', id: r.id, fmsData: payload })
  }

  const startEdit = (id: string, field: string, currentValue: string) => {
    setEditingField(`${id}::${field}`)
    setEditValue(currentValue || '')
  }

  const saveField = async (r: any, field: string) => {
    setSaving(true)
    try {
      const res = await patchFmsData(r, { [field]: editValue })
      if (!res.ok) { alert('Error: ' + res.error); return }
      setEditingField(null)
      load()
    } finally { setSaving(false) }
  }

  const markFabricReceived = async (r: any) => {
    setSaving(true)
    try {
      const res = await patchFmsData(r, { fabricReceivedAt: new Date().toISOString() })
      if (!res.ok) { alert('Error: ' + res.error); return }
      showToast('✓ Greige RFS Fabric Received marked')
      load()
    } finally { setSaving(false) }
  }

  const markFirstSubmission = async (r: any) => {
    setSaving(true)
    try {
      const res = await patchFmsData(r, { firstSubmissionAt: new Date().toISOString() })
      if (!res.ok) { alert('Error: ' + res.error); return }
      showToast('✓ 1st Submission marked')
      load()
    } finally { setSaving(false) }
  }

  const markLabApproval = async (r: any) => {
    setSaving(true)
    try {
      const res = await patchFmsData(r, { labApprovalAt: new Date().toISOString() })
      if (!res.ok) { alert('Error: ' + res.error); return }
      showToast('✓ Lab Approval marked')
      load()
    } finally { setSaving(false) }
  }

  const saveDetails = async () => {
    if (!detailsModal) return
    setSaving(true)
    try {
      const res = await patchFmsData(detailsModal, detailsForm)
      if (!res.ok) { alert('Error: ' + res.error); return }
      showToast('✓ Lab values saved')
      setDetailsModal(null)
      load()
    } finally { setSaving(false) }
  }

  // Only blank the page on the true first load; actions here call load()
  // again afterward, which would otherwise wipe the whole page every time.
  if (loading && requests.length === 0) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '60vh', color: 'var(--text-tertiary)', fontSize: 14 }}>Loading…</div>
  )

  const hd = (bg?: string, color?: string): React.CSSProperties => ({
    padding: '7px 8px', textAlign: 'left', fontSize: 9, fontWeight: 700,
    textTransform: 'uppercase', letterSpacing: '0.04em',
    borderBottom: '1px solid var(--border-light)', whiteSpace: 'nowrap',
    background: bg || 'var(--bg-secondary)', color: color || 'var(--text-tertiary)',
  })

  return (
    <div className="content" style={{ padding: '16px 20px' }}>
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <StatCard label="In Lab FMS"          value={requests.length}                                            color="var(--accent)" />
        <StatCard label="Fabric Received"     value={requests.filter(r=>r.fms_data?.fabricReceivedAt).length}    color="var(--success)" />
        <StatCard label="Delivery Date Entered" value={requests.filter(r=>r.fms_data?.deliveryDate).length}      color="var(--warning)" />
        <StatCard label="1st Submission Done" value={requests.filter(r=>r.fms_data?.firstSubmissionAt).length}   color="var(--purple)" />
        <StatCard label="Lab Approval Done"   value={requests.filter(r=>r.fms_data?.labApprovalAt).length}        color="#8E24AA" />
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
            No confirmed requests in Lab FMS. Both Sample Received and Parameters OK must be marked on the Requested page first.
          </div>
        ) : (
          <table style={{ borderCollapse: 'collapse', minWidth: 1400, width: '100%', fontSize: 11 }}>
            <thead>
              <tr>
                <th rowSpan={2} style={hd()}>Request No</th>
                <th rowSpan={2} style={hd()}>Indent No</th>
                <th rowSpan={2} style={hd()}>Date</th>
                <th rowSpan={2} style={hd()}>Unit</th>
                <th rowSpan={2} style={hd()}>Party</th>
                <th rowSpan={2} style={hd()}>Quality</th>
                <th rowSpan={2} style={hd()}>Request Given By</th>
                <th rowSpan={2} style={hd()}>Order Status</th>
                <th rowSpan={2} style={hd()}>Branch</th>
                <th rowSpan={2} style={hd()}>Light Source</th>
                <th rowSpan={2} style={hd()}>Yarn Design</th>
                <th rowSpan={2} style={hd()}>Shade/Pantone</th>
                <th rowSpan={2} style={hd()}>Fastness</th>
                <th rowSpan={2} style={hd()}>Fastness Remark</th>
                <th rowSpan={2} style={hd()}>Other Remark</th>
                <th rowSpan={2} style={hd()}>Chart No</th>
                <th rowSpan={2} style={hd()}>Delivery Date</th>
                <th colSpan={4} style={hd('#BBDEFB', '#0C447C')}>Greige RFS Fabric Received</th>
                <th colSpan={4} style={hd('#C8E6C9', '#1B5E20')}>Delivery Date Entry</th>
                <th colSpan={4} style={hd('#FFE0B2', '#E65100')}>1st Submission</th>
                <th colSpan={4} style={hd('#E1BEE7', '#6A1B9A')}>Lab Approval</th>
                <th rowSpan={2} style={hd()}>Details</th>
              </tr>
              <tr>
                {['Planned','Actual','Status','Delay'].map(h => <th key={'f'+h} style={hd('#BBDEFB', '#0C447C')}>{h}</th>)}
                {['Planned','Actual','Status','Delay'].map(h => <th key={'d'+h} style={hd('#C8E6C9', '#1B5E20')}>{h}</th>)}
                {['Planned','Actual','Status','Delay'].map(h => <th key={'s'+h} style={hd('#FFE0B2', '#E65100')}>{h}</th>)}
                {['Planned','Actual','Status','Delay'].map(h => <th key={'a'+h} style={hd('#E1BEE7', '#6A1B9A')}>{h}</th>)}
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
                  <td style={{ ...td, maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.fastness_remark || '-'}</td>
                  <td style={{ ...td, maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.other_remark || '-'}</td>

                  {/* Chart No — inline editable, plain field */}
                  <td style={{ ...td, whiteSpace: 'normal', minWidth: 120 }}>
                    {editingField === `${r.id}::chartNumber` ? (
                      <div style={{ display: 'flex', gap: 4 }}>
                        <input autoFocus value={editValue} onChange={e => setEditValue(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') saveField(r, 'chartNumber'); if (e.key === 'Escape') setEditingField(null) }}
                          style={{ fontSize: 11, padding: '3px 6px', width: 90, border: '1px solid var(--border-medium)', borderRadius: 4 }} />
                        <button className="xs" disabled={saving} onClick={() => saveField(r, 'chartNumber')}>✓</button>
                      </div>
                    ) : (
                      <span style={{ cursor: 'pointer', fontWeight: fd.chartNumber ? 700 : 400 }}
                        onClick={() => startEdit(r.id, 'chartNumber', fd.chartNumber)}>
                        {fd.chartNumber || <span style={{ color: 'var(--text-tertiary)' }}>+ Enter</span>}
                      </span>
                    )}
                  </td>

                  {/* Delivery Date — inline editable, plain field right beside Chart No */}
                  <td style={{ ...td, whiteSpace: 'normal', minWidth: 130 }}>
                    {editingField === `${r.id}::deliveryDate` ? (
                      <div style={{ display: 'flex', gap: 4 }}>
                        <input autoFocus type="date" value={editValue} onChange={e => setEditValue(e.target.value)}
                          style={{ fontSize: 11, padding: '3px 6px', border: '1px solid var(--border-medium)', borderRadius: 4 }} />
                        <button className="xs" disabled={saving} onClick={() => saveField(r, 'deliveryDate')}>✓</button>
                      </div>
                    ) : (
                      <span style={{ cursor: 'pointer', fontWeight: fd.deliveryDate ? 700 : 400 }}
                        onClick={() => startEdit(r.id, 'deliveryDate', fd.deliveryDate)}>
                        {fd.deliveryDate || <span style={{ color: 'var(--text-tertiary)' }}>+ Enter</span>}
                      </span>
                    )}
                  </td>

                  {/* Delivery Date Entry — tracked section; Actual mirrors the plain field above (that's the real entry point) */}
                  <td style={{ ...td, background: '#C8E6C9' }}>-</td>
                  <td style={{ ...td, background: '#C8E6C9', fontWeight: 700, color: '#1B5E20' }}>{fd.deliveryDate || '-'}</td>
                  <td style={{ ...td, background: '#C8E6C9', textAlign: 'center' }}>{fd.deliveryDate ? '✓' : '-'}</td>
                  <td style={{ ...td, background: '#C8E6C9' }}>-</td>

                  {/* Greige RFS Fabric Received */}
                  <td style={{ ...td, background: '#BBDEFB' }}>-</td>
                  <td style={{ ...td, background: '#BBDEFB', fontWeight: 700, color: '#1B5E20' }}>
                    {fd.fabricReceivedAt ? fmtDateTime(fd.fabricReceivedAt) : (
                      <button className="xs primary" disabled={saving} onClick={() => markFabricReceived(r)}>Received ✓</button>
                    )}
                  </td>
                  <td style={{ ...td, background: '#BBDEFB', textAlign: 'center' }}>{fd.fabricReceivedAt ? '✓' : '-'}</td>
                  <td style={{ ...td, background: '#BBDEFB' }}>-</td>

                  {/* 1st Submission */}
                  <td style={{ ...td, background: '#FFE0B2' }}>-</td>
                  <td style={{ ...td, background: '#FFE0B2', fontWeight: 700, color: '#E65100' }}>
                    {fd.firstSubmissionAt ? fmtDateTime(fd.firstSubmissionAt) : (
                      <button className="xs primary" disabled={saving} onClick={() => markFirstSubmission(r)}>Submit ✓</button>
                    )}
                  </td>
                  <td style={{ ...td, background: '#FFE0B2', textAlign: 'center' }}>{fd.firstSubmissionAt ? '✓' : '-'}</td>
                  <td style={{ ...td, background: '#FFE0B2' }}>-</td>

                  {/* Lab Approval */}
                  <td style={{ ...td, background: '#E1BEE7' }}>-</td>
                  <td style={{ ...td, background: '#E1BEE7', fontWeight: 700, color: '#6A1B9A' }}>
                    {fd.labApprovalAt ? fmtDateTime(fd.labApprovalAt) : (
                      <button className="xs primary" disabled={saving} onClick={() => markLabApproval(r)}>Approve ✓</button>
                    )}
                  </td>
                  <td style={{ ...td, background: '#E1BEE7', textAlign: 'center' }}>{fd.labApprovalAt ? '✓' : '-'}</td>
                  <td style={{ ...td, background: '#E1BEE7' }}>-</td>

                  <td style={{ ...td, whiteSpace: 'nowrap' }}>
                    <button className="xs" onClick={() => { setDetailsModal(r); setDetailsForm(fd) }}>L/A/B/DE</button>
                  </td>
                </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {detailsModal && (
        <div className="modal-overlay" onClick={() => setDetailsModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Lab Values — {detailsModal.id}</span>
              <button className="small" onClick={() => setDetailsModal(null)}>✕</button>
            </div>
            <div style={{ background: 'var(--bg-secondary)', borderRadius: 8,
              padding: '10px 14px', marginBottom: 14, fontSize: 13 }}>
              {detailsModal.party} · {detailsModal.shade_pantone}
            </div>
            <div className="form-grid" style={{ marginBottom: 14 }}>
              <div className="form-group">
                <label>L Value</label>
                <input value={detailsForm.lValue || ''} placeholder="L*"
                  onChange={e => setDetailsForm((p: any) => ({ ...p, lValue: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>A Value</label>
                <input value={detailsForm.aValue || ''} placeholder="a*"
                  onChange={e => setDetailsForm((p: any) => ({ ...p, aValue: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>B Value</label>
                <input value={detailsForm.bValue || ''} placeholder="b*"
                  onChange={e => setDetailsForm((p: any) => ({ ...p, bValue: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>DE Value</label>
                <input value={detailsForm.deValue || ''} placeholder="ΔE"
                  onChange={e => setDetailsForm((p: any) => ({ ...p, deValue: e.target.value }))} />
              </div>
            </div>
            <div className="form-group" style={{ marginBottom: 14 }}>
              <label>Remark</label>
              <textarea value={detailsForm.remark || ''} rows={2}
                onChange={e => setDetailsForm((p: any) => ({ ...p, remark: e.target.value }))} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="primary" onClick={saveDetails} disabled={saving}>
                {saving ? 'Saving…' : '✓ Save'}
              </button>
              <button onClick={() => setDetailsModal(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const td: React.CSSProperties = { padding: '6px 8px', fontSize: 11, color: 'var(--text-primary)', whiteSpace: 'nowrap' }
