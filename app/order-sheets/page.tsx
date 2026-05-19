'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'

interface OrderSheetRow {
  submitForApproval?: boolean
  requestEdit?: boolean
  party: string
  subParty: string
  salesPerson: string
  article: string
  blend: string
  width: string
  gsm: string
  color: string
  labNo: string
  lotNo: string
  challanNo: string
  qtyKg: number
  qtyMtr: number
  noOfTa: number
  typeOfFinish: string
  typeOfPacking: string
  remarks: string
  holdReason: string
  orderNumber: string
  process: string
  deliveryDate: string
  currentStage: string
  approvalStatus: string
  rejectionReason: string
  submittedOn: string
  receivedAt: string
}

interface OrderSheet {
  id: string
  title: string
  assignedTo: string
  userId: string
  password: string
  status: 'Active' | 'Closed'
  createdAt: string
  rows: OrderSheetRow[]
}

export default function OrderSheetsPage() {
  const [sheets, setSheets] = useState<OrderSheet[]>([])
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [formData, setFormData] = useState({
    title: '',
    assignedTo: '',
    userId: '',
    password: ''
  })

  useEffect(() => {
    loadSheets()
  }, [])

  const loadSheets = () => {
    const stored = localStorage.getItem('dyeflow_db')
    if (stored) {
      const db = JSON.parse(stored)
      const orderSheets = db.orderSheets || []
      setSheets(orderSheets.sort((a: OrderSheet, b: OrderSheet) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ))
    }
  }

  const handleCreateSheet = () => {
    if (!formData.title || !formData.assignedTo || !formData.userId || !formData.password) {
      alert('Please fill in all fields')
      return
    }

    const stored = localStorage.getItem('dyeflow_db')
    const db = stored ? JSON.parse(stored) : { orders: [], supervisors: [], orderSheets: [] }

    if (!db.orderSheets) db.orderSheets = []

    // Create blank row
    const blankRow: OrderSheetRow = {
      party: '',
      subParty: '',
      salesPerson: '',
      article: '',
      blend: '',
      width: '',
      gsm: '',
      color: '',
      labNo: '',
      lotNo: '',
      challanNo: '',
      qtyKg: 0,
      qtyMtr: 0,
      noOfTa: 0,
      typeOfFinish: '',
      typeOfPacking: '',
      remarks: '',
      holdReason: '',
      orderNumber: '',
      process: '',
      deliveryDate: '',
      currentStage: '',
      approvalStatus: 'draft',
      rejectionReason: '',
      submittedOn: '',
      receivedAt: ''
    }

    const newSheet: OrderSheet = {
      id: `SHEET-${Date.now()}`,
      title: formData.title,
      assignedTo: formData.assignedTo,
      userId: formData.userId,
      password: formData.password,
      status: 'Active',
      createdAt: new Date().toISOString(),
      rows: [blankRow]
    }

    db.orderSheets.push(newSheet)
    localStorage.setItem('dyeflow_db', JSON.stringify(db))

    alert(`✓ Order Sheet Created!\n\nUser ID: ${formData.userId}\nPassword: ${formData.password}\n\nClick "View Sheet" to open the spreadsheet.`)

    setShowCreateModal(false)
    setFormData({ title: '', assignedTo: '', userId: '', password: '' })
    loadSheets()
  }

  const downloadSheetExcel = (sheet: OrderSheet) => {
    const headers = [
      'Submit for Approval', 'Request Edit', 'Party', 'Sub Party', 'Sales Person', 
      'Article', 'Blend', 'Width', 'GSM', 'Color', 'Lab No.', 'Lot No.', 'Challan No.', 
      'Qty (Kg)', 'Qty (Mtr.)', 'No. of Ta', 'Type of Finish', 'Type of Packing', 
      'Remarks', 'Hold Reason', 'Order Number', 'Process', 'Delivery Date', 
      'Current Stage', 'Approval Status', 'Rejection Reason', 'Sent At', 'Received At'
    ]

    const rows = (sheet.rows || []).map(row => [
      row.submitForApproval ? 'TRUE' : 'FALSE',
      row.requestEdit ? 'TRUE' : 'FALSE',
      row.party || '',
      row.subParty || '',
      row.salesPerson || '',
      row.article || '',
      row.blend || '',
      row.width || '',
      row.gsm || '',
      row.color || '',
      row.labNo || '',
      row.lotNo || '',
      row.challanNo || '',
      row.qtyKg || '',
      row.qtyMtr || '',
      row.noOfTa || '',
      row.typeOfFinish || '',
      row.typeOfPacking || '',
      row.remarks || '',
      row.holdReason || '',
      row.orderNumber || '',
      row.process || '',
      row.deliveryDate || '',
      row.currentStage || '',
      row.approvalStatus || 'draft',
      row.rejectionReason || '',
      row.submittedOn || '',
      row.receivedAt || ''
    ])

    const escapeCSV = (val: any) => {
      const str = String(val || '')
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`
      }
      return str
    }

    const csv = [
      headers.map(escapeCSV).join(','),
      ...rows.map(row => row.map(escapeCSV).join(','))
    ].join('\n')

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', `${sheet.title.replace(/[^a-z0-9]+/ig, '_') || 'order_sheet'}.csv`)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const handleToggleStatus = (sheetId: string) => {
    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return

    const db = JSON.parse(stored)
    const sheet = db.orderSheets?.find((s: OrderSheet) => s.id === sheetId)
    if (sheet) {
      sheet.status = sheet.status === 'Active' ? 'Closed' : 'Active'
      localStorage.setItem('dyeflow_db', JSON.stringify(db))
      loadSheets()
    }
  }

  const handleDeleteSheet = (sheetId: string) => {
    if (!confirm('Delete this order sheet? This cannot be undone.')) return

    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return

    const db = JSON.parse(stored)
    db.orderSheets = (db.orderSheets || []).filter((s: OrderSheet) => s.id !== sheetId)
    localStorage.setItem('dyeflow_db', JSON.stringify(db))
    loadSheets()
  }

  const handleResetPassword = (sheetId: string) => {
    const sheet = sheets.find(s => s.id === sheetId)
    if (!sheet) return

    const newPassword = prompt(`Enter new password for ${sheet.userId}:`, sheet.password)
    if (!newPassword) return

    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return

    const db = JSON.parse(stored)
    const dbSheet = db.orderSheets?.find((s: OrderSheet) => s.id === sheetId)
    if (dbSheet) {
      dbSheet.password = newPassword
      localStorage.setItem('dyeflow_db', JSON.stringify(db))
      loadSheets()
      alert(`Password updated!\nUser ID: ${sheet.userId}\nNew Password: ${newPassword}`)
    }
  }

  return (
    <div className="content">
      <div className="card">
        <div className="card-header">
          <span className="card-title">Order Sheets</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
              {sheets.length} sheet{sheets.length !== 1 ? 's' : ''}
            </span>
            <button className="primary" onClick={() => setShowCreateModal(true)}>
              + Create Order Sheet
            </button>
          </div>
        </div>

        {sheets.length === 0 ? (
          <div className="empty-state">No order sheets created yet.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Title</th>
                  <th>Assigned To</th>
                  <th>User ID</th>
                  <th>Status</th>
                  <th>Rows</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sheets.map(sheet => (
                  <tr key={sheet.id}>
                    <td style={{ fontWeight: 600 }}>{sheet.id}</td>
                    <td>{sheet.title}</td>
                    <td>{sheet.assignedTo || '-'}</td>
                    <td style={{ fontFamily: 'monospace' }}>{sheet.userId}</td>
                    <td>
                      {sheet.status === 'Active' ? (
                        <span className="badge badge-done">Active</span>
                      ) : (
                        <span className="badge badge-hold">Closed</span>
                      )}
                    </td>
                    <td>{sheet.rows?.length || 0}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {new Date(sheet.createdAt).toLocaleDateString()}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <Link href={`/sheet?id=${sheet.id}`}>
                        <button className="xs primary">📋 View Sheet</button>
                      </Link>
                      <button className="xs" onClick={() => downloadSheetExcel(sheet)} style={{ marginLeft: '4px' }}>
                        📥 Download
                      </button>
                      <button className="xs" onClick={() => handleResetPassword(sheet.id)} style={{ marginLeft: '4px' }}>
                        Reset Pwd
                      </button>
                      <button 
                        className="xs" 
                        style={{ marginLeft: '4px' }}
                        onClick={() => handleToggleStatus(sheet.id)}
                      >
                        {sheet.status === 'Active' ? 'Deactivate' : 'Activate'}
                      </button>
                      <button 
                        className="xs danger" 
                        style={{ marginLeft: '4px' }}
                        onClick={() => handleDeleteSheet(sheet.id)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Sheet Modal */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">+ Create Order Sheet</span>
              <button className="small" onClick={() => setShowCreateModal(false)}>✕ Close</button>
            </div>

            <div className="form-grid" style={{ marginBottom: '14px' }}>
              <div className="form-group">
                <label>Sheet Title *</label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="e.g., January 2025 Orders"
                />
              </div>

              <div className="form-group">
                <label>Assigned To (Party Name) *</label>
                <input
                  type="text"
                  value={formData.assignedTo}
                  onChange={(e) => setFormData({ ...formData, assignedTo: e.target.value })}
                  placeholder="Party name"
                />
              </div>

              <div className="form-group">
                <label>User ID *</label>
                <input
                  type="text"
                  value={formData.userId}
                  onChange={(e) => setFormData({ ...formData, userId: e.target.value })}
                  placeholder="e.g., BUYER-JAN"
                />
              </div>

              <div className="form-group">
                <label>Password *</label>
                <input
                  type="text"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="Temporary password"
                />
              </div>
            </div>

            <div style={{ 
              background: 'var(--accent-light)', 
              padding: '10px 14px', 
              borderRadius: 'var(--radius-md)', 
              marginBottom: '14px',
              fontSize: '12px',
              color: 'var(--accent-dark)'
            }}>
              <strong>Note:</strong> After creating the sheet, click "View Sheet" to open the Excel-like spreadsheet interface.
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="primary" onClick={handleCreateSheet}>✓ Create Sheet</button>
              <button onClick={() => setShowCreateModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
