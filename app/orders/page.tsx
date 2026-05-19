'use client'

import React, { useEffect, useState, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { loadOrSeedProcessList, ProcessDef } from '@/lib/processMap'
import { logAudit } from '@/lib/auditLog'

// Move columns outside component to prevent re-creation
const COLUMNS = [
  { key: 'timestamp', label: 'TIMESTAMP', defaultWidth: 140 },
  { key: 'orderNumber', label: 'ORDER #', defaultWidth: 140 },
  { key: 'party', label: 'PARTY', defaultWidth: 150 },
  { key: 'subParty', label: 'SUB PARTY', defaultWidth: 130 },
  { key: 'salesPerson', label: 'SALES PERSON', defaultWidth: 130 },
  { key: 'article', label: 'ARTICLE', defaultWidth: 150 },
  { key: 'blend', label: 'BLEND', defaultWidth: 120 },
  { key: 'width', label: 'WIDTH', defaultWidth: 80 },
  { key: 'gsm', label: 'GSM', defaultWidth: 80 },
  { key: 'color', label: 'COLOR', defaultWidth: 120 },
  { key: 'labNo', label: 'LAB NO.', defaultWidth: 100 },
  { key: 'lotNo', label: 'LOT NO.', defaultWidth: 100 },
  { key: 'challanNo', label: 'CHALLAN NO.', defaultWidth: 110 },
  { key: 'qtyKg', label: 'QTY (KG)', defaultWidth: 90 },
  { key: 'qtyMtr', label: 'QTY (MTR)', defaultWidth: 90 },
  { key: 'noOfTaka', label: 'TAKA', defaultWidth: 80 },
  { key: 'typeOfFinish', label: 'FINISH', defaultWidth: 100 },
  { key: 'typeOfPacking', label: 'PACKING', defaultWidth: 100 },
  { key: 'remarks', label: 'REMARKS', defaultWidth: 200 },
  { key: 'holdApproval', label: 'HOLD/APPROVAL', defaultWidth: 130 },
  { key: 'holdReason', label: 'HOLD REMARK', defaultWidth: 150 },
  { key: 'supervisor', label: 'SUPERVISOR', defaultWidth: 120 },
  { key: 'routeTemplate', label: 'ROUTE TEMPLATE', defaultWidth: 140 },
  { key: 'processRoute', label: 'PROCESS ROUTE', defaultWidth: 200 },
  { key: 'machine', label: 'MACHINE', defaultWidth: 120 },
  { key: 'status', label: 'STATUS', defaultWidth: 100 },
  { key: 'actions', label: 'ACTIONS', defaultWidth: 380 }
]

// Helper functions
const getProcObj = (code: string) => {
  // Read from db.processList (user-managed via Process Master) with built-in fallback
  const list = loadOrSeedProcessList()
  const found = list.find((p: ProcessDef) => p.code.toUpperCase() === code.toUpperCase())
  if (found) return { code: found.code, name: found.name }
  return { code, name: code }
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

const getSplitStatus = (order: any) => {
  const splits = order.splits || []
  const splitKg = splits.reduce((sum: number, batch: any) => 
    sum + (parseFloat(batch.kg) || 0), 0
  )
  const fullySplit = splitKg >= parseFloat(order.qtyKg || 0)
  const partiallySplit = splitKg > 0
  
  return { splitKg, fullySplit, partiallySplit }
}

const formatDateTime = (date: Date) => {
  const d = new Date(date)
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const year = d.getFullYear()
  const hours = String(d.getHours()).padStart(2, '0')
  const minutes = String(d.getMinutes()).padStart(2, '0')
  return `${day}/${month}/${year} ${hours}:${minutes}`
}

const generateOrderId = () => {
  return `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

function autoAssignSupervisor(order: any, articleSupervisorMap: Record<string, string>): string {
  if (!articleSupervisorMap) return ''
  const art = (order.article || '').trim().toLowerCase()
  for (const [a, sup] of Object.entries(articleSupervisorMap)) {
    if (a.toLowerCase() === art) return sup
  }
  return ''
}

function syncMastersToOrders(db: any): number {
  let changed = 0
  if (!db.orders || !Array.isArray(db.orders)) return changed
  if (!db.articleSupervisorMap) db.articleSupervisorMap = {}
  
  for (const o of db.orders) {
    if (!o.supervisor || o.status === 'new') {
      const sup = autoAssignSupervisor(o, db.articleSupervisorMap)
      if (sup && sup !== o.supervisor) {
        o.supervisor = sup
        if (o.status === 'new') o.status = 'assigned'
        changed++
      }
    }
  }
  return changed
}

// FIX #1: Function to get supervisors list from database
function getSupervisorsList(): string[] {
  const stored = localStorage.getItem('dyeflow_db')
  if (!stored) return []
  const db = JSON.parse(stored)
  
  // Get supervisors from supervisors array
  if (db.supervisors && Array.isArray(db.supervisors)) {
    return db.supervisors.map((s: any) => s.name || s).filter(Boolean)
  }
  
  // Fallback: get unique supervisors from orders
  const supervisors = new Set<string>()
  if (db.orders && Array.isArray(db.orders)) {
    db.orders.forEach((o: any) => {
      if (o.supervisor) supervisors.add(o.supervisor)
    })
  }
  
  return Array.from(supervisors).sort()
}

export default function OrdersPage() {
  const router = useRouter()
  const [orders, setOrders] = useState<any[]>([])
  const [filteredOrders, setFilteredOrders] = useState<any[]>([])
  const [filters, setFilters] = useState<{ [key: string]: string }>({})
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [articleFilter, setArticleFilter] = useState<string>('all')
  const [columnWidths, setColumnWidths] = useState<{ [key: string]: number }>({})
  const [resizing, setResizing] = useState<{ column: string; startX: number; startWidth: number } | null>(null)
  const [searchTerm, setSearchTerm] = useState<string>('')
  const [supervisors, setSupervisors] = useState<string[]>([]) // FIX #1: Add supervisors state

  // ── Bulk selection state ──────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkAction, setBulkAction] = useState<string>('')
  const [bulkSupervisor, setBulkSupervisor] = useState<string>('')
  const [bulkStatus, setBulkStatus] = useState<string>('')
  const [bulkHoldReason, setBulkHoldReason] = useState<string>('')
  const [bulkToast, setBulkToast] = useState<string>('')
  const [showBulkModal, setShowBulkModal] = useState(false)
  
  // Modal states
  const [showModal, setShowModal] = useState<string | null>(null)
  const [selectedOrder, setSelectedOrder] = useState<any>(null)
  const [formData, setFormData] = useState<any>({})
  const [splitParts, setSplitParts] = useState<any[]>([])

  // Drag-to-reorder state
  const [dragIdx, setDragIdx]     = useState<number | null>(null)
  const [dragOver, setDragOver]   = useState<number | null>(null)
  const [priorityMode, setPriorityMode] = useState(false)
  
  const tableRef = useRef<HTMLDivElement>(null)

  const filterBarStyles = useMemo(() => ({
    container: {
      background: '#F9FAFB',
      borderRadius: '8px',
      padding: '10px 14px',
      marginBottom: '12px',
      gap: '8px',
    },
    searchInput: {
      flex: '1 1 auto',
      minWidth: '160px',
      maxWidth: '300px',
      padding: '7px 10px',
      fontSize: '12px',
    },
    dropdown: {
      flex: '0 0 auto',
      width: '120px',
      padding: '7px 10px',
      fontSize: '12px',
    },
    importButton: {
      flex: '0 0 auto',
      padding: '7px 14px',
      fontSize: '12px',
      fontWeight: 500,
    },
    addButton: {
      flex: '0 0 auto',
      padding: '7px 14px',
      fontSize: '12px',
      fontWeight: 600,
    }
  }), [])

  useEffect(() => {
    const initialWidths: { [key: string]: number } = {}
    COLUMNS.forEach(col => {
      initialWidths[col.key] = col.defaultWidth
    })
    setColumnWidths(initialWidths)
    loadData()
  }, [])

  // FIX #3: Word-based matching helper - matches if ALL filter words appear ANYWHERE in text
  const matchesWords = (text: string, filterWords: string): boolean => {
    const textLower = text.toLowerCase()
    const words = filterWords.toLowerCase().trim().split(/\s+/)
    // Every word in filter must appear somewhere in the text
    return words.every(word => textLower.includes(word))
  }

  useEffect(() => {
    let filtered = [...orders]
    
    if (searchTerm.trim()) {
      const search = searchTerm.toLowerCase()
      filtered = filtered.filter(order => 
        Object.values(order).some(val => 
          String(val || '').toLowerCase().includes(search)
        )
      )
    }
    
    if (statusFilter !== 'all') {
      filtered = filtered.filter(order => order.status === statusFilter)
    }
    
    if (articleFilter !== 'all') {
      filtered = filtered.filter(order => order.article === articleFilter)
    }
    
    // FIX #3: Updated filtering logic with word-based matching for Route Template
    Object.keys(filters).forEach(key => {
      const filterValue = filters[key].toLowerCase().trim()
      if (filterValue) {
        filtered = filtered.filter(order => {
          const value = String(order[key] || '').toLowerCase()
          
          // Use word-based matching for Route Template and Process Route
          if (key === 'routeTemplate' || key === 'processRoute') {
            return matchesWords(value, filterValue)
          }
          
          // Default substring matching for other columns
          return value.includes(filterValue)
        })
      }
    })
    
    setFilteredOrders(filtered)
    // Clear selection when filters change so stale selections don't persist
    setSelectedIds(new Set())
  }, [filters, orders, statusFilter, articleFilter, searchTerm])

  const loadData = () => {
    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return

    const db = JSON.parse(stored)
    if (!db.orders) db.orders = []

    // FIX #1: Load supervisors list
    setSupervisors(getSupervisorsList())

    const synced = syncMastersToOrders(db)
    if (synced > 0) {
      console.log(`Auto-assigned supervisors to ${synced} orders`)
    }

    db.orders = db.orders.map((order: any, index: number) => {
      const cleanedOrder = { ...order }
      Object.keys(cleanedOrder).forEach(key => {
        if (typeof cleanedOrder[key] === 'string') {
          cleanedOrder[key] = cleanedOrder[key].replace(/[◆♦�]/g, '').trim()
        }
      })
      
      const timestamp = new Date(order.timestamp || Date.now())
      const year = timestamp.getFullYear()
      const orderNum = index + 1
      const prefix = db.settings?.factory?.orderPrefix || 'DYG'
      cleanedOrder.orderNumber = cleanedOrder.orderNumber || `${prefix}-${year}-${orderNum}`
      
      return cleanedOrder
    })

    localStorage.setItem('dyeflow_db', JSON.stringify(db))

    const sorted = [...db.orders].sort((a: any, b: any) => {
      // Orders with a priority number sort first (lower = higher priority)
      const aPri = typeof a.priority === 'number' ? a.priority : Infinity
      const bPri = typeof b.priority === 'number' ? b.priority : Infinity
      if (aPri !== bPri) return aPri - bPri
      // Fall back to timestamp (newest first)
      return new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime()
    })

    setOrders(sorted)
    setFilteredOrders(sorted)
  }

  // ── DRAG-TO-REORDER helpers ───────────────────────────────────────────────

  const savePriorities = (reorderedList: any[]) => {
    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return
    const db = JSON.parse(stored)
    // Write priority index back to each order in db
    reorderedList.forEach((o: any, idx: number) => {
      const dbOrder = (db.orders || []).find((x: any) => x.id === o.id)
      if (dbOrder) dbOrder.priority = idx
    })
    localStorage.setItem('dyeflow_db', JSON.stringify(db))
    window.dispatchEvent(new Event('dyeflow-db-updated'))
  }

  const handleDragStart = (idx: number) => setDragIdx(idx)
  const handleDragEnter = (idx: number) => setDragOver(idx)

  const handleDrop = () => {
    if (dragIdx === null || dragOver === null || dragIdx === dragOver) {
      setDragIdx(null); setDragOver(null); return
    }
    const reordered = [...filteredOrders]
    const [moved] = reordered.splice(dragIdx, 1)
    reordered.splice(dragOver, 0, moved)
    setFilteredOrders(reordered)
    setOrders(prev => {
      // Merge the new order into the full list preserving unfiltered orders
      const newFull = [...prev]
      reordered.forEach((o, idx) => {
        const fi = newFull.findIndex(x => x.id === o.id)
        if (fi !== -1) newFull[fi] = { ...newFull[fi], priority: idx }
      })
      return newFull
    })
    savePriorities(reordered)
    setDragIdx(null); setDragOver(null)
  }

  // ── KEYBOARD SHORTCUT listeners (N = new order, R = refresh) ─────────

  React.useEffect(() => {
    const onNew     = () => { setFormData({}); setShowModal('new') }
    const onRefresh = () => loadData()
    window.addEventListener('dyeflow-new-order', onNew)
    window.addEventListener('dyeflow-refresh',   onRefresh)
    return () => {
      window.removeEventListener('dyeflow-new-order', onNew)
      window.removeEventListener('dyeflow-refresh',   onRefresh)
    }
  }, [])

  // ── BULK SELECTION helpers ───────────────────────────────────────────────

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const selectAll = () => setSelectedIds(new Set(filteredOrders.map(o => o.id).filter(Boolean)))
  const deselectAll = () => setSelectedIds(new Set())
  const allSelected = filteredOrders.length > 0 && filteredOrders.every(o => selectedIds.has(o.id))
  const someSelected = selectedIds.size > 0

  const showToast = (msg: string) => {
    setBulkToast(msg)
    setTimeout(() => setBulkToast(''), 3500)
  }

  const applyBulkAction = () => {
    if (!bulkAction || selectedIds.size === 0) return

    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return
    const db = JSON.parse(stored)
    const ids = Array.from(selectedIds)
    let count = 0

    if (bulkAction === 'delete') {
      // Filter out the selected orders — also remove associated faulty records
      const deletedOrderNos = new Set<string>()
      const deletedBatchIds = new Set<string>()

      // Collect order numbers and batch IDs from orders being deleted
      for (const order of (db.orders || [])) {
        if (!ids.includes(order.id)) continue
        deletedOrderNos.add(order.orderNumber)
        for (const batch of (order.splits || [])) {
          if (batch.batchId) deletedBatchIds.add(batch.batchId)
        }
      }

      // Remove the orders
      const before = (db.orders || []).length
      db.orders = (db.orders || []).filter((o: any) => !ids.includes(o.id))
      count = before - db.orders.length

      // Clean up orphaned faulty records for deleted batches
      if (db.faultyRecords) {
        db.faultyRecords = db.faultyRecords.filter(
          (r: any) => !deletedBatchIds.has(r.batchId)
        )
      }

      // Clean up orphaned repairing orders for deleted batches
      if (db.repairingOrders) {
        db.repairingOrders = db.repairingOrders.filter(
          (r: any) => !deletedBatchIds.has(r.batchId)
        )
      }

      // Clean up audit log entries for deleted orders (optional — keeps log cleaner)
      // Note: we keep audit entries so there is an audit trail that something was deleted
      // Audit entries are left intentionally

      localStorage.setItem('dyeflow_db', JSON.stringify(db))
      window.dispatchEvent(new Event('dyeflow-db-updated'))
      loadData()
      setShowBulkModal(false)
      deselectAll()
      setBulkAction('')
      showToast(`✓ ${count} order${count !== 1 ? 's' : ''} deleted permanently`)
      return
    }

    for (const order of (db.orders || [])) {
      if (!ids.includes(order.id)) continue

      if (bulkAction === 'assign') {
        if (!bulkSupervisor) continue
        order.supervisor = bulkSupervisor
        if (order.status === 'new') order.status = 'assigned'
        count++
      } else if (bulkAction === 'status') {
        if (!bulkStatus) continue
        order.status = bulkStatus
        count++
      } else if (bulkAction === 'hold') {
        order.status = 'hold'
        order.holdApproval = 'Hold'
        if (bulkHoldReason) order.holdReason = bulkHoldReason
        count++
      } else if (bulkAction === 'unhold') {
        if (order.status === 'hold') {
          order.status = order.supervisor ? 'assigned' : 'new'
          order.holdApproval = ''
          order.holdReason = ''
          count++
        }
      }
    }

    localStorage.setItem('dyeflow_db', JSON.stringify(db))
    window.dispatchEvent(new Event('dyeflow-db-updated'))
    loadData()
    setShowBulkModal(false)
    deselectAll()
    setBulkAction('')
    setBulkSupervisor('')
    setBulkStatus('')
    setBulkHoldReason('')
    showToast(`✓ ${count} order${count !== 1 ? 's' : ''} updated successfully`)
  }

  const handleFilterChange = (column: string, value: string) => {
    setFilters(prev => ({
      ...prev,
      [column]: value
    }))
  }

  const startResize = (column: string, e: React.MouseEvent) => {
    e.preventDefault()
    setResizing({
      column,
      startX: e.pageX,
      startWidth: columnWidths[column] || 100
    })
  }

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!resizing) return
      const diff = e.pageX - resizing.startX
      const newWidth = Math.max(50, resizing.startWidth + diff)
      setColumnWidths(prev => ({
        ...prev,
        [resizing.column]: newWidth
      }))
    }

    const handleMouseUp = () => {
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

  const getUniqueStatuses = () => {
    const statuses = new Set(orders.map(o => o.status).filter(Boolean))
    return Array.from(statuses)
  }

  const getUniqueArticles = () => {
    const articles = new Set(orders.map(o => o.article).filter(Boolean))
    return Array.from(articles).sort()
  }

  // Modal handlers
  const openNewOrderModal = () => {
    const stored = localStorage.getItem('dyeflow_db')
    const db = stored ? JSON.parse(stored) : { orders: [] }
    const year = new Date().getFullYear()
    const orderNum = db.orders.length + 1
    const prefix = db.settings?.factory?.orderPrefix || 'DYG'
    
    setFormData({
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
      qtyKg: '',
      qtyMtr: '',
      noOfTaka: '',
      typeOfFinish: '',
      typeOfPacking: '',
      holdApproval: '',
      holdReason: '',
      remarks: '',
      orderNumber: `${prefix}-${year}-${orderNum}`
    })
    setShowModal('new')
  }

  const openEditModal = (orderId: string) => {
    const order = orders.find(o => o.id === orderId)
    if (!order) return
    setSelectedOrder(order)
    setFormData({ ...order })
    setShowModal('edit')
  }

  const openViewModal = (orderId: string) => {
    const order = orders.find(o => o.id === orderId)
    if (!order) return
    setSelectedOrder(order)
    setShowModal('view')
  }

  const openAssignModal = (orderId: string) => {
    const order = orders.find(o => o.id === orderId)
    if (!order) return
    setSelectedOrder(order)
    setShowModal('assign')
  }

  const openChangeSupervisorModal = (orderId: string) => {
    const order = orders.find(o => o.id === orderId)
    if (!order) return
    setSelectedOrder(order)
    setShowModal('changeSupervisor')
  }

  const openSplitModal = (orderId: string) => {
    const order = orders.find(o => o.id === orderId)
    if (!order) return
    setSelectedOrder(order)
    
    const existing = order.splits && order.splits.length > 0 ? order.splits : []
    setSplitParts(existing.length > 0
      ? existing.map((s: any) => ({ kg: s.kg, mtr: s.mtr || 0, taka: s.taka || 0 }))
      : [{ kg: order.qtyKg, mtr: order.qtyMtr, taka: order.noOfTaka }]
    )
    setShowModal('split')
  }

  const saveOrder = () => {
    const stored = localStorage.getItem('dyeflow_db')
    const db = stored ? JSON.parse(stored) : { orders: [], articleSupervisorMap: {} }
    
    if (formData.holdApproval === 'Hold' && !formData.holdReason) {
      alert('Please enter hold remark.')
      return
    }

    if (showModal === 'new') {
      const newOrder = {
        id: generateOrderId(),
        timestamp: formatDateTime(new Date()),
        ...formData,
        qtyKg: parseInt(formData.qtyKg) || 0,
        qtyMtr: parseInt(formData.qtyMtr) || 0,
        noOfTaka: parseInt(formData.noOfTaka) || 0,
        status: formData.holdApproval === 'Hold' ? 'hold' : 'new',
        supervisor: '',
        processRoute: [],
        machine: '',
        splits: [],
        supervisorConfirmed: false,
        supervisorConfirmedAt: ''
      }
      db.orders.push(newOrder)
      logAudit({
        action: 'create',
        entityType: 'order',
        entityId: newOrder.orderNumber,
        newValue: `${newOrder.party} · ${newOrder.article} · ${newOrder.qtyKg}Kg`,
        note: `New order created`
      })
    } else if (showModal === 'edit' && selectedOrder) {
      const orderIndex = db.orders.findIndex((o: any) => o.id === selectedOrder.id)
      if (orderIndex !== -1) {
        db.orders[orderIndex] = {
          ...db.orders[orderIndex],
          ...formData,
          qtyKg: parseInt(formData.qtyKg) || 0,
          qtyMtr: parseInt(formData.qtyMtr) || 0,
          noOfTaka: parseInt(formData.noOfTaka) || 0
        }
        logAudit({
          action: 'edit',
          entityType: 'order',
          entityId: selectedOrder.orderNumber,
          note: 'Order details edited'
        })
      }
    }

    localStorage.setItem('dyeflow_db', JSON.stringify(db))
    setShowModal(null)
    setSelectedOrder(null)
    loadData()
  }

  // FIX #2: Article-supervisor mapping is already implemented here
  const assignSupervisor = (supervisor: string, updateArticleMap: boolean = true) => {
    if (!supervisor || !selectedOrder) {
      alert('Please select a supervisor.')
      return
    }

    const stored = localStorage.getItem('dyeflow_db')
    const db = stored ? JSON.parse(stored) : { orders: [], articleSupervisorMap: {}, supervisors: [] }
    
    const orderIndex = db.orders.findIndex((o: any) => o.id === selectedOrder.id)
    if (orderIndex !== -1) {
      db.orders[orderIndex].supervisor = supervisor
      db.orders[orderIndex].status = 'assigned'
      db.orders[orderIndex].supervisorConfirmed = false
      
      // FIX #2: Update article-supervisor map (already implemented)
      if (updateArticleMap && db.orders[orderIndex].article) {
        db.articleSupervisorMap[db.orders[orderIndex].article] = supervisor
        console.log(`Saved article-supervisor mapping: ${db.orders[orderIndex].article} -> ${supervisor}`)
      }

      logAudit({
        action: 'assign',
        entityType: 'order',
        entityId: db.orders[orderIndex].orderNumber,
        field: 'supervisor',
        oldValue: db.orders[orderIndex].supervisor || 'none',
        newValue: supervisor,
        note: 'Supervisor assigned'
      })
    }

    localStorage.setItem('dyeflow_db', JSON.stringify(db))
    setShowModal(null)
    setSelectedOrder(null)
    loadData()
    
    // FIX #4: Stay on Orders page instead of redirecting to supervisor sheet
    // router.push(`/supervisor/${supervisor}`)
  }

  const changeSupervisor = (supervisor: string, updateArticleMap: boolean) => {
    if (!supervisor || !selectedOrder) {
      alert('Please select a supervisor.')
      return
    }

    if (selectedOrder.supervisor === supervisor) {
      alert('Please select a different supervisor.')
      return
    }

    if (!confirm('Change supervisor and delete all existing split / machine / FMS / Date Calculator batch data for this order?')) {
      return
    }

    const stored = localStorage.getItem('dyeflow_db')
    const db = stored ? JSON.parse(stored) : { orders: [], articleSupervisorMap: {} }
    
    const orderIndex = db.orders.findIndex((o: any) => o.id === selectedOrder.id)
    if (orderIndex !== -1) {
      const order = db.orders[orderIndex]
      order.supervisor = supervisor
      order.status = 'assigned'
      order.processRoute = []
      order.processMachines = {}
      order.routeTemplateName = ''
      order.machine = ''
      order.splits = []
      order.supervisorConfirmed = false
      order.supervisorConfirmedAt = ''
      order.actualDates = {}
      order.plannedDates = {}
      
      if (updateArticleMap && order.article) {
        db.articleSupervisorMap[order.article] = supervisor
      }
    }

    localStorage.setItem('dyeflow_db', JSON.stringify(db))
    setShowModal(null)
    setSelectedOrder(null)
    loadData()
    
    // FIX #4: Stay on Orders page instead of redirecting to supervisor sheet
    // router.push(`/supervisor/${supervisor}`)
  }

  const saveSplits = () => {
    if (!selectedOrder) return

    const totalKg = splitParts.reduce((sum, p) => sum + (parseFloat(p.kg) || 0), 0)
    const remainingKg = selectedOrder.qtyKg - totalKg

    if (Math.abs(remainingKg) >= 0.5) {
      if (!confirm(`Remaining ${remainingKg.toFixed(1)} Kg. Save anyway?`)) return
    }

    const stored = localStorage.getItem('dyeflow_db')
    const db = stored ? JSON.parse(stored) : { orders: [] }
    
    const orderIndex = db.orders.findIndex((o: any) => o.id === selectedOrder.id)
    if (orderIndex !== -1) {
      const batches = splitParts.map((part, idx) => ({
        batchId: `${selectedOrder.orderNumber}-B${idx + 1}`,
        kg: parseFloat(part.kg) || 0,
        mtr: parseFloat(part.mtr) || 0,
        taka: parseFloat(part.taka) || 0,
        status: 'new',
        currentProcess: '',
        date: '',
        planNumbers: {},
        dateCalcPlan: {},
        fmsDispatch: {},
        fmsForceSend: {},
        fmsActualDates: {},
        fmsEnterAt: {},
        fmsActiveProcesses: {},
        fmsFaulty: { active: false, processCode: '', flaggedAt: '', note: '' },
        fmsCurrentProcess: '',
        fmsDone: false,
        holdReason: '',
        planNumberRuns: {}
      }))
      
      db.orders[orderIndex].splits = batches
      db.orders[orderIndex].status = 'splitting'
    }

    localStorage.setItem('dyeflow_db', JSON.stringify(db))
    setShowModal(null)
    setSelectedOrder(null)
    setSplitParts([])
    loadData()
  }

  const fullSplitOrder = (orderId: string) => {
    const order = orders.find(o => o.id === orderId)
    if (!order) return

    const existingSplitKg = (order.splits || []).reduce((sum: number, b: any) => 
      sum + (parseFloat(b.kg) || 0), 0
    )
    const remainingKg = order.qtyKg - existingSplitKg

    if (remainingKg <= 0) {
      alert('Order is already fully split')
      return
    }

    const existingSplitMtr = (order.splits || []).reduce((sum: number, b: any) => 
      sum + (parseFloat(b.mtr) || 0), 0
    )
    const remainingMtr = order.qtyMtr - existingSplitMtr

    const existingSplitTaka = (order.splits || []).reduce((sum: number, b: any) => 
      sum + (parseFloat(b.taka) || 0), 0
    )
    const remainingTaka = order.noOfTaka - existingSplitTaka

    const stored = localStorage.getItem('dyeflow_db')
    const db = stored ? JSON.parse(stored) : { orders: [] }
    
    const orderIndex = db.orders.findIndex((o: any) => o.id === orderId)
    if (orderIndex !== -1) {
      const batchNum = (db.orders[orderIndex].splits || []).length + 1
      const newBatch = {
        batchId: `${order.orderNumber}-B${batchNum}`,
        kg: remainingKg,
        mtr: remainingMtr,
        taka: remainingTaka,
        status: 'new',
        currentProcess: '',
        date: ''
      }
      
      if (!db.orders[orderIndex].splits) db.orders[orderIndex].splits = []
      db.orders[orderIndex].splits.push(newBatch)
      db.orders[orderIndex].status = 'splitting'
    }

    localStorage.setItem('dyeflow_db', JSON.stringify(db))
    loadData()
  }

  return (
    <div className="content" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 40px)', padding: '20px', gap: 0 }}>
      {/* Filter Bar */}
      <div style={{
        ...filterBarStyles.container,
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'nowrap',
        flexShrink: 0,
        border: '1px solid #E5E7EB'
      }}>
        <input
          type="text"
          placeholder="Search by order no., party, article, color..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{
            ...filterBarStyles.searchInput,
            border: '1px solid #D1D5DB',
            borderRadius: '5px',
            outline: 'none'
          }}
        />
        
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{
            ...filterBarStyles.dropdown,
            border: '1px solid #D1D5DB',
            borderRadius: '5px',
            background: 'white',
            cursor: 'pointer'
          }}
        >
          <option value="all">All Status</option>
          <option value="new">New</option>
          <option value="assigned">Assigned</option>
          <option value="splitting">Split & Planned</option>
          <option value="in-process">In Process</option>
          <option value="done">Done</option>
          <option value="hold">On Hold</option>
        </select>

        <select
          value={articleFilter}
          onChange={(e) => setArticleFilter(e.target.value)}
          style={{
            ...filterBarStyles.dropdown,
            border: '1px solid #D1D5DB',
            borderRadius: '5px',
            background: 'white',
            cursor: 'pointer'
          }}
        >
          <option value="all">All Articles</option>
          {getUniqueArticles().map(article => (
            <option key={article} value={article}>{article}</option>
          ))}
        </select>

        <button
          onClick={() => router.push('/import')}
          style={{
            ...filterBarStyles.importButton,
            border: '1px solid #D1D5DB',
            borderRadius: '5px',
            background: 'white',
            color: '#374151',
            cursor: 'pointer'
          }}
        >
          📄 Import Excel
        </button>

        <button
          onClick={openNewOrderModal}
          style={{
            ...filterBarStyles.addButton,
            border: 'none',
            borderRadius: '5px',
            background: '#3B82F6',
            color: 'white',
            cursor: 'pointer'
          }}
        >
          + New Order
        </button>

        {/* Priority Drag-Drop toggle */}
        <button
          onClick={() => setPriorityMode(m => !m)}
          title={priorityMode ? 'Exit priority mode' : 'Enable drag-to-reorder priority mode'}
          style={{
            ...filterBarStyles.addButton,
            border: `1px solid ${priorityMode ? '#7C3AED' : '#D1D5DB'}`,
            borderRadius: '5px',
            background: priorityMode ? '#EDE9FE' : 'white',
            color: priorityMode ? '#7C3AED' : '#374151',
            fontWeight: priorityMode ? 700 : 500,
            cursor: 'pointer',
          }}
        >
          {priorityMode ? '✔ Priority Mode' : '↕ Set Priority'}
        </button>
      </div>

      {/* ── Bulk Toast ── */}
      {bulkToast && (
        <div style={{
          flexShrink: 0,
          background: '#D1FAE5', color: '#065F46',
          border: '1px solid #6EE7B7', borderRadius: 8,
          padding: '10px 16px', marginBottom: 8,
          fontSize: 13, fontWeight: 600,
          display: 'flex', alignItems: 'center', gap: 8
        }}>
          ✓ {bulkToast}
        </div>
      )}

      {/* ── Bulk Action Bar — appears when ≥1 rows selected ── */}
      {someSelected && (
        <div style={{
          flexShrink: 0,
          background: '#EFF6FF',
          border: '1px solid #BFDBFE',
          borderRadius: 8,
          padding: '8px 14px',
          marginBottom: 8,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          flexWrap: 'wrap',
        }}>
          {/* Count + clear */}
          <span style={{ fontSize: 13, fontWeight: 700, color: '#185FA5', flexShrink: 0 }}>
            {selectedIds.size} selected
          </span>
          <button
            onClick={deselectAll}
            style={{ fontSize: 11, padding: '3px 8px', border: '1px solid #BFDBFE', borderRadius: 4, background: 'white', cursor: 'pointer', color: '#185FA5' }}
          >
            Clear
          </button>
          <button
            onClick={allSelected ? deselectAll : selectAll}
            style={{ fontSize: 11, padding: '3px 8px', border: '1px solid #BFDBFE', borderRadius: 4, background: 'white', cursor: 'pointer', color: '#185FA5' }}
          >
            {allSelected ? 'Deselect All' : `Select All ${filteredOrders.length}`}
          </button>

          <div style={{ width: 1, height: 24, background: '#BFDBFE', margin: '0 4px' }} />

          {/* Quick action buttons */}
          <button
            onClick={() => { setBulkAction('assign'); setShowBulkModal(true) }}
            style={{ fontSize: 12, fontWeight: 600, padding: '5px 12px', border: 'none', borderRadius: 5, background: '#185FA5', color: 'white', cursor: 'pointer' }}
          >
            👤 Assign Supervisor
          </button>
          <button
            onClick={() => { setBulkAction('status'); setShowBulkModal(true) }}
            style={{ fontSize: 12, fontWeight: 600, padding: '5px 12px', border: '1px solid #D1D5DB', borderRadius: 5, background: 'white', color: '#374151', cursor: 'pointer' }}
          >
            📦 Change Status
          </button>
          <button
            onClick={() => { setBulkAction('hold'); setShowBulkModal(true) }}
            style={{ fontSize: 12, fontWeight: 600, padding: '5px 12px', border: '1px solid #FCA5A5', borderRadius: 5, background: '#FEF2F2', color: '#DC2626', cursor: 'pointer' }}
          >
            ⏸ Put on Hold
          </button>
          <button
            onClick={() => {
              // Release Hold is instant — no modal needed
              const stored = localStorage.getItem('dyeflow_db')
              if (!stored) return
              const db = JSON.parse(stored)
              const ids = Array.from(selectedIds)
              let count = 0
              for (const order of (db.orders || [])) {
                if (!ids.includes(order.id) || order.status !== 'hold') continue
                order.status = order.supervisor ? 'assigned' : 'new'
                order.holdApproval = ''
                order.holdReason = ''
                count++
              }
              localStorage.setItem('dyeflow_db', JSON.stringify(db))
              window.dispatchEvent(new Event('dyeflow-db-updated'))
              loadData()
              deselectAll()
              showToast(`✓ ${count} order${count !== 1 ? 's' : ''} released from hold`)
            }}
            style={{ fontSize: 12, fontWeight: 600, padding: '5px 12px', border: '1px solid #A7F3D0', borderRadius: 5, background: '#ECFDF5', color: '#059669', cursor: 'pointer' }}
          >
            ✅ Release Hold
          </button>

          <div style={{ width: 1, height: 24, background: '#BFDBFE', margin: '0 4px' }} />

          {/* Delete — separated with a divider, visually distinct danger action */}
          <button
            onClick={() => { setBulkAction('delete'); setShowBulkModal(true) }}
            style={{ fontSize: 12, fontWeight: 600, padding: '5px 12px', border: '1px solid #FCA5A5', borderRadius: 5, background: '#FEF2F2', color: '#DC2626', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}
          >
            🗑 Delete Orders
          </button>
        </div>
      )}

      {/* Table Container */}
      <div style={{
        background: 'white',
        borderRadius: '8px',
        border: '1px solid #E5E7EB',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minHeight: 0
      }}>
        <div 
          ref={tableRef}
          style={{
            flex: 1,
            overflow: 'auto'
          }}
        >
          <table style={{
            width: '100%',
            borderCollapse: 'collapse',
            tableLayout: 'fixed'
          }}>
            <thead style={{
              position: 'sticky',
              top: 0,
              zIndex: 10,
              background: 'white'
            }}>
              {/* Filter row */}
              <tr style={{ background: '#F9FAFB' }}>
                {/* Checkbox column — filter row cell */}
                <th style={{ width: 40, minWidth: 40, maxWidth: 40, padding: '8px 6px', borderBottom: '1px solid #E5E7EB', borderRight: '1px solid #E5E7EB', textAlign: 'center', background: '#F9FAFB' }}>
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={el => { if (el) el.indeterminate = someSelected && !allSelected }}
                    onChange={() => allSelected ? deselectAll() : selectAll()}
                    style={{ width: 14, height: 14, cursor: 'pointer', accentColor: '#185FA5' }}
                    title={allSelected ? 'Deselect all' : 'Select all visible'}
                  />
                </th>
                {COLUMNS.map(col => (
                  <th
                    key={`filter-${col.key}`}
                    style={{
                      padding: '8px 10px',
                      borderBottom: '1px solid #E5E7EB',
                      borderRight: '1px solid #E5E7EB',
                      width: `${columnWidths[col.key]}px`,
                      minWidth: `${columnWidths[col.key]}px`,
                      maxWidth: `${columnWidths[col.key]}px`
                    }}
                  >
                    {col.key !== 'actions' && (
                      <input
                        type="text"
                        placeholder="Filter..."
                        value={filters[col.key] || ''}
                        onChange={(e) => handleFilterChange(col.key, e.target.value)}
                        style={{
                          width: '100%',
                          padding: '4px 6px',
                          border: '1px solid #D1D5DB',
                          borderRadius: '4px',
                          fontSize: '11px',
                          outline: 'none'
                        }}
                      />
                    )}
                  </th>
                ))}
              </tr>
              
              <tr style={{ background: '#F9FAFB' }}>
                {/* Checkbox column — label header */}
                <th style={{ width: 40, minWidth: 40, maxWidth: 40, padding: '10px 6px', textAlign: 'center', fontSize: 10, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '2px solid #E5E7EB', borderRight: '1px solid #E5E7EB', background: '#F9FAFB' }}>
                  #
                </th>
                {COLUMNS.map(col => (
                  <th
                    key={col.key}
                    style={{
                      padding: '10px 14px',
                      textAlign: 'left',
                      fontSize: '10px',
                      fontWeight: 700,
                      color: '#6B7280',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                      borderBottom: '2px solid #E5E7EB',
                      borderRight: '1px solid #E5E7EB',
                      width: `${columnWidths[col.key]}px`,
                      minWidth: `${columnWidths[col.key]}px`,
                      maxWidth: `${columnWidths[col.key]}px`,
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
                    />
                  </th>
                ))}
              </tr>
            </thead>
            
            <tbody>
              {filteredOrders.length === 0 ? (
                <tr>
                  <td
                    colSpan={COLUMNS.length}
                    style={{
                      padding: '48px',
                      textAlign: 'center',
                      color: '#9CA3AF',
                      fontSize: '14px'
                    }}
                  >
                    {orders.length === 0 
                      ? 'No orders yet. Click "Import" or "+ New Order" to get started.'
                      : 'No orders match your filters.'}
                  </td>
                </tr>
              ) : (
                filteredOrders.map((order, idx) => (
                  <tr
                    key={order.id || idx}
                    draggable={priorityMode}
                    onDragStart={priorityMode ? () => handleDragStart(idx) : undefined}
                    onDragEnter={priorityMode ? () => handleDragEnter(idx) : undefined}
                    onDragOver={priorityMode ? e => e.preventDefault() : undefined}
                    onDrop={priorityMode ? handleDrop : undefined}
                    onDragEnd={priorityMode ? () => { setDragIdx(null); setDragOver(null) } : undefined}
                    style={{
                      background: selectedIds.has(order.id)
                        ? '#EFF6FF'
                        : dragOver === idx && dragIdx !== idx
                        ? '#F5F3FF'
                        : idx % 2 === 0 ? 'white' : '#FAFAFA',
                      borderBottom: '1px solid #F3F4F6',
                      outline: dragOver === idx && dragIdx !== idx ? '2px solid #7C3AED' : 'none',
                      opacity: dragIdx === idx ? 0.4 : 1,
                      cursor: priorityMode ? 'grab' : 'default',
                      transition: 'background 0.1s',
                    }}
                  >
                    {/* ─ Checkbox cell ─ */}
                    <td
                      style={{ width: 40, minWidth: 40, maxWidth: 40, padding: '8px 6px', textAlign: 'center', borderBottom: '1px solid #F3F4F6', borderRight: '1px solid #E5E7EB' }}
                      onClick={e => { e.stopPropagation(); toggleSelect(order.id) }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedIds.has(order.id)}
                        onChange={() => toggleSelect(order.id)}
                        style={{ width: 14, height: 14, cursor: 'pointer', accentColor: '#185FA5' }}
                      />
                    </td>
                    <td style={{ ...cellStyle, width: `${columnWidths.timestamp}px`, fontSize: '11px', color: '#9CA3AF', whiteSpace: 'nowrap' }}>
                      {order.timestamp || '-'}
                    </td>
                    <td style={{ ...cellStyle, width: `${columnWidths.orderNumber}px`, fontWeight: 700, color: '#2563EB' }}>
                      {order.orderNumber || '-'}
                    </td>
                    <td style={{ ...cellStyle, width: `${columnWidths.party}px` }}>
                      {order.party ? (
                        <a href={`/party/${encodeURIComponent(order.party)}`} style={{ color: 'var(--text-primary)', textDecoration: 'none', fontWeight: 500 }}
                          title="View party history"
                          onMouseEnter={e => { (e.target as HTMLElement).style.color = 'var(--accent)' }}
                          onMouseLeave={e => { (e.target as HTMLElement).style.color = 'var(--text-primary)' }}>
                          {order.party}
                        </a>
                      ) : '-'}
                    </td>
                    <td style={{ ...cellStyle, width: `${columnWidths.subParty}px`, color: '#6B7280' }}>
                      {order.subParty || order.subparty || '-'}
                    </td>
                    <td style={{ ...cellStyle, width: `${columnWidths.salesPerson}px` }}>
                      {order.salesPerson || order.salesperson || '-'}
                    </td>
                    <td style={{ ...cellStyle, width: `${columnWidths.article}px`, fontWeight: 500 }}>
                      {order.article || '-'}
                    </td>
                    <td style={{ ...cellStyle, width: `${columnWidths.blend}px`, fontSize: '11px', color: '#6B7280' }}>
                      {order.blend || '-'}
                    </td>
                    <td style={{ ...cellStyle, width: `${columnWidths.width}px` }}>
                      {order.width || '-'}
                    </td>
                    <td style={{ ...cellStyle, width: `${columnWidths.gsm}px` }}>
                      {order.gsm || '-'}
                    </td>
                    <td style={{ ...cellStyle, width: `${columnWidths.color}px` }}>
                      {order.color || '-'}
                    </td>
                    <td style={{ ...cellStyle, width: `${columnWidths.labNo}px`, fontSize: '11px' }}>
                      {order.labNo || order.labno || '-'}
                      {(order.labNo || order.labno) && (() => {
                        const raw = localStorage.getItem('dyeflow_db')
                        const db = raw ? JSON.parse(raw) : {}
                        const recipes: any[] = db.labRecipes || []
                        const hasRecipe = recipes.some((r: any) =>
                          (r.labRequestNo || r.id) === (order.labNo || order.labno)
                        )
                        return hasRecipe ? (
                          <a href="/lab/receipe" title="View Lab Recipe" style={{ marginLeft: 4, fontSize: 10, color: 'var(--accent)', textDecoration: 'none' }}>🔬</a>
                        ) : null
                      })()}
                    </td>
                    <td style={{ ...cellStyle, width: `${columnWidths.lotNo}px`, fontSize: '11px' }}>
                      {order.lotNo || order.lotno || '-'}
                    </td>
                    <td style={{ ...cellStyle, width: `${columnWidths.challanNo}px`, fontSize: '11px' }}>
                      {order.challanNo || order.challannumber || '-'}
                    </td>
                    <td style={{ ...cellStyle, width: `${columnWidths.qtyKg}px`, fontWeight: 600 }}>
                      {order.qtyKg || order.qtykg || '-'}
                    </td>
                    <td style={{ ...cellStyle, width: `${columnWidths.qtyMtr}px` }}>
                      {order.qtyMtr || order.qtymtr || '-'}
                    </td>
                    <td style={{ ...cellStyle, width: `${columnWidths.noOfTaka}px` }}>
                      {order.noOfTaka || order.nooftaka || '-'}
                    </td>
                    <td style={{ ...cellStyle, width: `${columnWidths.typeOfFinish}px` }}>
                      {order.typeOfFinish || order.typeoffinish || '-'}
                    </td>
                    <td style={{ ...cellStyle, width: `${columnWidths.typeOfPacking}px` }}>
                      {order.typeOfPacking || order.typeofpacking || '-'}
                    </td>
                    <td style={{ ...cellStyle, width: `${columnWidths.remarks}px`, maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis' }} title={order.remarks || ''}>
                      {order.remarks || '-'}
                    </td>
                    <td style={{ ...cellStyle, width: `${columnWidths.holdApproval}px` }}>
                      {order.holdApproval === 'Hold' ? (
                        <span style={{
                          padding: '4px 10px',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: 600,
                          background: '#FEE2E2',
                          color: '#991B1B'
                        }} title={order.holdReason || ''}>
                          Hold
                        </span>
                      ) : order.holdApproval === '1st Batch Approval' ? (
                        <span style={{
                          padding: '4px 10px',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: 600,
                          background: '#FEF3C7',
                          color: '#92400E'
                        }}>
                          1st Batch Approval
                        </span>
                      ) : '-'}
                    </td>
                    <td style={{ ...cellStyle, width: `${columnWidths.holdReason}px`, maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis' }} title={order.holdReason || ''}>
                      {order.holdReason || '-'}
                    </td>
                    <td style={{ ...cellStyle, width: `${columnWidths.supervisor}px` }}>
                      {order.supervisor || '-'}
                    </td>
                    
                    <td style={{ ...cellStyle, width: `${columnWidths.routeTemplate}px` }}>
                      {order.routeTemplateName && (
                        <span style={{
                          background: '#DBEAFE',
                          color: '#1E40AF',
                          padding: '2px 8px',
                          borderRadius: '20px',
                          fontSize: '11px',
                          fontWeight: 600
                        }}>
                          {order.routeTemplateName}
                        </span>
                      )}
                    </td>
                    
                    <td style={{ ...cellStyle, width: `${columnWidths.processRoute}px` }}>
                      {order.supervisorConfirmed && order.processRoute && order.processRoute.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px', alignItems: 'center' }}>
                          {order.processRoute.map((code: string, idx: number) => {
                            const proc = getProcObj(code) || { code, name: code, full: code }
                            return (
                              <span key={idx} style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                                <span
                                  title={proc.full || proc.name}
                                  style={{
                                    background: '#DBEAFE',
                                    color: '#1E40AF',
                                    padding: '2px 6px',
                                    borderRadius: '4px',
                                    fontSize: '11px',
                                    fontWeight: 600
                                  }}
                                >
                                  {proc.name}
                                </span>
                                {idx < order.processRoute.length - 1 && (
                                  <span style={{ color: '#9CA3AF', fontSize: '11px', fontWeight: 600 }}>→</span>
                                )}
                              </span>
                            )
                          })}
                        </div>
                      )}
                    </td>
                    
                    <td style={{ ...cellStyle, width: `${columnWidths.machine}px` }}>
                      {order.supervisorConfirmed && order.machine && (
                        <span style={{
                          background: '#E9D5FF',
                          color: '#6B21A8',
                          padding: '3px 9px',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: 600
                        }}>
                          {getMachineName(order.machine)}
                        </span>
                      )}
                    </td>
                    
                    <td style={{ ...cellStyle, width: `${columnWidths.status}px` }}>
                      {getStatusBadge(order.status || 'new')}
                    </td>
                    
                    {/* Actions Column */}
                    <td style={{ ...cellStyle, width: `${columnWidths.actions}px` }}>
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center' }}>
                        {/* Drag handle — only visible in priority mode */}
                        {priorityMode && (
                          <span
                            title="Drag to reorder priority"
                            style={{ cursor: 'grab', fontSize: 16, color: '#7C3AED', flexShrink: 0, padding: '0 4px', userSelect: 'none', lineHeight: 1 }}
                          >
                            ⠿
                          </span>
                        )}
                        {/* Priority badge */}
                        {typeof order.priority === 'number' && (
                          <span style={{ fontSize: 10, fontWeight: 700, background: '#EDE9FE', color: '#7C3AED', padding: '2px 7px', borderRadius: 10, flexShrink: 0 }}>
                            #{order.priority + 1}
                          </span>
                        )}
                        <button onClick={() => openViewModal(order.id)} style={btnStyle}>
                          View
                        </button>
                        <button onClick={() => openEditModal(order.id)} style={btnStyle}>
                          Edit
                        </button>
                        
                        {(!order.supervisor || order.status === 'new') && (
                          <button onClick={() => openAssignModal(order.id)} style={btnPrimaryStyle}>
                            Assign
                          </button>
                        )}
                        
                        {order.supervisor && (
                          <button onClick={() => openChangeSupervisorModal(order.id)} style={btnStyle}>
                            Change Supervisor
                          </button>
                        )}
                        
                        {order.supervisorConfirmed && order.processRoute && order.processRoute.length > 0 && order.machine && (() => {
                          const { splitKg, fullySplit, partiallySplit } = getSplitStatus(order)
                          
                          if (fullySplit) {
                            return (
                              <button disabled style={btnDisabledStyle} title={`Fully split (${splitKg} Kg)`}>
                                Split ✓
                              </button>
                            )
                          }
                          
                          return (
                            <>
                              <button 
                                onClick={() => openSplitModal(order.id)} 
                                style={btnPrimaryStyle}
                                title={partiallySplit ? `Partially split (${splitKg} / ${order.qtyKg} Kg)` : 'Split order into batches'}
                              >
                                {partiallySplit ? 'Re-Split' : 'Split'}
                              </button>
                              <button 
                                onClick={() => fullSplitOrder(order.id)} 
                                style={btnStyle}
                                title="Create one batch for remaining qty"
                              >
                                Full Split
                              </button>
                            </>
                          )
                        })()}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals */}
      {showModal === 'new' && <NewOrderModal />}
      {showModal === 'edit' && <EditOrderModal />}
      {showModal === 'view' && <ViewOrderModal />}
      {showModal === 'assign' && <AssignSupervisorModal />}
      {showModal === 'changeSupervisor' && <ChangeSupervisorModal />}
      {showModal === 'split' && <SplitOrderModal />}

      {/* ── Bulk Action Modal ── */}
      {showBulkModal && (
        <div className="modal-overlay" onClick={() => setShowBulkModal(false)}>
          <div className="modal" style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">
                {bulkAction === 'assign' && '👤 Assign Supervisor'}
                {bulkAction === 'status' && '📦 Change Status'}
                {bulkAction === 'hold'   && '⏸ Put on Hold'}
                {bulkAction === 'delete' && '🗑 Delete Orders'}
              </span>
              <button className="small" onClick={() => setShowBulkModal(false)}>✕</button>
            </div>

            {/* Summary */}
            <div style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13 }}>
              <span style={{ fontWeight: 700, color: bulkAction === 'delete' ? '#DC2626' : 'var(--accent)' }}>{selectedIds.size} order{selectedIds.size !== 1 ? 's' : ''}</span>
              <span style={{ color: 'var(--text-secondary)' }}>{bulkAction === 'delete' ? ' will be permanently deleted' : ' selected will be updated'}</span>
            </div>

            {/* Assign Supervisor */}
            {bulkAction === 'assign' && (
              <div className="form-group" style={{ marginBottom: 16 }}>
                <label>Select Supervisor *</label>
                <select value={bulkSupervisor} onChange={e => setBulkSupervisor(e.target.value)}>
                  <option value="">— Choose supervisor —</option>
                  {supervisors.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
                  Orders that are ‘new’ will be moved to ‘assigned’ status automatically.
                </div>
              </div>
            )}

            {/* Change Status */}
            {bulkAction === 'status' && (
              <div className="form-group" style={{ marginBottom: 16 }}>
                <label>New Status *</label>
                <select value={bulkStatus} onChange={e => setBulkStatus(e.target.value)}>
                  <option value="">— Choose status —</option>
                  <option value="new">New</option>
                  <option value="assigned">Assigned</option>
                  <option value="splitting">Split &amp; Planned</option>
                  <option value="in-process">In Process</option>
                  <option value="done">Done</option>
                  <option value="hold">On Hold</option>
                </select>
              </div>
            )}

            {/* Put on Hold */}
            {bulkAction === 'hold' && (
              <div className="form-group" style={{ marginBottom: 16 }}>
                <label>Hold Reason (optional)</label>
                <textarea
                  value={bulkHoldReason}
                  onChange={e => setBulkHoldReason(e.target.value)}
                  placeholder="e.g. Shade approval pending from customer"
                  rows={3}
                />
              </div>
            )}

            {/* Delete confirmation */}
            {bulkAction === 'delete' && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 8, padding: '12px 14px', marginBottom: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#DC2626', marginBottom: 4 }}>⚠️ This action cannot be undone</div>
                  <div style={{ fontSize: 12, color: '#7F1D1D', lineHeight: 1.6 }}>
                    Deleting an order will permanently remove:
                    <ul style={{ margin: '6px 0 0 16px', padding: 0 }}>
                      <li>The order and all its details</li>
                      <li>All split batches and FMS records</li>
                      <li>All Date Calculator planned dates for this order</li>
                      <li>All audit log entries for this order</li>
                    </ul>
                  </div>
                </div>

                {/* Show list of orders to be deleted */}
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                  Orders that will be deleted:
                </div>
                <div style={{ maxHeight: 180, overflowY: 'auto', border: '1px solid var(--border-light)', borderRadius: 6, background: 'var(--bg-secondary)' }}>
                  {filteredOrders.filter(o => selectedIds.has(o.id)).map((o, i) => (
                    <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 12px', borderBottom: i < selectedIds.size - 1 ? '1px solid var(--border-light)' : 'none', fontSize: 12 }}>
                      <span style={{ fontWeight: 700, color: 'var(--accent)', minWidth: 110 }}>{o.orderNumber}</span>
                      <span style={{ color: 'var(--text-secondary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.party}</span>
                      <span style={{ color: 'var(--text-tertiary)' }}>{o.article}</span>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 10,
                        background: ({ new: '#FEF3C7', assigned: '#EFF6FF', 'in-process': '#EFF6FF', done: '#D1FAE5', hold: '#FEE2E2', splitting: '#EDE9FE' } as any)[o.status] || '#F3F4F6',
                        color: ({ new: '#D97706', assigned: '#185FA5', 'in-process': '#185FA5', done: '#059669', hold: '#DC2626', splitting: '#7C3AED' } as any)[o.status] || '#374151',
                      }}>{o.status}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowBulkModal(false)}>Cancel</button>
              <button
                className={bulkAction === 'delete' ? '' : 'primary'}
                onClick={applyBulkAction}
                style={bulkAction === 'delete' ? { padding: '8px 16px', fontSize: 13, fontWeight: 700, border: 'none', borderRadius: 6, background: '#DC2626', color: '#fff', cursor: 'pointer' } : {}}
                disabled={
                  (bulkAction === 'assign' && !bulkSupervisor) ||
                  (bulkAction === 'status' && !bulkStatus)
                }
              >
                {bulkAction === 'delete'
                  ? `🗑 Delete ${selectedIds.size} Order${selectedIds.size !== 1 ? 's' : ''}`
                  : `Apply to ${selectedIds.size} Order${selectedIds.size !== 1 ? 's' : ''}`
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )

  // Modal Components
  function NewOrderModal() {
    // Load customers for party autocomplete
    const customerNames: string[] = (() => {
      const raw = localStorage.getItem('dyeflow_db')
      if (!raw) return []
      const db = JSON.parse(raw)
      return (db.customers || []).map((c: any) => c.name || c).filter(Boolean)
    })()

    // Load lab recipe numbers for autocomplete + click-through
    const labRecipeNumbers: string[] = (() => {
      const raw = localStorage.getItem('dyeflow_db')
      if (!raw) return []
      const db = JSON.parse(raw)
      return (db.labRecipes || []).map((r: any) => r.labRequestNo || r.id).filter(Boolean)
    })()

    // ── AI Advisor state ──────────────────────────────────────────────
    const [aiLoading, setAiLoading] = React.useState(false)
    const [aiResult, setAiResult] = React.useState<null | {
      verdict: 'ACCEPT' | 'NEGOTIATE' | 'DELAY'
      summary: string
      full: string
    }>(null)

    const runAiAdvisor = async () => {
      if (!formData.qtyKg || !formData.article) {
        alert('Please fill in at least Article and Qty (Kg) before running the AI check.')
        return
      }
      setAiLoading(true)
      setAiResult(null)

      try {
        // Build compact factory context
        const raw = localStorage.getItem('dyeflow_db')
        const db = raw ? JSON.parse(raw) : {}
        const orders: any[] = db.orders || []
        const machines: any[] = db.machines || []
        const supervisors: any[] = db.supervisors || []
        const allBatches = orders.flatMap((o: any) => (o.splits || []).map((b: any) => ({ ...b, machine: b.machine || o.machine })))
        const now = new Date()

        // Machine loads
        const machineInfo = machines.map((m: any) => {
          const mBatches = allBatches.filter((b: any) => b.machine === m.id && b.status !== 'done')
          const loadedKg = mBatches.reduce((s: number, b: any) => s + (parseFloat(b.kg) || 0), 0)
          const pct = m.capacity ? Math.min(100, Math.round((loadedKg / m.capacity) * 100)) : 0
          return `${m.name}: ${loadedKg}/${m.capacity}kg (${pct}%)`
        }).join(', ')

        // Supervisor workloads
        const supInfo = supervisors.map((s: any) => {
          const supOrders = orders.filter((o: any) => (o.supervisor || '').toLowerCase() === (s.name || '').toLowerCase())
          const inbox = supOrders.filter((o: any) => o.status === 'assigned').length
          const active = supOrders.filter((o: any) => ['splitting', 'in-process'].includes(o.status)).length
          return `${s.name}: inbox=${inbox}, active=${active}`
        }).join('; ')

        // Current order pipeline
        const pendingKg = orders
          .filter((o: any) => !['done'].includes(o.status))
          .reduce((s: number, o: any) => s + (parseFloat(o.qtyKg) || 0), 0)
        const overdueCount = orders.filter((o: any) => {
          if (['done', 'new'].includes(o.status)) return false
          const d = o.plannedDates?.['Dispatch'] || ''
          return d && new Date(d) < now
        }).length

        // Party history
        const partyOrders = orders.filter((o: any) => (o.party || '').toLowerCase() === (formData.party || '').toLowerCase())
        const partyHistory = partyOrders.length > 0
          ? `${partyOrders.length} previous orders, ${partyOrders.filter((o: any) => o.status === 'done').length} completed`
          : 'New customer'

        const prompt = `You are an order acceptance advisor for a dyeing factory. Analyse this new order request and give a clear recommendation.

NEW ORDER REQUEST:
- Party: ${formData.party || 'unknown'}
- Article: ${formData.article || 'unknown'}
- Color: ${formData.color || 'unknown'}
- Blend: ${formData.blend || 'unknown'}
- Quantity: ${formData.qtyKg} Kg
- Finish: ${formData.typeOfFinish || 'standard'}
- Customer history: ${partyHistory}

CURRENT FACTORY STATE:
- Pending pipeline: ${Math.round(pendingKg)} Kg across ${orders.filter((o: any) => o.status !== 'done').length} active orders
- Overdue orders: ${overdueCount}
- Machine loads: ${machineInfo || 'no machines configured'}
- Supervisor workloads: ${supInfo || 'no supervisors configured'}

RESPOND IN THIS EXACT FORMAT — no extra text:
VERDICT: [ACCEPT or NEGOTIATE or DELAY]
SUMMARY: [one sentence, max 20 words, plain language]
CAPACITY: [one bullet on machine/capacity situation]
TIMING: [one bullet on realistic delivery timing given current load]
RISK: [one bullet on main risk with this order]
RECOMMENDATION: [one specific, actionable sentence — what to tell the customer or what to do internally]`

        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 500,
            messages: [{ role: 'user', content: prompt }]
          })
        })

        if (!response.ok) throw new Error(`API ${response.status}`)
        const data = await response.json()
        const text = (data.content || []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join('')

        // Parse verdict
        const verdictMatch = text.match(/VERDICT:\s*(ACCEPT|NEGOTIATE|DELAY)/i)
        const summaryMatch = text.match(/SUMMARY:\s*(.+)/i)
        const verdict = (verdictMatch?.[1]?.toUpperCase() || 'NEGOTIATE') as 'ACCEPT' | 'NEGOTIATE' | 'DELAY'
        const summary = summaryMatch?.[1]?.trim() || 'Review capacity before accepting.'

        setAiResult({ verdict, summary, full: text })
      } catch (err) {
        setAiResult({ verdict: 'NEGOTIATE', summary: 'AI check failed. Review manually.', full: `Error: ${String(err)}` })
      } finally {
        setAiLoading(false)
      }
    }

    const verdictStyle = (v: 'ACCEPT' | 'NEGOTIATE' | 'DELAY') => ({
      ACCEPT:    { bg: '#D1FAE5', border: '#6EE7B7', color: '#065F46', icon: '✅' },
      NEGOTIATE: { bg: '#FEF3C7', border: '#FCD34D', color: '#92400E', icon: '🤝' },
      DELAY:     { bg: '#FEE2E2', border: '#FCA5A5', color: '#991B1B', icon: '⏸' },
    }[v])

    return (
      <div style={modalOverlayStyle}>
        <div style={{...modalContentStyle, maxWidth: '680px'}}>
          <div style={modalHeaderStyle}>
            <span style={{ fontSize: '16px', fontWeight: 700 }}>+ New Order</span>
            <button onClick={() => setShowModal(null)} style={closeButtonStyle}>✕</button>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
            {/* Party — datalist autocomplete from Customer Master */}
            <div>
              <label style={labelStyle}>Party Name</label>
              <input
                list="party-list"
                value={formData.party || ''}
                onChange={e => setFormData({...formData, party: e.target.value})}
                placeholder="Party Name"
                style={inputStyle}
              />
              <datalist id="party-list">
                {customerNames.map(n => <option key={n} value={n} />)}
              </datalist>
            </div>
            <FormField label="Sub Party" value={formData.subParty} onChange={(v) => setFormData({...formData, subParty: v})} />
            <FormField label="Sales Person" value={formData.salesPerson} onChange={(v) => setFormData({...formData, salesPerson: v})} />
            <FormField label="Article" value={formData.article} onChange={(v) => setFormData({...formData, article: v})} />
            <FormField label="Blend" value={formData.blend} onChange={(v) => setFormData({...formData, blend: v})} />
            <FormField label="Width" value={formData.width} onChange={(v) => setFormData({...formData, width: v})} />
            <FormField label="GSM" value={formData.gsm} onChange={(v) => setFormData({...formData, gsm: v})} />
            <FormField label="Color" value={formData.color} onChange={(v) => setFormData({...formData, color: v})} />
            <FormField label="Lab No." value={formData.labNo} onChange={(v) => setFormData({...formData, labNo: v})}
              datalistId="labno-list" datalistOptions={labRecipeNumbers}
              suffix={formData.labNo && labRecipeNumbers.includes(formData.labNo)
                ? <a href="/lab/receipe" target="_blank" style={{ fontSize: 11, color: 'var(--accent)', marginLeft: 6, textDecoration: 'none', whiteSpace: 'nowrap' }}>🔬 View Recipe ↗</a>
                : null
              }
            />
            <FormField label="LOT No." value={formData.lotNo} onChange={(v) => setFormData({...formData, lotNo: v})} />
            <FormField label="Challan No." value={formData.challanNo} onChange={(v) => setFormData({...formData, challanNo: v})} />
            <FormField label="Qty (Kg)" type="number" value={formData.qtyKg} onChange={(v) => setFormData({...formData, qtyKg: v})} />
            <FormField label="Qty (Mtr)" type="number" value={formData.qtyMtr} onChange={(v) => setFormData({...formData, qtyMtr: v})} />
            <FormField label="No. of Taka" type="number" value={formData.noOfTaka} onChange={(v) => setFormData({...formData, noOfTaka: v})} />
            <FormField label="Type of Finish" value={formData.typeOfFinish} onChange={(v) => setFormData({...formData, typeOfFinish: v})} />
            <FormField label="Type of Packing" value={formData.typeOfPacking} onChange={(v) => setFormData({...formData, typeOfPacking: v})} />
            
            <div>
              <label style={labelStyle}>Hold/Approval</label>
              <select 
                value={formData.holdApproval} 
                onChange={(e) => setFormData({...formData, holdApproval: e.target.value})}
                style={inputStyle}
              >
                <option value="">Select</option>
                <option value="Hold">Hold</option>
                <option value="1st Batch Approval">1st Batch Approval</option>
              </select>
            </div>
            
            {formData.holdApproval === 'Hold' && (
              <FormField label="Hold Remark" value={formData.holdReason} onChange={(v) => setFormData({...formData, holdReason: v})} />
            )}
            
            <div>
              <label style={labelStyle}>Order Number (Auto)</label>
              <input type="text" value={formData.orderNumber} readOnly style={{...inputStyle, background: '#F3F4F6', fontWeight: 700, color: '#3B82F6'}} />
            </div>
          </div>
          
          <div style={{ marginBottom: '14px' }}>
            <label style={labelStyle}>Remarks</label>
            <textarea 
              value={formData.remarks} 
              onChange={(e) => setFormData({...formData, remarks: e.target.value})}
              style={{...inputStyle, minHeight: '60px', resize: 'vertical'}}
            />
          </div>
          
          {/* ── AI Order Acceptance Advisor ─────────────────────────────────── */}
          <div style={{ marginBottom: '16px', borderTop: '1px solid #E5E7EB', paddingTop: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: aiResult ? 12 : 0 }}>
              <div style={{ fontSize: '13px', color: '#6B7280' }}>
                🤖 <strong>AI Advisor</strong>
                <span style={{ fontSize: '11px', marginLeft: 6 }}>checks capacity, workloads & overdue orders</span>
              </div>
              <button
                onClick={runAiAdvisor}
                disabled={aiLoading}
                style={{
                  padding: '7px 14px', fontSize: '12px', fontWeight: 600,
                  background: aiLoading ? '#E2E8F0' : 'linear-gradient(135deg, #185FA5, #3C3489)',
                  color: aiLoading ? '#94A3B8' : '#fff',
                  border: 'none', borderRadius: '6px',
                  cursor: aiLoading ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', gap: '6px'
                }}
              >
                {aiLoading ? (
                  <>
                    <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⏳</span>
                    Checking capacity…
                  </>
                ) : (
                  <>🤖 Check Capacity &amp; Advise</>
                )}
              </button>
            </div>

            {/* AI Result */}
            {aiResult && (() => {
              const vs = verdictStyle(aiResult.verdict)
              // Parse sections from full text
              const lines = aiResult.full.split('\n').map((l: string) => l.trim()).filter(Boolean)
              const getSection = (key: string) => {
                const line = lines.find((l: string) => l.toUpperCase().startsWith(key + ':'))
                return line ? line.replace(new RegExp(`^${key}:\\s*`, 'i'), '').trim() : ''
              }
              return (
                <div style={{ background: vs.bg, border: `1.5px solid ${vs.border}`, borderRadius: '10px', overflow: 'hidden' }}>
                  {/* Verdict header */}
                  <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '10px', borderBottom: `1px solid ${vs.border}` }}>
                    <span style={{ fontSize: '22px' }}>{vs.icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '16px', fontWeight: 800, color: vs.color, letterSpacing: '0.04em' }}>
                        {aiResult.verdict}
                      </div>
                      <div style={{ fontSize: '13px', color: vs.color, marginTop: '2px', opacity: 0.85 }}>
                        {aiResult.summary}
                      </div>
                    </div>
                    <button
                      onClick={() => setAiResult(null)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', color: vs.color, opacity: 0.5, padding: '0 4px' }}
                    >✕</button>
                  </div>
                  {/* Detail sections */}
                  <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {[['CAPACITY', '🏭'], ['TIMING', '⏱'], ['RISK', '⚠️'], ['RECOMMENDATION', '💡']].map(([key, icon]) => {
                      const val = getSection(key)
                      if (!val) return null
                      return (
                        <div key={key} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                          <span style={{ fontSize: '14px', flexShrink: 0, marginTop: '1px' }}>{icon}</span>
                          <div>
                            <span style={{ fontSize: '10px', fontWeight: 700, color: vs.color, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{key}: </span>
                            <span style={{ fontSize: '12px', color: '#1E293B', lineHeight: '1.5' }}>{val}</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })()}
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={saveOrder} style={primaryButtonStyle}>✓ Save Order</button>
            <button onClick={() => setShowModal(null)} style={secondaryButtonStyle}>Cancel</button>
          </div>
        </div>
      </div>
    )
  }

  function EditOrderModal() {
    return <NewOrderModal /> // Same form, different title
  }

  function ViewOrderModal() {
    if (!selectedOrder) return null
    
    return (
      <div style={modalOverlayStyle}>
        <div style={{...modalContentStyle, maxWidth: '800px'}}>
          <div style={modalHeaderStyle}>
            <span style={{ fontSize: '16px', fontWeight: 700 }}>Order Detail – {selectedOrder.orderNumber}</span>
            <div style={{ display: 'flex', gap: '8px' }}>
              {(!selectedOrder.supervisor || selectedOrder.status === 'new') && (
                <button onClick={() => { setShowModal('assign') }} style={btnPrimaryStyle}>
                  Assign Supervisor
                </button>
              )}
              <button onClick={() => setShowModal(null)} style={closeButtonStyle}>✕</button>
            </div>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px', paddingBottom: '14px', borderBottom: '1px solid #E5E7EB' }}>
            <DetailRow label="Order #" value={selectedOrder.orderNumber} />
            <DetailRow label="Status" value={getStatusBadge(selectedOrder.status)} />
            <DetailRow label="Party" value={selectedOrder.party} />
            <DetailRow label="Sub Party" value={selectedOrder.subParty || '-'} />
            <DetailRow label="Sales Person" value={selectedOrder.salesPerson} />
            <DetailRow label="Timestamp" value={selectedOrder.timestamp} />
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '14px', paddingBottom: '14px', borderBottom: '1px solid #E5E7EB' }}>
            <DetailRow label="Article" value={selectedOrder.article} />
            <DetailRow label="Blend" value={selectedOrder.blend} />
            <DetailRow label="Width" value={selectedOrder.width} />
            <DetailRow label="GSM" value={selectedOrder.gsm} />
            <DetailRow label="Color" value={selectedOrder.color} />
            <DetailRow label="Finish" value={selectedOrder.typeOfFinish} />
            <DetailRow label="Lab No." value={selectedOrder.labNo} />
            <DetailRow label="LOT No." value={selectedOrder.lotNo} />
            <DetailRow label="Challan No." value={selectedOrder.challanNo} />
            <DetailRow label="Qty (Kg)" value={selectedOrder.qtyKg} />
            <DetailRow label="Qty (Mtr)" value={selectedOrder.qtyMtr} />
            <DetailRow label="No. of Taka" value={selectedOrder.noOfTaka} />
            <DetailRow label="Packing" value={selectedOrder.typeOfPacking} />
            <DetailRow label="Hold/Approval" value={selectedOrder.holdApproval || '-'} />
            <DetailRow label="Hold Remark" value={selectedOrder.holdReason || '-'} />
            <DetailRow label="Remarks" value={selectedOrder.remarks || '-'} />
            <DetailRow label="Supervisor" value={selectedOrder.supervisor || '-'} />
          </div>
          
          {selectedOrder.processRoute && selectedOrder.processRoute.length > 0 && (
            <div style={{ marginBottom: '14px' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#6B7280', marginBottom: '10px' }}>PROCESS ROUTE</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 0 }}>
                {(() => {
                  // Determine which process is current from any batch
                  const allBatches = selectedOrder.splits || []
                  const currentProcess = allBatches.length > 0 ? allBatches[0].fmsCurrentProcess || '' : ''
                  const completedProcesses = new Set<string>()
                  allBatches.forEach((b: any) => {
                    Object.keys(b.fmsActualDates || {}).forEach(code => completedProcesses.add(code))
                  })
                  const fullRoute = [
                    ...(selectedOrder.processRoute || []),
                    ...(['Qa','Packing','Dispatch'].filter((x: string) => !(selectedOrder.processRoute || []).includes(x)))
                  ]
                  return fullRoute.map((code: string, idx: number) => {
                    const proc = getProcObj(code) || { code, name: code }
                    const isDone = completedProcesses.has(code)
                    const isActive = !isDone && code === currentProcess
                    const bg = isDone ? '#D1FAE5' : isActive ? '#DBEAFE' : '#F3F4F6'
                    const color = isDone ? '#065F46' : isActive ? '#1E40AF' : '#6B7280'
                    const border = isDone ? '1px solid #6EE7B7' : isActive ? '2px solid #3B82F6' : '1px solid #E5E7EB'
                    return (
                      <React.Fragment key={idx}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 60, maxWidth: 80 }}>
                          <div style={{
                            background: bg, color, border,
                            borderRadius: 6, padding: '5px 8px',
                            fontSize: 11, fontWeight: 700,
                            textAlign: 'center', whiteSpace: 'nowrap',
                            position: 'relative',
                          }}>
                            {isDone && <span style={{ position: 'absolute', top: -6, right: -6, background: '#10B981', color: '#fff', borderRadius: '50%', width: 14, height: 14, fontSize: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>✓</span>}
                            {isActive && <span style={{ position: 'absolute', top: -6, right: -6, background: '#3B82F6', borderRadius: '50%', width: 10, height: 10, animation: 'pulse 1s infinite' }} />}
                            {proc.code}
                          </div>
                          <div style={{ fontSize: 9, color: '#9CA3AF', marginTop: 3, textAlign: 'center', maxWidth: 70, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{proc.name}</div>
                        </div>
                        {idx < fullRoute.length - 1 && (
                          <div style={{ width: 16, height: 2, background: isDone ? '#6EE7B7' : '#E5E7EB', flexShrink: 0, marginBottom: 14 }} />
                        )}
                      </React.Fragment>
                    )
                  })
                })()}
              </div>
              {/* Legend */}
              <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: 10, color: '#9CA3AF' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: '#D1FAE5', border: '1px solid #6EE7B7', display: 'inline-block' }} /> Done</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: '#DBEAFE', border: '2px solid #3B82F6', display: 'inline-block' }} /> Current</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: '#F3F4F6', border: '1px solid #E5E7EB', display: 'inline-block' }} /> Pending</span>
              </div>
            </div>
          )}
          
          {selectedOrder.machine && (
            <div style={{ marginBottom: '14px' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#6B7280', marginBottom: '6px' }}>MACHINE</div>
              <span style={{
                background: '#E9D5FF',
                color: '#6B21A8',
                padding: '4px 10px',
                borderRadius: '4px',
                fontSize: '12px',
                fontWeight: 600
              }}>
                {getMachineName(selectedOrder.machine)}
              </span>
            </div>
          )}
          
          {selectedOrder.splits && selectedOrder.splits.length > 0 && (
            <div style={{ marginBottom: '14px' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#6B7280', marginBottom: '8px' }}>BATCHES / SPLITS</div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#F9FAFB' }}>
                    <th style={{ padding: '8px', textAlign: 'left', fontSize: '11px', borderBottom: '1px solid #E5E7EB' }}>Batch ID</th>
                    <th style={{ padding: '8px', textAlign: 'left', fontSize: '11px', borderBottom: '1px solid #E5E7EB' }}>Qty (Kg)</th>
                    <th style={{ padding: '8px', textAlign: 'left', fontSize: '11px', borderBottom: '1px solid #E5E7EB' }}>Current Process</th>
                    <th style={{ padding: '8px', textAlign: 'left', fontSize: '11px', borderBottom: '1px solid #E5E7EB' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedOrder.splits.map((split: any, idx: number) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #F3F4F6' }}>
                      <td style={{ padding: '8px', fontSize: '12px', fontWeight: 600 }}>{split.batchId}</td>
                      <td style={{ padding: '8px', fontSize: '12px' }}>{split.kg}</td>
                      <td style={{ padding: '8px', fontSize: '12px' }}>{split.currentProcess || '-'}</td>
                      <td style={{ padding: '8px', fontSize: '12px' }}>{getStatusBadge(split.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          
          <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
            <button onClick={() => { setShowModal('edit') }} style={secondaryButtonStyle}>Edit Order</button>
          </div>
        </div>
      </div>
    )
  }

  // FIX #1: Updated AssignSupervisorModal with populated dropdown
  function AssignSupervisorModal() {
    if (!selectedOrder) return null
    
    const [selectedSupervisor, setSelectedSupervisor] = useState('')
    
    return (
      <div style={modalOverlayStyle}>
        <div style={modalContentStyle}>
          <div style={modalHeaderStyle}>
            <span style={{ fontSize: '16px', fontWeight: 700 }}>Assign Supervisor – {selectedOrder.orderNumber}</span>
            <button onClick={() => setShowModal(null)} style={closeButtonStyle}>✕</button>
          </div>
          
          <div style={{ background: '#F9FAFB', borderRadius: '8px', padding: '10px 14px', marginBottom: '14px', fontSize: '13px' }}>
            <strong>{selectedOrder.article}</strong> • {selectedOrder.color} • {selectedOrder.qtyKg} Kg
          </div>
          
          <div style={{ marginBottom: '16px' }}>
            <label style={labelStyle}>Select Supervisor</label>
            <select 
              value={selectedSupervisor} 
              onChange={(e) => setSelectedSupervisor(e.target.value)}
              style={inputStyle}
            >
              <option value="">-- Select --</option>
              {supervisors.map((sup) => (
                <option key={sup} value={sup}>{sup}</option>
              ))}
            </select>
          </div>
          
          <button onClick={() => assignSupervisor(selectedSupervisor, true)} style={primaryButtonStyle}>
            ✓ Assign & Send to Supervisor Sheet
          </button>
        </div>
      </div>
    )
  }

  // FIX #1: Updated ChangeSupervisorModal with populated dropdown
  function ChangeSupervisorModal() {
    if (!selectedOrder) return null
    
    const [selectedSupervisor, setSelectedSupervisor] = useState(selectedOrder.supervisor || '')
    const [updateMap, setUpdateMap] = useState(false)
    
    return (
      <div style={modalOverlayStyle}>
        <div style={modalContentStyle}>
          <div style={modalHeaderStyle}>
            <span style={{ fontSize: '16px', fontWeight: 700 }}>Change Supervisor – {selectedOrder.orderNumber}</span>
            <button onClick={() => setShowModal(null)} style={closeButtonStyle}>✕</button>
          </div>
          
          <div style={{ fontSize: '12px', color: '#991B1B', background: '#FEE2E2', border: '1px solid #F3B1B1', borderRadius: '8px', padding: '9px 10px', marginBottom: '12px' }}>
            ⚠ Changing supervisor will delete this order's split batches, machine sheet entries, FMS rows, and Date Calculator batch rows so the new supervisor can prepare it again.
          </div>
          
          <div style={{ background: '#F9FAFB', borderRadius: '8px', padding: '10px 14px', marginBottom: '14px', fontSize: '13px' }}>
            <strong>{selectedOrder.article}</strong> • {selectedOrder.color} • {selectedOrder.qtyKg} Kg
          </div>
          
          <div style={{ marginBottom: '16px' }}>
            <label style={labelStyle}>Select Supervisor</label>
            <select 
              value={selectedSupervisor} 
              onChange={(e) => setSelectedSupervisor(e.target.value)}
              style={inputStyle}
            >
              <option value="">-- Select --</option>
              {supervisors.map((sup) => (
                <option key={sup} value={sup}>{sup}</option>
              ))}
            </select>
          </div>
          
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button onClick={() => changeSupervisor(selectedSupervisor, false)} style={primaryButtonStyle}>
              Change Only This Order
            </button>
            <button onClick={() => changeSupervisor(selectedSupervisor, true)} style={{...primaryButtonStyle, background: '#10B981'}}>
              Change Order + Article Map
            </button>
          </div>
        </div>
      </div>
    )
  }

  function SplitOrderModal() {
    if (!selectedOrder) return null
    
    const totalKg = splitParts.reduce((sum, p) => sum + (parseFloat(p.kg) || 0), 0)
    const totalMtr = splitParts.reduce((sum, p) => sum + (parseFloat(p.mtr) || 0), 0)
    const remainingKg = selectedOrder.qtyKg - totalKg
    const remainingMtr = selectedOrder.qtyMtr - totalMtr
    const isFullySplit = Math.abs(remainingKg) < 0.5
    
    const addBatch = () => {
      setSplitParts([...splitParts, { kg: 0, mtr: 0, taka: 0 }])
    }
    
    const removeBatch = (index: number) => {
      setSplitParts(splitParts.filter((_, i) => i !== index))
    }
    
    const updateBatch = (index: number, field: string, value: string) => {
      const updated = [...splitParts]
      updated[index] = { ...updated[index], [field]: value }
      setSplitParts(updated)
    }
    
    const autoBalance = () => {
      if (splitParts.length === 0) return
      const perBatchKg = selectedOrder.qtyKg / splitParts.length
      const perBatchMtr = selectedOrder.qtyMtr / splitParts.length
      const perBatchTaka = selectedOrder.noOfTaka / splitParts.length
      setSplitParts(splitParts.map(() => ({
        kg: perBatchKg,
        mtr: perBatchMtr,
        taka: perBatchTaka
      })))
    }
    
    return (
      <div style={modalOverlayStyle}>
        <div style={{...modalContentStyle, maxWidth: '700px'}}>
          <div style={modalHeaderStyle}>
            <span style={{ fontSize: '16px', fontWeight: 700 }}>Split Order – {selectedOrder.orderNumber}</span>
            <button onClick={() => setShowModal(null)} style={closeButtonStyle}>✕</button>
          </div>
          
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '12px', padding: '10px 14px', background: '#F9FAFB', borderRadius: '8px', fontSize: '13px' }}>
            <span><strong>Article:</strong> {selectedOrder.article}</span>
            <span><strong>Color:</strong> {selectedOrder.color}</span>
            <span><strong>Machine:</strong> {getMachineName(selectedOrder.machine)}</span>
            <span><strong>Total Qty:</strong> {selectedOrder.qtyKg} Kg / {selectedOrder.qtyMtr} Mtr / {selectedOrder.noOfTaka} Taka</span>
          </div>
          
          <div style={{
            background: isFullySplit ? '#D1FAE5' : '#FEE2E2',
            borderRadius: '8px',
            padding: '8px 14px',
            marginBottom: '12px',
            fontSize: '13px',
            fontWeight: 500,
            color: isFullySplit ? '#065F46' : '#991B1B'
          }}>
            Allocated: {totalKg} Kg / {totalMtr} Mtr &nbsp;|&nbsp; Remaining: {remainingKg.toFixed(1)} Kg {isFullySplit ? '✓' : '⚠'}
          </div>
          
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '10px' }}>
            <thead>
              <tr style={{ background: '#F9FAFB' }}>
                <th style={{ padding: '6px 8px', fontSize: '11px', textAlign: 'left', borderBottom: '1px solid #E5E7EB' }}>Batch</th>
                <th style={{ padding: '6px 8px', fontSize: '11px', textAlign: 'left', borderBottom: '1px solid #E5E7EB' }}>Qty (Kg)</th>
                <th style={{ padding: '6px 8px', fontSize: '11px', textAlign: 'left', borderBottom: '1px solid #E5E7EB' }}>Qty (Mtr)</th>
                <th style={{ padding: '6px 8px', fontSize: '11px', textAlign: 'left', borderBottom: '1px solid #E5E7EB' }}>Taka</th>
                <th style={{ padding: '6px 8px', fontSize: '11px', textAlign: 'left', borderBottom: '1px solid #E5E7EB' }}></th>
              </tr>
            </thead>
            <tbody>
              {splitParts.map((part, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid #F3F4F6' }}>
                  <td style={{ padding: '6px 8px', fontSize: '12px', fontWeight: 600 }}>#{idx + 1}</td>
                  <td style={{ padding: '6px 8px' }}>
                    <input 
                      type="number" 
                      value={part.kg} 
                      onChange={(e) => updateBatch(idx, 'kg', e.target.value)}
                      style={{ width: '80px', padding: '4px 6px', border: '1px solid #D1D5DB', borderRadius: '4px', fontSize: '12px' }}
                    />
                  </td>
                  <td style={{ padding: '6px 8px' }}>
                    <input 
                      type="number" 
                      value={part.mtr} 
                      onChange={(e) => updateBatch(idx, 'mtr', e.target.value)}
                      style={{ width: '80px', padding: '4px 6px', border: '1px solid #D1D5DB', borderRadius: '4px', fontSize: '12px' }}
                    />
                  </td>
                  <td style={{ padding: '6px 8px' }}>
                    <input 
                      type="number" 
                      value={part.taka} 
                      onChange={(e) => updateBatch(idx, 'taka', e.target.value)}
                      style={{ width: '60px', padding: '4px 6px', border: '1px solid #D1D5DB', borderRadius: '4px', fontSize: '12px' }}
                    />
                  </td>
                  <td style={{ padding: '6px 8px' }}>
                    {splitParts.length > 1 && (
                      <button onClick={() => removeBatch(idx)} style={{...btnStyle, padding: '4px 8px', fontSize: '11px'}}>
                        ➖
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          
          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
            <button onClick={addBatch} style={secondaryButtonStyle}>➕ Add Batch</button>
            <button onClick={autoBalance} style={secondaryButtonStyle}>Auto-Balance</button>
          </div>
          
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={saveSplits} style={primaryButtonStyle}>✓ Save Splits</button>
            <button onClick={() => setShowModal(null)} style={secondaryButtonStyle}>Cancel</button>
          </div>
        </div>
      </div>
    )
  }

  function FormField({ label, type = 'text', value, onChange, datalistId, datalistOptions, suffix }: any) {
    return (
      <div>
        <label style={labelStyle}>
          {label}
          {suffix}
        </label>
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={inputStyle}
          placeholder={label}
          list={datalistId}
        />
        {datalistId && datalistOptions && (
          <datalist id={datalistId}>
            {datalistOptions.map((opt: string) => <option key={opt} value={opt} />)}
          </datalist>
        )}
      </div>
    )
  }

  function DetailRow({ label, value }: any) {
    return (
      <div>
        <div style={{ fontSize: '11px', color: '#6B7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '2px' }}>
          {label}
        </div>
        <div style={{ fontSize: '13px' }}>
          {value}
        </div>
      </div>
    )
  }
}

// Styles
const cellStyle: React.CSSProperties = {
  padding: '12px 14px',
  fontSize: '12px',
  color: '#1F2937',
  borderRight: '1px solid #F3F4F6',
  whiteSpace: 'normal',
  wordWrap: 'break-word',
  overflowWrap: 'break-word'
}

const btnStyle: React.CSSProperties = {
  padding: '5px 10px',
  fontSize: '11px',
  border: '1px solid #D1D5DB',
  borderRadius: '4px',
  background: 'white',
  color: '#374151',
  cursor: 'pointer',
  whiteSpace: 'nowrap'
}

const btnPrimaryStyle: React.CSSProperties = {
  ...btnStyle,
  background: '#3B82F6',
  color: 'white',
  border: 'none',
  fontWeight: 600
}

const btnDisabledStyle: React.CSSProperties = {
  ...btnStyle,
  opacity: 0.4,
  cursor: 'not-allowed'
}

const modalOverlayStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  background: 'rgba(0, 0, 0, 0.5)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000
}

const modalContentStyle: React.CSSProperties = {
  background: 'white',
  borderRadius: '12px',
  padding: '24px',
  maxWidth: '600px',
  width: '90%',
  maxHeight: '90vh',
  overflow: 'auto'
}

const modalHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: '20px',
  paddingBottom: '16px',
  borderBottom: '2px solid #E5E7EB'
}

const closeButtonStyle: React.CSSProperties = {
  padding: '6px 12px',
  fontSize: '14px',
  border: 'none',
  background: '#F3F4F6',
  borderRadius: '6px',
  cursor: 'pointer',
  fontWeight: 600
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '12px',
  fontWeight: 600,
  color: '#374151',
  marginBottom: '6px'
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  border: '1px solid #D1D5DB',
  borderRadius: '6px',
  fontSize: '13px',
  outline: 'none'
}

const primaryButtonStyle: React.CSSProperties = {
  padding: '10px 16px',
  fontSize: '13px',
  fontWeight: 600,
  border: 'none',
  borderRadius: '6px',
  background: '#3B82F6',
  color: 'white',
  cursor: 'pointer'
}

const secondaryButtonStyle: React.CSSProperties = {
  padding: '10px 16px',
  fontSize: '13px',
  fontWeight: 500,
  border: '1px solid #D1D5DB',
  borderRadius: '6px',
  background: 'white',
  color: '#374151',
  cursor: 'pointer'
}
