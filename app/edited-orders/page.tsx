'use client'

import { useEffect, useState, useCallback } from 'react'
import { updateOrder } from '@/lib/db'

async function getSheets() {
  const res = await fetch('/api/order-sheets', { cache: 'no-store' })
  return res.json()
}

async function updateSheetRows(id: string, rows: any[]) {
  const res = await fetch('/api/order-sheets', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'update_rows', id, rows }),
  })
  return res.json()
}

export default function EditedOrdersPage() {
  const [items,        setItems]        = useState<any[]>([])
  const [loading,      setLoading]      = useState(true)
  const [saving,       setSaving]       = useState(false)
  const [rejectModal,  setRejectModal]  = useState<any>(null)
  const [rejectReason, setRejectReason] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      // Edit requests are stored in sheet rows with requestEdit=true
      const res = await getSheets()
      if (!res.ok) return
      const pending: any[] = []
      for (const sheet of (res.data || [])) {
        for (let i = 0; i < (sheet.rows || []).length; i++) {
          const row = sheet.rows[i]
          if (!row.requestEdit) continue
          if (!row.editHistory || Object.keys(row.editHistory).length === 0) continue
          pending.push({ sheet, row, rowIndex: i })
        }
      }
      setItems(pending)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const getChanges = (history: Record<string, { old: any; new: any }>) =>
    Object.entries(history).map(([field, { old: oldVal, new: newVal }]) => ({
      field, oldVal, newVal,
    }))

  const handleApprove = async (item: any) => {
    if (!confirm('Approve this edit and update the order?')) return
    setSaving(true)
    try {
      const { row } = item
      const history: Record<string, { old: any; new: any }> = row.editHistory || {}

      // Build patch from new values in editHistory
      const patch: Record<string, any> = {}
      for (const [field, { new: newVal }] of Object.entries(history)) {
        // Map camelCase sheet fields to snake_case order fields
        const fieldMap: Record<string, string> = {
          party: 'party', subParty: 'sub_party', salesPerson: 'sales_person',
          article: 'article', color: 'color', blend: 'blend',
          qtyKg: 'qty_kg', qtyMtr: 'qty_mtr', remarks: 'remarks',
          labNo: 'lab_no', lotNo: 'lot_no', challanNo: 'challan_no',
        }
        const dbField = fieldMap[field] || field
        patch[dbField] = newVal
      }

      // Find linked order by order number
      if (row.orderNumber) {
        const ordersRes = await fetch('/api/orders', { cache: 'no-store' }).then(r => r.json())
        const order = (ordersRes.data || []).find((o: any) => o.order_number === row.orderNumber)
        if (order) {
          const { error } = await updateOrder(order.id, patch)
          if (error) { alert('Error updating order: ' + error); return }
        }
      }

      // Update sheet row
      const updatedRows = [...item.sheet.rows]
      updatedRows[item.rowIndex] = {
        ...row,
        ...Object.fromEntries(Object.entries(history).map(([f, { new: v }]) => [f, v])),
        requestEdit:    false,
        editHistory:    {},
        approvalStatus: 'edit-accepted',
        rejectionReason: '',
        receivedAt:     new Date().toISOString(),
      }
      await updateSheetRows(item.sheet.id, updatedRows)
      alert('✓ Edit approved and order updated!')
      load()
    } finally { setSaving(false) }
  }

  const handleReject = async () => {
    if (!rejectReason.trim()) { alert('Please enter a rejection reason'); return }
    if (!rejectModal) return
    setSaving(true)
    try {
      const { row } = rejectModal
      const history: Record<string, { old: any; new: any }> = row.editHistory || {}

      // Revert row to old values
      const updatedRows = [...rejectModal.sheet.rows]
      updatedRows[rejectModal.rowIndex] = {
        ...row,
        ...Object.fromEntries(Object.entries(history).map(([f, { old: v }]) => [f, v])),
        requestEdit:    false,
        editHistory:    {},
        approvalStatus: 'rejected',
        rejectionReason: rejectReason,
        receivedAt:     new Date().toISOString(),
      }
      await updateSheetRows(rejectModal.sheet.id, updatedRows)
      setRejectModal(null)
      setRejectReason('')
      alert('✓ Edit rejected.')
      load()
    } finally { setSaving(false) }
  }

  const fmtDate = (d?: string) => {
    if (!d) return '-'
    try { return new Date(d).toLocaleString('en-GB') } catch { return d }
  }

  const fmtVal = (v: any) => {
    if (v === null || v === undefined) return '-'
    if (typeof v === 'object') return JSON.stringify(v)
    return String(v)
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '60vh', color: 'var(--text-tertiary)', fontSize: 14 }}>
      Loading edit requests…
    </div>
  )

  return (
    <div className="content" style={{ padding: '16px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 16, fontWeight: 700 }}>Pending Edited Orders</span>
          <span style={{ fontSize: 13, fontWeight: 700, padding: '3px 10px', borderRadius: 10,
            background: items.length > 0 ? 'var(--warning-light)' : 'var(--bg-secondary)',
            color: items.length > 0 ? 'var(--warning)' : 'var(--text-tertiary)' }}>
            {items.length}
          </span>
        </div>
        <button className="small" onClick={load}>⟳ Refresh</button>
      </div>

      {items.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--success)', fontSize: 15, fontWeight: 600 }}>
          ✓ No pending edit requests.
        </div>
      ) : (
        items.map((item, idx) => {
          const changes = getChanges(item.row.editHistory || {})
          return (
            <div key={idx} style={{ background: 'var(--bg-primary)',
              border: '1px solid var(--border-light)', borderRadius: 10,
              marginBottom: 12, overflow: 'hidden' }}>

              {/* Header */}
              <div style={{ padding: '12px 16px', background: 'var(--bg-secondary)',
                borderBottom: '1px solid var(--border-light)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <span style={{ fontWeight: 700, color: 'var(--accent)' }}>{item.row.orderNumber || '—'}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginLeft: 8 }}>
                    Sheet: {item.sheet.title} · Row {item.rowIndex + 1}
                  </span>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
                    Requested: {fmtDate(item.row.editRequestedOn)}
                    {item.row.editReason && <> · Reason: <em>{item.row.editReason}</em></>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="xs" style={{ background: 'var(--success)', color: '#fff',
                    border: 'none', cursor: 'pointer', fontWeight: 600 }}
                    disabled={saving} onClick={() => handleApprove(item)}>
                    Approve
                  </button>
                  <button className="xs danger"
                    onClick={() => { setRejectModal(item); setRejectReason('') }}>
                    Reject
                  </button>
                </div>
              </div>

              {/* Changes table */}
              <div style={{ padding: '12px 16px' }}>
                {changes.length === 0 ? (
                  <div style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>No changes detected.</div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: 'var(--bg-secondary)' }}>
                        {['Field','Old Value','New Value'].map(h => (
                          <th key={h} style={{ padding: '7px 10px', textAlign: 'left', fontSize: 10,
                            fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase',
                            letterSpacing: '0.05em', borderBottom: '1px solid var(--border-light)' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {changes.map((c, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid var(--border-light)' }}>
                          <td style={{ ...td, fontWeight: 600 }}>{c.field}</td>
                          <td style={{ ...td, color: 'var(--danger)', textDecoration: 'line-through' }}>{fmtVal(c.oldVal)}</td>
                          <td style={{ ...td, color: 'var(--success)', fontWeight: 600 }}>{fmtVal(c.newVal)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )
        })
      )}

      {rejectModal && (
        <div className="modal-overlay" onClick={() => setRejectModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Reject Edit Request</span>
              <button className="small" onClick={() => setRejectModal(null)}>✕</button>
            </div>
            <div className="form-group" style={{ marginBottom: 14 }}>
              <label>Rejection reason *</label>
              <textarea value={rejectReason} rows={4} autoFocus
                onChange={e => setRejectReason(e.target.value)}
                placeholder="Why is this edit being rejected?" />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={{ background: 'var(--danger)', color: '#fff', border: 'none',
                padding: '8px 16px', borderRadius: 6, fontWeight: 700, cursor: 'pointer' }}
                disabled={saving} onClick={handleReject}>
                {saving ? 'Rejecting…' : 'Reject'}
              </button>
              <button onClick={() => setRejectModal(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const td: React.CSSProperties = { padding: '9px 10px', fontSize: 12, color: 'var(--text-primary)' }
