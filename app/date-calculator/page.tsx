'use client'

import { useEffect, useState, useRef, useCallback } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────
interface ProcessDef {
  code:         string
  name:         string
  display_order: number
  default_days: number
  is_enabled:   boolean
  is_anchor?:   boolean  // machine processes (S, D, etc)
  days?:        number   // user-overridden days
  capacity?:    number   // user-overridden capacity
}

interface BatchRow {
  batchId:         string
  batchUUID:       string
  kg:              number
  color:           string
  orderNumber:     string
  route:           string[]
  machine:         string
  anchors:         Record<string, string>  // { S: '2026-08-04', D: '2026-08-07' }
  dates:           Record<string, string>  // { C: '2026-08-06', S: '2026-08-07', ... }
  dcGeneratedOnce: boolean
  dcRegenerate:    boolean
  pushed:          boolean
}

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
const nextWD = (d: Date, hs: Set<string>, fwd = true): Date => {
  const r = new Date(d); const step = fwd ? 1 : -1
  do { r.setDate(r.getDate() + step) } while (hs.has(dateToYMD(r)))
  return r
}

const addPD = (date: Date, n: number, hs: Set<string>, fwd = true): Date => {
  let d = new Date(date)
  for (let i = 0; i < Math.max(1, n); i++) d = nextWD(d, hs, fwd)
  return d
}

// ── Engine — matches reference HTML exactly ───────────────────────────────────
function runEngine(
  rows:       BatchRow[],
  dayMap:     Record<string, number>,
  capMap:     Record<string, number>,
  holidaySet: Set<string>,
  todayYMD:   string,
  allProcCodes: string[],
): { generated: number; pushed: number; skipped: number } {
  const loadMap: Record<string, Record<string, number>> = {}

  // Pre-load committed batches
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

  // Tail = last 3 standard processes (QA, Packing, Dispatch) from process master
  // These get appended if not already in the batch route
  const TAIL = ['QA', 'Packing', 'Dispatch']

  let generated = 0, pushed = 0, skipped = 0

  for (const row of rows) {
    if (row.dcGeneratedOnce && !row.dcRegenerate) { skipped++; continue }

    const qty = row.kg || 0
    // Match route codes to process master codes (case-insensitive)
    const workSeq = [...new Set(row.route)]
      .map(c => allProcCodes.find(p => p.toLowerCase() === c.toLowerCase()) || c)
      .filter(Boolean)
    if (!workSeq.length) { skipped++; continue }

    // Find anchors in this batch's route
    const anchorsInRoute: Record<string, string> = {}
    for (const c of workSeq) {
      if (row.anchors[c]) anchorsInRoute[c] = row.anchors[c]
    }
    if (!Object.keys(anchorsInRoute).length) { skipped++; continue }

    // STEP 1: anchor = latest date
    let anchorProc = '', anchorYMD = ''
    for (const [proc, ymd] of Object.entries(anchorsInRoute)) {
      if (!anchorYMD || ymd > anchorYMD) { anchorYMD = ymd; anchorProc = proc }
    }
    const anchorIdx = workSeq.indexOf(anchorProc)
    if (anchorIdx < 0) { skipped++; continue }

    const planned: Record<string, string> = { [anchorProc]: anchorYMD }

    // STEP 2: Backward walk with capacity check
    let back = ymdToDate(anchorYMD)!
    for (let i = anchorIdx - 1; i >= 0; i--) {
      const c = workSeq[i]
      back = addPD(back, dayMap[c] || 1, holidaySet, false)
      const candidate = dateToYMD(back)
      const cap = capMap[c]
      if (cap && qty > 0) {
        if (!loadMap[c]) loadMap[c] = {}
        let cur = new Date(back)
        let found = false
        for (let j = 0; j < 730; j++) {
          const ymd = dateToYMD(cur)
          if (holidaySet.has(ymd)) { cur = nextWD(cur, holidaySet, false); continue }
          const existing = loadMap[c][ymd] || 0
          if (existing + qty <= cap + 0.001) {
            loadMap[c][ymd] = existing + qty
            planned[c] = ymd; back = cur; found = true; break
          }
          cur = nextWD(cur, holidaySet, false)
        }
        if (!found) planned[c] = candidate
      } else {
        planned[c] = candidate
      }
    }

    // STEP 3: Past detection
    const firstYMD = planned[workSeq[0]]
    if (firstYMD < todayYMD) {
      // All in past → recalculate forward from today
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
      // Future → forward from anchor with capacity
      let fwd = ymdToDate(anchorYMD)!
      for (let i = anchorIdx + 1; i < workSeq.length; i++) {
        const c = workSeq[i]; const prev = workSeq[i-1]
        fwd = addPD(fwd, dayMap[prev]||1, holidaySet, true)
        planned[c] = fitDate(c, dateToYMD(fwd), qty)
        fwd = ymdToDate(planned[c]) || fwd
      }
    }

    // STEP 4: Append tail if not in route
    const workSeqLower = workSeq.map(x => x.toLowerCase())
    let endDate = ymdToDate(planned[workSeq[workSeq.length-1]])!
    for (const c of TAIL) {
      if (workSeqLower.includes(c.toLowerCase())) continue
      endDate = addPD(endDate, dayMap[c]||1, holidaySet, true)
      planned[c] = fitDate(c, dateToYMD(endDate), qty)
      endDate = ymdToDate(planned[c]) || endDate
    }

    // Write to row.dates
    for (const [c, ymd] of Object.entries(planned)) { if (ymd) row.dates[c] = ymd }
    for (const c of TAIL) { if (planned[c]) row.dates[c] = planned[c] }

    row.dcGeneratedOnce = true
    row.dcRegenerate    = false
    generated++
  }

  return { generated, pushed, skipped }
}

// ── Page Component ────────────────────────────────────────────────────────────
export default function DateCalculatorPage() {
  const [rows,           setRows]           = useState<BatchRow[]>([])
  const [processes,      setProcesses]      = useState<ProcessDef[]>([])  // from Process Master
  const [holidays,       setHolidays]       = useState<any[]>([])
  const [selectedBatches,setSelectedBatches]= useState<Set<string>>(new Set())
  const [showPDModal,    setShowPDModal]    = useState(false)
  const [tempProcs,      setTempProcs]      = useState<ProcessDef[]>([])
  const [saveStatus,     setSaveStatus]     = useState<'idle'|'saving'|'saved'>('idle')
  const [loadStatus,     setLoadStatus]     = useState<'loading'|'ready'|'error'>('loading')
  const pendingSaves = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  // Machine process types (these show anchor dates)
  const ANCHOR_PROC_CODES = ['S','D','S2','Add','Level','Fix','Wash','Rc']

  // Build dayMap and capMap from process definitions
  const buildMaps = (procs: ProcessDef[]) => {
    const dayMap: Record<string,number> = {}
    const capMap: Record<string,number> = {}
    for (const p of procs) {
      dayMap[p.code] = (p.days && p.days > 0) ? p.days : (p.default_days > 0 ? p.default_days : 1)
      if (p.capacity && p.capacity > 0) capMap[p.code] = p.capacity
    }
    return { dayMap, capMap }
  }

  // ── Load data ───────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoadStatus('loading')
    try {
      const [oRes, bRes, dpRes, hRes, procRes, settingsRes] = await Promise.all([
        fetch('/api/orders?limit=2000',   { cache:'no-store' }).then(r=>r.json()),
        fetch('/api/batches?limit=10000', { cache:'no-store' }).then(r=>r.json()),
        fetch('/api/date-plans',          { cache:'no-store' }).then(r=>r.json()),
        fetch('/api/setup/holidays',      { cache:'no-store' }).then(r=>r.json()).catch(()=>({data:[]})),
        fetch('/api/processes',           { cache:'no-store' }).then(r=>r.json()),
        fetch('/api/setup/settings?key=processDurations', { cache:'no-store' }).then(r=>r.json()).catch(()=>({value:[]})),
      ])

      setHolidays(hRes.data || [])

      // Build process list from Process Master, merge user-saved days/capacity
      const savedDurations: any[] = settingsRes.value || []
      const savedMap: Record<string, any> = {}
      for (const s of savedDurations) savedMap[s.code] = s

      const procList: ProcessDef[] = (procRes.data || [])
        .filter((p: any) => p.is_enabled)
        .map((p: any) => ({
          code:          p.code,
          name:          p.name,
          display_order: p.display_order,
          default_days:  p.default_days || 1,
          is_enabled:    p.is_enabled,
          is_anchor:     ANCHOR_PROC_CODES.includes(p.code),
          days:          savedMap[p.code]?.days     || p.default_days || 1,
          capacity:      savedMap[p.code]?.capacity || undefined,
        }))

      setProcesses(procList)

      // Build rows
      const orders:    any[] = oRes.data  || []
      const batches:   any[] = bRes.data  || []
      const datePlans: any[] = dpRes.data || []

      const orderMap: Record<string,any> = {}
      for (const o of orders) orderMap[o.id] = o
      const dpMap: Record<string,any> = {}
      for (const dp of datePlans) dpMap[dp.batch_id] = dp

      const batchRows: BatchRow[] = []
      for (const b of batches) {
        const o  = orderMap[b.order_id] || {}
        const dp = dpMap[b.id] || {}

        // Dates from JSONB column (new) — merge with legacy d_* fixed columns
        const datesJSONB: Record<string,string> = dp.dates || {}
        // Legacy fixed column map for migration
        const LEGACY_MAP: Record<string,string> = {
          C:'d_c',S:'d_s',H:'d_h',D:'d_d',S2:'d_s2',Rx:'d_rx',O:'d_o',
          G:'d_g',F:'d_f',Co:'d_co',Tu:'d_tu',Add:'d_add',Level:'d_level',
          Rc:'d_rc',Fix:'d_fix',Wash:'d_wash',Dry:'d_dry',B:'d_b',R:'d_r',
          K:'d_k',QA:'d_qa',Packing:'d_packing',Dispatch:'d_dispatch',FinalDispatch:'d_finaldispatch'
        }
        const dates: Record<string,string> = { ...datesJSONB }
        // Fill from legacy d_* columns only where JSONB is empty
        for (const [proc, col] of Object.entries(LEGACY_MAP)) {
          if (!dates[proc] && dp[col]) dates[proc] = dp[col].slice(0,10)
        }
        const anchors: Record<string,string> = dp.anchors || {}

        batchRows.push({
          batchId:         b.batch_id || b.id,
          batchUUID:       b.id,
          kg:              parseFloat(b.kg) || 0,
          color:           o.color        || '',
          orderNumber:     o.order_number || '',
          route:           b.process_route || o.process_route || [],
          machine:         o.machines?.name || '',
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
          action:            'upsert',
          batch_id:          row.batchUUID,
          batch_id_str:      row.batchId,
          dates:             row.dates,
          anchors:           row.anchors,
          dc_generated_once: row.dcGeneratedOnce,
          dc_regenerate:     row.dcRegenerate,
          pushed:            row.pushed,
        })
      }).catch(() => {})
      delete pendingSaves.current[key]
    }, 400)
  }, [])

  const handleDateChange = (rowIdx: number, proc: string, value: string) => {
    setRows(prev => {
      const updated = [...prev]
      const row = { ...updated[rowIdx], dates: { ...updated[rowIdx].dates } }
      row.dates[proc] = fromDisplay(value) || value
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
    const { dayMap, capMap } = buildMaps(processes)
    const holidaySet  = buildHolidaySet(holidays)
    const todayYMD    = new Date().toISOString().slice(0,10)
    const allProcCodes = processes.map(p => p.code)

    const workRows = rows.map(r => ({ ...r, dates: { ...r.dates }, anchors: { ...r.anchors } }))
    const result = runEngine(workRows, dayMap, capMap, holidaySet, todayYMD, allProcCodes)
    setRows(workRows)

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

    await savePlannedDatesToOrders(workRows, false)
    setSaveStatus('saved')
    setTimeout(() => setSaveStatus('idle'), 3000)
    alert(`✓ Done!\nGenerated: ${result.generated} · Pushed: ${result.pushed} · Skipped: ${result.skipped}`)
  }

  // ── Save to orders ──────────────────────────────────────────────────────────
  const savePlannedDatesToOrders = async (sourceRows = rows, showAlert = true) => {
    setSaveStatus('saving')
    try {
      const orderMap: Record<string, string> = {}
      const orderPlanMap: Record<string, Record<string,string>> = {}
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
      const res  = await fetch('/api/orders', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ action:'update_planned_dates', updates }) })
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

    const selectedRows = rows.filter(r => selectedBatches.has(r.batchId))
    let cleared = 0

    await Promise.all(selectedRows.map(async row => {
      // Clear dates in batch_date_plans (keep anchors)
      await fetch('/api/date-plans', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ action:'clear', batch_id: row.batchUUID })
      }).catch(() => {})

      // Also reset dc flags on batch
      await fetch('/api/batches', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ action:'update', id: row.batchUUID, dc_generated_once: false, dc_regenerate: false })
      }).catch(() => {})

      cleared++
    }))

    setSelectedBatches(new Set())
    await loadData()
    alert(`✓ Cleared Date Calculator dates for ${cleared} batch(es). Machine anchor dates preserved.`)
  }

  // ── Process Days modal — dynamic from Process Master ──────────────────────
  const openProcessDaysModal = () => {
    setTempProcs(processes.map(p => ({ ...p })))
    setShowPDModal(true)
  }

  const saveProcessDays = async () => {
    setProcesses(tempProcs)
    // Save user overrides to settings
    const durations = tempProcs.map(p => ({
      code:     p.code,
      name:     p.name,
      days:     p.days || p.default_days || 1,
      capacity: p.capacity,
    }))
    await fetch('/api/setup/settings', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ key:'processDurations', value: durations })
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
              Supabase · {rows.length} batches · {processes.length} processes
            </span>
          </span>
          <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
            <button className="small success" onClick={generateDates}>⚙ Generate Dates</button>
            <button className="small"
              style={{ background: saveStatus==='saved'?'#1D9E75':'var(--accent)', color:'#fff', border:'none', fontWeight:600 }}
              onClick={() => savePlannedDatesToOrders(rows, true)}>
              {saveStatus==='saving'?'⏳ Saving…':saveStatus==='saved'?'✓ Saved':'⬇ Save to Orders'}
            </button>
            <button className="small primary" onClick={openProcessDaysModal}>⚙ Process Days</button>
            <button className="small"
              style={{ background: selectedBatches.size>0?'#DC2626':'#E5E7EB', color: selectedBatches.size>0?'white':'#9CA3AF', border:'none' }}
              onClick={handleClearSelected}>
              Clear Selected ({selectedBatches.size})
            </button>
            <button className="small" onClick={loadData}>↻ Refresh</button>
          </div>
        </div>

        <div style={{ fontSize:11, color:'var(--text-tertiary)', padding:'3px 16px', flexShrink:0, background:'var(--bg-secondary)' }}>
          Columns auto-sync with Process Master · Anchor dates (machine) shown in blue · Generated dates in green
        </div>

        {/* Table */}
        {rows.length === 0 ? (
          <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:12, color:'var(--text-tertiary)' }}>
            <div style={{ fontSize:40 }}>📅</div>
            <div style={{ fontSize:15, fontWeight:600 }}>No batches found</div>
            <button className="small" onClick={loadData}>↻ Refresh</button>
          </div>
        ) : (
          <div style={{ flex:1, overflowX:'auto', overflowY:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
              <thead>
                <tr style={{ background:'#F9FAFB', position:'sticky', top:0, zIndex:10 }}>
                  <th style={TH}>
                    <input type="checkbox"
                      checked={rows.length > 0 && rows.every(r => selectedBatches.has(r.batchId))}
                      onChange={e => {
                        if (e.target.checked) setSelectedBatches(new Set(rows.map(r => r.batchId)))
                        else setSelectedBatches(new Set())
                      }}
                      style={{ cursor:'pointer' }} />
                  </th>
                  <th style={TH}>COLOUR</th>
                  <th style={TH}>BATCH</th>
                  <th style={TH}>QTY(KG)</th>
                  <th style={TH}>ROUTE</th>
                  <th style={TH}>MACHINE</th>
                  <th style={TH}>DATE (Anchors)</th>
                  {/* Dynamic columns from Process Master */}
                  {processes.map(p => (
                    <th key={p.code} style={{
                      ...TH,
                      background: p.is_anchor ? '#DBEAFE' : '#F9FAFB',
                      color:      p.is_anchor ? '#1D4ED8' : '#6B7280',
                    }}
                    title={`${p.name} · ${p.days || p.default_days}d${p.capacity ? ` · ${p.capacity}kg/day` : ''}`}>
                      {p.code}
                    </th>
                  ))}
                  <th style={TH}>STATUS</th>
                  <th style={TH}>RE-GEN</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => {
                  const routeDisplay   = row.route.join('/')
                  const anchorSummary  = Object.entries(row.anchors)
                    .filter(([,v]) => v)
                    .map(([k,v]) => `${k}:${toDisplay(v)}`)
                    .join(' / ')

                  return (
                    <tr key={row.batchId} style={{ borderBottom:'1px solid #E5E7EB', background: row.pushed?'#FFFBEB':'' }}>
                      <td style={{ ...TD, textAlign:'center' }}>
                        <input type="checkbox"
                          checked={selectedBatches.has(row.batchId)}
                          onChange={e => setSelectedBatches(prev => {
                            const s = new Set(prev)
                            e.target.checked ? s.add(row.batchId) : s.delete(row.batchId)
                            return s
                          })}
                          style={{ cursor:'pointer' }} />
                      </td>
                      <td style={TD}>{row.color||'-'}</td>
                      <td style={{ ...TD, fontWeight:700, color:'#2563EB' }}>{row.batchId}</td>
                      <td style={{ ...TD, fontWeight:700 }}>{row.kg||'-'}</td>
                      <td style={{ ...TD, color:'#2563EB', fontWeight:600, fontSize:11 }}>{routeDisplay||'-'}</td>
                      <td style={TD}>{row.machine||'-'}</td>
                      <td style={{ ...TD, fontSize:10, color:'#6B7280' }}>{anchorSummary||'-'}</td>

                      {/* Dynamic date cells — one per process from Process Master */}
                      {processes.map(p => {
                        const ymd     = row.dates[p.code] || ''
                        const display = ymd ? toDisplay(ymd) : ''
                        const isAnchor = p.is_anchor
                        return (
                          <td key={p.code} style={{
                            padding: 0, borderRight:'1px solid #E5E7EB',
                            background: display
                              ? (isAnchor ? '#DBEAFE' : '#F0FDF4')
                              : ''
                          }}>
                            <input
                              type="text"
                              value={display}
                              onChange={e => handleDateChange(idx, p.code, e.target.value)}
                              placeholder="-"
                              style={{
                                width:'100%', minWidth:90, height:32, border:0,
                                background:'transparent', padding:'2px 6px',
                                fontSize:11, textAlign:'center', outline:'none'
                              }} />
                          </td>
                        )
                      })}

                      <td style={{ ...TD, textAlign:'center' }}>
                        {row.pushed
                          ? <span style={{ fontSize:10, background:'#FEF9C3', color:'#854D0E', padding:'2px 6px', borderRadius:4, fontWeight:700 }}>📅 Pushed</span>
                          : row.dcGeneratedOnce
                          ? <span style={{ fontSize:10, background:'#DCFCE7', color:'#166534', padding:'2px 6px', borderRadius:4, fontWeight:700 }}>✓ Done</span>
                          : <span style={{ fontSize:10, background:'#FEE2E2', color:'#991B1B', padding:'2px 6px', borderRadius:4, fontWeight:700 }}>Pending</span>}
                      </td>
                      <td style={{ ...TD, textAlign:'center' }}>
                        <input type="checkbox"
                          checked={row.dcRegenerate||false}
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

      {/* Process Days Modal — dynamic from Process Master */}
      {showPDModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }}
          onClick={() => setShowPDModal(false)}>
          <div style={{ background:'white', borderRadius:8, padding:24, maxWidth:640, width:'90%', maxHeight:'85vh', overflow:'auto' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
              <h3 style={{ margin:0, fontSize:16, fontWeight:700 }}>Process Days & Capacity</h3>
              <button onClick={() => setShowPDModal(false)} style={{ border:'none', background:'none', fontSize:20, cursor:'pointer' }}>✕</button>
            </div>
            <div style={{ padding:'10px 14px', background:'#EFF6FF', borderRadius:8, fontSize:12, color:'#1D4ED8', marginBottom:16 }}>
              💡 Columns come from <strong>Process Master</strong>. Add/remove processes there to update columns here.<br/>
              <strong>Days</strong> = how long this process takes · <strong>Capacity</strong> = max kg/day (blank = no limit)
            </div>
            <div style={{ maxHeight:'55vh', overflow:'auto', marginBottom:16 }}>
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead>
                  <tr style={{ background:'#F9FAFB', borderBottom:'2px solid #E5E7EB' }}>
                    {['#','Code','Name','Days','Capacity (kg/day)'].map(h => (
                      <th key={h} style={{ padding:'8px 10px', textAlign:'left', fontSize:11, fontWeight:700, color:'#6B7280' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tempProcs.map((p, i) => (
                    <tr key={p.code} style={{ borderBottom:'1px solid #E5E7EB', background: p.is_anchor ? '#EFF6FF' : '' }}>
                      <td style={{ padding:'8px 10px', fontSize:11, color:'#9CA3AF' }}>{i+1}</td>
                      <td style={{ padding:'8px 10px', fontWeight:700, color: p.is_anchor ? '#1D4ED8' : '#2563EB' }}>{p.code}</td>
                      <td style={{ padding:'8px 10px', color:'#6B7280' }}>{p.name}</td>
                      <td style={{ padding:'8px 10px' }}>
                        <input type="number" min="1" step="1"
                          value={p.days || p.default_days || 1}
                          onChange={e => setTempProcs(prev => prev.map((x, j) => j === i
                            ? { ...x, days: parseInt(e.target.value) || 1 } : x))}
                          style={{ width:70, padding:'4px 6px', border:'1px solid #D1D5DB', borderRadius:4 }} />
                      </td>
                      <td style={{ padding:'8px 10px' }}>
                        <input type="number" min="0" step="100"
                          value={p.capacity || ''}
                          onChange={e => setTempProcs(prev => prev.map((x, j) => j === i
                            ? { ...x, capacity: e.target.value ? parseFloat(e.target.value) : undefined } : x))}
                          style={{ width:120, padding:'4px 6px', border:'1px solid #BFDBFE', borderRadius:4, background:'#EFF6FF' }}
                          placeholder="e.g. 1000" />
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
