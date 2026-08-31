'use client'
// Submitted = confirmed requests that have had 1st Submission marked on the
// Lab FMS page (fms_data.firstSubmissionAt set) — shows the full picture
// with all Indent/Request details, the Lab Number(s) entered, and the
// Approve/Reject decision.
//
// Approve: pick ONE of the entered Lab Numbers as the approved one — shows
//   up on the Lab Approval page (fms_data.approvedLabNumber + labApprovalAt).
// Reject: choose Cancel (just acknowledged, done) or Redevelop (creates a
//   new linked recheck request via the existing is_recheck mechanism —
//   shows up automatically on the Rechecked page).
import { useEffect, useState, useCallback } from 'react'
import { labApi, labPost, StatCard, fmtDateTime, genRequestId } from '../_shared'

export default function LabSubmittedPage() {
  const [requests, setRequests] = useState<any[]>([])
  const [allRequests, setAllRequests] = useState<any[]>([]) // unfiltered, needed for genRequestId
  const [indents,  setIndents]  = useState<any[]>([])
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)
  const [toast,    setToast]    = useState('')

  const [approveModal, setApproveModal] = useState<any>(null)
  const [approveChoice, setApproveChoice] = useState('')

  const [rejectModal, setRejectModal] = useState<any>(null)
  const [rejectStep, setRejectStep] = useState<'choose' | 'redevelop'>('choose')
  const [redevelopRemark, setRedevelopRemark] = useState('')

  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3000) }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [reqRes, indRes] = await Promise.all([
        labApi({ type: 'requests' }),
        labApi({ type: 'indents' }),
      ])
      if (reqRes.ok) {
        setAllRequests(reqRes.data || [])
        const submitted = (reqRes.data || []).filter((r: any) => r.confirmed && r.fms_data?.firstSubmissionAt)
        setRequests(submitted)
      }
      if (indRes.ok) setIndents(indRes.data || [])
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const indentById = (id: string) => indents.find(ind => ind.id === id)

  const patchFmsData = async (r: any, extra: Record<string, any>) => {
    const payload = { ...(r.fms_data || {}), ...extra }
    return labPost({ action: 'update_request', id: r.id, fmsData: payload })
  }

  // ── Approve ──────────────────────────────────────────────────────────────

  const openApproveModal = (r: any) => {
    setApproveChoice(r.fms_data?.approvedLabNumber || (r.fms_data?.labNumbers?.[0] || ''))
    setApproveModal(r)
  }

  const confirmApproval = async () => {
    if (!approveModal || !approveChoice) { alert('Select a Lab Number.'); return }
    setSaving(true)
    try {
      const res = await patchFmsData(approveModal, {
        approvedLabNumber: approveChoice,
        labDecision: 'approved',
        labApprovalAt: new Date().toISOString(),
      })
      if (!res.ok) { alert('Error: ' + res.error); return }
      showToast(`✓ Approved — ${approveChoice}`)
      setApproveModal(null)
      load()
    } finally { setSaving(false) }
  }

  // ── Reject ───────────────────────────────────────────────────────────────

  const openRejectModal = (r: any) => {
    setRejectStep('choose')
    setRedevelopRemark('')
    setRejectModal(r)
  }

  const rejectAndCancel = async () => {
    if (!rejectModal) return
    setSaving(true)
    try {
      const res = await patchFmsData(rejectModal, { labDecision: 'rejected', rejectionAction: 'cancel' })
      if (!res.ok) { alert('Error: ' + res.error); return }
      showToast('✓ Rejected — Cancelled')
      setRejectModal(null)
      load()
    } finally { setSaving(false) }
  }

  const rejectAndRedevelop = async () => {
    if (!rejectModal) return
    if (!redevelopRemark.trim()) { alert('Enter a remark for the redevelop request.'); return }
    setSaving(true)
    try {
      const newId = genRequestId(allRequests)
      const createRes = await labPost({
        action: 'create_request',
        id: newId,
        indentId: rejectModal.indent_id,
        unit: rejectModal.unit,
        party: rejectModal.party,
        quality: rejectModal.quality,
        lightSource: rejectModal.light_source,
        lightSourceOther: rejectModal.light_source_other,
        yarnDesign: rejectModal.yarn_design,
        shadePantone: rejectModal.shade_pantone,
        fastnessType: rejectModal.fastness_type,
        fastnessRemark: rejectModal.fastness_remark,
        otherRemark: rejectModal.other_remark,
        isRecheck: true,
        recheckFromRequestId: rejectModal.id,
        recheckRemark: redevelopRemark.trim(),
      })
      if (!createRes.ok) { alert('Error creating recheck request: ' + createRes.error); return }

      const patchRes = await patchFmsData(rejectModal, { labDecision: 'rejected', rejectionAction: 'redevelop', redevelopRequestId: newId })
      if (!patchRes.ok) { alert('Error: ' + patchRes.error); return }

      showToast(`✓ Rejected — Redevelop request ${newId} created (see Rechecked page)`)
      setRejectModal(null)
      load()
    } finally { setSaving(false) }
  }

  // Only blank the page on the true first load; actions here call load()
  // again afterward, which would otherwise wipe the whole page every time.
  if (loading && requests.length === 0) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '60vh', color: 'var(--text-tertiary)', fontSize: 14 }}>Loading…</div>
  )

  return (
    <div className="content" style={{ padding: '16px 20px' }}>
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <StatCard label="Submitted"      value={requests.length}                                                     color="var(--accent)" />
        <StatCard label="Approved"       value={requests.filter(r=>r.fms_data?.labDecision==='approved').length}     color="var(--success)" />
        <StatCard label="Rejected"       value={requests.filter(r=>r.fms_data?.labDecision==='rejected').length}     color="var(--danger)" />
        <StatCard label="Pending Decision" value={requests.filter(r=>!r.fms_data?.labDecision).length}               color="var(--warning)" />
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
            No submitted requests yet. Tick 1st Submission in Lab FMS page.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1600, fontSize: 11 }}>
            <thead style={{ background: 'var(--bg-secondary)' }}>
              <tr>
                {['Request No','Indent No','Date','Unit','Party','Quality','Request Given By','Order Status','Branch',
                  'Light Source','Yarn Design','Shade/Pantone','Fastness','Fastness Remark','Other Remark',
                  'Chart No','Delivery Date','Lab No(s)','1st Submission','Decision','Actions'].map(h => (
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
                            borderRadius: 6,
                            background: fd.approvedLabNumber === ln ? 'var(--success)' : '#E65100',
                            color: '#fff' }}>{ln}</span>
                        ))}
                      </div>
                    ) : '-'}
                  </td>
                  <td style={{ ...td, fontSize: 11 }}>{fmtDateTime(fd.firstSubmissionAt)}</td>
                  <td style={{ ...td, whiteSpace: 'normal', minWidth: 130 }}>
                    {fd.labDecision === 'approved' ? (
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                        background: 'var(--success-light)', color: 'var(--success)' }}>
                        ✓ Approved — {fd.approvedLabNumber}
                      </span>
                    ) : fd.labDecision === 'rejected' ? (
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                        background: 'var(--danger-light)', color: 'var(--danger)' }}>
                        ✕ Rejected — {fd.rejectionAction === 'redevelop' ? `Redevelop (${fd.redevelopRequestId})` : 'Cancelled'}
                      </span>
                    ) : (
                      <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Pending</span>
                    )}
                  </td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>
                    {!fd.labDecision && (
                      <>
                        <button className="xs primary" disabled={saving} onClick={() => openApproveModal(r)}>Approve</button>
                        <button className="xs" style={{ marginLeft: 4 }} disabled={saving} onClick={() => openRejectModal(r)}>Reject</button>
                      </>
                    )}
                  </td>
                </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Approve — select ONE of the entered Lab Numbers */}
      {approveModal && (
        <div className="modal-overlay" onClick={() => setApproveModal(null)}>
          <div className="modal" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Approve — {approveModal.id}</span>
              <button className="small" onClick={() => setApproveModal(null)}>✕</button>
            </div>
            <div style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: '10px 14px',
              marginBottom: 14, fontSize: 13 }}>
              {approveModal.party} · {approveModal.shade_pantone}
            </div>
            {(approveModal.fms_data?.labNumbers || []).length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 14 }}>
                No Lab Numbers were entered for this request.
              </div>
            ) : (
              <div style={{ marginBottom: 14 }}>
                {(approveModal.fms_data?.labNumbers || []).map((ln: string) => (
                  <label key={ln} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
                    border: '1px solid var(--border-light)', borderRadius: 6, marginBottom: 6, cursor: 'pointer',
                    background: approveChoice === ln ? 'var(--success-light)' : 'var(--bg-primary)' }}>
                    <input type="radio" name="labNumberChoice" value={ln} checked={approveChoice === ln}
                      onChange={() => setApproveChoice(ln)} />
                    <span style={{ fontWeight: 700 }}>{ln}</span>
                  </label>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setApproveModal(null)}>Cancel</button>
              <button className="primary" onClick={confirmApproval} disabled={saving || !approveChoice}>
                {saving ? 'Saving…' : '✓ Confirm Approval'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject — Cancel or Redevelop */}
      {rejectModal && (
        <div className="modal-overlay" onClick={() => setRejectModal(null)}>
          <div className="modal" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Reject — {rejectModal.id}</span>
              <button className="small" onClick={() => setRejectModal(null)}>✕</button>
            </div>
            <div style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: '10px 14px',
              marginBottom: 14, fontSize: 13 }}>
              {rejectModal.party} · {rejectModal.shade_pantone}
            </div>

            {rejectStep === 'choose' ? (
              <>
                <div style={{ fontSize: 13, marginBottom: 14 }}>What should happen to this request?</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button style={{ flex: 1 }} disabled={saving} onClick={rejectAndCancel}>Cancel Request</button>
                  <button className="primary" style={{ flex: 1 }} onClick={() => setRejectStep('redevelop')}>Redevelop</button>
                </div>
              </>
            ) : (
              <>
                <div className="form-group" style={{ marginBottom: 14 }}>
                  <label>Redevelop Remark</label>
                  <textarea value={redevelopRemark} rows={3} autoFocus
                    onChange={e => setRedevelopRemark(e.target.value)}
                    placeholder="Why does this need to be redeveloped?" />
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button onClick={() => setRejectStep('choose')}>Back</button>
                  <button className="primary" onClick={rejectAndRedevelop} disabled={saving}>
                    {saving ? 'Creating…' : '✓ Create Redevelop Request'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

const td: React.CSSProperties = { padding: '7px 10px', fontSize: 11, color: 'var(--text-primary)', whiteSpace: 'nowrap' }
