'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { fetchProcessList } from '@/lib/processMap'

// ── Types ─────────────────────────────────────────────────────────────────────
interface BatchRow {
  batchId:     string   // e.g. DYE26-0004-B1
  batchUUID:   string   // Supabase UUID
  kg:          number
  color:       string
  orderNumber: string
  route:       string[]
  machine:     string
  // Anchor dates from machine numbering (READ ONLY — engine uses these as input)
  anchors:     Record<string, string>  // { S: '2026-08-04', D: '2026-08-07' }
  // Generated dates (written by engine)
  dates:       Record<string, string>  // { C: '2026-08-06', S: '2026-08-07', ... }
  dcGeneratedOnce: boolean
  dcRegenerate:    boolean
  pushed:          boolean
}

interface ProcessDuration { code: string; name: string; days: number; capacity?: number }

// ── Constants ─────────────────────────────────────────────────────────────────
const ALL_PROCS = ['C','S','H','D','S2','Rx','O','G','F','Co','Tu','Add','Level','Rc','Fix','Wash','Dry','B','R','K','QA','Packing','Dispatch','FinalDispatch']
const ANCHOR_PROCS = ['S','D','S2','Add','Level','Fix','Wash','Rc']  // machine process types
const PNAMES: Record<string,string> = {
  C:'CBR',S:'SCQ',H:'Heat-Set',D:'Dyeing',S2:'SCQ2',Rx:'Relax',O:'Opener',
  G:'Ghanti',F:'Finish',Co:'Compactor',Tu:'Tubler',Add:'Addition',Level:'Levelling',
  Rc:'RC',Fix:'Fixing',Wash:'Washing',Dry:'Dry',B:'Brushing',R:'Raising',K:'Kundi',
  QA:'QA',Packing:'Packing',Dispatch:'Dispatch',FinalDispatch:'Final Dispatch'
}
let _procNameCache: Record<string,string> = { ...PNAMES }
const getPN = (c: string) => _procNameCache[c] || c

// ── Date helpers ──────────────────────────────────────────────────────────────
const dateToYMD = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`

const ymdToDate = (s: string): Date | null => {
  if (!s) return null
  const p = s.split('-')
  if (p.length !== 3) return null
  const d = new Date(+p[0], +p[1]-1, +p[2])
  return isNaN(d.getTime()) ? null : d
}

const toDisplay = (ymd: string): string => {
  const p = ymd?.split('-')
  return p?.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : (ymd || '')
}

const fromDisplay = (s: string): string => {
  if (!s) return ''
  if (s.match(/^\d{4}-\d{2}-\d{2}$/)) return s
  if (s.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
    const [d,m,y] = s.split('/'); return `${y}-${m}-${d}`
  }
  return ''
}

const buildHolidaySet = (holidays: any[]): Set<string> => {
  const s = new Set<string>()
  for (const h of holidays) {
    const raw = h.holiday_date || h.date
    if (raw) s.add(raw.slice(0,10))
  }
  return s
}

// ── Engine helpers ────────────────────────────────────────────────────────────
const nextWD = (d: Date, holidaySet: Set<string>, fwd = true): Date => {
  const r = new Date(d); const step = fwd ? 1 : -1
  do { r.setDate(r.getDate() + step) } while (holidaySet.has(dateToYMD(r)))
  return r
}

const addPD = (date: Date, n: number, holidaySet: Set<string>, fwd = true): Date => {
  let d = new Date(date)
  for (let i = 0; i < Math.max(1, n); i++) d = nextWD(d, holidaySet, fwd)
  return d
}

// ─────────────────────────────────────────────────────────────────────────────
// Date Calculator Engine — exact logic from reference HTML
// ─────────────────────────────────────────────────────────────────────────────
function runEngine(
  rows: BatchRow[],
  dayMap: Record<string, number>,
  capMap: Record<string, number>,
  holidaySet: Set<string>,
  todayYMD: string
): { generated: number; pushed: number; skipped: number } {
  // loadMap: proc → { YYYY-MM-DD → kg } — tracks committed capacity
  const loadMap: Record<string, Record<string, number>> = {}

  // Pre-load already-generated batches (not re-generating) into loadMap
  for (const row of rows) {
    if (row.dcGeneratedOnce && !row.dcRegenerate) {
      const qty = row.kg
      for (const [proc, ymd] of Object.entries(row.dates)) {
        if (!ymd) continue
        if (!loadMap[proc]) loadMap[proc] = {}
        loadMap[proc][ymd] = (loadMap[proc][ymd] || 0) + qty
      }
    }
  }

  // fitDate forward: find first date >= candidate with available capacity
  const fitDate = (proc: string, candidateYMD: string, qty: number): string => {
    if (!candidateYMD) return ''
    let cur = ymdToDate(candidateYMD)
    if (!cur) return candidateYMD
    while (holidaySet.has(dateToYMD(cur))) cur = nextWD(cur, holidaySet, true)
    const cap = capMap[proc]
    if (!cap || qty <= 0) return dateToYMD(cur)
    if (!loadMap[proc]) loadMap[proc] = {}
    for (let i = 0; i < 730; i++) {
      const ymd = dateToYMD(cur)
      if (holidaySet.has(ymd)) { cur = nextWD(cur, holidaySet, true); continue }
      const existing = loadMap[proc][ymd] || 0
      if (existing + qty <= cap + 0.001) {
        loadMap[proc][ymd] = existing + qty
        return ymd
      }
      cur = nextWD(cur, holidaySet, true)
    }
    return dateToYMD(cur)
  }

  const TAIL = ['QA', 'Packing', 'Dispatch', 'FinalDispatch']
  let generated = 0, pushed = 0, skipped = 0

  for (const row of rows) {
    if (row.dcGeneratedOnce && !row.dcRegenerate) { skipped++; continue }

    const qty = row.kg || 0
    const workSeq = [...new Set(row.route)]
      .map(c => ALL_PROCS.find(p => p.toLowerCase() === c.toLowerCase()) || c)
      .filter(Boolean)
    if (!workSeq.length) { skipped++; continue }

    // Build anchor map from machine anchor dates (SEPARATE from generated dates)
    // anchors = { S: '2026-08-04', D: '2026-08-07' }
    const anchorsInRoute: Record<string, string> = {}
    for (const c of workSeq) {
      if (row.anchors[c]) anchorsInRoute[c] = row.anchors[c]
    }
    if (!Object.keys(anchorsInRoute).length) { skipped++; continue }

    // STEP 1: Pick anchor = LATEST date among anchors in route
    let anchorProc = '', anchorYMD = ''
    for (const [proc, ymd] of Object.entries(anchorsInRoute)) {
      if (!anchorYMD || ymd > anchorYMD) { anchorYMD = ymd; anchorProc = proc }
    }
    const anchorIdx = workSeq.indexOf(anchorProc)
    if (anchorIdx < 0) { skipped++; continue }

    const planned: Record<string, string> = { [anchorProc]: anchorYMD }

    // STEP 2: Walk BACKWARD from anchor (no capacity check — historical estimates)
    let back = ymdToDate(anchorYMD)!
    for (let i = anchorIdx - 1; i >= 0; i--) {
      const c = workSeq[i]
      back = addPD(back, dayMap[c] || 1, holidaySet, false)
      planned[c] = dateToYMD(back)
    }

    // STEP 3: Check if first planned date < today → ALL IN PAST
    const firstYMD = planned[workSeq[0]]
    const isPast = firstYMD < todayYMD

    if (isPast) {
      // STEP 3A: Recalculate ALL forward from today with capacity check
      let fwd = ymdToDate(todayYMD)!
      for (let i = 0; i < workSeq.length; i++) {
        const c = workSeq[i]
        const prev = i > 0 ? workSeq[i-1] : null
        fwd = addPD(fwd, i === 0 ? (dayMap[c]||1) : (dayMap[prev!]||1), holidaySet, true)
        planned[c] = fitDate(c, dateToYMD(fwd), qty)
        fwd = ymdToDate(planned[c]) || fwd
      }
      row.pushed = true; pushed++
    } else {
      // STEP 3B: Future → keep backward dates, walk FORWARD from anchor with capacity check
      let fwd = ymdToDate(anchorYMD)!
      for (let i = anchorIdx + 1; i < workSeq.length; i++) {
        const c = workSeq[i]
        const prev = workSeq[i-1]
        fwd = addPD(fwd, dayMap[prev]||1, holidaySet, true)
        planned[c] = fitDate(c, dateToYMD(fwd), qty)
        fwd = ymdToDate(planned[c]) || fwd
      }
    }

    // STEP 4: Append tail (QA/Packing/Dispatch) only if NOT already in route
    const workSeqLower = workSeq.map(x => x.toLowerCase())
    let endDate = ymdToDate(planned[workSeq[workSeq.length-1]])!
    for (const c of TAIL) {
      if (workSeqLower.includes(c.toLowerCase())) continue  // already in route
      endDate = addPD(endDate, dayMap[c]||1, holidaySet, true)
      planned[c] = fitDate(c, dateToYMD(endDate), qty)
      endDate = ymdToDate(planned[c]) || endDate
    }

    // Write ALL planned dates to row.dates (including anchor processes)
    // This is the key difference: anchor dates from machine are INPUT only
    // The engine freely writes calculated dates for ALL processes including D and S
    for (const [c, ymd] of Object.entries(planned)) {
      if (ymd) row.dates[c] = ymd
    }
    for (const c of TAIL) {
      if (planned[c]) row.dates[c] = planned[c]
    }

    row.dcGeneratedOnce = true
    row.dcRegenerate    = false
    generated++
  }

  return { generated, pushed, skipped }
}

// ── Page Component ────────────────────────────────────────────────────────────
export default function DateCalculatorPage() {
  const [rows,            setRows]            = useState<BatchRow[]>([])
  const [processDurations,setProcessDurations]= useState<ProcessDuration[]>([])
  const [holidays,        setHolidays]        = useState<any[]>([])
  const [selectedBatches, setSelectedBatches] = useState<Set<string>>(new Set())
  const [showPDModal,     setShowPDModal]     = useState(false)
  const [tempDurations,   setTempDurations]   = useState<Record<string,{days:number;capacity:string}>>({})
  const [saveStatus,      setSaveStatus]      = useState<'idle'|'saving'|'saved'>('idle')
  const [loadStatus,      setLoadStatus]      = useState<'loading'|'ready'|'error'>('loading')
  const pendingSaves = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const buildMaps = () => {
    const dayMap: Record<string,number> = {}
    const capMap: Record<string,number> = {}
    ALL_PROCS.forEach(c => { dayMap[c] = 1 })
    for (const d of processDurations) {
      if (!d.code) continue
      dayMap[d.code] = d.days > 0 ? d.days : 1
      if (d.capacity && d.capacity > 0) capMap[d.code] = d.capacity
    }
    return { dayMap, capMap }
  }

  // ── Load data ───────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoadStatus('loading')
    try {
      const [oRes, bRes, dpRes, hRes, pdRes, procList] = await Promise.all([
        fetch('/api/orders?limit=2000',  { cache:'no-store' }).then(r=>r.json()),
        fetch('/api/batches?limit=10000',{ cache:'no-store' }).then(r=>r.json()),
        fetch('/api/date-plans',          { cache:'no-store' }).then(r=>r.json()),
        fetch('/api/setup/holidays',      { cache:'no-store' }).then(r=>r.json()).catch(()=>({data:[]})),
        fetch('/api/setup/settings?key=processDurations',{ cache:'no-store' }).then(r=>r.json()).catch(()=>({value:[]})),
        fetchProcessList(),
      ])

      procList.forEach((p: any) => { _procNameCache[p.code] = p.name })
      setHolidays(hRes.data || [])
      setProcessDurations(pdRes.value || [])

      const orders:    any[] = oRes.data  || []
      const batches:   any[] = bRes.data  || []
      const datePlans: any[] = dpRes.data || []

      // Build lookup maps
      const orderMap: Record<string,any> = {}
      for (const o of orders) orderMap[o.id] = o

      const dpMap: Record<string,any> = {}
      for (const dp of datePlans) dpMap[dp.batch_id] = dp

      const batchRows: BatchRow[] = []
      for (const b of batches) {
        const o = orderMap[b.order_id] || {}
        const dp = dpMap[b.id] || {}

        // Extract anchor dates from batch_date_plans.anchor_* columns
        const anchors: Record<string,string> = {}
        if (dp.anchor_s)   anchors['S']     = dp.anchor_s
        if (dp.anchor_d)   anchors['D']     = dp.anchor_d
        if (dp.anchor_s2)  anchors['S2']    = dp.anchor_s2
        if (dp.anchor_add) anchors['Add']   = dp.anchor_add
        if (dp.anchor_lev) anchors['Level'] = dp.anchor_lev
        if (dp.anchor_fix) anchors['Fix']   = dp.anchor_fix
        if (dp.anchor_wash)anchors['Wash']  = dp.anchor_wash
        if (dp.anchor_rc)  anchors['Rc']    = dp.anchor_rc

        // Extract generated dates from batch_date_plans.d_* columns
        const dates: Record<string,string> = {}
        const PROC_MAP: Record<string,string> = {
          C:'d_c',S:'d_s',H:'d_h',D:'d_d',S2:'d_s2',Rx:'d_rx',O:'d_o',
          G:'d_g',F:'d_f',Co:'d_co',Tu:'d_tu',Add:'d_add',Level:'d_level',
          Rc:'d_rc',Fix:'d_fix',Wash:'d_wash',Dry:'d_dry',B:'d_b',R:'d_r',
          K:'d_k',QA:'d_qa',Packing:'d_packing',Dispatch:'d_dispatch',FinalDispatch:'d_finaldispatch'
        }
        for (const [proc, col] of Object.entries(PROC_MAP)) {
          if (dp[col]) dates[proc] = dp[col].slice(0,10)
        }

        batchRows.push({
          batchId:     b.batch_id || b.id,
          batchUUID:   b.id,
          kg:          parseFloat(b.kg) || 0,
          color:       o.color || '',
          orderNumber: o.order_number || '',
          route:       b.process_route || o.process_route || [],
          machine:     o.machines?.name || '',
          anchors,
          dates,
          dcGeneratedOnce: dp.dc_generated_once || false,
          dcRegenerate:    dp.dc_regenerate     || false,
          pushed:          dp.pushed            || false,
        })
      }

      setRows(batchRows.filter(r => r.route.length > 0))
      setLoadStatus('ready')
    } catch (err) {
      console.error('Date calc loadData error:', err)
      setLoadStatus('error')
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // ── Persist a date change ───────────────────────────────────────────────────
  const persistRow = useCallback((row: BatchRow) => {
    const key = row.batchUUID
    if (pendingSaves.current[key]) clearTimeout(pendingSaves.current[key])
    pendingSaves.current[key] = setTimeout(async () => {
      await fetch('/api/date-plans', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'upsert', batch_id: row.batchUUID, batch_id_str: row.batchId,
          dates: row.dates, anchors: row.anchors,
          dc_generated_once: row.dcGeneratedOnce, dc_regenerate: row.dcRegenerate, pushed: row.pushed,
        })
      }).catch(() => {})
      delete pendingSaves.current[key]
    }, 400)
  }, [])

  const handleDateChange = (rowIdx: number, proc: string, value: string) => {
    setRows(prev => {
      const updated = [...prev]
      const row = { ...updated[rowIdx], dates: { ...updated[rowIdx].dates } }
      const ymd = fromDisplay(value) || value
      row.dates[proc] = ymd
      updated[rowIdx] = row
      persistRow(row)
      return updated
    })
  }

  const handleRegenerateToggle = (rowIdx: number, checked: boolean) => {
    setRows(prev => {
      const updated = [...prev]
      const row = { ...updated[rowIdx], dcRegenerate: checked }
      updated[rowIdx] = row
      persistRow(row)
      return updated
    })
  }

  // ── Generate Dates ──────────────────────────────────────────────────────────
  const generateDates = async () => {
    const { dayMap, capMap } = buildMaps()
    const holidaySet = buildHolidaySet(holidays)
    const todayYMD   = new Date().toISOString().slice(0,10)

    // Deep clone rows for engine
    const workRows = rows.map(r => ({
      ...r, dates: { ...r.dates }, anchors: { ...r.anchors }
    }))

    const result = runEngine(workRows, dayMap, capMap, holidaySet, todayYMD)
    setRows(workRows)

    // Save all generated rows to batch_date_plans
    setSaveStatus('saving')
    await Promise.all(workRows.map(row =>
      fetch('/api/date-plans', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'upsert', batch_id: row.batchUUID, batch_id_str: row.batchId,
          dates: row.dates, anchors: row.anchors,
          dc_generated_once: row.dcGeneratedOnce, dc_regenerate: row.dcRegenerate, pushed: row.pushed,
        })
      }).catch(() => {})
    ))

    // Also save to orders.planned_dates
    await savePlannedDatesToOrders(workRows, false)
    setSaveStatus('saved')
    setTimeout(() => setSaveStatus('idle'), 3000)
    alert(`✓ Done!\nGenerated: ${result.generated} · Pushed: ${result.pushed} · Skipped: ${result.skipped}`)
  }

  // ── Save to orders ──────────────────────────────────────────────────────────
  const savePlannedDatesToOrders = async (sourceRows = rows, showAlert = true) => {
    setSaveStatus('saving')
    try {
      const orderPlans: Record<string,Record<string,string>> = {}
      for (const row of sourceRows) {
        const orderId = rows.find(r => r.batchId === row.batchId)?.batchUUID || ''
        // We need order ID — get from batch lookup
      }

      // Simpler: group by orderNumber from rows
      const orderMap: Record<string, string> = {}
      const orderPlanMap: Record<string, Record<string,string>> = {}
      for (const row of sourceRows) {
        if (!row.dates || !Object.keys(row.dates).length) continue
        // Find order UUID via orderNumber — we'll use a fresh fetch
      }

      // Fetch orders to get IDs
      const oRes = await fetch('/api/orders?limit=2000', { cache:'no-store' }).then(r=>r.json())
      for (const o of (oRes.data || [])) orderMap[o.order_number] = o.id

      for (const row of sourceRows) {
        const oId = orderMap[row.orderNumber]; if (!oId) continue
        if (!orderPlanMap[oId]) orderPlanMap[oId] = {}
        for (const [proc, ymd] of Object.entries(row.dates)) {
          if (ymd) orderPlanMap[oId][proc] = ymd
        }
        if (!orderPlanMap[oId]['Dispatch']) {
          const isos = Object.values(orderPlanMap[oId]).filter(Boolean).sort()
          if (isos.length) orderPlanMap[oId]['Dispatch'] = isos[isos.length-1]
        }
      }

      const updates = Object.entries(orderPlanMap).map(([id, planned_dates]) => ({ id, planned_dates }))
      if (!updates.length) { if (showAlert) alert('No planned dates to save.'); return }

      const res = await fetch('/api/orders', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ action:'update_planned_dates', updates })
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'Save failed')
      setSaveStatus('saved')
      if (showAlert) alert(`✅ Saved planned dates to ${updates.length} orders.`)
    } catch (err: any) {
      setSaveStatus('idle')
      if (showAlert) alert('Save failed: ' + err.message)
    }
  }

  // ── Clear selected ──────────────────────────────────────────────────────────
  const handleClearSelected = async () => {
    if (!selectedBatches.size) { alert('Select batches first'); return }
    if (!confirm(`Clear Date Calculator dates for ${selectedBatches.size} batch(es)?\nMachine plan numbers will NOT be cleared.`)) return
    let cleared = 0
    for (const row of rows) {
      if (!selectedBatches.has(row.batchId)) continue

      // Fetch fresh batches.date_calc_plan to preserve machine keys only
      let freshPlan: any = {}
      try {
        const r = await fetch(`/api/batches?id=${row.batchUUID}`, { cache:'no-store' }).then(x=>x.json())
        freshPlan = r.data?.[0]?.date_calc_plan || {}
      } catch {}

      // Keep ONLY machine numbering keys — wipe all flat date keys
      const MACHINE_KEYS = ['byProcess','byProcessDates','planNumber','plannedDate']
      const preserved: Record<string,any> = {}
      for (const k of MACHINE_KEYS) {
        if (freshPlan[k] !== undefined) preserved[k] = freshPlan[k]
      }

      // Save to batches table — this is the primary store
      await fetch('/api/batches', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          action:'update', id: row.batchUUID,
          date_calc_plan: Object.keys(preserved).length ? preserved : null,
          dc_generated_once: false, dc_regenerate: false
        })
      }).catch(console.error)

      // Also clear d_* in batch_date_plans if row exists there
      await fetch('/api/date-plans', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ action:'clear', batch_id: row.batchUUID })
      }).catch(() => {})

      // Update local state immediately so UI shows cleared
      setRows(prev => prev.map(r => r.batchUUID === row.batchUUID
        ? { ...r, dates: {}, dcGeneratedOnce: false, dcRegenerate: false }
        : r
      ))
      cleared++
    }
    setSelectedBatches(new Set())
    // Reload from DB to confirm
    await loadData()
    alert(`✓ Cleared Date Calculator dates for ${cleared} batch(es).`)
  }

  // ── Process Days modal ──────────────────────────────────────────────────────
  const openProcessDaysModal = () => {
    const byCode: Record<string,ProcessDuration> = {}
    processDurations.forEach(d => { if (d.code) byCode[d.code] = d })
    const temp: Record<string,{days:number;capacity:string}> = {}
    ALL_PROCS.forEach(c => {
      temp[c] = { days: byCode[c]?.days ?? 1, capacity: byCode[c]?.capacity?.toString() || '' }
    })
    setTempDurations(temp); setShowPDModal(true)
  }

  const saveProcessDays = async () => {
    const newDurations: ProcessDuration[] = ALL_PROCS.map(c => ({
      code: c, name: getPN(c),
      days: Math.max(1, tempDurations[c]?.days || 1),
      capacity: tempDurations[c]?.capacity ? parseFloat(tempDurations[c].capacity) : undefined,
    }))
    setProcessDurations(newDurations)
    await fetch('/api/setup/settings', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ key:'processDurations', value: newDurations })
    })
    setShowPDModal(false)
    alert('✓ Process days saved!')
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loadStatus === 'loading') return (
    <div className="content" style={{ textAlign:'center', padding:80 }}>
      <div style={{ fontSize:32, marginBottom:12 }}>📅</div>
      <div style={{ fontSize:14, color:'var(--text-tertiary)' }}>Loading from Supabase…</div>
    </div>
  )

  if (loadStatus === 'error') return (
    <div className="content">
      <div className="card" style={{ textAlign:'center', padding:40 }}>
        <div style={{ fontSize:32, marginBottom:12 }}>⚠️</div>
        <div style={{ fontSize:14, fontWeight:600, color:'var(--danger)' }}>Failed to load data</div>
        <button className="primary" style={{ marginTop:16 }} onClick={loadData}>Retry</button>
      </div>
    </div>
  )

  return (
    <div className="content" style={{ height:'100vh', display:'flex', flexDirection:'column', overflow:'hidden', padding:0 }}>
      <div className="card" style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', margin:0, borderRadius:0, border:'none' }}>

        {/* Header */}
        <div className="card-header">
          <span className="card-title">
            Date Calculator Sheet
            <span style={{ fontSize:11, fontWeight:400, color:'var(--text-tertiary)', marginLeft:8 }}>
              Supabase · {rows.length} batches
            </span>
          </span>
          <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
            <button className="small success" onClick={generateDates}>⚙ Generate Dates</button>
            <button className="small"
              style={{ background: saveStatus==='saved'?'#1D9E75':'var(--accent)', color:'#fff', border:'none', fontWeight:600 }}
              onClick={() => savePlannedDatesToOrders(rows, true)}>
              {saveStatus==='saving'?'⏳ Saving…':saveStatus==='saved'?'✓ Saved':'⬇ Save to Orders'}
            </button>
            <button className="small primary" onClick={openProcessDaysModal}>Process Days</button>
            <button className="small"
              style={{ background: selectedBatches.size>0?'#DC2626':'#E5E7EB', color: selectedBatches.size>0?'white':'#9CA3AF', border:'none' }}
              onClick={handleClearSelected}>
              Clear Selected ({selectedBatches.size})
            </button>
            <button className="small" onClick={loadData}>↻ Refresh</button>
          </div>
        </div>

        <div style={{ fontSize:11, color:'var(--text-tertiary)', padding:'3px 16px', flexShrink:0, background:'var(--bg-secondary)' }}>
          Anchor dates (S/D) come from machine sheet · Generate Dates calculates all process dates · Save pushes to orders
        </div>

        {/* Table */}
        {rows.length === 0 ? (
          <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:12, color:'var(--text-tertiary)' }}>
            <div style={{ fontSize:40 }}>📅</div>
            <div style={{ fontSize:15, fontWeight:600 }}>No batches found</div>
            <div style={{ fontSize:13 }}>Split some orders first, then number them on the machine sheet.</div>
            <button className="small" onClick={loadData}>↻ Refresh</button>
          </div>
        ) : (
          <div style={{ flex:1, overflowX:'auto', overflowY:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
              <thead>
                <tr style={{ background:'#F9FAFB', position:'sticky', top:0, zIndex:10 }}>
                  <th style={TH}>SELECT</th>
                  <th style={TH}>COLOUR</th>
                  <th style={TH}>BATCH</th>
                  <th style={TH}>QTY(KG)</th>
                  <th style={TH}>ROUTE</th>
                  <th style={TH}>MACHINE</th>
                  <th style={TH}>DATE (Anchors)</th>
                  {ALL_PROCS.map(pc => (
                    <th key={pc} style={{ ...TH, background: ANCHOR_PROCS.includes(pc)?'#DBEAFE':'#F9FAFB', color: ANCHOR_PROCS.includes(pc)?'#1D4ED8':'#6B7280' }}>
                      {pc}
                    </th>
                  ))}
                  <th style={TH}>STATUS</th>
                  <th style={TH}>RE-GEN</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => {
                  const routeDisplay = row.route.map(c => getPN(c)).join('/')
                  // Build anchor summary for DATE column
                  const anchorSummary = Object.entries(row.anchors)
                    .filter(([,v]) => v)
                    .map(([k,v]) => `${k}:${toDisplay(v)}`)
                    .join(' / ')

                  return (
                    <tr key={row.batchId} style={{ borderBottom:'1px solid #E5E7EB', background: row.pushed?'#FFFBEB':'' }}>
                      <td style={{ ...TD, textAlign:'center' }}>
                        <input type="checkbox" checked={selectedBatches.has(row.batchId)}
                          onChange={e => setSelectedBatches(prev => { const s=new Set(prev); e.target.checked?s.add(row.batchId):s.delete(row.batchId); return s })}
                          style={{ cursor:'pointer' }} />
                      </td>
                      <td style={TD}>{row.color||'-'}</td>
                      <td style={{ ...TD, fontWeight:700, color:'#2563EB' }}>{row.batchId}</td>
                      <td style={{ ...TD, fontWeight:700 }}>{row.kg||'-'}</td>
                      <td style={{ ...TD, color:'#2563EB', fontWeight:600, fontSize:11 }}>{routeDisplay||'-'}</td>
                      <td style={TD}>{row.machine||'-'}</td>
                      <td style={{ ...TD, fontSize:10, color:'#6B7280' }}>{anchorSummary||'-'}</td>
                      {ALL_PROCS.map(pc => {
                        const ymd = row.dates[pc] || ''
                        const display = ymd ? toDisplay(ymd) : ''
                        const isAnchorProc = ANCHOR_PROCS.includes(pc)
                        return (
                          <td key={pc} style={{ padding:0, borderRight:'1px solid #E5E7EB',
                            background: display ? (isAnchorProc?'#DBEAFE':'#F0FDF4') : '' }}>
                            <input type="text" value={display}
                              onChange={e => handleDateChange(idx, pc, e.target.value)}
                              style={{ width:'100%', minWidth:100, height:32, border:0, background:'transparent',
                                padding:'2px 6px', fontSize:11, textAlign:'center', outline:'none' }} />
                          </td>
                        )
                      })}
                      <td style={{ ...TD, textAlign:'center' }}>
                        {row.pushed ? <span style={{ fontSize:10, background:'#FEF9C3', color:'#854D0E', padding:'2px 6px', borderRadius:4, fontWeight:700 }}>📅 Pushed</span>
                          : row.dcGeneratedOnce ? <span style={{ fontSize:10, background:'#DCFCE7', color:'#166534', padding:'2px 6px', borderRadius:4, fontWeight:700 }}>✓ Done</span>
                          : <span style={{ fontSize:10, background:'#FEE2E2', color:'#991B1B', padding:'2px 6px', borderRadius:4, fontWeight:700 }}>Pending</span>}
                      </td>
                      <td style={{ ...TD, textAlign:'center' }}>
                        <input type="checkbox" checked={row.dcRegenerate||false}
                          onChange={e => handleRegenerateToggle(idx, e.target.checked)}
                          style={{ cursor:'pointer' }} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Process Days Modal */}
      {showPDModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }}
          onClick={() => setShowPDModal(false)}>
          <div style={{ background:'white', borderRadius:8, padding:24, maxWidth:620, width:'90%', maxHeight:'85vh', overflow:'auto' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
              <h3 style={{ margin:0, fontSize:16, fontWeight:700 }}>Process Days & Capacity</h3>
              <button onClick={() => setShowPDModal(false)} style={{ border:'none', background:'none', fontSize:20, cursor:'pointer' }}>✕</button>
            </div>
            <div style={{ padding:'10px 14px', background:'#EFF6FF', borderRadius:8, fontSize:12, color:'#1D4ED8', marginBottom:16 }}>
              💡 <strong>Days</strong> = how long this process takes before the next starts.<br/>
              <strong>Capacity</strong> = max kg/day. Leave blank = no limit.
            </div>
            <div style={{ maxHeight:'55vh', overflow:'auto', marginBottom:16 }}>
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead>
                  <tr style={{ background:'#F9FAFB', borderBottom:'2px solid #E5E7EB' }}>
                    {['Process','Name','Days','Capacity (kg/day)'].map(h => (
                      <th key={h} style={{ padding:'8px 10px', textAlign:'left', fontSize:11, fontWeight:700, color:'#6B7280' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ALL_PROCS.map(code => (
                    <tr key={code} style={{ borderBottom:'1px solid #E5E7EB' }}>
                      <td style={{ padding:'8px 10px', fontWeight:700, color:'#2563EB' }}>{code}</td>
                      <td style={{ padding:'8px 10px', color:'#6B7280' }}>{getPN(code)}</td>
                      <td style={{ padding:'8px 10px' }}>
                        <input type="number" min="1" step="1" value={tempDurations[code]?.days||1}
                          onChange={e => setTempDurations(prev => ({...prev,[code]:{...prev[code],days:parseInt(e.target.value)||1}}))}
                          style={{ width:70, padding:'4px 6px', border:'1px solid #D1D5DB', borderRadius:4 }} />
                      </td>
                      <td style={{ padding:'8px 10px' }}>
                        <input type="number" min="0" step="100" value={tempDurations[code]?.capacity||''}
                          onChange={e => setTempDurations(prev => ({...prev,[code]:{...prev[code],capacity:e.target.value}}))}
                          style={{ width:120, padding:'4px 6px', border:'1px solid #BFDBFE', borderRadius:4, background:'#EFF6FF' }}
                          placeholder="e.g. 10000" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <button className="primary" onClick={saveProcessDays}>✓ Save Process Days</button>
              <button onClick={() => setShowPDModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const TH: React.CSSProperties = {
  padding:'7px 10px', textAlign:'left', fontSize:10, fontWeight:700, color:'#6B7280',
  textTransform:'uppercase', letterSpacing:'0.5px', borderBottom:'2px solid #E5E7EB',
  borderRight:'1px solid #E5E7EB', whiteSpace:'nowrap', background:'#F9FAFB'
}
const TD: React.CSSProperties = {
  padding:'6px 10px', fontSize:12, borderRight:'1px solid #E5E7EB', whiteSpace:'nowrap'
}
