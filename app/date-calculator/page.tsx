'use client'

import { useEffect, useState, useRef } from 'react'
import { loadOrSeedProcessList } from '@/lib/processMap'

interface Batch {
  batchId: string
  batchNumber: number
  kg: number
  date?: string
  dateCalcPlan: Record<string, string>
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
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

const dateToDisplayStr = (date: Date | null): string => {
  if (!date) return ''
  const d = date instanceof Date ? date : new Date(date)
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`
}

const normalizeDate = (val: any): Date | null => {
  if (!val) return null
  if (typeof val === 'string' && val.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
    const [day, month, year] = val.split('/')
    const d = new Date(parseInt(year), parseInt(month)-1, parseInt(day))
    return isNaN(d.getTime()) ? null : d
  }
  const d = new Date(val)
  return isNaN(d.getTime()) ? null : d
}

const buildHolidaySet = (holidays: any[]): Set<string> => {
  const set = new Set<string>()
  for (const h of holidays) {
    const d = normalizeDate(h.date)
    if (d) set.add(dateToStr(d))
  }
  return set
}

const addDaysSkippingHolidays = (
  date: Date, days: number, holidaySet: Set<string>, forward = true
): Date => {
  const d = new Date(date.getTime())
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
      try { loadOrSeedProcessList().forEach(p => { _processNameCache![p.code] = p.name }) } catch {}
    }
  }
  const fallback: Record<string, string> = {
    'C':'CBR','S':'SCQ','H':'Heat-Set','D':'Dyeing','S2':'SCQ2','Rx':'Relax','O':'Opener',
    'G':'Ghanti','F':'Finish','Co':'Compactor','Tu':'Tubler','Add':'Addition','Level':'Levelling',
    'Rc':'RC','Fix':'Fixing','Wash':'Washing','Dry':'Dry','B':'Brushing','R':'Raising','K':'Kundi',
    'QA':'QA','Packing':'Packing','Dispatch':'Dispatch','FinalDispatch':'Final Dispatch'
  }
  return _processNameCache![code] || fallback[code] || code
}

const ALL_PROCESS_CODES = [
  'C','S','H','D','S2','Rx','O','G','F','Co','Tu',
  'Add','Level','Rc','Fix','Wash','Dry','B','R','K',
  'QA','Packing','Dispatch','FinalDispatch'
]

export default function DateCalculatorPage() {
  const [rows, setRows] = useState<any[]>([])
  const [excelRows, setExcelRows] = useState<any[]>([])  // temporary rows from Excel upload
  const [showExcelRows, setShowExcelRows] = useState(false)
  const [excelUploading, setExcelUploading] = useState(false)
  const [excelFileName, setExcelFileName] = useState('')
  const excelFileRef = useRef<HTMLInputElement>(null)
  // Column mapping state
  const [showColMapModal, setShowColMapModal] = useState(false)
  const [excelHeaders, setExcelHeaders] = useState<string[]>([])
  const [excelRawData, setExcelRawData] = useState<any[][]>([])
  const [colMap, setColMap] = useState<Record<string,string>>({
    batchId: '', color: '', article: '', kg: '', route: '', machine: '', date: ''
  })
  const [allProcesses] = useState<string[]>(ALL_PROCESS_CODES)
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
    setProcessDurations(db.processDurations || [])

    const splittedOrders = (db.orders || []).filter((o: Order) => Array.isArray(o.splits) && o.splits.length > 0)
    const batchRows: any[] = []

    splittedOrders.forEach((order: Order) => {
      ;(order.splits || []).forEach((batch: Batch) => {
        if (!batch.dateCalcPlan) batch.dateCalcPlan = {}
        const plan = batch.dateCalcPlan
        const processMachines = order.processMachines || {}

        Object.keys(processMachines).forEach(pc => {
          if (batch.plannedDate && !plan[pc]) {
            const ds = batch.plannedDate
            if (ds.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
              plan[pc] = ds
            } else if (ds.match(/^\d{4}-\d{2}-\d{2}$/)) {
              const [y, m, d] = ds.split('-')
              plan[pc] = `${d}/${m}/${y}`
            } else {
              const parsed = normalizeDate(ds)
              plan[pc] = parsed ? dateToDisplayStr(parsed) : ds
            }
          }
        })
        batchRows.push({ order, batch })
      })
    })

    localStorage.setItem('dyeflow_db', JSON.stringify(db))
    setRows(batchRows)
  }

  const pendingDateChanges = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  // ── Excel Upload Handler ─────────────────────────────────────────────
  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setExcelUploading(true)
    setExcelFileName(file.name)
    try {
      const XLSX = await import('xlsx')
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(buffer, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const data: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
      if (data.length < 2) { alert('File is empty or has no data rows.'); return }

      const headers = (data[0] as any[]).map(h => String(h || '').trim())
      setExcelHeaders(headers)
      setExcelRawData(data)

      // Auto-guess column mapping
      const guess = (keywords: string[]) => {
        for (const kw of keywords) {
          const i = headers.findIndex(h => h.toLowerCase() === kw.toLowerCase())
          if (i >= 0) return headers[i]
        }
        for (const kw of keywords) {
          const i = headers.findIndex(h => h.toLowerCase().includes(kw.toLowerCase()))
          if (i >= 0) return headers[i]
        }
        return ''
      }

      setColMap({
        batchId:  guess(['batch id','batchid','batch_id','batch no','batch number','batch','lot no','lot']),
        color:    guess(['color','colour','shade','shade name']),
        article:  guess(['article','art no','article no','design']),
        kg:       guess(['qty kg','qty(kg)','qty (kg)','kg','weight','qty','quantity']),
        route:    guess(['route','process route','process','processroute']),
        machine:  guess(['machine','m/c','machine no']),
        date:     guess(['dye date','dyeing date','start date','planned date','date']),
      })

      setShowColMapModal(true)
    } catch (err: any) {
      alert('Failed to read file: ' + (err.message || 'Unknown error'))
    } finally {
      setExcelUploading(false)
      if (excelFileRef.current) excelFileRef.current.value = ''
    }
  }

  const applyColMapping = () => {
    const headers = excelHeaders
    const data = excelRawData

    const getCol = (colName: string) => colName ? headers.indexOf(colName) : -1

    const batchCol   = getCol(colMap.batchId)
    const colorCol   = getCol(colMap.color)
    const articleCol = getCol(colMap.article)
    const kgCol      = getCol(colMap.kg)
    const routeCol   = getCol(colMap.route)
    const machineCol = getCol(colMap.machine)
    const dateCol    = getCol(colMap.date)

    const parsed: any[] = []
    for (let i = 1; i < data.length; i++) {
      const row = data[i] as any[]
      const batchId = batchCol >= 0 ? String(row[batchCol] || '').trim() : `XL-${i}`
      if (!batchId || batchId === `XL-${i}` && !row.some(Boolean)) continue
      if (!batchId.trim()) continue

      const color    = colorCol   >= 0 ? String(row[colorCol]   || '').trim() : ''
      const article  = articleCol >= 0 ? String(row[articleCol] || '').trim() : ''
      const kg       = kgCol      >= 0 ? parseFloat(String(row[kgCol]).replace(/[^0-9.]/g,'')) || 0 : 0
      const machine  = machineCol >= 0 ? String(row[machineCol] || '').trim() : ''
      const dateVal  = dateCol    >= 0 ? row[dateCol] : ''
      const routeRaw = routeCol   >= 0 ? String(row[routeCol]   || '').trim() : ''

      // Parse date (handle Excel serial numbers and string dates)
      let dateStr = ''
      if (dateVal !== '' && dateVal !== null && dateVal !== undefined) {
        if (typeof dateVal === 'number' && dateVal > 10000) {
          // Excel serial date
          const d = new Date(Math.round((dateVal - 25569) * 86400 * 1000))
          if (!isNaN(d.getTime())) dateStr = dateToDisplayStr(d)
        } else {
          const s = String(dateVal).trim()
          const pn = normalizeDate(s)
          if (pn) dateStr = dateToDisplayStr(pn)
        }
      }

      // Parse route: split on / , space > \
      const routeParts = routeRaw
        ? routeRaw.split(/[/,\\\s>|]+/).map((x: string) => x.trim()).filter(Boolean)
        : []

      // If no machine column, use first process in route as anchor
      const anchorProcess = machine || (routeParts.length > 0 ? routeParts[0] : '')

      const fakeOrder = {
        id: `xl-order-${i}`,
        orderNumber: batchId,
        article,
        color,
        qtyKg: kg,
        processRoute: routeParts,
        machine: anchorProcess,
        // processMachines maps anchor process → date so engine can find anchor
        processMachines: anchorProcess && dateStr ? { [anchorProcess]: anchorProcess } : {},
        splits: [],
      }
      const fakeBatch: any = {
        batchId,
        batchNumber: i,
        kg,
        plannedDate: dateStr,
        // Seed dateCalcPlan with anchor process date so engine has something to work from
        dateCalcPlan: anchorProcess && dateStr ? { [anchorProcess]: dateStr } : {},
        dcGeneratedOnce: false,
        dcRegenerate: false,
        _fromExcel: true,
      }

      parsed.push({ order: fakeOrder, batch: fakeBatch })
    }

    if (!parsed.length) { alert('No valid rows found. Check the Batch ID column mapping.'); return }
    setExcelRows(parsed)
    setShowExcelRows(true)
    setShowColMapModal(false)
  }

  const handleExcelDateChange = (batchId: string, pc: string, value: string) => {
    setExcelRows(prev => prev.map(r =>
      r.batch.batchId === batchId
        ? { ...r, batch: { ...r.batch, dateCalcPlan: { ...r.batch.dateCalcPlan, [pc]: value } } }
        : r
    ))
  }

  const generateExcelDates = () => {
    const stored = localStorage.getItem('dyeflow_db')
    const db = stored ? JSON.parse(stored) : {}
    // Inject temp Excel orders into db for calculation
    const tempOrders = excelRows.map(r => ({ ...r.order, splits: [r.batch] }))
    const origOrders = db.orders || []
    db.orders = [...tempOrders]
    const result = dcPlanAllRows(db)
    // Extract back the updated batches
    const updated: any[] = []
    for (const o of db.orders) {
      const b = o.splits?.[0]
      if (b) updated.push({ order: o, batch: b })
    }
    db.orders = origOrders  // Restore real orders
    localStorage.setItem('dyeflow_db', JSON.stringify(db))
    setExcelRows(updated)
    alert(`✓ Dates generated for ${result.generated} Excel batches!`)
  }

  const exportExcelWithDates = async () => {
    if (!excelRows.length) return
    const XLSX = await import('xlsx')
    const headers = ['Batch ID', 'Color', 'Article', 'Qty (Kg)', 'Route', 'Machine', ...ALL_PROCESS_CODES]
    const dataRows = excelRows.map(({ order, batch }) => [
      batch.batchId,
      order.color,
      order.article,
      batch.kg || order.qtyKg,
      (order.processRoute || []).join('/'),
      order.machine,
      ...ALL_PROCESS_CODES.map(pc => batch.dateCalcPlan?.[pc] || '')
    ])
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet([headers, ...dataRows])
    XLSX.utils.book_append_sheet(wb, ws, 'Dates')
    XLSX.writeFile(wb, 'date_calculator_output.xlsx')
  }

  const handleDateChange = (orderId: string, batchId: string, pc: string, value: string) => {
    setRows(prev => prev.map(r => {
      if (r.order.id !== orderId || r.batch.batchId !== batchId) return r
      return { ...r, batch: { ...r.batch, dateCalcPlan: { ...r.batch.dateCalcPlan, [pc]: value } } }
    }))
    const key = `${orderId}-${batchId}-${pc}`
    if (pendingDateChanges.current[key]) clearTimeout(pendingDateChanges.current[key])
    pendingDateChanges.current[key] = setTimeout(() => {
      const stored = localStorage.getItem('dyeflow_db')
      if (!stored) return
      const db = JSON.parse(stored)
      const order = (db.orders || []).find((o: any) => o.id === orderId)
      if (!order) return
      const batch = (order.splits || []).find((b: any) => b.batchId === batchId)
      if (!batch) return
      if (!batch.dateCalcPlan) batch.dateCalcPlan = {}
      batch.dateCalcPlan[pc] = value
      localStorage.setItem('dyeflow_db', JSON.stringify(db))
      delete pendingDateChanges.current[key]
    }, 400)
  }

  const handleRegenerateToggle = (orderId: string, batchId: string, checked: boolean) => {
    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return
    const db = JSON.parse(stored)
    const order = (db.orders || []).find((o: any) => o.id === orderId)
    const batch = order && (order.splits || []).find((b: any) => b.batchId === batchId)
    if (!batch) return
    batch.dcRegenerate = checked
    localStorage.setItem('dyeflow_db', JSON.stringify(db))
    loadData()
  }

  const handleBatchSelection = (batchId: string, checked: boolean) => {
    setSelectedBatches(prev => {
      const s = new Set(prev)
      checked ? s.add(batchId) : s.delete(batchId)
      return s
    })
  }

  const handleClearSelected = () => {
    if (!selectedBatches.size) { alert('Please select batches to clear'); return }
    if (!confirm(`Clear generated dates for ${selectedBatches.size} selected batch(es)?`)) return
    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return
    const db = JSON.parse(stored)
    let cleared = 0
    selectedBatches.forEach(batchId => {
      for (const order of db.orders || []) {
        const batch = (order.splits || []).find((b: any) => b.batchId === batchId)
        if (batch) {
          const machinePcs = Object.keys(order.processMachines || {})
          if (batch.dateCalcPlan) {
            for (const pc of Object.keys(batch.dateCalcPlan)) {
              if (!machinePcs.includes(pc)) delete batch.dateCalcPlan[pc]
            }
          }
          batch.dcGeneratedOnce = false
          batch.dcRegenerate = false
          cleared++
          break
        }
      }
    })
    localStorage.setItem('dyeflow_db', JSON.stringify(db))
    setSelectedBatches(new Set())
    loadData()
    alert(`✓ Dates cleared for ${cleared} batch(es)`)
  }

  const dcPlanAllRows = (db: any) => {
    const dayMap: Record<string, number> = {}
    const capacityMap: Record<string, number> = {}
    const loadMap: Record<string, Record<string, number>> = {}

    ;(db.processDurations || []).forEach((d: ProcessDuration) => {
      const code = String(d.code || '').trim()
      if (!code) return
      dayMap[code] = d.days > 0 ? d.days : 1
      if (d.capacity && d.capacity > 0) capacityMap[code] = d.capacity
    })
    allProcesses.forEach(c => { if (!dayMap[c]) dayMap[c] = 1 })

    const holidaySet = buildHolidaySet(db.holidays || [])
    const today = normalizeDate(new Date())
    const result = { generated: 0, regenerated: 0, skipped: 0 }

    const getQty = (o: Order, b: Batch): number => {
      const q = parseFloat(String(b?.kg || 0))
      if (q > 0) return q
      const oq = parseFloat(String(o?.qtyKg || 0))
      return oq > 0 ? oq : 0
    }

    const addLoad = (code: string, ds: string, qty: number) => {
      if (!capacityMap[code] || !ds || !qty) return
      if (!loadMap[code]) loadMap[code] = {}
      loadMap[code][ds] = (loadMap[code][ds] || 0) + qty
    }

    const fitDate = (code: string, candidate: string, qty: number): string => {
      const base = normalizeDate(candidate)
      if (!base) return ''
      const cap = capacityMap[code]
      if (!cap || !qty) return dateToStr(base)
      let cur = new Date(base.getTime())
      for (let i = 0; i < 365; i++) {
        const ds = dateToStr(cur)
        if ((loadMap[code]?.[ds] || 0) + qty <= cap + 1e-9) { addLoad(code, ds, qty); return ds }
        cur = addDaysSkippingHolidays(cur, 1, holidaySet, true)
      }
      return dateToStr(base)
    }

    const toDisplay = (ymd: string): string => {
      const p = ymd.split('-')
      return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : ymd
    }

    const tasks = (db.orders || []).flatMap((o: any) =>
      (o.splits || []).map((b: any) => ({
        o, b,
        regen: !!b.dcRegenerate,
        done: !!b.dcGeneratedOnce,
        go: !(!!b.dcGeneratedOnce && !b.dcRegenerate)
      }))
    )

    // Seed locked rows into capacity map
    for (const t of tasks) {
      if (t.go) continue
      const plan = t.b?.dateCalcPlan || {}
      const qty = getQty(t.o, t.b)
      for (const code of Object.keys(capacityMap)) {
        const ds = dateToStr(normalizeDate(plan[code]) || new Date(0))
        if (ds) addLoad(code, ds, qty)
      }
      result.skipped++
    }

    for (const t of tasks) {
      if (!t.go) continue
      const { o, b } = t
      if (!b.dateCalcPlan) b.dateCalcPlan = {}
      const plan = b.dateCalcPlan

      const routeSeq: string[] = Array.isArray(o.processRoute) ? o.processRoute.filter(Boolean) : []
      const seq = [...new Set([...routeSeq, ...EXTRA_TAIL])].filter((c: string) => allProcesses.includes(c))
      if (!seq.length) continue

      let anchorCode = ''
      let anchorDate: Date | null = null
      // First try: find a date in MACHINE_REQUIRED processes
      for (const c of seq) {
        if (!MACHINE_REQUIRED.includes(c)) continue
        const d = normalizeDate(plan[c])
        if (d && (!anchorDate || d > anchorDate)) { anchorDate = d; anchorCode = c }
      }
      // Second try: any process that has a date
      if (!anchorDate) {
        for (const c of seq) {
          const d = normalizeDate(plan[c])
          if (d) { anchorDate = d; anchorCode = c; break }
        }
      }
      // Third try: ANY process in dateCalcPlan even if not in seq
      if (!anchorDate) {
        for (const [c, ds] of Object.entries(plan)) {
          const d = normalizeDate(ds as string)
          if (d) { anchorDate = d; anchorCode = c; break }
        }
      }
      if (!anchorDate || !anchorCode) continue

      // If anchorCode not in seq, insert it at position 0
      let workSeq = [...seq]
      if (!workSeq.includes(anchorCode)) workSeq = [anchorCode, ...workSeq]
      const anchorIdx = workSeq.indexOf(anchorCode)
      if (anchorIdx < 0) continue

      const planned: Record<string, string> = { [anchorCode]: dateToStr(anchorDate) }

      let back = new Date(anchorDate.getTime())
      for (let i = anchorIdx - 1; i >= 0; i--) {
        back = addDaysSkippingHolidays(back, Math.max(1, dayMap[workSeq[i]] || 1), holidaySet, false)
        planned[workSeq[i]] = dateToStr(back)
      }

      let fwd = new Date(anchorDate.getTime())
      for (let i = anchorIdx + 1; i < workSeq.length; i++) {
        fwd = addDaysSkippingHolidays(fwd, Math.max(1, dayMap[workSeq[i-1]] || 1), holidaySet, true)
        planned[workSeq[i]] = dateToStr(fwd)
      }

      const firstCode = workSeq[0]
      const firstDt = normalizeDate(planned[firstCode])
      let useFwdRule = false
      if (firstDt && today && firstDt < today) {
        useFwdRule = true
        const start = addDaysSkippingHolidays(today, Math.max(1, dayMap[firstCode] || 1), holidaySet, true)
        planned[firstCode] = dateToStr(start)
        let cur = new Date(start.getTime())
        for (let i = 1; i < workSeq.length; i++) {
          cur = addDaysSkippingHolidays(cur, Math.max(1, dayMap[workSeq[i]] || 1), holidaySet, true)
          planned[workSeq[i]] = dateToStr(cur)
        }
      }

      // Store as DD/MM/YYYY
      workSeq.forEach((c: string) => { plan[c] = planned[c] ? toDisplay(planned[c]) : '' })

      // Capacity-aware pass
      const qty = getQty(o, b)
      const fa = normalizeDate(plan[firstCode])
      if (fa) {
        const ff = fitDate(firstCode, dateToStr(fa), qty)
        if (ff) plan[firstCode] = toDisplay(ff)
        let prev = normalizeDate(plan[firstCode]) || fa
        for (let i = 1; i < workSeq.length; i++) {
          const c = workSeq[i]
          const pc = workSeq[i-1]
          const days = Math.max(1, dayMap[useFwdRule ? c : pc] || 1)
          const cand = addDaysSkippingHolidays(prev, days, holidaySet, true)
          const finalDs = fitDate(c, dateToStr(cand), qty)
          if (finalDs) { plan[c] = toDisplay(finalDs); prev = normalizeDate(finalDs) || cand }
          else prev = cand
        }
      }

      if (t.done && t.regen) result.regenerated++
      else result.generated++
      b.dcGeneratedOnce = true
      if (b.dcRegenerate) b.dcRegenerate = false
    }
    return result
  }

  const generateDates = () => {
    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return
    const db = JSON.parse(stored)
    setTimeout(() => {
      const result = dcPlanAllRows(db)
      localStorage.setItem('dyeflow_db', JSON.stringify(db))
      loadData()
      savePlannedDatesToOrders(false)
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 3000)
      alert(`✓ Date Generation Complete!\n\nGenerated: ${result.generated}\nRe-generated: ${result.regenerated}\nSkipped: ${result.skipped}\n\nDates auto-saved to orders.`)
    }, 0)
  }

  const savePlannedDatesToOrders = (showAlert = true) => {
    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return
    const db = JSON.parse(stored)
    let updatedOrders = 0, updatedBatches = 0

    const toISO = (ddmmyyyy: string): string => {
      if (!ddmmyyyy) return ''
      if (ddmmyyyy.match(/^\d{2}\/\d{2}\/\d{4}$/)) { const [d,m,y] = ddmmyyyy.split('/'); return `${y}-${m}-${d}` }
      if (ddmmyyyy.match(/^\d{4}-\d{2}-\d{2}$/)) return ddmmyyyy
      const p = new Date(ddmmyyyy)
      return isNaN(p.getTime()) ? '' : dateToStr(p)
    }

    for (const order of (db.orders || [])) {
      if (!Array.isArray(order.splits) || !order.splits.length) continue
      if (!order.plannedDates) order.plannedDates = {}
      let touched = false
      for (const batch of order.splits) {
        const plan: Record<string, string> = batch.dateCalcPlan || {}
        if (!Object.keys(plan).length) continue
        let lastDate = ''
        for (const [code, dateStr] of Object.entries(plan)) {
          const iso = toISO(dateStr)
          if (!iso) continue
          order.plannedDates[code] = iso
          if (!lastDate || iso > lastDate) lastDate = iso
        }
        if (lastDate && !order.plannedDates['Dispatch']) order.plannedDates['Dispatch'] = lastDate
        if (plan['Dispatch']) order.plannedDates['Dispatch'] = toISO(plan['Dispatch'])
        if (plan['FinalDispatch']) order.plannedDates['Dispatch'] = toISO(plan['FinalDispatch'])
        if (order.plannedDates['Dispatch']) batch.plannedDate = order.plannedDates['Dispatch']
        updatedBatches++
        touched = true
      }
      if (touched) updatedOrders++
    }

    localStorage.setItem('dyeflow_db', JSON.stringify(db))
    window.dispatchEvent(new Event('dyeflow-db-updated'))
    if (showAlert) alert(`✅ Planned dates saved to ${updatedOrders} orders across ${updatedBatches} batches.`)
    return { updatedOrders, updatedBatches }
  }

  const openProcessDaysModal = () => {
    const stored = localStorage.getItem('dyeflow_db')
    const db = stored ? JSON.parse(stored) : {}
    const processList = loadOrSeedProcessList()
    const savedDurations: Record<string, any> = {}
    ;(db.processDurations || []).forEach((d: any) => { if (d.code) savedDurations[d.code] = d })
    const temp: Record<string, { days: number, capacity: string }> = {}
    allProcesses.forEach(code => {
      const saved = savedDurations[code]
      const fromMaster = processList.find(p => p.code === code)
      temp[code] = {
        days: saved?.days ?? fromMaster?.defaultDays ?? 1,
        capacity: processDurations.find(d => d.code === code)?.capacity?.toString() || ''
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
    db.processDurations.forEach((d: any, i: number) => { if (d.code && byCode[d.code] === undefined) byCode[d.code] = i })
    allProcesses.forEach(code => {
      const t = tempDurations[code]
      if (!t) return
      const days = Math.max(1, t.days)
      const capacity = t.capacity ? parseFloat(t.capacity) : undefined
      const idx = byCode[code]
      if (idx === undefined) db.processDurations.push({ code, name: getProcessName(code), days, capacity: capacity || '' })
      else { db.processDurations[idx].days = days; db.processDurations[idx].capacity = capacity || '' }
    })
    localStorage.setItem('dyeflow_db', JSON.stringify(db))
    setShowProcessDaysModal(false)
    alert('✓ Process days saved!')
    loadData()
  }

  const formatDate = (ds: string) => {
    try { const d = normalizeDate(ds); return d ? dateToDisplayStr(d) : '' } catch { return ds }
  }

  const getMachinePlannedDates = (order: Order, batch: any): string => {
    const machinePcs = Object.keys(order.processMachines || {})
    if (!machinePcs.length) return '-'
    const entries = machinePcs
      .map(pc => ({ pc, date: batch.dateCalcPlan?.[pc] }))
      .filter(e => e.date)
    if (!entries.length && batch.plannedDate) return formatDate(batch.plannedDate)
    return entries.map(e => `${e.pc}: ${e.date}`).join(' / ')
  }

  if (!rows.length && !showExcelRows) return (
    <div className="content">
      <div className="card">
        <div className="card-header">
          <span className="card-title">Date Calculator Sheet</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input ref={excelFileRef} type="file" accept=".xlsx,.xls,.csv"
              onChange={handleExcelUpload} style={{ display: 'none' }} id="dc-excel-upload-empty" />
            <label htmlFor="dc-excel-upload-empty" style={{
              padding: '8px 16px', fontSize: 13, fontWeight: 600, borderRadius: 6, cursor: 'pointer',
              background: 'var(--accent)', color: '#fff',
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}>
              {excelUploading ? '⏳ Loading…' : '📤 Upload Excel to Calculate Dates'}
            </label>
          </div>
        </div>
        <div style={{ padding: '40px', textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📅</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>No split batches in ERP</div>
          <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 20 }}>
            You can still calculate dates by uploading an Excel file with batch details.
          </div>
          <div style={{ display: 'inline-block', background: 'var(--bg-secondary)', borderRadius: 10, padding: '14px 20px', fontSize: 12, color: 'var(--text-secondary)', textAlign: 'left' }}>
            <strong>Required columns in your Excel:</strong><br/>
            <span style={{ color: 'var(--accent)' }}>Batch ID</span> &nbsp;· 
            <span style={{ color: 'var(--accent)' }}>Color</span> &nbsp;· 
            <span style={{ color: 'var(--accent)' }}>KG</span> &nbsp;· 
            <span style={{ color: 'var(--accent)' }}>Route</span> &nbsp;· 
            <span style={{ color: 'var(--accent)' }}>Machine</span> &nbsp;· 
            <span style={{ color: 'var(--accent)' }}>Date</span>
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <div className="content">
      <div className="card">
        <div className="card-header">
          <span className="card-title">Date Calculator Sheet</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            {/* Excel Upload */}
            <input ref={excelFileRef} type="file" accept=".xlsx,.xls,.csv"
              onChange={handleExcelUpload} style={{ display: 'none' }} id="dc-excel-upload" />
            <label htmlFor="dc-excel-upload" style={{
              padding: '6px 12px', fontSize: 12, fontWeight: 600, borderRadius: 6, cursor: 'pointer',
              background: 'var(--bg-secondary)', border: '1px solid var(--border-light)',
              color: 'var(--text-primary)', display: 'inline-flex', alignItems: 'center', gap: 5,
            }}>
              {excelUploading ? '⏳ Loading…' : '📤 Upload Excel'}
            </label>
            {showExcelRows && (
              <>
                <button className="small success" onClick={generateExcelDates}>⚙ Generate Dates (Excel)</button>
                <button className="small" onClick={exportExcelWithDates}
                  style={{ background: '#059669', color: '#fff', border: 'none', fontWeight: 600 }}>
                  ⬇ Download Output
                </button>
                <button className="small danger" onClick={() => { setExcelRows([]); setShowExcelRows(false); setExcelFileName('') }}>
                  ✕ Clear Excel
                </button>
              </>
            )}
            <span style={{ width: 1, height: 20, background: 'var(--border-light)', display: 'inline-block' }} />
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
          Dates locked after first generation unless <strong>Re-Generate</strong> is checked.
          Click <strong>⬇ Save to Orders</strong> to push dates to Delay Predictor, Reports, and AI.
        </div>

        {/* ── Excel Batch Table ── */}
        {showExcelRows && excelRows.length > 0 && (
          <div style={{ borderTop: '2px solid var(--accent)', marginBottom: 0 }}>
            <div style={{ padding: '8px 16px', background: 'var(--accent-light)', display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent-dark)' }}>
                📤 Excel Batches — {excelRows.length} rows from "{excelFileName}"
              </span>
              <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Temporary · not saved to ERP orders</span>
            </div>
            <div style={{ overflowX: 'auto', maxHeight: 320 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#EFF6FF', position: 'sticky', top: 0, zIndex: 10 }}>
                    <th style={thStyle}>BATCH ID</th>
                    <th style={thStyle}>COLOR</th>
                    <th style={thStyle}>ARTICLE</th>
                    <th style={thStyle}>KG</th>
                    <th style={thStyle}>ROUTE</th>
                    <th style={thStyle}>MACHINE</th>
                    {ALL_PROCESS_CODES.map(pc => <th key={pc} style={thStyle}>{pc}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {excelRows.map(({ order, batch }) => {
                    const plan: Record<string,string> = batch.dateCalcPlan || {}
                    return (
                      <tr key={batch.batchId} style={{ borderBottom: '1px solid #E5E7EB' }}>
                        <td style={{ ...tdStyle, fontWeight: 700, color: '#2563EB' }}>{batch.batchId}</td>
                        <td style={tdStyle}>{order.color || '-'}</td>
                        <td style={tdStyle}>{order.article || '-'}</td>
                        <td style={{ ...tdStyle, fontWeight: 700 }}>{batch.kg || '-'}</td>
                        <td style={tdStyle}>{(order.processRoute || []).join('/') || '-'}</td>
                        <td style={tdStyle}>{order.machine || '-'}</td>
                        {ALL_PROCESS_CODES.map(pc => (
                          <td key={pc} style={{ padding: 0, borderRight: '1px solid #E5E7EB', background: plan[pc] ? '#F0FDF4' : 'transparent' }}>
                            <input type="text" value={plan[pc] || ''}
                              onChange={e => handleExcelDateChange(batch.batchId, pc, e.target.value)}
                              style={{ width: '100%', minWidth: 100, height: 32, border: 0, background: 'transparent', padding: '2px 6px', fontSize: 11, textAlign: 'center', outline: 'none' }}
                            />
                          </td>
                        ))}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {/* ── Main ERP Batch Table ── */}
        {rows.length > 0 && (
        <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 'calc(100vh - 200px)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ background: '#F9FAFB', position: 'sticky', top: 0, zIndex: 10 }}>
                <th style={thStyle}>SELECT</th>
                <th style={thStyle}>COLOUR</th>
                <th style={thStyle}>BATCH</th>
                <th style={thStyle}>QTY(KG)</th>
                <th style={thStyle}>ROUTE</th>
                <th style={thStyle}>MACHINE</th>
                <th style={thStyle}>DATE</th>
                {allProcesses.map(pc => <th key={pc} style={thStyle}>{pc}</th>)}
                <th style={thStyle}>RE-GEN</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ order, batch }) => {
                const route = (order.processRoute || []).map((c: string) => getProcessName(c)).join('/')
                const plan: Record<string, string> = batch.dateCalcPlan || {}
                return (
                  <tr key={`${order.id}-${batch.batchId}`} style={{ borderBottom: '1px solid #E5E7EB' }}>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      <input type="checkbox" checked={selectedBatches.has(batch.batchId)}
                        onChange={e => handleBatchSelection(batch.batchId, e.target.checked)} style={{ cursor: 'pointer' }} />
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
                          onChange={e => handleDateChange(order.id, batch.batchId, pc, e.target.value)}
                          onDoubleClick={e => {
                            const inp = e.target as HTMLInputElement
                            inp.type = 'date'
                            inp.focus()
                            const cv = plan[pc] || ''
                            if (cv.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
                              const [d, m, y] = cv.split('/')
                              inp.value = `${y}-${m}-${d}`
                            }
                          }}
                          onBlur={e => {
                            const inp = e.target as HTMLInputElement
                            if (inp.type === 'date' && inp.value) {
                              const [y, m, d] = inp.value.split('-')
                              handleDateChange(order.id, batch.batchId, pc, `${d}/${m}/${y}`)
                            }
                            inp.type = 'text'
                          }}
                          style={{ width: '100%', minWidth: '110px', height: '36px', border: 0, background: 'transparent', padding: '4px 8px', fontSize: '12px', textAlign: 'center', outline: 'none' }}
                        />
                      </td>
                    ))}
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      <input type="checkbox" checked={batch.dcRegenerate || false}
                        onChange={e => handleRegenerateToggle(order.id, batch.batchId, e.target.checked)} style={{ cursor: 'pointer' }} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        )}
      </div>

      {/* ── Column Mapping Modal ── */}
      {showColMapModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:2000 }}
          onClick={() => setShowColMapModal(false)}>
          <div style={{ background:'white', borderRadius:10, padding:28, maxWidth:520, width:'94%', maxHeight:'85vh', overflow:'auto' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
              <div>
                <div style={{ fontSize:15, fontWeight:700 }}>Map Excel Columns</div>
                <div style={{ fontSize:11, color:'#6B7280', marginTop:2 }}>Tell us which column contains each field from <strong>{excelFileName}</strong></div>
              </div>
              <button onClick={() => setShowColMapModal(false)} style={{ border:'none', background:'none', fontSize:20, cursor:'pointer' }}>✕</button>
            </div>

            {/* Preview first 3 rows */}
            <div style={{ background:'#F9FAFB', borderRadius:8, padding:'8px 12px', marginBottom:16, fontSize:11, color:'#374151', overflowX:'auto' }}>
              <div style={{ fontWeight:700, marginBottom:4, color:'#6B7280' }}>YOUR EXCEL HEADERS:</div>
              <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                {excelHeaders.map((h,i) => (
                  <span key={i} style={{ background:'#E0E7FF', color:'#3730A3', padding:'2px 8px', borderRadius:4, fontSize:11, fontWeight:600 }}>{h}</span>
                ))}
              </div>
            </div>

            {/* Mapping dropdowns */}
            {([
              { key:'batchId',  label:'Batch ID *',   hint:'Unique batch identifier' },
              { key:'color',    label:'Color / Shade', hint:'Colour or shade name' },
              { key:'article',  label:'Article',       hint:'Article or design number' },
              { key:'kg',       label:'Qty (KG)',       hint:'Weight in kg' },
              { key:'route',    label:'Process Route', hint:'e.g. S/F or D/S/F' },
              { key:'machine',  label:'Machine',       hint:'Machine name or number' },
              { key:'date',     label:'Dye Date *',    hint:'The anchor date for generation' },
            ] as {key:string,label:string,hint:string}[]).map(({ key, label, hint }) => (
              <div key={key} style={{ display:'grid', gridTemplateColumns:'160px 1fr', gap:8, alignItems:'center', marginBottom:10 }}>
                <div>
                  <div style={{ fontSize:12, fontWeight:600, color:'#111' }}>{label}</div>
                  <div style={{ fontSize:10, color:'#9CA3AF' }}>{hint}</div>
                </div>
                <select
                  value={colMap[key] || ''}
                  onChange={e => setColMap(prev => ({ ...prev, [key]: e.target.value }))}
                  style={{ padding:'7px 10px', fontSize:12, border:'1px solid #D1D5DB', borderRadius:6, background: colMap[key] ? '#F0FDF4' : '#FFF' }}
                >
                  <option value="">— Not in file —</option>
                  {excelHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            ))}

            <div style={{ display:'flex', gap:8, marginTop:20 }}>
              <button
                onClick={applyColMapping}
                disabled={!colMap.batchId || !colMap.date}
                style={{ padding:'9px 20px', fontSize:13, fontWeight:700, background: (!colMap.batchId || !colMap.date) ? '#E5E7EB' : 'var(--accent)', color: (!colMap.batchId || !colMap.date) ? '#9CA3AF' : '#fff', border:'none', borderRadius:6, cursor: (!colMap.batchId || !colMap.date) ? 'not-allowed' : 'pointer' }}
              >
                ✓ Load {excelRawData.length - 1} Rows
              </button>
              <button onClick={() => setShowColMapModal(false)} style={{ padding:'9px 16px', fontSize:13, border:'1px solid #D1D5DB', borderRadius:6, cursor:'pointer', background:'white' }}>Cancel</button>
            </div>
            {(!colMap.batchId || !colMap.date) && (
              <div style={{ fontSize:11, color:'#DC2626', marginTop:8 }}>* Batch ID and Dye Date are required to generate dates.</div>
            )}
            <div style={{ fontSize:11, color:'#6B7280', marginTop:8 }}>
              💡 <strong>Machine</strong> is optional — if not mapped, the first process in Route will be used as the anchor.
            </div>
          </div>
        </div>
      )}

      {showProcessDaysModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={() => setShowProcessDaysModal(false)}>
          <div style={{ background: 'white', borderRadius: '8px', padding: '24px', maxWidth: '600px', width: '90%', maxHeight: '80vh', overflow: 'auto' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>Process Days Setup</h3>
              <button onClick={() => setShowProcessDaysModal(false)} style={{ border: 'none', background: 'none', fontSize: '20px', cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ maxHeight: '50vh', overflow: 'auto', marginBottom: '16px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#F9FAFB', borderBottom: '2px solid #E5E7EB' }}>
                    {['PROCESS','NAME','DAYS','CAPACITY (KG/DAY)'].map(h => (
                      <th key={h} style={{ padding: '10px', textAlign: 'left', fontSize: '11px', fontWeight: 700, color: '#6B7280' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {allProcesses.map(code => (
                    <tr key={code} style={{ borderBottom: '1px solid #E5E7EB' }}>
                      <td style={{ padding: '10px', fontWeight: 700, color: '#2563EB' }}>{code}</td>
                      <td style={{ padding: '10px' }}>{getProcessName(code)}</td>
                      <td style={{ padding: '10px' }}>
                        <input type="number" min="1" step="1" value={tempDurations[code]?.days || 1}
                          onChange={e => setTempDurations(prev => ({ ...prev, [code]: { ...prev[code], days: parseInt(e.target.value) || 1 } }))}
                          style={{ width: '80px', padding: '6px', border: '1px solid #D1D5DB', borderRadius: '4px' }} />
                      </td>
                      <td style={{ padding: '10px' }}>
                        <input type="number" min="0" step="0.01" value={tempDurations[code]?.capacity || ''}
                          onChange={e => setTempDurations(prev => ({ ...prev, [code]: { ...prev[code], capacity: e.target.value } }))}
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
  padding: '10px 14px', textAlign: 'left', fontSize: '10px', fontWeight: 700, color: '#6B7280',
  textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '2px solid #E5E7EB',
  borderRight: '1px solid #E5E7EB', whiteSpace: 'nowrap', background: '#F9FAFB'
}
const tdStyle: React.CSSProperties = {
  padding: '10px 14px', fontSize: '12px', borderRight: '1px solid #E5E7EB', whiteSpace: 'nowrap'
}
