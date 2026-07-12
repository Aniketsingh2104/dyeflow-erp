'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { fetchProcessList } from '@/lib/processMap'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// Date utilities (unchanged from original)
// ─────────────────────────────────────────────────────────────────────────────
const ALL_PROCESS_CODES  = ['C','S','H','D','S2','Rx','O','G','F','Co','Tu','Add','Level','Rc','Fix','Wash','Dry','B','R','K','QA','Packing','Dispatch','FinalDispatch']
const MACHINE_PROCS_PRIORITY = ['S2','Add','Level','Rc','Fix','Wash','S','D']
const EXTRA_TAIL = ['QA','Packing','Dispatch','FinalDispatch']

const dateToStr = (date: Date | null): string => {
  if (!date) return ''
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`
}
const dateToDisplayStr = (date: Date | null): string => {
  if (!date) return ''
  return `${String(date.getDate()).padStart(2,'0')}/${String(date.getMonth()+1).padStart(2,'0')}/${date.getFullYear()}`
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
    const d = normalizeDate(h.holiday_date || h.date)  // support both Supabase + legacy
    if (d) set.add(dateToStr(d))
  }
  return set
}
const addDaysSkippingHolidays = (date: Date, days: number, holidaySet: Set<string>, forward = true): Date => {
  const d = new Date(date.getTime()); let remaining = Math.abs(days); const step = forward ? 1 : -1; let safety = 0
  while (remaining > 0 && safety < 730) { d.setDate(d.getDate() + step); safety++; if (!holidaySet.has(dateToStr(d))) remaining-- }
  return d
}

// Process name cache (filled from Supabase process list)
let _procNameCache: Record<string, string> = {
  'C':'CBR','S':'SCQ','H':'Heat-Set','D':'Dyeing','S2':'SCQ2','Rx':'Relax','O':'Opener',
  'G':'Ghanti','F':'Finish','Co':'Compactor','Tu':'Tubler','Add':'Addition','Level':'Levelling',
  'Rc':'RC','Fix':'Fixing','Wash':'Washing','Dry':'Dry','B':'Brushing','R':'Raising','K':'Kundi',
  'QA':'QA','Packing':'Packing','Dispatch':'Dispatch','FinalDispatch':'Final Dispatch'
}
const getProcessName = (code: string) => _procNameCache[code] || code

const toISO = (s: string): string => {
  if (!s) return ''
  if (s.match(/^\d{2}\/\d{2}\/\d{4}$/)) { const[d,m,y]=s.split('/'); return `${y}-${m}-${d}` }
  if (s.match(/^\d{4}-\d{2}-\d{2}$/)) return s
  const p = new Date(s); return isNaN(p.getTime()) ? '' : dateToStr(p)
}
const toDisplay = (ymd: string) => { const p = ymd.split('-'); return p.length===3?`${p[2]}/${p[1]}/${p[0]}`:ymd }

// ─────────────────────────────────────────────────────────────────────────────
// Date Calculator Page
// ─────────────────────────────────────────────────────────────────────────────
export default function DateCalculatorPage() {
  // ERP rows (from Supabase batches/orders)
  const [rows,             setRows]             = useState<any[]>([])
  // Excel upload rows (pure client-side, no Supabase)
  const [excelRows,        setExcelRows]        = useState<any[]>([])
  const [showExcelRows,    setShowExcelRows]    = useState(false)
  const [excelUploading,   setExcelUploading]   = useState(false)
  const [excelFileName,    setExcelFileName]    = useState('')

  const [allProcesses]  = useState<string[]>(ALL_PROCESS_CODES)
  const [processDurations, setProcessDurations] = useState<ProcessDuration[]>([])
  const [holidays,         setHolidays]         = useState<any[]>([])
  const [showPDModal,      setShowPDModal]      = useState(false)
  const [tempDurations,    setTempDurations]    = useState<Record<string, {days:number; capacity:string}>>({})
  const [selectedBatches,  setSelectedBatches]  = useState<Set<string>>(new Set())
  const [saveStatus,       setSaveStatus]       = useState<'idle'|'saving'|'saved'>('idle')
  const [loadStatus,       setLoadStatus]       = useState<'loading'|'ready'|'error'>('loading')

  const pendingDateChanges = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  // ── Load all data from Supabase ──────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoadStatus('loading')
    try {
      const [oRes, bRes, hRes, pdRes, procList] = await Promise.all([
        fetch('/api/orders?limit=2000',  { cache: 'no-store' }).then(r => r.json()),
        fetch('/api/batches?limit=10000',{ cache: 'no-store' }).then(r => r.json()),
        fetch('/api/setup/holidays',     { cache: 'no-store' }).then(r => r.json()),
        fetch('/api/setup/settings?key=processDurations', { cache: 'no-store' }).then(r => r.json()),
        fetchProcessList(),
      ])

      // Build process name cache
      procList.forEach(p => { _procNameCache[p.code] = p.name })

      // Holidays
      setHolidays(hRes.data || [])

      // Process durations from settings
      const savedDurations: ProcessDuration[] = pdRes.value || []
      setProcessDurations(savedDurations)

      // Shape orders + batches into the legacy {order, batch} row format
      const orders:  any[] = oRes.data  || []
      const batches: any[] = bRes.data  || []

      // Group batches by order_id
      const batchByOrder: Record<string, any[]> = {}
      for (const b of batches) {
        if (!batchByOrder[b.order_id]) batchByOrder[b.order_id] = []
        batchByOrder[b.order_id].push(b)
      }

      const batchRows: any[] = []
      for (const order of orders) {
        const orderBatches = batchByOrder[order.id] || []
        if (!orderBatches.length) continue

        const legacyOrder: Order = {
          id:           order.id,
          orderNumber:  order.order_number,
          article:      order.article || '',
          color:        order.color   || '',
          qtyKg:        parseFloat(order.qty_kg) || 0,
          processRoute: order.process_route || [],
          machine:      order.machines?.name || '',
          // processMachines: map each anchor process to itself
          processMachines: Object.fromEntries(
            MACHINE_PROCS_PRIORITY.filter(p => (order.process_route || []).includes(p)).map(p => [p, p])
          ),
        }

        for (const b of orderBatches) {
          // date_calc_plan is stored in batches.date_calc_plan (jsonb) or rebuild empty
          const dateCalcPlan: Record<string, string> = b.date_calc_plan || {}
          const batch: Batch = {
            batchId:          b.batch_id || b.id,
            batchNumber:      b.batch_number || 0,
            kg:               parseFloat(b.kg) || 0,
            plannedDate:      (order.planned_dates || {})['Dispatch'] || '',
            dateCalcPlan,
            dcGeneratedOnce:  b.dc_generated_once || false,
            dcRegenerate:     b.dc_regenerate     || false,
          }
          batchRows.push({ order: legacyOrder, batch, _batchId: b.id })
        }
      }

      setRows(batchRows)
      setLoadStatus('ready')
    } catch (err) {
      console.error('Date calc load error:', err)
      setLoadStatus('error')
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // ── Persist a date change for one batch cell to Supabase ────────────────
  const persistDateChange = useCallback((batchDbId: string, dateCalcPlan: Record<string, string>) => {
    // Debounce: save 400ms after last keystroke
    const key = batchDbId
    if (pendingDateChanges.current[key]) clearTimeout(pendingDateChanges.current[key])
    pendingDateChanges.current[key] = setTimeout(async () => {
      try {
        await fetch('/api/batches', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'update', id: batchDbId, date_calc_plan: dateCalcPlan }),
        })
      } catch { /* fire-and-forget */ }
      delete pendingDateChanges.current[key]
    }, 400)
  }, [])

  const handleDateChange = (rowIdx: number, pc: string, value: string) => {
    setRows(prev => {
      const updated = [...prev]
      const row = { ...updated[rowIdx] }
      row.batch = { ...row.batch, dateCalcPlan: { ...row.batch.dateCalcPlan, [pc]: value } }
      updated[rowIdx] = row
      // Debounce persist
      if (row._batchId) persistDateChange(row._batchId, row.batch.dateCalcPlan)
      return updated
    })
  }

  const handleRegenerateToggle = (rowIdx: number, checked: boolean) => {
    setRows(prev => {
      const updated = [...prev]
      updated[rowIdx] = { ...updated[rowIdx], batch: { ...updated[rowIdx].batch, dcRegenerate: checked } }
      return updated
    })
    // Persist flag to Supabase
    const row = rows[rowIdx]
    if (row._batchId) {
      fetch('/api/batches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update', id: row._batchId, dc_regenerate: checked }),
      }).catch(() => {})
    }
  }

  const handleBatchSelection = (batchId: string, checked: boolean) =>
    setSelectedBatches(prev => { const s = new Set(prev); checked ? s.add(batchId) : s.delete(batchId); return s })

  const handleClearSelected = async () => {
    if (!selectedBatches.size) { alert('Select batches first'); return }
    if (!confirm(`Clear dates for ${selectedBatches.size} batch(es)?`)) return
    let cleared = 0
    for (const row of rows) {
      if (!selectedBatches.has(row.batch.batchId)) continue
      const emptyPlan: Record<string, string> = {}
      await fetch('/api/batches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update', id: row._batchId, date_calc_plan: emptyPlan, dc_generated_once: false, dc_regenerate: false }),
      }).catch(() => {})
      cleared++
    }
    setSelectedBatches(new Set())
    await loadData()
    alert(`✓ Cleared ${cleared} batch(es)`)
  }

  // ── The date calculation engine (unchanged from original) ─────────────────
  const dcPlanAllRows = (
    workRows: any[],
    dayMap:  Record<string, number>,
    capMap:  Record<string, number>,
    holidaySet: Set<string>,
    externalLoadMap?: Record<string, Record<string,number>>
  ) => {
    const loadMap: Record<string, Record<string, number>> = {}

    // Seed from externalLoadMap (Excel existing rows)
    if (externalLoadMap) {
      for (const [proc, dates] of Object.entries(externalLoadMap)) {
        if (!loadMap[proc]) loadMap[proc] = {}
        for (const [ds, kg] of Object.entries(dates)) {
          const d = normalizeDate(ds); if (!d) continue
          const ymd = dateToStr(d)
          loadMap[proc][ymd] = (loadMap[proc][ymd] || 0) + kg
        }
      }
    }

    // Pre-load already-committed (not regenerating) batches
    const tasks = workRows.map(r => ({
      ...r,
      go: !(!!r.batch.dcGeneratedOnce && !r.batch.dcRegenerate)
    }))
    for (const t of tasks) {
      if (t.go) continue
      const plan = t.batch.dateCalcPlan || {}
      const qty  = parseFloat(String(t.batch.kg)) || t.order.qtyKg || 0
      for (const [code, ds] of Object.entries(plan)) {
        const d = normalizeDate(ds as string); if (!d) continue
        const ymd = dateToStr(d)
        if (!loadMap[code]) loadMap[code] = {}
        loadMap[code][ymd] = (loadMap[code][ymd] || 0) + qty
      }
    }

    const fitDate = (code: string, candidate: string, qty: number): string => {
      const base = normalizeDate(candidate); if (!base) return ''
      const cap  = capMap[code]
      if (!cap || !qty) return dateToStr(base)
      let cur = new Date(base.getTime())
      for (let i = 0; i < 365; i++) {
        const ymd      = dateToStr(cur)
        const existing = loadMap[code]?.[ymd] || 0
        if (existing + qty <= cap + 0.001) {
          if (!loadMap[code]) loadMap[code] = {}
          loadMap[code][ymd] = existing + qty
          return ymd
        }
        cur = addDaysSkippingHolidays(cur, 1, holidaySet, true)
      }
      return dateToStr(base)
    }

    const result = { generated: 0, regenerated: 0, skipped: 0 }

    for (const t of tasks) {
      if (!t.go) { result.skipped++; continue }
      const { order, batch } = t
      if (!batch.dateCalcPlan) batch.dateCalcPlan = {}
      const plan = batch.dateCalcPlan
      const routeSeq: string[] = Array.isArray(order.processRoute) ? order.processRoute.filter(Boolean) : []
      const seq = [...new Set([...routeSeq, ...EXTRA_TAIL])].filter(c => ALL_PROCESS_CODES.includes(c))
      if (!seq.length) continue

      let anchorCode = '', anchorDate: Date | null = null
      for (const mp of [...MACHINE_PROCS_PRIORITY].reverse()) {
        const d = normalizeDate(plan[mp]); if (d) { anchorDate = d; anchorCode = mp; break }
      }
      if (!anchorDate) { for (const c of seq) { const d = normalizeDate(plan[c]); if (d) { anchorDate = d; anchorCode = c; break } } }
      if (!anchorDate) { for (const [c, ds] of Object.entries(plan)) { const d = normalizeDate(ds as string); if (d) { anchorDate = d; anchorCode = c; break } } }
      if (!anchorDate || !anchorCode) continue

      let workSeq = [...seq]
      if (!workSeq.includes(anchorCode)) workSeq = [anchorCode, ...workSeq]
      const anchorIdx = workSeq.indexOf(anchorCode); if (anchorIdx < 0) continue

      const fixedAnchors = new Set(Object.keys(plan).filter(k => normalizeDate(plan[k])))
      const qty = parseFloat(String(batch.kg)) || order.qtyKg || 0

      const fittedAnchorYmd = fitDate(anchorCode, dateToStr(anchorDate), qty)
      const fittedAnchor    = normalizeDate(fittedAnchorYmd) || anchorDate
      const planned: Record<string, string> = { [anchorCode]: fittedAnchorYmd }

      let back = new Date(fittedAnchor.getTime())
      for (let i = anchorIdx - 1; i >= 0; i--) {
        const c = workSeq[i]
        if (fixedAnchors.has(c)) { const fd = fitDate(c, dateToStr(normalizeDate(plan[c]) || back), qty); planned[c] = fd; back = normalizeDate(fd) || back; continue }
        back = addDaysSkippingHolidays(back, Math.max(1, dayMap[c] || 1), holidaySet, false)
        const fd = fitDate(c, dateToStr(back), qty); planned[c] = fd; back = normalizeDate(fd) || back
      }

      let fwd = new Date(fittedAnchor.getTime())
      for (let i = anchorIdx + 1; i < workSeq.length; i++) {
        const c = workSeq[i]
        if (fixedAnchors.has(c)) { const fd = fitDate(c, dateToStr(normalizeDate(plan[c]) || fwd), qty); planned[c] = fd; fwd = normalizeDate(fd) || fwd; continue }
        fwd = addDaysSkippingHolidays(fwd, Math.max(1, dayMap[workSeq[i-1]] || 1), holidaySet, true)
        const fd = fitDate(c, dateToStr(fwd), qty); planned[c] = fd; fwd = normalizeDate(fd) || fwd
      }

      workSeq.forEach(c => { plan[c] = planned[c] ? toDisplay(planned[c]) : '' })
      if (batch.dcGeneratedOnce) result.regenerated++; else result.generated++
      batch.dcGeneratedOnce = true; batch.dcRegenerate = false
    }
    return result
  }

  // Build dayMap and capMap from processDurations
  const buildMaps = () => {
    const dayMap: Record<string, number> = {}
    const capMap: Record<string, number> = {}
    processDurations.forEach(d => {
      const code = String(d.code || '').trim(); if (!code) return
      dayMap[code] = d.days > 0 ? d.days : 1
      if (d.capacity && d.capacity > 0) capMap[code] = d.capacity
    })
    ALL_PROCESS_CODES.forEach(c => { if (!dayMap[c]) dayMap[c] = 1 })
    return { dayMap, capMap }
  }

  // ── Generate Dates (ERP mode) ─────────────────────────────────────────────
  const generateDates = async () => {
    const { dayMap, capMap } = buildMaps()
    const holidaySet = buildHolidaySet(holidays)
    const workRows   = rows.map(r => ({ ...r, batch: { ...r.batch, dateCalcPlan: { ...r.batch.dateCalcPlan } } }))
    const result     = dcPlanAllRows(workRows, dayMap, capMap, holidaySet)
    setRows(workRows)
    await savePlannedDatesToOrders(workRows, false)
    setSaveStatus('saved'); setTimeout(() => setSaveStatus('idle'), 3000)
    alert(`✓ Done!\nGenerated: ${result.generated}\nRe-generated: ${result.regenerated}\nSkipped: ${result.skipped}`)
  }

  // ── Save planned dates to Supabase orders ─────────────────────────────────
  const savePlannedDatesToOrders = async (sourceRows = rows, showAlert = true): Promise<void> => {
    setSaveStatus('saving')
    try {
      // Group by order id, merge all batches' dateCalcPlan
      const orderPlans: Record<string, Record<string, string>> = {}
      for (const { order, batch } of sourceRows) {
        const plan: Record<string, string> = batch.dateCalcPlan || {}
        if (!Object.keys(plan).length) continue
        if (!orderPlans[order.id]) orderPlans[order.id] = {}
        for (const [code, dateStr] of Object.entries(plan)) {
          const iso = toISO(dateStr); if (!iso) continue
          orderPlans[order.id][code] = iso
        }
        // Dispatch from FinalDispatch
        if (plan['FinalDispatch']) orderPlans[order.id]['Dispatch'] = toISO(plan['FinalDispatch'])
        // Last date becomes Dispatch if missing
        if (!orderPlans[order.id]['Dispatch']) {
          const isos = Object.values(orderPlans[order.id]).sort()
          if (isos.length) orderPlans[order.id]['Dispatch'] = isos[isos.length - 1]
        }
      }

      const updates = Object.entries(orderPlans).map(([id, planned_dates]) => ({ id, planned_dates }))
      if (!updates.length) { if (showAlert) alert('No planned dates to save.'); return }

      const res  = await fetch('/api/orders', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ action: 'update_planned_dates', updates }),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'Save failed')

      // Also persist date_calc_plan back to each batch
      const batchUpdates = sourceRows.filter(r => r._batchId && Object.keys(r.batch.dateCalcPlan || {}).length)
      await Promise.all(batchUpdates.map(r =>
        fetch('/api/batches', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'update', id: r._batchId, date_calc_plan: r.batch.dateCalcPlan, dc_generated_once: r.batch.dcGeneratedOnce }),
        }).catch(() => {})
      ))

      setSaveStatus('saved')
      if (showAlert) alert(`✅ Planned dates saved to ${updates.length} orders.`)
    } catch (err: any) {
      setSaveStatus('idle')
      if (showAlert) alert('Save failed: ' + (err?.message || String(err)))
    }
  }

  // ── Process Days modal ────────────────────────────────────────────────────
  const openProcessDaysModal = () => {
    const savedByCode: Record<string, ProcessDuration> = {}
    processDurations.forEach(d => { if (d.code) savedByCode[d.code] = d })
    const temp: Record<string, {days:number; capacity:string}> = {}
    ALL_PROCESS_CODES.forEach(code => {
      const saved = savedByCode[code]
      temp[code] = { days: saved?.days ?? 1, capacity: saved?.capacity?.toString() || '' }
    })
    setTempDurations(temp); setShowPDModal(true)
  }

  const saveProcessDays = async () => {
    const newDurations: ProcessDuration[] = ALL_PROCESS_CODES.map(code => ({
      code,
      name:     getProcessName(code),
      days:     Math.max(1, tempDurations[code]?.days || 1),
      capacity: tempDurations[code]?.capacity ? parseFloat(tempDurations[code].capacity) : undefined,
    }))
    setProcessDurations(newDurations)
    await fetch('/api/setup/settings', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ key: 'processDurations', value: newDurations }),
    })
    setShowPDModal(false); alert('✓ Process days saved to Supabase!')
  }

  // ── Excel upload (pure client-side, no Supabase) ─────────────────────────
  const loadXLSX = (): Promise<any> => new Promise((resolve, reject) => {
    if ((window as any).XLSX) { resolve((window as any).XLSX); return }
    const s = document.createElement('script')
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
    s.onload = () => resolve((window as any).XLSX)
    s.onerror = () => reject(new Error('Failed to load xlsx'))
    document.head.appendChild(s)
  })

  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    setExcelUploading(true); setExcelFileName(file.name)
    try {
      const buf  = await file.arrayBuffer()
      const XLSX = await loadXLSX()
      const wb   = XLSX.read(new Uint8Array(buf), { type: 'array', raw: false })
      const ws   = wb.Sheets[wb.SheetNames[0]]
      const data: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false })
      if (!data || data.length < 2) { alert('File is empty.'); return }
      const headers = (data[0] as any[]).map((h: any) => String(h || '').trim())

      const find = (kws: string[]) => {
        for (const kw of kws) { const i = headers.findIndex((h:string) => h.toLowerCase()===kw.toLowerCase()); if(i>=0) return i }
        for (const kw of kws) { const i = headers.findIndex((h:string) => h.toLowerCase().includes(kw.toLowerCase())); if(i>=0) return i }
        return -1
      }
      const bc   = find(['batch no','batch id','batchid','batch'])
      const rc   = find(['process','route'])
      const qtyc = find(['qty','kg','weight','quantity'])
      const anchorCols: Record<string,number> = {
        'S': find(['s date','sdate']), 'D': find(['d date','ddate']),
        'Add': find(['add dt','add date']), 'Fix': find(['fix date','fixdate']),
        'Level': find(['level date','leveldate','level dat']), 'Rc': find(['rc date','rcdate']),
        'Wash': find(['washing date','wash date']),
      }
      const GEN_PROCS = ['C','S','H','D','F','G','O','B','R','K','Add','Level','Wash','Fix','Dry','Rc','Rx','Co','Qa','Packing','Dispatch']
      const genCols: Record<string,number> = {}
      for (const proc of GEN_PROCS) { const idx = headers.findIndex((h:string) => h.trim()===proc); if(idx>=0) genCols[proc]=idx }
      if (!genCols['QA'] && genCols['Qa']!==undefined) genCols['QA'] = genCols['Qa']
      if (bc < 0) { alert('Batch No column not found.\nHeaders: ' + headers.join(', ')); return }

      const parseDate = (val: any): string => {
        if (!val) return ''
        const s = String(val).trim()
        if (!s || s==='null') return ''
        if (s.match(/^\d{2}\/\d{2}\/\d{4}$/)) return s
        const ymd = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if(ymd) return `${ymd[3]}/${ymd[2]}/${ymd[1]}`
        const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); if(mdy) return `${mdy[2].padStart(2,'0')}/${mdy[1].padStart(2,'0')}/${mdy[3]}`
        const d = new Date(s); return isNaN(d.getTime()) ? '' : dateToDisplayStr(d)
      }

      const preLoadMap: Record<string, Record<string,number>> = {}
      let existingCount = 0
      for (let i=1; i<data.length; i++) {
        const row = data[i] as any[]
        const batchId = String(row[bc]||'').trim(); if(!batchId) continue
        const qty = qtyc>=0 ? parseFloat(String(row[qtyc]).replace(/[^0-9.]/g,''))||0 : 0
        if(qty<=0) continue
        const hasGenDates = Object.values(genCols).some(col => row[col]&&String(row[col]).trim())
        if(!hasGenDates) continue
        existingCount++
        for(const [proc,col] of Object.entries(genCols)) {
          const ds = parseDate(row[col]); if(!ds) continue
          if(!preLoadMap[proc]) preLoadMap[proc]={}
          preLoadMap[proc][ds] = (preLoadMap[proc][ds]||0)+qty
        }
      }

      const parsed: any[] = []
      for (let i=1; i<data.length; i++) {
        const row = data[i] as any[]
        const batchId = String(row[bc]||'').trim(); if(!batchId) continue
        const hasGenDates = Object.values(genCols).some(col => row[col]&&String(row[col]).trim())
        if(hasGenDates) continue
        const qty      = qtyc>=0 ? parseFloat(String(row[qtyc]).replace(/[^0-9.]/g,''))||0 : 0
        const routeRaw = rc>=0 ? String(row[rc]||'').trim() : ''
        const routeParts = routeRaw ? routeRaw.split('/').map((x:string)=>x.trim()).filter(Boolean) : []
        const dateCalcPlan: Record<string,string> = {}
        for(const [proc,col] of Object.entries(anchorCols)) {
          if(col<0) continue; const ds=parseDate(row[col]); if(ds) dateCalcPlan[proc]=ds
        }
        if(!Object.keys(dateCalcPlan).length) continue
        parsed.push({
          order: { id:`xl-${i}`, orderNumber:batchId, article:'', color:'', qtyKg:qty,
            processRoute:routeParts, machine:'',
            processMachines:Object.fromEntries(Object.keys(dateCalcPlan).map(p=>[p,p])) },
          batch: { batchId, batchNumber:i, kg:qty, plannedDate:Object.values(dateCalcPlan)[0]||'',
            dateCalcPlan, dcGeneratedOnce:false, dcRegenerate:false, _fromExcel:true }
        })
      }
      if(!parsed.length) { alert(`✓ File read!\nExisting rows: ${existingCount}\nRows needing generation: 0`); return }
      ;(window as any).__excelPreLoadMap = preLoadMap
      setExcelRows(parsed); setShowExcelRows(true)
      alert(`✓ File loaded!\nExisting rows (load pre-built): ${existingCount}\nRows to generate: ${parsed.length}`)
    } catch(err:any) { alert('Error: '+(err?.message||String(err))) }
    finally { setExcelUploading(false); e.target.value='' }
  }

  const handleExcelDateChange = (batchId: string, pc: string, value: string) =>
    setExcelRows(prev => prev.map(r => r.batch.batchId===batchId ? {...r, batch:{...r.batch, dateCalcPlan:{...r.batch.dateCalcPlan,[pc]:value}}} : r))

  const generateExcelDates = () => {
    const { dayMap, capMap } = buildMaps()
    const holidaySet = buildHolidaySet(holidays)
    const workRows   = excelRows.map(r => ({ ...r, batch: { ...r.batch, dateCalcPlan: { ...r.batch.dateCalcPlan } } }))
    const preLoadMap = (window as any).__excelPreLoadMap || {}
    const result     = dcPlanAllRows(workRows, dayMap, capMap, holidaySet, preLoadMap)
    setExcelRows(workRows)
    alert(`✓ Dates generated for ${result.generated} batches!\nCapacity respected.`)
  }

  const exportExcelWithDates = async () => {
    if(!excelRows.length) return
    const XLSX = await loadXLSX()
    const hdrs = ['Batch ID','Color','Article','Qty (Kg)','Route','Machine',...ALL_PROCESS_CODES]
    const dataRows = excelRows.map(({order,batch}) => [
      batch.batchId, order.color, order.article, batch.kg||order.qtyKg,
      (order.processRoute||[]).join('/'), order.machine,
      ...ALL_PROCESS_CODES.map(pc => batch.dateCalcPlan?.[pc]||'')
    ])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([hdrs,...dataRows]), 'Dates')
    XLSX.writeFile(wb, 'date_calculator_output.xlsx')
  }

  const getMachinePlannedDates = (order: Order, batch: any) => {
    const mPcs = Object.keys(order.processMachines || {}); if(!mPcs.length) return '-'
    const entries = mPcs.map(pc => ({pc, date: batch.dateCalcPlan?.[pc]})).filter(e => e.date)
    if(!entries.length&&batch.plannedDate) { try{const d=normalizeDate(batch.plannedDate);return d?dateToDisplayStr(d):batch.plannedDate}catch{return batch.plannedDate} }
    return entries.map(e=>`${e.pc}: ${e.date}`).join(' / ')
  }

  // ── Render ────────────────────────────────────────────────────────────────
  if (loadStatus === 'loading') return (
    <div className="content" style={{ textAlign: 'center', padding: 80 }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>📅</div>
      <div style={{ fontSize: 14, color: 'var(--text-tertiary)' }}>Loading batches from Supabase…</div>
    </div>
  )

  if (loadStatus === 'error') return (
    <div className="content">
      <div className="card" style={{ textAlign: 'center', padding: 40 }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--danger)' }}>Failed to load data from Supabase</div>
        <button className="primary" style={{ marginTop: 16 }} onClick={loadData}>Retry</button>
      </div>
    </div>
  )

  if (!rows.length && !showExcelRows) return (
    <div className="content">
      <div className="card">
        <div className="card-header">
          <span className="card-title">Date Calculator Sheet</span>
          <label style={{ padding:'8px 16px', fontSize:13, fontWeight:600, borderRadius:6, cursor:'pointer', background:'var(--accent)', color:'#fff', display:'inline-flex', alignItems:'center', gap:6 }}>
            {excelUploading ? '⏳ Loading…' : '📤 Upload Excel to Calculate Dates'}
            <input type="file" accept=".xlsx,.xls,.csv" onChange={handleExcelUpload} style={{ position:'absolute', width:1, height:1, opacity:0, overflow:'hidden' }} />
          </label>
        </div>
        <div style={{ padding:'40px', textAlign:'center' }}>
          <div style={{ fontSize:40, marginBottom:12 }}>📅</div>
          <div style={{ fontSize:15, fontWeight:600, marginBottom:8 }}>No split batches found</div>
          <div style={{ fontSize:13, color:'var(--text-tertiary)', marginBottom:16 }}>
            Split some orders first, or upload your full Excel file for standalone date calculation.
          </div>
          <button className="small" onClick={loadData}>↻ Refresh from Supabase</button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="content" style={{ height:'100vh', display:'flex', flexDirection:'column', overflow:'hidden', padding:0 }}>
      <div className="card" style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', margin:0, borderRadius:0, border:'none' }}>
        <div className="card-header">
          <span className="card-title">Date Calculator Sheet <span style={{ fontSize:11, fontWeight:400, color:'var(--text-tertiary)' }}>Supabase · {rows.length} batches</span></span>
          <div style={{ display:'flex', alignItems:'center', gap:'8px', flexWrap:'wrap' }}>
            <label style={{ padding:'6px 12px', fontSize:12, fontWeight:600, borderRadius:6, cursor:'pointer', background:'var(--bg-secondary)', border:'1px solid var(--border-light)', color:'var(--text-primary)', display:'inline-flex', alignItems:'center', gap:5 }}>
              {excelUploading ? '⏳ Loading…' : '📤 Upload Excel'}
              <input type="file" accept=".xlsx,.xls,.csv" onChange={handleExcelUpload} style={{ position:'absolute', width:1, height:1, opacity:0, overflow:'hidden' }} />
            </label>
            {showExcelRows && (<>
              <button className="small success" onClick={generateExcelDates}>⚙ Generate Dates (Excel)</button>
              <button className="small" onClick={exportExcelWithDates} style={{ background:'#059669', color:'#fff', border:'none', fontWeight:600 }}>⬇ Download Output</button>
              <button className="small danger" onClick={() => { setExcelRows([]); setShowExcelRows(false); setExcelFileName(''); (window as any).__excelPreLoadMap=null }}>✕ Clear Excel</button>
            </>)}
            <span style={{ width:1, height:20, background:'var(--border-light)', display:'inline-block' }} />
            <button className="small success" onClick={generateDates}>⚙ Generate Dates</button>
            <button className="small" onClick={() => savePlannedDatesToOrders(rows, true)}
              style={{ background:saveStatus==='saved'?'#1D9E75':'var(--accent)', color:'#fff', border:'none', fontWeight:600 }}>
              {saveStatus==='saving' ? '⏳ Saving…' : saveStatus==='saved' ? '✓ Saved' : '⬇ Save to Orders'}
            </button>
            <button className="small primary" onClick={openProcessDaysModal}>Process Days</button>
            <button className="small" onClick={handleClearSelected}
              style={{ background:selectedBatches.size>0?'#DC2626':'#E5E7EB', color:selectedBatches.size>0?'white':'#9CA3AF', border:'none' }}>
              Clear Selected ({selectedBatches.size})
            </button>
            <button className="small" onClick={loadData}>↻ Refresh</button>
          </div>
        </div>
        <div style={{ fontSize:'11px', color:'var(--text-tertiary)', padding:'3px 16px', flexShrink:0, background:'var(--bg-secondary)' }}>
          Data from Supabase · Changes saved automatically · ⚙ Generate then ⬇ Save to push planned dates to orders
        </div>

        {/* Excel view */}
        {showExcelRows && excelRows.length > 0 && (
          <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', borderTop:'2px solid var(--accent)' }}>
            <div style={{ padding:'6px 16px', background:'var(--accent-light)', display:'flex', alignItems:'center', gap:12, flexShrink:0 }}>
              <span style={{ fontSize:12, fontWeight:700, color:'var(--accent-dark)' }}>📤 {excelRows.length} rows from "{excelFileName}"</span>
              <span style={{ fontSize:11, color:'var(--text-tertiary)' }}>🔵 = machine process columns · green = date assigned</span>
            </div>
            <div style={{ flex:1, overflowX:'auto', overflowY:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                <thead>
                  <tr style={{ background:'#EFF6FF', position:'sticky', top:0, zIndex:10 }}>
                    <th style={thStyle}>BATCH ID</th><th style={thStyle}>KG</th><th style={thStyle}>ROUTE</th>
                    {ALL_PROCESS_CODES.map(pc => (
                      <th key={pc} style={{ ...thStyle, background:MACHINE_PROCS_PRIORITY.includes(pc)?'#BFDBFE':'#F9FAFB', color:MACHINE_PROCS_PRIORITY.includes(pc)?'#1D4ED8':'#6B7280' }}>{pc}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {excelRows.map(({order,batch}) => {
                    const plan: Record<string,string> = batch.dateCalcPlan || {}
                    return (
                      <tr key={batch.batchId} style={{ borderBottom:'1px solid #E5E7EB' }}>
                        <td style={{ ...tdStyle, fontWeight:700, color:'#2563EB' }}>{batch.batchId}</td>
                        <td style={{ ...tdStyle, fontWeight:700 }}>{batch.kg||'-'}</td>
                        <td style={tdStyle}>{(order.processRoute||[]).join('/')||'-'}</td>
                        {ALL_PROCESS_CODES.map(pc => (
                          <td key={pc} style={{ padding:0, borderRight:'1px solid #E5E7EB', background:plan[pc]?(MACHINE_PROCS_PRIORITY.includes(pc)?'#DBEAFE':'#F0FDF4'):'transparent' }}>
                            <input type="text" value={plan[pc]||''} onChange={e=>handleExcelDateChange(batch.batchId,pc,e.target.value)}
                              style={{ width:'100%', minWidth:100, height:32, border:0, background:'transparent', padding:'2px 6px', fontSize:11, textAlign:'center', outline:'none' }} />
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

        {/* ERP rows view */}
        {rows.length > 0 && !showExcelRows && (
          <div style={{ flex:1, overflowX:'auto', overflowY:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'12px' }}>
              <thead>
                <tr style={{ background:'#F9FAFB', position:'sticky', top:0, zIndex:10 }}>
                  <th style={thStyle}>SELECT</th><th style={thStyle}>COLOUR</th><th style={thStyle}>BATCH</th>
                  <th style={thStyle}>QTY(KG)</th><th style={thStyle}>ROUTE</th><th style={thStyle}>MACHINE</th>
                  <th style={thStyle}>DATE</th>
                  {allProcesses.map(pc => <th key={pc} style={thStyle}>{pc}</th>)}
                  <th style={thStyle}>RE-GEN</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({order, batch}, idx) => {
                  const route = (order.processRoute||[]).map((c:string) => getProcessName(c)).join('/')
                  const plan: Record<string,string> = batch.dateCalcPlan || {}
                  return (
                    <tr key={`${order.id}-${batch.batchId}`} style={{ borderBottom:'1px solid #E5E7EB' }}>
                      <td style={{ ...tdStyle, textAlign:'center' }}>
                        <input type="checkbox" checked={selectedBatches.has(batch.batchId)} onChange={e=>handleBatchSelection(batch.batchId,e.target.checked)} style={{ cursor:'pointer' }} />
                      </td>
                      <td style={tdStyle}>{order.color||'-'}</td>
                      <td style={{ ...tdStyle, fontWeight:700, color:'#2563EB' }}>{batch.batchId||'-'}</td>
                      <td style={{ ...tdStyle, fontWeight:700 }}>{batch.kg||order.qtyKg||'-'}</td>
                      <td style={{ ...tdStyle, fontWeight:700, color:'#2563EB' }}>{route||'-'}</td>
                      <td style={tdStyle}>{order.machine||'-'}</td>
                      <td style={{ ...tdStyle, fontSize:'11px' }}>{getMachinePlannedDates(order,batch)}</td>
                      {allProcesses.map(pc => (
                        <td key={pc} style={{ padding:0, borderRight:'1px solid #E5E7EB' }}>
                          <input type="text" value={plan[pc]||''} onChange={e=>handleDateChange(idx,pc,e.target.value)}
                            style={{ width:'100%', minWidth:'110px', height:'36px', border:0, background:'transparent', padding:'4px 8px', fontSize:'12px', textAlign:'center', outline:'none' }} />
                        </td>
                      ))}
                      <td style={{ ...tdStyle, textAlign:'center' }}>
                        <input type="checkbox" checked={batch.dcRegenerate||false} onChange={e=>handleRegenerateToggle(idx,e.target.checked)} style={{ cursor:'pointer' }} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Process Days modal */}
      {showPDModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }}
          onClick={() => setShowPDModal(false)}>
          <div style={{ background:'white', borderRadius:8, padding:24, maxWidth:600, width:'90%', maxHeight:'80vh', overflow:'auto' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
              <h3 style={{ margin:0, fontSize:16, fontWeight:700 }}>Process Days Setup</h3>
              <button onClick={() => setShowPDModal(false)} style={{ border:'none', background:'none', fontSize:20, cursor:'pointer' }}>✕</button>
            </div>
            <div style={{ padding:'10px 14px', background:'#EFF6FF', borderRadius:8, fontSize:12, color:'#1D4ED8', marginBottom:16 }}>
              💡 Set <strong>Capacity (KG/Day)</strong> per process. Saved to Supabase — shared across all devices.
            </div>
            <div style={{ maxHeight:'50vh', overflow:'auto', marginBottom:16 }}>
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead><tr style={{ background:'#F9FAFB', borderBottom:'2px solid #E5E7EB' }}>
                  {['PROCESS','NAME','DAYS','CAPACITY (KG/DAY)'].map(h => <th key={h} style={{ padding:10, textAlign:'left', fontSize:11, fontWeight:700, color:'#6B7280' }}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {ALL_PROCESS_CODES.map(code => (
                    <tr key={code} style={{ borderBottom:'1px solid #E5E7EB' }}>
                      <td style={{ padding:10, fontWeight:700, color:'#2563EB' }}>{code}</td>
                      <td style={{ padding:10 }}>{getProcessName(code)}</td>
                      <td style={{ padding:10 }}>
                        <input type="number" min="1" step="1" value={tempDurations[code]?.days||1}
                          onChange={e => setTempDurations(prev => ({...prev,[code]:{...prev[code],days:parseInt(e.target.value)||1}}))}
                          style={{ width:80, padding:6, border:'1px solid #D1D5DB', borderRadius:4 }} />
                      </td>
                      <td style={{ padding:10 }}>
                        <input type="number" min="0" step="0.01" value={tempDurations[code]?.capacity||''}
                          onChange={e => setTempDurations(prev => ({...prev,[code]:{...prev[code],capacity:e.target.value}}))}
                          style={{ width:120, padding:6, border:'1px solid #D1D5DB', borderRadius:4 }} placeholder="e.g. 10000" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <button className="primary" onClick={saveProcessDays}>Save Process Days</button>
              <button onClick={() => setShowPDModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const thStyle: React.CSSProperties = {
  padding:'8px 12px', textAlign:'left', fontSize:'10px', fontWeight:700, color:'#6B7280',
  textTransform:'uppercase', letterSpacing:'0.5px', borderBottom:'2px solid #E5E7EB',
  borderRight:'1px solid #E5E7EB', whiteSpace:'nowrap', background:'#F9FAFB'
}
const tdStyle: React.CSSProperties = {
  padding:'8px 12px', fontSize:'12px', borderRight:'1px solid #E5E7EB', whiteSpace:'nowrap'
}
