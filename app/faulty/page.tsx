'use client'

import { useEffect, useState } from 'react'
import { PROCESS_MAP, getProcessName, loadOrSeedProcessList } from '@/lib/processMap'
import * as XLSX from 'xlsx'

interface FaultyRecord {
  id: string
  batchId: string
  orderId?: string
  timestamp?: string
  faultyMarkedAt?: string
  orderNo: string
  party: string
  subParty?: string
  salesPerson?: string
  article?: string
  blend?: string
  width?: string
  gsm?: string
  color?: string
  labNo?: string
  lotNo?: string
  challanNo?: string
  qtyKg: number
  qtyMtr?: string
  noOfTaka?: string
  typeOfFinish?: string
  typeOfPacking?: string
  orderRemarks?: string
  faultyRemarks: string
  supervisor?: string
  processRoute?: string
  faultyFrom?: string
  plannedDate?: string
  actualDate?: string
  timeDelay?: string
  ifOk?: boolean
  reprocess?: boolean
  faultyType: string
  date: string
  status: 'open' | 'resolved'
}

interface ColumnConfig {
  id: string
  label: string
  visible: boolean
  width: number
  minWidth?: number
}

// Process name lookup — reads from lib/processMap (single source of truth)
// Falls back to built-in PROCESS_MAP if db.processList is empty

const DEFAULT_COLUMNS: ColumnConfig[] = [
  { id: 'timestamp', label: 'TIME STAMP', visible: true, width: 150, minWidth: 100 },
  { id: 'batchId', label: 'BATCH ID', visible: true, width: 120, minWidth: 80 },
  { id: 'orderNo', label: 'ORDER #', visible: true, width: 120, minWidth: 80 },
  { id: 'party', label: 'PARTY', visible: true, width: 150, minWidth: 100 },
  { id: 'subParty', label: 'SUB PARTY', visible: true, width: 120, minWidth: 80 },
  { id: 'salesPerson', label: 'SALES PERSON', visible: true, width: 130, minWidth: 90 },
  { id: 'article', label: 'ARTICLE', visible: true, width: 120, minWidth: 80 },
  { id: 'blend', label: 'BLEND', visible: true, width: 100, minWidth: 70 },
  { id: 'width', label: 'WIDTH', visible: true, width: 80, minWidth: 60 },
  { id: 'gsm', label: 'GSM', visible: true, width: 80, minWidth: 60 },
  { id: 'color', label: 'COLOR', visible: true, width: 100, minWidth: 70 },
  { id: 'labNo', label: 'LAB NO.', visible: true, width: 100, minWidth: 70 },
  { id: 'lotNo', label: 'LOT NO.', visible: true, width: 100, minWidth: 70 },
  { id: 'challanNo', label: 'CHALLAN NO.', visible: true, width: 110, minWidth: 80 },
  { id: 'qtyKg', label: 'QTY (KG)', visible: true, width: 100, minWidth: 70 },
  { id: 'qtyMtr', label: 'QTY (MTR.)', visible: true, width: 100, minWidth: 70 },
  { id: 'noOfTaka', label: 'NO. OF TA', visible: true, width: 100, minWidth: 70 },
  { id: 'typeOfFinish', label: 'TYPE OF FINISH', visible: true, width: 130, minWidth: 90 },
  { id: 'typeOfPacking', label: 'TYPE OF PACKING', visible: true, width: 140, minWidth: 100 },
  { id: 'orderRemarks', label: 'REMARKS', visible: true, width: 200, minWidth: 150 },
  { id: 'supervisor', label: 'SUPERVISOR', visible: true, width: 120, minWidth: 80 },
  { id: 'processRoute', label: 'PROCESS ROUTE', visible: true, width: 150, minWidth: 100 },
  { id: 'faultyFrom', label: 'FAULTY FROM', visible: true, width: 120, minWidth: 80 },
  { id: 'faultyRemarks', label: 'FAULTY REMARKS', visible: true, width: 250, minWidth: 150 },
  { id: 'plannedDate', label: 'PLANNED DATE', visible: true, width: 150, minWidth: 100 },
  { id: 'actualDate', label: 'ACTUAL DATE', visible: true, width: 120, minWidth: 80 },
  { id: 'timeDelay', label: 'TIME DELAY', visible: true, width: 110, minWidth: 80 },
  { id: 'ifOk', label: 'IF OK', visible: true, width: 80, minWidth: 60 },
  { id: 'reprocess', label: 'REPROCESS', visible: true, width: 100, minWidth: 80 },
  { id: 'delete', label: 'DELETE', visible: true, width: 100, minWidth: 80 }
]

export default function FaultyPage() {
  const [records, setRecords] = useState<FaultyRecord[]>([])
  const [enrichedRecords, setEnrichedRecords] = useState<FaultyRecord[]>([])
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [showColumnSettings, setShowColumnSettings] = useState(false)
  const [deleteData, setDeleteData] = useState<{id: string, batchId: string} | null>(null)
  const [showReprocessModal, setShowReprocessModal] = useState(false)
  const [reprocessData, setReprocessData] = useState<{
    recordId: string,
    batchId: string,
    orderNo: string,
    originalQtyKg: number,
    originalQtyMtr: string,
    originalNoOfTaka: string
  } | null>(null)
  const [reprocessType, setReprocessType] = useState<'Full' | 'Partial' | null>(null)
  const [partialQty, setPartialQty] = useState({ kg: 0, mtr: '', taka: '' })
  const [columns, setColumns] = useState<ColumnConfig[]>(DEFAULT_COLUMNS)
  const [resizingColumn, setResizingColumn] = useState<string | null>(null)
  const [currentTime, setCurrentTime] = useState(new Date())
  const [formData, setFormData] = useState({
    id: '',
    batchId: '',
    orderNo: '',
    party: '',
    faultyType: '',
    quantity: 0,
    date: new Date().toISOString().split('T')[0],
    remarks: '',
    status: 'open' as 'open' | 'resolved'
  })

  useEffect(() => {
    loadRecords()
    loadColumnSettings()
    const interval = setInterval(loadRecords, 5000)
    
    // Update current time every minute for live delay calculation
    const timer = setInterval(() => {
      setCurrentTime(new Date())
    }, 60000) // Update every minute
    
    return () => {
      clearInterval(interval)
      clearInterval(timer)
    }
  }, [])

  const loadColumnSettings = () => {
    const saved = localStorage.getItem('faulty_column_settings')
    if (saved) {
      try {
        setColumns(JSON.parse(saved))
      } catch (e) {
        console.error('Failed to load column settings', e)
      }
    }
  }

  const saveColumnSettings = (newColumns: ColumnConfig[]) => {
    localStorage.setItem('faulty_column_settings', JSON.stringify(newColumns))
    setColumns(newColumns)
  }

  const toggleColumnVisibility = (columnId: string) => {
    const newColumns = columns.map(col =>
      col.id === columnId ? { ...col, visible: !col.visible } : col
    )
    saveColumnSettings(newColumns)
  }

  const resetColumns = () => {
    saveColumnSettings(DEFAULT_COLUMNS)
  }

  const startResize = (columnId: string, e: React.MouseEvent) => {
    e.preventDefault()
    setResizingColumn(columnId)
    const startX = e.clientX
    const column = columns.find(c => c.id === columnId)
    if (!column) return
    const startWidth = column.width

    const handleMouseMove = (e: MouseEvent) => {
      const diff = e.clientX - startX
      const newWidth = Math.max(column.minWidth || 60, startWidth + diff)
      const newColumns = columns.map(col =>
        col.id === columnId ? { ...col, width: newWidth } : col
      )
      setColumns(newColumns)
    }

    const handleMouseUp = () => {
      setResizingColumn(null)
      saveColumnSettings(columns)
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }

  // Calculate delay - LIVE countdown when unchecked, FROZEN when checked
  const calculateTimeDelay = (plannedDate: string, actualDate: string | null, isMarked: boolean) => {
    if (!plannedDate) return '-'
    
    try {
      const planned = new Date(plannedDate)
      if (isNaN(planned.getTime())) return '-'
      
      // If marked (checkbox checked)
      if (isMarked && actualDate) {
        const actual = new Date(actualDate)
        const diffMs = actual.getTime() - planned.getTime()
        
        // Completed before or on planned date - show nothing
        if (diffMs <= 0) {
          return ''
        }
        
        // Completed after planned date - show FROZEN delay in RED
        const days = Math.floor(diffMs / (1000 * 60 * 60 * 24))
        const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
        const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))
        
        return `+${days}d ${hours}h ${minutes}m`
      }
      
      // Not yet marked - calculate LIVE delay using currentTime
      const now = currentTime
      const diffMs = now.getTime() - planned.getTime()
      
      const absDiffMs = Math.abs(diffMs)
      const days = Math.floor(absDiffMs / (1000 * 60 * 60 * 24))
      const hours = Math.floor((absDiffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
      const minutes = Math.floor((absDiffMs % (1000 * 60 * 60)) / (1000 * 60))
      
      if (diffMs < 0) {
        // Time left (before planned date) - GREEN with MINUS
        return `-${days}d ${hours}h ${minutes}m`
      } else {
        // Time exceeded (after planned date) - RED with PLUS
        return `+${days}d ${hours}h ${minutes}m`
      }
    } catch {
      return '-'
    }
  }

  const formatDateDDMMYYYY = (dateStr: string) => {
    if (!dateStr) return '-'
    try {
      const d = new Date(dateStr)
      const day = String(d.getDate()).padStart(2, '0')
      const month = String(d.getMonth() + 1).padStart(2, '0')
      const year = d.getFullYear()
      return `${day}-${month}-${year}`
    } catch {
      return dateStr
    }
  }

  const formatDateTimeDDMMYYYY = (dateStr: string) => {
    if (!dateStr) return '-'
    try {
      const d = new Date(dateStr)
      const day = String(d.getDate()).padStart(2, '0')
      const month = String(d.getMonth() + 1).padStart(2, '0')
      const year = d.getFullYear()
      const hours = String(d.getHours()).padStart(2, '0')
      const minutes = String(d.getMinutes()).padStart(2, '0')
      return `${day}-${month}-${year} ${hours}:${minutes}`
    } catch {
      return dateStr
    }
  }

  const loadRecords = () => {
    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) {
      setRecords([])
      setEnrichedRecords([])
      return
    }

    const db = JSON.parse(stored)
    const faultyRecords = db.faultyRecords || []
    
    const enriched = faultyRecords.map((record: any) => {
      let batchData: any = null
      let orderData: any = null

      for (const order of (db.orders || [])) {
        const batch = (order.splits || []).find((b: any) => b.batchId === record.batchId)
        if (batch) {
          batchData = batch
          orderData = order
          break
        }
      }

      if (batchData && orderData) {
        let faultyFrom = 'Unknown'
        if (record.remarks) {
          const match = record.remarks.match(/\[([^\]]+)\]/)
          if (match && match[1]) {
            faultyFrom = match[1]
          }
        }

        const faultyMarkedAt = record.date || new Date().toISOString()
        const plannedDate = new Date(faultyMarkedAt)
        plannedDate.setHours(plannedDate.getHours() + 24)
        const plannedDateStr = plannedDate.toISOString()
        const isMarked = record.ifOk || record.reprocess || false
        const timeDelay = calculateTimeDelay(plannedDateStr, record.actualDate, isMarked)

        return {
          ...record,
          orderId: orderData.id,
          timestamp: orderData.timestamp || record.date,
          faultyMarkedAt: faultyMarkedAt,
          orderNo: orderData.orderNumber || record.orderNo,
          party: orderData.party || record.party,
          subParty: orderData.subParty || orderData.subparty || '',
          salesPerson: orderData.salesPerson || orderData.salesperson || '',
          article: orderData.article || '',
          blend: orderData.blend || '',
          width: orderData.width || '',
          gsm: orderData.gsm || '',
          color: orderData.color || '',
          labNo: orderData.labNo || orderData.labno || '',
          lotNo: orderData.lotNo || orderData.lotno || '',
          challanNo: orderData.challanNo || orderData.challannumber || '',
          qtyKg: record.quantity || batchData.kg || 0,
          qtyMtr: batchData.mtr || orderData.qtyMtr || orderData.qtymtr || '',
          noOfTaka: batchData.taka || orderData.noOfTaka || orderData.nooftaka || '',
          typeOfFinish: orderData.typeOfFinish || orderData.typeoffinish || '',
          typeOfPacking: orderData.typeOfPacking || orderData.typeofpacking || '',
          supervisor: orderData.supervisor || '',
          processRoute: (orderData.processRoute || []).join('/') || '',
          orderRemarks: orderData.remarks || '',
          faultyRemarks: record.remarks || '',
          faultyFrom: faultyFrom,
          plannedDate: plannedDateStr,
          actualDate: record.date || new Date().toISOString().split('T')[0],
          timeDelay: timeDelay,
          ifOk: record.ifOk || false,
          reprocess: record.reprocess || false
        }
      }

      let faultyFrom = 'Manual Entry'
      if (record.remarks) {
        const match = record.remarks.match(/\[([^\]]+)\]/)
        if (match && match[1]) {
          faultyFrom = match[1]
        }
      }

      const faultyMarkedAt = record.date || new Date().toISOString()
      const plannedDate = new Date(faultyMarkedAt)
      plannedDate.setHours(plannedDate.getHours() + 24)
      const plannedDateStr = plannedDate.toISOString()
      const isMarked = record.ifOk || record.reprocess || false
      const timeDelay = calculateTimeDelay(plannedDateStr, record.actualDate, isMarked)

      return {
        ...record,
        qtyKg: record.quantity || 0,
        faultyMarkedAt: faultyMarkedAt,
        faultyFrom: faultyFrom,
        plannedDate: plannedDateStr,
        actualDate: record.date || new Date().toISOString().split('T')[0],
        timeDelay: timeDelay,
        orderRemarks: '',
        faultyRemarks: record.remarks || '',
        ifOk: record.ifOk || false,
        reprocess: record.reprocess || false
      }
    })

    setRecords(faultyRecords)
    setEnrichedRecords(enriched)
  }

  const saveRecord = () => {
    if (!formData.batchId || !formData.faultyType) {
      alert('Please fill required fields')
      return
    }

    const stored = localStorage.getItem('dyeflow_db')
    const db = stored ? JSON.parse(stored) : {}
    if (!db.faultyRecords) db.faultyRecords = []

    const newId = `FR${Date.now()}`
    db.faultyRecords.push({ 
      id: newId,
      batchId: formData.batchId,
      orderNo: formData.orderNo,
      party: formData.party,
      faultyType: formData.faultyType,
      quantity: formData.quantity,
      date: new Date().toISOString(),
      remarks: formData.remarks,
      status: 'open'
    })

    localStorage.setItem('dyeflow_db', JSON.stringify(db))
    loadRecords()
    closeModal()
  }

  const closeModal = () => {
    setIsModalOpen(false)
    setFormData({
      id: '',
      batchId: '',
      orderNo: '',
      party: '',
      faultyType: '',
      quantity: 0,
      date: new Date().toISOString().split('T')[0],
      remarks: '',
      status: 'open'
    })
  }

  const getNextProcess = (currentFaultyFrom: string, processRoute: string[]): string | null => {
    const processTag = currentFaultyFrom.replace('-FMS', '')

    // End of chain shortcuts
    if (processTag === 'QA') return 'Packing'
    if (processTag === 'Packing') return 'Dispatch'
    if (processTag === 'Dispatch') return null

    // Build a runtime name→code map from db.processList (falls back to PROCESS_MAP)
    const processList = loadOrSeedProcessList()
    const nameToCode: Record<string, string> = {}
    processList.forEach(p => { nameToCode[p.name] = p.code })
    // Also index the built-in PROCESS_MAP (code→name) in reverse
    Object.entries(PROCESS_MAP).forEach(([code, name]) => {
      if (!nameToCode[name]) nameToCode[name] = code
    })

    const currentProcessCode = nameToCode[processTag] || ''
    if (!currentProcessCode) return 'QA'

    const currentIndex = processRoute.indexOf(currentProcessCode)
    if (currentIndex === -1) return 'QA'
    if (currentIndex === processRoute.length - 1) return 'QA'

    const nextCode = processRoute[currentIndex + 1]
    // Return process name for the next code
    const nextDef = processList.find(p => p.code === nextCode)
    return nextDef ? nextDef.name : (PROCESS_MAP[nextCode] || 'QA')
  }

  const toggleIfOk = (id: string, currentValue: boolean) => {
    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return
    const db = JSON.parse(stored)
    
    const faultyRecord = db.faultyRecords?.find((r: FaultyRecord) => r.id === id)
    if (!faultyRecord) return
    
    // Toggle checkbox
    faultyRecord.ifOk = !currentValue
    
    if (!currentValue) {
      // MARKING AS OK
      faultyRecord.reprocess = false
      faultyRecord.actualDate = new Date().toISOString()
      
      // Find batch and order
      let targetBatch: any = null
      let targetOrder: any = null
      
      for (const order of (db.orders || [])) {
        const batch = (order.splits || []).find((b: any) => b.batchId === faultyRecord.batchId)
        if (batch) {
          targetBatch = batch
          targetOrder = order
          break
        }
      }
      
      if (targetBatch && targetOrder) {
        // Extract faulty from
        let faultyFrom = ''
        if (faultyRecord.remarks) {
          const match = faultyRecord.remarks.match(/\[([^\]]+)\]/)
          if (match && match[1]) {
            faultyFrom = match[1]
          }
        }
        
        const processRoute = targetOrder.processRoute || []
        const nextProcess = getNextProcess(faultyFrom, processRoute)
        
        // CRITICAL FIX: Keep faulty flag but change active to false
        // This preserves the faulty history while allowing the batch to continue
        if (targetBatch.fmsFaulty) {
          targetBatch.fmsFaulty.active = false
          // Keep the rest of fmsFaulty data for history
        }
        
        // Get current process code from name using processList / PROCESS_MAP
        const currentProcessTag = faultyFrom.replace('-FMS', '')
        let currentProcessCode = ''
        const processList2 = loadOrSeedProcessList()
        const nameToCode2: Record<string, string> = {}
        processList2.forEach(p => { nameToCode2[p.name] = p.code })
        Object.entries(PROCESS_MAP).forEach(([code, name]) => {
          if (!nameToCode2[name]) nameToCode2[name] = code
        })
        currentProcessCode = nameToCode2[currentProcessTag] || ''
        
        if (currentProcessCode) {
          // CRITICAL FIX: Properly update FMS process tracking
          // Initialize FMS objects if needed
          if (!targetBatch.fmsDispatch) targetBatch.fmsDispatch = {}
          if (!targetBatch.fmsActiveProcesses) targetBatch.fmsActiveProcesses = {}
          if (!targetBatch.fmsActualDates) targetBatch.fmsActualDates = {}
          if (!targetBatch.fmsEnterAt) targetBatch.fmsEnterAt = {}
          
          // Mark current process as DONE by setting actual date
          const today = new Date().toISOString().split('T')[0]
          targetBatch.fmsActualDates[currentProcessCode] = today
          
          // Find next process in route
          const fullRoute = [...processRoute]
          // Add standard end processes if not present
          if (!fullRoute.includes('QA')) fullRoute.push('QA')
          if (!fullRoute.includes('Packing')) fullRoute.push('Packing')
          if (!fullRoute.includes('Dispatch')) fullRoute.push('Dispatch')
          
          const currentIdx = fullRoute.indexOf(currentProcessCode)
          const nextProc = currentIdx >= 0 ? (fullRoute[currentIdx + 1] || '') : ''
          
          if (nextProc) {
            // KEEP current process in active (for history visibility)
            // ADD next process to active
            targetBatch.fmsActiveProcesses[nextProc] = true
            targetBatch.fmsCurrentProcess = nextProc
            targetBatch.fmsDone = false
            
            // Initialize next process dispatch
            const nowIso = new Date().toISOString()
            if (!targetBatch.fmsDispatch[nextProc] || !targetBatch.fmsDispatch[nextProc].sent) {
              targetBatch.fmsDispatch[nextProc] = { sent: true, sentAt: nowIso, source: 'if-ok' }
            }
            if (!targetBatch.fmsEnterAt[nextProc]) {
              targetBatch.fmsEnterAt[nextProc] = nowIso
            }
            
            alert(`✓ Batch ${faultyRecord.batchId} marked as IF OK!\n\nMoved to next process: ${PROCESS_MAP[nextProc] || nextProc}-FMS`)
          } else {
            targetBatch.fmsCurrentProcess = currentProcessCode
            targetBatch.fmsDone = true
            alert(`✓ Batch ${faultyRecord.batchId} marked as IF OK!\n\nThis was the final process.`)
          }
        }
      }
    } else {
      // UNCHECKING
      faultyRecord.actualDate = undefined
    }
    
    localStorage.setItem('dyeflow_db', JSON.stringify(db))
    loadRecords()
  }

  const toggleReprocess = (id: string, currentValue: boolean) => {
    if (currentValue) {
      // UNCHECKING - just unmark
      const stored = localStorage.getItem('dyeflow_db')
      if (!stored) return
      const db = JSON.parse(stored)
      const record = db.faultyRecords?.find((r: FaultyRecord) => r.id === id)
      if (record) {
        record.reprocess = false
        record.actualDate = undefined
        localStorage.setItem('dyeflow_db', JSON.stringify(db))
        loadRecords()
      }
      return
    }

    // CHECKING - open modal for Full/Partial selection
    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return
    const db = JSON.parse(stored)
    
    const faultyRecord = db.faultyRecords?.find((r: FaultyRecord) => r.id === id)
    if (!faultyRecord) return

    // Find batch data
    let targetBatch: any = null
    for (const order of (db.orders || [])) {
      const batch = (order.splits || []).find((b: any) => b.batchId === faultyRecord.batchId)
      if (batch) {
        targetBatch = batch
        break
      }
    }

    if (!targetBatch) {
      alert('Batch data not found!')
      return
    }

    // Open modal with batch details
    setReprocessData({
      recordId: id,
      batchId: faultyRecord.batchId,
      orderNo: faultyRecord.orderNo,
      originalQtyKg: targetBatch.kg || faultyRecord.qtyKg || 0,
      originalQtyMtr: targetBatch.mtr || '',
      originalNoOfTaka: targetBatch.taka || ''
    })
    setReprocessType(null)
    setPartialQty({ kg: 0, mtr: '', taka: '' })
    setShowReprocessModal(true)
  }

  const handleReprocessConfirm = () => {
    if (!reprocessData || !reprocessType) return

    if (reprocessType === 'Partial') {
      // Validate partial quantities
      if (partialQty.kg <= 0 || !partialQty.taka) {
        alert('Please enter valid Qty (KG) and NO. OF TA (both are compulsory)')
        return
      }

      // MTR is compulsory if original batch has MTR data
      if (reprocessData.originalQtyMtr && reprocessData.originalQtyMtr !== '' && !partialQty.mtr) {
        alert('Qty (MTR.) is compulsory for this batch as it has meter data')
        return
      }

      if (partialQty.kg > reprocessData.originalQtyKg) {
        alert(`Partial Qty (KG) cannot exceed original quantity: ${reprocessData.originalQtyKg} kg`)
        return
      }

      const originalTaka = parseInt(reprocessData.originalNoOfTaka) || 0
      const partialTaka = parseInt(partialQty.taka) || 0
      if (partialTaka > originalTaka) {
        alert(`Partial NO. OF TA cannot exceed original: ${originalTaka}`)
        return
      }

      // Validate MTR if provided
      if (reprocessData.originalQtyMtr && partialQty.mtr) {
        const originalMtr = parseFloat(reprocessData.originalQtyMtr) || 0
        const partialMtr = parseFloat(partialQty.mtr) || 0
        if (partialMtr > originalMtr) {
          alert(`Partial Qty (MTR.) cannot exceed original: ${originalMtr} mtr`)
          return
        }
      }
    }

    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return
    const db = JSON.parse(stored)

    // Find the faulty record
    const faultyRecord = db.faultyRecords?.find((r: FaultyRecord) => r.id === reprocessData.recordId)
    if (!faultyRecord) return

    // Find batch and order
    let targetBatch: any = null
    let targetOrder: any = null
    
    for (const order of (db.orders || [])) {
      const batch = (order.splits || []).find((b: any) => b.batchId === faultyRecord.batchId)
      if (batch) {
        targetBatch = batch
        targetOrder = order
        break
      }
    }

    if (!targetBatch || !targetOrder) return

    if (reprocessType === 'Full') {
      // FULL REPROCESS: Copy entire batch to Repairing Order
      if (!db.repairingOrders) db.repairingOrders = []

      const repairingOrder = {
        id: `REP${Date.now()}`,
        orderNo: targetOrder.orderNumber || faultyRecord.orderNo,
        batchId: faultyRecord.batchId,
        party: targetOrder.party || faultyRecord.party,
        subParty: targetOrder.subParty || '',
        salesPerson: targetOrder.salesPerson || '',
        article: targetOrder.article || '',
        blend: targetOrder.blend || '',
        color: targetOrder.color || '',
        qtyKg: targetBatch.kg || 0,
        qtyMtr: targetBatch.mtr || '',
        noOfTaka: targetBatch.taka || '',
        processRoute: (targetOrder.processRoute || []).join('/'),
        orderRemarks: targetOrder.remarks || '',
        issueType: faultyRecord.faultyType || 'Reprocess Required',
        issueDescription: faultyRecord.remarks || faultyRecord.faultyRemarks || 'Full batch sent for reprocessing',
        reportedBy: 'Faulty Management',
        reportedDate: new Date().toISOString(),
        priority: 'High' as 'Low' | 'Medium' | 'High' | 'Critical',
        status: 'Pending' as 'Pending' | 'In Repair' | 'Completed' | 'Rejected',
        assignedTo: targetOrder.supervisor || '',
        supervisor: targetOrder.supervisor || ''
      }

      db.repairingOrders.push(repairingOrder)

      // Mark reprocess checkbox
      faultyRecord.reprocess = true
      faultyRecord.ifOk = false
      faultyRecord.actualDate = new Date().toISOString()

      localStorage.setItem('dyeflow_db', JSON.stringify(db))
      setShowReprocessModal(false)
      loadRecords()
      alert(`✓ Full batch sent to Repairing Order!

Batch ${faultyRecord.batchId} moved to Repairing Order page.`)

    } else if (reprocessType === 'Partial') {
      // PARTIAL REPROCESS: Split batch
      if (!db.repairingOrders) db.repairingOrders = []

      const partialKg = parseFloat(partialQty.kg.toString()) || 0
      const partialTaka = parseInt(partialQty.taka) || 0
      const remainingKg = reprocessData.originalQtyKg - partialKg
      const originalTaka = parseInt(reprocessData.originalNoOfTaka) || 0
      const remainingTaka = originalTaka - partialTaka

      // Create repairing order for partial quantity
      const repairingOrder = {
        id: `REP${Date.now()}`,
        orderNo: targetOrder.orderNumber || faultyRecord.orderNo,
        batchId: `${faultyRecord.batchId}-R`, // Add -R suffix for repairing portion
        party: targetOrder.party || faultyRecord.party,
        subParty: targetOrder.subParty || '',
        salesPerson: targetOrder.salesPerson || '',
        article: targetOrder.article || '',
        blend: targetOrder.blend || '',
        color: targetOrder.color || '',
        qtyKg: partialKg,
        qtyMtr: partialQty.mtr || '',
        noOfTaka: String(partialTaka),
        processRoute: (targetOrder.processRoute || []).join('/'),
        orderRemarks: targetOrder.remarks || '',
        issueType: faultyRecord.faultyType || 'Partial Reprocess',
        issueDescription: `Partial batch (${partialKg} kg, ${partialTaka} TA) sent for reprocessing. ${faultyRecord.remarks || faultyRecord.faultyRemarks || ''}`,
        reportedBy: 'Faulty Management',
        reportedDate: new Date().toISOString(),
        priority: 'High' as 'Low' | 'Medium' | 'High' | 'Critical',
        status: 'Pending' as 'Pending' | 'In Repair' | 'Completed' | 'Rejected',
        assignedTo: targetOrder.supervisor || '',
        supervisor: targetOrder.supervisor || ''
      }

      db.repairingOrders.push(repairingOrder)

      // Update original batch with REMAINING quantities
      targetBatch.kg = remainingKg
      if (partialQty.mtr) {
        const originalMtr = parseFloat(reprocessData.originalQtyMtr) || 0
        const partialMtr = parseFloat(partialQty.mtr) || 0
        targetBatch.mtr = originalMtr - partialMtr
      }
      targetBatch.taka = remainingTaka

      // Move remaining batch to next process (same as IF OK logic)
      let faultyFrom = ''
      if (faultyRecord.remarks) {
        const match = faultyRecord.remarks.match(/\[([^\]]+)\]/)
        if (match && match[1]) {
          faultyFrom = match[1]
        }
      }

      const processRoute = targetOrder.processRoute || []
      
      // CRITICAL: Keep faulty flag but change active to false
      if (targetBatch.fmsFaulty) {
        targetBatch.fmsFaulty.active = false
      }
      
      // Get current process code
      const currentProcessTag = faultyFrom.replace('-FMS', '')
      // Get current process code using lib/processMap
      const processList = loadOrSeedProcessList()
      let currentProcessCode = ''
      for (const p of processList) {
        if (p.name === currentProcessTag) {
          currentProcessCode = p.code
          break
        }
      }
      // Fallback: check built-in PROCESS_MAP by value
      if (!currentProcessCode) {
        for (const [code, name] of Object.entries(PROCESS_MAP)) {
          if (name === currentProcessTag) {
            currentProcessCode = code
            break
          }
        }
      }
      
      if (currentProcessCode) {
        // Initialize FMS objects if needed
        if (!targetBatch.fmsDispatch) targetBatch.fmsDispatch = {}
        if (!targetBatch.fmsActiveProcesses) targetBatch.fmsActiveProcesses = {}
        if (!targetBatch.fmsActualDates) targetBatch.fmsActualDates = {}
        if (!targetBatch.fmsEnterAt) targetBatch.fmsEnterAt = {}
        
        // Mark current process as DONE
        const today = new Date().toISOString().split('T')[0]
        targetBatch.fmsActualDates[currentProcessCode] = today
        
        // Find next process
        const fullRoute = [...processRoute]
        if (!fullRoute.includes('QA')) fullRoute.push('QA')
        if (!fullRoute.includes('Packing')) fullRoute.push('Packing')
        if (!fullRoute.includes('Dispatch')) fullRoute.push('Dispatch')
        
        const currentIdx = fullRoute.indexOf(currentProcessCode)
        const nextProc = currentIdx >= 0 ? (fullRoute[currentIdx + 1] || '') : ''
        
        if (nextProc) {
          targetBatch.fmsActiveProcesses[nextProc] = true
          targetBatch.fmsCurrentProcess = nextProc
          targetBatch.fmsDone = false
          
          const nowIso = new Date().toISOString()
          if (!targetBatch.fmsDispatch[nextProc] || !targetBatch.fmsDispatch[nextProc].sent) {
            targetBatch.fmsDispatch[nextProc] = { sent: true, sentAt: nowIso, source: 'partial-reprocess' }
          }
          if (!targetBatch.fmsEnterAt[nextProc]) {
            targetBatch.fmsEnterAt[nextProc] = nowIso
          }
        }
      }

      // Mark reprocess checkbox
      faultyRecord.reprocess = true
      faultyRecord.ifOk = false
      faultyRecord.actualDate = new Date().toISOString()

      localStorage.setItem('dyeflow_db', JSON.stringify(db))
      setShowReprocessModal(false)
      loadRecords()
      alert(`✓ Partial reprocess completed!

Repairing Order: ${partialKg} kg, ${partialTaka} TA
Remaining Batch: ${remainingKg} kg, ${remainingTaka} TA → moved to next process`)
    }
  }

  const openDeleteModal = (id: string, batchId: string) => {
    setDeleteData({ id, batchId })
    setShowDeleteModal(true)
  }

  const closeDeleteModal = () => {
    setShowDeleteModal(false)
    setDeleteData(null)
  }

  const confirmDelete = () => {
    if (!deleteData) return
    
    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return
    const db = JSON.parse(stored)
    
    db.faultyRecords = (db.faultyRecords || []).filter((r: FaultyRecord) => r.id !== deleteData.id)
    
    for (const order of (db.orders || [])) {
      const batch = (order.splits || []).find((b: any) => b.batchId === deleteData.batchId)
      if (batch) {
        batch.faulty = false
        
        if (batch.fmsFaulty) {
          batch.fmsFaulty = {
            active: false,
            processCode: '',
            flaggedAt: '',
            note: ''
          }
        }
        
        if (batch.fmsActualDates) {
          const faultyRecord = (db.faultyRecords || []).find((r: any) => r.id === deleteData.id)
          if (faultyRecord && faultyRecord.remarks) {
            const match = faultyRecord.remarks.match(/\[([^\]]+)\]/)
            if (match && match[1]) {
              const processTag = match[1]
              const processCode = processTag.replace('-FMS', '')
              if (batch.fmsActualDates[processCode]) {
                delete batch.fmsActualDates[processCode]
              }
            }
          }
        }
        
        break
      }
    }
    
    localStorage.setItem('dyeflow_db', JSON.stringify(db))
    closeDeleteModal()
    loadRecords()
    alert(`✓ Faulty record deleted successfully!\n\nBatch ${deleteData.batchId} is now available for Done and Faulty marking.`)
  }

  const exportToExcel = () => {
    if (enrichedRecords.length === 0) { alert('No faulty records to export.'); return }
    const headers = ['TIME STAMP','BATCH ID','ORDER #','PARTY','SUB PARTY','SALES PERSON','ARTICLE','BLEND','WIDTH','GSM','COLOR','LAB NO.','LOT NO.','CHALLAN NO.','QTY (KG)','QTY (MTR.)','NO. OF TA','TYPE OF FINISH','TYPE OF PACKING','REMARKS','SUPERVISOR','PROCESS ROUTE','FAULTY FROM','FAULTY REMARKS','PLANNED DATE','ACTUAL DATE','TIME DELAY','IF OK','REPROCESS','STATUS']
    const rows = enrichedRecords.map(r => [
      formatDateTimeDDMMYYYY(r.faultyMarkedAt || r.timestamp || ''),
      r.batchId, r.orderNo || '-', r.party || '-', r.subParty || '-', r.salesPerson || '-',
      r.article || '-', r.blend || '-', r.width || '-', r.gsm || '-', r.color || '-',
      r.labNo || '-', r.lotNo || '-', r.challanNo || '-', r.qtyKg || 0,
      r.qtyMtr || '-', r.noOfTaka || '-', r.typeOfFinish || '-', r.typeOfPacking || '-',
      r.orderRemarks || '-', r.supervisor || '-', r.processRoute || '-',
      r.faultyFrom || '-', r.faultyRemarks || '-',
      formatDateTimeDDMMYYYY(r.plannedDate || ''),
      (r.ifOk || r.reprocess) ? formatDateDDMMYYYY(r.actualDate || '') : '-',
      r.timeDelay || '-',
      r.ifOk ? 'Yes' : 'No',
      r.reprocess ? 'Yes' : 'No',
      r.status || '-'
    ])
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
    ws['!cols'] = headers.map(() => ({ wch: 16 }))
    XLSX.utils.book_append_sheet(wb, ws, 'Faulty Records')
    const dateStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-')
    XLSX.writeFile(wb, `DyeFlow-Faulty-${dateStr}.xlsx`)
  }

  const visibleColumns = columns.filter(col => col.visible)

  const getCellValue = (record: FaultyRecord, columnId: string): any => {
    switch (columnId) {
      case 'timestamp': return formatDateTimeDDMMYYYY(record.faultyMarkedAt || record.timestamp || '')
      case 'batchId': return record.batchId
      case 'orderNo': return record.orderNo || '-'
      case 'party': return record.party || '-'
      case 'subParty': return record.subParty || '-'
      case 'salesPerson': return record.salesPerson || '-'
      case 'article': return record.article || '-'
      case 'blend': return record.blend || '-'
      case 'width': return record.width || '-'
      case 'gsm': return record.gsm || '-'
      case 'color': return record.color || '-'
      case 'labNo': return record.labNo || '-'
      case 'lotNo': return record.lotNo || '-'
      case 'challanNo': return record.challanNo || '-'
      case 'qtyKg': return record.qtyKg || 0
      case 'qtyMtr': return record.qtyMtr || '-'
      case 'noOfTaka': return record.noOfTaka || '-'
      case 'typeOfFinish': return record.typeOfFinish || '-'
      case 'typeOfPacking': return record.typeOfPacking || '-'
      case 'supervisor': return record.supervisor || '-'
      case 'processRoute': return record.processRoute || '-'
      case 'faultyFrom': return record.faultyFrom || 'Unknown'
      case 'plannedDate': return formatDateTimeDDMMYYYY(record.plannedDate || '')
      case 'actualDate': 
        // Only show actual date if IF OK or REPROCESS is checked
        if (record.ifOk || record.reprocess) {
          return formatDateDDMMYYYY(record.actualDate || '')
        }
        return '-'
      case 'timeDelay': return record.timeDelay || '-'
      case 'orderRemarks': return record.orderRemarks || '-'
      case 'faultyRemarks': return record.faultyRemarks || '-'
      default: return '-'
    }
  }

  return (
    <div className="content">
      <div className="card">
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <span className="card-title">Faulty Management</span>
            <div style={{ fontSize: '12px', color: '#6B7280', marginTop: '4px' }}>
              {enrichedRecords.length} faulty batch{enrichedRecords.length !== 1 ? 'es' : ''}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button 
              onClick={exportToExcel}
              style={{
                padding: '8px 16px', fontSize: '13px', fontWeight: 600,
                border: 'none', borderRadius: '6px',
                background: '#1D9E75', color: '#fff', cursor: 'pointer'
              }}
              title={`Export ${enrichedRecords.length} faulty records to Excel`}
            >
              ⬇ Export (.xlsx)
            </button>
            <button 
              onClick={() => setShowColumnSettings(!showColumnSettings)}
              style={{
                padding: '8px 16px',
                fontSize: '13px',
                fontWeight: 600,
                border: '1px solid #D1D5DB',
                borderRadius: '6px',
                background: 'white',
                cursor: 'pointer'
              }}
            >
              ⚙️ Column Settings
            </button>
            <button 
              className="primary" 
              onClick={() => setIsModalOpen(true)}
              style={{
                padding: '8px 16px',
                fontSize: '13px',
                fontWeight: 600
              }}
            >
              + Add Faulty Entry
            </button>
          </div>
        </div>

        {showColumnSettings && (
          <div style={{ 
            padding: '16px', 
            background: '#F9FAFB', 
            borderBottom: '1px solid #E5E7EB',
            maxHeight: '400px',
            overflowY: 'auto'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 600 }}>Show/Hide Columns</h3>
              <button 
                onClick={resetColumns}
                style={{
                  padding: '4px 12px',
                  fontSize: '12px',
                  border: '1px solid #D1D5DB',
                  borderRadius: '4px',
                  background: 'white',
                  cursor: 'pointer'
                }}
              >
                Reset to Default
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '8px' }}>
              {columns.map(col => (
                <label key={col.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={col.visible}
                    onChange={() => toggleColumnVisibility(col.id)}
                    style={{ cursor: 'pointer' }}
                  />
                  <span>{col.label}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {enrichedRecords.length === 0 ? (
          <div className="empty-state" style={{ padding: '60px 20px' }}>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>🔍</div>
            <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '8px', color: '#111827' }}>
              No Faulty Batches
            </div>
            <div style={{ fontSize: '14px', color: '#6B7280' }}>
              Faulty batches will appear here automatically when marked in process pages.
            </div>
          </div>
        ) : (
          <div style={{ overflow: 'auto', maxHeight: 'calc(100vh - 250px)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: '#F9FAFB' }}>
                <tr>
                  {visibleColumns.map(col => (
                    <th 
                      key={col.id}
                      style={{
                        padding: '10px 8px',
                        textAlign: 'left',
                        fontSize: '11px',
                        fontWeight: 700,
                        color: '#374151',
                        borderBottom: '2px solid #E5E7EB',
                        whiteSpace: 'nowrap',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                        width: `${col.width}px`,
                        minWidth: `${col.minWidth}px`,
                        position: 'relative'
                      }}
                    >
                      {col.label}
                      <div
                        onMouseDown={(e) => startResize(col.id, e)}
                        style={{
                          position: 'absolute',
                          right: 0,
                          top: 0,
                          bottom: 0,
                          width: '5px',
                          cursor: 'col-resize',
                          userSelect: 'none',
                          background: resizingColumn === col.id ? '#3B82F6' : 'transparent'
                        }}
                        onMouseEnter={(e) => {
                          if (!resizingColumn) {
                            e.currentTarget.style.background = '#D1D5DB'
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!resizingColumn) {
                            e.currentTarget.style.background = 'transparent'
                          }
                        }}
                      />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {enrichedRecords.map((record, idx) => (
                  <tr
                    key={record.id}
                    style={{
                      background: record.ifOk 
                        ? '#D1FAE5' 
                        : record.reprocess
                        ? '#FEF3C7'
                        : (idx % 2 === 0 ? '#FFFFFF' : '#F9FAFB'),
                      borderBottom: '1px solid #F3F4F6',
                      opacity: record.ifOk ? 0.8 : 1
                    }}
                  >
                    {visibleColumns.map(col => {
                      if (col.id === 'ifOk') {
                        return (
                          <td key={col.id} style={{ ...tdStyle, textAlign: 'center', width: `${col.width}px` }}>
                            <input
                              type="checkbox"
                              checked={record.ifOk || false}
                              onChange={() => toggleIfOk(record.id, record.ifOk || false)}
                              style={{
                                width: '18px',
                                height: '18px',
                                cursor: 'pointer',
                                accentColor: '#10B981'
                              }}
                              title="Mark as OK"
                            />
                          </td>
                        )
                      }
                      
                      if (col.id === 'reprocess') {
                        return (
                          <td key={col.id} style={{ ...tdStyle, textAlign: 'center', width: `${col.width}px` }}>
                            <input
                              type="checkbox"
                              checked={record.reprocess || false}
                              onChange={() => toggleReprocess(record.id, record.reprocess || false)}
                              style={{
                                width: '18px',
                                height: '18px',
                                cursor: 'pointer',
                                accentColor: '#F59E0B'
                              }}
                              title="Mark for Reprocess"
                            />
                          </td>
                        )
                      }
                      
                      if (col.id === 'delete') {
                        return (
                          <td key={col.id} style={{ ...tdStyle, textAlign: 'center', width: `${col.width}px` }}>
                            <button
                              onClick={() => openDeleteModal(record.id, record.batchId)}
                              style={{
                                padding: '5px 10px',
                                fontSize: '11px',
                                fontWeight: 600,
                                border: 'none',
                                borderRadius: '4px',
                                background: '#DC2626',
                                color: 'white',
                                cursor: 'pointer',
                                whiteSpace: 'nowrap'
                              }}
                              title="Delete faulty record and reset batch status"
                            >
                              Delete
                            </button>
                          </td>
                        )
                      }
                      
                      const value = getCellValue(record, col.id)
                      const cellStyle = { ...tdStyle, width: `${col.width}px` }
                      
                      if (col.id === 'batchId') {
                        cellStyle.fontWeight = 700
                        cellStyle.color = '#EF4444'
                      } else if (col.id === 'orderNo' || col.id === 'article') {
                        cellStyle.fontWeight = 600
                      } else if (col.id === 'blend') {
                        cellStyle.fontSize = '11px'
                        cellStyle.color = '#6B7280'
                      } else if (col.id === 'qtyKg') {
                        cellStyle.fontWeight = 700
                      } else if (col.id === 'processRoute') {
                        cellStyle.fontWeight = 600
                        cellStyle.color = '#3B82F6'
                      } else if (col.id === 'faultyFrom') {
                        return (
                          <td key={col.id} style={cellStyle}>
                            <span style={{
                              padding: '3px 10px',
                              borderRadius: '12px',
                              fontSize: '11px',
                              fontWeight: 600,
                              background: '#DBEAFE',
                              color: '#1E40AF'
                            }}>
                              {value}
                            </span>
                          </td>
                        )
                      } else if (col.id === 'plannedDate') {
                        cellStyle.fontWeight = 600
                        cellStyle.color = '#3B82F6'
                      } else if (col.id === 'actualDate') {
                        cellStyle.fontWeight = 600
                        cellStyle.color = (record.ifOk || record.reprocess) ? '#10B981' : '#9CA3AF'
                      } else if (col.id === 'timeDelay') {
                        cellStyle.fontWeight = 700
                        // Green for time left (-) or early completion, Red for delay (+)
                        if (value === '' || value === '-') {
                          cellStyle.color = '#9CA3AF' // Gray for empty
                        } else if (value.startsWith('+')) {
                          cellStyle.color = '#EF4444' // Red for delay
                        } else {
                          cellStyle.color = '#10B981' // Green for time left
                        }
                      } else if (col.id === 'orderRemarks' || col.id === 'faultyRemarks') {
                        cellStyle.maxWidth = `${col.width}px`
                        cellStyle.whiteSpace = 'normal'
                        cellStyle.wordWrap = 'break-word'
                      }
                      
                      return (
                        <td key={col.id} style={cellStyle}>
                          {value}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {isModalOpen && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Add Faulty Entry</span>
              <button className="small" onClick={closeModal}>✕</button>
            </div>
            <div className="modal-body">
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
                <label>Order Number</label>
                <input
                  type="text"
                  value={formData.orderNo}
                  onChange={(e) => setFormData({ ...formData, orderNo: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Party</label>
                <input
                  type="text"
                  value={formData.party}
                  onChange={(e) => setFormData({ ...formData, party: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Faulty Type *</label>
                <select value={formData.faultyType} onChange={(e) => setFormData({ ...formData, faultyType: e.target.value })}>
                  <option value="">Select Type</option>
                  <option value="Shade Variation">Shade Variation</option>
                  <option value="Crease Mark">Crease Mark</option>
                  <option value="Oil Stain">Oil Stain</option>
                  <option value="Hole/Tear">Hole/Tear</option>
                  <option value="Uneven Dyeing">Uneven Dyeing</option>
                  <option value="Process Defect">Process Defect</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div className="form-group">
                <label>Quantity (Kg)</label>
                <input
                  type="number"
                  value={formData.quantity}
                  onChange={(e) => setFormData({ ...formData, quantity: parseFloat(e.target.value) || 0 })}
                  min="0"
                  step="0.01"
                />
              </div>
              <div className="form-group">
                <label>Remarks</label>
                <textarea
                  value={formData.remarks}
                  onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
                  rows={3}
                  placeholder="Additional details about the fault"
                />
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={closeModal}>Cancel</button>
              <button className="primary" onClick={saveRecord}>Add Entry</button>
            </div>
          </div>
        </div>
      )}

      {showDeleteModal && deleteData && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999
        }}>
          <div style={{
            background: 'white',
            borderRadius: '8px',
            padding: '24px',
            width: '90%',
            maxWidth: '500px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
          }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: 600, color: '#111827' }}>
              Delete Batch from Faulty Management?
            </h3>
            <div style={{ margin: '0 0 20px 0', fontSize: '14px', color: '#374151', lineHeight: '1.6' }}>
              <p style={{ margin: '0 0 12px 0', fontWeight: 600 }}>
                Batch: <span style={{ color: '#EF4444', fontWeight: 700 }}>{deleteData.batchId}</span>
              </p>
              <p style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#6B7280' }}>
                This will:
              </p>
              <ul style={{ margin: '0', paddingLeft: '20px', fontSize: '13px', color: '#6B7280', lineHeight: '1.8' }}>
                <li style={{ marginBottom: '4px' }}>Remove from Faulty Management</li>
                <li style={{ marginBottom: '4px' }}>Unmark as faulty in process pages</li>
                <li style={{ marginBottom: '4px' }}>Clear actual date timestamp</li>
                <li>Make batch available for Done/Faulty again</li>
              </ul>
            </div>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={closeDeleteModal}
                style={{
                  padding: '10px 20px',
                  fontSize: '14px',
                  border: '1px solid #D1D5DB',
                  borderRadius: '6px',
                  background: 'white',
                  color: '#374151',
                  cursor: 'pointer',
                  fontWeight: 500
                }}
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                style={{
                  padding: '10px 20px',
                  fontSize: '14px',
                  border: 'none',
                  borderRadius: '6px',
                  background: '#DC2626',
                  color: 'white',
                  cursor: 'pointer',
                  fontWeight: 600
                }}
              >
                Delete Batch
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reprocess Modal */}
      {showReprocessModal && reprocessData && (
        <div className="modal-overlay" onClick={() => setShowReprocessModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px' }}>
            <div className="modal-header">
              <span className="modal-title">Reprocess Batch</span>
              <button className="small" onClick={() => setShowReprocessModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{ marginBottom: '20px', padding: '12px', background: '#F9FAFB', borderRadius: '6px' }}>
                <div style={{ fontSize: '12px', color: '#6B7280', marginBottom: '8px' }}>Batch Details:</div>
                <div style={{ fontSize: '14px', fontWeight: 600, color: '#111827', marginBottom: '4px' }}>
                  Batch: <span style={{ color: '#EF4444' }}>{reprocessData.batchId}</span>
                </div>
                <div style={{ fontSize: '13px', color: '#374151', marginBottom: '2px' }}>Order: {reprocessData.orderNo}</div>
                <div style={{ fontSize: '13px', color: '#374151', marginBottom: '2px' }}>Qty (KG): {reprocessData.originalQtyKg} kg</div>
                <div style={{ fontSize: '13px', color: '#374151', marginBottom: '2px' }}>Qty (MTR.): {reprocessData.originalQtyMtr || '-'}</div>
                <div style={{ fontSize: '13px', color: '#374151' }}>NO. OF TA: {reprocessData.originalNoOfTaka}</div>
              </div>

              <div className="form-group">
                <label style={{ fontWeight: 600, marginBottom: '12px', display: 'block' }}>Select Reprocess Type *</label>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button
                    onClick={() => setReprocessType('Full')}
                    style={{
                      flex: 1,
                      padding: '12px',
                      fontSize: '14px',
                      fontWeight: 600,
                      border: reprocessType === 'Full' ? '2px solid #3B82F6' : '1px solid #D1D5DB',
                      borderRadius: '8px',
                      background: reprocessType === 'Full' ? '#EFF6FF' : 'white',
                      color: reprocessType === 'Full' ? '#1E40AF' : '#374151',
                      cursor: 'pointer'
                    }}
                  >
                    📦 Full
                  </button>
                  <button
                    onClick={() => setReprocessType('Partial')}
                    style={{
                      flex: 1,
                      padding: '12px',
                      fontSize: '14px',
                      fontWeight: 600,
                      border: reprocessType === 'Partial' ? '2px solid #3B82F6' : '1px solid #D1D5DB',
                      borderRadius: '8px',
                      background: reprocessType === 'Partial' ? '#EFF6FF' : 'white',
                      color: reprocessType === 'Partial' ? '#1E40AF' : '#374151',
                      cursor: 'pointer'
                    }}
                  >
                    ✂️ Partial
                  </button>
                </div>
              </div>

              {reprocessType === 'Full' && (
                <div style={{ padding: '12px', background: '#EFF6FF', borderRadius: '6px', marginTop: '16px' }}>
                  <div style={{ fontSize: '13px', color: '#1E40AF', fontWeight: 600, marginBottom: '4px' }}>
                    ℹ️ Full Reprocess
                  </div>
                  <div style={{ fontSize: '12px', color: '#3B82F6' }}>
                    The entire batch will be sent to the Repairing Order page for reprocessing.
                  </div>
                </div>
              )}

              {reprocessType === 'Partial' && (
                <div style={{ marginTop: '16px' }}>
                  <div style={{ padding: '12px', background: '#FFFBEB', borderRadius: '6px', marginBottom: '16px' }}>
                    <div style={{ fontSize: '13px', color: '#92400E', fontWeight: 600, marginBottom: '4px' }}>
                      ⚠️ Partial Reprocess
                    </div>
                    <div style={{ fontSize: '12px', color: '#D97706' }}>
                      Enter the quantity to send for reprocessing. The remaining quantity will continue to the next process.
                    </div>
                  </div>

                  <div className="form-group">
                    <label>Qty (KG) * <span style={{ fontSize: '11px', color: '#6B7280' }}>(Max: {reprocessData.originalQtyKg} kg)</span></label>
                    <input
                      type="number"
                      value={partialQty.kg || ''}
                      onChange={(e) => setPartialQty({ ...partialQty, kg: parseFloat(e.target.value) || 0 })}
                      placeholder="Enter quantity in KG"
                      min="0"
                      max={reprocessData.originalQtyKg}
                      step="0.01"
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label>
                      Qty (MTR.) {reprocessData.originalQtyMtr && reprocessData.originalQtyMtr !== '' ? (
                        <span style={{ fontSize: '11px', color: '#DC2626' }}>* (Compulsory - Max: {reprocessData.originalQtyMtr} mtr)</span>
                      ) : (
                        <span style={{ fontSize: '11px', color: '#6B7280' }}>(Optional)</span>
                      )}
                    </label>
                    <input
                      type="number"
                      value={partialQty.mtr || ''}
                      onChange={(e) => setPartialQty({ ...partialQty, mtr: e.target.value })}
                      placeholder="Enter quantity in MTR"
                      min="0"
                      step="0.01"
                      required={!!(reprocessData.originalQtyMtr && reprocessData.originalQtyMtr !== '')}
                    />
                  </div>

                  <div className="form-group">
                    <label>NO. OF TA * <span style={{ fontSize: '11px', color: '#6B7280' }}>(Max: {reprocessData.originalNoOfTaka})</span></label>
                    <input
                      type="number"
                      value={partialQty.taka || ''}
                      onChange={(e) => setPartialQty({ ...partialQty, taka: e.target.value })}
                      placeholder="Enter number of taka"
                      min="0"
                      max={parseInt(reprocessData.originalNoOfTaka) || 0}
                      required
                    />
                  </div>

                  {partialQty.kg > 0 && partialQty.taka && (
                    <div style={{ padding: '12px', background: '#D1FAE5', borderRadius: '6px', marginTop: '12px' }}>
                      <div style={{ fontSize: '12px', color: '#065F46', fontWeight: 600, marginBottom: '6px' }}>Split Summary:</div>
                      <div style={{ fontSize: '12px', color: '#047857' }}>
                        🔧 Repairing: {partialQty.kg} kg, {partialQty.taka} TA
                      </div>
                      <div style={{ fontSize: '12px', color: '#047857' }}>
                        ➡️ Next Process: {(reprocessData.originalQtyKg - partialQty.kg).toFixed(2)} kg, {(parseInt(reprocessData.originalNoOfTaka) || 0) - (parseInt(partialQty.taka) || 0)} TA
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button onClick={() => setShowReprocessModal(false)}>Cancel</button>
              <button 
                className="primary" 
                onClick={handleReprocessConfirm}
                disabled={!reprocessType}
                style={{ opacity: !reprocessType ? 0.5 : 1 }}
              >
                {reprocessType === 'Full' ? 'Send to Repairing Order' : reprocessType === 'Partial' ? 'Split & Reprocess' : 'Select Type'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const tdStyle: React.CSSProperties = {
  padding: '12px 8px',
  fontSize: '12px',
  color: '#2D3748',
  whiteSpace: 'nowrap'
}
