'use client'

import { useEffect, useState, useCallback } from 'react'
import { createOrder } from '@/lib/db'

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

function genOrderNumber(existing: string[]): string {
  const year = new Date().getFullYear().toString().slice(2)
  const nums = existing
    .filter(n => n?.startsWith(`DYE${year}-`))
    .map(n => parseInt(n.split('-')[1]) || 0)
  const next = nums.length ? Math.max(...nums) + 1 : 1
  return `DYE${year}-${String(next).padStart(4, '0')}`
}

export default function PendingApprovalsPage() {
  const [items,      setItems]      = useState<any[]>([])
  const [loading,    setLoading]    = useState(true)
  const [saving,     setSaving]     = useState(false)
  const [rejectModal, setRejectModal] = useState<any>(null)
  const [rejectReason, setRejectReason] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await getSheets()
      if (!res.ok) return
      const pending: any[] = []
      for (const sheet of (res.data || [])) {
        for (let i = 0; i < (sheet.rows || []).length; i++) {
          const row = sheet.rows[i]
          if (row.isBatchRow) continue
          if (row.approvalStatus !== 'pending' && !row.submitForApproval) continue
          pending.push({ sheet, row, rowIndex: i })
        }
      }
      setItems(pending)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleApprove = async (item: any) => {
    if (!confirm('Approve this row and create an order?')) return
    setSaving(true)
    try {
      // Get existing order numbers for sequence
      const { data: existingOrders } = await fetch('/api/orders', { cache: 'no-store' })
        .then(r => r.json()).catch(() => ({ data: [] }))
      const existingNos = (existingOrders || []).map((o: any) => o.order_number)
      const orderNumber = genOrderNumber(existingNos)

      const { row } = item

      // Create order in Supabase
      const { error } = await createOrder({
        order_number:    orderNumber,
        party:           row.party || '',
        sub_party:       row.subParty || '',
        sales_person:    row.salesPerson || '',
        article:         row.article || '',
        blend:           row.blend || '',
        width:           row.width || '',
        gsm:             row.gsm || '',
        color:           row.color || '',
        lab_no:          row.labNo || '',
        lot_no:          row.lotNo || '',
        challan_no:      row.challanNo || '',
        qty_kg:          parseFloat(row.qtyKg) || 0,
        qty_mtr:         parseFloat(row.qtyMtr) || 0,
        no_of_taka:      parseInt(row.noOfTa) || 0,
        type_of_finish:  row.typeOfFinish || '',
        type_of_packing: row.typeOfPacking || '',
        remarks:         row.remarks || '',
        status:          'new',
        process_route:   [],
      })

      if (error) { alert('Error creating order: ' + error); return }

      // Update sheet row
      const updatedRows = [...item.sheet.rows]
      updatedRows[item.rowIndex] = {
        ...row,
        approvalStatus:  'approved',
        orderNumber,
        submitForApproval: false,
        requestEdit:     false,
        receivedAt:      new Date().toISOString(),
      }

      const res = await updateSheetRows(item.sheet.id, updatedRows)
      if (!res.ok) { alert('Warning: order created but sheet update failed'); return }

      alert(`✓ Approved! Order ${orderNumber} created.`)
      load()
    } finally { setSaving(false) }
  }

  const handleReject = async () => {
    if (!rejectReason.trim()) { alert('Please enter a rejection reason'); return }
    if (!rejectModal) return
    setSaving(true)
    try {
      const updatedRows = [...rejectModal.sheet.rows]
      updatedRows[rejectModal.rowIndex] = {
        ...rejectModal.row,
        approvalStatus:  'rejected',
        submitForApproval: false,
        requestEdit:     false,
        rejectionReason: rejectReason,
        receivedAt:      new Date().toISOString(),
      }
      await updateSheetRows(rejectModal.sheet.id, updatedRows)
      setRejectModal(null)
      setRejectReason('')
      alert('Row rejected.')
      load()
    } finally { setSaving(false) }
  }

  const fmtDate = (d?: string) => {
    if (!d) return '-'
    try { return new Date(d).toLocaleString('en-GB') } catch { return d }
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '60vh', color: 'var(--text-tertiary)', fontSize: 14 }}>
      Loading pending approvals…
    </div>
  )

  return (
    <div className="content" style={{ padding: '16px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 16, fontWeight: 700 }}>Pending Approvals</span>
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
          ✓ No rows pending approval.
        </div>
      ) : (
        <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)',
          borderRadius: 10, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1400 }}>
            <thead style={{ background: 'var(--bg-secondary)', position: 'sticky', top: 0, zIndex: 5 }}>
              <tr>
                {['Sheet','Row','Party','Sub Party','Article','Color','Qty (Kg)','Qty (Mtr)','Remarks','Submitted On','Actions'].map(h => (
                  <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontSize: 10,
                    fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase',
                    letterSpacing: '0.05em', borderBottom: '1px solid var(--border-light)',
                    whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--border-light)',
                  background: i % 2 === 0 ? 'var(--bg-primary)' : 'var(--bg-secondary)' }}>
                  <td style={td}>{item.sheet.title}</td>
                  <td style={td}>{item.rowIndex + 1}</td>
                  <td style={{ ...td, fontWeight: 500 }}>{item.row.party || '-'}</td>
                  <td style={td}>{item.row.subParty || '-'}</td>
                  <td style={{ ...td, fontWeight: 500 }}>{item.row.article || '-'}</td>
                  <td style={td}>{item.row.color || '-'}</td>
                  <td style={{ ...td, fontWeight: 700 }}>{item.row.qtyKg || '-'}</td>
                  <td style={td}>{item.row.qtyMtr || '-'}</td>
                  <td style={{ ...td, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.row.remarks || '-'}</td>
                  <td style={{ ...td, whiteSpace: 'nowrap', fontSize: 11, color: 'var(--text-tertiary)' }}>{fmtDate(item.row.submittedOn)}</td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>
                    <button className="xs" style={{ background: 'var(--success)', color: '#fff',
                      border: 'none', cursor: 'pointer', fontWeight: 600 }}
                      disabled={saving} onClick={() => handleApprove(item)}>
                      Approve
                    </button>
                    <button className="xs danger" style={{ marginLeft: 4 }}
                      onClick={() => { setRejectModal(item); setRejectReason('') }}>
                      Reject
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {rejectModal && (
        <div className="modal-overlay" onClick={() => setRejectModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Reject Row</span>
              <button className="small" onClick={() => setRejectModal(null)}>✕</button>
            </div>
            <div className="form-group" style={{ marginBottom: 14 }}>
              <label>Rejection reason *</label>
              <textarea value={rejectReason} rows={4} autoFocus
                onChange={e => setRejectReason(e.target.value)}
                placeholder="Enter rejection reason" />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={{ background: 'var(--danger)', color: '#fff', border: 'none',
                padding: '8px 16px', borderRadius: 6, fontWeight: 700, cursor: 'pointer' }}
                disabled={saving} onClick={handleReject}>
                {saving ? 'Rejecting…' : 'Reject Row'}
              </button>
              <button onClick={() => setRejectModal(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const td: React.CSSProperties = { padding: '10px 12px', fontSize: 12, color: 'var(--text-primary)' }
