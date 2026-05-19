'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

interface LabRecheckOrder {
  id: string
  timestamp: string
  orderNumber: string
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
  qtyKg: string
  qtyMtr: string
  noOfTaka: string
  typeOfFinish: string
  typeOfPacking: string
  remarks: string
  supervisor: string
  labRecheckAt: string
  plannedDate: string
  inHouseLabRecheckDone?: boolean
  inHouseLabRecheckDoneAt?: string
}

interface ColumnConfig {
  key: string
  label: string
  visible: boolean
  width: number
  minWidth: number
}

const DEFAULT_COLUMNS: ColumnConfig[] = [
  { key: 'timestamp', label: 'Timestamp', visible: true, width: 140, minWidth: 100 },
  { key: 'party', label: 'Party', visible: true, width: 120, minWidth: 80 },
  { key: 'subParty', label: 'Sub Party', visible: true, width: 120, minWidth: 80 },
  { key: 'salesPerson', label: 'Sales Person', visible: true, width: 120, minWidth: 80 },
  { key: 'article', label: 'Article', visible: true, width: 140, minWidth: 100 },
  { key: 'blend', label: 'Blend', visible: true, width: 100, minWidth: 70 },
  { key: 'width', label: 'Width', visible: true, width: 80, minWidth: 60 },
  { key: 'gsm', label: 'GSM', visible: true, width: 80, minWidth: 60 },
  { key: 'color', label: 'Color', visible: true, width: 120, minWidth: 80 },
  { key: 'labNo', label: 'Lab No.', visible: true, width: 100, minWidth: 80 },
  { key: 'lotNo', label: 'LOT No.', visible: true, width: 100, minWidth: 80 },
  { key: 'challanNo', label: 'Challan No.', visible: true, width: 110, minWidth: 90 },
  { key: 'qtyKg', label: 'Qty (Kg)', visible: true, width: 90, minWidth: 70 },
  { key: 'qtyMtr', label: 'Qty (Mtr.)', visible: true, width: 90, minWidth: 70 },
  { key: 'noOfTaka', label: 'No. of Taka', visible: true, width: 90, minWidth: 70 },
  { key: 'typeOfFinish', label: 'Finish', visible: true, width: 120, minWidth: 80 },
  { key: 'typeOfPacking', label: 'Packing', visible: true, width: 100, minWidth: 80 },
  { key: 'remarks', label: 'Remarks', visible: true, width: 200, minWidth: 120 },
  { key: 'supervisor', label: 'Supervisor', visible: true, width: 120, minWidth: 80 },
  { key: 'orderNumber', label: 'Order Number', visible: true, width: 130, minWidth: 100 },
  { key: 'plannedDate', label: 'Planned Date', visible: true, width: 110, minWidth: 90 },
  { key: 'actualDate', label: 'Actual Date', visible: true, width: 140, minWidth: 100 },
  { key: 'status', label: 'Status', visible: true, width: 80, minWidth: 60 },
  { key: 'timeDelay', label: 'Time Delay', visible: true, width: 120, minWidth: 90 },
]

export default function InHouseLabRecheckPage() {
  const router = useRouter()
  const [orders, setOrders] = useState<LabRecheckOrder[]>([])
  const [columns, setColumns] = useState<ColumnConfig[]>(DEFAULT_COLUMNS)
  const [showColumnModal, setShowColumnModal] = useState(false)
  const [resizing, setResizing] = useState<{ key: string; startX: number; startWidth: number } | null>(null)

  useEffect(() => {
    loadData()
    loadColumnConfig()
  }, [])

  // Handle column resizing
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!resizing) return
      const diff = e.pageX - resizing.startX
      const newWidth = Math.max(50, resizing.startWidth + diff)
      setColumns(prev => prev.map(col =>
        col.key === resizing.key ? { ...col, width: newWidth } : col
      ))
    }

    const handleMouseUp = () => {
      if (resizing) {
        saveColumnConfig()
      }
      setResizing(null)
    }

    if (resizing) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [resizing])

  const loadColumnConfig = () => {
    const saved = localStorage.getItem('inhouse_lab_recheck_columns')
    if (saved) {
      try {
        const savedCols = JSON.parse(saved)
        setColumns(savedCols)
      } catch (e) {
        console.error('Failed to load column config', e)
      }
    }
  }

  const saveColumnConfig = () => {
    localStorage.setItem('inhouse_lab_recheck_columns', JSON.stringify(columns))
  }

  const resetColumns = () => {
    setColumns(DEFAULT_COLUMNS)
    localStorage.removeItem('inhouse_lab_recheck_columns')
  }

  const toggleColumn = (key: string) => {
    setColumns(prev => prev.map(col =>
      col.key === key ? { ...col, visible: !col.visible } : col
    ))
  }

  const loadData = () => {
    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return

    const db = JSON.parse(stored)
    const recheckOrders = (db.orders || [])
      .filter((o: any) => o.labRecheck === true)
      .map((o: any) => {
        const labRecheckAt = o.labRecheckAt || new Date().toISOString()
        const plannedDate = new Date(labRecheckAt)
        plannedDate.setDate(plannedDate.getDate() + 1)
        
        return {
          id: o.id,
          timestamp: o.timestamp,
          orderNumber: o.orderNumber,
          party: o.party,
          subParty: o.subParty,
          salesPerson: o.salesPerson,
          article: o.article,
          blend: o.blend,
          width: o.width,
          gsm: o.gsm,
          color: o.color,
          labNo: o.labNo,
          lotNo: o.lotNo,
          challanNo: o.challanNo,
          qtyKg: o.qtyKg,
          qtyMtr: o.qtyMtr,
          noOfTaka: o.noOfTaka,
          typeOfFinish: o.typeOfFinish,
          typeOfPacking: o.typeOfPacking,
          remarks: o.remarks,
          supervisor: o.supervisor,
          labRecheckAt,
          plannedDate: plannedDate.toISOString(),
          inHouseLabRecheckDone: o.inHouseLabRecheckDone || false,
          inHouseLabRecheckDoneAt: o.inHouseLabRecheckDoneAt || ''
        }
      })
      .sort((a: any, b: any) => 
        new Date(b.labRecheckAt).getTime() - new Date(a.labRecheckAt).getTime()
      )

    setOrders(recheckOrders)
  }

  const toggleInHouseLabRecheckDone = (orderId: string, checked: boolean) => {
    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return

    const db = JSON.parse(stored)
    const order = db.orders.find((o: any) => o.id === orderId)
    if (!order) return

    order.inHouseLabRecheckDone = checked
    order.inHouseLabRecheckDoneAt = checked ? new Date().toISOString() : ''

    localStorage.setItem('dyeflow_db', JSON.stringify(db))
    loadData()
  }

  const formatDateTime = (dateStr: string) => {
    if (!dateStr) return '-'
    const date = new Date(dateStr)
    const day = String(date.getDate()).padStart(2, '0')
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const year = date.getFullYear()
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    return `${day}/${month}/${year} ${hours}:${minutes}`
  }

  const formatDateOnly = (dateStr: string) => {
    if (!dateStr) return '-'
    const date = new Date(dateStr)
    const day = String(date.getDate()).padStart(2, '0')
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const year = date.getFullYear()
    return `${day}/${month}/${year}`
  }

  const getDelayInfo = (order: LabRecheckOrder) => {
    const planned = new Date(order.plannedDate)
    const ref = order.inHouseLabRecheckDoneAt 
      ? new Date(order.inHouseLabRecheckDoneAt) 
      : new Date()
    
    const diff = planned.getTime() - ref.getTime()
    const absDiff = Math.abs(diff)
    const days = Math.floor(absDiff / (24 * 60 * 60 * 1000))
    const hours = Math.floor((absDiff % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000))
    
    if (order.inHouseLabRecheckDoneAt && diff >= 0) {
      return { text: '', color: '#27500A', bg: '#EAF3DE', late: false }
    }
    if (!order.inHouseLabRecheckDoneAt && diff >= 0) {
      const timeText = days > 0 ? `-${days}d ${hours}h` : `-${hours}h`
      return { text: timeText, color: '#633806', bg: '#FAEEDA', late: false }
    }
    const delayText = days > 0 ? `${days}d ${hours}h delay` : `${hours}h delay`
    return { 
      text: delayText, 
      color: '#A32D2D', 
      bg: '#FCEBEB', 
      late: true 
    }
  }

  const startResize = (key: string, e: React.MouseEvent) => {
    e.preventDefault()
    const col = columns.find(c => c.key === key)
    if (!col) return
    setResizing({ key, startX: e.pageX, startWidth: col.width })
  }

  const renderCell = (order: LabRecheckOrder, col: ColumnConfig) => {
    const baseStyle = {
      ...cellStyle,
      width: `${col.width}px`,
      minWidth: `${col.width}px`,
      maxWidth: `${col.width}px`
    }

    const delay = getDelayInfo(order)

    switch (col.key) {
      case 'timestamp':
        return <td key={col.key} style={{ ...baseStyle, fontSize: '11px', whiteSpace: 'nowrap' }}>{formatDateTime(order.labRecheckAt)}</td>
      case 'orderNumber':
        return <td key={col.key} style={{ ...baseStyle, fontWeight: 700, color: '#185FA5' }}>{order.orderNumber || '-'}</td>
      case 'article':
        return <td key={col.key} style={{ ...baseStyle, fontWeight: 600 }}>{order.article || '-'}</td>
      case 'remarks':
        return <td key={col.key} style={{ ...baseStyle, maxWidth: '220px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{order.remarks || '-'}</td>
      case 'plannedDate':
        return <td key={col.key} style={{ ...baseStyle, fontSize: '11px', whiteSpace: 'nowrap' }}>{formatDateOnly(order.plannedDate)}</td>
      case 'actualDate':
        return <td key={col.key} style={{ ...baseStyle, fontSize: '11px', whiteSpace: 'nowrap' }}>{order.inHouseLabRecheckDoneAt ? formatDateTime(order.inHouseLabRecheckDoneAt) : '-'}</td>
      case 'status':
        return (
          <td key={col.key} style={{ ...baseStyle, textAlign: 'center' }}>
            <input
              type="checkbox"
              checked={order.inHouseLabRecheckDone || false}
              onChange={(e) => toggleInHouseLabRecheckDone(order.id, e.target.checked)}
              style={{ width: '16px', height: '16px', cursor: 'pointer' }}
            />
          </td>
        )
      case 'timeDelay':
        return (
          <td key={col.key} style={{ ...baseStyle, whiteSpace: 'nowrap', fontWeight: 700, color: delay.color, background: delay.bg }}>
            {delay.text || '-'}
          </td>
        )
      default:
        return <td key={col.key} style={baseStyle}>{(order as any)[col.key] || '-'}</td>
    }
  }

  const visibleColumns = columns.filter(c => c.visible)
  const done = orders.filter(o => o.inHouseLabRecheckDone).length
  const pending = orders.length - done
  const delayed = orders.filter(o => getDelayInfo(o).late).length
  const supervisors = [...new Set(orders.map(o => o.supervisor || '').filter(Boolean))]

  return (
    <div className="content" style={{ padding: '20px', maxWidth: '100%', overflow: 'hidden' }}>
      {/* Header Card with Gradient */}
      <div style={{
        background: 'linear-gradient(135deg, #667EEA 0%, #764BA2 100%)',
        borderRadius: '12px',
        padding: '20px 24px',
        marginBottom: '16px',
        color: 'white',
        boxShadow: '0 4px 12px rgba(102, 126, 234, 0.15)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: 700, margin: 0, marginBottom: '6px' }}>
              🔬 InHouse Lab Recheck
            </h1>
            <p style={{ fontSize: '13px', opacity: 0.9, margin: 0 }}>
              Orders marked by supervisors for lab recheck verification
            </p>
          </div>
          <button
            onClick={() => router.push('/supervisor')}
            style={{
              padding: '8px 16px',
              fontSize: '13px',
              border: '1px solid rgba(255,255,255,0.3)',
              borderRadius: '8px',
              background: 'rgba(255,255,255,0.2)',
              color: 'white',
              cursor: 'pointer',
              fontWeight: 600,
              backdropFilter: 'blur(10px)'
            }}
          >
            ← Back to Supervisors
          </button>
        </div>
      </div>

      {/* Compact Stats */}
      <div style={{
        marginBottom: '16px',
        display: 'flex',
        gap: '10px',
        overflowX: 'auto',
        paddingBottom: '4px'
      }}>
        {[
          { label: 'Lab Recheck', value: orders.length, sub: 'Marked by supervisors', color: '#1a1a18' },
          { label: 'Pending', value: pending, sub: 'Action not done', color: pending ? '#633806' : '#27500A' },
          { label: 'Done', value: done, sub: 'Status checked', color: '#27500A' },
          { label: 'Delayed', value: delayed, sub: 'Past planned date', color: delayed ? '#A32D2D' : '#27500A' },
          { label: 'Supervisors', value: supervisors.length, sub: 'With recheck orders', color: '#185FA5' }
        ].map((stat, idx) => (
          <div key={idx} style={{
            minWidth: '165px',
            flex: '0 0 165px',
            background: 'white',
            border: '1px solid rgba(0,0,0,0.08)',
            borderRadius: '10px',
            padding: '14px 16px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.04)'
          }}>
            <div style={{ fontSize: '10px', color: '#9a9a94', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>{stat.label}</div>
            <div style={{ fontSize: '26px', fontWeight: 700, lineHeight: 1, color: stat.color }}>{stat.value}</div>
            <div style={{ fontSize: '11px', color: '#9a9a94', marginTop: '4px' }}>{stat.sub}</div>
          </div>
        ))}
      </div>

      {/* Register Card */}
      <div style={{
        background: 'white',
        border: '1px solid rgba(0,0,0,0.08)',
        borderRadius: '12px',
        overflow: 'hidden',
        boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
      }}>
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid rgba(0,0,0,0.08)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: '#fafafa'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 600, margin: 0 }}>InHouse Recheck Register</h3>
            <span style={{ fontSize: '12px', color: '#9a9a94', background: '#f0efec', padding: '3px 10px', borderRadius: '12px' }}>
              {orders.length} order{orders.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: '#5a5a55' }}>
              {visibleColumns.length} of {columns.length} columns
            </span>
            <button
              onClick={() => setShowColumnModal(true)}
              style={{
                padding: '6px 12px',
                fontSize: '12px',
                border: '1px solid rgba(0,0,0,0.15)',
                borderRadius: '6px',
                background: 'white',
                cursor: 'pointer',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              ⚙ Columns
            </button>
          </div>
        </div>

        {orders.length === 0 ? (
          <div style={{
            padding: '64px 32px',
            textAlign: 'center',
            color: '#9a9a94'
          }}>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>🔬</div>
            <div style={{ fontSize: '15px', fontWeight: 600, color: '#5a5a55', marginBottom: '6px' }}>
              No lab recheck orders yet
            </div>
            <div style={{ fontSize: '13px' }}>
              Orders will appear here when supervisors mark them for lab recheck
            </div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto', overflowY: 'hidden' }}>
            <table style={{
              width: 'max-content',
              minWidth: '100%',
              borderCollapse: 'collapse',
              fontSize: '13px'
            }}>
              <thead>
                <tr style={{ background: '#f7f7f6' }}>
                  {visibleColumns.map(col => (
                    <th
                      key={col.key}
                      style={{
                        ...headerStyle,
                        width: `${col.width}px`,
                        minWidth: `${col.width}px`,
                        maxWidth: `${col.width}px`,
                        position: 'relative'
                      }}
                    >
                      {col.label}
                      <div
                        onMouseDown={(e) => startResize(col.key, e)}
                        style={{
                          position: 'absolute',
                          top: 0,
                          right: 0,
                          width: '8px',
                          height: '100%',
                          cursor: 'col-resize',
                          zIndex: 1
                        }}
                        onMouseEnter={(e) => {
                          const indicator = document.createElement('div')
                          indicator.style.cssText = 'position:absolute;top:20%;bottom:20%;right:3px;width:2px;background:#3B82F6;border-radius:2px;pointer-events:none'
                          indicator.className = 'resize-indicator'
                          e.currentTarget.appendChild(indicator)
                        }}
                        onMouseLeave={(e) => {
                          const indicator = e.currentTarget.querySelector('.resize-indicator')
                          if (indicator) indicator.remove()
                        }}
                      />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orders.map((order, idx) => (
                  <tr
                    key={order.id}
                    style={{
                      borderBottom: '1px solid rgba(0,0,0,0.06)',
                      background: idx % 2 === 0 ? 'white' : '#fafafa'
                    }}
                  >
                    {visibleColumns.map(col => renderCell(order, col))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Column Settings Modal */}
      {showColumnModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 999,
          backdropFilter: 'blur(4px)'
        }}
        onClick={() => setShowColumnModal(false)}
        >
          <div style={{
            background: 'white',
            borderRadius: '12px',
            padding: '24px',
            width: '600px',
            maxWidth: '90vw',
            maxHeight: '80vh',
            overflow: 'auto',
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
          }}
          onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 600, margin: 0 }}>Column Settings</h3>
              <button
                onClick={() => setShowColumnModal(false)}
                style={{
                  padding: '6px 12px',
                  border: '1px solid #ddd',
                  borderRadius: '6px',
                  background: 'white',
                  cursor: 'pointer',
                  fontSize: '20px',
                  lineHeight: 1
                }}
              >
                ×
              </button>
            </div>

            <div style={{ marginBottom: '16px', padding: '12px', background: '#f7f7f6', borderRadius: '8px' }}>
              <div style={{ fontSize: '13px', color: '#5a5a55', marginBottom: '8px' }}>
                <strong>{visibleColumns.length}</strong> of <strong>{columns.length}</strong> columns visible
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => {
                    setColumns(prev => prev.map(c => ({ ...c, visible: true })))
                  }}
                  style={{
                    padding: '5px 12px',
                    fontSize: '12px',
                    border: '1px solid #ddd',
                    borderRadius: '6px',
                    background: 'white',
                    cursor: 'pointer'
                  }}
                >
                  Show All
                </button>
                <button
                  onClick={() => {
                    setColumns(prev => prev.map(c => ({ ...c, visible: false })))
                  }}
                  style={{
                    padding: '5px 12px',
                    fontSize: '12px',
                    border: '1px solid #ddd',
                    borderRadius: '6px',
                    background: 'white',
                    cursor: 'pointer'
                  }}
                >
                  Hide All
                </button>
                <button
                  onClick={resetColumns}
                  style={{
                    padding: '5px 12px',
                    fontSize: '12px',
                    border: '1px solid #ddd',
                    borderRadius: '6px',
                    background: 'white',
                    cursor: 'pointer'
                  }}
                >
                  Reset to Default
                </button>
              </div>
            </div>

            <div style={{ display: 'grid', gap: '8px', maxHeight: '400px', overflowY: 'auto' }}>
              {columns.map(col => (
                <label
                  key={col.key}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '10px 12px',
                    border: '1px solid #e5e7eb',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    background: col.visible ? '#f0f9ff' : 'white',
                    transition: 'all 0.15s'
                  }}
                >
                  <input
                    type="checkbox"
                    checked={col.visible}
                    onChange={() => toggleColumn(col.key)}
                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                  />
                  <span style={{ flex: 1, fontSize: '13px', fontWeight: col.visible ? 600 : 400 }}>
                    {col.label}
                  </span>
                  <span style={{ fontSize: '11px', color: '#9a9a94' }}>
                    {col.width}px
                  </span>
                </label>
              ))}
            </div>

            <div style={{ marginTop: '20px', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowColumnModal(false)}
                style={{
                  padding: '8px 16px',
                  border: '1px solid #ddd',
                  borderRadius: '6px',
                  background: 'white',
                  cursor: 'pointer',
                  fontSize: '13px'
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  saveColumnConfig()
                  setShowColumnModal(false)
                }}
                style={{
                  padding: '8px 16px',
                  border: 'none',
                  borderRadius: '6px',
                  background: '#667EEA',
                  color: 'white',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: 600
                }}
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const headerStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '10px 12px',
  borderBottom: '2px solid rgba(0,0,0,0.1)',
  borderRight: '1px solid rgba(0,0,0,0.06)',
  fontSize: '11px',
  fontWeight: 700,
  color: '#6B7280',
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
  whiteSpace: 'normal',
  overflowWrap: 'anywhere',
  wordBreak: 'break-word'
}

const cellStyle: React.CSSProperties = {
  padding: '10px 12px',
  borderBottom: '1px solid rgba(0,0,0,0.06)',
  borderRight: '1px solid rgba(0,0,0,0.06)',
  color: '#1a1a18',
  verticalAlign: 'middle',
  whiteSpace: 'normal',
  overflowWrap: 'anywhere',
  wordBreak: 'break-word'
}
