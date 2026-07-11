'use client'
// Lab FMS — confirmed (non-recheck) requests awaiting lab processing
import { useEffect, useState, useCallback } from 'react'
import { labApi, labPost, StatCard, fmtDateTime } from '../_shared'

export default function LabFmsPage() {
  const [requests, setRequests] = useState<any[]>([])
  const [loading,  setLoading]  = useState(true)
  const [toast,    setToast]    = useState('')
  const [editModal, setEditModal] = useState<any>(null)
  const [fmsData,   setFmsData]   = useState<any>({})
  const [saving,    setSaving]    = useState(false)

  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3000) }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await labApi({ type: 'requests' })
      if (res.ok) setRequests((res.data || []).filter((r: any) => r.confirmed))
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const saveFms = async () => {
    if (!editModal) return
    setSaving(true)
    try {
      const res = await labPost({ action: 'update_request', id: editModal.id, fmsData })
      if (!res.ok) { alert('Error: ' + res.error); return }
      showToast('✓ FMS data saved')
      setEditModal(null)
      load()
    } finally { setSaving(false) }
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '60vh', color: 'var(--text-tertiary)', fontSize: 14 }}>Loading…</div>
  )

  return (
    <div className="content" style={{ padding: '16px 20px' }}>
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <StatCard label="In Lab FMS"      value={requests.length}                                             color="var(--accent)" />
        <StatCard label="With Chart No"   value={requests.filter(r=>r.fms_data?.chartNumber).length}          color="var(--success)" />
        <StatCard label="With Delivery"   value={requests.filter(r=>r.fms_data?.deliveryDate).length}         color="var(--purple)" />
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
            No confirmed requests in Lab FMS. Confirm requests from Lab Requested page.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
            <thead style={{ background: 'var(--bg-secondary)' }}>
              <tr>
                {['Request No','Indent No','Date','Unit','Party','Shade/Pantone','Fastness','Chart No','Delivery Date','Actions'].map(h => (
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
                  <td style={{ ...td, fontWeight: 700, color: 'var(--accent)' }}>{r.id}</td>
                  <td style={td}>{r.indent_id || '-'}</td>
                  <td style={{ ...td, fontSize: 11, color: 'var(--text-tertiary)' }}>{fmtDateTime(r.confirmed_at || r.created_at)}</td>
                  <td style={td}>{r.unit || '-'}</td>
                  <td style={{ ...td, fontWeight: 500 }}>{r.party || '-'}</td>
                  <td style={td}>{r.shade_pantone || '-'}</td>
                  <td style={td}>{r.fastness_type || '-'}</td>
                  <td style={td}>{r.fms_data?.chartNumber || <span style={{ color: 'var(--text-tertiary)' }}>—</span>}</td>
                  <td style={td}>{r.fms_data?.deliveryDate || <span style={{ color: 'var(--text-tertiary)' }}>—</span>}</td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>
                    <button className="xs primary" onClick={() => {
                      setEditModal(r)
                      setFmsData(r.fms_data || {})
                    }}>Update</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editModal && (
        <div className="modal-overlay" onClick={() => setEditModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Lab FMS — {editModal.id}</span>
              <button className="small" onClick={() => setEditModal(null)}>✕</button>
            </div>
            <div style={{ background: 'var(--bg-secondary)', borderRadius: 8,
              padding: '10px 14px', marginBottom: 14, fontSize: 13 }}>
              {editModal.party} · {editModal.shade_pantone}
            </div>
            <div className="form-grid" style={{ marginBottom: 14 }}>
              <div className="form-group">
                <label>Chart Number</label>
                <input value={fmsData.chartNumber || ''} placeholder="Enter chart number"
                  onChange={e => setFmsData((p: any) => ({ ...p, chartNumber: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>Delivery Date</label>
                <input type="date" value={fmsData.deliveryDate || ''}
                  onChange={e => setFmsData((p: any) => ({ ...p, deliveryDate: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>L Value</label>
                <input value={fmsData.lValue || ''} placeholder="L*"
                  onChange={e => setFmsData((p: any) => ({ ...p, lValue: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>A Value</label>
                <input value={fmsData.aValue || ''} placeholder="a*"
                  onChange={e => setFmsData((p: any) => ({ ...p, aValue: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>B Value</label>
                <input value={fmsData.bValue || ''} placeholder="b*"
                  onChange={e => setFmsData((p: any) => ({ ...p, bValue: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>DE Value</label>
                <input value={fmsData.deValue || ''} placeholder="ΔE"
                  onChange={e => setFmsData((p: any) => ({ ...p, deValue: e.target.value }))} />
              </div>
            </div>
            <div className="form-group" style={{ marginBottom: 14 }}>
              <label>Remark</label>
              <textarea value={fmsData.remark || ''} rows={2}
                onChange={e => setFmsData((p: any) => ({ ...p, remark: e.target.value }))} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="primary" onClick={saveFms} disabled={saving}>
                {saving ? 'Saving…' : '✓ Save'}
              </button>
              <button onClick={() => setEditModal(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const td: React.CSSProperties = { padding: '10px 12px', fontSize: 12, color: 'var(--text-primary)' }
