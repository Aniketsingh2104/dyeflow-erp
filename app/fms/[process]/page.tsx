'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { PROCESS_MAP, getProcessName, loadOrSeedProcessList, ProcessDef } from '@/lib/processMap'
import { logAudit } from '@/lib/auditLog'
import { usePermission, useSupervisorFilter, AccessDenied } from '@/lib/permissions'

export default function FmsProcessPage() {
  const params = useParams()
  const router = useRouter()
  const processCode = String(params?.process || '').toUpperCase()

  const { canView, canEdit, canDelete, loading: permLoading } = usePermission(`/fms/${String(params?.process || '')}`)
  const supervisorFilter = useSupervisorFilter()
  
  const [batches, setBatches] = useState<any[]>([])
  const [processName, setProcessName] = useState<string>('')
  const [processList, setProcessList] = useState<ProcessDef[]>([])
  const [loading, setLoading] = useState(true)
  const [currentTime, setCurrentTime] = useState(new Date())
  const [fmsSearch, setFmsSearch] = useState('')

  const [showFaultyModal, setShowFaultyModal] = useState(false)
  const [faultyBatchData, setFaultyBatchData] = useState<{orderId: string, batchId: string} | null>(null)
  const [faultyReason, setFaultyReason] = useState('')

  const [showFobModal, setShowFobModal] = useState(false)
  const [fobBatchData, setFobBatchData] = useState<{orderId: string, batchId: string} | null>(null)
  const [fobType, setFobType] = useState<'dyeing' | 'rolling'>('dyeing')
  const [fobReason, setFobReason] = useState('')

  const currentProcessDef = processList.find(p => p.code.toUpperCase() === processCode.toUpperCase())
  const fmsAllowFaulty = currentProcessDef ? (currentProcessDef.allowFaulty ?? true)  : true
  const fmsAllowFOB    = currentProcessDef ? (currentProcessDef.allowFOB    ?? false) : false

  // ── Column config ──────────────────────────────────────────────────────────────
  const FMS_DEFAULT_COLUMNS = [
    { id: 'timestamp',      label: 'TIME STAMP',       visible: true,  width: 150, minWidth: 100 },
    { id: 'orderNo',        label: 'ORDER #',           visible: true,  width: 130, minWidth: 80  },
    { id: 'batchId',        label: 'BATCH #',           visible: true,  width: 130, minWidth: 80  },
    { id: 'party',          label: 'PARTY',             visible: true,  width: 150, minWidth: 100 },
    { id: 'subParty',       label: 'SUB PARTY',         visible: true,  width: 120, minWidth: 80  },
    { id: 'salesPerson',    label: 'SALES PERSON',      visible: true,  width: 130, minWidth: 90  },
    { id: 'article',        label: 'ARTICLE',           visible: true,  width: 130, minWidth: 80  },
    { id: 'blend',          label: 'BLEND',             visible: true,  width: 100, minWidth: 70  },
    { id: 'width',          label: 'WIDTH',             visible: true,  width: 80,  minWidth: 60  },
    { id: 'gsm',            label: 'GSM',               visible: true,  width: 80,  minWidth: 60  },
    { id: 'color',          label: 'COLOR',             visible: true,  width: 120, minWidth: 80  },
    { id: 'labNo',          label: 'LAB NO.',           visible: true,  width: 100, minWidth: 70  },
    { id: 'lotNo',          label: 'LOT NO.',           visible: true,  width: 100, minWidth: 70  },
    { id: 'challanNo',      label: 'CHALLAN NO.',       visible: true,  width: 110, minWidth: 80  },
    { id: 'qtyKg',          label: 'QTY (KG)',          visible: true,  width: 100, minWidth: 70  },
    { id: 'qtyMtr',         label: 'QTY (MTR.)',        visible: true,  width: 100, minWidth: 70  },
    { id: 'noOfTaka',       label: 'NO. OF TA',         visible: true,  width: 90,  minWidth: 60  },
    { id: 'typeOfFinish',   label: 'TYPE OF FINISH',    visible: true,  width: 140, minWidth: 100 },
    { id: 'typeOfPacking',  label: 'TYPE OF PACKING',   visible: true,  width: 150, minWidth: 100 },
    { id: 'remarks',        label: 'REMARKS',           visible: true,  width: 200, minWidth: 120 },
    { id: 'supervisor',     label: 'SUPERVISOR',        visible: true,  width: 130, minWidth: 80  },
    { id: 'machine',        label: 'MACHINE',           visible: true,  width: 160, minWidth: 100 },
    { id: 'processRoute',   label: 'PROCESS ROUTE',     visible: true,  width: 200, minWidth: 120 },
    { id: 'processName',    label: 'PROCESS NAME',      visible: true,  width: 130, minWidth: 80  },
    { id: 'plannedDate',    label: 'PLANNED DATE',      visible: true,  width: 120, minWidth: 80  },
    { id: 'actualDate',     label: 'ACTUAL DATE',       visible: true,  width: 120, minWidth: 80  },
    { id: 'actionDone',     label: 'ACTION DONE',       visible: true,  width: 220, minWidth: 160 },
    { id: 'timeDelay',      label: 'TIME DELAY',        visible: true,  width: 110, minWidth: 80  },
    { id: 'delete',         label: 'DELETE',            visible: true,  width: 90,  minWidth: 70  },
  ]

  const COLUMN_STORAGE_KEY = 'fms_column_settings'

  const loadFmsColumns = () => {
    try {
      const saved = localStorage.getItem(COLUMN_STORAGE_KEY)
      if (saved) return JSON.parse(saved)
    } catch {}
    return FMS_DEFAULT_COLUMNS
  }

  const [fmsColumns, setFmsColumns] = useState(() => FMS_DEFAULT_COLUMNS)
  const [showColumnPanel, setShowColumnPanel] = useState(false)
  const [resizingCol, setResizingCol] = useState<string | null>(null)
  const columnsRef = useRef(fmsColumns)
  columnsRef.current = fmsColumns

  useEffect(() => {
    setFmsColumns(loadFmsColumns())
  }, [])

  const saveFmsColumns = (cols: typeof FMS_DEFAULT_COLUMNS) => {
    localStorage.setItem(COLUMN_STORAGE_KEY, JSON.stringify(cols))
    setFmsColumns(cols)
  }

  const toggleFmsColumn = (id: string) => {
    saveFmsColumns(fmsColumns.map(c => c.id === id ? { ...c, visible: !c.visible } : c))
  }

  const resetFmsColumns = () => saveFmsColumns(FMS_DEFAULT_COLUMNS)

  const startFmsResize = (colId: string, e: React.MouseEvent) => {
    e.preventDefault()
    setResizingCol(colId)
    const startX = e.clientX
    const col = fmsColumns.find(c => c.id === colId)!
    const startW = col.width
    const onMove = (ev: MouseEvent) => {
      const newW = Math.max(col.minWidth || 60, startW + (ev.clientX - startX))
      setFmsColumns(prev => prev.map(c => c.id === colId ? { ...c, width: newW } : c))
    }
    const onUp = () => {
      setResizingCol(null)
      localStorage.setItem(COLUMN_STORAGE_KEY, JSON.stringify(columnsRef.current))
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }

  const visibleFmsColumns = fmsColumns.filter(c => c.visible)

  useEffect(() => {
    const list = loadOrSeedProcessList()
    setProcessList(list)
    if (processCode) loadProcessBatches()
    const timer = setInterval(() => setCurrentTime(new Date()), 60000)
    return () => clearInterval(timer)
  }, [processCode])

  useEffect(() => {
    if (batches.length > 0) {
      setBatches(batches.map(batch => {
        const delayMeta = getFmsTimeDelayMeta(batch.plannedDate, batch.actualDate)
        return { ...batch, delayText: delayMeta.text, delayLate: !!delayMeta.late }
      }))
    }
  }, [currentTime])

  const loadProcessBatches = () => {
    setLoading(true)
    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) { setLoading(false); return }
    const db = JSON.parse(stored)
    const rows: any[] = []
    const list = loadOrSeedProcessList()
    setProcessList(list)
    const name = getProcessName(processCode, list)
    setProcessName(name)

    ;(db.orders || []).forEach((order: any) => {
      // Apply supervisor filter
      if (supervisorFilter && order.supervisor !== supervisorFilter) return
      const fullRoute = getFmsRouteForOrder(order)
      if (!fullRoute.includes(processCode)) return
      ;(order.splits || []).forEach((batch: any) => {
        const firstCode = getFirstProcessCode(order)
        if (!firstCode) return
        ensureBatchFmsDispatch(batch)
        if (!isBatchSentToFms(batch, firstCode)) return
        const isActiveOnProc = isBatchActiveOnProcess(batch, processCode, firstCode)
        const isCompletedOnProc = !!(batch.fmsActualDates && batch.fmsActualDates[processCode])
        if (!isActiveOnProc && !isCompletedOnProc) return
        const plannedDate = getBatchProcessPlannedDate(order, batch, processCode)
        const actualDate = (batch.fmsActualDates && batch.fmsActualDates[processCode]) || ''
        const delayMeta = getFmsTimeDelayMeta(plannedDate, actualDate)
        const stageEntryTs = (batch.fmsEnterAt && batch.fmsEnterAt[processCode])
          ? batch.fmsEnterAt[processCode]
          : ((batch.fmsDispatch && batch.fmsDispatch[firstCode] && batch.fmsDispatch[firstCode].sentAt)
             ? batch.fmsDispatch[firstCode].sentAt
             : order.timestamp)
        const currentProcessName = getProcessName(processCode, list)
        rows.push({
          orderId: order.id,
          orderNo: order.orderNumber || '-',
          timestamp: stageEntryTs || order.timestamp || '-',
          batchId: batch.batchId || '-',
          party: order.party || '-',
          subParty: order.subParty || '-',
          salesPerson: order.salesPerson || '-',
          article: order.article || '-',
          blend: order.blend || '-',
          width: order.width || '-',
          gsm: order.gsm || '-',
          color: order.color || '-',
          labNo: order.labNo || '-',
          lotNo: order.lotNo || '-',
          challanNo: order.challanNo || '-',
          qtyKg: batch.kg || order.qtyKg || '-',
          qtyMtr: batch.mtr || order.qtyMtr || '-',
          noOfTaka: batch.taka || order.noOfTaka || '-',
          typeOfFinish: order.typeOfFinish || '-',
          typeOfPacking: order.typeOfPacking || '-',
          remarks: order.remarks || '-',
          supervisor: order.supervisor || '-',
          machine: order.machine || '-',
          processRoute: fullRoute.join('/'),
          plannedDate,
          actualDate,
          delayText: delayMeta.text,
          delayLate: !!delayMeta.late,
          isFaulty: !!(batch.fmsFaulty && batch.fmsFaulty.active),
          isCompleted: !!actualDate,
          currentProcessName,
          isFobSent: !!(db.fobRecords || []).find(
            (r: any) => r.batchId === (batch.batchId || '') && r.processCode === processCode
          ),
          fobActualDate: (() => {
            const rec = (db.fobRecords || []).find(
              (r: any) => r.batchId === (batch.batchId || '') && r.processCode === processCode
            )
            return rec ? rec.date : ''
          })(),
        })
      })
    })

    rows.sort((a, b) =>
      String(a.plannedDate || '9999-99-99').localeCompare(String(b.plannedDate || '9999-99-99')) ||
      String(b.timestamp || '').localeCompare(String(a.timestamp || ''))
    )
    setBatches(rows)
    setLoading(false)
  }

  const getFirstProcessCode = (order: any) => {
    const route = Array.isArray(order?.processRoute) ? order.processRoute.filter(Boolean) : []
    return route[0] || ''
  }

  const getFmsRouteForOrder = (order: any) => {
    const base = Array.isArray(order?.processRoute) ? order.processRoute.filter(Boolean) : []
    ;['Qa', 'Packing', 'Dispatch'].forEach(x => { if (!base.includes(x)) base.push(x) })
    return base
  }

  const ensureBatchFmsDispatch = (batch: any) => {
    if (!batch || typeof batch !== 'object') return {}
    if (!batch.fmsDispatch || typeof batch.fmsDispatch !== 'object') batch.fmsDispatch = {}
    if (!batch.fmsActiveProcesses || typeof batch.fmsActiveProcesses !== 'object') batch.fmsActiveProcesses = {}
    if (!batch.fmsActualDates || typeof batch.fmsActualDates !== 'object') batch.fmsActualDates = {}
    if (!batch.fmsEnterAt || typeof batch.fmsEnterAt !== 'object') batch.fmsEnterAt = {}
    return batch.fmsDispatch
  }

  const isBatchSentToFms = (batch: any, pc: string) => {
    ensureBatchFmsDispatch(batch)
    return !!(batch.fmsDispatch[pc] && batch.fmsDispatch[pc].sent)
  }

  const isBatchActiveOnProcess = (batch: any, procCode: string, firstCode: string) => {
    const hasActiveMap = !!(batch.fmsActiveProcesses && Object.keys(batch.fmsActiveProcesses).length)
    if (hasActiveMap) return !!batch.fmsActiveProcesses[procCode]
    return (String(batch.fmsCurrentProcess || '') === procCode ||
            (!batch.fmsCurrentProcess && firstCode === procCode))
  }

  const getBatchProcessPlannedDate = (order: any, batch: any, procCode: string) => {
    if (!procCode) return ''
    return (batch?.dateCalcPlan && batch.dateCalcPlan[procCode]) ||
           (order?.plannedDates && order.plannedDates[procCode]) || ''
  }

  const normalizeDate = (dateStr: any) => {
    if (!dateStr) return null
    if (typeof dateStr === 'string' && dateStr.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
      const [day, month, year] = dateStr.split('/')
      const d = new Date(parseInt(year), parseInt(month) - 1, parseInt(day))
      return isNaN(d.getTime()) ? null : d
    }
    if (typeof dateStr === 'string' && dateStr.match(/^\d{2}-\d{2}-\d{4}$/)) {
      const [day, month, year] = dateStr.split('-')
      const d = new Date(parseInt(year), parseInt(month) - 1, parseInt(day))
      return isNaN(d.getTime()) ? null : d
    }
    const d = new Date(dateStr)
    return isNaN(d.getTime()) ? null : d
  }

  const formatDateOnlyDDMMYYYY = (dateStr: string) => {
    if (!dateStr) return '-'
    const d = normalizeDate(dateStr)
    if (!d) return dateStr
    return `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`
  }

  const formatDateTimeDDMMYYYY = (dateStr: string) => {
    if (!dateStr) return '-'
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return dateStr
    return `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
  }

  const getFmsTimeDelayMeta = (plannedDateStr: string, actualDateStr: string) => {
    if (!plannedDateStr) return { text: '-', late: false }
    const planned = normalizeDate(plannedDateStr)
    if (!planned) return { text: '-', late: false }
    const deadline = new Date(planned.getTime())
    deadline.setHours(23, 59, 59, 999)
    if (actualDateStr) {
      const actual = normalizeDate(actualDateStr)
      if (actual) {
        const actualEnd = new Date(actual.getTime())
        actualEnd.setHours(23, 59, 59, 999)
        const diffMs = actualEnd.getTime() - deadline.getTime()
        const abs = Math.abs(diffMs)
        const days = Math.floor(abs / 86400000)
        const hours = Math.floor((abs % 86400000) / 3600000)
        const mins = Math.floor((abs % 3600000) / 60000)
        return diffMs <= 0
          ? { text: `-${days}d ${hours}h ${mins}m`, late: false }
          : { text: `+${days}d ${hours}h ${mins}m`, late: true }
      }
    }
    const diffMs = currentTime.getTime() - deadline.getTime()
    const abs = Math.abs(diffMs)
    const days = Math.floor(abs / 86400000)
    const hours = Math.floor((abs % 86400000) / 3600000)
    const mins = Math.floor((abs % 3600000) / 60000)
    return diffMs < 0
      ? { text: `-${days}d ${hours}h ${mins}m`, late: false }
      : { text: `+${days}d ${hours}h ${mins}m`, late: true }
  }

  const getMachineName = (machineId: string) => {
    if (!machineId) return '-'
    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return machineId
    const db = JSON.parse(stored)
    const machine = (db.machines || []).find((m: any) => m.id === machineId)
    if (!machine) return machineId
    return (machine.name || '').replace(/^Machine\s*/i, 'M ').trim()
  }

  const markProcessDone = (orderId: string, batchId: string) => {
    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return
    const db = JSON.parse(stored)
    const order = (db.orders || []).find((o: any) => o.id === orderId)
    if (!order) return
    const batch = (order.splits || []).find((b: any) => b.batchId === batchId)
    if (!batch) return
    const today = new Date().toISOString().split('T')[0]
    ensureBatchFmsDispatch(batch)
    batch.fmsActualDates[processCode] = today
    if (!order.actualDates || typeof order.actualDates !== 'object') order.actualDates = {}
    order.actualDates[processCode] = today
    const fullRoute = getFmsRouteForOrder(order)
    const idx = fullRoute.indexOf(processCode)
    const nextProc = idx >= 0 ? (fullRoute[idx + 1] || '') : ''
    if (nextProc) {
      batch.fmsActiveProcesses[nextProc] = true
      batch.fmsCurrentProcess = nextProc
      batch.fmsDone = false
      const nowIso = new Date().toISOString()
      if (!batch.fmsDispatch[nextProc] || !batch.fmsDispatch[nextProc].sent)
        batch.fmsDispatch[nextProc] = { sent: true, sentAt: nowIso, source: 'copy' }
      if (!batch.fmsEnterAt[nextProc]) batch.fmsEnterAt[nextProc] = nowIso
    } else {
      batch.fmsCurrentProcess = processCode
      batch.fmsDone = true
    }
    localStorage.setItem('dyeflow_db', JSON.stringify(db))
    logAudit({ action: 'process_done', entityType: 'batch', entityId: batchId, field: 'process', oldValue: processCode, newValue: 'done', note: `${processName}-FMS marked done` })
    loadProcessBatches()
  }

  const deleteBatchFromFms = (orderId: string, batchId: string) => {
    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return
    const db = JSON.parse(stored)
    const order = (db.orders || []).find((o: any) => o.id === orderId)
    if (!order) return
    const batch = (order.splits || []).find((b: any) => b.batchId === batchId)
    if (!batch) return
    const fullRoute = getFmsRouteForOrder(order)
    const currentIdx = fullRoute.indexOf(processCode)
    const previousProc = currentIdx > 0 ? fullRoute[currentIdx - 1] : ''
    const currentName = getProcessName(processCode, processList)
    const previousName = previousProc ? getProcessName(previousProc, processList) : 'First Process Batch'
    if (!confirm(`Delete batch ${batchId} from ${currentName}-FMS?\n\nThis will send the batch back to ${previousName}.`)) return
    ensureBatchFmsDispatch(batch)
    if (previousProc) {
      if (batch.fmsActiveProcesses[processCode]) delete batch.fmsActiveProcesses[processCode]
      batch.fmsActiveProcesses[previousProc] = true
      batch.fmsCurrentProcess = previousProc
      batch.fmsDone = false
      if (batch.fmsActualDates?.[processCode]) delete batch.fmsActualDates[processCode]
      if (batch.fmsActualDates?.[previousProc]) delete batch.fmsActualDates[previousProc]
      if (batch.fmsEnterAt?.[processCode]) delete batch.fmsEnterAt[processCode]
    } else {
      const firstCode = getFirstProcessCode(order)
      if (!firstCode) return
      if (batch.fmsDispatch[firstCode]) delete batch.fmsDispatch[firstCode]
      if (batch.fmsForceSend?.[firstCode]) delete batch.fmsForceSend[firstCode]
      batch.fmsActiveProcesses = {}
      batch.fmsCurrentProcess = ''
      batch.fmsDone = false
      if (batch.fmsActualDates?.[processCode]) delete batch.fmsActualDates[processCode]
      if (batch.fmsEnterAt?.[processCode]) delete batch.fmsEnterAt[processCode]
    }
    if (batch.fmsFaulty?.active && batch.fmsFaulty.processCode === processCode)
      batch.fmsFaulty = { active: false, processCode: '', flaggedAt: '', note: '' }
    localStorage.setItem('dyeflow_db', JSON.stringify(db))
    loadProcessBatches()
    alert(`✓ Batch ${batchId} deleted from ${currentName}-FMS and sent back to ${previousName}.`)
  }

  const toggleFaulty = (orderId: string, batchId: string) => {
    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return
    const db = JSON.parse(stored)
    const order = (db.orders || []).find((o: any) => o.id === orderId)
    if (!order) return
    const batch = (order.splits || []).find((b: any) => b.batchId === batchId)
    if (!batch) return
    ensureBatchFmsDispatch(batch)
    if (!batch.fmsFaulty) batch.fmsFaulty = { active: false, processCode: '', flaggedAt: '', note: '' }
    if (batch.fmsFaulty.active) {
      batch.fmsFaulty.active = false
      if (db.faultyRecords) {
        const record = db.faultyRecords.find((r: any) => r.batchId === batchId && r.status === 'open')
        if (record) { record.status = 'resolved'; record.remarks = (record.remarks || '') + ' [Resolved from FMS]' }
      }
      localStorage.setItem('dyeflow_db', JSON.stringify(db))
      loadProcessBatches()
      alert(`✓ Batch ${batchId} unmarked as faulty (resolved)`)
    } else {
      setFaultyBatchData({ orderId, batchId })
      setFaultyReason('')
      setShowFaultyModal(true)
    }
  }

  const submitFaulty = () => {
    if (!faultyReason.trim() || !faultyBatchData) return
    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return
    const db = JSON.parse(stored)
    const order = (db.orders || []).find((o: any) => o.id === faultyBatchData.orderId)
    if (!order) return
    const batch = (order.splits || []).find((b: any) => b.batchId === faultyBatchData.batchId)
    if (!batch) return
    ensureBatchFmsDispatch(batch)
    if (!batch.fmsFaulty) batch.fmsFaulty = { active: false, processCode: '', flaggedAt: '', note: '' }
    batch.fmsFaulty.active = true
    batch.fmsFaulty.processCode = processCode
    batch.fmsFaulty.flaggedAt = new Date().toISOString()
    batch.fmsFaulty.note = faultyReason
    const today = new Date().toISOString().split('T')[0]
    batch.fmsActualDates[processCode] = today
    if (!db.faultyRecords) db.faultyRecords = []
    const existingRecord = db.faultyRecords.find((r: any) => r.batchId === faultyBatchData.batchId && r.status === 'open')
    if (!existingRecord) {
      db.faultyRecords.push({
        id: `FR${Date.now()}`,
        batchId: faultyBatchData.batchId,
        orderNo: order.orderNumber || '',
        party: order.party || '',
        faultyType: 'Process Defect',
        quantity: parseFloat(batch.kg) || 0,
        date: today,
        remarks: `${faultyReason} [${processName || processCode}-FMS]`,
        status: 'open' as 'open' | 'resolved'
      })
    }
    localStorage.setItem('dyeflow_db', JSON.stringify(db))
    logAudit({ action: 'faulty_mark', entityType: 'batch', entityId: faultyBatchData.batchId, field: 'fmsFaulty', newValue: faultyReason, note: `Marked faulty at ${processName}-FMS` })
    setShowFaultyModal(false)
    setFaultyBatchData(null)
    setFaultyReason('')
    loadProcessBatches()
    alert(`✓ Batch ${faultyBatchData.batchId} marked as faulty and sent to Faulty Management page`)
  }

  const openFobModal = (orderId: string, batchId: string) => {
    setFobBatchData({ orderId, batchId })
    setFobType('dyeing')
    setFobReason('')
    setShowFobModal(true)
  }

  const submitFob = () => {
    if (!fobReason.trim() || !fobBatchData) return
    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return
    const db = JSON.parse(stored)
    const order = (db.orders || []).find((o: any) => o.id === fobBatchData.orderId)
    if (!order) return
    const batch = (order.splits || []).find((b: any) => b.batchId === fobBatchData.batchId)
    if (!batch) return
    if (!db.fobRecords) db.fobRecords = []
    db.fobRecords.push({
      id: `FOB${Date.now()}`,
      type: fobType,
      batchId: fobBatchData.batchId,
      orderNo: order.orderNumber || '',
      party: order.party || '',
      article: order.article || '',
      color: order.color || '',
      blend: order.blend || '',
      supervisor: order.supervisor || '',
      processCode,
      processName: processName || processCode,
      qtyKg: parseFloat(batch.kg) || 0,
      date: new Date().toISOString().split('T')[0],
      reason: `${fobReason} [${processName || processCode}-FMS]`,
      status: 'open',
      createdAt: new Date().toISOString(),
    })
    localStorage.setItem('dyeflow_db', JSON.stringify(db))
    window.dispatchEvent(new Event('dyeflow-db-updated'))
    setShowFobModal(false)
    setFobBatchData(null)
    setFobReason('')
    loadProcessBatches()
    alert(`✓ Batch ${fobBatchData.batchId} FOB entry added (${fobType}) → view in FOB page`)
  }

  if (permLoading) return (
    <div className="content"><div className="card"><div style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)' }}>Loading…</div></div></div>
  )
  if (!canView) return <AccessDenied pageName={`${processName || processCode}-FMS`} />

  if (loading) {
    return (
      <div className="content">
        <div className="card">
          <div style={{ padding: '40px', textAlign: 'center', color: '#6B7280' }}>Loading...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="content">
      <div className="card">
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <span className="card-title">{processName}-FMS</span>
            <div style={{ fontSize: '12px', color: '#6B7280', marginTop: '4px' }}>
              {batches.length} batch{batches.length !== 1 ? 'es' : ''}
              {fmsSearch.trim() ? ` · ${batches.filter(b =>
                [b.batchId, b.orderNo, b.party, b.color, b.article].some(v =>
                  String(v || '').toLowerCase().includes(fmsSearch.toLowerCase())
                )
              ).length} matching` : ''}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="text"
              value={fmsSearch}
              onChange={e => setFmsSearch(e.target.value)}
              placeholder="Search batch, order, party, color…"
              data-fms-search="true"
              list="fms-batch-datalist"
              style={{ fontSize: 12, padding: '6px 10px', border: '1px solid #D1D5DB', borderRadius: 5, width: 230 }}
            />
            <datalist id="fms-batch-datalist">
              {batches.map(b => (
                <option key={b.batchId} value={b.batchId}>
                  {b.batchId} – {b.party} – {b.color}
                </option>
              ))}
            </datalist>
            {fmsSearch && (
              <button onClick={() => setFmsSearch('')} style={{ fontSize: 11, padding: '5px 8px', border: '1px solid #D1D5DB', borderRadius: 4, background: 'white', cursor: 'pointer' }}>✕</button>
            )}
            <button
              onClick={() => setShowColumnPanel(v => !v)}
              style={{ padding: '7px 14px', fontSize: '12px', fontWeight: 600, border: '1px solid #D1D5DB', borderRadius: '6px', background: showColumnPanel ? '#EFF6FF' : 'white', cursor: 'pointer' }}
            >
              ⚙ Columns ({visibleFmsColumns.length}/{fmsColumns.length})
            </button>
            <button onClick={() => router.push('/fms')} style={{ padding: '7px 14px', fontSize: '12px', border: '1px solid #D1D5DB', borderRadius: '6px', background: 'white', cursor: 'pointer' }}>
              ← Back to FMS Overview
            </button>
          </div>
        </div>

        {batches.length === 0 ? (
          <div className="empty-state">No batches found for {processName}.</div>
        ) : (
          <>
            {/* Column Settings Panel */}
            {showColumnPanel && (
              <div style={{ padding: '12px 16px', background: '#F9FAFB', borderBottom: '1px solid #E5E7EB', maxHeight: 300, overflowY: 'auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Show / Hide Columns</span>
                  <button onClick={resetFmsColumns} style={{ padding: '3px 10px', fontSize: 11, border: '1px solid #D1D5DB', borderRadius: 4, background: 'white', cursor: 'pointer' }}>
                    Reset to Default
                  </button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 }}>
                  {fmsColumns.map(col => (
                    <label key={col.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer', userSelect: 'none' }}>
                      <input type="checkbox" checked={col.visible} onChange={() => toggleFmsColumn(col.id)} style={{ cursor: 'pointer', accentColor: '#3B82F6' }} />
                      {col.label}
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div style={{ overflow: 'auto', maxHeight: showColumnPanel ? 'calc(100vh - 390px)' : 'calc(100vh - 250px)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', tableLayout: 'fixed' }}>
                <colgroup>
                  {visibleFmsColumns.map(col => <col key={col.id} style={{ width: col.width }} />)}
                </colgroup>
                <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: '#F9FAFB' }}>
                  <tr>
                    {visibleFmsColumns.map(col => (
                      <th key={col.id} style={{
                        padding: '10px 8px', textAlign: 'left', fontSize: '11px', fontWeight: 700,
                        color: '#374151', borderBottom: '2px solid #E5E7EB', whiteSpace: 'nowrap',
                        width: col.width, minWidth: col.minWidth, position: 'relative', overflow: 'hidden',
                        background: col.id === 'processName' ? '#FEF3C7' : '#F9FAFB',
                      }}>
                        {col.label}
                        <div
                          onMouseDown={e => startFmsResize(col.id, e)}
                          style={{ position: 'absolute', top: 0, right: 0, width: 6, height: '100%', cursor: 'col-resize', zIndex: 1, background: resizingCol === col.id ? '#3B82F6' : 'transparent' }}
                          onMouseEnter={e => { if (!resizingCol) e.currentTarget.style.background = '#D1D5DB' }}
                          onMouseLeave={e => { if (!resizingCol) e.currentTarget.style.background = 'transparent' }}
                        />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {batches
                    .filter(batch =>
                      !fmsSearch.trim() ||
                      [batch.batchId, batch.orderNo, batch.party, batch.color, batch.article, batch.supervisor]
                        .some(v => String(v || '').toLowerCase().includes(fmsSearch.toLowerCase()))
                    )
                    .map((batch, idx) => (
                      <tr key={batch.batchId} style={{
                        background: batch.isCompleted ? '#F0FDF4' : (idx % 2 === 0 ? '#FFFFFF' : '#F9FAFB'),
                        borderBottom: '1px solid #F3F4F6',
                        opacity: batch.isCompleted ? 0.8 : 1
                      }}>
                        {visibleFmsColumns.map(col => {
                          const td: React.CSSProperties = { padding: '10px 8px', fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: col.width }
                          switch (col.id) {
                            case 'timestamp':     return <td key={col.id} style={{ ...td, fontSize: '11px', color: '#6B7280' }}>{formatDateTimeDDMMYYYY(batch.timestamp)}</td>
                            case 'orderNo':       return <td key={col.id} style={{ ...td, fontWeight: 700 }}>{batch.orderNo}</td>
                            case 'batchId':       return <td key={col.id} style={{ ...td, fontWeight: 700, color: '#3B82F6' }}>{batch.batchId}</td>
                            case 'party':         return <td key={col.id} style={td}>{batch.party}</td>
                            case 'subParty':      return <td key={col.id} style={td}>{batch.subParty}</td>
                            case 'salesPerson':   return <td key={col.id} style={td}>{batch.salesPerson}</td>
                            case 'article':       return <td key={col.id} style={{ ...td, fontWeight: 500 }}>{batch.article}</td>
                            case 'blend':         return <td key={col.id} style={{ ...td, fontSize: '11px', color: '#6B7280' }}>{batch.blend}</td>
                            case 'width':         return <td key={col.id} style={td}>{batch.width}</td>
                            case 'gsm':           return <td key={col.id} style={td}>{batch.gsm}</td>
                            case 'color':         return <td key={col.id} style={td}>{batch.color}</td>
                            case 'labNo':         return <td key={col.id} style={td}>{batch.labNo}</td>
                            case 'lotNo':         return <td key={col.id} style={td}>{batch.lotNo}</td>
                            case 'challanNo':     return <td key={col.id} style={td}>{batch.challanNo}</td>
                            case 'qtyKg':         return <td key={col.id} style={{ ...td, fontWeight: 700 }}>{batch.qtyKg}</td>
                            case 'qtyMtr':        return <td key={col.id} style={td}>{batch.qtyMtr}</td>
                            case 'noOfTaka':      return <td key={col.id} style={td}>{batch.noOfTaka}</td>
                            case 'typeOfFinish':  return <td key={col.id} style={td}>{batch.typeOfFinish}</td>
                            case 'typeOfPacking': return <td key={col.id} style={td}>{batch.typeOfPacking}</td>
                            case 'remarks':       return <td key={col.id} style={td} title={batch.remarks || ''}>{batch.remarks}</td>
                            case 'supervisor':    return <td key={col.id} style={td}>{batch.supervisor}</td>
                            case 'machine':       return <td key={col.id} style={td}>{getMachineName(batch.machine)}</td>
                            case 'processRoute':  return <td key={col.id} style={{ ...td, fontWeight: 700, color: '#3B82F6' }}>{batch.processRoute}</td>
                            case 'processName':   return <td key={col.id} style={{ ...td, fontWeight: 700, color: '#D97706', background: '#FEF3C7' }}>{batch.currentProcessName}</td>
                            case 'plannedDate':   return <td key={col.id} style={{ ...td, fontWeight: 700, color: batch.plannedDate ? '#3B82F6' : '#9CA3AF' }}>{formatDateOnlyDDMMYYYY(batch.plannedDate)}</td>
                            case 'actualDate':    return (
                              <td key={col.id} style={{ ...td, fontWeight: 700, color: batch.actualDate ? '#10B981' : batch.isFobSent ? '#7C3AED' : '#9CA3AF' }}>
                                {batch.actualDate ? formatDateOnlyDDMMYYYY(batch.actualDate) : batch.isFobSent ? formatDateOnlyDDMMYYYY(batch.fobActualDate) : '-'}
                              </td>
                            )
                            case 'actionDone': {
                              const isDone    = !!batch.actualDate
                              const isFaulty  = !!batch.isFaulty
                              const isFobSent = !!batch.isFobSent
                              const doneDisabled   = isDone || (fmsAllowFaulty && isFaulty) || (fmsAllowFOB && isFobSent)
                              const faultyDisabled = isDone || (fmsAllowFOB && isFobSent)
                              const fobDisabled    = isDone || (fmsAllowFaulty && isFaulty)
                              return (
                                <td key={col.id} style={{ ...td, overflow: 'visible', whiteSpace: 'nowrap' }}>
                                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                    <button onClick={() => !doneDisabled && markProcessDone(batch.orderId, batch.batchId)}
                                      disabled={doneDisabled}
                                      style={{ padding: '5px 10px', fontSize: '11px', border: 'none', borderRadius: '4px', fontWeight: 600,
                                        background: isDone ? '#D1FAE5' : doneDisabled ? '#E5E7EB' : '#10B981',
                                        color: isDone ? '#065F46' : doneDisabled ? '#9CA3AF' : 'white',
                                        cursor: doneDisabled ? 'not-allowed' : 'pointer', opacity: doneDisabled && !isDone ? 0.5 : 1, whiteSpace: 'nowrap' }}>
                                      {isDone ? '✓ Done' : 'Done'}
                                    </button>
                                    {fmsAllowFaulty && (
                                      <button onClick={() => !faultyDisabled && toggleFaulty(batch.orderId, batch.batchId)}
                                        disabled={faultyDisabled}
                                        style={{ padding: '5px 10px', fontSize: '11px', border: '1px solid', borderRadius: '4px', fontWeight: 600,
                                          background: isFaulty ? '#FEE2E2' : faultyDisabled ? '#F9FAFB' : 'white',
                                          borderColor: isFaulty ? '#FCA5A5' : faultyDisabled ? '#E5E7EB' : '#FCA5A5',
                                          color: isFaulty ? '#DC2626' : faultyDisabled ? '#D1D5DB' : '#DC2626',
                                          cursor: faultyDisabled ? 'not-allowed' : 'pointer', opacity: faultyDisabled && !isFaulty ? 0.5 : 1, whiteSpace: 'nowrap' }}>
                                        {isFaulty ? '⚠ Faulty' : 'Faulty'}
                                      </button>
                                    )}
                                    {fmsAllowFOB && (
                                      <button onClick={() => !fobDisabled && !isFobSent && openFobModal(batch.orderId, batch.batchId)}
                                        disabled={fobDisabled || isFobSent}
                                        style={{ padding: '5px 10px', fontSize: '11px', border: '1px solid', borderRadius: '4px', fontWeight: 600,
                                          background: isFobSent ? '#EDE9FE' : fobDisabled ? '#F9FAFB' : 'white',
                                          borderColor: isFobSent ? '#C4B5FD' : fobDisabled ? '#E5E7EB' : '#7C3AED',
                                          color: isFobSent ? '#7C3AED' : fobDisabled ? '#D1D5DB' : '#7C3AED',
                                          cursor: (fobDisabled || isFobSent) ? 'not-allowed' : 'pointer', opacity: fobDisabled && !isFobSent ? 0.5 : 1, whiteSpace: 'nowrap' }}>
                                        {isFobSent ? '✓ FOB Sent' : '+ FOB'}
                                      </button>
                                    )}
                                  </div>
                                </td>
                              )
                            }
                            case 'timeDelay': return <td key={col.id} style={{ ...td, fontWeight: 700, color: batch.delayLate ? '#EF4444' : '#10B981' }}>{batch.delayText}</td>
                            case 'delete':    return (
                              <td key={col.id} style={{ ...td, textAlign: 'center', overflow: 'visible' }}>
                                <button onClick={() => deleteBatchFromFms(batch.orderId, batch.batchId)}
                                  style={{ padding: '5px 10px', fontSize: '11px', border: 'none', borderRadius: '4px', background: '#DC2626', color: 'white', cursor: 'pointer', fontWeight: 500 }}>
                                  Delete
                                </button>
                              </td>
                            )
                            default: return <td key={col.id} style={td}>-</td>
                          }
                        })}
                      </tr>
                    ))
                  }
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Faulty Modal */}
        {showFaultyModal && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
            <div style={{ background: 'white', borderRadius: '8px', padding: '24px', width: '90%', maxWidth: '500px' }}>
              <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: 600, color: '#111827' }}>Mark Batch as Faulty</h3>
              <p style={{ margin: '0 0 4px 0', fontSize: '14px', color: '#374151', fontWeight: 500 }}>
                Batch: <span style={{ color: '#3B82F6', fontWeight: 700 }}>{faultyBatchData?.batchId}</span>
              </p>
              <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: '#6B7280' }}>Enter the fault reason/remark:</p>
              <textarea value={faultyReason} onChange={e => setFaultyReason(e.target.value)}
                placeholder="Example: Shade variation, Crease mark, Uneven dyeing, etc."
                autoFocus rows={3} onKeyDown={e => { if (e.key === 'Escape') setShowFaultyModal(false) }}
                style={{ width: '100%', padding: '10px 12px', border: '1px solid #D1D5DB', borderRadius: '6px', fontSize: '14px', outline: 'none', marginBottom: '20px', boxSizing: 'border-box', fontFamily: 'inherit', resize: 'vertical' }} />
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button onClick={() => { setShowFaultyModal(false); setFaultyBatchData(null); setFaultyReason('') }}
                  style={{ padding: '8px 16px', fontSize: '14px', border: '1px solid #D1D5DB', borderRadius: '6px', background: 'white', color: '#374151', cursor: 'pointer', fontWeight: 500 }}>
                  Cancel
                </button>
                <button onClick={submitFaulty} disabled={!faultyReason.trim()}
                  style={{ padding: '8px 16px', fontSize: '14px', border: 'none', borderRadius: '6px', background: faultyReason.trim() ? '#EF4444' : '#D1D5DB', color: 'white', cursor: faultyReason.trim() ? 'pointer' : 'not-allowed', fontWeight: 500 }}>
                  Mark as Faulty
                </button>
              </div>
            </div>
          </div>
        )}

        {/* FOB Modal */}
        {showFobModal && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
            <div style={{ background: 'white', borderRadius: '8px', padding: '24px', width: '90%', maxWidth: '500px' }}>
              <h3 style={{ margin: '0 0 4px 0', fontSize: '18px', fontWeight: 600, color: '#111827' }}>Raise FOB Entry</h3>
              <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: '#6B7280' }}>
                Batch: <strong style={{ color: '#7C3AED' }}>{fobBatchData?.batchId}</strong> · Process: {processName || processCode}
              </p>
              <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
                {(['dyeing', 'rolling'] as const).map(t => (
                  <button key={t} onClick={() => setFobType(t)} style={{
                    flex: 1, padding: '8px', fontSize: 13, fontWeight: fobType === t ? 700 : 400,
                    border: `1px solid ${fobType === t ? (t === 'dyeing' ? '#185FA5' : '#7C3AED') : '#D1D5DB'}`,
                    borderRadius: 6, cursor: 'pointer',
                    background: fobType === t ? (t === 'dyeing' ? '#185FA5' : '#7C3AED') : 'white',
                    color: fobType === t ? 'white' : '#374151',
                  }}>
                    {t === 'dyeing' ? '🔵 Dyeing FOB' : '🟣 Rolling FOB'}
                  </button>
                ))}
              </div>
              <textarea value={fobReason} onChange={e => setFobReason(e.target.value)}
                placeholder={fobType === 'dyeing' ? 'e.g. Shade variation, Patta, Uneven dyeing…' : 'e.g. Roller mark, Crease, Tension issue…'}
                autoFocus rows={3} onKeyDown={e => { if (e.key === 'Escape') setShowFobModal(false) }}
                style={{ width: '100%', padding: '10px 12px', border: '1px solid #D1D5DB', borderRadius: '6px', fontSize: '14px', outline: 'none', marginBottom: '20px', boxSizing: 'border-box', fontFamily: 'inherit', resize: 'vertical' }} />
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button onClick={() => { setShowFobModal(false); setFobBatchData(null); setFobReason('') }}
                  style={{ padding: '8px 16px', fontSize: '14px', border: '1px solid #D1D5DB', borderRadius: '6px', background: 'white', color: '#374151', cursor: 'pointer', fontWeight: 500 }}>
                  Cancel
                </button>
                <button onClick={submitFob} disabled={!fobReason.trim()}
                  style={{ padding: '8px 16px', fontSize: '14px', border: 'none', borderRadius: '6px', background: fobReason.trim() ? '#7C3AED' : '#D1D5DB', color: 'white', cursor: fobReason.trim() ? 'pointer' : 'not-allowed', fontWeight: 500 }}>
                  Add FOB Entry
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
