'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import BatchCollaborationModal from '@/components/BatchCollaborationModal'
import { usePermission, useSupervisorFilter, AccessDenied } from '@/lib/permissions'

// Helper functions
const getShadeTypeByColor = (color: string): string => {
  const c = (color || '').toLowerCase()
  if (c.includes('white') || c.includes('bleach') || c.includes('optical')) return 'White'
  if (c.includes('light') || c.includes('pale') || c.includes('cream') || c.includes('beige') || c.includes('pastel')) return 'Light'
  if (c.includes('dark') || c.includes('black') || c.includes('navy') || c.includes('deep')) return 'Dark'
  if (c.includes('medium') || c.includes('normal')) return 'Medium'
  return 'Medium'
}

const getShadeTypeRank = (color: string): number => {
  const shade = getShadeTypeByColor(color)
  if (shade === 'Light') return 1
  if (shade === 'Medium') return 2
  if (shade === 'Dark') return 3
  if (shade === 'Extra Dark') return 4
  return 99  // For White and others
}

const normalizeShadeKey = (name: string): string => {
  return (name || '').toLowerCase().trim().replace(/\s+/g, ' ')
}

const getShadeMasterTypeByColor = (color: string): string => {
  const raw = String(color || '').trim()
  if (!raw) return ''
  
  const stored = localStorage.getItem('dyeflow_db')
  if (!stored) return ''
  const db = JSON.parse(stored)
  const rows = db.shadeMaster || []
  
  const key = normalizeShadeKey(raw)
  if (!key) return ''
  
  const exact = rows.find((r: any) => normalizeShadeKey(r.colourName) === key)
  if (exact && exact.colourType) return exact.colourType
  
  const partial = rows.find((r: any) => {
    const rk = normalizeShadeKey(r.colourName)
    return rk && (key.includes(rk) || rk.includes(key))
  })
  
  return partial?.colourType || ''
}

const getProcObj = (code: string) => {
  const stored = localStorage.getItem('dyeflow_db')
  if (!stored) return null
  const db = JSON.parse(stored)
  const processes = db.processes || []
  const found = processes.find((p: any) => p.code === code)
  
  // If process found in database, return it
  if (found) return found
  
  // FALLBACK: If no processes in database, return a simple object with name based on code
  // This mapping converts process codes to full names
  const codeToName: { [key: string]: string } = {
    'C': 'CBR',
    'S': 'SCQ',
    'H': 'Heat-Set',
    'D': 'Dyeing',
    'S2': 'SCQ2',
    'Rx': 'Relax',
    'O': 'Opener',
    'G': 'Ghanti',
    'F': 'Finish',
    'Co': 'Compactor',
    'Tu': 'Tubler',
    'Add': 'Addition',
    'Lev': 'Levelling',
    'Rc': 'RC',
    'Fix': 'Fixing',
    'Wash': 'Washing',
    'Dry': 'Dry',
    'B': 'Brushing',
    'R': 'Raising',
    'K': 'Kundi'
  }
  
  return {
    code: code,
    name: codeToName[code] || code,
    machine: null
  }
}

const isMachineMatch = (batchMachine: string, machine: any): boolean => {
  if (!batchMachine) return false
  if (batchMachine === machine.id) return true
  if (batchMachine === machine.name) return true
  const batchMachineLower = batchMachine.toLowerCase()
  const machineNameLower = (machine.name || '').toLowerCase()
  if (batchMachineLower === machineNameLower) return true
  if (machineNameLower.includes(batchMachineLower) || batchMachineLower.includes(machineNameLower)) return true
  return false
}

const formatDate = (dateStr: string) => {
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

const addWorkingDays = (dateStr: string, daysToAdd: number, machineId?: string): string => {
  if (!dateStr || daysToAdd < 0) return dateStr
  
  const date = new Date(dateStr)
  let daysAdded = 0
  
  // Get holidays from database
  const stored = localStorage.getItem('dyeflow_db')
  const holidays: Set<string> = new Set()
  
  if (stored) {
    const db = JSON.parse(stored)
    
    // Add global holidays (array of strings)
    const globalHolidays = db.holidays || []
    globalHolidays.forEach((date: string) => {
      holidays.add(date)
    })
    
    // Add machine-specific holidays (array of objects)
    const machineHolidays = db.machineHolidays || []
    machineHolidays.forEach((holiday: any) => {
      if (machineId && holiday.machineId === machineId) {
        holidays.add(holiday.date)
      }
    })
  }
  
  while (daysAdded < daysToAdd) {
    date.setDate(date.getDate() + 1)
    const dateString = date.toISOString().slice(0, 10)
    
    // Skip Sundays (day 0) and holidays
    if (date.getDay() !== 0 && !holidays.has(dateString)) {
      daysAdded++
    }
  }
  
  return date.toISOString().slice(0, 10)
}

const getPlannedDateByNumber = (planNumber: number, baseDate: string, machineId?: string): string => {
  if (!planNumber || planNumber < 1) return ''
  
  // Calculate day offset (3 batches per day)
  const dayOffset = Math.floor((planNumber - 1) / 3)
  
  // Use provided base date or today
  const base = baseDate || new Date().toISOString().slice(0, 10)
  
  // CRITICAL: Always start from the NEXT working day, not today
  // This ensures Plan #1 starts on the first available working day
  // Add 1 extra day to offset to skip today and start from tomorrow
  return addWorkingDays(base, dayOffset + 1, machineId)
}

// Column definitions
const COLUMNS = [
  { key: 'batchId', label: 'BATCH ID', defaultWidth: 120, canHide: false },
  { key: 'shadeType', label: 'SHADE', defaultWidth: 100, canHide: true },
  { key: 'timeStamp', label: 'TIME STAMP', defaultWidth: 110, canHide: true },
  { key: 'orderNo', label: 'ORDER NUMBER', defaultWidth: 130, canHide: true },
  { key: 'party', label: 'PARTY', defaultWidth: 150, canHide: true },
  { key: 'subParty', label: 'SUB PARTY', defaultWidth: 150, canHide: true },
  { key: 'salesPerson', label: 'SALES PERSON', defaultWidth: 140, canHide: true },
  { key: 'article', label: 'ARTICLE', defaultWidth: 180, canHide: true },
  { key: 'color', label: 'COLOR', defaultWidth: 150, canHide: true },
  { key: 'labNo', label: 'LAB NO.', defaultWidth: 100, canHide: true },
  { key: 'lotNo', label: 'LOT NO.', defaultWidth: 100, canHide: true },
  { key: 'challanNo', label: 'CHALLAN NO.', defaultWidth: 110, canHide: true },
  { key: 'kg', label: 'QTY (KG)', defaultWidth: 90, canHide: true },
  { key: 'qtyMtr', label: 'QTY (MTR.)', defaultWidth: 100, canHide: true },
  { key: 'noOfTaka', label: 'NO. OF TA', defaultWidth: 90, canHide: true },
  { key: 'typeOfFinish', label: 'TYPE OF FINISH', defaultWidth: 180, canHide: true },
  { key: 'typeOfPacking', label: 'TYPE OF PACKING', defaultWidth: 180, canHide: true },
  { key: 'remarks', label: 'REMARKS', defaultWidth: 200, canHide: true },
  { key: 'supervisor', label: 'SUPERVISOR', defaultWidth: 120, canHide: true },
  { key: 'processName', label: 'PROCESS NAME', defaultWidth: 150, canHide: true },
  { key: 'plannedDate', label: 'PLANNED DATE', defaultWidth: 120, canHide: true },
  { key: 'planNumber', label: 'NO.', defaultWidth: 80, canHide: false },
  { key: 'faulty', label: 'FAULTY', defaultWidth: 80, canHide: true },
  { key: 'status', label: 'STATUS', defaultWidth: 110, canHide: true },
  { key: 'action', label: 'ACTION', defaultWidth: 150, canHide: false }
]

interface ReviewItem {
  type: 'collab' | 'single'
  title: string
  note: string
  batches: any[]
  total: number
  colorKey: string
}

export default function MachinePage() {
  const params = useParams()
  const router = useRouter()
  const machineId = params.machineId as string

  // Permission guard
  const machinePath = `/machines/${machineId}`
  const { canView, canEdit, canDelete, loading: permLoading } = usePermission(machinePath)
  const supervisorFilter = useSupervisorFilter()
  
  const [machine, setMachine] = useState<any>(null)
  const [batches, setBatches] = useState<any[]>([])
  const [filters, setFilters] = useState<{ [key: string]: string }>({})
  const [shadeFilter, setShadeFilter] = useState<string>('all')
  const [filteredBatches, setFilteredBatches] = useState<any[]>([])
  const [columnWidths, setColumnWidths] = useState<{ [key: number]: number }>({})
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(new Set())
  const [showColumnMenu, setShowColumnMenu] = useState(false)
  const [showReviewModal, setShowReviewModal] = useState(false)
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([])
  const [selectedBatches, setSelectedBatches] = useState<Set<string>>(new Set())
  
  // Batch Collaboration Modal state
  const [showCollabModal, setShowCollabModal] = useState(false)
  const [collabBatches, setCollabBatches] = useState<any[]>([])

  useEffect(() => {
    if (!permLoading && !canView) return  // wait for guard
    loadData()
    loadColumnWidths()
    loadHiddenColumns()
  }, [machineId, canView, permLoading])

  useEffect(() => {
    applyFilters()
  }, [batches, filters, shadeFilter])

  const loadHiddenColumns = () => {
    try {
      const stored = localStorage.getItem('dyeflow_hidden_columns')
      if (stored) {
        const state = JSON.parse(stored)
        const key = `machines::${machineId}`
        if (state[key]) {
          setHiddenColumns(new Set(state[key]))
        }
      }
    } catch (e) {
      console.error('Failed to load hidden columns:', e)
    }
  }

  const toggleColumnVisibility = (columnKey: string) => {
    const newHidden = new Set(hiddenColumns)
    if (newHidden.has(columnKey)) {
      newHidden.delete(columnKey)
    } else {
      newHidden.add(columnKey)
    }
    setHiddenColumns(newHidden)
    
    try {
      const stored = localStorage.getItem('dyeflow_hidden_columns')
      const state = stored ? JSON.parse(stored) : {}
      const key = `machines::${machineId}`
      state[key] = Array.from(newHidden)
      localStorage.setItem('dyeflow_hidden_columns', JSON.stringify(state))
    } catch (e) {
      console.error('Failed to save hidden columns:', e)
    }
  }

  const loadColumnWidths = () => {
    try {
      const stored = localStorage.getItem('dyeflow_col_widths')
      if (stored) {
        const state = JSON.parse(stored)
        const key = `machines::${machineId}`
        if (state[key]) {
          setColumnWidths(state[key])
        }
      }
    } catch (e) {
      console.error('Failed to load column widths:', e)
    }
  }

  const saveColumnWidth = (colIndex: number, width: number) => {
    try {
      const stored = localStorage.getItem('dyeflow_col_widths')
      const state = stored ? JSON.parse(stored) : {}
      const key = `machines::${machineId}`
      if (!state[key]) state[key] = {}
      state[key][colIndex] = width
      localStorage.setItem('dyeflow_col_widths', JSON.stringify(state))
      setColumnWidths(prev => ({ ...prev, [colIndex]: width }))
    } catch (e) {
      console.error('Failed to save column width:', e)
    }
  }

  const handleColumnResize = (colIndex: number, startX: number, startWidth: number) => {
    const onMouseMove = (e: MouseEvent) => {
      const newWidth = Math.max(60, startWidth + (e.clientX - startX))
      saveColumnWidth(colIndex, newWidth)
    }

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }

  const loadData = () => {
    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return

    const db = JSON.parse(stored)
    const machinesList = db.machines || []
    const processes = db.processes || []

    const foundMachine = machinesList.find((m: any) => {
      const mId = (m.id || '').toLowerCase()
      const mName = (m.name || '').toLowerCase()
      const urlId = machineId.toLowerCase()
      
      if (mId === urlId) return true
      if (mName === urlId) return true
      
      const mIdSlug = mId.replace(/[^a-z0-9]/g, '-')
      const mNameSlug = mName.replace(/[^a-z0-9]/g, '-')
      const urlIdSlug = urlId.replace(/[^a-z0-9]/g, '-')
      
      if (mIdSlug === urlIdSlug || mNameSlug === urlIdSlug) return true
      
      return false
    })

    if (!foundMachine) return

    setMachine(foundMachine)

    const machineBatches: any[] = []

    for (const order of (db.orders || [])) {
      // Apply supervisor filter
      if (supervisorFilter && order.supervisor !== supervisorFilter) continue
      if (!order.splits || order.splits.length === 0) continue

      for (const batch of order.splits) {
        const processRoute = order.processRoute || []
        
        // NEW LOGIC: Check each process in the route
        // If a batch has multiple processes assigned to this machine, show it multiple times
        let processMatched = false
        
        if (processRoute.length > 0) {
          // Multi-process logic: loop through each process
          processRoute.forEach((processCode: string, processIndex: number) => {
            const proc = processes.find((p: any) => p.code === processCode)
            if (!proc) return  // Process not found in database, skip this process
            
            // Check if this process uses the current machine
            const processMachine = proc.machine || ''
            const matches = isMachineMatch(processMachine, foundMachine)
            
            if (matches) {
              processMatched = true
              const shadeType = getShadeMasterTypeByColor(order.color || '')
              
              // Create a batch entry for this process
              machineBatches.push({
                ...batch,
                batchId: batch.batchId,
                kg: batch.kg,
                date: batch.date || order.deliveryDate,
                status: batch.status || 'done',
                currentProcess: processCode,
                planNumber: batch.planNumber || null,
                
                orderNo: order.orderNumber,
                orderId: order.id,
                timeStamp: order.timestamp,
                party: order.party,
                subParty: order.subParty || order.subparty,
                salesPerson: order.salesPerson || order.salesperson,
                article: order.article,
                color: order.color,
                labNo: order.labNo || order.labno,
                lotNo: order.lotNo || order.lotno,
                challanNo: order.challanNo || order.challannumber,
                qtyMtr: batch.mtr || order.qtyMtr || order.qtymtr,
                noOfTaka: batch.taka || order.noOfTaka || order.nooftaka,
                typeOfFinish: order.typeOfFinish || order.typeoffinish,
                typeOfPacking: order.typeOfPacking || order.typeofpacking,
                remarks: order.remarks,
                supervisor: order.supervisor,
                processRoute: order.processRoute || [],
                
                // CRITICAL: Show FULL process name, not code
                processName: proc.name || processCode,
                processCode: processCode,
                processIndex: processIndex,
                
                plannedDate: batch.planNumber ? getPlannedDateByNumber(batch.planNumber, batch.date || order.deliveryDate, foundMachine.id) : (batch.date || order.deliveryDate),
                
                shadeType: shadeType || getShadeTypeByColor(order.color || ''),
                shadeMasterType: shadeType
              })
            }
          })
        }
        
        // FALLBACK: If no processes matched (either no processRoute or processes not in DB),
        // use old machine-based logic
        if (!processMatched) {
          const batchMachine = batch.machine || order.machine
          if (!batchMachine) continue
          
          const matches = isMachineMatch(batchMachine, foundMachine)
          
          if (matches) {
            // SMART PROCESS NAME DETECTION:
            // Since processes table is empty, try to guess which process based on machine name
            let guessedProcessCode = ''
            const machineName = (foundMachine.name || '').toLowerCase()
            
            // Check if machine name contains process keywords
            if (machineName.includes('dye') || machineName.includes('jet')) {
              guessedProcessCode = 'D'  // Dyeing
            } else if (machineName.includes('scour')) {
              guessedProcessCode = 'S'  // Scouring
            } else if (machineName.includes('finish')) {
              guessedProcessCode = 'F'  // Finishing
            } else if (machineName.includes('compact')) {
              guessedProcessCode = 'C'  // Compacting
            } else if (machineName.includes('heat')) {
              guessedProcessCode = 'H'  // Heat Setting
            } else if (machineName.includes('wash')) {
              guessedProcessCode = 'W'  // Washing
            }
            
            // If we guessed a process and it exists in the route, use it
            // Otherwise, use the first process in the route
            const firstProcess = processRoute.length > 0 ? processRoute[0] : ''
            const displayProcess = (guessedProcessCode && processRoute.includes(guessedProcessCode)) 
              ? guessedProcessCode 
              : firstProcess
            
            const firstProc = displayProcess ? getProcObj(displayProcess) : null
            const shadeType = getShadeMasterTypeByColor(order.color || '')
            
            machineBatches.push({
              ...batch,
              batchId: batch.batchId,
              kg: batch.kg,
              date: batch.date || order.deliveryDate,
              status: batch.status || 'done',
              currentProcess: batch.currentProcess || displayProcess,
              planNumber: batch.planNumber || null,
              
              orderNo: order.orderNumber,
              orderId: order.id,
              timeStamp: order.timestamp,
              party: order.party,
              subParty: order.subParty || order.subparty,
              salesPerson: order.salesPerson || order.salesperson,
              article: order.article,
              color: order.color,
              labNo: order.labNo || order.labno,
              lotNo: order.lotNo || order.lotno,
              challanNo: order.challanNo || order.challannumber,
              qtyMtr: batch.mtr || order.qtyMtr || order.qtymtr,
              noOfTaka: batch.taka || order.noOfTaka || order.nooftaka,
              typeOfFinish: order.typeOfFinish || order.typeoffinish,
              typeOfPacking: order.typeOfPacking || order.typeofpacking,
              remarks: order.remarks,
              supervisor: order.supervisor,
              processRoute: order.processRoute || [],
              processName: firstProc ? firstProc.name : (displayProcess || ''),
              
              plannedDate: batch.planNumber ? getPlannedDateByNumber(batch.planNumber, batch.date || order.deliveryDate, foundMachine.id) : (batch.date || order.deliveryDate),
              
              shadeType: shadeType || getShadeTypeByColor(order.color || ''),
              shadeMasterType: shadeType
            })
          }
        }
      }
    }

    const sorted = machineBatches.sort((a, b) => {
      const aNum = a.planNumber || 0
      const bNum = b.planNumber || 0
      if (aNum > 0 && bNum > 0) return aNum - bNum
      return (b.timeStamp || '').localeCompare(a.timeStamp || '')
    })

    setBatches(sorted)
  }

  const updatePlanNumber = (batchId: string, orderId: string, value: string) => {
    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return

    const db = JSON.parse(stored)
    const n = parseInt(value, 10)
    
    for (const order of db.orders) {
      if (order.id === orderId) {
        const dbBatch = order.splits.find((s: any) => s.batchId === batchId)
        if (dbBatch) {
          dbBatch.planNumber = (!n || n < 1) ? null : n
          localStorage.setItem('dyeflow_db', JSON.stringify(db))
          loadData()
          return
        }
      }
    }
  }

  const toggleFaulty = (batchId: string, orderId: string, currentFaulty: boolean) => {
    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return

    const db = JSON.parse(stored)
    
    for (const order of db.orders) {
      if (order.id === orderId) {
        const dbBatch = order.splits.find((s: any) => s.batchId === batchId)
        if (dbBatch) {
          dbBatch.faulty = !currentFaulty
          
          // If marking as faulty, add to faulty records
          if (!currentFaulty) {
            if (!db.faultyRecords) db.faultyRecords = []
            
            // Check if already exists
            const existingRecord = db.faultyRecords.find((r: any) => r.batchId === batchId)
            
            if (!existingRecord) {
              const newFaultyRecord = {
                id: `FR${Date.now()}`,
                batchId: batchId,
                orderNo: order.orderNumber || '',
                party: order.party || '',
                faultyType: 'Process Defect',
                quantity: parseFloat(dbBatch.kg) || 0,
                date: new Date().toISOString().split('T')[0],
                remarks: `Marked faulty in ${machine?.name || machineId} - ${order.processRoute?.find((p: string) => {
                  const stored = localStorage.getItem('dyeflow_db')
                  if (!stored) return false
                  const db = JSON.parse(stored)
                  const processes = db.processes || []
                  const proc = processes.find((pr: any) => pr.code === p)
                  return proc?.machine === machine?.name || proc?.machine === machine?.id
                })  || 'N/A'}`,
                status: 'open' as 'open' | 'resolved'
              }
              
              db.faultyRecords.push(newFaultyRecord)
            }
          } else {
            // If unmarking as faulty, update status to resolved
            if (db.faultyRecords) {
              const record = db.faultyRecords.find((r: any) => r.batchId === batchId)
              if (record) {
                record.status = 'resolved'
                record.remarks = (record.remarks || '') + ' [Unmarked from process sheet]'
              }
            }
          }
          
          localStorage.setItem('dyeflow_db', JSON.stringify(db))
          loadData()
          return
        }
      }
    }
  }

  const getNumberingReview = () => {
    const capacity = parseFloat(machine?.capacity) || 0
    const targetCapacity = capacity > 0 ? capacity * 0.8 : 0
    
    // Get unnumbered batches
    const unnumbered = batches.filter(b => (!b.planNumber || b.planNumber <= 0) && b.status !== 'done')
    
    if (!unnumbered.length || !targetCapacity) return { items: [], targetCapacity, capacity }
    
    // Group by color
    const byColor: { [key: string]: any[] } = {}
    unnumbered.forEach(batch => {
      const colorKey = normalizeShadeKey(batch.color || '')
      if (!byColor[colorKey]) byColor[colorKey] = []
      byColor[colorKey].push(batch)
    })
    
    const items: ReviewItem[] = []
    const groupedBatchIds = new Set<string>()
    
    // Find combinations
    Object.entries(byColor).forEach(([colorKey, group]) => {
      if (group.length < 2) return
      
      // Try to combine batches of same color
      const bins: { batches: any[], total: number }[] = []
      
      // Sort by quantity descending
      group.slice().sort((a, b) => (parseFloat(b.kg) || 0) - (parseFloat(a.kg) || 0)).forEach(batch => {
        const qty = parseFloat(batch.kg) || 0
        let bin = bins.find(x => x.total + qty <= targetCapacity + 0.001)
        
        if (!bin) {
          bin = { batches: [], total: 0 }
          bins.push(bin)
        }
        
        bin.batches.push(batch)
        bin.total += qty
      })
      
      // Add bins with 2+ batches
      bins.filter(bin => bin.batches.length >= 2).forEach(bin => {
        bin.batches.forEach(b => groupedBatchIds.add(b.batchId))
        
        items.push({
          type: 'collab',
          title: `${bin.batches[0].color} - ${bin.batches[0].processName}`,
          note: `Same colour batches can run together (${bin.total.toFixed(1)} / ${targetCapacity} Kg target)`,
          batches: bin.batches,
          total: bin.total,
          colorKey
        })
      })
    })
    
    // Add single low-quantity batches
    unnumbered.forEach(batch => {
      if (groupedBatchIds.has(batch.batchId)) return
      
      const qty = parseFloat(batch.kg) || 0
      if (qty > 0 && qty < targetCapacity) {
        items.push({
          type: 'single',
          title: `${batch.color} - ${batch.batchId}`,
          note: `Low quantity batch (${qty} / ${targetCapacity} Kg target). Number now or skip for later.`,
          batches: [batch],
          total: qty,
          colorKey: normalizeShadeKey(batch.color || '')
        })
      }
    })
    
    return { items, targetCapacity, capacity }
  }

  const openReviewModal = () => {
    const review = getNumberingReview()
    
    if (!review.items.length) {
      // No items to review, run numbering directly
      confirmNumbering([])
      return
    }
    
    setReviewItems(review.items)
    // Select all by default
    const allBatchIds = new Set<string>()
    review.items.forEach(item => {
      item.batches.forEach(b => allBatchIds.add(b.batchId))
    })
    setSelectedBatches(allBatchIds)
    setShowReviewModal(true)
  }

  const toggleBatchSelection = (batchIds: string[]) => {
    const newSelected = new Set(selectedBatches)
    const allSelected = batchIds.every(id => newSelected.has(id))
    
    if (allSelected) {
      batchIds.forEach(id => newSelected.delete(id))
    } else {
      batchIds.forEach(id => newSelected.add(id))
    }
    
    setSelectedBatches(newSelected)
  }

  const confirmNumbering = (skipBatchIds: string[]) => {
    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return

    const db = JSON.parse(stored)
    
    // Get unnumbered batches (excluding skipped ones)
    const unnumbered = batches.filter(b => {
      if (b.planNumber && b.planNumber > 0) return false
      if (b.status === 'done') return false
      if (skipBatchIds.includes(b.batchId)) return false
      
      // CRITICAL: Check shade master
      const shadeType = getShadeMasterTypeByColor(b.color || '')
      if (!shadeType || shadeType === 'Other') {
        console.log(`Skipping batch ${b.batchId} - color "${b.color}" not in shade master`)
        return false
      }
      
      return true
    })
    
    if (unnumbered.length === 0) {
      alert('⚠️ No batches to number!\n\nAll batch colors must be defined in Shade Master before numbering.')
      setShowReviewModal(false)
      return
    }

    // Get max number
    const existingNumbers = batches
      .filter(b => b.planNumber && b.planNumber > 0)
      .map(b => b.planNumber)
    const maxNumber = existingNumbers.length > 0 ? Math.max(...existingNumbers) : 0

    // Get last shade for circular rotation
    const lastNumberedBatch = batches.find(b => b.planNumber === maxNumber)
    const lastShadeRank = lastNumberedBatch ? getShadeTypeRank(lastNumberedBatch.color) : 1

    const shadeCycle = [1, 2, 3, 4]
    const getCircularShadeWeight = (rank: number, startRank: number) => {
      if (!shadeCycle.includes(rank)) return 99
      const startIdx = Math.max(0, shadeCycle.indexOf(startRank))
      const idx = shadeCycle.indexOf(rank)
      return (idx - startIdx + shadeCycle.length) % shadeCycle.length
    }

    // Sort by shade sequence
    const toNumber = [...unnumbered].sort((a, b) => {
      const aRank = getShadeTypeRank(a.color)
      const bRank = getShadeTypeRank(b.color)
      const shadeDiff = getCircularShadeWeight(aRank, lastShadeRank) - getCircularShadeWeight(bRank, lastShadeRank)
      if (shadeDiff !== 0) return shadeDiff
      
      const dateDiff = (a.date || '9999-12-31').localeCompare(b.date || '9999-12-31')
      if (dateDiff !== 0) return dateDiff
      
      return (a.batchId || '').localeCompare(b.batchId || '')
    })

    // Assign numbers
    let changed = false
    toNumber.forEach((batch, idx) => {
      const newNumber = maxNumber + idx + 1
      
      for (const order of db.orders) {
        if (order.id === batch.orderId) {
          const dbBatch = order.splits.find((s: any) => s.batchId === batch.batchId)
          if (dbBatch) {
            dbBatch.planNumber = newNumber
            changed = true
          }
        }
      }
    })

    if (changed) {
      localStorage.setItem('dyeflow_db', JSON.stringify(db))
      loadData()
      alert(`✅ Numbered ${toNumber.length} batches!\n\nShade sequence: Light → Medium → Dark → Extra Dark → Light...\nMax 3 batches per day.`)
    }
    
    setShowReviewModal(false)
  }

  // Handle collaboration confirmation from modal
  const handleCollaborationConfirm = (
    collabGroups: any[], 
    skipBatchIds: string[]
  ) => {
    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return
    const db = JSON.parse(stored)

    // Get next available plan number
    const maxPlanNumber = Math.max(
      0,
      ...batches.map(b => b.planNumber || 0)
    )
    let currentPlanNumber = maxPlanNumber + 1
    const baseDate = new Date().toISOString().slice(0, 10)

    // Process collaboration groups
    collabGroups.forEach((group: any) => {
      // Assign same plan number to all batches in collaboration group
      group.batches.forEach((batch: any) => {
        const order = db.orders.find((o: any) => o.id === batch.orderId)
        if (!order) return

        const batchIndex = order.splits?.findIndex((s: any) => s.batchId === batch.batchId)
        if (batchIndex === -1 || batchIndex === undefined) return

        const dbBatch = order.splits[batchIndex]

        // CRITICAL: Skip planned date generation for repairing and faulty batches
        if (dbBatch.isRepairingBatch || dbBatch.faulty) {
          console.log(`Skipping planned number for ${dbBatch.isRepairingBatch ? 'repairing' : 'faulty'} batch: ${batch.batchId}`)
          return
        }

        // Assign plan number
        dbBatch.planNumber = currentPlanNumber
        dbBatch.plannedDate = getPlannedDateByNumber(currentPlanNumber, baseDate, machine?.id)
        dbBatch.isCollab = true
        dbBatch.collabGroupId = group.id
      })
      
      currentPlanNumber++
    })

    // Process remaining single batches (not in any group and not skipped)
    const batchesInGroups = new Set(
      collabGroups.flatMap(g => g.batches.map((b: any) => b.batchId))
    )
    
    const singleBatches = batches.filter(b => 
      !b.planNumber && 
      !skipBatchIds.includes(b.batchId) && 
      !batchesInGroups.has(b.batchId) &&
      b.status !== 'done'
    )

    singleBatches.forEach(batch => {
      const order = db.orders.find((o: any) => o.id === batch.orderId)
      if (!order) return

      const batchIndex = order.splits?.findIndex((s: any) => s.batchId === batch.batchId)
      if (batchIndex === -1 || batchIndex === undefined) return

      const dbBatch = order.splits[batchIndex]

      // CRITICAL: Skip planned date generation for repairing and faulty batches
      if (dbBatch.isRepairingBatch || dbBatch.faulty) {
        console.log(`Skipping planned number for ${dbBatch.isRepairingBatch ? 'repairing' : 'faulty'} batch: ${batch.batchId}`)
        return
      }

      dbBatch.planNumber = currentPlanNumber
      dbBatch.plannedDate = getPlannedDateByNumber(currentPlanNumber, baseDate, machine?.id)
      dbBatch.isCollab = false
      
      currentPlanNumber++
    })

    localStorage.setItem('dyeflow_db', JSON.stringify(db))
    loadData() // Reload to show updated data
    setShowCollabModal(false)
  }

  const runNumbering = () => {
    // Get all unnumbered batches
    const unnumbered = batches.filter(b => !b.planNumber && b.status !== 'done')
    
    if (unnumbered.length === 0) {
      alert('No batches to number')
      return
    }

    // Open collaboration modal with unnumbered batches
    setCollabBatches(unnumbered)
    setShowCollabModal(true)
  }

  const clearNumbering = () => {
    if (!confirm('Are you sure you want to clear all plan numbers for this machine?')) return

    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return

    const db = JSON.parse(stored)
    let changed = false

    batches.forEach(batch => {
      for (const order of db.orders) {
        if (order.id === batch.orderId) {
          const dbBatch = order.splits.find((s: any) => s.batchId === batch.batchId)
          if (dbBatch && dbBatch.planNumber) {
            dbBatch.planNumber = null
            changed = true
          }
        }
      }
    })

    if (changed) {
      localStorage.setItem('dyeflow_db', JSON.stringify(db))
      loadData()
      alert('✅ All numbering cleared!')
    }
  }

  const applyFilters = () => {
    let filtered = [...batches]
    
    if (shadeFilter !== 'all') {
      filtered = filtered.filter(b => b.shadeType.toLowerCase() === shadeFilter.toLowerCase())
    }
    
    Object.keys(filters).forEach(key => {
      const filterValue = filters[key].toLowerCase().trim()
      if (filterValue) {
        filtered = filtered.filter(batch => {
          const value = String(batch[key] || '').toLowerCase()
          return value.includes(filterValue)
        })
      }
    })
    
    setFilteredBatches(filtered)
  }

  const handleFilterChange = (column: string, value: string) => {
    setFilters(prev => ({ ...prev, [column]: value }))
  }

  const getStatusBadge = (status: string) => {
    const badges: any = {
      new: { bg: '#DBEAFE', color: '#1E40AF', label: 'New' },
      pending: { bg: '#FEF3C7', color: '#92400E', label: 'Pending' },
      'in-process': { bg: '#DBEAFE', color: '#1E40AF', label: 'In Process' },
      done: { bg: '#D1FAE5', color: '#065F46', label: 'Done' }
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

  const getColumnWidth = (index: number, defaultWidth: number = 120) => {
    return columnWidths[index] || defaultWidth
  }

  const visibleColumns = COLUMNS.filter(col => !hiddenColumns.has(col.key))

  if (permLoading) return <div className="content"><div className="card"><div style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)' }}>Loading…</div></div></div>
  if (!canView) return <AccessDenied pageName={machine?.name || machineId} />

  if (!machine) {
    return (
      <div className="content">
        <div className="card">
          <div className="empty-state" style={{ padding: '60px' }}>
            <div style={{ fontSize: '36px', marginBottom: '10px' }}>🏭</div>
            <div style={{ fontSize: '15px', fontWeight: 600, marginBottom: '6px' }}>
              Machine Not Found
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '20px' }}>
              Machine ID "{machineId}" does not exist.
            </div>
            <button className="primary" onClick={() => router.push('/machines')}>
              ← Back to All Machines
            </button>
          </div>
        </div>
      </div>
    )
  }

  const totalBatches = batches.length
  const activeBatches = batches.filter(b => b.status !== 'done').length
  const numberedBatches = batches.filter(b => b.planNumber && b.planNumber > 0).length
  const unnumberedBatches = totalBatches - numberedBatches

  return (
    <div className="content">
      {/* Review Modal */}
      {showReviewModal && (
        <div style={{
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
        }} onClick={() => setShowReviewModal(false)}>
          <div style={{
            background: 'white',
            borderRadius: '8px',
            padding: '24px',
            maxWidth: '900px',
            width: '90%',
            maxHeight: '80vh',
            overflow: 'auto'
          }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>
                Review batch collaboration - {machine.name}
              </h3>
              <button onClick={() => setShowReviewModal(false)} style={{
                background: 'none',
                border: 'none',
                fontSize: '20px',
                cursor: 'pointer',
                padding: '4px 8px'
              }}>×</button>
            </div>
            
            <div style={{ fontSize: '12px', color: '#718096', marginBottom: '16px' }}>
              Machine capacity: <strong>{machine.capacity} Kg</strong> &nbsp;•&nbsp; 
              Target fill: <strong>{machine.capacity * 0.8} Kg (80%)</strong>
              <br/>
              Uncheck any batch/group to skip numbering now.
            </div>
            
            <table style={{ width: '100%', fontSize: '11px', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#F7FAFC', borderBottom: '2px solid #E2E8F0' }}>
                  <th style={{ padding: '8px', textAlign: 'left' }}>NUMBER NOW</th>
                  <th style={{ padding: '8px', textAlign: 'left' }}>TYPE</th>
                  <th style={{ padding: '8px', textAlign: 'left' }}>COLOUR / PROCESS</th>
                  <th style={{ padding: '8px', textAlign: 'left' }}>BATCHES</th>
                  <th style={{ padding: '8px', textAlign: 'left' }}>TOTAL KG</th>
                  <th style={{ padding: '8px', textAlign: 'left' }}>NOTE</th>
                </tr>
              </thead>
              <tbody>
                {reviewItems.map((item, idx) => {
                  const batchIds = item.batches.map(b => b.batchId)
                  const allSelected = batchIds.every(id => selectedBatches.has(id))
                  
                  return (
                    <tr key={idx} style={{ borderBottom: '1px solid #E2E8F0' }}>
                      <td style={{ padding: '8px', textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={allSelected}
                          onChange={() => toggleBatchSelection(batchIds)}
                        />
                      </td>
                      <td style={{ padding: '8px' }}>
                        <span style={{
                          padding: '2px 8px',
                          borderRadius: '12px',
                          fontSize: '10px',
                          fontWeight: 600,
                          background: item.type === 'collab' ? '#DBEAFE' : '#FEF3C7',
                          color: item.type === 'collab' ? '#1E40AF' : '#92400E'
                        }}>
                          {item.type === 'collab' ? 'Collab' : 'Single'}
                        </span>
                      </td>
                      <td style={{ padding: '8px', fontWeight: 700, color: '#E53E3E' }}>{item.title}</td>
                      <td style={{ padding: '8px', fontSize: '10px' }}>
                        {item.batches.map((b, i) => (
                          <div key={i}>
                            {b.batchId} ({b.orderNo} - {b.kg} Kg)
                          </div>
                        ))}
                      </td>
                      <td style={{ padding: '8px', fontWeight: 700 }}>{item.total.toFixed(1)}</td>
                      <td style={{ padding: '8px', fontSize: '10px', color: '#718096' }}>{item.note}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' }}>
              <button onClick={() => setShowReviewModal(false)} style={{
                padding: '8px 16px',
                fontSize: '12px',
                border: '1px solid #E2E8F0',
                borderRadius: '4px',
                background: 'white',
                cursor: 'pointer'
              }}>
                Cancel
              </button>
              <button onClick={() => {
                const skipBatchIds = reviewItems.flatMap(item => 
                  item.batches.filter(b => !selectedBatches.has(b.batchId)).map(b => b.batchId)
                )
                confirmNumbering(skipBatchIds)
              }} style={{
                padding: '8px 16px',
                fontSize: '12px',
                border: 'none',
                borderRadius: '4px',
                background: '#48BB78',
                color: 'white',
                fontWeight: 600,
                cursor: 'pointer'
              }}>
                Run Numbering
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Machine Header */}
      <div className="card" style={{ marginBottom: '12px', background: 'linear-gradient(135deg, #FFF5F5 0%, #FED7D7 100%)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '8px',
              background: '#FC8181',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontSize: '14px',
              fontWeight: 700
            }}>
              {machine.id || 'M'}
            </div>
            <div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: '#2D3748', marginBottom: '4px' }}>
                {machine.name}
              </div>
              <div style={{ fontSize: '12px', color: '#718096' }}>
                Type: {machine.type || 'N/A'} &nbsp;•&nbsp; Capacity: {machine.capacity} Kg &nbsp;•&nbsp; 
                Max 3 batches per day
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '24px', fontWeight: 700, color: '#FC8181' }}>{totalBatches}</div>
              <div style={{ fontSize: '11px', color: '#718096', textTransform: 'uppercase' }}>BATCHES</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '24px', fontWeight: 700, color: '#48BB78' }}>{activeBatches}</div>
              <div style={{ fontSize: '11px', color: '#718096', textTransform: 'uppercase' }}>ACTIVE</div>
            </div>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="card" style={{ marginBottom: '12px', padding: '12px 16px' }}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#718096', marginRight: '8px' }}>
              Shade sequence:
            </div>
            {['all', 'light', 'medium', 'dark'].map(filter => (
              <button
                key={filter}
                onClick={() => setShadeFilter(filter)}
                style={{
                  padding: '6px 14px',
                  fontSize: '11px',
                  fontWeight: 600,
                  borderRadius: '20px',
                  border: '1px solid #E2E8F0',
                  background: shadeFilter === filter ? (filter === 'all' ? '#2D3748' : filter === 'dark' ? '#2D3748' : '#DBEAFE') : 'white',
                  color: shadeFilter === filter ? (filter === 'all' || filter === 'dark' ? 'white' : '#1E40AF') : '#718096',
                  cursor: 'pointer',
                  textTransform: 'capitalize'
                }}
              >
                {filter === 'dark' ? 'Extra Dark' : filter}
              </button>
            ))}
          </div>
          
          <div style={{ display: 'flex', gap: '8px', position: 'relative' }}>
            <button
              onClick={() => setShowColumnMenu(!showColumnMenu)}
              style={{
                padding: '6px 14px',
                fontSize: '11px',
                fontWeight: 600,
                borderRadius: '4px',
                border: '1px solid #E2E8F0',
                background: 'white',
                color: '#718096',
                cursor: 'pointer'
              }}
            >
              ⚙️ Columns ({visibleColumns.length}/{COLUMNS.length})
            </button>
            {showColumnMenu && (
              <div style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                marginTop: '4px',
                background: 'white',
                border: '1px solid #E2E8F0',
                borderRadius: '6px',
                boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                padding: '8px',
                zIndex: 100,
                minWidth: '200px'
              }}>
                {COLUMNS.filter(col => col.canHide).map(col => (
                  <label key={col.key} style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '6px 8px',
                    cursor: 'pointer',
                    fontSize: '11px',
                    borderRadius: '4px'
                  }}>
                    <input
                      type="checkbox"
                      checked={!hiddenColumns.has(col.key)}
                      onChange={() => toggleColumnVisibility(col.key)}
                      style={{ marginRight: '8px' }}
                    />
                    {col.label}
                  </label>
                ))}
              </div>
            )}
            <button
              onClick={runNumbering}
              style={{
                padding: '6px 14px',
                fontSize: '11px',
                fontWeight: 600,
                borderRadius: '4px',
                border: 'none',
                background: unnumberedBatches > 0 ? '#48BB78' : '#94A3B8',
                color: 'white',
                cursor: unnumberedBatches > 0 ? 'pointer' : 'not-allowed'
              }}
              disabled={unnumberedBatches === 0}
            >
              🔢 Run Numbering {unnumberedBatches > 0 ? `(${unnumberedBatches})` : ''}
            </button>
            {numberedBatches > 0 && (
              <button
                onClick={clearNumbering}
                style={{
                  padding: '6px 14px',
                  fontSize: '11px',
                  fontWeight: 600,
                  borderRadius: '4px',
                  border: '1px solid #E2E8F0',
                  background: 'white',
                  color: '#718096',
                  cursor: 'pointer'
                }}
              >
                Clear All
              </button>
            )}
          </div>
        </div>
        <div style={{ fontSize: '11px', color: '#718096', marginTop: '8px' }}>
          {numberedBatches} numbered • {unnumberedBatches} pending • Drag column edges to resize • Colors must be in Shade Master
        </div>
      </div>

      {/* Batch Register - (Rest of the table code remains the same as before) */}
      <div className="card">
        <div className="card-header" style={{ background: '#FC8181', color: 'white', padding: '10px 16px' }}>
          <span style={{ fontSize: '13px', fontWeight: 700 }}>📋 Batch Register - {filteredBatches.length} batches</span>
          <button 
            onClick={() => router.push('/machines')}
            style={{
              padding: '6px 12px',
              fontSize: '11px',
              fontWeight: 600,
              borderRadius: '4px',
              border: 'none',
              background: 'rgba(255,255,255,0.2)',
              color: 'white',
              cursor: 'pointer'
            }}
          >
            ← Back
          </button>
        </div>

        {filteredBatches.length === 0 ? (
          <div className="empty-state" style={{ padding: '40px' }}>
            <div style={{ fontSize: '28px', marginBottom: '8px' }}>📋</div>
            <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '4px' }}>No batches found</div>
            <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>Try adjusting your filters</div>
          </div>
        ) : (
          <div className="table-wrap" style={{ maxHeight: '70vh', overflow: 'auto' }}>
            <table style={{ width: 'max-content', minWidth: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
              <thead style={{ position: 'sticky', top: 0, background: '#F7FAFC', zIndex: 10 }}>
                <tr>
                  {visibleColumns.map((col, visIdx) => {
                    const realIdx = COLUMNS.indexOf(col)
                    return (
                      <th key={col.key} style={{ ...filterHeaderStyle, width: `${getColumnWidth(realIdx, col.defaultWidth)}px`, position: 'relative' }}>
                        <input 
                          placeholder="Filter" 
                          style={filterInputStyle}
                          onChange={(e) => handleFilterChange(col.key, e.target.value)}
                        />
                        {visIdx < visibleColumns.length - 1 && (
                          <div
                            style={{
                              position: 'absolute',
                              top: 0,
                              right: -4,
                              width: 8,
                              height: '100%',
                              cursor: 'col-resize',
                              zIndex: 3
                            }}
                            onMouseDown={(e) => {
                              e.preventDefault()
                              const th = e.currentTarget.parentElement as HTMLElement
                              const startX = e.clientX
                              const startWidth = th.getBoundingClientRect().width
                              handleColumnResize(realIdx, startX, startWidth)
                            }}
                          >
                            <div style={{
                              position: 'absolute',
                              top: '20%',
                              bottom: '20%',
                              right: 3,
                              width: 2,
                              background: 'rgba(24,95,165,0.35)',
                              borderRadius: 2
                            }} />
                          </div>
                        )}
                      </th>
                    )
                  })}
                </tr>
                <tr style={{ background: '#EDF2F7' }}>
                  {visibleColumns.map((col, visIdx) => {
                    const realIdx = COLUMNS.indexOf(col)
                    return (
                      <th key={col.key} style={{ ...thStyle, width: `${getColumnWidth(realIdx, col.defaultWidth)}px` }}>
                        {col.label}
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {filteredBatches.map((batch, idx) => (
                  <tr 
                    key={batch.batchId || idx}
                    style={{
                      background: idx % 2 === 0 ? 'white' : '#F7FAFC',
                      borderBottom: '1px solid #E2E8F0'
                    }}
                  >
                    {visibleColumns.map((col, visIdx) => {
                      const realIdx = COLUMNS.indexOf(col)
                      const width = getColumnWidth(realIdx, col.defaultWidth)
                      
                      if (col.key === 'planNumber') {
                        return (
                          <td key={col.key} style={{ ...tdStyle, width: `${width}px` }}>
                            <input
                              type="number"
                              min="1"
                              value={batch.planNumber || ''}
                              onChange={(e) => updatePlanNumber(batch.batchId, batch.orderId, e.target.value)}
                              placeholder="-"
                              style={{
                                width: '100%',
                                padding: '4px 6px',
                                fontSize: '11px',
                                fontWeight: 700,
                                color: batch.planNumber ? '#10B981' : '#94A3B8',
                                border: '1px solid #E2E8F0',
                                borderRadius: '3px',
                                textAlign: 'center',
                                background: 'white'
                              }}
                            />
                          </td>
                        )
                      }
                      
                      if (col.key === 'batchId') {
                        return <td key={col.key} style={{ ...tdStyle, fontWeight: 700, color: '#E53E3E', width: `${width}px` }}>{batch.batchId}</td>
                      }
                      
                      if (col.key === 'shadeType') {
                        return (
                          <td key={col.key} style={{ ...tdStyle, width: `${width}px` }}>
                            <span style={{
                              padding: '2px 8px',
                              borderRadius: '12px',
                              fontSize: '10px',
                              fontWeight: 600,
                              background: batch.shadeType === 'Light' ? '#DBEAFE' : batch.shadeType === 'Dark' ? '#2D3748' : '#DBEAFE',
                              color: batch.shadeType === 'Light' ? '#1E40AF' : batch.shadeType === 'Dark' ? 'white' : '#1E40AF'
                            }}>
                              {batch.shadeType}
                            </span>
                          </td>
                        )
                      }
                      
                      if (col.key === 'timeStamp' || col.key === 'plannedDate') {
                        return (
                          <td key={col.key} style={{ 
                            ...tdStyle, 
                            fontSize: col.key === 'timeStamp' ? '10px' : '11px',
                            fontWeight: col.key === 'plannedDate' && batch.planNumber ? 600 : 400,
                            color: col.key === 'plannedDate' && batch.planNumber ? '#10B981' : '#2D3748',
                            width: `${width}px`
                          }}>
                            {formatDate(batch[col.key])}
                          </td>
                        )
                      }
                      
                      if (col.key === 'status') {
                        return <td key={col.key} style={{ ...tdStyle, width: `${width}px` }}>{getStatusBadge(batch.status)}</td>
                      }
                      
                      if (col.key === 'faulty') {
                        return (
                          <td key={col.key} style={{ ...tdStyle, textAlign: 'center', width: `${width}px` }}>
                            <input
                              type="checkbox"
                              checked={batch.faulty || false}
                              onChange={() => toggleFaulty(batch.batchId, batch.orderId, batch.faulty || false)}
                              style={{
                                width: '16px',
                                height: '16px',
                                cursor: 'pointer',
                                accentColor: '#EF4444'
                              }}
                              title="Mark as Faulty"
                            />
                          </td>
                        )
                      }
                      
                      if (col.key === 'action') {
                        return (
                          <td key={col.key} style={{ ...tdStyle, whiteSpace: 'nowrap', width: `${width}px` }}>
                            <button style={{
                              padding: '4px 10px',
                              fontSize: '10px',
                              fontWeight: 600,
                              border: '1px solid #E2E8F0',
                              borderRadius: '4px',
                              background: 'white',
                              cursor: 'pointer',
                              marginRight: '4px'
                            }}>
                              Sheet
                            </button>
                            {batch.status !== 'done' && (
                              <button style={{
                                padding: '4px 10px',
                                fontSize: '10px',
                                fontWeight: 600,
                                border: 'none',
                                borderRadius: '4px',
                                background: '#48BB78',
                                color: 'white',
                                cursor: 'pointer'
                              }}>
                                Done
                              </button>
                            )}
                          </td>
                        )
                      }
                      
                      if (col.key === 'remarks') {
                        return (
                          <td key={col.key} style={{ 
                            ...tdStyle, 
                            maxWidth: `${width}px`,
                            whiteSpace: 'normal',
                            wordWrap: 'break-word'
                          }}>
                            {batch.remarks || '-'}
                          </td>
                        )
                      }
                      
                      if (col.key === 'article' || col.key === 'processName') {
                        return (
                          <td key={col.key} style={{ 
                            ...tdStyle, 
                            fontWeight: col.key === 'article' ? 500 : 600,
                            color: col.key === 'processName' ? '#2563EB' : '#2D3748',
                            width: `${width}px`
                          }}>
                            {batch[col.key] || '-'}
                          </td>
                        )
                      }
                      
                      if (col.key === 'kg') {
                        return <td key={col.key} style={{ ...tdStyle, fontWeight: 600, width: `${width}px` }}>{batch.kg}</td>
                      }
                      
                      if (['labNo', 'lotNo', 'challanNo', 'typeOfFinish', 'typeOfPacking'].includes(col.key)) {
                        return <td key={col.key} style={{ ...tdStyle, fontSize: '10px', width: `${width}px` }}>{batch[col.key] || '-'}</td>
                      }
                      
                      return <td key={col.key} style={{ ...tdStyle, width: `${width}px` }}>{batch[col.key] || '-'}</td>
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      
      {/* Batch Collaboration Modal */}
      <BatchCollaborationModal
        isOpen={showCollabModal}
        onClose={() => setShowCollabModal(false)}
        availableBatches={collabBatches.map(b => ({
          batchId: b.batchId,
          orderNumber: b.orderNo,
          orderId: b.orderId,
          color: b.color,
          colourProcess: b.color,
          kg: parseFloat(b.kg) || 0,
          type: b.type,
          note: b.note || ''
        }))}
        machineCapacity={machine?.capacity || 500}
        machineName={machine?.name || machineId}
        onConfirm={handleCollaborationConfirm}
      />
    </div>
  )
}

const filterHeaderStyle: React.CSSProperties = {
  padding: '4px 8px',
  borderBottom: '1px solid #E2E8F0',
  textAlign: 'left',
  background: 'white'
}

const filterInputStyle: React.CSSProperties = {
  width: '100%',
  padding: '4px 6px',
  fontSize: '10px',
  border: '1px solid #E2E8F0',
  borderRadius: '3px',
  outline: 'none'
}

const thStyle: React.CSSProperties = {
  padding: '8px 12px',
  textAlign: 'left',
  fontSize: '9px',
  fontWeight: 700,
  color: '#4A5568',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  borderBottom: '2px solid #CBD5E0',
  borderRight: '1px solid #E2E8F0',
  whiteSpace: 'nowrap'
}

const tdStyle: React.CSSProperties = {
  padding: '10px 12px',
  fontSize: '11px',
  color: '#2D3748',
  borderRight: '1px solid #F7FAFC',
  whiteSpace: 'nowrap'
}
