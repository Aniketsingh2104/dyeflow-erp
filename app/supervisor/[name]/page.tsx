'use client'

import { use, useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import RouteAssignment from './RouteAssignment'
import ColumnSettingsModal from './ColumnSettingsModal'
import { ColumnConfig, DEFAULT_COLUMNS, loadColumnConfig, saveColumnConfig, resetColumnConfig } from './column-config'
import { useSupervisorFilter } from '@/lib/permissions'
import { AccessDenied } from '@/lib/AccessDenied'

export default function SupervisorDetailPage({ params }: { params: Promise<{ name: string }> }) {
  const { name: supervisorSlug } = use(params)
  const router = useRouter()
  const supervisorFilter = useSupervisorFilter()
  // supervisorSlug is either a supervisor ID (new) or a name slug (legacy)
  const decodedSlug = decodeURIComponent(supervisorSlug)
  
  const [activeTab, setActiveTab] = useState('inbox')
  const [orders, setOrders] = useState<any[]>([])  
  const [faultyBatches, setFaultyBatches] = useState<any[]>([])
  const [fullSupervisorName, setFullSupervisorName] = useState('')
  const [stats, setStats] = useState({ inbox: 0, faulty: 0 })
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage] = useState(50)
  const [columns, setColumns] = useState<ColumnConfig[]>(DEFAULT_COLUMNS)
  const [showColumnSettings, setShowColumnSettings] = useState(false)
  const [resizing, setResizing] = useState<{ columnId: string; startX: number; startWidth: number } | null>(null)
  const [filters, setFilters] = useState<{ [key: string]: string }>({})

  useEffect(() => { loadData() }, [decodedSlug]) // loadData is now async, effect just fires it // loadData is now async, effect just fires it // loadData is now async, effect just fires it // loadData is now async, effect just fires it // loadData is now async, effect just fires it // loadData is now async, effect just fires it

  useEffect(() => {
    if (decodedSlug) {
      const savedColumns = loadColumnConfig(decodedSlug)
      setColumns(savedColumns)
    }
  }, [decodedSlug])

  useEffect(() => { setCurrentPage(1) }, [activeTab, filters])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!resizing) return
      const diff = e.pageX - resizing.startX
      const newWidth = Math.max(50, resizing.startWidth + diff)
      setColumns(prev => prev.map(col =>
        col.id === resizing.columnId ? { ...col, width: newWidth } : col
      ))
    }
    const handleMouseUp = () => {
      if (resizing) saveColumnConfig(decodedSlug, columns)
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
  }, [resizing, columns, decodedSlug])

  const loadData = async () => {
    let resolvedName = decodedSlug
    let resolvedId   = decodedSlug
    try {
      // Resolve supervisor name/id
      const supRes = await fetch('/api/supervisors', { cache: 'no-store' }).then(r => r.json())
      const supervisors: any[] = supRes.data || []
      const byId = supervisors.find((s: any) => s.id === decodedSlug)
      if (byId) { resolvedName = byId.name; resolvedId = byId.id }
      else {
        const byName = supervisors.find((s: any) =>
          (s.name || '').toLowerCase().includes(decodedSlug.toLowerCase())
        )
        if (byName) { resolvedName = byName.name; resolvedId = byName.id }
      }
      setFullSupervisorName(resolvedName)

      // Fetch orders from Supabase
      const ordersRes = await fetch(
        `/api/orders?supervisor_id=${resolvedId}&limit=500`,
        { cache: 'no-store' }
      ).then(r => r.json())

      const mappedOrders = (ordersRes.data || []).map((o: any) => ({
        ...o,
        subParty:      o.sub_party,
        salesPerson:   o.sales_person,
        labNo:         o.lab_no,
        lotNo:         o.lot_no,
        challanNo:     o.challan_no,
        qtyKg:         o.qty_kg,
        qtyMtr:        o.qty_mtr,
        noOfTaka:      o.no_of_taka,
        typeOfFinish:  o.type_of_finish,
        typeOfPacking: o.type_of_packing,
        orderNumber:   o.order_number,
        holdApproval:  o.hold_approval,
        holdReason:          o.hold_reason,
        supervisor:          resolvedName,
        timestamp:           o.created_at,
        supervisorConfirmed: o.supervisor_confirmed,
        processRoute:        o.process_route,
      }))

      setOrders(mappedOrders)
      const inbox = mappedOrders.filter((o: any) =>
        o.status !== 'done' && o.status !== 'cancelled'
      ).length

      // Repair batches — ONLY batches from repairing_orders with status='pending'
      // These need supervisor to assign process route + machine
      const repairApiRes = await fetch('/api/repair-assign', { cache: 'no-store' })
        .then(r => r.json()).catch(() => ({ data: [] }))

      // All pending repair batches (not filtered by supervisor — supervisor picks any)
      const pendingRepairs: any[] = (repairApiRes.data || []).filter((b: any) =>
        b.status === 'repairing'
      )

      setFaultyBatches(pendingRepairs)
      setStats({ inbox, faulty: pendingRepairs.length })
    } catch (err) {
      console.error('loadData error:', err)
    }
  }

  const handleFilterChange = (columnId: string, value: string) => {
    setFilters(prev => ({ ...prev, [columnId]: value }))
  }

  const applyFilters = (data: any[]) => {
    let filtered = [...data]
    Object.keys(filters).forEach(key => {
      const filterValue = filters[key].toLowerCase().trim()
      if (filterValue) {
        filtered = filtered.filter(item =>
          String(item[key] || '').toLowerCase().includes(filterValue)
        )
      }
    })
    return filtered
  }

  const toggleCheck = async (orderId: string, field: string, checked: boolean) => {
    // Map camelCase field to DB column
    const fieldMap: any = {
      labRecheck: 'lab_recheck', labReceive: 'lab_receive', greigeCheck: 'greige_check'
    }
    const timeFieldMap: any = {
      labRecheck: 'lab_recheck_at', labReceive: 'lab_receive_at', greigeCheck: 'greige_check_at'
    }
    const patch: any = {}
    if (fieldMap[field]) patch[fieldMap[field]] = checked
    if (timeFieldMap[field]) patch[timeFieldMap[field]] = checked ? new Date().toISOString() : null
    await fetch('/api/orders', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update', id: orderId, ...patch })
    })
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

  const handleSaveColumns = (newColumns: ColumnConfig[]) => {
    setColumns(newColumns)
    saveColumnConfig(decodedSlug, newColumns)
  }

  const handleResetColumns = () => {
    const defaultCols = resetColumnConfig(decodedSlug)
    setColumns(defaultCols)
  }

  const getVisibleColumns = () => columns.filter(c => c.visible)

  const startResize = (columnId: string, e: React.MouseEvent) => {
    e.preventDefault()
    const col = columns.find(c => c.id === columnId)
    if (!col) return
    setResizing({ columnId, startX: e.pageX, startWidth: col.width })
  }

  const updateFaultyStatus = async (repairId: string, status: string) => {
    const patch: any = { status }
    if (status === 'In Repair') patch.repair_start_date = new Date().toISOString()
    if (status === 'Completed')  patch.repair_completed_date = new Date().toISOString()
    await fetch('/api/faulty', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update', id: repairId, ...patch })
    }).catch(() => {})
    loadData()
  }

  const getSupervisorColor = () => {
    const colors: any = {
      'kundan': '#EF4444', 'gyaneshwar': '#3B82F6', 'nandlal': '#10B981',
      'urvesh': '#F59E0B', 'jitesh': '#8B5CF6', 'arpit': '#EC4899'
    }
    // Try to match by resolved display name
    const lowerName = (fullSupervisorName || decodedSlug).toLowerCase()
    for (const [key, val] of Object.entries(colors)) {
      if (lowerName.includes(key)) return val
    }
    return '#6B7280'
  }

  const color = getSupervisorColor()

  const renderCell = (order: any, col: ColumnConfig, idx: number) => {
    const baseStyle = { ...cellStyle, width: `${col.width}px`, minWidth: `${col.width}px`, maxWidth: `${col.width}px` }
    switch (col.id) {
      case 'timestamp':
        return <td key={col.id} style={{ ...baseStyle, fontSize: '11px', color: '#9CA3AF', whiteSpace: 'nowrap' }}>{order.timestamp || '-'}</td>
      case 'party': return <td key={col.id} style={baseStyle}>{order.party || '-'}</td>
      case 'subParty': return <td key={col.id} style={baseStyle}>{order.subParty || '-'}</td>
      case 'salesPerson': return <td key={col.id} style={baseStyle}>{order.salesPerson || '-'}</td>
      case 'article': return <td key={col.id} style={{ ...baseStyle, fontWeight: 500 }}>{order.article || '-'}</td>
      case 'blend': return <td key={col.id} style={{ ...baseStyle, fontSize: '11px', color: '#6B7280' }}>{order.blend || '-'}</td>
      case 'width': return <td key={col.id} style={baseStyle}>{order.width || '-'}</td>
      case 'gsm': return <td key={col.id} style={baseStyle}>{order.gsm || '-'}</td>
      case 'color': return <td key={col.id} style={baseStyle}>{order.color || '-'}</td>
      case 'labNo': return <td key={col.id} style={{ ...baseStyle, fontSize: '11px' }}>{order.labNo || '-'}</td>
      case 'lotNo': return <td key={col.id} style={{ ...baseStyle, fontSize: '11px' }}>{order.lotNo || '-'}</td>
      case 'challanNo': return <td key={col.id} style={{ ...baseStyle, fontSize: '11px' }}>{order.challanNo || '-'}</td>
      case 'qtyKg': return <td key={col.id} style={baseStyle}>{order.qtyKg || '-'}</td>
      case 'qtyMtr': return <td key={col.id} style={baseStyle}>{order.qtyMtr || '-'}</td>
      case 'noOfTaka': return <td key={col.id} style={baseStyle}>{order.noOfTaka || '-'}</td>
      case 'typeOfFinish': return <td key={col.id} style={baseStyle}>{order.typeOfFinish || '-'}</td>
      case 'typeOfPacking': return <td key={col.id} style={baseStyle}>{order.typeOfPacking || '-'}</td>
      case 'remarks': return <td key={col.id} style={{ ...baseStyle, overflow: 'hidden', textOverflow: 'ellipsis' }}>{order.remarks || '-'}</td>
      case 'holdApproval':
        return (
          <td key={col.id} style={baseStyle}>
            {order.holdApproval === 'Hold' ? (
              <span style={{ padding: '4px 10px', borderRadius: '4px', fontSize: '11px', fontWeight: 600, background: '#FEE2E2', color: '#991B1B' }}>Hold</span>
            ) : '-'}
          </td>
        )
      case 'holdReason': return <td key={col.id} style={{ ...baseStyle, overflow: 'hidden', textOverflow: 'ellipsis' }}>{order.holdReason || '-'}</td>
      case 'orderNumber': return <td key={col.id} style={{ ...baseStyle, fontWeight: 700, color }}>{order.orderNumber || '-'}</td>
      case 'supervisor': return <td key={col.id} style={baseStyle}>{order.supervisor || '-'}</td>
      case 'labRecheck':
        return (
          <td key={col.id} style={{ ...baseStyle, textAlign: 'center' }}>
            <input type="checkbox" checked={order.labRecheck || false} onChange={e => toggleCheck(order.id, 'labRecheck', e.target.checked)} style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: color }} />
          </td>
        )
      case 'labRecheckAt':
        return <td key={col.id} style={{ ...baseStyle, fontSize: '11px', color: '#9CA3AF', whiteSpace: 'nowrap' }}>{formatDateTime(order.labRecheckAt)}</td>
      case 'labReceive':
        return (
          <td key={col.id} style={{ ...baseStyle, textAlign: 'center' }}>
            <input type="checkbox" checked={order.labReceive || false} onChange={e => toggleCheck(order.id, 'labReceive', e.target.checked)} style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: color }} />
          </td>
        )
      case 'labReceiveAt':
        return <td key={col.id} style={{ ...baseStyle, fontSize: '11px', color: '#9CA3AF', whiteSpace: 'nowrap' }}>{formatDateTime(order.labReceiveAt)}</td>
      case 'greigeCheck':
        return (
          <td key={col.id} style={{ ...baseStyle, textAlign: 'center' }}>
            <input type="checkbox" checked={order.greigeCheck || false} onChange={e => toggleCheck(order.id, 'greigeCheck', e.target.checked)} style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: color }} />
          </td>
        )
      case 'greigeCheckAt':
        return <td key={col.id} style={{ ...baseStyle, fontSize: '11px', color: '#9CA3AF', whiteSpace: 'nowrap' }}>{formatDateTime(order.greigeCheckAt)}</td>
      case 'greigeRecheckFailReason':
        return <td key={col.id} style={{ ...baseStyle, overflow: 'hidden', textOverflow: 'ellipsis' }}>{order.greigeRecheckFailReason || '-'}</td>
      case 'routeMachine':
        return <td key={col.id} style={baseStyle}><RouteAssignment order={order} onUpdate={loadData} /></td>
      default:
        return <td key={col.id} style={baseStyle}>{order[col.id] || '-'}</td>
    }
  }

  // Show all orders that still need supervisor attention
  // Remove only when done or cancelled
  const getInboxOrders = () => orders.filter(o =>
    o.status !== 'done' && o.status !== 'cancelled'
  )

  const getCurrentTabData = useMemo(() => {
    let data: any[] = []
    if (activeTab === 'inbox') data = getInboxOrders()
    else if (activeTab === 'faulty') data = faultyBatches
    return applyFilters(data)
  }, [orders, faultyBatches, activeTab, filters])

  const totalPages = Math.ceil(getCurrentTabData.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const paginatedData = getCurrentTabData.slice(startIndex, startIndex + itemsPerPage)

  const goToPage = (page: number) => setCurrentPage(Math.max(1, Math.min(page, totalPages)))

  const TabButton = ({ id, label, count }: any) => {
    const isActiveTab = activeTab === id
    return (
      <button onClick={() => setActiveTab(id)} style={{
        padding: '8px 16px', border: `1px solid ${isActiveTab ? color : '#E5E7EB'}`,
        background: isActiveTab ? color : 'white', color: isActiveTab ? 'white' : '#6B7280',
        borderRadius: '8px', fontSize: '13px', fontWeight: isActiveTab ? 600 : 400,
        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap'
      }}>
        {label}
        <span style={{
          background: isActiveTab ? 'rgba(255,255,255,0.25)' : '#F3F4F6',
          color: isActiveTab ? 'white' : (count > 0 ? color : '#9CA3AF'),
          padding: '2px 7px', borderRadius: '20px', fontSize: '11px', fontWeight: 700
        }}>{count}</span>
      </button>
    )
  }

  const PaginationControls = () => {
    if (totalPages <= 1) return null
    const pageNumbers = []
    const maxVisible = 5
    let startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2))
    let endPage = Math.min(totalPages, startPage + maxVisible - 1)
    if (endPage - startPage < maxVisible - 1) startPage = Math.max(1, endPage - maxVisible + 1)
    for (let i = startPage; i <= endPage; i++) pageNumbers.push(i)

    const btnStyle = (active: boolean, disabled: boolean) => ({
      padding: '6px 10px', border: `1px solid ${active ? color : '#D1D5DB'}`,
      borderRadius: '6px', background: active ? color : (disabled ? '#F3F4F6' : 'white'),
      color: active ? 'white' : (disabled ? '#9CA3AF' : '#374151'),
      fontSize: '12px', cursor: disabled ? 'not-allowed' : 'pointer',
      fontWeight: active ? 600 : 400, minWidth: '36px'
    })

    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderTop: '1px solid #E5E7EB', background: '#F9FAFB' }}>
        <div style={{ fontSize: '13px', color: '#6B7280' }}>
          Showing {startIndex + 1}-{Math.min(startIndex + itemsPerPage, getCurrentTabData.length)} of {getCurrentTabData.length}
        </div>
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          <button onClick={() => goToPage(1)} disabled={currentPage === 1} style={btnStyle(false, currentPage === 1)}>First</button>
          <button onClick={() => goToPage(currentPage - 1)} disabled={currentPage === 1} style={btnStyle(false, currentPage === 1)}>Prev</button>
          {startPage > 1 && <><button onClick={() => goToPage(1)} style={btnStyle(false, false)}>1</button>{startPage > 2 && <span style={{ color: '#9CA3AF' }}>...</span>}</>}
          {pageNumbers.map(num => (
            <button key={num} onClick={() => goToPage(num)} style={btnStyle(currentPage === num, false)}>{num}</button>
          ))}
          {endPage < totalPages && <>{endPage < totalPages - 1 && <span style={{ color: '#9CA3AF' }}>...</span>}<button onClick={() => goToPage(totalPages)} style={btnStyle(false, false)}>{totalPages}</button></>}
          <button onClick={() => goToPage(currentPage + 1)} disabled={currentPage === totalPages} style={btnStyle(false, currentPage === totalPages)}>Next</button>
          <button onClick={() => goToPage(totalPages)} disabled={currentPage === totalPages} style={btnStyle(false, currentPage === totalPages)}>Last</button>
        </div>
      </div>
    )
  }

  // Guard: if user is restricted to a specific supervisor and this page is for a different one, deny access
  if (supervisorFilter && fullSupervisorName &&
    supervisorFilter.toLowerCase() !== fullSupervisorName.toLowerCase()) {
    return <AccessDenied pageName={`Supervisor — ${fullSupervisorName}`} />
  }

  return (
    <div className="content" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 40px)', padding: '20px', gap: '10px' }}>
      {/* Header */}
      <div style={{ background: color + '12', border: `1px solid ${color}33`, borderRadius: '10px', padding: '10px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ fontSize: '16px', fontWeight: 600, color, marginRight: '12px' }}>
            {fullSupervisorName || decodedSlug.toUpperCase()}
          </div>
          <TabButton id="inbox" label="📬 Inbox" count={stats.inbox} />
          <TabButton id="faulty" label="🔧 Repair Queue" count={stats.faulty} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {[['INBOX', stats.inbox], ['FAULTY', stats.faulty]].map(([label, count]) => (
            <div key={label as string} style={{ background: 'white', borderRadius: '8px', padding: '6px 10px', border: '1px solid #E5E7EB', textAlign: 'center', minWidth: '56px' }}>
              <div style={{ fontSize: '18px', fontWeight: 700, color: (count as number) > 0 ? color : '#1F2937' }}>{count as number}</div>
              <div style={{ fontSize: '10px', color: '#9CA3AF', letterSpacing: '0.04em' }}>{label}</div>
            </div>
          ))}
          <button onClick={() => router.push('/supervisor')} style={{ padding: '7px 14px', border: '1px solid #D1D5DB', borderRadius: '6px', background: 'white', color: '#374151', fontSize: '13px', fontWeight: 500, cursor: 'pointer' }}>
            Back to Supervisors
          </button>
        </div>
      </div>

      {/* Inbox Tab */}
      {activeTab === 'inbox' && (
        <div style={{ background: 'white', borderRadius: '8px', border: '1px solid #E5E7EB', borderTop: `3px solid ${color}`, overflow: 'hidden', display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid #E5E7EB', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
            <div style={{ fontSize: '14px', fontWeight: 600, color: '#1F2937' }}>
              Inbox Orders {Object.keys(filters).some(k => filters[k]) && `(${getCurrentTabData.length} filtered)`}
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span style={{ padding: '4px 10px', borderRadius: '4px', fontSize: '11px', fontWeight: 600, background: '#DBEAFE', color: '#1E40AF' }}>
                {getInboxOrders().length} total orders
              </span>
              <button onClick={() => setShowColumnSettings(true)} style={{ padding: '5px 12px', border: '1px solid #D1D5DB', borderRadius: '5px', background: 'white', color: '#374151', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                ⚙ Columns
              </button>
            </div>
          </div>

          {getInboxOrders().length === 0 ? (
            <div style={{ padding: '48px', textAlign: 'center', color: '#9CA3AF', fontSize: '14px' }}>No assigned orders in Inbox right now.</div>
          ) : (
            <div style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: 'white' }}>
                  {/* Filter row */}
                  <tr style={{ background: '#F9FAFB' }}>
                    {getVisibleColumns().map(col => (
                      <th key={`filter-${col.id}`} style={{ padding: '8px 10px', borderBottom: '1px solid #E5E7EB', borderRight: '1px solid #E5E7EB', width: `${col.width}px`, minWidth: `${col.width}px`, maxWidth: `${col.width}px` }}>
                        {!['labRecheck', 'labReceive', 'greigeCheck', 'routeMachine'].includes(col.id) && (
                          <input type="text" placeholder="Filter..." value={filters[col.id] || ''} onChange={e => handleFilterChange(col.id, e.target.value)}
                            style={{ width: '100%', padding: '4px 6px', border: '1px solid #D1D5DB', borderRadius: '4px', fontSize: '11px', outline: 'none' }} />
                        )}
                      </th>
                    ))}
                  </tr>
                  {/* Header row */}
                  <tr style={{ background: '#F9FAFB' }}>
                    {getVisibleColumns().map(col => (
                      <th key={col.id} style={{ ...headerStyle, width: `${col.width}px`, minWidth: `${col.width}px`, maxWidth: `${col.width}px`, position: 'relative' }}>
                        {col.label}
                        <div onMouseDown={e => startResize(col.id, e)}
                          style={{ position: 'absolute', top: 0, right: 0, width: '8px', height: '100%', cursor: 'col-resize', zIndex: 1 }} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paginatedData.length === 0 ? (
                    <tr><td colSpan={getVisibleColumns().length} style={{ padding: '48px', textAlign: 'center', color: '#9CA3AF', fontSize: '14px' }}>No orders match your filters.</td></tr>
                  ) : (
                    paginatedData.map((order, idx) => (
                      <tr key={order.id || idx} style={{ background: idx % 2 === 0 ? 'white' : '#FAFAFA', borderBottom: '1px solid #F3F4F6' }}>
                        {getVisibleColumns().map(col => renderCell(order, col, idx))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
          <PaginationControls />
        </div>
      )}

      {/* Faulty Batch Tab */}
      {activeTab === 'faulty' && (
        <div style={{ background: 'white', borderRadius: '8px', border: '1px solid #E5E7EB', borderTop: `3px solid ${color}`, overflow: 'hidden', display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid #E5E7EB', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
            <div style={{ fontSize: '14px', fontWeight: 600, color: '#1F2937' }}>Repair Queue — Assign Process & Machine</div>
            <span style={{ padding: '4px 10px', borderRadius: '4px', fontSize: '11px', fontWeight: 600, background: '#FEF3C7', color: '#92400E' }}>
              {faultyBatches.length} batches awaiting assignment
            </span>
          </div>
          {faultyBatches.length === 0 ? (
            <div style={{ padding: '48px', textAlign: 'center', color: '#9CA3AF', fontSize: '14px' }}>
              ✓ No repair batches pending assignment.
            </div>
          ) : (
            <div style={{ flex: 1, overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: '#FFF5F5' }}>
                  <tr>
                    {['BATCH #','ORDER #','PARTY','SUB PARTY','SALES PERSON','ARTICLE',
                      'BLEND','WIDTH','GSM','COLOR','LAB NO.','LOT NO.','CHALLAN NO.',
                      'QTY(KG)','QTY(MTR)','TAKA','FINISH','PACKING','REMARKS',
                      'REPAIR KG','REPAIR MTR','REPAIR TAKA','SOURCE','TYPE','NOTES','ASSIGN'].map(h => (
                      <th key={h} style={headerStyle}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {faultyBatches.map((r: any, idx: number) => (
                    <tr key={r.id || idx} style={{ background: idx%2===0?'white':'#FFF5F5', borderBottom: '1px solid #FEE2E2' }}>
                      <td style={{ ...cellStyle, fontWeight:700, color:'#DC2626' }}>{r.batch_id||'-'}</td>
                      <td style={{ ...cellStyle, fontWeight:700, color:'#2563EB' }}>{r.order_number||'-'}</td>
                      <td style={{ ...cellStyle, color:'#2563EB', fontWeight:600 }}>{r.party||'-'}</td>
                      <td style={cellStyle}>{r.sub_party||'-'}</td>
                      <td style={{ ...cellStyle, color:'#2563EB' }}>{r.sales_person||'-'}</td>
                      <td style={{ ...cellStyle, fontWeight:500 }}>{r.article||'-'}</td>
                      <td style={{ ...cellStyle, color:'#D97706' }}>{r.blend||'-'}</td>
                      <td style={cellStyle}>{r.width||'-'}</td>
                      <td style={{ ...cellStyle, fontWeight:700, color:'#2563EB' }}>{r.gsm||'-'}</td>
                      <td style={{ ...cellStyle, color:'#2563EB' }}>{r.color||'-'}</td>
                      <td style={{ ...cellStyle, fontSize:11, color:'#2563EB' }}>{r.lab_no||'-'}</td>
                      <td style={{ ...cellStyle, fontSize:11 }}>{r.lot_no||'-'}</td>
                      <td style={{ ...cellStyle, fontSize:11, color:'#2563EB' }}>{r.challan_no||'-'}</td>
                      <td style={{ ...cellStyle, fontWeight:700, color:'#2563EB' }}>{r.kg||'-'} Kg</td>
                      <td style={{ ...cellStyle, fontWeight:600, color:'#2563EB' }}>{r.qty_mtr||'-'}</td>
                      <td style={{ ...cellStyle, fontWeight:600, color:'#2563EB' }}>{r.no_of_taka||'-'}</td>
                      <td style={cellStyle}>{r.type_of_finish||'-'}</td>
                      <td style={{ ...cellStyle, color:'#2563EB' }}>{r.type_of_packing||'-'}</td>
                      <td style={{ ...cellStyle, fontSize:11 }}>{r.remarks||'-'}</td>
                      <td style={{ ...cellStyle, fontWeight:700, color:'#DC2626' }}>{r.repair_kg||r.kg||0} Kg</td>
                      <td style={{ ...cellStyle, fontWeight:600, color:'#DC2626' }}>{r.repair_mtr||'-'}</td>
                      <td style={{ ...cellStyle, fontWeight:600, color:'#DC2626' }}>{r.repair_taka||'-'}</td>
                      <td style={cellStyle}>
                        <span style={{ fontSize:11, fontWeight:700, padding:'2px 7px', borderRadius:4,
                          background:r.source_type==='fob'?'#F3E8FF':'#FEE2E2',
                          color:r.source_type==='fob'?'#7C3AED':'#DC2626' }}>
                          {r.source_type||'faulty'}
                        </span>
                      </td>
                      <td style={cellStyle}>
                        <span style={{ fontSize:11, fontWeight:600, padding:'2px 7px', borderRadius:4,
                          background:r.reprocess_type==='partial'?'#FEF3C7':'#F3F4F6',
                          color:r.reprocess_type==='partial'?'#D97706':'#6B7280' }}>
                          {r.reprocess_type||'full'}
                        </span>
                      </td>
                      <td style={{ ...cellStyle, fontSize:11 }}>{r.repair_notes||'-'}</td>
                      <td style={cellStyle}>
                        <RouteAssignment
                          order={{ ...r, id:r.id, batch_id:r.id, repair_id:r.repair_id, isRepair:true }}
                          onUpdate={loadData}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {showColumnSettings && (
        <ColumnSettingsModal columns={columns} onSave={handleSaveColumns} onClose={() => setShowColumnSettings(false)} onReset={handleResetColumns} />
      )}
    </div>
  )
}

const headerStyle: React.CSSProperties = {
  padding: '10px 14px', textAlign: 'left', fontSize: '10px', fontWeight: 700,
  color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.5px',
  borderBottom: '2px solid #E5E7EB', borderRight: '1px solid #E5E7EB',
  whiteSpace: 'normal', wordWrap: 'break-word'
}

const cellStyle: React.CSSProperties = {
  padding: '12px 14px', fontSize: '12px', color: '#1F2937',
  borderRight: '1px solid #F3F4F6', whiteSpace: 'normal',
  wordWrap: 'break-word', overflowWrap: 'break-word'
}
