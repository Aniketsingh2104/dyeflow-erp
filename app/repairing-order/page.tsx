'use client'

import { useEffect, useState } from 'react'

interface RepairingOrder {
  id: string
  orderNo: string
  batchId: string
  party: string
  subParty?: string
  salesPerson?: string
  article?: string
  blend?: string
  color?: string
  qtyKg: number
  qtyMtr?: string
  noOfTaka?: string
  processRoute?: string
  orderRemarks?: string
  issueType: string
  issueDescription: string
  reportedBy: string
  reportedDate: string
  priority: 'Low' | 'Medium' | 'High' | 'Critical'
  status: 'Pending' | 'In Repair' | 'Completed' | 'Rejected'
  assignedTo?: string
  repairStartDate?: string
  repairCompletedDate?: string
  repairRemarks?: string
  supervisor?: string
  // Route and machine assignment from supervisor
  routeTemplateName?: string
  processMachines?: {[key: string]: string[]}
  supervisorConfirmed?: boolean
  supervisorConfirmedAt?: string
  // FMS dispatch tracking
  sentToFMS?: boolean
  sentToFMSAt?: string
}

export default function RepairingOrderPage() {
  const [repairingOrders, setRepairingOrders] = useState<RepairingOrder[]>([])
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [filterStatus, setFilterStatus] = useState<string>('All')
  const [filterPriority, setFilterPriority] = useState<string>('All')
  const [formData, setFormData] = useState({
    orderNo: '',
    batchId: '',
    party: '',
    issueType: '',
    issueDescription: '',
    priority: 'Medium' as 'Low' | 'Medium' | 'High' | 'Critical',
    assignedTo: ''
  })

  useEffect(() => {
    loadRepairingOrders()
    const interval = setInterval(loadRepairingOrders, 5000)
    return () => clearInterval(interval)
  }, [])

  const loadRepairingOrders = () => {
    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) {
      setRepairingOrders([])
      return
    }

    const db = JSON.parse(stored)
    const orders = db.repairingOrders || []
    setRepairingOrders(orders)
  }

  const saveRepairingOrder = () => {
    if (!formData.orderNo || !formData.batchId || !formData.issueType || !formData.issueDescription) {
      alert('Please fill in all required fields')
      return
    }

    const stored = localStorage.getItem('dyeflow_db')
    const db = stored ? JSON.parse(stored) : {}
    if (!db.repairingOrders) db.repairingOrders = []

    // Find order and batch details
    let orderData: any = null
    let batchData: any = null

    for (const order of (db.orders || [])) {
      const batch = (order.splits || []).find((b: any) => b.batchId === formData.batchId)
      if (batch && order.orderNumber === formData.orderNo) {
        orderData = order
        batchData = batch
        break
      }
    }

    const newRepairingOrder: RepairingOrder = {
      id: `REP${Date.now()}`,
      orderNo: formData.orderNo,
      batchId: formData.batchId,
      party: orderData?.party || formData.party,
      subParty: orderData?.subParty || '',
      salesPerson: orderData?.salesPerson || '',
      article: orderData?.article || '',
      blend: orderData?.blend || '',
      color: orderData?.color || '',
      qtyKg: batchData?.kg || 0,
      processRoute: (orderData?.processRoute || []).join('/'),
      issueType: formData.issueType,
      issueDescription: formData.issueDescription,
      reportedBy: 'System User',
      reportedDate: new Date().toISOString(),
      priority: formData.priority,
      status: 'Pending',
      assignedTo: formData.assignedTo,
      supervisor: orderData?.supervisor || ''
    }

    db.repairingOrders.push(newRepairingOrder)
    localStorage.setItem('dyeflow_db', JSON.stringify(db))

    setIsModalOpen(false)
    resetForm()
    loadRepairingOrders()
    alert('✓ Repairing order created successfully!')
  }

  const resetForm = () => {
    setFormData({
      orderNo: '',
      batchId: '',
      party: '',
      issueType: '',
      issueDescription: '',
      priority: 'Medium',
      assignedTo: ''
    })
  }

  const updateStatus = (id: string, newStatus: 'Pending' | 'In Repair' | 'Completed' | 'Rejected') => {
    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return

    const db = JSON.parse(stored)
    const order = db.repairingOrders?.find((o: RepairingOrder) => o.id === id)
    if (!order) return

    order.status = newStatus
    
    if (newStatus === 'In Repair' && !order.repairStartDate) {
      order.repairStartDate = new Date().toISOString()
    }
    
    if (newStatus === 'Completed' && !order.repairCompletedDate) {
      order.repairCompletedDate = new Date().toISOString()
    }

    localStorage.setItem('dyeflow_db', JSON.stringify(db))
    loadRepairingOrders()
  }

  const deleteRepairingOrder = (id: string) => {
    if (!confirm('Are you sure you want to delete this repairing order?')) return

    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return

    const db = JSON.parse(stored)
    db.repairingOrders = (db.repairingOrders || []).filter((o: RepairingOrder) => o.id !== id)
    localStorage.setItem('dyeflow_db', JSON.stringify(db))
    loadRepairingOrders()
    alert('✓ Repairing order deleted successfully!')
  }

  const sendToFMS = (repairOrder: RepairingOrder) => {
    if (!repairOrder.supervisorConfirmed || !repairOrder.processRoute) {
      alert('Please confirm route and machines in Supervisor page first')
      return
    }

    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return
    const db = JSON.parse(stored)

    let targetOrder = db.orders?.find((o: any) => o.orderNumber === repairOrder.orderNo)
    if (!targetOrder) {
      alert('Original order not found')
      return
    }

    const processRouteArray = repairOrder.processRoute.split('/')
    const firstProcess = processRouteArray[0]

    let targetBatch = (targetOrder.splits || []).find((b: any) => b.batchId === repairOrder.batchId)
    
    if (!targetBatch) {
      targetBatch = {
        batchId: repairOrder.batchId,
        kg: repairOrder.qtyKg,
        mtr: repairOrder.qtyMtr || '',
        taka: repairOrder.noOfTaka || '',
        status: 'active',
        createdAt: new Date().toISOString()
      }
      if (!targetOrder.splits) targetOrder.splits = []
      targetOrder.splits.push(targetBatch)
    }

    targetBatch.fmsDispatch = targetBatch.fmsDispatch || {}
    targetBatch.fmsActiveProcesses = targetBatch.fmsActiveProcesses || {}
    targetBatch.fmsActualDates = targetBatch.fmsActualDates || {}
    targetBatch.fmsEnterAt = targetBatch.fmsEnterAt || {}

    targetBatch.fmsActiveProcesses[firstProcess] = true
    targetBatch.fmsCurrentProcess = firstProcess
    targetBatch.fmsDone = false
    targetBatch.isRepairingBatch = true  // Mark as repairing batch

    const nowIso = new Date().toISOString()
    targetBatch.fmsDispatch[firstProcess] = {
      sent: true,
      sentAt: nowIso,
      source: 'repairing-order'
    }
    targetBatch.fmsEnterAt[firstProcess] = nowIso

    targetOrder.processRoute = processRouteArray
    targetOrder.routeTemplateName = repairOrder.routeTemplateName
    targetOrder.processMachines = repairOrder.processMachines

    // CRITICAL: Clear old machine assignments for repairing batches
    // This ensures the batch only appears on machines specified in processMachines
    if (targetBatch) {
      delete targetBatch.machine  // Remove old machine assignment
    }
    delete targetOrder.machine  // Remove old order machine assignment

    const repairOrderInDb = (db.repairingOrders || []).find((r: any) => r.id === repairOrder.id)
    if (repairOrderInDb) {
      repairOrderInDb.sentToFMS = true
      repairOrderInDb.sentToFMSAt = nowIso
    }

    localStorage.setItem('dyeflow_db', JSON.stringify(db))
    loadRepairingOrders()
    
    alert(`✅ Batch sent to ${firstProcess}-FMS!\n\nBatch ${repairOrder.batchId} is now active in ${firstProcess} process.`)
  }

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-'
    const d = new Date(dateStr)
    const day = String(d.getDate()).padStart(2, '0')
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const year = d.getFullYear()
    const hours = String(d.getHours()).padStart(2, '0')
    const minutes = String(d.getMinutes()).padStart(2, '0')
    return `${day}-${month}-${year} ${hours}:${minutes}`
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'Low': return { bg: '#DBEAFE', text: '#1E40AF' }
      case 'Medium': return { bg: '#FEF3C7', text: '#92400E' }
      case 'High': return { bg: '#FED7AA', text: '#9A3412' }
      case 'Critical': return { bg: '#FEE2E2', text: '#991B1B' }
      default: return { bg: '#F3F4F6', text: '#374151' }
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Pending': return { bg: '#FEF3C7', text: '#92400E' }
      case 'In Repair': return { bg: '#DBEAFE', text: '#1E40AF' }
      case 'Completed': return { bg: '#D1FAE5', text: '#065F46' }
      case 'Rejected': return { bg: '#FEE2E2', text: '#991B1B' }
      default: return { bg: '#F3F4F6', text: '#374151' }
    }
  }

  const filteredOrders = repairingOrders.filter(order => {
    const statusMatch = filterStatus === 'All' || order.status === filterStatus
    const priorityMatch = filterPriority === 'All' || order.priority === filterPriority
    return statusMatch && priorityMatch
  })

  const statusCounts = {
    All: repairingOrders.length,
    Pending: repairingOrders.filter(o => o.status === 'Pending').length,
    'In Repair': repairingOrders.filter(o => o.status === 'In Repair').length,
    Completed: repairingOrders.filter(o => o.status === 'Completed').length,
    Rejected: repairingOrders.filter(o => o.status === 'Rejected').length
  }

  return (
    <div className="content">
      <div className="card">
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <span className="card-title">Repairing Orders Management</span>
            <div style={{ fontSize: '12px', color: '#6B7280', marginTop: '4px' }}>
              Track and manage orders requiring repairs or rework
            </div>
          </div>
          <button 
            className="primary" 
            onClick={() => setIsModalOpen(true)}
            style={{
              padding: '8px 16px',
              fontSize: '13px',
              fontWeight: 600
            }}
          >
            + Add Repairing Order
          </button>
        </div>

        {/* Filters */}
        <div style={{ padding: '16px', background: '#F9FAFB', borderBottom: '1px solid #E5E7EB', display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Status Tabs */}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {Object.entries(statusCounts).map(([status, count]) => (
              <button
                key={status}
                onClick={() => setFilterStatus(status)}
                style={{
                  padding: '6px 12px',
                  fontSize: '12px',
                  fontWeight: 600,
                  border: '1px solid',
                  borderColor: filterStatus === status ? '#3B82F6' : '#D1D5DB',
                  borderRadius: '6px',
                  background: filterStatus === status ? '#EFF6FF' : 'white',
                  color: filterStatus === status ? '#1E40AF' : '#374151',
                  cursor: 'pointer'
                }}
              >
                {status} ({count})
              </button>
            ))}
          </div>

          {/* Priority Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600, color: '#374151' }}>Priority:</label>
            <select
              value={filterPriority}
              onChange={(e) => setFilterPriority(e.target.value)}
              style={{
                padding: '6px 12px',
                fontSize: '12px',
                border: '1px solid #D1D5DB',
                borderRadius: '6px',
                background: 'white',
                cursor: 'pointer'
              }}
            >
              <option value="All">All</option>
              <option value="Low">Low</option>
              <option value="Medium">Medium</option>
              <option value="High">High</option>
              <option value="Critical">Critical</option>
            </select>
          </div>
        </div>

        {/* Orders Table */}
        {filteredOrders.length === 0 ? (
          <div className="empty-state" style={{ padding: '60px 20px' }}>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>🔧</div>
            <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '8px', color: '#111827' }}>
              No Repairing Orders
            </div>
            <div style={{ fontSize: '14px', color: '#6B7280' }}>
              {filterStatus !== 'All' || filterPriority !== 'All' 
                ? 'No orders match the selected filters'
                : 'Create a repairing order to track repairs and rework'}
            </div>
          </div>
        ) : (
          <div style={{ overflow: 'auto', maxHeight: 'calc(100vh - 320px)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: '#F9FAFB' }}>
                <tr>
                  <th style={thStyle}>REPAIR ID</th>
                  <th style={thStyle}>TIME STAMP</th>
                  <th style={thStyle}>ORDER #</th>
                  <th style={thStyle}>BATCH #</th>
                  <th style={thStyle}>PARTY</th>
                  <th style={thStyle}>SUB PARTY</th>
                  <th style={thStyle}>SALES PERSON</th>
                  <th style={thStyle}>ARTICLE</th>
                  <th style={thStyle}>BLEND</th>
                  <th style={thStyle}>COLOR</th>
                  <th style={thStyle}>QTY (KG)</th>
                  <th style={thStyle}>QTY (MTR.)</th>
                  <th style={thStyle}>NO. OF TA</th>
                  <th style={thStyle}>PROCESS ROUTE</th>
                  <th style={thStyle}>ORDER REMARKS</th>
                  <th style={thStyle}>ROUTE/MACHINE</th>
                  <th style={thStyle}>ISSUE TYPE</th>
                  <th style={thStyle}>ISSUE DESCRIPTION</th>
                  <th style={thStyle}>PRIORITY</th>
                  <th style={thStyle}>STATUS</th>
                  <th style={thStyle}>ASSIGNED TO</th>
                  <th style={thStyle}>SUPERVISOR</th>
                  <th style={thStyle}>REPORTED DATE</th>
                  <th style={thStyle}>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map((order, idx) => (
                  <tr
                    key={order.id}
                    style={{
                      background: idx % 2 === 0 ? '#FFFFFF' : '#F9FAFB',
                      borderBottom: '1px solid #F3F4F6'
                    }}
                  >
                    <td style={{ ...tdStyle, fontWeight: 700, color: '#EF4444' }}>{order.id}</td>
                    <td style={{ ...tdStyle, fontSize: '11px', color: '#6B7280' }}>
                      {formatDate(order.reportedDate)}
                    </td>
                    <td style={{ ...tdStyle, fontWeight: 600 }}>{order.orderNo}</td>
                    <td style={{ ...tdStyle, fontWeight: 600, color: '#3B82F6' }}>{order.batchId}</td>
                    <td style={tdStyle}>{order.party}</td>
                    <td style={tdStyle}>{order.subParty || '-'}</td>
                    <td style={tdStyle}>{order.salesPerson || '-'}</td>
                    <td style={tdStyle}>{order.article || '-'}</td>
                    <td style={{ ...tdStyle, fontSize: '11px', color: '#6B7280' }}>{order.blend || '-'}</td>
                    <td style={tdStyle}>{order.color || '-'}</td>
                    <td style={{ ...tdStyle, fontWeight: 700 }}>{order.qtyKg}</td>
                    <td style={tdStyle}>{order.qtyMtr || '-'}</td>
                    <td style={tdStyle}>{order.noOfTaka || '-'}</td>
                    <td style={{ ...tdStyle, fontWeight: 600, color: '#3B82F6' }}>{order.processRoute || '-'}</td>
                    <td style={{ ...tdStyle, maxWidth: '200px', whiteSpace: 'normal', wordWrap: 'break-word' }}>{order.orderRemarks || '-'}</td>
                    <td style={tdStyle}>
                      {order.supervisorConfirmed ? (
                        <div style={{ fontSize: '11px' }}>
                          <div style={{ 
                            padding: '4px 8px', 
                            background: '#D1FAE5', 
                            color: '#065F46',
                            borderRadius: '4px',
                            fontWeight: 600,
                            marginBottom: '4px',
                            display: 'inline-block'
                          }}>
                            ✓ {order.routeTemplateName}
                          </div>
                          <div style={{ color: '#6B7280', marginTop: '2px' }}>
                            {order.processRoute}
                          </div>
                          {order.processMachines && Object.keys(order.processMachines).length > 0 && (
                            <div style={{ color: '#6B7280', fontSize: '10px', marginTop: '2px' }}>
                              {Object.entries(order.processMachines).map(([proc, machines]: [string, any]) => 
                                `${proc}: ${machines[0]}`
                              ).join(', ')}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span style={{ fontSize: '11px', color: '#9CA3AF' }}>Not confirmed</span>
                      )}
                    </td>
                    <td style={{ ...tdStyle, fontWeight: 600, color: '#7C3AED' }}>{order.issueType}</td>
                    <td style={{ ...tdStyle, maxWidth: '250px', whiteSpace: 'normal', wordWrap: 'break-word' }}>
                      {order.issueDescription}
                    </td>
                    <td style={tdStyle}>
                      <span style={{
                        padding: '3px 10px',
                        borderRadius: '12px',
                        fontSize: '11px',
                        fontWeight: 600,
                        background: getPriorityColor(order.priority).bg,
                        color: getPriorityColor(order.priority).text
                      }}>
                        {order.priority}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      <select
                        value={order.status}
                        onChange={(e) => updateStatus(order.id, e.target.value as any)}
                        style={{
                          padding: '4px 8px',
                          fontSize: '11px',
                          fontWeight: 600,
                          border: 'none',
                          borderRadius: '12px',
                          background: getStatusColor(order.status).bg,
                          color: getStatusColor(order.status).text,
                          cursor: 'pointer'
                        }}
                      >
                        <option value="Pending">Pending</option>
                        <option value="In Repair">In Repair</option>
                        <option value="Completed">Completed</option>
                        <option value="Rejected">Rejected</option>
                      </select>
                    </td>
                    <td style={tdStyle}>{order.assignedTo || '-'}</td>
                    <td style={tdStyle}>{order.supervisor || '-'}</td>
                    <td style={{ ...tdStyle, fontSize: '11px', color: '#6B7280' }}>
                      {formatDate(order.reportedDate)}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      {!order.sentToFMS && order.supervisorConfirmed && (
                        <button
                          onClick={() => sendToFMS(order)}
                          style={{
                            padding: '6px 12px',
                            fontSize: '11px',
                            fontWeight: 600,
                            border: 'none',
                            borderRadius: '4px',
                            background: '#10B981',
                            color: 'white',
                            cursor: 'pointer',
                            marginRight: '6px'
                          }}
                        >
                          → Send to Process
                        </button>
                      )}
                      
                      {order.sentToFMS && (
                        <span style={{
                          padding: '6px 12px',
                          fontSize: '11px',
                          fontWeight: 600,
                          borderRadius: '4px',
                          background: '#D1FAE5',
                          color: '#065F46',
                          marginRight: '6px',
                          display: 'inline-block'
                        }}>
                          ✓ Sent to FMS
                        </span>
                      )}
                      
                      <button
                        onClick={() => deleteRepairingOrder(order.id)}
                        style={{
                          padding: '4px 10px',
                          fontSize: '11px',
                          fontWeight: 600,
                          border: 'none',
                          borderRadius: '4px',
                          background: '#DC2626',
                          color: 'white',
                          cursor: 'pointer'
                        }}
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

      {/* Add Repairing Order Modal */}
      {isModalOpen && (
        <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px' }}>
            <div className="modal-header">
              <span className="modal-title">Add Repairing Order</span>
              <button className="small" onClick={() => setIsModalOpen(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Order Number *</label>
                <input
                  type="text"
                  value={formData.orderNo}
                  onChange={(e) => setFormData({ ...formData, orderNo: e.target.value })}
                  placeholder="e.g., ON-2026-001"
                />
              </div>

              <div className="form-group">
                <label>Batch ID *</label>
                <input
                  type="text"
                  value={formData.batchId}
                  onChange={(e) => setFormData({ ...formData, batchId: e.target.value })}
                  placeholder="e.g., B001-A"
                />
              </div>

              <div className="form-group">
                <label>Order Remarks (Optional)</label>
                <input
                  type="text"
                  value={formData.party}
                  onChange={(e) => setFormData({ ...formData, party: e.target.value })}
                  placeholder="Party name (auto-filled if order found)"
                />
              </div>

              <div className="form-group">
                <label>Issue Type *</label>
                <select
                  value={formData.issueType}
                  onChange={(e) => setFormData({ ...formData, issueType: e.target.value })}
                >
                  <option value="">Select Issue Type</option>
                  <option value="Shade Variation">Shade Variation</option>
                  <option value="Crease Mark">Crease Mark</option>
                  <option value="Oil Stain">Oil Stain</option>
                  <option value="Hole/Tear">Hole/Tear</option>
                  <option value="Uneven Dyeing">Uneven Dyeing</option>
                  <option value="Wrong Processing">Wrong Processing</option>
                  <option value="Quality Issue">Quality Issue</option>
                  <option value="Machine Error">Machine Error</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div className="form-group">
                <label>Issue Description *</label>
                <textarea
                  value={formData.issueDescription}
                  onChange={(e) => setFormData({ ...formData, issueDescription: e.target.value })}
                  rows={3}
                  placeholder="Describe the issue in detail..."
                />
              </div>

              <div className="form-group">
                <label>Priority *</label>
                <select
                  value={formData.priority}
                  onChange={(e) => setFormData({ ...formData, priority: e.target.value as any })}
                >
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                  <option value="Critical">Critical</option>
                </select>
              </div>

              <div className="form-group">
                <label>Assign To (Optional)</label>
                <input
                  type="text"
                  value={formData.assignedTo}
                  onChange={(e) => setFormData({ ...formData, assignedTo: e.target.value })}
                  placeholder="Person responsible for repair"
                />
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setIsModalOpen(false)}>Cancel</button>
              <button className="primary" onClick={saveRepairingOrder}>Create Repairing Order</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const thStyle: React.CSSProperties = {
  padding: '10px 8px',
  textAlign: 'left',
  fontSize: '11px',
  fontWeight: 700,
  color: '#374151',
  borderBottom: '2px solid #E5E7EB',
  whiteSpace: 'nowrap',
  textTransform: 'uppercase',
  letterSpacing: '0.5px'
}

const tdStyle: React.CSSProperties = {
  padding: '12px 8px',
  fontSize: '12px',
  color: '#2D3748',
  whiteSpace: 'nowrap'
}
