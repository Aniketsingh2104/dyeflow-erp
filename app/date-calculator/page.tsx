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
  for (const h of holidays) { const d = normalizeDate(h.date); if (d) set.add(dateToStr(d)) }
  return set
}
const addDaysSkippingHolidays = (date: Date, days: number, holidaySet: Set<string>, forward = true): Date => {
  const d = new Date(date.getTime()); let remaining = Math.abs(days); const step = forward ? 1 : -1; let safety = 0
  while (remaining > 0 && safety < 730) { d.setDate(d.getDate() + step); safety++; if (!holidaySet.has(dateToStr(d))) remaining-- }
  return d
}

let _processNameCache: Record<string, string> | null = null
const getProcessName = (code: string): string => {
  if (!_processNameCache) {
    _processNameCache = {}
    if (typeof window !== 'undefined') { try { loadOrSeedProcessList().forEach(p => { _processNameCache![p.code] = p.name }) } catch {} }
  }
  const fallback: Record<string, string> = {
    'C':'CBR','S':'SCQ','H':'Heat-Set','D':'Dyeing','S2':'SCQ2','Rx':'Relax','O':'Opener',
    'G':'Ghanti','F':'Finish','Co':'Compactor','Tu':'Tubler','Add':'Addition','Level':'Levelling',
    'Rc':'RC','Fix':'Fixing','Wash':'Washing','Dry':'Dry','B':'Brushing','R':'Raising','K':'Kundi',
    'QA':'QA','Packing':'Packing','Dispatch':'Dispatch','FinalDispatch':'Final Dispatch'
  }
  return _processNameCache![code] || fallback[code] || code
}

const ALL_PROCESS_CODES = ['C','S','H','D','S2','Rx','O','G','F','Co','Tu','Add','Level','Rc','Fix','Wash','Dry','B','R','K','QA','Packing','Dispatch','FinalDispatch']
const MACHINE_PROCS_PRIORITY = ['S2','Add','Level','Rc','Fix','Wash','S','D']

// Given route parts, find anchor process (D wins over S wins over Wash etc.)
const getAnchorProcess = (routeParts: string[]): string => {
  for (const mp of [...MACHINE_PROCS_PRIORITY].reverse()) {
    if (routeParts.some((p: string) => p.toLowerCase() === mp.toLowerCase())) return mp
  }
  return routeParts[0] || 'D'
}

export default function DateCalculatorPage() {
  const [rows, setRows] = useState<any[]>([])
  const [excelRows, setExcelRows] = useState<any[]>([])
  const [showExcelRows, setShowExcelRows] = useState(false)
  const [excelUploading, setExcelUploading] = useState(false)
  const [excelFileName, setExcelFileName] = useState('')
  const [allProcesses] = useState<string[]>(ALL_PROCESS_CODES)
  const [processDurations, setProcessDurations] = useState<ProcessDuration[]>([])
  const [showProcessDaysModal, setShowProcessDaysModal] = useState(false)
  const [tempDurations, setTempDurations] = useState<Record<string, { days: number, capacity: string }>>({})
  const [selectedBatches, setSelectedBatches] = useState<Set<string>>(new Set())
  const [saveStatus, setSaveStatus] = useState<'idle'|'saving'|'saved'>('idle')

  useEffect(() => { loadData() }, [])

  const loadData = () => {
    const stored = localStorage.getItem('dyeflow_db'); if (!stored) return
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
            if (ds.match(/^\d{2}\/\d{2}\/\d{4}$/)) { plan[pc] = ds }
            else if (ds.match(/^\d{4}-\d{2}-\d{2}$/)) { const [y,m,d]=ds.split('-'); plan[pc]=`${d}/${m}/${y}` }
            else { const p=normalizeDate(ds); plan[pc]=p?dateToDisplayStr(p):ds }
          }
        })
        batchRows.push({ order, batch })
      })
    })
    localStorage.setItem('dyeflow_db', JSON.stringify(db))
    setRows(batchRows)
  }

  const pendingDateChanges = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

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
      const buf = await file.arrayBuffer()
      const XLSX = await loadXLSX()
      const wb = XLSX.read(new Uint8Array(buf), { type: 'array', raw: false })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const data: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false })
      if (!data || data.length < 2) { alert('File is empty.'); return }

      const headers = (data[0] as any[]).map((h: any) => String(h || '').trim())
      const find = (kws: string[]) => {
        for (const kw of kws) { const i = headers.findIndex((h:string)=>h.toLowerCase()===kw.toLowerCase()); if(i>=0) return i }
        for (const kw of kws) { const i = headers.findIndex((h:string)=>h.toLowerCase().includes(kw.toLowerCase())); if(i>=0) return i }
        return -1
      }
      const bc = find(['batch id','batchid','batch_id','batch no','batch','lot no','lot'])
      const cc = find(['color','colour','shade'])
      const ac = find(['article','art no','design'])
      const kc = find(['qty kg','qty(kg)','qty','kg','weight','quantity'])
      const rc = find(['route','process route','processroute'])
      const mc = find(['machine','m/c','machine no','machine name'])
      const dc = find(['dye date','dyeing date','start date','planned date','date'])

      if (bc < 0) { alert('Batch ID column not found.\nHeaders: ' + headers.join(', ')); return }
      if (dc < 0) { alert('Date column not found.\nHeaders: ' + headers.join(', ')); return }

      // Machine process codes
      const MPROCS = ['S2','Add','Level','Rc','Fix','Wash','S','D']

      const parsed: any[] = []
      for (let i = 1; i < data.length; i++) {
        const row = data[i] as any[]
        const batchId = String(row[bc] || '').trim(); if (!batchId) continue
        const color      = cc >= 0 ? String(row[cc] || '').trim() : ''
        const article    = ac >= 0 ? String(row[ac] || '').trim() : ''
        const kg         = kc >= 0 ? parseFloat(String(row[kc]).replace(/[^0-9.]/g,'')) || 0 : 0
        const machineName = mc >= 0 ? String(row[mc] || '').trim() : ''
        const routeRaw   = rc >= 0 ? String(row[rc] || '').trim() : ''
        const dateRaw    = row[dc]

        // Parse route — split only on / (not comma, since comma separates machines)
        const routeParts = routeRaw ? routeRaw.split('/').map((x:string)=>x.trim()).filter(Boolean) : []

        // Handle comma-separated machines and dates
        // e.g. 'LJET-30,LJET-21' + '7/18/2026,7/15/2026' for route C/S/H/D/F
        // First date -> first machine process in route, second date -> second machine process
        const machineNames = machineName.split(',').map((m:string) => m.trim()).filter(Boolean)
        const dateRaws = String(dateRaw || '').split(',').map((d:string) => d.trim()).filter(Boolean)

        // Find machine processes in route (in order they appear)
        const machineProcInRoute = routeParts
          .map((p:string) => MPROCS.find(m => m.toLowerCase() === p.toLowerCase()))
          .filter(Boolean) as string[]

        // Build dateCalcPlan: first date -> first machine proc, second date -> second machine proc
        const dateCalcPlan: Record<string,string> = {}
        for (let di = 0; di < dateRaws.length; di++) {
          const rawD = dateRaws[di]; if (!rawD) continue
          let ds = ''
          const mdy = rawD.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
          if (mdy) ds = `${mdy[2].padStart(2,'0')}/${mdy[1].padStart(2,'0')}/${mdy[3]}`
          else { const d = normalizeDate(rawD); if (d) ds = dateToDisplayStr(d) }
          if (!ds) continue
          const proc = machineProcInRoute[di]
          if (proc) dateCalcPlan[proc] = ds
        }

        // Fallback: single date, use anchor detection
        if (Object.keys(dateCalcPlan).length === 0 && dateRaw) {
          const s = String(dateRaw).trim()
          let ds = ''
          const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
          if (mdy) ds = `${mdy[2].padStart(2,'0')}/${mdy[1].padStart(2,'0')}/${mdy[3]}`
          else { const d = normalizeDate(s); if (d) ds = dateToDisplayStr(d) }
          if (ds) {
            const anchor = getAnchorProcess(routeParts)
            dateCalcPlan[anchor] = ds
          }
        }

        // Build processMachines map: each machine proc -> machine name
        const processMachinesMap: Record<string,string> = {}
        machineProcInRoute.forEach((proc:string, idx:number) => {
          processMachinesMap[proc] = machineNames[idx] || machineNames[0] || machineName
        })

        const primaryMachine = machineNames[0] || machineName

        parsed.push({
          order: { id:`xl-${i}`, orderNumber:batchId, article, color, qtyKg:kg,
            processRoute:routeParts, machine:primaryMachine,
            processMachines: processMachinesMap, splits:[] },
          batch: { batchId, batchNumber:i, kg,
            plannedDate: Object.values(dateCalcPlan)[0] || '',
            dateCalcPlan,
            dcGeneratedOnce:false, dcRegenerate:false, _fromExcel:true }
        })
      }

      if (!parsed.length) { alert('No valid rows found.'); return }
      setExcelRows(parsed)
      setShowExcelRows(true)

      // Show summary of how dates were mapped
      const multiDateRows = parsed.filter(p => Object.keys(p.batch.dateCalcPlan).length > 1).length
      const mappingSamples = [...new Set(parsed.slice(0,20).map(p => {
        const keys = Object.keys(p.batch.dateCalcPlan)
        return `${(p.order.processRoute||[]).join('/')} → ${keys.join(', ')}`
      }))].slice(0,5)
      alert(`✓ Loaded ${parsed.length} batches from "${file.name}"\n\n${multiDateRows} rows have 2 dates (mapped to 2 processes)\n\nDate mapping examples:\n${mappingSamples.join('\n')}\n\nClick ⚙ Generate Dates (Excel) to calculate.`)

    } catch (err: any) {
      alert('Error: ' + (err?.message || String(err)))
    } finally {
      setExcelUploading(false); e.target.value = ''
    }
  }

  const handleExcelDateChange = (batchId: string, pc: string, value: string) => {
    setExcelRows(prev => prev.map(r =>
      r.batch.batchId === batchId ? { ...r, batch: { ...r.batch, dateCalcPlan: { ...r.batch.dateCalcPlan, [pc]: value } } } : r
    ))
  }

  const generateExcelDates = () => {
    const stored = localStorage.getItem('dyeflow_db')
    const db = stored ? JSON.parse(stored) : {}
    const origOrders = db.orders || []
    db.orders = excelRows.map(r => ({ ...r.order, splits: [r.batch] }))
    const result = dcPlanAllRows(db)
    const updated: any[] = []
    for (const o of db.orders) { const b = o.splits?.[0]; if (b) updated.push({ order: o, batch: b }) }
    db.orders = origOrders
    localStorage.setItem('dyeflow_db', JSON.stringify(db))
    setExcelRows(updated)
    alert(`✓ Dates generated for ${result.generated} batches!`)
  }

  const exportExcelWithDates = async () => {
    if (!excelRows.length) return
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

  const handleDateChange = (orderId: string, batchId: string, pc: string, value: string) => {
    setRows(prev => prev.map(r => {
      if (r.order.id !== orderId || r.batch.batchId !== batchId) return r
      return { ...r, batch: { ...r.batch, dateCalcPlan: { ...r.batch.dateCalcPlan, [pc]: value } } }
    }))
    const key = `${orderId}-${batchId}-${pc}`
    if (pendingDateChanges.current[key]) clearTimeout(pendingDateChanges.current[key])
    pendingDateChanges.current[key] = setTimeout(() => {
      const stored = localStorage.getItem('dyeflow_db'); if (!stored) return
      const db = JSON.parse(stored)
      const order = (db.orders||[]).find((o:any)=>o.id===orderId)
      if (!order) return
      const batch = (order.splits||[]).find((b:any)=>b.batchId===batchId)
      if (!batch) return
      if (!batch.dateCalcPlan) batch.dateCalcPlan = {}
      batch.dateCalcPlan[pc] = value
      localStorage.setItem('dyeflow_db', JSON.stringify(db))
      delete pendingDateChanges.current[key]
    }, 400)
  }

  const handleRegenerateToggle = (orderId: string, batchId: string, checked: boolean) => {
    const stored = localStorage.getItem('dyeflow_db'); if (!stored) return
    const db = JSON.parse(stored)
    const order = (db.orders||[]).find((o:any)=>o.id===orderId)
    const batch = order&&(order.splits||[]).find((b:any)=>b.batchId===batchId)
    if (!batch) return
    batch.dcRegenerate = checked
    localStorage.setItem('dyeflow_db', JSON.stringify(db)); loadData()
  }

  const handleBatchSelection = (batchId: string, checked: boolean) => {
    setSelectedBatches(prev => { const s=new Set(prev); checked?s.add(batchId):s.delete(batchId); return s })
  }

  const handleClearSelected = () => {
    if (!selectedBatches.size) { alert('Select batches first'); return }
    if (!confirm(`Clear dates for ${selectedBatches.size} batch(es)?`)) return
    const stored = localStorage.getItem('dyeflow_db'); if (!stored) return
    const db = JSON.parse(stored); let cleared = 0
    selectedBatches.forEach(batchId => {
      for (const order of db.orders||[]) {
        const batch = (order.splits||[]).find((b:any)=>b.batchId===batchId)
        if (batch) {
          const mPcs = Object.keys(order.processMachines||{})
          if (batch.dateCalcPlan) for (const pc of Object.keys(batch.dateCalcPlan)) { if(!mPcs.includes(pc)) delete batch.dateCalcPlan[pc] }
          batch.dcGeneratedOnce=false; batch.dcRegenerate=false; cleared++; break
        }
      }
    })
    localStorage.setItem('dyeflow_db', JSON.stringify(db)); setSelectedBatches(new Set()); loadData()
    alert(`✓ Cleared ${cleared} batch(es)`)
  }

  const dcPlanAllRows = (db: any) => {
    const dayMap: Record<string,number> = {}
    const capacityMap: Record<string,number> = {}
    const loadMap: Record<string,Record<string,number>> = {}
    ;(db.processDurations||[]).forEach((d:ProcessDuration) => {
      const code = String(d.code||'').trim(); if(!code) return
      dayMap[code] = d.days>0?d.days:1
      if (d.capacity&&d.capacity>0) capacityMap[code]=d.capacity
    })
    allProcesses.forEach(c => { if(!dayMap[c]) dayMap[c]=1 })
    const holidaySet = buildHolidaySet(db.holidays||[])
    const today = normalizeDate(new Date())
    const result = { generated:0, regenerated:0, skipped:0 }
    const getQty=(o:Order,b:Batch)=>{ const q=parseFloat(String(b?.kg||0)); if(q>0) return q; return parseFloat(String(o?.qtyKg||0))||0 }
    const addLoad=(code:string,ds:string,qty:number)=>{ if(!capacityMap[code]||!ds||!qty) return; if(!loadMap[code]) loadMap[code]={}; loadMap[code][ds]=(loadMap[code][ds]||0)+qty }
    const fitDate=(code:string,candidate:string,qty:number)=>{ const base=normalizeDate(candidate); if(!base) return ''; const cap=capacityMap[code]; if(!cap||!qty) return dateToStr(base); let cur=new Date(base.getTime()); for(let i=0;i<365;i++){const ds=dateToStr(cur);if((loadMap[code]?.[ds]||0)+qty<=cap+1e-9){addLoad(code,ds,qty);return ds}cur=addDaysSkippingHolidays(cur,1,holidaySet,true)} return dateToStr(base) }
    const toDisplay=(ymd:string)=>{ const p=ymd.split('-'); return p.length===3?`${p[2]}/${p[1]}/${p[0]}`:ymd }
    const tasks=(db.orders||[]).flatMap((o:any)=>(o.splits||[]).map((b:any)=>({o,b,go:!(!!b.dcGeneratedOnce&&!b.dcRegenerate),done:!!b.dcGeneratedOnce})))
    for (const t of tasks) { if(t.go) continue; const plan=t.b?.dateCalcPlan||{}; const qty=getQty(t.o,t.b); for(const code of Object.keys(capacityMap)){const ds=dateToStr(normalizeDate(plan[code])||new Date(0)); if(ds) addLoad(code,ds,qty)} result.skipped++ }
    for (const t of tasks) {
      if (!t.go) continue
      const {o,b} = t
      if (!b.dateCalcPlan) b.dateCalcPlan={}
      const plan = b.dateCalcPlan
      const routeSeq:string[] = Array.isArray(o.processRoute)?o.processRoute.filter(Boolean):[]
      const seq = [...new Set([...routeSeq,...EXTRA_TAIL])].filter((c:string)=>allProcesses.includes(c))
      if (!seq.length) continue
      let anchorCode='', anchorDate:Date|null=null
      // Find anchor: prefer highest-priority machine process that has a date
      for (const mp of [...MACHINE_PROCS_PRIORITY].reverse()) {
        const d = normalizeDate(plan[mp])
        if (d) { anchorDate=d; anchorCode=mp; break }
      }
      if (!anchorDate) { for(const c of seq){const d=normalizeDate(plan[c]);if(d){anchorDate=d;anchorCode=c;break}} }
      if (!anchorDate) { for(const [c,ds] of Object.entries(plan)){const d=normalizeDate(ds as string);if(d){anchorDate=d;anchorCode=c;break}} }
      if (!anchorDate||!anchorCode) continue
      let workSeq=[...seq]; if(!workSeq.includes(anchorCode)) workSeq=[anchorCode,...workSeq]
      const anchorIdx=workSeq.indexOf(anchorCode); if(anchorIdx<0) continue
      const planned:Record<string,string>={...plan,[anchorCode]:dateToStr(anchorDate)}
      // For processes that already have a date (multi-anchor), keep them
      const fixedAnchors = new Set(Object.keys(plan).filter(k => normalizeDate(plan[k])))
      let back=new Date(anchorDate.getTime())
      for(let i=anchorIdx-1;i>=0;i--){
        const c=workSeq[i]
        if(fixedAnchors.has(c)){back=normalizeDate(plan[c])||back;continue}
        back=addDaysSkippingHolidays(back,Math.max(1,dayMap[c]||1),holidaySet,false)
        planned[c]=dateToStr(back)
      }
      let fwd=new Date(anchorDate.getTime())
      for(let i=anchorIdx+1;i<workSeq.length;i++){
        const c=workSeq[i]
        if(fixedAnchors.has(c)){fwd=normalizeDate(plan[c])||fwd;continue}
        fwd=addDaysSkippingHolidays(fwd,Math.max(1,dayMap[workSeq[i-1]]||1),holidaySet,true)
        planned[c]=dateToStr(fwd)
      }
      const firstCode=workSeq[0]; const firstDt=normalizeDate(planned[firstCode]); let useFwdRule=false
      if (firstDt&&today&&firstDt<today&&!fixedAnchors.has(firstCode)) {
        useFwdRule=true; const start=addDaysSkippingHolidays(today,Math.max(1,dayMap[firstCode]||1),holidaySet,true)
        planned[firstCode]=dateToStr(start); let cur=new Date(start.getTime())
        for(let i=1;i<workSeq.length;i++){
          const c=workSeq[i]
          if(fixedAnchors.has(c)) continue
          cur=addDaysSkippingHolidays(cur,Math.max(1,dayMap[workSeq[i]]||1),holidaySet,true)
          planned[c]=dateToStr(cur)
        }
      }
      workSeq.forEach((c:string)=>{if(!fixedAnchors.has(c)) plan[c]=planned[c]?toDisplay(planned[c]):''})
      // Set fixed anchor dates in display format
      fixedAnchors.forEach(c=>{ const d=normalizeDate(plan[c]); if(d) plan[c]=dateToDisplayStr(d) })
      const qty=getQty(o,b); const fa=normalizeDate(plan[firstCode])
      if (fa&&!fixedAnchors.has(firstCode)) {
        const ff=fitDate(firstCode,dateToStr(fa),qty); if(ff) plan[firstCode]=toDisplay(ff)
        let prev=normalizeDate(plan[firstCode])||fa
        for(let i=1;i<workSeq.length;i++){const c=workSeq[i];if(fixedAnchors.has(c)){prev=normalizeDate(plan[c])||prev;continue}const pc=workSeq[i-1];const days=Math.max(1,dayMap[useFwdRule?c:pc]||1);const cand=addDaysSkippingHolidays(prev,days,holidaySet,true);const finalDs=fitDate(c,dateToStr(cand),qty);if(finalDs){plan[c]=toDisplay(finalDs);prev=normalizeDate(finalDs)||cand}else prev=cand}
      }
      if(t.done) result.regenerated++; else result.generated++
      b.dcGeneratedOnce=true; b.dcRegenerate=false
    }
    return result
  }

  const generateDates = () => {
    const stored = localStorage.getItem('dyeflow_db'); if (!stored) return
    const db = JSON.parse(stored)
    setTimeout(() => {
      const result = dcPlanAllRows(db)
      localStorage.setItem('dyeflow_db', JSON.stringify(db))
      loadData(); savePlannedDatesToOrders(false); setSaveStatus('saved')
      setTimeout(()=>setSaveStatus('idle'),3000)
      alert(`✓ Done!\nGenerated: ${result.generated}\nRe-generated: ${result.regenerated}\nSkipped: ${result.skipped}`)
    }, 0)
  }

  const savePlannedDatesToOrders = (showAlert=true) => {
    const stored = localStorage.getItem('dyeflow_db'); if (!stored) return
    const db = JSON.parse(stored); let updatedOrders=0,updatedBatches=0
    const toISO=(s:string)=>{ if(!s) return ''; if(s.match(/^\d{2}\/\d{2}\/\d{4}$/)){const[d,m,y]=s.split('/');return`${y}-${m}-${d}`} if(s.match(/^\d{4}-\d{2}-\d{2}$/)) return s; const p=new Date(s); return isNaN(p.getTime())?'':dateToStr(p) }
    for (const order of (db.orders||[])) {
      if (!Array.isArray(order.splits)||!order.splits.length) continue
      if (!order.plannedDates) order.plannedDates={}
      let touched=false
      for (const batch of order.splits) {
        const plan:Record<string,string>=batch.dateCalcPlan||{}; if(!Object.keys(plan).length) continue
        let lastDate=''
        for (const [code,dateStr] of Object.entries(plan)) { const iso=toISO(dateStr); if(!iso) continue; order.plannedDates[code]=iso; if(!lastDate||iso>lastDate) lastDate=iso }
        if(lastDate&&!order.plannedDates['Dispatch']) order.plannedDates['Dispatch']=lastDate
        if(plan['Dispatch']) order.plannedDates['Dispatch']=toISO(plan['Dispatch'])
        if(plan['FinalDispatch']) order.plannedDates['Dispatch']=toISO(plan['FinalDispatch'])
        if(order.plannedDates['Dispatch']) batch.plannedDate=order.plannedDates['Dispatch']
        updatedBatches++; touched=true
      }
      if(touched) updatedOrders++
    }
    localStorage.setItem('dyeflow_db',JSON.stringify(db)); window.dispatchEvent(new Event('dyeflow-db-updated'))
    if(showAlert) alert(`✅ Saved to ${updatedOrders} orders / ${updatedBatches} batches.`)
    return {updatedOrders,updatedBatches}
  }

  const openProcessDaysModal = () => {
    const stored=localStorage.getItem('dyeflow_db'); const db=stored?JSON.parse(stored):{}
    const processList=loadOrSeedProcessList(); const savedDurations:Record<string,any>={}
    ;(db.processDurations||[]).forEach((d:any)=>{if(d.code) savedDurations[d.code]=d})
    const temp:Record<string,{days:number,capacity:string}>={}
    allProcesses.forEach(code=>{const saved=savedDurations[code];const fromMaster=processList.find(p=>p.code===code);temp[code]={days:saved?.days??fromMaster?.defaultDays??1,capacity:processDurations.find(d=>d.code===code)?.capacity?.toString()||''}})
    setTempDurations(temp); setShowProcessDaysModal(true)
  }

  const saveProcessDays = () => {
    const stored=localStorage.getItem('dyeflow_db'); if(!stored) return
    const db=JSON.parse(stored); if(!Array.isArray(db.processDurations)) db.processDurations=[]
    const byCode:Record<string,number>={}
    db.processDurations.forEach((d:any,i:number)=>{if(d.code&&byCode[d.code]===undefined) byCode[d.code]=i})
    allProcesses.forEach(code=>{const t=tempDurations[code];if(!t) return;const days=Math.max(1,t.days);const capacity=t.capacity?parseFloat(t.capacity):undefined;const idx=byCode[code];if(idx===undefined) db.processDurations.push({code,name:getProcessName(code),days,capacity:capacity||''}); else{db.processDurations[idx].days=days;db.processDurations[idx].capacity=capacity||''}})
    localStorage.setItem('dyeflow_db',JSON.stringify(db)); setShowProcessDaysModal(false); alert('✓ Process days saved!'); loadData()
  }

  const getMachinePlannedDates = (order:Order,batch:any) => {
    const mPcs=Object.keys(order.processMachines||{}); if(!mPcs.length) return '-'
    const entries=mPcs.map(pc=>({pc,date:batch.dateCalcPlan?.[pc]})).filter(e=>e.date)
    if(!entries.length&&batch.plannedDate){try{const d=normalizeDate(batch.plannedDate);return d?dateToDisplayStr(d):batch.plannedDate}catch{return batch.plannedDate}}
    return entries.map(e=>`${e.pc}: ${e.date}`).join(' / ')
  }

  if (!rows.length && !showExcelRows) return (
    <div className="content">
      <div className="card">
        <div className="card-header">
          <span className="card-title">Date Calculator Sheet</span>
          <label style={{ padding:'8px 16px',fontSize:13,fontWeight:600,borderRadius:6,cursor:'pointer',background:'var(--accent)',color:'#fff',display:'inline-flex',alignItems:'center',gap:6 }}>
            {excelUploading ? '⏳ Loading…' : '📤 Upload Excel to Calculate Dates'}
            <input type="file" accept=".xlsx,.xls,.csv" onChange={handleExcelUpload} style={{ position:'absolute',width:1,height:1,opacity:0,overflow:'hidden' }} />
          </label>
        </div>
        <div style={{ padding:'40px',textAlign:'center' }}>
          <div style={{ fontSize:40,marginBottom:12 }}>📅</div>
          <div style={{ fontSize:15,fontWeight:600,color:'var(--text-primary)',marginBottom:8 }}>No split batches in ERP</div>
          <div style={{ fontSize:13,color:'var(--text-tertiary)',marginBottom:16 }}>Upload an Excel file with batch details to calculate dates.</div>
          <div style={{ display:'inline-block',background:'var(--bg-secondary)',borderRadius:10,padding:'12px 18px',fontSize:12,color:'var(--text-secondary)',textAlign:'left',lineHeight:1.8 }}>
            <strong>Required columns:</strong> Batch ID · Colour · Qty · Route · Machine · Date<br/>
            <strong>Single date:</strong> D/F → D col · S/F → S col · Wash/F → Wash col<br/>
            <strong>Two dates:</strong> C/S/H/D/F + <em>7/18,7/15</em> → S=7/18, D=7/15
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <div className="content" style={{ height:'100vh', display:'flex', flexDirection:'column', overflow:'hidden', padding:0 }}>
      <div className="card" style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', margin:0, borderRadius:0, border:'none' }}>
        <div className="card-header">
          <span className="card-title">Date Calculator Sheet</span>
          <div style={{ display:'flex',alignItems:'center',gap:'8px',flexWrap:'wrap' }}>
            <label style={{ padding:'6px 12px',fontSize:12,fontWeight:600,borderRadius:6,cursor:'pointer',background:'var(--bg-secondary)',border:'1px solid var(--border-light)',color:'var(--text-primary)',display:'inline-flex',alignItems:'center',gap:5 }}>
              {excelUploading ? '⏳ Loading…' : '📤 Upload Excel'}
              <input type="file" accept=".xlsx,.xls,.csv" onChange={handleExcelUpload} style={{ position:'absolute',width:1,height:1,opacity:0,overflow:'hidden' }} />
            </label>
            {showExcelRows && (<>
              <button className="small success" onClick={generateExcelDates}>⚙ Generate Dates (Excel)</button>
              <button className="small" onClick={exportExcelWithDates} style={{ background:'#059669',color:'#fff',border:'none',fontWeight:600 }}>⬇ Download Output</button>
              <button className="small danger" onClick={()=>{setExcelRows([]);setShowExcelRows(false);setExcelFileName('')}}>✕ Clear Excel</button>
            </>)}
            <span style={{ width:1,height:20,background:'var(--border-light)',display:'inline-block' }} />
            <button className="small success" onClick={generateDates}>⚙ Generate Dates</button>
            <button className="small" onClick={()=>savePlannedDatesToOrders(true)} style={{ background:saveStatus==='saved'?'#1D9E75':'var(--accent)',color:'#fff',border:'none',fontWeight:600 }}>
              {saveStatus==='saved'?'✓ Saved to Orders':'⬇ Save to Orders'}
            </button>
            <button className="small primary" onClick={openProcessDaysModal}>Process Days</button>
            <button className="small" onClick={handleClearSelected} style={{ background:selectedBatches.size>0?'#DC2626':'#E5E7EB',color:selectedBatches.size>0?'white':'#9CA3AF',border:'none' }}>
              Clear Selected ({selectedBatches.size})
            </button>
          </div>
        </div>
        <div style={{ fontSize:'11px',color:'var(--text-tertiary)',padding:'3px 16px',flexShrink:0,background:'var(--bg-secondary)' }}>
          Two-date rows: C/S/H/D/F + <em>date1,date2</em> → first date to S, second date to D &nbsp;·&nbsp; Single date auto-maps by route
        </div>

        {showExcelRows && excelRows.length > 0 && (
          <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', borderTop:'2px solid var(--accent)' }}>
            <div style={{ padding:'6px 16px', background:'var(--accent-light)', display:'flex', alignItems:'center', gap:12, flexShrink:0 }}>
              <span style={{ fontSize:12,fontWeight:700,color:'var(--accent-dark)' }}>📤 Excel — {excelRows.length} rows from "{excelFileName}"</span>
              <span style={{ fontSize:11,color:'var(--text-tertiary)' }}>Temporary · not saved to ERP &nbsp;·&nbsp; 🔵 = machine process columns</span>
            </div>
            <div style={{ flex:1, overflowX:'auto', overflowY:'auto' }}>
              <table style={{ width:'100%',borderCollapse:'collapse',fontSize:12 }}>
                <thead>
                  <tr style={{ background:'#EFF6FF',position:'sticky',top:0,zIndex:10 }}>
                    <th style={thStyle}>BATCH ID</th><th style={thStyle}>COLOR</th><th style={thStyle}>ARTICLE</th>
                    <th style={thStyle}>KG</th><th style={thStyle}>ROUTE</th><th style={thStyle}>MACHINE</th>
                    {ALL_PROCESS_CODES.map(pc=>(
                      <th key={pc} style={{...thStyle, background: MACHINE_PROCS_PRIORITY.includes(pc)?'#BFDBFE':'#F9FAFB', color: MACHINE_PROCS_PRIORITY.includes(pc)?'#1D4ED8':'#6B7280'}}>{pc}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {excelRows.map(({order,batch})=>{
                    const plan:Record<string,string>=batch.dateCalcPlan||{}
                    return (
                      <tr key={batch.batchId} style={{ borderBottom:'1px solid #E5E7EB' }}>
                        <td style={{ ...tdStyle,fontWeight:700,color:'#2563EB' }}>{batch.batchId}</td>
                        <td style={tdStyle}>{order.color||'-'}</td>
                        <td style={tdStyle}>{order.article||'-'}</td>
                        <td style={{ ...tdStyle,fontWeight:700 }}>{batch.kg||'-'}</td>
                        <td style={tdStyle}>{(order.processRoute||[]).join('/')||'-'}</td>
                        <td style={{ ...tdStyle,fontSize:11,color:'#6B7280' }}>{order.machine||'-'}</td>
                        {ALL_PROCESS_CODES.map(pc=>(
                          <td key={pc} style={{ padding:0,borderRight:'1px solid #E5E7EB',
                            background: plan[pc] ? (MACHINE_PROCS_PRIORITY.includes(pc)?'#DBEAFE':'#F0FDF4') : 'transparent' }}>
                            <input type="text" value={plan[pc]||''} onChange={e=>handleExcelDateChange(batch.batchId,pc,e.target.value)}
                              style={{ width:'100%',minWidth:100,height:32,border:0,background:'transparent',padding:'2px 6px',fontSize:11,textAlign:'center',outline:'none' }} />
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

        {rows.length > 0 && !showExcelRows && (
          <div style={{ flex:1, overflowX:'auto', overflowY:'auto' }}>
            <table style={{ width:'100%',borderCollapse:'collapse',fontSize:'12px' }}>
              <thead>
                <tr style={{ background:'#F9FAFB',position:'sticky',top:0,zIndex:10 }}>
                  <th style={thStyle}>SELECT</th><th style={thStyle}>COLOUR</th><th style={thStyle}>BATCH</th>
                  <th style={thStyle}>QTY(KG)</th><th style={thStyle}>ROUTE</th><th style={thStyle}>MACHINE</th>
                  <th style={thStyle}>DATE</th>
                  {allProcesses.map(pc=><th key={pc} style={thStyle}>{pc}</th>)}
                  <th style={thStyle}>RE-GEN</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({order,batch})=>{
                  const route=(order.processRoute||[]).map((c:string)=>getProcessName(c)).join('/')
                  const plan:Record<string,string>=batch.dateCalcPlan||{}
                  return (
                    <tr key={`${order.id}-${batch.batchId}`} style={{ borderBottom:'1px solid #E5E7EB' }}>
                      <td style={{ ...tdStyle,textAlign:'center' }}>
                        <input type="checkbox" checked={selectedBatches.has(batch.batchId)} onChange={e=>handleBatchSelection(batch.batchId,e.target.checked)} style={{ cursor:'pointer' }} />
                      </td>
                      <td style={tdStyle}>{order.color||'-'}</td>
                      <td style={{ ...tdStyle,fontWeight:700,color:'#2563EB' }}>{batch.batchId||'-'}</td>
                      <td style={{ ...tdStyle,fontWeight:700 }}>{batch.kg||order.qtyKg||'-'}</td>
                      <td style={{ ...tdStyle,fontWeight:700,color:'#2563EB' }}>{route||'-'}</td>
                      <td style={tdStyle}>{order.machine||'-'}</td>
                      <td style={{ ...tdStyle,fontSize:'11px' }}>{getMachinePlannedDates(order,batch)}</td>
                      {allProcesses.map(pc=>(
                        <td key={pc} style={{ padding:0,borderRight:'1px solid #E5E7EB' }}>
                          <input type="text" value={plan[pc]||''} onChange={e=>handleDateChange(order.id,batch.batchId,pc,e.target.value)}
                            style={{ width:'100%',minWidth:'110px',height:'36px',border:0,background:'transparent',padding:'4px 8px',fontSize:'12px',textAlign:'center',outline:'none' }} />
                        </td>
                      ))}
                      <td style={{ ...tdStyle,textAlign:'center' }}>
                        <input type="checkbox" checked={batch.dcRegenerate||false} onChange={e=>handleRegenerateToggle(order.id,batch.batchId,e.target.checked)} style={{ cursor:'pointer' }} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showProcessDaysModal && (
        <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000 }}
          onClick={()=>setShowProcessDaysModal(false)}>
          <div style={{ background:'white',borderRadius:'8px',padding:'24px',maxWidth:'600px',width:'90%',maxHeight:'80vh',overflow:'auto' }}
            onClick={e=>e.stopPropagation()}>
            <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'16px' }}>
              <h3 style={{ margin:0,fontSize:'16px',fontWeight:700 }}>Process Days Setup</h3>
              <button onClick={()=>setShowProcessDaysModal(false)} style={{ border:'none',background:'none',fontSize:'20px',cursor:'pointer' }}>✕</button>
            </div>
            <div style={{ maxHeight:'50vh',overflow:'auto',marginBottom:'16px' }}>
              <table style={{ width:'100%',borderCollapse:'collapse' }}>
                <thead><tr style={{ background:'#F9FAFB',borderBottom:'2px solid #E5E7EB' }}>
                  {['PROCESS','NAME','DAYS','CAPACITY (KG/DAY)'].map(h=><th key={h} style={{ padding:'10px',textAlign:'left',fontSize:'11px',fontWeight:700,color:'#6B7280' }}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {allProcesses.map(code=>(
                    <tr key={code} style={{ borderBottom:'1px solid #E5E7EB' }}>
                      <td style={{ padding:'10px',fontWeight:700,color:'#2563EB' }}>{code}</td>
                      <td style={{ padding:'10px' }}>{getProcessName(code)}</td>
                      <td style={{ padding:'10px' }}>
                        <input type="number" min="1" step="1" value={tempDurations[code]?.days||1}
                          onChange={e=>setTempDurations(prev=>({...prev,[code]:{...prev[code],days:parseInt(e.target.value)||1}}))}
                          style={{ width:'80px',padding:'6px',border:'1px solid #D1D5DB',borderRadius:'4px' }} />
                      </td>
                      <td style={{ padding:'10px' }}>
                        <input type="number" min="0" step="0.01" value={tempDurations[code]?.capacity||''}
                          onChange={e=>setTempDurations(prev=>({...prev,[code]:{...prev[code],capacity:e.target.value}}))}
                          style={{ width:'100px',padding:'6px',border:'1px solid #D1D5DB',borderRadius:'4px' }} placeholder="Optional" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display:'flex',gap:'8px' }}>
              <button className="primary" onClick={saveProcessDays}>Save Process Days</button>
              <button onClick={()=>setShowProcessDaysModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const thStyle: React.CSSProperties = {
  padding:'8px 12px',textAlign:'left',fontSize:'10px',fontWeight:700,color:'#6B7280',
  textTransform:'uppercase',letterSpacing:'0.5px',borderBottom:'2px solid #E5E7EB',
  borderRight:'1px solid #E5E7EB',whiteSpace:'nowrap',background:'#F9FAFB'
}
const tdStyle: React.CSSProperties = {
  padding:'8px 12px',fontSize:'12px',borderRight:'1px solid #E5E7EB',whiteSpace:'nowrap'
}
