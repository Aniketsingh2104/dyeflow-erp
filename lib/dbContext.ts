/**
 * dbContext.ts — Supabase-backed context builder for AI assistant.
 * Fetches live data from /api/context (server-side Supabase query).
 * Falls back to localStorage for legacy local tools.
 */

export interface DbContext {
  summary: string
  full: string
  orderCount: number
  batchCount: number
}

/** Async version — fetches from Supabase via API. Use in React components. */
export async function fetchDbContext(): Promise<DbContext> {
  try {
    const res  = await fetch('/api/context', { cache: 'no-store' })
    const data = await res.json()
    if (data.ok) {
      return {
        summary:    data.summary    || '',
        full:       data.full       || '',
        orderCount: data.orderCount || 0,
        batchCount: data.batchCount || 0,
      }
    }
  } catch {}
  // Fallback to localStorage
  return buildDbContext()
}

/** Sync version — reads from localStorage. Used by legacy code until migration complete. */
export function buildDbContext(): DbContext {
  if (typeof window === 'undefined') return { summary: '', full: '', orderCount: 0, batchCount: 0 }

  const raw = localStorage.getItem('dyeflow_db')
  if (!raw) return { summary: 'No database found.', full: 'The DyeFlow database is empty.', orderCount: 0, batchCount: 0 }

  try {
    const db = JSON.parse(raw)
    const orders      = db.orders     || []
    const machines    = db.machines   || []
    const supervisors = db.supervisors || []
    const faultyRecs  = db.faultyRecords || []

    const statusGroups: Record<string, number> = {}
    orders.forEach((o: any) => { statusGroups[o.status || 'new'] = (statusGroups[o.status || 'new'] || 0) + 1 })

    const allBatches = orders.flatMap((o: any) => (o.splits || []))
    const openFaulty = faultyRecs.filter((r: any) => r.status === 'open')

    const summary = `${orders.length} orders · ${allBatches.length} batches · ${machines.length} machines · ${openFaulty.length} open faulty`
    const full = `TODAY: ${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
=== DYEFLOW FACTORY ERP ===
STATS: orders:${orders.length} batches:${allBatches.length} faulty:${openFaulty.length}open
STATUS: ${Object.entries(statusGroups).map(([s, n]) => `${s}:${n}`).join(' ')}
MACHINES: ${machines.map((m: any) => m.name).join(', ')}
SUPERVISORS: ${supervisors.map((s: any) => s.name).join(', ')}
(Note: Running from localStorage fallback — data may be stale)`

    return { summary, full, orderCount: orders.length, batchCount: allBatches.length }
  } catch {
    return { summary: 'Error reading database', full: 'Database read error.', orderCount: 0, batchCount: 0 }
  }
}

// ── Legacy context builders (localStorage) kept for backward compat ──────────
// These are used by report-agent/page.tsx which still runs client-side

export function buildDelayContext(): string {
  const raw = localStorage.getItem('dyeflow_db')
  if (!raw) return 'No data.'
  try {
    const db = JSON.parse(raw)
    const orders = db.orders || []
    const now = new Date()
    const lines = orders
      .filter((o: any) => !['done','new','hold'].includes(o.status))
      .map((o: any) => {
        const route = o.processRoute || []
        const batches = o.splits || []
        const dispatchDate = o.plannedDates?.['Dispatch'] || ''
        const daysLeft = dispatchDate
          ? Math.round((new Date(dispatchDate).getTime() - now.getTime()) / 86400000)
          : null
        const remainingProcesses = batches.map((b: any) => {
          const cur = b.fmsCurrentProcess || route[0] || ''
          const idx = route.indexOf(cur)
          return idx >= 0 ? route.slice(idx).length : route.length
        })
        const maxRemaining = Math.max(...remainingProcesses, 0)
        return `${o.orderNumber}|party:${o.party}|status:${o.status}|daysUntilDispatch:${daysLeft !== null ? daysLeft : 'no planned date'}|remainingProcesses:${maxRemaining}|route:${route.join('→')}`
      })
    return `TODAY: ${now.toLocaleDateString('en-GB')}\n\nACTIVE ORDERS:\n${lines.join('\n') || '(none)'}`
  } catch { return 'Error reading data.' }
}

export function buildCustomerContext(query: string): string {
  const raw = localStorage.getItem('dyeflow_db')
  if (!raw) return 'No data.'
  try {
    const db = JSON.parse(raw)
    const orders = db.orders || []
    const q = query.toLowerCase().trim()
    const matched = orders.filter((o: any) =>
      (o.orderNumber || '').toLowerCase().includes(q) ||
      (o.party || '').toLowerCase().includes(q)
    )
    if (!matched.length) return `No orders found matching "${query}".`
    return `MATCHING ORDERS:\n\n${matched.map((o: any) => [
      `Order: ${o.orderNumber}`, `Party: ${o.party}`, `Article: ${o.article} | Color: ${o.color} | Qty: ${o.qtyKg} Kg`,
      `Status: ${o.status}`, `Supervisor: ${o.supervisor || 'unassigned'}`,
    ].join('\n')).join('\n\n---\n\n')}`
  } catch { return 'Error.' }
}

export function buildActionsContext(): string {
  const raw = localStorage.getItem('dyeflow_db')
  if (!raw) return 'No data.'
  try {
    const db = JSON.parse(raw)
    const orders = db.orders || []
    const supervisors = db.supervisors || []
    const machines = db.machines || []
    return `ORDERS: ${orders.slice(0,50).map((o: any) => `${o.orderNumber}(${o.party},${o.status},sup:${o.supervisor || 'none'})`).join(', ')}
VALID SUPERVISORS: ${supervisors.map((s: any) => s.name).join(', ')}
VALID MACHINES: ${machines.map((m: any) => m.name).join(', ')}
VALID STATUSES: new, assigned, splitting, in-process, done, hold`
  } catch { return 'Error.' }
}

export function buildSchedulerContext(): string {
  const raw = localStorage.getItem('dyeflow_db')
  if (!raw) return 'No data.'
  return 'Scheduler context requires live Supabase data. Use /api/context for full context.'
}

export function buildAssignmentContext(): string {
  const raw = localStorage.getItem('dyeflow_db')
  if (!raw) return 'No data.'
  try {
    const db = JSON.parse(raw)
    const machines = db.machines || []
    const supervisors = db.supervisors || []
    return `MACHINES:\n${machines.map((m: any) => `${m.name}: cap=${m.capacity}kg`).join('\n')}\n\nSUPERVISORS:\n${supervisors.map((s: any) => s.name).join(', ')}`
  } catch { return 'Error.' }
}

export function buildCostContext(): string {
  const raw = localStorage.getItem('dyeflow_db')
  if (!raw) return 'No data.'
  try {
    const db = JSON.parse(raw)
    const orders = db.orders || []
    return `ORDERS:\n${orders.slice(0,40).map((o: any) => `${o.orderNumber}|${o.party}|${o.article}|${o.qtyKg}kg|${o.status}`).join('\n')}`
  } catch { return 'Error.' }
}

export interface AnomalyItem {
  batchId: string; orderNo: string; party: string; article: string; color: string;
  processCode: string; processName: string; daysStuck: number; expectedDays: number;
  overByDays: number; supervisor: string; machine: string; severity: 'critical'|'warning'|'watch'
}

export function buildAnomalyContext(): { anomalies: AnomalyItem[]; contextText: string } {
  return { anomalies: [], contextText: 'Anomaly detection requires live data.' }
}
