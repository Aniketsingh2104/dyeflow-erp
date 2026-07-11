'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import {
  labApi, labPost, StatCard, IssuesModal,
  LAB_UNIT_OPTIONS, LAB_ORDER_STATUS, LAB_LIGHT_SOURCE, LAB_BRANCHES, LAB_FASTNESS_TYPES,
  genIndentId, genRequestId, genIssueId, fmtDateTime,
} from '../_shared'

const BLANK_INDENT = {
  unit: '', partyName: '', quality: '', numberOfLabDip: '',
  requestGivenBy: '', orderStatus: '', branch: '', lightSource: '',
  lightSourceOther: '', remarks: '', requestImage: '',
}

const BLANK_REQUEST = {
  yarnDesign: '', shadePantone: '', fastnessType: '', fastnessRemark: '', otherRemark: '',
}

export default function LabIndentPage() {
  const [indents,   setIndents]   = useState<any[]>([])
  const [requests,  setRequests]  = useState<any[]>([])
  const [issues,    setIssues]    = useState<any[]>([])
  const [customers, setCustomers] = useState<string[]>([])
  const [loading,   setLoading]   = useState(true)
  const [saving,    setSaving]    = useState(false)
  const [toast,     setToast]     = useState('')

  // Modals
  const [indentModal,  setIndentModal]  = useState(false)
  const [requestModal, setRequestModal] = useState<any>(null) // selected indent
  const [issuesModal,  setIssuesModal]  = useState<string|null>(null) // requestId
  const [editingId,    setEditingId]    = useState('')
  const [form,         setForm]         = useState({ ...BLANK_INDENT })
  const [reqForm,      setReqForm]      = useState({ ...BLANK_REQUEST })
  const fileRef = useRef<HTMLInputElement>(null)

  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3000) }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [res, custRes] = await Promise.all([
        labApi(),
        fetch('/api/masters?table=customers', { cache: 'no-store' }).then(r => r.json()),
      ])
      if (res.ok) { setIndents(res.indents || []); setRequests(res.requests || []) }
      const allIssuesRes = await labApi({ type: 'issues' })
      if (allIssuesRes.ok) setIssues(allIssuesRes.data || [])
      const custNames = (custRes.data || []).map((c: any) => c.name || c).filter(Boolean)
      setCustomers(custNames)
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const reqCount   = (indentId: string) => requests.filter(r => r.indent_id === indentId).length
  const pendingCnt = (indent: any) => {
    if (indent.closed) return 0
    return Math.max(0, (parseInt(indent.num_lab_dip) || 0) - reqCount(indent.id))
  }
  const openIssues = (reqId: string) => issues.filter(i => i.request_id === reqId && !i.solved).length

  const stats = {
    total:    indents.length,
    today:    indents.filter(i => new Date(i.created_at).toDateString() === new Date().toDateString()).length,
    withImg:  indents.filter(i => i.request_image).length,
    pending:  indents.reduce((s, i) => s + pendingCnt(i), 0),
  }

  // ── Save indent ────────────────────────────────────────────────────────────

  const saveIndent = async () => {
    if (!form.unit || !form.partyName.trim() || !form.quality.trim() ||
        !form.numberOfLabDip || !form.requestGivenBy || !form.orderStatus ||
        !form.branch || !form.lightSource) {
      alert('Please fill all required fields.'); return
    }
    if (form.lightSource === 'Other' && !form.lightSourceOther.trim()) {
      alert('Please enter Other Light Source.'); return
    }
    setSaving(true)
    try {
      if (editingId) {
        const res = await labPost({ action: 'update_indent', id: editingId, ...form })
        if (!res.ok) { alert('Error: ' + res.error); return }
        showToast('✓ Indent updated')
      } else {
        const newId = genIndentId(indents)
        const res = await labPost({ action: 'create_indent', id: newId, ...form })
        if (!res.ok) { alert('Error: ' + res.error); return }
        showToast(`✓ Indent ${newId} created`)
      }
      setIndentModal(false)
      setEditingId('')
      setForm({ ...BLANK_INDENT })
      load()
    } finally { setSaving(false) }
  }

  const closeIndent = async (id: string) => {
    if (!confirm('Close this indent? No further requests can be added.')) return
    await labPost({ action: 'update_indent', id, closed: true })
    showToast('✓ Indent closed')
    load()
  }

  // ── Save request ───────────────────────────────────────────────────────────

  const saveRequest = async () => {
    if (!reqForm.yarnDesign.trim() || !reqForm.shadePantone.trim() || !reqForm.fastnessType) {
      alert('Please fill all required fields.'); return
    }
    if (!requestModal) return
    setSaving(true)
    try {
      const allReqsRes = await labApi({ type: 'requests' })
      const allReqs = allReqsRes.data || []
      const newId = genRequestId(allReqs)
      const res = await labPost({
        action:    'create_request',
        id:        newId,
        indentId:  requestModal.id,
        unit:      requestModal.unit,
        party:     requestModal.party_name,
        quality:   requestModal.quality,
        lightSource: requestModal.light_source,
        lightSourceOther: requestModal.light_source_other || '',
        ...reqForm,
      })
      if (!res.ok) { alert('Error: ' + res.error); return }
      showToast(`✓ Request ${newId} created`)
      setRequestModal(null)
      setReqForm({ ...BLANK_REQUEST })
      load()
    } finally { setSaving(false) }
  }

  // ── Issue actions ──────────────────────────────────────────────────────────

  const toggleIssue = async (issueId: string) => {
    await labPost({ action: 'toggle_issue', id: issueId })
    const res = await labApi({ type: 'issues' })
    if (res.ok) setIssues(res.data || [])
  }

  const addIssue = async (requestId: string, desc: string, priority: string) => {
    const allIssuesRes = await labApi({ type: 'issues' })
    const allIssues = allIssuesRes.data || []
    const newId = genIssueId(allIssues)
    await labPost({ action: 'create_issue', id: newId, requestId, description: desc, priority })
    const res = await labApi({ type: 'issues' })
    if (res.ok) setIssues(res.data || [])
    showToast('✓ Issue raised')
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '60vh', color: 'var(--text-tertiary)', fontSize: 14 }}>
      Loading lab indents…
    </div>
  )

  return (
    <div className="content" style={{ padding: '16px 20px' }}>

      {/* Stats + New button */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'stretch' }}>
        <StatCard label="Total Indents"     value={stats.total}   color="var(--success)" />
        <StatCard label="Created Today"     value={stats.today}   color="var(--accent)" />
        <StatCard label="With Image"        value={stats.withImg} color="var(--warning)" />
        <StatCard label="Pending Requests"  value={stats.pending} color="var(--purple)" />
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center' }}>
          <button className="primary" onClick={() => { setEditingId(''); setForm({ ...BLANK_INDENT }); setIndentModal(true) }}>
            + New Indent
          </button>
        </div>
      </div>

      {toast && (
        <div style={{ background: 'var(--success-light)', color: 'var(--success)',
          border: '1px solid var(--success)', borderRadius: 8, padding: '8px 14px',
          marginBottom: 10, fontSize: 13, fontWeight: 600 }}>
          {toast}
        </div>
      )}

      {/* Table */}
      <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)',
        borderRadius: 10, overflow: 'auto' }}>
        {indents.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-tertiary)' }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>📋</div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>No lab indents yet</div>
            <button className="primary" style={{ marginTop: 14 }}
              onClick={() => { setEditingId(''); setForm({ ...BLANK_INDENT }); setIndentModal(true) }}>
              + Create First Indent
            </button>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1100 }}>
            <thead style={{ background: 'var(--bg-secondary)' }}>
              <tr>
                {['Indent No','Date','Unit','Party','Quality','LabDIP','Requested','Pending','Status','Branch','Light','Remarks','Actions'].map(h => (
                  <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontSize: 10,
                    fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase',
                    letterSpacing: '0.05em', borderBottom: '1px solid var(--border-light)',
                    whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {indents.map((indent, i) => {
                const requested = reqCount(indent.id)
                const pending   = pendingCnt(indent)
                return (
                  <tr key={indent.id} style={{
                    background: i % 2 === 0 ? 'var(--bg-primary)' : 'var(--bg-secondary)',
                    borderBottom: '1px solid var(--border-light)' }}>
                    <td style={{ ...td, fontWeight: 700, color: 'var(--accent)' }}>{indent.id}</td>
                    <td style={{ ...td, fontSize: 11, color: 'var(--text-tertiary)' }}>{fmtDateTime(indent.created_at)}</td>
                    <td style={td}>{indent.unit}</td>
                    <td style={{ ...td, fontWeight: 500 }}>{indent.party_name}</td>
                    <td style={td}>{indent.quality}</td>
                    <td style={{ ...td, textAlign: 'center', fontWeight: 700 }}>{indent.num_lab_dip}</td>
                    <td style={{ ...td, textAlign: 'center' }}>{requested}</td>
                    <td style={{ ...td, textAlign: 'center', fontWeight: 700,
                      color: pending > 0 ? 'var(--warning)' : 'var(--success)' }}>{pending}</td>
                    <td style={td}>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 4,
                        background: indent.closed ? 'var(--bg-secondary)' : 'var(--success-light)',
                        color: indent.closed ? 'var(--text-tertiary)' : 'var(--success)' }}>
                        {indent.closed ? 'Closed' : 'Open'}
                      </span>
                    </td>
                    <td style={td}>{indent.branch}</td>
                    <td style={td}>{indent.light_source === 'Other' ? (indent.light_source_other || 'Other') : indent.light_source}</td>
                    <td style={{ ...td, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }}>{indent.remarks || '-'}</td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>
                      <button className="xs primary" disabled={indent.closed || pending === 0}
                        style={{ opacity: (indent.closed || pending === 0) ? 0.4 : 1 }}
                        onClick={() => setRequestModal(indent)}>
                        New Request
                      </button>
                      <button className="xs" style={{ marginLeft: 4 }}
                        onClick={() => {
                          setEditingId(indent.id)
                          setForm({
                            unit: indent.unit, partyName: indent.party_name, quality: indent.quality,
                            numberOfLabDip: String(indent.num_lab_dip), requestGivenBy: indent.request_given_by,
                            orderStatus: indent.order_status, branch: indent.branch, lightSource: indent.light_source,
                            lightSourceOther: indent.light_source_other || '', remarks: indent.remarks || '',
                            requestImage: indent.request_image || '',
                          })
                          setIndentModal(true)
                        }}>
                        Edit
                      </button>
                      <button className="xs danger" style={{ marginLeft: 4, opacity: indent.closed ? 0.4 : 1 }}
                        disabled={indent.closed}
                        onClick={() => closeIndent(indent.id)}>
                        Close
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Indent modal */}
      {indentModal && (
        <div className="modal-overlay" onClick={() => setIndentModal(false)}>
          <div className="modal" style={{ maxWidth: 720 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">{editingId ? `Edit ${editingId}` : 'New Lab Indent'}</span>
              <button className="small" onClick={() => setIndentModal(false)}>✕</button>
            </div>
            <div className="form-grid" style={{ marginBottom: 14 }}>
              {([
                ['unit','Unit','select'],['partyName','Party Name','datalist'],
                ['quality','Quality','text'],['numberOfLabDip','No. of LabDIP','number'],
                ['requestGivenBy','Request Given By','select2'],['orderStatus','Order Status','select3'],
                ['branch','Branch','select4'],['lightSource','Light Source','select5'],
              ] as [string,string,string][]).map(([key, label, type]) => (
                <div key={key} className="form-group">
                  <label>{label} *</label>
                  {type === 'select' ? (
                    <select value={(form as any)[key]} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}>
                      <option value="">Choose</option>
                      {LAB_UNIT_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : type === 'select2' ? (
                    <select value={(form as any)[key]} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}>
                      <option value="">Choose</option>
                      {LAB_BRANCHES.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : type === 'select3' ? (
                    <select value={(form as any)[key]} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}>
                      <option value="">Choose</option>
                      {LAB_ORDER_STATUS.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : type === 'select4' ? (
                    <select value={(form as any)[key]} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}>
                      <option value="">Choose</option>
                      {LAB_BRANCHES.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : type === 'select5' ? (
                    <select value={(form as any)[key]} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}>
                      <option value="">Choose</option>
                      {LAB_LIGHT_SOURCE.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : type === 'datalist' ? (
                    <>
                      <input list="party-list" value={(form as any)[key]} placeholder={label}
                        onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))} />
                      <datalist id="party-list">
                        {customers.map(c => <option key={c} value={c} />)}
                      </datalist>
                    </>
                  ) : (
                    <input type={type} value={(form as any)[key]} placeholder={label}
                      onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))} />
                  )}
                </div>
              ))}
              {form.lightSource === 'Other' && (
                <div className="form-group">
                  <label>Other Light Source *</label>
                  <input value={form.lightSourceOther}
                    onChange={e => setForm(p => ({ ...p, lightSourceOther: e.target.value }))} />
                </div>
              )}
            </div>
            <div className="form-group" style={{ marginBottom: 14 }}>
              <label>Remarks</label>
              <textarea value={form.remarks} rows={2}
                onChange={e => setForm(p => ({ ...p, remarks: e.target.value }))} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="primary" onClick={saveIndent} disabled={saving}>
                {saving ? 'Saving…' : editingId ? '✓ Update' : '✓ Save Indent'}
              </button>
              <button onClick={() => setForm({ ...BLANK_INDENT })}>Reset</button>
            </div>
          </div>
        </div>
      )}

      {/* Request modal */}
      {requestModal && (
        <div className="modal-overlay" onClick={() => setRequestModal(null)}>
          <div className="modal" style={{ maxWidth: 680 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">New Lab Request — {requestModal.id}</span>
              <button className="small" onClick={() => setRequestModal(null)}>✕</button>
            </div>
            <div style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: '10px 14px',
              marginBottom: 14, fontSize: 12, color: 'var(--text-secondary)' }}>
              Request {reqCount(requestModal.id) + 1} of {requestModal.num_lab_dip} · 
              Pending after: {Math.max(0, pendingCnt(requestModal) - 1)}
            </div>
            <div className="form-grid" style={{ marginBottom: 14 }}>
              {[['Unit', requestModal.unit],['Party', requestModal.party_name],
                ['Quality', requestModal.quality],
                ['Light Source', requestModal.light_source === 'Other' ? (requestModal.light_source_other || 'Other') : requestModal.light_source]
              ].map(([l, v]) => (
                <div key={l} className="form-group">
                  <label>{l}</label>
                  <input value={v || ''} disabled style={{ background: 'var(--bg-secondary)' }} />
                </div>
              ))}
              <div className="form-group">
                <label>Yarn Design *</label>
                <input value={reqForm.yarnDesign} placeholder="Enter yarn design"
                  onChange={e => setReqForm(p => ({ ...p, yarnDesign: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>Shade / Pantone *</label>
                <input value={reqForm.shadePantone} placeholder="Enter shade or pantone"
                  onChange={e => setReqForm(p => ({ ...p, shadePantone: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>Fastness Type *</label>
                <select value={reqForm.fastnessType}
                  onChange={e => setReqForm(p => ({ ...p, fastnessType: e.target.value }))}>
                  <option value="">Choose</option>
                  {LAB_FASTNESS_TYPES.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Fastness Remark</label>
                <input value={reqForm.fastnessRemark} placeholder="Optional"
                  onChange={e => setReqForm(p => ({ ...p, fastnessRemark: e.target.value }))} />
              </div>
            </div>
            <div className="form-group" style={{ marginBottom: 14 }}>
              <label>Other Remark</label>
              <textarea value={reqForm.otherRemark} rows={2}
                onChange={e => setReqForm(p => ({ ...p, otherRemark: e.target.value }))} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="primary" onClick={saveRequest} disabled={saving}>
                {saving ? 'Saving…' : '✓ Save Request'}
              </button>
              <button onClick={() => setRequestModal(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Issues modal */}
      {issuesModal && (
        <IssuesModal
          requestId={issuesModal}
          onClose={() => setIssuesModal(null)}
          allIssues={issues}
          onToggle={toggleIssue}
          onAdd={(desc, pri) => addIssue(issuesModal, desc, pri)}
        />
      )}
    </div>
  )
}

const td: React.CSSProperties = { padding: '10px 12px', fontSize: 12, color: 'var(--text-primary)' }
