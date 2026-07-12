/**
 * lib/dbContext.ts — Supabase-backed context builders for AI assistant.
 * Phase 12: localStorage fallbacks removed. All context from /api/context or /api/batches.
 */

export interface DbContext {
  summary: string
  full: string
  orderCount: number
  batchCount: number
}

/** Async — fetches from Supabase via /api/context. Use in React components. */
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
  return { summary: 'Unable to reach Supabase.', full: 'Database unavailable.', orderCount: 0, batchCount: 0 }
}

/** Sync stub — returns empty context. Kept for legacy callers. */
export function buildDbContext(): DbContext {
  return { summary: '', full: '', orderCount: 0, batchCount: 0 }
}

// ── Legacy context builders (still used by AI assistant tabs) ─────────────────
// These read from the /api/snapshot endpoint instead of localStorage.

export function buildDelayContext(): string {
  return 'Use fetchDbContext() or /api/snapshot for live data.'
}

export function buildCustomerContext(_query: string): string {
  return 'Use /api/orders?party=X for customer context.'
}

export function buildActionsContext(): string {
  return 'Use /api/snapshot for actions context.'
}

export function buildSchedulerContext(): string {
  return 'Scheduler context requires live Supabase data. Use /api/context.'
}

export function buildAssignmentContext(): string {
  return 'Use /api/machines and /api/supervisors for assignment context.'
}

export function buildCostContext(): string {
  return 'Use /api/snapshot for cost context.'
}

// ── Anomaly Detection ─────────────────────────────────────────────────────────

export interface AnomalyItem {
  batchId: string; orderNo: string; party: string; article: string; color: string;
  processCode: string; processName: string; daysStuck: number; expectedDays: number;
  overByDays: number; supervisor: string; machine: string; severity: 'critical'|'warning'|'watch'
}

/**
 * Async anomaly detection — fetches batches and process list from Supabase.
 */
export async function fetchAnomalyContext(): Promise<{ anomalies: AnomalyItem[]; contextText: string }> {
  try {
    const [bRes, oRes, pRes] = await Promise.all([
      fetch('/api/batches?limit=2000&status=in-process', { cache: 'no-store' }).then(r => r.json()),
      fetch('/api/orders?limit=1000', { cache: 'no-store' }).then(r => r.json()),
      fetch('/api/processes', { cache: 'no-store' }).then(r => r.json()),
    ])

    const batches: any[] = bRes.data || []
    const orders:  any[] = oRes.data || []
    const procs:   any[] = pRes.data || []

    const orderMap: Record<string, any> = {}
    for (const o of orders) orderMap[o.id] = o

    const defaultDays: Record<string, number> = {}
    const procNames:   Record<string, string>  = {}
    for (const p of procs) {
      defaultDays[p.code] = p.default_days || 1
      procNames[p.code]   = p.name || p.code
    }

    const now = Date.now()
    const anomalies: AnomalyItem[] = []

    for (const b of batches) {
      const proc = b.current_process
      if (!proc || b.status === 'done') continue
      const enterAt = (b.fms_enter_at || {})[proc]
      if (!enterAt) continue
      const daysStuck    = Math.floor((now - new Date(enterAt).getTime()) / 86400000)
      const expectedDays = defaultDays[proc] || 1
      if (daysStuck <= expectedDays) continue
      const overByDays = daysStuck - expectedDays
      const severity: AnomalyItem['severity'] =
        daysStuck >= expectedDays * 2   ? 'critical' :
        daysStuck >= expectedDays * 1.5 ? 'warning'  : 'watch'
      const order = orderMap[b.order_id] || {}
      anomalies.push({
        batchId: b.batch_id || b.id, orderNo: order.order_number || '-',
        party: order.party || '-', article: order.article || '-', color: order.color || '-',
        processCode: proc, processName: procNames[proc] || proc,
        daysStuck, expectedDays, overByDays,
        supervisor: order.supervisors?.name || '-', machine: b.machines?.name || '-', severity,
      })
    }

    anomalies.sort((a, b) => {
      const sv = { critical: 0, warning: 1, watch: 2 }
      if (sv[a.severity] !== sv[b.severity]) return sv[a.severity] - sv[b.severity]
      return b.daysStuck - a.daysStuck
    })

    const contextText = anomalies.length === 0
      ? 'No anomalies detected — all batches within expected process times.'
      : anomalies.slice(0, 10).map(a =>
          `${a.severity.toUpperCase()}: ${a.batchId} stuck at ${a.processName} for ${a.daysStuck}d (expected ${a.expectedDays}d) — ${a.orderNo} / ${a.party} / supervisor: ${a.supervisor}`
        ).join('\n')

    return { anomalies, contextText }
  } catch (err) {
    console.error('fetchAnomalyContext error:', err)
    return { anomalies: [], contextText: 'Anomaly detection unavailable.' }
  }
}

/** Sync stub — kept for any remaining legacy callers. */
export function buildAnomalyContext(): { anomalies: AnomalyItem[]; contextText: string } {
  return { anomalies: [], contextText: '' }
}
