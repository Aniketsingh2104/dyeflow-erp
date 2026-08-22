const fs   = require('fs')
const path = require('path')
const filePath = path.join('app', 'date-calculator', 'page.tsx')
let c = fs.readFileSync(filePath, 'utf8')

// Replace the dcPlanAllRows function with the exact algorithm from the reference HTML
const OLD_ENGINE = `  // ── The date calculation engine (unchanged from original) ─────────────────
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
  }`

const NEW_ENGINE = `  // ── Date calculation engine — exact match to reference HTML algorithm ──────
  const dcPlanAllRows = (
    workRows: any[],
    dayMap:  Record<string, number>,
    capMap:  Record<string, number>,
    holidaySet: Set<string>,
    externalLoadMap?: Record<string, Record<string,number>>
  ) => {
    const todayYMD = new Date().toISOString().slice(0, 10)

    // ── loadMap: tracks kg committed per process per date ──────────────────
    const loadMap: Record<string, Record<string, number>> = {}

    // Seed from external (Excel pre-existing rows)
    if (externalLoadMap) {
      for (const [proc, dates] of Object.entries(externalLoadMap)) {
        loadMap[proc] = {}
        for (const [ymd, kg] of Object.entries(dates)) {
          loadMap[proc][ymd] = (loadMap[proc][ymd] || 0) + kg
        }
      }
    }

    // Mark each row: go=true means needs generation
    const tasks = workRows.map(r => ({
      ...r,
      go: !(!!r.batch.dcGeneratedOnce && !r.batch.dcRegenerate),
      pushed: false,
    }))

    // Pre-load already-committed (skipped) batches into loadMap
    for (const t of tasks) {
      if (t.go) continue
      const plan = t.batch.dateCalcPlan || {}
      const qty  = parseFloat(String(t.batch.kg)) || t.order.qtyKg || 0
      for (const [code, ds] of Object.entries(plan)) {
        const ymd = toYMD_from_display(ds as string); if (!ymd) continue
        if (!loadMap[code]) loadMap[code] = {}
        loadMap[code][ymd] = (loadMap[code][ymd] || 0) + qty
      }
    }

    // ── Helpers ───────────────────────────────────────────────────────────
    const nextWD = (d: Date, fwd = true): Date => {
      const r = new Date(d)
      const step = fwd ? 1 : -1
      do { r.setDate(r.getDate() + step) } while (holidaySet.has(dateToStr(r)))
      return r
    }

    const addPD = (date: Date, n: number, fwd = true): Date => {
      let d = new Date(date)
      for (let i = 0; i < Math.max(1, n); i++) d = nextWD(d, fwd)
      return d
    }

    // fitDate: find first date >= candidate (skipping holidays) where load + qty <= cap
    // Commits the load. Returns YYYY-MM-DD.
    const fitDate = (proc: string, candidateYMD: string, qty: number): string => {
      if (!candidateYMD) return ''
      let cur = ymdToDate(candidateYMD); if (!cur) return candidateYMD
      // Skip holidays on candidate itself
      while (holidaySet.has(dateToStr(cur))) cur = nextWD(cur, true)
      const cap = capMap[proc]
      if (!cap || qty <= 0) return dateToStr(cur)
      if (!loadMap[proc]) loadMap[proc] = {}
      for (let i = 0; i < 730; i++) {
        const ymd = dateToStr(cur)
        if (holidaySet.has(ymd)) { cur = nextWD(cur, true); continue }
        const existing = loadMap[proc][ymd] || 0
        if (existing + qty <= cap + 0.001) {
          loadMap[proc][ymd] = existing + qty
          return ymd
        }
        cur = nextWD(cur, true)
      }
      return dateToStr(cur)
    }

    const TAIL = ['QA', 'Packing', 'Dispatch']
    const result = { generated: 0, regenerated: 0, skipped: 0 }

    for (const t of tasks) {
      if (!t.go) { result.skipped++; continue }
      const { order, batch } = t
      if (!batch.dateCalcPlan) batch.dateCalcPlan = {}
      const plan = batch.dateCalcPlan
      const qty  = parseFloat(String(batch.kg)) || order.qtyKg || 0

      // Build work sequence from order route
      const routeSeq: string[] = Array.isArray(order.processRoute) ? order.processRoute.filter(Boolean) : []
      const workSeq: string[] = [...new Set(routeSeq)]
        .map((c: string) => ALL_PROCESS_CODES.find(p => p.toLowerCase() === c.toLowerCase()) || c)
        .filter(Boolean)
      if (!workSeq.length) { result.skipped++; continue }

      // Find anchors in route that have dates in plan (YYYY-MM-DD or DD/MM/YYYY)
      const anchorsInRoute: Record<string, string> = {}
      for (const c of workSeq) {
        const ymd = toYMD_from_display(plan[c] || '')
        if (ymd) anchorsInRoute[c] = ymd
      }
      if (!Object.keys(anchorsInRoute).length) { result.skipped++; continue }

      // STEP 1: Pick anchor = latest date among anchors in route
      let anchorProc = '', anchorYMD = ''
      for (const [proc, ymd] of Object.entries(anchorsInRoute)) {
        if (!anchorYMD || ymd > anchorYMD) { anchorYMD = ymd; anchorProc = proc }
      }
      const anchorIdx = workSeq.indexOf(anchorProc)
      if (anchorIdx < 0) { result.skipped++; continue }

      const planned: Record<string, string> = { [anchorProc]: anchorYMD }

      // STEP 2: Walk BACKWARD from anchor (no capacity check — historical estimates)
      let back = ymdToDate(anchorYMD)!
      for (let i = anchorIdx - 1; i >= 0; i--) {
        const c = workSeq[i]
        back = addPD(back, dayMap[c] || 1, false)
        planned[c] = dateToStr(back)
      }

      // STEP 3: Check if first planned date < today
      const firstPlannedYMD = planned[workSeq[0]]
      const useForward = firstPlannedYMD < todayYMD

      if (useForward) {
        // STEP 3A: All in past → recalculate ALL forward from today with capacity check
        let fwd = ymdToDate(todayYMD)!
        for (let i = 0; i < workSeq.length; i++) {
          const c    = workSeq[i]
          const prev = i > 0 ? workSeq[i - 1] : null
          fwd = addPD(fwd, i === 0 ? (dayMap[c] || 1) : (dayMap[prev!] || 1), true)
          planned[c] = fitDate(c, dateToStr(fwd), qty)
          fwd = ymdToDate(planned[c]) || fwd
        }
        t.pushed = true
      } else {
        // STEP 3B: Future anchor → keep backward dates, walk forward from anchor with capacity check
        let fwd = ymdToDate(anchorYMD)!
        for (let i = anchorIdx + 1; i < workSeq.length; i++) {
          const c    = workSeq[i]
          const prev = workSeq[i - 1]
          fwd = addPD(fwd, dayMap[prev] || 1, true)
          planned[c] = fitDate(c, dateToStr(fwd), qty)
          fwd = ymdToDate(planned[c]) || fwd
        }
      }

      // STEP 4: Append tail (QA, Packing, Dispatch) with capacity check
      let endDate = ymdToDate(planned[workSeq[workSeq.length - 1]])!
      for (const c of TAIL) {
        endDate = addPD(endDate, dayMap[c] || 1, true)
        planned[c] = fitDate(c, dateToStr(endDate), qty)
        endDate = ymdToDate(planned[c]) || endDate
      }

      // Write to plan in display format DD/MM/YYYY
      workSeq.forEach(c => { if (planned[c]) plan[c] = toDisplay(planned[c]) })
      TAIL.forEach(c => { if (planned[c]) plan[c] = toDisplay(planned[c]) })

      if (batch.dcGeneratedOnce) result.regenerated++; else result.generated++
      batch.dcGeneratedOnce = true
      batch.dcRegenerate    = false
    }
    return result
  }

  // ── Helper: convert display DD/MM/YYYY or YYYY-MM-DD → YYYY-MM-DD ────────
  const toYMD_from_display = (s: string): string => {
    if (!s) return ''
    if (s.match(/^\\d{4}-\\d{2}-\\d{2}$/)) return s
    if (s.match(/^\\d{2}\\/\\d{2}\\/\\d{4}$/)) {
      const [d, m, y] = s.split('/'); return \`\${y}-\${m}-\${d}\`
    }
    return ''
  }

  // ── Helper: YYYY-MM-DD string → Date object ───────────────────────────────
  const ymdToDate = (s: string): Date | null => {
    if (!s) return null
    const p = s.split('-'); if (p.length !== 3) return null
    const d = new Date(+p[0], +p[1] - 1, +p[2])
    return isNaN(d.getTime()) ? null : d
  }`

if (c.includes(OLD_ENGINE)) {
  c = c.replace(OLD_ENGINE, NEW_ENGINE)
  fs.writeFileSync(filePath, c, 'utf8')
  console.log('✓ dcPlanAllRows replaced with exact reference HTML algorithm')
  console.log('  - Anchor = latest date in route')
  console.log('  - Backward walk: no capacity check (historical estimates)')
  console.log('  - Past detection: if first date < today → push all forward from today')
  console.log('  - Forward walk: with capacity check (fitDate)')
  console.log('  - Tail (QA/Packing/Dispatch) always appended with capacity check')
  console.log('  - PreLoad from committed batches respected')
} else {
  console.error('✗ Engine pattern not found')
}
