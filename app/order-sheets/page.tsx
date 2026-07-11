'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'

async function apiSheets(body?: any) {
  if (!body) {
    const res = await fetch('/api/order-sheets', { cache: 'no-store' })
    return res.json()
  }
  const res = await fetch('/api/order-sheets', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res.json()
}

export default function OrderSheetsPage() {
  const [sheets,     setSheets]     = useState<any[]>([])
  const [loading,    setLoading]    = useState(true)
  const [showModal,  setShowModal]  = useState(false)
  const [formData,   setFormData]   = useState({ title: '', assignedTo: '' })
  const [saving,     setSaving]     = useState(false)

  const loadSheets = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiSheets()
      if (res.ok) setSheets(res.data || [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadSheets() }, [loadSheets])

  const handleCreate = async () => {
    if (!formData.title || !formData.assignedTo) { alert('Please fill in all fields'); return }
    setSaving(true)
    try {
      const blankRow = {
        party: '', subParty: '', salesPerson: '', article: '', blend: '',
        width: '', gsm: '', color: '', labNo: '', lotNo: '', challanNo: '',
        qtyKg: 0, qtyMtr: 0, noOfTa: 0, typeOfFinish: '', typeOfPacking: '',
        remarks: '', holdReason: '', orderNumber: '', process: '', deliveryDate: '',
        currentStage: '', approvalStatus: 'draft', rejectionReason: '', submittedOn: '', receivedAt: '',
      }
      const res = await apiSheets({ action: 'create', ...formData, rows: [blankRow] })
      if (!res.ok) { alert('Error: ' + res.error); return }
      setShowModal(false)
      setFormData({ title: '', assignedTo: '' })
      loadSheets()
      alert(`✓ Sheet "${formData.title}" created!\n\nGo to Setup → User Management to assign access.`)
    } finally { setSaving(false) }
  }

  const handleToggle = async (sheet: any) => {
    const newStatus = sheet.status === 'Active' ? 'Closed' : 'Active'
    await apiSheets({ action: 'toggle_status', id: sheet.id, status: newStatus })
    loadSheets()
  }

  const handleDelete = async (sheet: any) => {
    if (!confirm('Delete this order sheet? This cannot be undone.')) return
    await apiSheets({ action: 'delete', id: sheet.id })
    loadSheets()
  }

  const downloadCSV = (sheet: any) => {
    const headers = ['Party','Sub Party','Sales Person','Article','Color','Qty (Kg)','Qty (Mtr)','Remarks','Approval Status']
    const rows = (sheet.rows || []).map((r: any) => [
      r.party, r.subParty, r.salesPerson, r.article, r.color,
      r.qtyKg, r.qtyMtr, r.remarks, r.approvalStatus || 'draft',
    ])
    const esc = (v: any) => { const s = String(v ?? ''); return (s.includes(',') || s.includes('"')) ? `"${s.replace(/"/g,'""')}"` : s }
    const csv = [headers.map(esc).join(','), ...rows.map((r: any[]) => r.map(esc).join(','))].join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = `${sheet.title.replace(/[^a-z0-9]+/ig,'_')}.csv`
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '60vh', color: 'var(--text-tertiary)', fontSize: 14 }}>
      Loading order sheets…
    </div>
  )

  return (
    <div className="content" style={{ padding: '16px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>Order Sheets</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
            {sheets.length} sheet{sheets.length !== 1 ? 's' : ''}
          </span>
          <button className="primary" onClick={() => setShowModal(true)}>+ Create Order Sheet</button>
        </div>
      </div>

      <div style={{ background: 'var(--accent-light)', border: '1px solid var(--accent)',
        borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 12,
        color: 'var(--accent-dark)' }}>
        💡 Sheet access is controlled per-user in <strong>Setup → User Management → Edit User → Permissions</strong>
      </div>

      {sheets.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-tertiary)', fontSize: 14 }}>
          No order sheets created yet.
        </div>
      ) : (
        <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)',
          borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: 'var(--bg-secondary)' }}>
              <tr>
                {['ID','Title','Assigned To','Status','Rows','Created','Actions'].map(h => (
                  <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontSize: 10,
                    fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase',
                    letterSpacing: '0.05em', borderBottom: '1px solid var(--border-light)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sheets.map((sheet, i) => (
                <tr key={sheet.id} style={{
                  background: i % 2 === 0 ? 'var(--bg-primary)' : 'var(--bg-secondary)',
                  borderBottom: '1px solid var(--border-light)' }}>
                  <td style={{ ...td, fontSize: 10, color: 'var(--accent)', fontWeight: 600 }}>{sheet.id.slice(-8)}</td>
                  <td style={{ ...td, fontWeight: 600 }}>{sheet.title}</td>
                  <td style={td}>{sheet.assigned_to || '-'}</td>
                  <td style={td}>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 4,
                      background: sheet.status === 'Active' ? 'var(--success-light)' : 'var(--bg-secondary)',
                      color: sheet.status === 'Active' ? 'var(--success)' : 'var(--text-tertiary)' }}>
                      {sheet.status}
                    </span>
                  </td>
                  <td style={td}>{(sheet.rows || []).length}</td>
                  <td style={{ ...td, fontSize: 11, color: 'var(--text-tertiary)' }}>
                    {new Date(sheet.created_at).toLocaleDateString()}
                  </td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>
                    <Link href={`/sheet?id=${sheet.id}`}>
                      <button className="xs primary">📋 View</button>
                    </Link>
                    <button className="xs" style={{ marginLeft: 4 }} onClick={() => downloadCSV(sheet)}>📥</button>
                    <button className="xs" style={{ marginLeft: 4 }} onClick={() => handleToggle(sheet)}>
                      {sheet.status === 'Active' ? 'Deactivate' : 'Activate'}
                    </button>
                    <button className="xs danger" style={{ marginLeft: 4 }} onClick={() => handleDelete(sheet)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">+ Create Order Sheet</span>
              <button className="small" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className="form-grid" style={{ marginBottom: 14 }}>
              <div className="form-group">
                <label>Sheet Title *</label>
                <input type="text" value={formData.title} autoFocus
                  onChange={e => setFormData({ ...formData, title: e.target.value })}
                  placeholder="e.g. January 2025 Orders" />
              </div>
              <div className="form-group">
                <label>Assigned To (Party Name) *</label>
                <input type="text" value={formData.assignedTo}
                  onChange={e => setFormData({ ...formData, assignedTo: e.target.value })}
                  placeholder="Party name" />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="primary" onClick={handleCreate} disabled={saving}>
                {saving ? 'Creating…' : '✓ Create Sheet'}
              </button>
              <button onClick={() => setShowModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const td: React.CSSProperties = { padding: '10px 14px', fontSize: 12, color: 'var(--text-primary)' }
