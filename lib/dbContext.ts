/**
 * Builds a structured, compact context string from dyeflow_db
 * for sending to the AI. Keeps token count under 8,000 for free-tier APIs.
 */

export interface DbContext {
  summary: string       // short stats line
  full: string          // full context for AI
  orderCount: number
  batchCount: number
}

function formatDate(str: string): string {
  if (!str) return '-'
  try {
    const d = new Date(str)
    if (isNaN(d.getTime())) return str
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch { return str }
}

function today(): string {
  return new Date().toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
}

// Match a batch/order machine reference (name or id) against a machine object
// Orders store machine as name (e.g. "Long Tube Jet No. 30") OR as id
// This handles both cases so load calculation is always correct
function machineMatches(batchMachine: string, m: any): boolean {
  if (!batchMachine) return false
  const bm = batchMachine.toLowerCase().trim()
  const mid  = (m.id   || '').toLowerCase().trim()
  const mname = (m.name || '').toLowerCase().trim()
  return bm === mid || bm === mname || mname.includes(bm) || bm.includes(mname)
}

export function buildDbContext(): DbContext {
  if (typeof window === 'undefined') return { summary: '', full: '', orderCount: 0, batchCount: 0 }

  const raw = localStorage.getItem('dyeflow_db')
  if (!raw) return { summary: 'No database found.', full: 'The DyeFlow database is empty.', orderCount: 0, batchCount: 0 }

  const db = JSON.parse(raw)
  const orders: any[]       = db.orders || []
  const machines: any[]     = db.machines || []
  const supervisors: any[]  = db.supervisors || []
  const faultyRecords: any[] = db.faultyRecords || []
  const processList: any[]  = db.processList || []

  const allBatches = orders.flatMap(o =>
    (o.splits || []).map((b: any) => ({
      ...b,
      orderNo: o.orderNumber,
      supervisor: o.supervisor,
      // Resolve machine: batch-level takes priority, fall back to order-level
      resolvedMachine: b.machine || o.machine || ''
    }))
  )
  const now = new Date()

  // ── STATUS COUNTS ─────────────────────────────────────────────────────────
  const statusGroups: Record<string, number> = {}
  orders.forEach(o => {
    const s = o.status || 'new'
    statusGroups[s] = (statusGroups[s] || 0) + 1
  })

  // ── OVERDUE ───────────────────────────────────────────────────────────────
  const overdueOrders = orders.filter(o => {
    if (['done', 'new'].includes(o.status)) return false
    const planned = o.plannedDates?.['Dispatch'] || o.plannedDates?.['Qa'] || ''
    if (!planned) return false
    const d = new Date(planned)
    return !isNaN(d.getTime()) && d < now
  })

  // ── ACTIVE ORDERS ONLY — max 50, most urgent first ────────────────────────
  // Done orders excluded from the list (just counted). Keeps tokens low.
  const activeOrders = orders
    .filter(o => o.status !== 'done')
    .sort((a, b) => {
      const aDate = a.plannedDates?.['Dispatch'] || '9999'
      const bDate = b.plannedDates?.['Dispatch'] || '9999'
      return aDate.localeCompare(bDate)
    })
    .slice(0, 50)

  const orderLines = activeOrders.map(o => {
    const route   = (o.processRoute || []).join('→') || '?'
    const batches = o.splits || []
    const batchStr = batches.length > 0
      ? batches.map((b: any) =>
          `${b.batchId}(${b.kg}kg${b.fmsCurrentProcess ? ',' + b.fmsCurrentProcess : ''})`
        ).join(' ')
      : 'not split'
    const faulty = batches.filter((b: any) => b.fmsFaulty?.active).length
    return `  ${o.orderNumber}:${o.party}|${o.article}|${o.color}|${o.qtyKg}kg|${o.status}|sup:${o.supervisor || '-'}|machine:${o.machine || '-'}|${route}|[${batchStr}]${faulty > 0 ? '|FAULTY:' + faulty : ''}`
  })

  // ── MACHINES ──────────────────────────────────────────────────────────────
  const machineLines = machines.map(m => {
    const mBatches = allBatches.filter((b: any) => machineMatches(b.resolvedMachine, m))
    const activeBatches = mBatches.filter((b: any) => !b.fmsDone && b.status !== 'done')
    const loadedKg = activeBatches.reduce((s: number, b: any) => s + (parseFloat(b.kg) || 0), 0)
    const pct = m.capacity ? Math.round((loadedKg / m.capacity) * 100) : 0

    // ── BOOKED TILL = the LATEST planned date on this machine (last order to finish)
    // Sort all dispatch dates ascending, take the LAST one = machine is free after that
    const machineOrders = orders.filter(o =>
      machineMatches(o.machine || '', m) && o.status !== 'done'
    )

    // Collect ALL planned dates (any process) per order — use the very last one
    // which represents when the last batch leaves this machine
    const allPlannedDatesOnMachine: string[] = []
    machineOrders.forEach(o => {
      // Get all planned dates for this order
      const plannedDates = o.plannedDates || {}
      const dates = Object.values(plannedDates).filter((d: any) => typeof d === 'string' && d)
      dates.forEach((d: any) => allPlannedDatesOnMachine.push(d))
      // Also check splits for their planned dates
      ;(o.splits || []).forEach((b: any) => {
        if (b.plannedDate) allPlannedDatesOnMachine.push(b.plannedDate)
      })
    })

    // Sort ascending — last element = latest date = machine booked till this date
    const sortedDates = allPlannedDatesOnMachine
      .filter(Boolean)
      .map(d => d.trim())
      .filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d))  // only valid YYYY-MM-DD
      .sort()  // lexicographic sort works correctly for YYYY-MM-DD

    const bookedTill = sortedDates.length > 0 ? sortedDates[sortedDates.length - 1] : null
    const bookedTillFmt = bookedTill
      ? new Date(bookedTill + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
      : 'no planned dates set'

    // List orders on this machine with their dispatch date
    const batchDetail = machineOrders
      .sort((a, b) => {
        const da = a.plannedDates?.['Dispatch'] || a.plannedDates?.['FinalDispatch'] || '9999'
        const db2 = b.plannedDates?.['Dispatch'] || b.plannedDates?.['FinalDispatch'] || '9999'
        return da.localeCompare(db2)
      })
      .slice(0, 10)
      .map(o => {
        const d = o.plannedDates?.['Dispatch'] || o.plannedDates?.['FinalDispatch'] || ''
        const dFmt = d ? new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : 'no date'
        return `${o.orderNumber}(${o.party},${o.qtyKg}kg,dispatch:${dFmt})`
      }).join(' ')

    return `  ${m.name || m.id}: cap:${m.capacity}kg loaded:${Math.round(loadedKg)}kg(${pct}%) active_batches:${activeBatches.length} BOOKED_TILL:${bookedTillFmt} orders_on_machine:[${batchDetail || 'none'}]`
  })

  // ── SUPERVISORS ───────────────────────────────────────────────────────────
  const supervisorLines = supervisors.map((s: any) => {
    const sOrders = orders.filter(o =>
      (o.supervisor || '').toLowerCase() === (s.name || '').toLowerCase()
    )
    const inbox  = sOrders.filter(o => o.status === 'assigned').length
    const active = sOrders.filter(o => ['splitting', 'in-process'].includes(o.status)).length
    const done   = sOrders.filter(o => o.status === 'done').length
    return `  ${s.name}: inbox:${inbox} active:${active} done:${done} total:${sOrders.length}`
  })

  // ── OPEN FAULTY — max 10 ──────────────────────────────────────────────────
  const openFaulty = faultyRecords.filter((r: any) => r.status === 'open')
  const faultyLines = openFaulty.slice(0, 10).map((r: any) =>
    `  ${r.batchId}|${r.orderNo}|${r.party}|${r.faultyType || '?'}`
  )

  // ── PROCESS LIST ──────────────────────────────────────────────────────────
  const processLine = processList
    .filter(p => p.enabled)
    .sort((a, b) => a.order - b.order)
    .map(p => `${p.code}(${p.name})`).join(', ')

  // ── ASSEMBLE — compact, target under 8,000 tokens ─────────────────────────
  const totalActive = orders.filter(o => o.status !== 'done').length

  const full = `TODAY: ${today()}
=== DYEFLOW FACTORY ERP ===
STATS: orders:${orders.length}(done:${statusGroups['done'] || 0} active:${totalActive}) batches:${allBatches.length} faulty:${openFaulty.length}open overdue:${overdueOrders.length}
STATUS: ${Object.entries(statusGroups).map(([s, n]) => `${s}:${n}`).join(' ')}
PROCESSES: ${processLine || 'none'}

MACHINES(${machines.length}):
${machineLines.join('\n') || '  none'}

SUPERVISORS(${supervisors.length}):
${supervisorLines.join('\n') || '  none'}

OPEN FAULTY(${openFaulty.length}):
${faultyLines.join('\n') || '  none'}
${overdueOrders.length > 0 ? `\nOVERDUE(${overdueOrders.length}): ${overdueOrders.slice(0, 15).map(o => o.orderNumber).join(', ')}` : ''}
ACTIVE ORDERS(${totalActive} total, showing ${activeOrders.length} most urgent):
${orderLines.join('\n') || '  none'}`.trim()

  const summary = `${orders.length} orders · ${allBatches.length} batches · ${machines.length} machines · ${openFaulty.length} open faulty · ${overdueOrders.length} overdue`
  return { summary, full, orderCount: orders.length, batchCount: allBatches.length }
}

/**
 * Build context specifically for delay prediction.
 * Returns orders with planned dates and current batch positions.
 */
export function buildDelayContext(): string {
  const raw = localStorage.getItem('dyeflow_db')
  if (!raw) return 'No data.'
  const db = JSON.parse(raw)
  const orders: any[] = db.orders || []
  const now = new Date()

  const lines: string[] = []

  orders
    .filter(o => !['done', 'new', 'hold'].includes(o.status))
    .forEach(o => {
      const batches = o.splits || []
      const route = o.processRoute || []
      const dispatchDate = o.plannedDates?.['Dispatch'] || o.plannedDates?.['Qa'] || ''
      const daysLeft = dispatchDate ? Math.round((new Date(dispatchDate).getTime() - now.getTime()) / 86400000) : null
      const remainingProcesses = batches.map((b: any) => {
        const cur = b.fmsCurrentProcess || route[0] || ''
        const curIdx = route.indexOf(cur)
        return curIdx >= 0 ? route.slice(curIdx) : route
      })
      const maxRemaining = Math.max(...remainingProcesses.map((r: string[]) => r.length), 0)

      lines.push(
        `${o.orderNumber}|party:${o.party}|article:${o.article}|status:${o.status}` +
        `|daysUntilDispatch:${daysLeft !== null ? daysLeft : 'no planned date'}` +
        `|remainingProcesses:${maxRemaining}|estimatedDaysNeeded:~${maxRemaining}` +
        `|batchCount:${batches.length}|route:${route.join('→')}` +
        `|currentProcesses:${batches.map((b: any) => b.fmsCurrentProcess || 'pending').join(',')}`
      )
    })

  return `TODAY: ${now.toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}

ACTIVE ORDERS WITH PLANNED DATES:
${lines.join('\n') || '(no active orders with planned dates)'}`
}

/**
 * Build context for customer query responder.
 * Returns all orders for a specific party/customer.
 */
export function buildCustomerContext(query: string): string {
  const raw = localStorage.getItem('dyeflow_db')
  if (!raw) return 'No data.'
  const db = JSON.parse(raw)
  const orders: any[] = db.orders || []
  const q = query.toLowerCase().trim()

  const matched = orders.filter(o =>
    (o.orderNumber || '').toLowerCase().includes(q) ||
    (o.party || '').toLowerCase().includes(q) ||
    (o.challanNo || '').toLowerCase().includes(q)
  )

  if (matched.length === 0) return `No orders found matching "${query}".`

  const lines = matched.map(o => {
    const batches = o.splits || []
    const activeBatch = batches.find((b: any) => b.status === 'in-process')
    const currentProcess = activeBatch?.fmsCurrentProcess || 'not started'
    const doneCount = batches.filter((b: any) => b.status === 'done').length
    const dispatchDate = o.plannedDates?.['Dispatch'] || ''
    return [
      `Order: ${o.orderNumber}`,
      `Party: ${o.party}`,
      `Article: ${o.article} | Color: ${o.color} | Qty: ${o.qtyKg} Kg`,
      `Status: ${o.status}`,
      `Current process: ${currentProcess}`,
      `Batches: ${batches.length} total, ${doneCount} done`,
      `Planned dispatch: ${dispatchDate || 'not set'}`,
      `Supervisor: ${o.supervisor || 'unassigned'}`,
    ].join('\n')
  }).join('\n\n---\n\n')

  return `MATCHING ORDERS:\n\n${lines}`
}

/**
 * Build context for the Actions Agent.
 */
export function buildActionsContext(): string {
  const raw = localStorage.getItem('dyeflow_db')
  if (!raw) return 'No data.'
  const db = JSON.parse(raw)
  const orders: any[] = db.orders || []
  const supervisors: any[] = db.supervisors || []
  const machines: any[] = db.machines || []

  const orderList = orders.slice(0, 50).map(o =>
    `${o.orderNumber}(party:${o.party},status:${o.status},supervisor:${o.supervisor || 'none'},machine:${o.machine || 'none'})`
  ).join(', ')

  const supervisorNames = supervisors.map((s: any) => s.name).join(', ')
  const machineNames = machines.map((m: any) => `${m.name}(id:${m.id})`).join(', ')

  return `ORDERS (first 50): ${orderList}

VALID SUPERVISORS: ${supervisorNames}
VALID MACHINES: ${machineNames}
VALID STATUSES: new, assigned, splitting, in-process, done, hold

WRITABLE FIELDS PER ORDER: status, supervisor, holdReason, remarks, holdApproval`
}

/**
 * Build rich context for the Production Scheduler.
 */
export function buildSchedulerContext(): string {
  const raw = localStorage.getItem('dyeflow_db')
  if (!raw) return 'No data.'
  const db = JSON.parse(raw)
  const orders: any[] = db.orders || []
  const machines: any[] = db.machines || []
  const now = new Date()

  const shadeGroup = (color: string): string => {
    const c = (color || '').toLowerCase()
    if (c.includes('white') || c.includes('bleach') || c.includes('optical')) return 'White'
    if (c.includes('light') || c.includes('pale') || c.includes('cream') || c.includes('pastel') || c.includes('yellow') || c.includes('pink')) return 'Light'
    if (c.includes('dark') || c.includes('black') || c.includes('navy') || c.includes('deep') || c.includes('charcoal')) return 'Dark'
    return 'Medium'
  }

  const allBatches = orders.flatMap(o =>
    (o.splits || []).map((b: any) => {
      const dispatchDate = o.plannedDates?.['Dispatch'] || ''
      const daysLeft = dispatchDate
        ? Math.round((new Date(dispatchDate).getTime() - now.getTime()) / 86400000)
        : null
      return {
        batchId: b.batchId || '-',
        orderNo: o.orderNumber || '-',
        party: o.party || '-',
        article: o.article || '-',
        color: o.color || '-',
        shade: shadeGroup(o.color || ''),
        kg: parseFloat(b.kg || o.qtyKg || '0'),
        machine: b.machine || o.machine || '',
        supervisor: o.supervisor || 'unassigned',
        processRoute: (o.processRoute || []).join('→'),
        currentProcess: b.fmsCurrentProcess || 'pending',
        isDone: b.fmsDone || b.status === 'done',
        isFaulty: !!(b.fmsFaulty?.active),
        dispatchDate,
        daysLeft,
        isOverdue: daysLeft !== null && daysLeft < 0,
        orderPriority: typeof o.priority === 'number' ? o.priority : null,
      }
    })
  ).filter(b => !b.isDone)

  const unassignedOrders = orders
    .filter(o => !o.machine && o.status !== 'done' && (o.splits || []).length === 0)
    .map(o => {
      const dispatchDate = o.plannedDates?.['Dispatch'] || ''
      const daysLeft = dispatchDate
        ? Math.round((new Date(dispatchDate).getTime() - now.getTime()) / 86400000)
        : null
      return `${o.orderNumber}|party:${o.party}|${o.article}|${o.color}(${shadeGroup(o.color)})|${o.qtyKg}kg|${o.status}|daysLeft:${daysLeft ?? 'no date'}|sup:${o.supervisor || '-'}`
    })

  const machineBlocks = machines.map(m => {
    const mBatches = allBatches.filter(b => machineMatches(b.machine, m))
    const loadKg = mBatches.reduce((s, b) => s + b.kg, 0)
    const pct = m.capacity ? Math.min(100, Math.round((loadKg / m.capacity) * 100)) : 0

    const sorted = [...mBatches].sort((a, b) => {
      const aPri = typeof a.orderPriority === 'number' ? a.orderPriority : Infinity
      const bPri = typeof b.orderPriority === 'number' ? b.orderPriority : Infinity
      if (aPri !== bPri) return aPri - bPri
      if (a.isOverdue && !b.isOverdue) return -1
      if (!a.isOverdue && b.isOverdue) return 1
      if (a.daysLeft !== null && b.daysLeft !== null) return a.daysLeft - b.daysLeft
      return 0
    })

    const batchLines = sorted.map(b =>
      `  - ${b.batchId}|${b.orderNo}|${b.party}|${b.article}|${b.color}(${b.shade})|${b.kg}kg` +
      `|${b.currentProcess}|dispatch:${b.dispatchDate || 'no date'}|daysLeft:${b.daysLeft ?? '?'}${b.isOverdue ? '⚠OVERDUE' : ''}` +
      `|sup:${b.supervisor}${b.isFaulty ? '|⚠FAULTY' : ''}`
    ).join('\n')

    return `MACHINE: ${m.name} (cap:${m.capacity}kg loaded:${Math.round(loadKg)}kg ${pct}% ${m.status || 'idle'})\n${batchLines || '  (none)'}`
  }).join('\n\n')

  return `TODAY: ${now.toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}

=== MACHINE WORK ===
${machineBlocks}

=== UNASSIGNED (${unassignedOrders.length}) ===
${unassignedOrders.join('\n') || '(none)'}

SUMMARY: active_batches:${allBatches.length} overdue:${allBatches.filter(b => b.isOverdue).length} faulty:${allBatches.filter(b => b.isFaulty).length} machines:${machines.length}`
}

/**
 * Build a compact context for the Order Assignment feature.
 */
export function buildAssignmentContext(): string {
  const raw = localStorage.getItem('dyeflow_db')
  if (!raw) return 'No data.'
  const db = JSON.parse(raw)
  const orders: any[] = db.orders || []
  const machines: any[] = db.machines || []
  const supervisors: any[] = db.supervisors || []
  // Resolve machine at order+batch level
  const allBatches = orders.flatMap(o =>
    (o.splits || []).map((b: any) => ({ ...b, resolvedMachine: b.machine || o.machine || '' }))
  )

  const machineInfo = machines.map(m => {
    const mBatches = allBatches.filter(b => machineMatches(b.resolvedMachine, m) && b.status !== 'done')
    const loadedKg = mBatches.reduce((s: number, b: any) => s + (parseFloat(b.kg) || 0), 0)
    const pct = m.capacity ? Math.round((loadedKg / m.capacity) * 100) : 0
    return `${m.name || m.id}: cap=${m.capacity}kg loaded=${Math.round(loadedKg)}kg(${pct}%) batches=${mBatches.length} status=${m.status || 'idle'}`
  }).join('\n')

  const supervisorInfo = supervisors.map((s: any) => {
    const sOrders = orders.filter(o =>
      (o.supervisor || '').toLowerCase() === (s.name || '').toLowerCase()
    )
    const inbox  = sOrders.filter(o => o.status === 'assigned').length
    const active = sOrders.filter(o => ['splitting', 'in-process'].includes(o.status)).length
    const articles = [...new Set(sOrders.map(o => o.article).filter(Boolean))].join(', ') || 'none'
    return `${s.name}: inbox=${inbox} active=${active} total=${sOrders.length} articles:${articles}`
  }).join('\n')

  return `MACHINES:\n${machineInfo}\n\nSUPERVISORS:\n${supervisorInfo}`
}

/**
 * Build context for Anomaly Detection.
 */
export interface AnomalyItem {
  batchId: string
  orderNo: string
  party: string
  article: string
  color: string
  processCode: string
  processName: string
  daysStuck: number
  expectedDays: number
  overByDays: number
  supervisor: string
  machine: string
  severity: 'critical' | 'warning' | 'watch'
}

export function buildAnomalyContext(): { anomalies: AnomalyItem[]; contextText: string } {
  if (typeof window === 'undefined') return { anomalies: [], contextText: '' }

  const raw = localStorage.getItem('dyeflow_db')
  if (!raw) return { anomalies: [], contextText: 'No data.' }

  const db = JSON.parse(raw)
  const orders: any[] = db.orders || []
  const processList: any[] = db.processList || []
  const processDurations: any[] = db.processDurations || []
  const now = new Date()

  const expectedDaysMap: Record<string, number> = {}
  processList.forEach((p: any) => { expectedDaysMap[p.code] = p.defaultDays ?? 1 })
  processDurations.forEach((d: any) => { if (d.code && d.days) expectedDaysMap[d.code] = d.days })

  const anomalies: AnomalyItem[] = []

  for (const order of orders) {
    if (['done', 'new', 'hold'].includes(order.status)) continue

    for (const batch of (order.splits || [])) {
      if (batch.fmsDone || batch.status === 'done') continue

      const processCode = batch.fmsCurrentProcess
      if (!processCode) continue

      const route: string[] = order.processRoute || []
      const curIdx = route.indexOf(processCode)
      let enteredAt: Date | null = null

      if (curIdx > 0) {
        const prevCode = route[curIdx - 1]
        const prevActual = batch.fmsActualDates?.[prevCode]
        if (prevActual) enteredAt = new Date(prevActual)
      }
      if (!enteredAt && batch.fmsDispatch?.[processCode]?.sentAt) {
        enteredAt = new Date(batch.fmsDispatch[processCode].sentAt)
      }
      if (!enteredAt) continue

      const daysStuck  = Math.floor((now.getTime() - enteredAt.getTime()) / 86400000)
      const expectedDays = expectedDaysMap[processCode] ?? 1
      const overByDays  = daysStuck - expectedDays

      if (overByDays <= 0) continue

      const processName = processList.find((p: any) => p.code === processCode)?.name || processCode

      let severity: AnomalyItem['severity'] = 'watch'
      if (overByDays >= expectedDays * 2) severity = 'critical'
      else if (overByDays >= expectedDays) severity = 'warning'

      anomalies.push({
        batchId: batch.batchId || '-',
        orderNo: order.orderNumber || '-',
        party: order.party || '-',
        article: order.article || '-',
        color: order.color || '-',
        processCode,
        processName,
        daysStuck,
        expectedDays,
        overByDays,
        supervisor: order.supervisor || 'unassigned',
        machine: batch.machine || order.machine || '-',
        severity,
      })
    }
  }

  anomalies.sort((a, b) => {
    const sOrder = { critical: 0, warning: 1, watch: 2 }
    if (sOrder[a.severity] !== sOrder[b.severity]) return sOrder[a.severity] - sOrder[b.severity]
    return b.overByDays - a.overByDays
  })

  const lines = anomalies.map(a =>
    `${a.batchId}|${a.orderNo}|${a.party}|${a.processName}|stuck:${a.daysStuck}d|expected:${a.expectedDays}d|over:${a.overByDays}d|${a.severity}|sup:${a.supervisor}`
  )

  return {
    anomalies,
    contextText: `ANOMALIES:\n${lines.join('\n') || '(none)'}`,
  }
}

/**
 * Build context for AI Cost Estimation.
 */
export function buildCostContext(): string {
  if (typeof window === 'undefined') return 'No data.'

  const raw = localStorage.getItem('dyeflow_db')
  if (!raw) return 'No data.'

  const db = JSON.parse(raw)
  const orders: any[]         = db.orders || []
  const processList: any[]    = db.processList || []
  const processDurations: any[] = db.processDurations || []
  const machines: any[]       = db.machines || []

  const processRates: Record<string, { days: number; capacity: number }> = {}
  processList.forEach((p: any) => { processRates[p.code] = { days: p.defaultDays ?? 1, capacity: 0 } })
  processDurations.forEach((d: any) => {
    if (!processRates[d.code]) processRates[d.code] = { days: 1, capacity: 0 }
    if (d.days) processRates[d.code].days = d.days
    if (d.capacity) processRates[d.code].capacity = d.capacity
  })

  const machineInfo = machines.map((m: any) =>
    `${m.name}: cap=${m.capacity}kg type=${m.type || 'standard'}`
  ).join(', ')

  const orderLines = orders
    .slice(0, 40)
    .map((o: any) => {
      const route = (o.processRoute || []).join('→')
      const totalDays = (o.processRoute || []).reduce((s: number, code: string) =>
        s + (processRates[code]?.days ?? 1), 0)
      return `${o.orderNumber}|${o.party}|${o.article}|${o.blend || '?'}|${o.color}|${o.qtyKg}kg|route:${route}|totalDays:${totalDays}|${o.status}`
    }).join('\n')

  const processRef = processList.map((p: any) => {
    const dur = processDurations.find((d: any) => d.code === p.code)
    return `${p.code}(${p.name}):${dur?.days ?? p.defaultDays ?? 1}d${dur?.capacity ? ',cap:' + dur.capacity + 'kg/day' : ''}`
  }).join(', ')

  return `MACHINES: ${machineInfo || 'not configured'}
PROCESS DURATIONS: ${processRef || 'defaults 1d each'}

ORDERS FOR COST (up to 40):
${orderLines || '(none)'}

NOTE: Estimate using machine time cost + process complexity + Surat dyeing industry standard rates.`
}
