'use client'

import { useEffect, useState } from 'react'

// Helper functions
const getProcObj = (code: string) => {
  const stored = localStorage.getItem('dyeflow_db')
  if (!stored) return null
  const db = JSON.parse(stored)
  const processes = db.processes || []
  const found = processes.find((p: any) => p.code === code)
  
  if (found) return found
  
  const codeToName: { [key: string]: string } = {
    'S': 'Scouring', 'D': 'Dyeing', 'F': 'Finishing', 'C': 'Compacting',
    'H': 'Heat Setting', 'W': 'Washing', 'P': 'Printing', 'R': 'Raising',
    'SH': 'Shearing', 'ST': 'Stentering', 'B': 'Bleaching', 'M': 'Mercerizing',
    'Add': 'Addition', 'Level': 'Leveling', 'S2': 'Second Scouring',
    'Rc': 'Reactive', 'Fixing': 'Fixing'
  }
  
  return { code, name: codeToName[code] || code, machine: null }
}

const getMachineShortName = (name: string) => {
  return (name || '').replace(/^Machine\s*/i, 'M ').trim()
}

const getMachineName = (machineId: string) => {
  const stored = localStorage.getItem('dyeflow_db')
  if (!stored) return machineId
  const db = JSON.parse(stored)
  const machine = (db.machines || []).find((m: any) => m.id === machineId)
  return machine ? getMachineShortName(machine.name) : machineId
}

const getPrimaryMachine = (order: any) => {
  if (order.machine) return order.machine
  if (order.processMachines) {
    const machines = Object.values(order.processMachines)
    if (machines.length > 0 && Array.isArray(machines[0])) {
      return machines[0][0] || ''
    }
  }
  return ''
}

const formatDateTime = (date: Date | string) => {
  if (!date) return 'N/A'
  const d = new Date(date)
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const year = d.getFullYear()
  const hours = String(d.getHours()).padStart(2, '0')
  const minutes = String(d.getMinutes()).padStart(2, '0')
  return `${day}/${month}/${year} ${hours}:${minutes}`
}

// Column definitions
const COLUMNS = [
  { id: 'batchCreated', label: 'BATCH CREATED', defaultWidth: 150, visible: true },
  { id: 'orderNo', label: 'ORDER #', defaultWidth: 120, visible: true },
  { id: 'party', label: 'PARTY', defaultWidth: 150, visible: true },
  { id: 'subParty', label: 'SUB PARTY', defaultWidth: 150, visible: true },
  { id: 'salesPerson', label: 'SALES PERSON', defaultWidth: 120, visible: true },
  { id: 'article', label: 'ARTICLE', defaultWidth: 180, visible: true },
  { id: 'blend', label: 'BLEND', defaultWidth: 100, visible: false },
  { id: 'width', label: 'WIDTH', defaultWidth: 80, visible: false },
  { id: 'gsm', label: 'GSM', defaultWidth: 80, visible: true },
  { id: 'color', label: 'COLOR', defaultWidth: 150, visible: true },
  { id: 'labNo', label: 'LAB NO.', defaultWidth: 120, visible: true },
  { id: 'lotNo', label: 'LOT NO.', defaultWidth: 120, visible: true },
  { id: 'challanNo', label: 'CHALLAN NO.', defaultWidth: 120, visible: true },
  { id: 'orderQty', label: 'ORDER QTY (KG)', defaultWidth: 120, visible: false },
  { id: 'qtyMtr', label: 'QTY (MTR)', defaultWidth: 100, visible: false },
  { id: 'taka', label: 'TAKA', defaultWidth: 80, visible: false },
  { id: 'finish', label: 'FINISH', defaultWidth: 150, visible: false },
  { id: 'packing', label: 'PACKING', defaultWidth: 100, visible: false },
  { id: 'remarks', label: 'REMARKS', defaultWidth: 200, visible: false },
  { id: 'holdApproval', label: 'HOLD/APPROVAL', defaultWidth: 130, visible: false },
  { id: 'holdRemark', label: 'HOLD REMARK', defaultWidth: 150, visible: false },
  { id: 'supervisor', label: 'SUPERVISOR', defaultWidth: 120, visible: true },
  { id: 'routeTemplate', label: 'ROUTE TEMPLATE', defaultWidth: 150, visible: false },
  { id: 'processRoute', label: 'PROCESS ROUTE', defaultWidth: 200, visible: true },
  { id: 'machine', label: 'MACHINE', defaultWidth: 150, visible: true },
  { id: 'orderStatus', label: 'ORDER STATUS', defaultWidth: 130, visible: false },
  { id: 'batchId', label: 'BATCH ID', defaultWidth: 140, visible: true },
  { id: 'batchQty', label: 'BATCH QTY (KG)', defaultWidth: 120, visible: true },
  { id: 'batchStatus', label: 'BATCH STATUS', defaultWidth: 130, visible: true },
  { id: 'currentProcess', label: 'CURRENT PROCESS', defaultWidth: 150, visible: true },
  { id: 'actions', label: 'ACTIONS', defaultWidth: 160, visible: true }
]

export default function SplittedOrdersPage() {
  const [orders, setOrders] = useState<any[]>([])
  const [rows, setRows] = useState<any[]>([])
  const [columns, setColumns] = useState(COLUMNS)
  const [showColumnMenu, setShowColumnMenu] = useState(false)
  const [resizing, setResizing] = useState<{ colId: string; startX: number; startWidth: number } | null>(null)

  useEffect(() => {
    loadData()
    
    // Load saved column preferences
    const saved = localStorage.getItem('splittedOrders_columnPrefs')
    if (saved) {
      try {
        const prefs = JSON.parse(saved)
        setColumns(cols => cols.map(col => ({
          ...col,
          visible: prefs[col.id]?.visible ?? col.visible,
          defaultWidth: prefs[col.id]?.width ?? col.defaultWidth
        })))
      } catch (e) {}
    }
  }, [])

  useEffect(() => {
    if (resizing) {
      const handleMouseMove = (e: MouseEvent) => {
        const delta = e.clientX - resizing.startX
        const newWidth = Math.max(50, resizing.startWidth + delta)
        setColumns(cols => cols.map(col => 
          col.id === resizing.colId ? { ...col, defaultWidth: newWidth } : col
        ))
      }
      
      const handleMouseUp = () => {
        setResizing(null)
        saveColumnPreferences()
      }
      
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      
      return () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }
    }
  }, [resizing])

  const saveColumnPreferences = () => {
    const prefs: any = {}
    columns.forEach(col => {
      prefs[col.id] = { visible: col.visible, width: col.defaultWidth }
    })
    localStorage.setItem('splittedOrders_columnPrefs', JSON.stringify(prefs))
  }

  const toggleColumn = (colId: string) => {
    setColumns(cols => cols.map(col => 
      col.id === colId ? { ...col, visible: !col.visible } : col
    ))
    setTimeout(saveColumnPreferences, 100)
  }

  const loadData = () => {
    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return

    const db = JSON.parse(stored)
    const splitted = (db.orders || []).filter((o: any) => o.splits && o.splits.length > 0)
    setOrders(splitted)

    const rowData = splitted.flatMap((o: any) => 
      (o.splits || []).map((b: any) => {
        const totalSplitKg = o.splits.reduce((s: number, x: any) => s + (parseFloat(x.kg) || 0), 0)
        const batchTimestamp = b.createdAt || b.timestamp || o.supervisorConfirmedAt || o.timestamp || 'N/A'
        return { order: o, batch: b, totalSplitKg, batchTimestamp }
      })
    )
    setRows(rowData)
  }

  const getStatusBadge = (status: string) => {
    const badges: any = {
      new: { bg: '#DBEAFE', color: '#1E40AF', label: 'New' },
      assigned: { bg: '#FEF3C7', color: '#92400E', label: 'Assigned' },
      splitting: { bg: '#E9D5FF', color: '#6B21A8', label: 'Split & Planned' },
      'in-process': { bg: '#DBEAFE', color: '#1E40AF', label: 'In Process' },
      done: { bg: '#D1FAE5', color: '#065F46', label: 'Done' },
      hold: { bg: '#FEE2E2', color: '#991B1B', label: 'On Hold' }
    }
    
    const badge = badges[status] || { bg: '#F3F4F6', color: '#6B7280', label: status }
    
    return (
      <span style={{
        padding: '4px 10px',
        borderRadius: '4px',
        fontSize: '11px',
        fontWeight: 600,
        background: badge.bg,
        color: badge.color,
        whiteSpace: 'nowrap'
      }}>
        {badge.label}
      </span>
    )
  }

  const renderCell = (colId: string, row: any) => {
    const { order, batch } = row
    
    switch(colId) {
      case 'batchCreated':
        return <div style={{ fontSize: '11px', color: '#10B981', fontWeight: 600 }}>{formatDateTime(row.batchTimestamp)}</div>
      case 'orderNo':
        return <div style={{ fontWeight: 700, color: '#2563EB' }}>{order.orderNumber}</div>
      case 'party':
        return order.party || '-'
      case 'subParty':
        return order.subParty || order.subparty || '-'
      case 'salesPerson':
        return order.salesPerson || order.salesperson || '-'
      case 'article':
        return <div style={{ fontWeight: 500 }}>{order.article || '-'}</div>
      case 'blend':
        return <div style={{ fontSize: '11px', color: '#6B7280' }}>{order.blend || '-'}</div>
      case 'width':
        return order.width || '-'
      case 'gsm':
        return order.gsm || '-'
      case 'color':
        return order.color || '-'
      case 'labNo':
        return <div style={{ fontSize: '11px' }}>{order.labNo || order.labno || '-'}</div>
      case 'lotNo':
        return <div style={{ fontSize: '11px' }}>{order.lotNo || order.lotno || '-'}</div>
      case 'challanNo':
        return <div style={{ fontSize: '11px' }}>{order.challanNo || order.challannumber || '-'}</div>
      case 'orderQty':
        return <div style={{ fontWeight: 600 }}>{order.qtyKg || order.qtykg || '-'}</div>
      case 'qtyMtr':
        return order.qtyMtr || order.qtymtr || '-'
      case 'taka':
        return order.noOfTaka || order.nooftaka || '-'
      case 'finish':
        return order.typeOfFinish || order.typeoffinish || '-'
      case 'packing':
        return order.typeOfPacking || order.typeofpacking || '-'
      case 'remarks':
        return <div style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis' }} title={order.remarks || ''}>{order.remarks || '-'}</div>
      case 'holdApproval':
        return order.holdApproval === 'Hold' ? (
          <span style={{ padding: '4px 10px', borderRadius: '4px', fontSize: '11px', fontWeight: 600, background: '#FEE2E2', color: '#991B1B' }}>Hold</span>
        ) : order.holdApproval === '1st Batch Approval' ? (
          <span style={{ padding: '4px 10px', borderRadius: '4px', fontSize: '11px', fontWeight: 600, background: '#FEF3C7', color: '#92400E' }}>1st Batch Approval</span>
        ) : '-'
      case 'holdRemark':
        return <div style={{ maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis' }} title={order.holdReason || ''}>{order.holdReason || '-'}</div>
      case 'supervisor':
        return order.supervisor || '-'
      case 'routeTemplate':
        return order.routeTemplateName ? (
          <span style={{ background: '#DBEAFE', color: '#1E40AF', padding: '2px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: 600, display: 'inline-block' }}>{order.routeTemplateName}</span>
        ) : null
      case 'processRoute':
        return order.supervisorConfirmed && order.processRoute && order.processRoute.length > 0 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px', alignItems: 'center' }}>
            {order.processRoute.map((code: string, idx: number) => {
              const proc = getProcObj(code) || { code, name: code }
              return (
                <span key={idx} style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                  <span title={proc.name} style={{ background: '#DBEAFE', color: '#1E40AF', padding: '2px 6px', borderRadius: '4px', fontSize: '11px', fontWeight: 600 }}>{proc.name}</span>
                  {idx < order.processRoute.length - 1 && <span style={{ color: '#9CA3AF', fontSize: '11px', fontWeight: 600 }}>→</span>}
                </span>
              )
            })}
          </div>
        ) : null
      case 'machine':
        return order.supervisorConfirmed && getPrimaryMachine(order) ? (
          <span style={{ background: '#E9D5FF', color: '#6B21A8', padding: '3px 9px', borderRadius: '4px', fontSize: '11px', fontWeight: 600 }}>{getMachineName(getPrimaryMachine(order))}</span>
        ) : null
      case 'orderStatus':
        return getStatusBadge(order.status || 'new')
      case 'batchId':
        return <div style={{ fontWeight: 700, color: '#2563EB' }}>{batch.batchId || '-'}</div>
      case 'batchQty':
        return <div style={{ fontWeight: 700 }}>{batch.kg || '-'}</div>
      case 'batchStatus':
        return getStatusBadge(batch.status || 'new')
      case 'currentProcess':
        return batch.currentProcess ? (
          <span style={{ background: '#DBEAFE', color: '#1E40AF', padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600 }}>{batch.currentProcess}</span>
        ) : '-'
      case 'actions':
        return (
          <div style={{ whiteSpace: 'nowrap' }}>
            <button onClick={() => alert('View batch')} style={{ padding: '5px 10px', fontSize: '11px', border: '1px solid #D1D5DB', borderRadius: '4px', background: 'white', cursor: 'pointer', marginRight: '4px' }}>View</button>
            {batch.status !== 'done' && (
              <button onClick={() => alert('Mark done')} style={{ padding: '5px 10px', fontSize: '11px', border: 'none', borderRadius: '4px', background: '#10B981', color: 'white', cursor: 'pointer', fontWeight: 600 }}>Mark Done</button>
            )}
          </div>
        )
      default:
        return '-'
    }
  }

  if (orders.length === 0) {
    return (
      <div className="content">
        <div className="card">
          <div className="empty-state" style={{ padding: '60px' }}>
            <div style={{ fontSize: '36px', marginBottom: '10px' }}>✂</div>
            <div style={{ fontSize: '15px', fontWeight: 600, marginBottom: '6px' }}>No Splitted Orders Yet</div>
            <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '20px' }}>Once orders are split into batches they will appear here.</div>
            <button className="primary" onClick={() => window.location.href = '/orders'}>Go to Orders →</button>
          </div>
        </div>
      </div>
    )
  }

  const visibleColumns = columns.filter(col => col.visible)

  return (
    <div className="content">
      <div className="card" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 100px)' }}>
        {/* FROZEN HEADER - Card header stays at top */}
        <div className="card-header" style={{ 
          position: 'sticky', 
          top: 0, 
          zIndex: 200, 
          background: 'white',
          borderBottom: '1px solid #E5E7EB'
        }}>
          <span className="card-title">Splitted Orders</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
              {orders.length} orders • {rows.length} batches
            </span>
            <button
              onClick={() => setShowColumnMenu(!showColumnMenu)}
              style={{
                padding: '6px 12px',
                fontSize: '12px',
                border: '1px solid #D1D5DB',
                borderRadius: '6px',
                background: 'white',
                cursor: 'pointer',
                fontWeight: 600,
                color: '#374151'
              }}
            >
              ⚙️ Columns ({visibleColumns.length}/{columns.length})
            </button>
          </div>
        </div>

        {showColumnMenu && (
          <div style={{
            position: 'absolute',
            right: '20px',
            top: '100px',
            background: 'white',
            border: '1px solid #E5E7EB',
            borderRadius: '8px',
            boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
            padding: '12px',
            zIndex: 1000,
            maxHeight: '400px',
            overflowY: 'auto',
            minWidth: '250px'
          }}>
            <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '10px', color: '#111827' }}>
              Show/Hide Columns
            </div>
            {columns.map(col => (
              <label key={col.id} style={{ display: 'flex', alignItems: 'center', padding: '6px', cursor: 'pointer', fontSize: '12px' }}>
                <input
                  type="checkbox"
                  checked={col.visible}
                  onChange={() => toggleColumn(col.id)}
                  style={{ marginRight: '8px', cursor: 'pointer' }}
                />
                {col.label}
              </label>
            ))}
          </div>
        )}

        {/* TABLE WITH FROZEN COLUMN HEADERS */}
        <div style={{
          flex: 1,
          overflowX: 'auto',
          overflowY: 'auto',
          position: 'relative',
          scrollbarWidth: 'auto',
          WebkitOverflowScrolling: 'touch',
          border: '1px solid #E5E7EB',
          borderTop: 'none',
          borderRadius: '0 0 8px 8px'
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <thead>
              <tr style={{ background: '#F9FAFB' }}>
                {visibleColumns.map(col => (
                  <th
                    key={col.id}
                    style={{
                      ...thStyle,
                      width: col.defaultWidth,
                      minWidth: col.defaultWidth,
                      position: 'relative'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span>{col.label}</span>
                      {/* Resize handle */}
                      <div
                        onMouseDown={(e) => {
                          e.preventDefault()
                          setResizing({
                            colId: col.id,
                            startX: e.clientX,
                            startWidth: col.defaultWidth
                          })
                        }}
                        style={{
                          position: 'absolute',
                          right: 0,
                          top: 0,
                          bottom: 0,
                          width: '4px',
                          cursor: 'col-resize',
                          background: resizing?.colId === col.id ? '#3B82F6' : 'transparent',
                          borderRight: '1px solid #E5E7EB'
                        }}
                        onMouseEnter={(e) => {
                          if (!resizing) e.currentTarget.style.background = '#E5E7EB'
                        }}
                        onMouseLeave={(e) => {
                          if (!resizing) e.currentTarget.style.background = 'transparent'
                        }}
                      />
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr
                  key={idx}
                  style={{
                    background: row.batch.status === 'done' ? '#D1FAE5' : (idx % 2 === 0 ? 'white' : '#FAFAFA'),
                    borderBottom: '1px solid #F3F4F6'
                  }}
                >
                  {visibleColumns.map(col => (
                    <td
                      key={col.id}
                      style={{
                        ...tdStyle,
                        width: col.defaultWidth,
                        minWidth: col.defaultWidth,
                        maxWidth: col.defaultWidth
                      }}
                    >
                      {renderCell(col.id, row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

const thStyle: React.CSSProperties = {
  padding: '10px 14px',
  textAlign: 'left',
  fontSize: '10px',
  fontWeight: 700,
  color: '#6B7280',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  borderBottom: '2px solid #E5E7EB',
  borderRight: '1px solid #E5E7EB',
  whiteSpace: 'nowrap',
  position: 'sticky',
  top: 0,
  background: '#F9FAFB',
  zIndex: 150,
  userSelect: 'none',
  boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
}

const tdStyle: React.CSSProperties = {
  padding: '12px 14px',
  fontSize: '12px',
  color: '#1F2937',
  borderRight: '1px solid #F3F4F6',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis'
}
