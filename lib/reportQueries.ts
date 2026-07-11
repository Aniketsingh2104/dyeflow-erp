// ─────────────────────────────────────────────────────────────────────────────
// DyeFlow Report Query Library
// Pre-written, verified query functions for every report type.
// The AI picks the right function + parameters instead of writing raw code.
//
// PHASE 10: All functions now accept an injected `db` snapshot from Supabase
// instead of calling localStorage directly. getDb() is kept as a fallback.
// ─────────────────────────────────────────────────────────────────────────────

export interface ReportResult {
  title: string
  subtitle?: string
  columns: string[]
  rows: (string | number)[][]
  summary?: string
  totalRows: number
  generatedAt: string
}

export interface DbSnapshot {
  orders:         any[]
  fobRecords:     any[]
  faultyRecords:  any[]
  machines:       any[]
  supervisors:    any[]
  processList:    any[]
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(s: string) {
  if (!s) return '-'
  try { return new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) } catch { return s }
}

function fmtDT(s: string) {
  if (!s) return '-'
  try { return new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) } catch { return s }
}

function daysSince(d: string): number {
  if (!d) return 0
  const dt = new Date(d)
  return isNaN(dt.getTime()) ? 0 : Math.floor((Date.now() - dt.getTime()) / 86400000)
}

function daysUntil(d: string): number {
  if (!d) return 999
  const dt = new Date(d)
  return isNaN(dt.getTime()) ? 999 : Math.floor((dt.getTime() - Date.now()) / 86400000)
}

/** Fallback: read from localStorage when no injected db is available */
function getLocalDb(): DbSnapshot {
  if (typeof window === 'undefined') return emptyDb()
  const raw = localStorage.getItem('dyeflow_db')
  if (!raw) return emptyDb()
  const db = JSON.parse(raw)
  return {
    orders:        db.orders         || [],
    fobRecords:    db.fobRecords     || [],
    faultyRecords: db.faultyRecords  || [],
    machines:      db.machines       || [],
    supervisors:   db.supervisors    || [],
    processList:   db.processList    || [],
  }
}

function emptyDb(): DbSnapshot {
  return { orders: [], fobRecords: [], faultyRecords: [], machines: [], supervisors: [], processList: [] }
}

function getProcName(code: string, processList: any[]): string {
  const p = processList.find((x: any) => x.code === code)
  return p ? p.name : code
}

/** Get all batches joined with their parent order — works with both old and new schema */
function getAllBatches(db: DbSnapshot): any[] {
  const result: any[] = []
  for (const order of db.orders) {
    for (const batch of (order.splits || [])) {
      result.push({ ...batch, _order: order })
    }
  }
  return result
}

const now = () => new Date().toISOString()

// ─────────────────────────────────────────────────────────────────────────────
// QUERY LIBRARY
// Each fn receives (params, db) — db defaults to localStorage fallback.
// ─────────────────────────────────────────────────────────────────────────────

type QueryFn = (params: any, db?: DbSnapshot) => ReportResult

export const QUERY_LIBRARY: Record<string, QueryFn> = {

  // ── 1. Batches at a specific FMS process ──────────────────────────────────
  batchesAtProcess: ({ processCode, processName }, db = getLocalDb()) => {
    const batches = getAllBatches(db)
    const found = batches.filter(b =>
      b.fmsCurrentProcess === processCode && !b.fmsDone && b._order.status !== 'done'
    )
    const rows = found.map(b => {
      const o = b._order
      const enteredAt = (b.fmsEnterAt || {})[processCode] || ''
      const plannedDate = (o.plannedDates || {})[processCode] || (o.plannedDates || {})['Dispatch'] || ''
      return [
        b.batchId || '-', o.orderNumber || '-', o.party || '-', o.article || '-',
        o.color || '-', String(b.kg || '-'), o.supervisor || '-', o.machine || '-',
        fmtDate(plannedDate), enteredAt ? daysSince(enteredAt) + ' days' : '-',
      ]
    })
    return {
      title: `Batches at ${processName || processCode}`,
      subtitle: `Active batches currently at ${processName || processCode}`,
      columns: ['Batch ID', 'Order #', 'Party', 'Article', 'Color', 'Kg', 'Supervisor', 'Machine', 'Planned Date', 'Time Here'],
      rows, summary: `${found.length} batch(es) at ${processName || processCode}`,
      totalRows: found.length, generatedAt: now(),
    }
  },

  // ── 2. Batches stuck at a process for more than N days ────────────────────
  batchesStuckAtProcess: ({ processCode, processName, days }, db = getLocalDb()) => {
    const batches = getAllBatches(db)
    const found = batches.filter(b => {
      if (b.fmsCurrentProcess !== processCode || b.fmsDone || b._order.status === 'done') return false
      const enteredAt = (b.fmsEnterAt || {})[processCode] || ''
      return enteredAt ? daysSince(enteredAt) > days : false
    }).sort((a, b) => daysSince((b.fmsEnterAt || {})[processCode] || '') - daysSince((a.fmsEnterAt || {})[processCode] || ''))
    const rows = found.map(b => {
      const o = b._order
      const stuck = daysSince((b.fmsEnterAt || {})[processCode] || '')
      return [
        b.batchId || '-', o.orderNumber || '-', o.party || '-', o.article || '-',
        o.color || '-', String(b.kg || '-'), o.supervisor || '-',
        fmtDT((b.fmsEnterAt || {})[processCode] || ''), stuck + ' days',
      ]
    })
    return {
      title: `Batches Stuck at ${processName || processCode} > ${days} Days`,
      columns: ['Batch ID', 'Order #', 'Party', 'Article', 'Color', 'Kg', 'Supervisor', 'Entered At', 'Days Stuck'],
      rows, summary: `${found.length} batch(es) stuck over ${days} days`,
      totalRows: found.length, generatedAt: now(),
    }
  },

  // ── 3. FOB pending approval ───────────────────────────────────────────────
  fobPendingApproval: ({ minDays = 0 }, db = getLocalDb()) => {
    const records = (db.fobRecords || [])
      .filter((r: any) => !r.fobApproved && (minDays <= 0 || daysSince(r.fobSentAt || r.createdAt) >= minDays))
      .sort((a: any, b: any) => daysSince(b.fobSentAt || b.createdAt) - daysSince(a.fobSentAt || a.createdAt))
    const rows = records.map((r: any) => [
      r.batchId || '-', r.orderNo || '-', r.party || '-', r.article || '-',
      r.processName || r.processCode || '-', String(r.qtyKg || '-'),
      r.fobSent ? fmtDate(r.fobSentAt || '') : 'Not Sent',
      r.fobSent ? daysSince(r.fobSentAt || r.createdAt) + ' days' : '-',
      r.reason || '-',
    ])
    return {
      title: `FOB Approval Pending${minDays > 0 ? ` > ${minDays} Days` : ''}`,
      columns: ['Batch ID', 'Order #', 'Party', 'Article', 'Process', 'Qty Kg', 'FOB Sent On', 'Waiting', 'Reason'],
      rows, summary: `${records.length} FOB record(s) pending approval`,
      totalRows: records.length, generatedAt: now(),
    }
  },

  // ── 4. FOB not yet sent ───────────────────────────────────────────────────
  fobNotSent: (_p, db = getLocalDb()) => {
    const records = (db.fobRecords || [])
      .filter((r: any) => !r.fobSent && r.status === 'open')
      .sort((a: any, b: any) => daysSince(b.createdAt) - daysSince(a.createdAt))
    const rows = records.map((r: any) => [
      r.batchId || '-', r.orderNo || '-', r.party || '-', r.article || '-',
      r.processName || r.processCode || '-', String(r.qtyKg || '-'),
      fmtDate(r.createdAt), daysSince(r.createdAt) + ' days', r.reason || '-',
    ])
    return {
      title: 'FOB Not Yet Sent',
      columns: ['Batch ID', 'Order #', 'Party', 'Article', 'Process', 'Qty Kg', 'Raised On', 'Pending Days', 'Reason'],
      rows, summary: `${records.length} FOB record(s) not yet sent`,
      totalRows: records.length, generatedAt: now(),
    }
  },

  // ── 5. FOB all open ───────────────────────────────────────────────────────
  fobAllOpen: ({ type }, db = getLocalDb()) => {
    let records = (db.fobRecords || []).filter((r: any) => r.status === 'open' || !r.fobApproved)
    if (type) records = records.filter((r: any) => r.type === type)
    records.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    const rows = records.map((r: any) => [
      r.batchId || '-', r.orderNo || '-', r.party || '-', r.article || '-', r.color || '-',
      r.processName || r.processCode || '-', String(r.qtyKg || '-'), fmtDate(r.createdAt),
      r.fobSent ? '✓' : '✗', r.fobApproved ? '✓' : '✗', r.fobReprocess ? '✓' : '✗', r.reason || '-',
    ])
    return {
      title: `Open FOB Records${type ? ` — ${type}` : ''}`,
      columns: ['Batch ID', 'Order #', 'Party', 'Article', 'Color', 'Process', 'Qty Kg', 'Date', 'Sent', 'Approved', 'Reprocess', 'Reason'],
      rows, summary: `${records.length} open FOB record(s)`,
      totalRows: records.length, generatedAt: now(),
    }
  },

  // ── 6. Faulty batches open > N days ──────────────────────────────────────
  faultyOpenMoreThan: ({ days }, db = getLocalDb()) => {
    const records = (db.faultyRecords || [])
      .filter((r: any) => r.status === 'open' && !r.ifOk && !r.reprocess && daysSince(r.date) >= days)
      .sort((a: any, b: any) => daysSince(b.date) - daysSince(a.date))
    const rows = records.map((r: any) => [
      r.batchId || '-', r.orderNo || '-', r.party || '-', r.faultyType || '-',
      String(r.quantity || '-'), fmtDate(r.date), daysSince(r.date) + ' days', r.remarks || '-',
    ])
    return {
      title: `Faulty Batches Open > ${days} Days`,
      columns: ['Batch ID', 'Order #', 'Party', 'Faulty Type', 'Qty Kg', 'Marked On', 'Open For', 'Remarks'],
      rows, summary: `${records.length} faulty batch(es) open over ${days} days`,
      totalRows: records.length, generatedAt: now(),
    }
  },

  // ── 7. Orders due in next N days ──────────────────────────────────────────
  ordersDueInDays: ({ days }, db = getLocalDb()) => {
    const orders = (db.orders || [])
      .filter((o: any) => {
        if (o.status === 'done') return false
        const d = (o.plannedDates || {})['Dispatch'] || ''
        const du = daysUntil(d)
        return d && du >= 0 && du <= days
      })
      .sort((a: any, b: any) => daysUntil((a.plannedDates || {})['Dispatch'] || '') - daysUntil((b.plannedDates || {})['Dispatch'] || ''))
    const rows = orders.map((o: any) => [
      o.orderNumber || '-', o.party || '-', o.article || '-', o.color || '-',
      String(o.qtyKg || '-'), o.status || '-', o.supervisor || '-', o.machine || '-',
      fmtDate((o.plannedDates || {})['Dispatch'] || ''),
      daysUntil((o.plannedDates || {})['Dispatch'] || '') + ' days',
    ])
    return {
      title: `Orders Due in Next ${days} Days`,
      columns: ['Order #', 'Party', 'Article', 'Color', 'Qty Kg', 'Status', 'Supervisor', 'Machine', 'Dispatch Date', 'Days Left'],
      rows, summary: `${orders.length} order(s) due within ${days} days`,
      totalRows: orders.length, generatedAt: now(),
    }
  },

  // ── 8. Overdue orders ─────────────────────────────────────────────────────
  overdueOrders: ({ groupBy }, db = getLocalDb()) => {
    const orders = (db.orders || []).filter((o: any) => {
      if (['done', 'new'].includes(o.status)) return false
      const d = (o.plannedDates || {})['Dispatch'] || ''
      return d && daysUntil(d) < 0
    }).sort((a: any, b: any) => daysUntil((a.plannedDates || {})['Dispatch'] || '') - daysUntil((b.plannedDates || {})['Dispatch'] || ''))

    if (groupBy) {
      const groups: Record<string, number> = {}
      orders.forEach((o: any) => { const key = o[groupBy] || 'Unknown'; groups[key] = (groups[key] || 0) + 1 })
      const rows = Object.entries(groups).sort((a, b) => b[1] - a[1]).map(([key, count]) => [key, count])
      return {
        title: `Overdue Orders by ${groupBy}`,
        columns: [groupBy.charAt(0).toUpperCase() + groupBy.slice(1), 'Overdue Count'],
        rows, summary: `${orders.length} overdue order(s) across ${rows.length} ${groupBy}(s)`,
        totalRows: rows.length, generatedAt: now(),
      }
    }

    const rows = orders.map((o: any) => [
      o.orderNumber || '-', o.party || '-', o.article || '-', o.color || '-',
      String(o.qtyKg || '-'), o.status || '-', o.supervisor || '-', o.machine || '-',
      fmtDate((o.plannedDates || {})['Dispatch'] || ''),
      Math.abs(daysUntil((o.plannedDates || {})['Dispatch'] || '')) + ' days overdue',
    ])
    return {
      title: 'Overdue Orders',
      columns: ['Order #', 'Party', 'Article', 'Color', 'Qty Kg', 'Status', 'Supervisor', 'Machine', 'Dispatch Date', 'Overdue By'],
      rows, summary: `${orders.length} order(s) past dispatch date`,
      totalRows: orders.length, generatedAt: now(),
    }
  },

  // ── 9. Orders on hold ─────────────────────────────────────────────────────
  ordersOnHold: (_p, db = getLocalDb()) => {
    const orders = (db.orders || []).filter((o: any) => o.status === 'hold')
    const rows = orders.map((o: any) => [
      o.orderNumber || '-', o.party || '-', o.article || '-', o.color || '-',
      String(o.qtyKg || '-'), o.supervisor || '-', o.holdReason || o.remarks || '-',
      fmtDate(o.timestamp || o.created_at || ''),
    ])
    return {
      title: 'Orders On Hold',
      columns: ['Order #', 'Party', 'Article', 'Color', 'Qty Kg', 'Supervisor', 'Hold Reason', 'Created'],
      rows, summary: `${orders.length} order(s) on hold`,
      totalRows: orders.length, generatedAt: now(),
    }
  },

  // ── 10. Machine-wise batch count ──────────────────────────────────────────
  machineWiseBatches: (_p, db = getLocalDb()) => {
    const machineMap: Record<string, { count: number; kg: number; orders: Set<string> }> = {}
    for (const order of (db.orders || [])) {
      if (order.status === 'done') continue
      const machineName = order.machine || 'Unassigned'
      for (const batch of (order.splits || [])) {
        if (batch.fmsDone) continue
        if (!machineMap[machineName]) machineMap[machineName] = { count: 0, kg: 0, orders: new Set() }
        machineMap[machineName].count++
        machineMap[machineName].kg += parseFloat(batch.kg) || 0
        machineMap[machineName].orders.add(order.orderNumber)
      }
    }
    const rows = Object.entries(machineMap).sort((a, b) => b[1].count - a[1].count).map(([name, data]) => {
      const m = (db.machines || []).find((x: any) => x.name === name || x.id === name)
      const cap = m?.capacity || 0
      return [name, data.count, Math.round(data.kg) + ' kg', cap ? cap + ' kg' : '-', cap > 0 ? Math.round((data.kg / cap) * 100) + '%' : '-', data.orders.size]
    })
    return {
      title: 'Machine Wise Active Batch Count',
      columns: ['Machine', 'Active Batches', 'Loaded Kg', 'Capacity', 'Load %', 'Orders'],
      rows, summary: `${rows.length} machine(s) with active batches`,
      totalRows: rows.length, generatedAt: now(),
    }
  },

  // ── 11. Supervisor-wise orders ────────────────────────────────────────────
  supervisorWiseOrders: (_p, db = getLocalDb()) => {
    const supMap: Record<string, { inbox: number; active: number; overdue: number }> = {}
    for (const o of (db.orders || [])) {
      if (o.status === 'done') continue
      const sup = o.supervisor || 'Unassigned'
      if (!supMap[sup]) supMap[sup] = { inbox: 0, active: 0, overdue: 0 }
      if (o.status === 'assigned') supMap[sup].inbox++
      if (['splitting', 'in-process'].includes(o.status)) supMap[sup].active++
      const d = (o.plannedDates || {})['Dispatch'] || ''
      if (d && daysUntil(d) < 0) supMap[sup].overdue++
    }
    const rows = Object.entries(supMap)
      .sort((a, b) => (b[1].active + b[1].inbox) - (a[1].active + a[1].inbox))
      .map(([name, data]) => [name, data.inbox, data.active, data.overdue, data.inbox + data.active])
    return {
      title: 'Supervisor Wise Pending Orders',
      columns: ['Supervisor', 'Inbox', 'Active', 'Overdue', 'Total Pending'],
      rows, summary: `${rows.length} supervisor(s) with pending work`,
      totalRows: rows.length, generatedAt: now(),
    }
  },

  // ── 12. Party-wise pending orders ─────────────────────────────────────────
  partyWiseOrders: (_p, db = getLocalDb()) => {
    const partyMap: Record<string, { count: number; kg: number; overdue: number }> = {}
    for (const o of (db.orders || [])) {
      if (o.status === 'done') continue
      const party = o.party || 'Unknown'
      if (!partyMap[party]) partyMap[party] = { count: 0, kg: 0, overdue: 0 }
      partyMap[party].count++
      partyMap[party].kg += parseFloat(o.qtyKg) || 0
      const d = (o.plannedDates || {})['Dispatch'] || ''
      if (d && daysUntil(d) < 0) partyMap[party].overdue++
    }
    const rows = Object.entries(partyMap).sort((a, b) => b[1].count - a[1].count)
      .map(([party, data]) => [party, data.count, Math.round(data.kg) + ' kg', data.overdue])
    return {
      title: 'Party Wise Pending Orders',
      columns: ['Party', 'Pending Orders', 'Total Qty Kg', 'Overdue'],
      rows, summary: `${rows.length} parties with pending orders`,
      totalRows: rows.length, generatedAt: now(),
    }
  },

  // ── 13. All batches by process ────────────────────────────────────────────
  batchesByProcess: (_p, db = getLocalDb()) => {
    const procMap: Record<string, number> = {}
    for (const b of getAllBatches(db)) {
      if (b.fmsDone || b._order.status === 'done') continue
      const proc = b.fmsCurrentProcess || 'Not Started'
      procMap[proc] = (procMap[proc] || 0) + 1
    }
    const rows = Object.entries(procMap).sort((a, b) => b[1] - a[1])
      .map(([code, count]) => [code, getProcName(code, db.processList || []), count])
    return {
      title: 'Active Batches by Process',
      columns: ['Process Code', 'Process Name', 'Batch Count'],
      rows, summary: `${rows.length} processes with active batches`,
      totalRows: rows.length, generatedAt: now(),
    }
  },

  // ── 14. FOB reprocess pending ─────────────────────────────────────────────
  fobReprocessPending: (_p, db = getLocalDb()) => {
    const records = (db.fobRecords || []).filter((r: any) => r.fobReprocess)
      .sort((a: any, b: any) => daysSince(b.fobReprocessAt || b.createdAt) - daysSince(a.fobReprocessAt || a.createdAt))
    const rows = records.map((r: any) => [
      r.batchId || '-', r.orderNo || '-', r.party || '-', r.article || '-',
      r.processName || r.processCode || '-', String(r.qtyKg || '-'),
      fmtDate(r.fobReprocessAt || r.createdAt),
      daysSince(r.fobReprocessAt || r.createdAt) + ' days', r.reason || '-',
    ])
    return {
      title: 'FOB Reprocess Pending',
      columns: ['Batch ID', 'Order #', 'Party', 'Article', 'Process', 'Qty Kg', 'Marked On', 'Waiting', 'Reason'],
      rows, summary: `${records.length} FOB record(s) marked for reprocess`,
      totalRows: records.length, generatedAt: now(),
    }
  },

  // ── 15. Orders without planned dates ──────────────────────────────────────
  ordersNoPlanDate: (_p, db = getLocalDb()) => {
    const orders = (db.orders || []).filter((o: any) => {
      if (o.status === 'done') return false
      return !((o.plannedDates || {})['Dispatch'])
    })
    const rows = orders.map((o: any) => [
      o.orderNumber || '-', o.party || '-', o.article || '-', o.color || '-',
      String(o.qtyKg || '-'), o.status || '-', o.supervisor || '-',
      fmtDate(o.timestamp || o.created_at || ''),
    ])
    return {
      title: 'Orders With No Planned Dispatch Date',
      columns: ['Order #', 'Party', 'Article', 'Color', 'Qty Kg', 'Status', 'Supervisor', 'Created'],
      rows, summary: `${orders.length} order(s) with no planned date`,
      totalRows: orders.length, generatedAt: now(),
    }
  },

  // ── 16. All batches for a specific party ──────────────────────────────────
  batchesForParty: ({ partyName }, db = getLocalDb()) => {
    const q = (partyName || '').toLowerCase()
    const orders = (db.orders || []).filter((o: any) =>
      (o.party || '').toLowerCase().includes(q) || (o.orderNumber || '').toLowerCase().includes(q)
    )
    const rows: any[] = []
    for (const o of orders) {
      for (const b of (o.splits || [])) {
        rows.push([
          o.orderNumber, o.party, o.article, o.color, b.batchId || '-',
          String(b.kg || '-'), b.fmsCurrentProcess || '-',
          b.fmsDone ? 'Done' : 'Active', fmtDate((o.plannedDates || {})['Dispatch'] || ''),
        ])
      }
    }
    return {
      title: `Batches for "${partyName}"`,
      columns: ['Order #', 'Party', 'Article', 'Color', 'Batch ID', 'Kg', 'Current Process', 'Status', 'Dispatch Date'],
      rows, summary: `${rows.length} batch(es) across ${orders.length} order(s)`,
      totalRows: rows.length, generatedAt: now(),
    }
  },
}

// ── Query catalog string — AI uses this to pick the right function ─────────
export const QUERY_CATALOG = `
AVAILABLE QUERIES (use one of these function names + params):

1. batchesAtProcess({processCode, processName})
   → All active batches currently at a specific process
   → e.g. CBR: {processCode:"C", processName:"CBR"}

2. batchesStuckAtProcess({processCode, processName, days})
   → Batches at a process for more than N days

3. fobPendingApproval({minDays?})
   → FOB records not yet approved; optionally filter by minimum wait days

4. fobNotSent({})
   → FOB records raised but not yet sent to party

5. fobAllOpen({type?})
   → All open FOB records; type = "dyeing" | "rolling" | undefined for both

6. faultyOpenMoreThan({days})
   → Faulty batches open for more than N days

7. ordersDueInDays({days})
   → Orders with dispatch date within next N days

8. overdueOrders({groupBy?})
   → Orders past dispatch date; groupBy = "supervisor" | "machine" | "party" | undefined

9. ordersOnHold({})
   → All orders with status = hold

10. machineWiseBatches({})
    → Active batch count, Kg loaded, capacity % per machine

11. supervisorWiseOrders({})
    → Orders per supervisor: inbox, active, overdue counts

12. partyWiseOrders({})
    → Pending orders grouped by party name

13. batchesByProcess({})
    → Count of active batches at each FMS process stage

14. fobReprocessPending({})
    → FOB records marked for reprocess

15. ordersNoPlanDate({})
    → Active orders missing planned dispatch date

16. batchesForParty({partyName})
    → All batches for orders matching a party name or order number
`
