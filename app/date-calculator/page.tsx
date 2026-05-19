'use client'

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { loadOrSeedProcessList } from '@/lib/processMap'

interface Batch {
  batchId: string
  batchNumber: number
  kg: number
  date?: string
  dateCalcPlan?: Record<string, string>
  dcRegenerate?: boolean
  dcGeneratedOnce?: boolean
  plannedDate?: string
}

interface Order {
  id: string
  orderNumber: string
  article: string
  color: string
  qtyKg: number
  processRoute?: string[]
  machine?: string
  splits?: Batch[]
  processMachines?: Record<string, string>
}

interface ProcessDuration {
  code: string
  name: string
  days: number
  capacity?: number
}

const MACHINE_REQUIRED = ['S', 'D', 'S2', 'Add', 'Lev', 'Fix', 'Wash', 'Rc']
const EXTRA_TAIL = ['QA', 'Packing', 'Dispatch', 'FinalDispatch']

const dateToStr = (date: Date | null): string => {
  if (!date) return ''
  const d = date instanceof Date ? date : new Date(date)
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const year = d.getFullYear()
  return `${year}-${month}-${day}`
}

const dateToDisplayStr = (date: Date | null): string => {
  if (!date) return ''
  const d = date instanceof Date ? date : new Date(date)
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const year = d.getFullYear()
  return `${day}/${month}/${year}`
}

const normalizeDate = (val: any): Date | null => {
  if (!val) return null
  if (typeof val === 'string' && val.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
    const [day, month, year] = val.split('/')
    const d = new Date(parseInt(year), parseInt(month) - 1, parseInt(day))
    if (isNaN(d.getTime())) return null
    return d
  }
  const d = new Date(val)
  if (isNaN(d.getTime())) return null
  return d
}

const addDaysSkippingHolidays = (
  date: Date, days: number, holidaySet: Set<string>, forward: boolean = true
): Date => {
  let d = new Date(date.getTime())
  let remaining = Math.abs(days)
  const step = forward ? 1 : -1
  let safety = 0
  while (remaining > 0 && safety < 730) {
    d.setDate(d.getDate() + step)
    safety++
    if (!holidaySet.has(dateToStr(d))) remaining--
  }
  return d
}

let _processNameCache: Record<string, string> | null = null
const getProcessName = (code: string): string => {
  if (!_processNameCache) {
    _processNameCache = {}
    if (typeof window !== 'undefined') {
      try {
        const list = loadOrSeedProcessList()
        list.forEach(p => { _processNameCache![p.code] = p.name })
      } catch {}
    }
  }
  if (_processNameCache[code]) return _processNameCache[code]
  const codeToName: Record<string, string> = {
    'C': 'CBR', 'S': 'SCQ', 'H': 'Heat-Set', 'D': 'Dyeing', 'S2': 'SCQ2',
    'Rx': 'Relax', 'O': 'Opener', 'G': 'Ghanti', 'F': 'Finish',
    'Co': 'Compactor', 'Tu': 'Tubler', 'Add': 'Addition', 'Level': 'Levelling',
    'Rc': 'RC', 'Fix': 'Fixing', 'Wash': 'Washing', 'Dry': 'Dry',
    'B': 'Brushing', 'R': 'Raising', 'K': 'Kundi',
    'QA': 'QA', 'Packing': 'Packing', 'Dispatch': 'Dispatch', 'FinalDispatch': 'Final Dispatch'
  }
  return codeToName[code] || code
}

export default function DateCalculatorPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [rows, setRows] = useState<any[]>([])
  const [allProcesses, setAllProcesses] = useState<string[]>([])
  const [processDurations, setProcessDurations] = useState<ProcessDuration[]>([])
  const [showProcessDaysModal, setShowProcessDaysModal] = useState(false)
  const [tempDurations, setTempDurations] = useState<Record<string, { days: number, capacity: string }>>({})
  const [selectedBatches, setSelectedBatches] = useState<Set<string>>(new Set())
  const [saveStatus, setSaveStatus] = useState<'idle'|'saving'|'saved'>('idle')

  useEffect(() => { loadData() }, [])

  const loadData = () => {
    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return
    const db = JSON.parse(stored)

    const allProcessCodes = [
      'C', 'S', 'H', 'D', 'S2', 'Rx', 'O', 'G', 'F', 'Co', 'Tu',
      'Add', 'Level', 'Rc', 'Fix', 'Wash', 'Dry', 'B', 'R', 'K',
      'QA', 'Packing', 'Dispatch', 'FinalDispatch'
    ]
    setAllProcesses(allProcessCodes)
    setProcessDurations(db.processDurations || [])

    const splittedOrders = (db.orders || []).filter((o: Order) =>
      Array.isArray(o.splits) && o.splits.length > 0
    )

    const batchRows: any[] = []
    splittedOrders.forEach((order: Order) => {
      ;(order.splits || []).forEach((batch: Batch) => {
        if (!batch.dateCalcPlan) batch.dateCalcPlan = {}

        const processMachines = order.processMachines || {}
        Object.keys(processMachines).forEach(processCode => {
          // Use typed local variable — TypeScript loses narrowing inside forEach closures
          const safePlan: Record<string, string> = batch.dateCalcPlan as Record<string, string>
          if (batch.plannedDate && !safePlan[processCode]) {
            const dateStr = batch.plannedDate
            if (dateStr.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
              safePlan[processCode] = dateStr
            } else if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
              const [year, month, day] = dateStr.split('-')
              safePlan[processCode] = `${day}/${month}/${year}`
            } else {
              const d = normalizeDate(dateStr)
              safePlan[processCode] = d ? dateToDisplayStr(d) : dateStr
            }
          }
        })

        batchRows.push({ order, batch })
      })
    })

    localStorage.setItem('dyeflow_db', JSON.stringify(db))
    setOrders(splittedOrders)
    setRows(batchRows)
  }

  const pendingDateChanges = useRef<Record<string, NodeJS.Timeout>>({})

  const handleDateChange = (orderId: string, batchId: string, processCode: string, value: string) => {
    setRows(prev => prev.map(r => {
      if (r.order.id !== orderId || r.batch.batchId !== batchId) return r
      return { ...r, batch: { ...r.batch, dateCalcPlan: { ...(r.batch.dateCalcPlan || {}), [processCode]: value } } }
    }))
    const key = `${orderId}-${batchId}-${processCode}`
    if (pendingDateChanges.current[key]) clearTimeout(pendingDateChanges.current[key])
    pendingDateChanges.current[key] = setTimeout(() => {
      const stored = localStorage.getItem('dyeflow_db')
      if (!stored) return
      const db = JSON.parse(stored)
      const order = (db.orders || []).find((o: Order) => o.id === orderId)
      if (!order) return
      const batch = (order.splits || []).find((b: Batch) => b.batchId === batchId)
      if (!batch) return
      if (!batch.dateCalcPlan) batch.dateCalcPlan = {}
      batch.dateCalcPlan[processCode] = value
      localStorage.setItem('dyeflow_db', JSON.stringify(db))
      delete pendingDateChanges.current[key]
    }, 400)
  }

  const handleRegenerateToggle = (orderId: string, batchId: string, checked: boolean) => {
    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return
    const db = JSON.parse(stored)
    const order = (db.orders || []).find((o: Order) => o.id === orderId)
    if (!order) return
    const batch = (order.splits || []).find((b: Batch) => b.batchId === batchId)
    if (!batch) return
    batch.dcRegenerate = checked
    localStorage.setItem('dyeflow_db', JSON.stringify(db))
    loadData()
  }

  const handleBatchSelection = (batchId: string, checked: boolean) => {
    setSelectedBatches(prev => {
      const newSet = new Set(prev)
      if (checked) newSet.add(batchId)
      else newSet.delete(batchId)
      return newSet
    })
  }

  const handleClearSelected = () => {
    if (selectedBatches.size === 0) { alert('Please select batches to clear'); return }
    if (!confirm(`Clear generated dates for ${selectedBatches.size} selected batch(es)?`)) return
    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return
    const db = JSON.parse(stored)
    let clearedCount = 0
    selectedBatches.forEach(batchId => {
      for (const order of db.orders || []) {
        const batch = (order.splits || []).find((b: Batch) => b.batchId === batchId)
        if (batch) {
          const machineProcesses = Object.keys(order.processMachines || {})
          if (batch.dateCalcPlan) {
            Object.keys(batch.dateCalcPlan).forEach(pc => {
              if (!machineProcesses.includes(pc)) delete batch.dateCalcPlan![pc]
            })
          }
          batch.dcGeneratedOnce = false
          batch.dcRegenerate = false
          clearedCount++
          break
        }
      }
    })
    localStorage.setItem('dyeflow_db', JSON.stringify(db))
    setSelectedBatches(new Set())
    loadData()
    alert(`✓ Dates cleared for ${clearedCount} batch(es)`)
  }

  const generateDates = () => {
    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return
    const db = JSON.parse(stored)
    setTimeout(() => {
      const result = dcPlanAllRowsFromLatestMachineDate(db)
      localStorage.setItem('dyeflow_db', JSON.stringify(db))
      loadData()
      savePlannedDatesToOrders(false)
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 3000)
      alert(`✓ Date Generation Complete!\n\nGenerated: ${result.generated} batch(es)\nRe-generated: ${result.regenerated} batch(es)\nSkipped: ${result.skipped} batch(es)\n\nPlanned dates automatically saved to all orders.`)
    }, 0)
  }

  const dcPlanAllRowsFromLatestMachineDate = (db: any) => {
    const dayMap: Record<string, number> = {}
    const capacityMap: Record<string, number> = {}
    const loadMap: Record<string, Record<string, number>> = {}

    ;(db.processDurations || []).forEach((d: ProcessDuration) => {
      const code = String(d.code || '').trim()
      if (!code) return
      dayMap[code] = Number.isFinite(d.days) && d.days > 0 ? d.days : 1
      if (d.capacity && Number.isFinite(d.capacity) && d.capacity > 0) capacityMap[code] = d.capacity
    })
    allProcesses.forEach(code => { if (!dayMap[code]) dayMap[code] = 1 })

    const holidaySet = new Set(
      (db.holidays || []).map((h: any) => dateToStr(normalizeDate(h.date) || new Date())).filter(Boolean)
    )
    const today = normalizeDate(new Date())
    const result = { generated: 0, regenerated: 0, skipped: 0 }

    const getBatchQtyKg = (order: Order, batch: Batch): number => {
      const q = parseFloat(String(batch?.kg || 0))
      if (Number.isFinite(q) && q > 0) return q
      const oq = parseFloat(String(order?.qtyKg || 0))
      if (Number.isFinite(oq) && oq > 0) return oq
      return 0
    }

    const addProcessDayLoad = (code: string, ds: string, qty: number) => {
      if (!capacityMap[code] || !ds || !qty) return
      if (!loadMap[code]) loadMap[code] = {}
      loadMap[code][ds] = (loadMap[code][ds] || 0) + qty
    }

    const fitDateByCapacity = (code: string, candidateDateStr: string, qty: number): string => {
      const base = normalizeDate(candidateDateStr)
      if (!base) return ''
      const cap = capacityMap[code]
      const dsBase = dateToStr(base)
      if (!cap || !qty) return dsBase
      let cur = new Date(base.getTime())
      let safety = 0
      while (safety < 365) {
        const ds = dateToStr(cur)
        const used = loadMap[code]?.[ds] || 0
        if (used + qty <= cap + 1e-9) { addProcessDayLoad(code, ds, qty); return ds }
        cur = addDaysSkippingHolidays(cur, 1, holidaySet, true)
        safety++
      }
      return dsBase
    }

    const tasks: any[] = []
    for (const o of (db.orders || [])) {
      for (const b of (o.splits || [])) {
        const allowRegenerate = !!b.dcRegenerate
        const alreadyGenerated = !!b.dcGeneratedOnce
        const shouldProcess = !(alreadyGenerated && !allowRegenerate)
        tasks.push({ order: o, batch: b, allowRegenerate, alreadyGenerated, shouldProcess })
      }
    }

    for (const t of tasks) {
      if (t.shouldProcess) continue
      const plan = t.batch?.dateCalcPlan || {}
      const qty = getBatchQtyKg(t.order, t.batch)
      if (!qty) continue
      for (const code of Object.keys(capacityMap)) {
        const ds = dateToStr(normalizeDate(plan[code])!)
        if (ds) addProcessDayLoad(code, ds, qty)
      }
      result.skipped++
    }

    for (const t of tasks) {
      const o = t.order
      const b = t.batch
      if (!t.shouldProcess) continue
      if (!b.dateCalcPlan) b.dateCalcPlan = {}
      const plan = b.dateCalcPlan

      const routeSeq = Array.isArray(o.processRoute) ? o.processRoute.filter(Boolean) : []
      const seq = [...new Set([...routeSeq, ...EXTRA_TAIL])].filter((code: string) => allProcesses.includes(code))
      if (!seq.length) continue

      let anchorCode = ''
      let anchorDate: Date | null = null
      for (const code of seq) {
        if (!MACHINE_REQUIRED.includes(code)) continue
        const d = normalizeDate(plan[code])
        if (!d) continue
        if (!anchorDate || d > anchorDate) { anchorDate = d; anchorCode = code }
      }
      if (!anchorDate) {
        for (const code of seq) {
          const d = normalizeDate(plan[code])
          if (d) { anchorDate = d; anchorCode = code; break }
        }
      }
      if (!anchorDate || !anchorCode) continue

      const anchorIdx = seq.indexOf(anchorCode)
      if (anchorIdx < 0) continue

      const planned: Record<string, string> = {}
      planned[anchorCode] = dateToStr(anchorDate)

      let backCur = new Date(anchorDate.getTime())
      for (let i = anchorIdx - 1; i >= 0; i--) {
        const code = seq[i]
        backCur = addDaysSkippingHolidays(backCur, Math.max(1, dayMap[code] || 1), holidaySet, false)
        planned[code] = dateToStr(backCur)
      }

      let fwdCur = new Date(anchorDate.getTime())
      for (let i = anchorIdx + 1; i < seq.length; i++) {
        fwdCur = addDaysSkippingHolidays(fwdCur, Math.max(1, dayMap[seq[i-1]] || 1), holidaySet, true)
        planned[seq[i]] = dateToStr(fwdCur)
      }

      const firstCode = seq[0]
      const firstDt = normalizeDate(planned[firstCode])
      let useCurrentDaysForwardRule = false

      if (firstDt && today && firstDt < today) {
        useCurrentDaysForwardRule = true
        const start = addDaysSkippingHolidays(today, Math.max(1, dayMap[firstCode] || 1), holidaySet, true)
        planned[firstCode] = dateToStr(start)
        let cur = new Date(start.getTime())
        for (let i = 1; i < seq.length; i++) {
          cur = addDaysSkippingHolidays(cur, Math.max(1, dayMap[seq[i]] || 1), holidaySet, true)
          planned[seq[i]] = dateToStr(cur)
        }
      }

      // Convert YYYY-MM-DD → DD/MM/YYYY
      seq.forEach((code: string) => {
        const dateYMD = planned[code] || ''
        if (dateYMD) {
          const parts = dateYMD.split('-')
          plan[code] = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : dateYMD
        } else {
          plan[code] = ''
        }
      })

      const qtyKg = getBatchQtyKg(o, b)
      const firstAssigned = normalizeDate(plan[firstCode])
      if (firstAssigned) {
        const firstFinal = fitDateByCapacity(firstCode, dateToStr(firstAssigned), qtyKg)
        if (firstFinal) {
          const parts = firstFinal.split('-')
          plan[firstCode] = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : firstFinal
        }
        let prevAssigned = normalizeDate(plan[firstCode]) || firstAssigned
        for (let i = 1; i < seq.length; i++) {
          const code = seq[i]
          const prevCode = seq[i - 1]
          const days = Math.max(1, dayMap[useCurrentDaysForwardRule ? code : prevCode] || 1)
          const candidate = addDaysSkippingHolidays(prevAssigned, days, holidaySet, true)
          const finalDs = fitDateByCapacity(code, dateToStr(candidate), qtyKg)
          if (finalDs) {
            const parts = finalDs.split('-')
            plan[code] = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : finalDs
            prevAssigned = normalizeDate(finalDs) || candidate
          } else {
            prevAssigned = candidate
          }
        }
      }

      if (t.alreadyGenerated && t.allowRegenerate) result.regenerated++
      else result.generated++
      b.dcGeneratedOnce = true
      if (b.dcRegenerate) b.dcRegenerate = false
    }
    return result
  }

  const savePlannedDatesToOrders = (showAlert = true) => {
    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return
    const db = JSON.parse(stored)
    let updatedOrders = 0, updatedBatches = 0

    for (const order of (db.orders || [])) {
      if (!Array.isArray(order.splits) || order.splits.length === 0) continue
      if (!order.plannedDates || typeof order.plannedDates !== 'object') order.plannedDates = {}
      let orderTouched = false

      for (const batch of order.splits) {
        const plan: Record<string, string> = batch.dateCalcPlan || {}
        if (Object.keys(plan).length === 0) continue

        const toISO = (ddmmyyyy: string): string => {
          if (!ddmmyyyy) return ''
          if (ddmmyyyy.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
            const [d, m, y] = ddmmyyyy.split('/')
            return `${y}-${m}-${d}`
          }
          if (ddmmyyyy.match(/^\d{4}-\d{2}-\d{2}$/)) return ddmmyyyy
          const parsed = new Date(ddmmyyyy)
          return isNaN(parsed.getTime()) ? '' : dateToStr(parsed)
        }

        let lastDate = ''
        Object.entries(plan).forEach(([code, dateStr]) => {
          const iso = toISO(dateStr)
          if (!iso) return
          order.plannedDates[code] = iso
          if (!lastDate || iso > lastDate) lastDate = iso
        })

        if (lastDate && !order.plannedDates['Dispatch']) order.plannedDates['Dispatch'] = lastDate
        if (plan['Dispatch']) order.plannedDates['Dispatch'] = toISO(plan['Dispatch'])
        if (plan['FinalDispatch']) order.plannedDates['Dispatch'] = toISO(plan['FinalDispatch'])
        if (order.plannedDates['Dispatch']) batch.plannedDate = order.plannedDates['Dispatch']

        updatedBatches++
        orderTouched = true
      }
      if (orderTouched) updatedOrders++
    }

    localStorage.setItem('dyeflow_db', JSON.stringify(db))
    window.dispatchEvent(new Event('dyeflow-db-updated'))
    if (showAlert) alert(`✅ Planned dates saved to ${updatedOrders} order${updatedOrders !== 1 ? 's' : ''}\nacross ${updatedBatches} batch${updatedBatches !== 1 ? 'es' : ''}.\n\nDelay Predictor, Reports, and AI Assistant will now use these dates.`)
    return { updatedOrders, updatedBatches }
  }

  const openProcessDaysModal = () => {
    const stored = localStorage.getItem('dyeflow_db')
    const db = stored ? JSON.parse(stored) : {}
    const processList = loadOrSeedProcessList()
    const savedDurations: Record<string, { days: number }> = {}
    ;(db.processDurations || []).forEach((d: any) => { if (d.code) savedDurations[d.code] = d })
    const temp: Record<string, { days: number, capacity: string }> = {}
    allProcesses.forEach(code => {
      const saved = savedDurations[code]
      const fromMaster = processList.find(p => p.code === code)
      temp[code] = {
        days: saved?.days ?? fromMaster?.defaultDays ?? 1,
        capacity: (processDurations.find(d => d.code === code)?.capacity?.toString()) || ''
      }
    })
    setTempDurations(temp)
    setShowProcessDaysModal(true)
  }

  const saveProcessDays = () => {
    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return
    const db = JSON.parse(stored)
    if (!Array.isArray(db.processDurations)) db.processDurations = []
    const byCode: Record<string, number> = {}
    db.processDurations.forEach((d: ProcessDuration, i: number) => { if (d.code && byCode[d.code] === undefined) byCode[d.code] = i })
    allProcesses.forEach(code => {
      const temp = tempDurations[code]
      if (!temp) return
      const days = Math.max(1, temp.days)
      const capacity = temp.capacity ? parseFloat(temp.capacity) : undefined
      const idx = byCode[code]
      if (idx === undefined) db.processDurations.push({ code, name: getProcessName(code), days, capacity: capacity || '' })
      else { db.processDurations[idx].days = days; db.processDurations[idx].capacity = capacity || '' }
    })
    localStorage.setItem('dyeflow_db', JSON.stringify(db))
    setShowProcessDaysModal(false)
    alert('✓ Process days saved successfully!')
    loadData()
  }

  const formatDate = (dateStr: string) => {
    if (!dateStr) return ''
    try { const d = normalizeDate(dateStr); return d ? dateToDisplayStr(d) : '' } catch { return dateStr }
  }

  const getMachinePlannedDates = (order: Order, batch: any): string => {
    const machineProcesses = Object.keys(order.processMachines || {})
    if (machineProcesses.length === 0) return '-'
    const dateEntries: { process: string, date: string }[] = []
    machineProcesses.forEach(pc => {
      const dateStr = batch.dateCalcPlan?.[pc]
      if (dateStr) dateEntries.push({ process: pc, date: dateStr })
    })
    if (dateEntries.length === 0 && batch.plannedDate) return formatDate(batch.plannedDate)
    return dateEntries.map(e => `${e.process}: ${e.date}`).join(' / ')
  }

  if (rows.length === 0) {
    return (
      <div className="content">
        <div className="card">
          <div className="card-header"><span className="card-title">Date Calculator Sheet</span></div>
          <div className="empty-state" style={{ padding: '30px' }}>No split batches found. Split orders first.</div>
        </div>
      </div>
    )
  }

  return (
    <div className="content">
      <div className="card">
        <div className="card-header">
          <span className="card-title">Date Calculator Sheet</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>Excel row/column format - all processes</span>
            <button className="small success" onClick={generateDates}>⚙ Generate Dates</button>
            <button className="small" onClick={() => savePlannedDatesToOrders(true)}
              style={{ background: saveStatus === 'saved' ? '#1D9E75' : 'var(--accent)', color: '#fff', border: 'none', fontWeight: 600 }}>
              {saveStatus === 'saved' ? '✓ Saved to Orders' : '⬇ Save to Orders'}
            </button>
            <button className="small primary" onClick={openProcessDaysModal}>Process Days</button>
            <button className="small" onClick={handleClearSelected}
              style={{ background: selectedBatches.size > 0 ? '#DC2626' : '#E5E7EB', color: selectedBatches.size > 0 ? 'white' : '#9CA3AF', border: 'none' }}>
              Clear Selected ({selectedBatches.size})
            </button>
          </div>
        </div>

        <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', padding: '0 20px', marginBottom: '12px' }}>
          Dates generated only on <strong>Generate Dates</strong>. Locked after first generation unless <strong>Re-Generate</strong> is checked.
          Click <strong>⬇ Save to Orders</strong> to push dates to Delay Predictor, Reports, and AI.
        </div>

        <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 'calc(100vh - 200px)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ background: '#F9FAFB', position: 'sticky', top: 0, zIndex: 10 }}>
                <th style={thStyle}>SELECT</th>
                <th style={thStyle}>COLOUR</th>
                <th style={thStyle}>BATCH NUMBER</th>
                <th style={thStyle}>QTY(KG)</th>
                <th style={thStyle}>PROCESS ROUTE</th>
                <th style={thStyle}>MACHINE</th>
                <th style={thStyle}>DATE</th>
                {allProcesses.map(pc => <th key={pc} style={thStyle}>{pc}</th>)}
                <th style={thStyle}>RE-GENERATE</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ order, batch }) => {
                const route = (order.processRoute || []).map((c: string) => getProcessName(c)).join('/')
                const plan = batch.dateCalcPlan || {}
                return (
                  <tr key={`${order.id}-${batch.batchId}`} style={{ borderBottom: '1px solid #E5E7EB' }}>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      <input type="checkbox" checked={selectedBatches.has(batch.batchId)}
                        onChange={(e) => handleBatchSelection(batch.batchId, e.target.checked)} style={{ cursor: 'pointer' }} />
                    </td>
                    <td style={tdStyle}>{order.color || '-'}</td>
                    <td style={{ ...tdStyle, fontWeight: 700, color: '#2563EB' }}>{batch.batchId || '-'}</td>
                    <td style={{ ...tdStyle, fontWeight: 700 }}>{batch.kg || order.qtyKg || '-'}</td>
                    <td style={{ ...tdStyle, fontWeight: 700, color: '#2563EB' }}>{route || '-'}</td>
                    <td style={tdStyle}>{order.machine || '-'}</td>
                    <td style={{ ...tdStyle, fontSize: '11px' }}>{getMachinePlannedDates(order, batch)}</td>
                    {allProcesses.map(pc => (
                      <td key={pc} style={{ padding: 0, borderRight: '1px solid #E5E7EB' }}>
                        <input type="text" value={plan[pc] || ''}
                          onChange={(e) => handleDateChange(order.id, batch.batchId, pc, e.target.value)}
                          onDoubleClick={(e) => {
                            const input = e.target as HTMLInputElement
                            input.type = 'date'
                            input.focus()
                            const cv = plan[pc] || ''
                            if (cv.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
                              const [day, month, year] = cv.split('/')
                              input.value = `${year}-${month}-${day}`
                            }
                          }}
                          onBlur={(e) => {
                            const input = e.target as HTMLInputElement
                            if (input.type === 'date' && input.value) {
                              const [year, month, day] = input.value.split('-')
                              handleDateChange(order.id, batch.batchId, pc, `${day}/${month}/${year}`)
                            }
                            input.type = 'text'
                          }}
                          style={{ width: '100%', minWidth: '110px', height: '36px', border: 0, background: 'transparent', padding: '4px 8px', fontSize: '12px', textAlign: 'center', outline: 'none' }}
                        />
                      </td>
                    ))}
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      <input type="checkbox" checked={batch.dcRegenerate || false}
                        onChange={(e) => handleRegenerateToggle(order.id, batch.batchId, e.target.checked)} style={{ cursor: 'pointer' }} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {showProcessDaysModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={() => setShowProcessDaysModal(false)}>
          <div style={{ background: 'white', borderRadius: '8px', padding: '24px', maxWidth: '600px', width: '90%', maxHeight: '80vh', overflow: 'auto' }}
            onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>Process Days Setup</h3>
              <button onClick={() => setShowProcessDaysModal(false)} style={{ border: 'none', background: 'none', fontSize: '20px', cursor: 'pointer' }}>✕</button>
            </div>
            <p style={{ fontSize: '12px', color: '#6B7280', marginBottom: '16px' }}>
              Set number of days for each process. Defaults from <strong>Setup → Process Master</strong>.
            </p>
            <div style={{ maxHeight: '50vh', overflow: 'auto', marginBottom: '16px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#F9FAFB', borderBottom: '2px solid #E5E7EB' }}>
                    <th style={{ padding: '10px', textAlign: 'left', fontSize: '11px', fontWeight: 700, color: '#6B7280' }}>PROCESS</th>
                    <th style={{ padding: '10px', textAlign: 'left', fontSize: '11px', fontWeight: 700, color: '#6B7280' }}>NAME</th>
                    <th style={{ padding: '10px', textAlign: 'left', fontSize: '11px', fontWeight: 700, color: '#6B7280' }}>DAYS</th>
                    <th style={{ padding: '10px', textAlign: 'left', fontSize: '11px', fontWeight: 700, color: '#6B7280' }}>CAPACITY (KG/DAY)</th>
                  </tr>
                </thead>
                <tbody>
                  {allProcesses.map(code => (
                    <tr key={code} style={{ borderBottom: '1px solid #E5E7EB' }}>
                      <td style={{ padding: '10px', fontWeight: 700, color: '#2563EB' }}>{code}</td>
                      <td style={{ padding: '10px' }}>{getProcessName(code)}</td>
                      <td style={{ padding: '10px' }}>
                        <input type="number" min="1" step="1" value={tempDurations[code]?.days || 1}
                          onChange={(e) => setTempDurations(prev => ({ ...prev, [code]: { ...prev[code], days: parseInt(e.target.value) || 1 } }))}
                          style={{ width: '80px', padding: '6px', border: '1px solid #D1D5DB', borderRadius: '4px' }} />
                      </td>
                      <td style={{ padding: '10px' }}>
                        <input type="number" min="0" step="0.01" value={tempDurations[code]?.capacity || ''}
                          onChange={(e) => setTempDurations(prev => ({ ...prev, [code]: { ...prev[code], capacity: e.target.value } }))}
                          style={{ width: '100px', padding: '6px', border: '1px solid #D1D5DB', borderRadius: '4px' }} placeholder="Optional" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="primary" onClick={saveProcessDays}>Save Process Days</button>
              <button onClick={() => setShowProcessDaysModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const thStyle: React.CSSProperties = {
  padding: '10px 14px', textAlign: 'left', fontSize: '10px', fontWeight: 700,
  color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.5px',
  borderBottom: '2px solid #E5E7EB', borderRight: '1px solid #E5E7EB',
  whiteSpace: 'nowrap', background: '#F9FAFB'
}

const tdStyle: React.CSSProperties = {
  padding: '10px 14px', fontSize: '12px', borderRight: '1px solid #E5E7EB', whiteSpace: 'nowrap'
}
