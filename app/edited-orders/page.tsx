'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface EditedOrder {
  id: string
  sheetId: string
  linkedOrderId: string
  rowId: string
  requestedBy: string
  requestedAt: string
  oldValues: Record<string, any>
  newValues: Record<string, any>
  status: 'pending' | 'approved' | 'rejected'
  rejectionReason?: string
  reviewedBy?: string
  reviewedAt?: string
}

interface FieldChange {
  field: string
  oldValue: any
  newValue: any
}

export default function EditedOrdersPage() {
  const [editedOrders, setEditedOrders] = useState<EditedOrder[]>([])
  const [showRejectModal, setShowRejectModal] = useState(false)
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectionReason, setRejectionReason] = useState('')

  useEffect(() => {
    loadEditedOrders()
  }, [])

  const loadEditedOrders = () => {
    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return

    const db = JSON.parse(stored)
    const pending = (db.editedOrders || []).filter((e: EditedOrder) => e.status === 'pending')
    setEditedOrders(pending)
  }

  const getChangedFields = (oldValues: Record<string, any>, newValues: Record<string, any>): FieldChange[] => {
    const changes: FieldChange[] = []
    const allKeys = new Set([...Object.keys(oldValues), ...Object.keys(newValues)])

    allKeys.forEach(key => {
      const oldVal = oldValues[key]
      const newVal = newValues[key]
      
      if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
        changes.push({
          field: key,
          oldValue: oldVal,
          newValue: newVal
        })
      }
    })

    return changes
  }

  const formatValue = (value: any): string => {
    if (value === null || value === undefined) return '-'
    if (typeof value === 'object') return JSON.stringify(value)
    return String(value)
  }

  const formatDateTime = (dateStr: string) => {
    if (!dateStr) return '-'
    try {
      const date = new Date(dateStr)
      const pad = (n: number) => n.toString().padStart(2, '0')
      return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`
    } catch {
      return '-'
    }
  }

  const handleApprove = (editId: string) => {
    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return

    const db = JSON.parse(stored)
    const rec = (db.editedOrders || []).find((e: EditedOrder) => e.id === editId && e.status === 'pending')
    
    if (!rec) {
      alert('Edit request not found.')
      return
    }

    // ✅ FIX: Try to find order by both ID and orderNumber
    // linkedOrderId might be the orderNumber field, not the id field
    const order = (db.orders || []).find((o: any) => o.id === rec.linkedOrderId || o.orderNumber === rec.linkedOrderId)
    
    if (!order) {
      alert('Linked order not found.')
      return
    }

    // Apply new values to order
    Object.keys(rec.newValues || {}).forEach(key => {
      order[key] = rec.newValues[key]
    })

    // Update edit record
    rec.status = 'approved'
    rec.reviewedBy = 'Admin'
    rec.reviewedAt = new Date().toISOString()

    // Update sheet row
    const sheet = (db.orderSheets || []).find((s: any) => s.id === rec.sheetId)
    if (sheet) {
      const row = (sheet.rows || []).find((r: any) => r.rowId === rec.rowId)
      if (row) {
        Object.keys(rec.newValues || {}).forEach(key => {
          row[key] = rec.newValues[key]
        })
        row.requestEdit = false
        row.submitForApproval = false
        row.approvalStatus = 'edit-accepted'
        row.rejectionReason = ''
        row.receivedAt = rec.reviewedAt
        
        // Clear edit history after approval
        row.editHistory = {}
        row.editRequestedOn = ''
        row.editRequestedBy = ''
        row.editReason = ''
      }
    }

    localStorage.setItem('dyeflow_db', JSON.stringify(db))
    alert('✓ Edit request approved successfully!')
    loadEditedOrders()
  }

  const handleReject = () => {
    if (!rejectionReason.trim()) {
      alert('Please enter rejection reason.')
      return
    }

    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return

    const db = JSON.parse(stored)
    const rec = (db.editedOrders || []).find((e: EditedOrder) => e.id === rejectingId && e.status === 'pending')
    
    if (!rec) {
      alert('Edit request not found.')
      return
    }

    // Update edit record
    rec.status = 'rejected'
    rec.reviewedBy = 'Admin'
    rec.reviewedAt = new Date().toISOString()
    rec.rejectionReason = rejectionReason

    // Update sheet row
    const sheet = (db.orderSheets || []).find((s: any) => s.id === rec.sheetId)
    if (sheet) {
      const row = (sheet.rows || []).find((r: any) => r.rowId === rec.rowId)
      if (row) {
        // Revert to old values
        Object.keys(rec.oldValues || {}).forEach(key => {
          row[key] = rec.oldValues[key]
        })
        row.requestEdit = false
        row.submitForApproval = false
        row.approvalStatus = 'rejected'
        row.rejectionReason = rejectionReason
        row.receivedAt = rec.reviewedAt
        
        // Clear edit history after rejection
        row.editHistory = {}
        row.editRequestedOn = ''
        row.editRequestedBy = ''
        row.editReason = ''
      }
    }

    localStorage.setItem('dyeflow_db', JSON.stringify(db))
    setShowRejectModal(false)
    setRejectingId(null)
    setRejectionReason('')
    alert('✓ Edit request rejected.')
    loadEditedOrders()
  }

  const openRejectModal = (editId: string) => {
    setRejectingId(editId)
    setRejectionReason('')
    setShowRejectModal(true)
  }

  return (
    <div className="content">
      <div className="card">
        <div className="card-header">
          <div>
            <span className="card-title">Pending Edited Orders</span>
            <span className="badge badge-pending" style={{ marginLeft: '8px' }}>
              {editedOrders.length}
            </span>
          </div>
          <button onClick={loadEditedOrders}>Refresh</button>
        </div>

        {editedOrders.length === 0 ? (
          <div className="empty-state">
            No pending edit requests.
          </div>
        ) : (
          editedOrders.map(edit => {
            const changes = getChangedFields(edit.oldValues || {}, edit.newValues || {})
            
            return (
              <div 
                key={edit.id}
                style={{
                  border: '1px solid var(--border-light)',
                  borderRadius: 'var(--radius-md)',
                  padding: '12px',
                  marginBottom: '10px'
                }}
              >
                {/* Header */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: '8px',
                  flexWrap: 'wrap',
                  marginBottom: '8px'
                }}>
                  <div style={{ fontSize: '12px' }}>
                    <strong>{edit.id}</strong>
                    &nbsp;|&nbsp; Order: {edit.linkedOrderId || '-'}
                    &nbsp;|&nbsp; Sheet: {edit.sheetId || '-'}
                    <div style={{ color: 'var(--text-tertiary)', marginTop: '2px' }}>
                      Requested by {edit.requestedBy || '-'} on {formatDateTime(edit.requestedAt)}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '4px', flex: '0 0 auto' }}>
                    <button 
                      className="xs success" 
                      onClick={() => handleApprove(edit.id)}
                    >
                      Approve
                    </button>
                    <button 
                      className="xs danger" 
                      onClick={() => openRejectModal(edit.id)}
                    >
                      Reject
                    </button>
                  </div>
                </div>

                {/* Changes Table */}
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Field</th>
                        <th>Old Value</th>
                        <th>New Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {changes.length === 0 ? (
                        <tr>
                          <td colSpan={3}>No difference detected.</td>
                        </tr>
                      ) : (
                        changes.map((change, idx) => (
                          <tr key={idx}>
                            <td>{change.field}</td>
                            <td>{formatValue(change.oldValue)}</td>
                            <td>{formatValue(change.newValue)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Footer Buttons */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: '6px',
                  marginTop: '10px'
                }}>
                  <button 
                    className="small success" 
                    onClick={() => handleApprove(edit.id)}
                  >
                    Approve This Edit
                  </button>
                  <button 
                    className="small danger" 
                    onClick={() => openRejectModal(edit.id)}
                  >
                    Reject This Edit
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Reject Modal */}
      {showRejectModal && (
        <div 
          className="modal-overlay"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}
          onClick={() => setShowRejectModal(false)}
        >
          <div 
            className="modal-content"
            style={{
              background: 'white',
              borderRadius: '8px',
              padding: '20px',
              maxWidth: '500px',
              width: '90%'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header" style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '16px'
            }}>
              <span className="modal-title">Reject Edit Request</span>
              <button 
                className="small" 
                onClick={() => setShowRejectModal(false)}
              >
                ✕
              </button>
            </div>
            <div className="form-group" style={{ marginBottom: '12px' }}>
              <label>Reason</label>
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Enter rejection reason"
                rows={4}
                style={{ width: '100%' }}
              />
            </div>
            <button 
              className="danger" 
              onClick={handleReject}
            >
              Reject
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
