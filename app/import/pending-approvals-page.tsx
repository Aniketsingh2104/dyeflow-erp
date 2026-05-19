'use client'
import { useEffect, useState } from 'react'

interface SheetRow {
  rowId?: string
  approvalStatus: string
  submitForApproval?: boolean
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
  qtyKg: number | string
  qtyMtr: number | string
  noOfTa: number | string
  typeOfFinish: string
  typeOfPacking: string
  remarks: string
  submittedBy?: string
  submittedOn?: string
  isBatchRow?: boolean
  rejectionReason?: string
  orderNumber?: string
  requestEdit?: boolean
  receivedAt?: string
}

interface OrderSheet {
  id: string
  title: string
  userId: string
  rows: SheetRow[]
}

interface PendingItem {
  sheet: OrderSheet
  row: SheetRow
  rowIndex: number
}

export default function PendingApprovalsPage() {
  const [pendingItems, setPendingItems] = useState<PendingItem[]>([])
  const [showRejectModal, setShowRejectModal] = useState(false)
  const [selectedItem, setSelectedItem] = useState<PendingItem | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  useEffect(() => {
    loadPendingApprovals()
  }, [])

  const loadPendingApprovals = () => {
    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return

    const db = JSON.parse(stored)
    const items: PendingItem[] = []

    const orderSheets = db.orderSheets || []
    orderSheets.forEach((sheet: OrderSheet) => {
      (sheet.rows || []).forEach((row: SheetRow, idx: number) => {
        if (row.isBatchRow) return
        if (row.approvalStatus !== 'pending' && !row.submitForApproval) return
        items.push({ sheet, row, rowIndex: idx })
      })
    })

    setPendingItems(items)
  }

  const handleApprove = (item: PendingItem) => {
    if (!confirm('Approve this row and create an order?')) return

    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return

    const db = JSON.parse(stored)
    
    const sheetIndex = db.orderSheets?.findIndex((s: OrderSheet) => s.id === item.sheet.id)
    if (sheetIndex === -1) return

    const sheet = db.orderSheets[sheetIndex]
    const row = sheet.rows[item.rowIndex]

    const formatDateTime = () => {
      const now = new Date()
      const pad = (n: number) => n.toString().padStart(2, '0')
      return `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}`
    }

    const generateOrderNumber = () => {
      const year = new Date().getFullYear().toString().substr(2)
      const existingNumbers = (db.orders || [])
        .map((o: any) => o.orderNumber)
        .filter((n: string) => n && n.startsWith(`DYE${year}-`))
        .map((n: string) => parseInt(n.split('-')[1]) || 0)
      const nextNum = existingNumbers.length > 0 ? Math.max(...existingNumbers) + 1 : 1
      return `DYE${year}-${nextNum.toString().padStart(4, '0')}`
    }

    const newOrder = {
      id: `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: formatDateTime(),
      party: row.party || '',
      subParty: row.subParty || '',
      salesPerson: row.salesPerson || '',
      article: row.article || '',
      blend: row.blend || '',
      width: row.width || '',
      gsm: row.gsm || '',
      color: row.color || '',
      labNo: row.labNo || '',
      lotNo: row.lotNo || '',
      challanNo: row.challanNo || '',
      qtyKg: row.qtyKg || 0,
      qtyMtr: row.qtyMtr || 0,
      noOfTaka: row.noOfTa || 0,
      typeOfFinish: row.typeOfFinish || '',
      typeOfPacking: row.typeOfPacking || '',
      remarks: row.remarks || '',
      holdApproval: '',
      holdReason: '',
      orderNumber: generateOrderNumber(),
      supervisor: '',
      routeTemplateName: '',
      processRoute: [],
      machine: '',
      status: 'new',
      supervisorConfirmed: false,
      supervisorConfirmedAt: '',
      splits: []
    }

    if (!db.orders) db.orders = []
    db.orders.push(newOrder)

    row.approvalStatus = 'approved'
    row.orderNumber = newOrder.orderNumber
    row.submitForApproval = false
    row.requestEdit = false
    row.receivedAt = new Date().toISOString()

    localStorage.setItem('dyeflow_db', JSON.stringify(db))
    
    alert(`✓ Row approved and order ${newOrder.orderNumber} created!`)
    loadPendingApprovals()
  }

  const handleReject = () => {
    if (!selectedItem) return
    if (!rejectReason.trim()) {
      alert('Please enter a rejection reason')
      return
    }

    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return

    const db = JSON.parse(stored)
    
    const sheetIndex = db.orderSheets?.findIndex((s: OrderSheet) => s.id === selectedItem.sheet.id)
    if (sheetIndex === -1) return

    const sheet = db.orderSheets[sheetIndex]
    const row = sheet.rows[selectedItem.rowIndex]

    row.approvalStatus = 'rejected'
    row.submitForApproval = false
    row.requestEdit = false
    row.rejectionReason = rejectReason
    row.receivedAt = new Date().toISOString()

    localStorage.setItem('dyeflow_db', JSON.stringify(db))

    setShowRejectModal(false)
    setSelectedItem(null)
    setRejectReason('')
    alert('Row rejected')
    loadPendingApprovals()
  }

  const openRejectModal = (item: PendingItem) => {
    setSelectedItem(item)
    setRejectReason('')
    setShowRejectModal(true)
  }

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-'
    try {
      const date = new Date(dateStr)
      const pad = (n: number) => n.toString().padStart(2, '0')
      return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`
    } catch {
      return '-'
    }
  }

  return (
    <div className="content">
      <div className="card">
        <div className="card-header">
          <span className="card-title">Pending Approvals</span>
          <span className="badge badge-pending">{pendingItems.length}</span>
        </div>

        {pendingItems.length === 0 ? (
          <div className="empty-state">No rows pending approval.</div>
        ) : (
          <div className="table-wrap" style={{ overflowX: 'auto' }}>
            <table style={{ minWidth: '2200px' }}>
              <thead>
                <tr>
                  <th>Sheet</th>
                  <th>Row</th>
                  <th>Party</th>
                  <th>Sub Party</th>
                  <th>Sales Person</th>
                  <th>Article</th>
                  <th>Blend</th>
                  <th>Width</th>
                  <th>GSM</th>
                  <th>Color</th>
                  <th>Lab No.</th>
                  <th>Lot No.</th>
                  <th>Challan No.</th>
                  <th>Qty (Kg)</th>
                  <th>Qty (Mtr.)</th>
                  <th>No. of Ta</th>
                  <th>Type of Finish</th>
                  <th>Type of Packing</th>
                  <th>Remarks</th>
                  <th>Submitted By</th>
                  <th>Submitted On</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pendingItems.map((item, i) => (
                  <tr key={i}>
                    <td>{item.sheet.title}</td>
                    <td>{item.rowIndex + 1}</td>
                    <td>{item.row.party || '-'}</td>
                    <td>{item.row.subParty || '-'}</td>
                    <td>{item.row.salesPerson || '-'}</td>
                    <td>{item.row.article || '-'}</td>
                    <td>{item.row.blend || '-'}</td>
                    <td>{item.row.width || '-'}</td>
                    <td>{item.row.gsm || '-'}</td>
                    <td>{item.row.color || '-'}</td>
                    <td>{item.row.labNo || '-'}</td>
                    <td>{item.row.lotNo || '-'}</td>
                    <td>{item.row.challanNo || '-'}</td>
                    <td>{item.row.qtyKg || '-'}</td>
                    <td>{item.row.qtyMtr || '-'}</td>
                    <td>{item.row.noOfTa || '-'}</td>
                    <td>{item.row.typeOfFinish || '-'}</td>
                    <td>{item.row.typeOfPacking || '-'}</td>
                    <td>{item.row.remarks || '-'}</td>
                    <td>{item.row.submittedBy || item.sheet.userId || '-'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{formatDate(item.row.submittedOn)}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button className="xs success" onClick={() => handleApprove(item)}>Approve</button>
                      <button className="xs danger" style={{ marginLeft: '4px' }} onClick={() => openRejectModal(item)}>Reject</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showRejectModal && (
        <div className="modal-overlay" onClick={() => setShowRejectModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Reject Pending Row</span>
              <button className="small" onClick={() => setShowRejectModal(false)}>✕ Close</button>
            </div>
            <div className="form-group" style={{ marginBottom: '12px' }}>
              <label>Reason *</label>
              <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Enter rejection reason" rows={4} />
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="danger" onClick={handleReject}>Reject Row</button>
              <button onClick={() => setShowRejectModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
