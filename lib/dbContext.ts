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

// ── Real context builders (replace the old dead stubs ──────────────────────
// Each of these used to be a one-line stub returning placeholder text like
// 'Use /api/machines and /api/supervisors for assignment context.' — the LLM
// received that literal sentence instead of real data. These now actually
// fetch from the live /api/* routes.

/** Smart Assignment tab — machine loads, supervisor loads, plus a historical
 *  machine hint from /api/predict when an article is provided. */
export async function fetchAssignmentContext(article?: string): Promise<string> {
  try {
    const [mRes, bRes, sRes, oRes] = await Promise.all([
      fetch('/api/machines', { cache: 'no-store' }).then(r => r.json()),
      fetch('/api/batches?limit=2000', { cache: 'no-store' }).then(r => r.json()),
      fetch('/api/supervisors', { cache: 'no-store' }).then(r => r.json()),
      fetch('/api/orders?limit=1000', { cache: 'no-store' }).then(r => r.json()),
    ])
    const machines: any[] = mRes.data || []
    const batches: any[] = bRes.data || []
    const supervisors: any[] = sRes.data || []
    const orders: any[] = oRes.data || []

    const machineLoad: Record<string, { kg: number; count: number }> = {}
    for (const b of batches) {
      if (b.status === 'done') continue
      const mname = b.machines?.name || 'unassigned'
      if (!machineLoad[mname]) machineLoad[mname] = { kg: 0, count: 0 }
      machineLoad[mname].kg += parseFloat(b.kg) || 0
      machineLoad[mname].count++
    }
    const machineLines = machines.map((m: any) => {
      const load = machineLoad[m.name] || { kg: 0, count: 0 }
      const pct = m.capacity ? Math.round((load.kg / m.capacity) * 100) : 0
      return `  ${m.name}: capacity ${m.capacity ?? '?'}kg, currently ${Math.round(load.kg)}kg (${pct}%), ${load.count} active batch(es), status:${m.status || 'idle'}`
    })

    const supLoad: Record<string, number> = {}
    for (const o of orders) {
      if (o.status === 'done') continue
      const sup = o.supervisors?.name || 'Unassigned'
      supLoad[sup] = (supLoad[sup] || 0) + 1
    }
    const supLines = supervisors.map((s: any) => `  ${s.name}: ${supLoad[s.name] || 0} active order(s)`)

    let recLine = ''
    if (article) {
      try {
        const rec = await fetch(`/api/predict?type=machine&article=${encodeURIComponent(article)}`, { cache: 'no-store' }).then(r => r.json())
        if (rec.recommendedMachine) {
          recLine = `\n\nHISTORICAL PATTERN: article "${article}" has most often used machine "${rec.recommendedMachine}" historically (${rec.confidence} confidence, ${rec.sampleSize} samples). Note this uses historical short-code machine naming which may not exactly match a live machine name below — treat as a hint, not a guaranteed live match.`
        }
      } catch {}
    }

    return `MACHINES (${machines.length}):
${machineLines.join('\n') || '  none configured'}

SUPERVISORS (${supervisors.length}):
${supLines.join('\n') || '  none configured'}${recLine}`
  } catch (err) {
    console.error('fetchAssignmentContext error:', err)
    return 'Assignment context unavailable.'
  }
}

/** Delay Predictor tab — combines stuck-batch anomaly detection with real
 *  delivery_date risk, PLUS learned-duration ETAs for not-yet-started orders
 *  (status new/assigned, no batches yet) — estimates total processing time
 *  from their full process_route using real historical/live durations,
 *  rather than leaving that entirely to the LLM's guesswork. */
export async function fetchDelayContext(): Promise<string> {
  try {
    const { contextText: anomalyText } = await fetchAnomalyContext()

    const oRes = await fetch('/api/orders?limit=1000', { cache: 'no-store' }).then(r => r.json())
    const orders: any[] = (oRes.data || []).filter((o: any) => o.status !== 'done')
    const now = Date.now()
    const withDate = orders.filter((o: any) => o.delivery_date)
    const noDate = orders.filter((o: any) => !o.delivery_date)

    const dateLines = withDate.map((o: any) => {
      const daysLeft = Math.floor((new Date(o.delivery_date).getTime() - now) / 86400000)
      const routeLen = (o.process_route || []).length
      return `  ${o.order_number} | ${o.party} | delivery:${o.delivery_date} | days left:${daysLeft} | route steps:${routeLen} | status:${o.status}`
    })

    // Learned-duration ETA for not-yet-started orders: sum estimated days
    // across their full route from ONE batched /api/predict call.
    const notStarted = withDate.filter((o: any) => o.status === 'new' || o.status === 'assigned')
    const pairs: { processCode: string; article?: string }[] = []
    const orderNumsByPairKey: Record<string, string[]> = {}
    for (const o of notStarted) {
      for (const code of (o.process_route || [])) {
        const key = `${code}::${o.article}`
        if (!orderNumsByPairKey[key]) { orderNumsByPairKey[key] = []; pairs.push({ processCode: code, article: o.article }) }
        orderNumsByPairKey[key].push(o.order_number)
      }
    }

    let etaBlock = ''
    if (pairs.length > 0) {
      const res = await fetch('/api/predict', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'duration_batch', pairs }),
      }).then(r => r.json()).catch(() => ({ results: [] }))
      const estimates: any[] = res.results || []

      const daysByOrder: Record<string, number> = {}
      const hasLearnedByOrder: Record<string, boolean> = {}
      for (const est of estimates) {
        const key = `${est.processCode}::${est.article}`
        for (const orderNum of (orderNumsByPairKey[key] || [])) {
          daysByOrder[orderNum] = (daysByOrder[orderNum] || 0) + est.estimatedDays
          if (est.confidence !== 'default') hasLearnedByOrder[orderNum] = true
        }
      }

      const etaLines = notStarted
        .map((o: any) => {
          const estDays = daysByOrder[o.order_number]
          if (estDays == null) return null
          const daysLeft = Math.floor((new Date(o.delivery_date).getTime() - now) / 86400000)
          const risk = estDays > daysLeft ? 'AT RISK' : 'ON TRACK'
          const conf = hasLearnedByOrder[o.order_number] ? 'has real learned data' : 'mostly factory defaults — low confidence'
          return `  ${o.order_number} | ${o.party} | est. total processing: ${estDays.toFixed(1)}d | days until delivery: ${daysLeft} | ${risk} (${conf})`
        })
        .filter(Boolean) as string[]

      if (etaLines.length > 0) {
        etaBlock = `\n\nLEARNED-DURATION ETA for not-yet-started orders (sum of real per-process durations across their full route):
${etaLines.join('\n')}`
      }
    }

    return `STUCK-BATCH ANOMALIES (batches past expected time at their current process):
${anomalyText}

ORDERS WITH A DELIVERY DATE SET (${withDate.length}):
${dateLines.join('\n') || '  none'}${etaBlock}

ORDERS WITH NO DELIVERY DATE SET (${noDate.length}, showing up to 20):
${noDate.slice(0, 20).map((o: any) => `  ${o.order_number} | ${o.party} | status:${o.status}`).join('\n') || '  none'}`
  } catch (err) {
    console.error('fetchDelayContext error:', err)
    return 'Delay context unavailable.'
  }
}

/** Faulty Analyzer tab — learned faulty-risk rate + real top reasons per
 *  article (top ~12 by current live order volume), from ONE batched
 *  /api/predict call instead of one call per article. */
export async function fetchFaultyRiskContext(): Promise<string> {
  try {
    const oRes = await fetch('/api/orders?limit=1000', { cache: 'no-store' }).then(r => r.json())
    const orders: any[] = oRes.data || []
    const articleCounts: Record<string, number> = {}
    for (const o of orders) {
      if (o.article) articleCounts[o.article] = (articleCounts[o.article] || 0) + 1
    }
    const topArticles = Object.entries(articleCounts).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([a]) => a)
    if (topArticles.length === 0) return 'No active articles to analyze.'

    const res = await fetch('/api/predict', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'faulty_risk_batch', segments: topArticles.map((a) => ({ article: a })) }),
    }).then(r => r.json())
    const results: any[] = res.results || []

    const lines = results.map((r: any, i: number) => {
      const reasons = (r.topReasons || []).map((tr: any) => `${tr.value}(${tr.count}x)`).join(', ') || 'no reason data yet'
      return `  ${topArticles[i]}: risk ${(r.riskRate * 100).toFixed(1)}% (factory avg ${(r.factoryAverageRate * 100).toFixed(1)}%) | confidence:${r.confidence} | sample:${r.sampleSize} | top reasons: ${reasons}`
    })

    return `LEARNED FAULTY-RISK BY ARTICLE (top ${topArticles.length} articles by current order volume, blends live + imported historical data):
${lines.join('\n')}`
  } catch (err) {
    console.error('fetchFaultyRiskContext error:', err)
    return 'Faulty risk context unavailable.'
  }
}

/** Customer Reply tab — real order lookup by party name or order number, with batch detail. */
export async function fetchCustomerContext(query: string): Promise<string> {
  try {
    const q = query.trim()
    if (!q) return 'No party name or order number provided.'
    const qUpper = q.toUpperCase()
    const qLower = q.toLowerCase()

    const oRes = await fetch('/api/orders?limit=2000', { cache: 'no-store' }).then(r => r.json())
    const orders: any[] = oRes.data || []
    const matches = orders.filter((o: any) =>
      (o.order_number && o.order_number.toUpperCase().includes(qUpper)) ||
      (o.party && o.party.toLowerCase().includes(qLower))
    ).slice(0, 15)

    if (matches.length === 0) return `No orders found matching "${q}".`

    const lines = await Promise.all(matches.map(async (o: any) => {
      const bRes = await fetch(`/api/batches?order_id=${o.id}`, { cache: 'no-store' }).then(r => r.json()).catch(() => ({ data: [] }))
      const batches: any[] = bRes.data || []
      const batchSummary = batches.length > 0
        ? batches.map((b: any) => `${b.batch_id}(${b.kg}kg,${b.status}${b.current_process ? ',' + b.current_process : ''})`).join(' ')
        : 'not split yet'
      return `  ${o.order_number} | ${o.party} | ${o.article} | ${o.color} | ${o.qty_kg}kg | status:${o.status} | route:${(o.process_route || []).join('→')} | delivery:${o.delivery_date || 'not set'} | batches:[${batchSummary}]`
    }))

    return `MATCHING ORDERS for "${q}" (${matches.length} found):
${lines.join('\n')}`
  } catch (err) {
    console.error('fetchCustomerContext error:', err)
    return 'Customer context unavailable.'
  }
}

/** AI Actions proposal step — real order numbers/statuses/supervisors so the LLM can only reference things that actually exist. */
export async function fetchActionsContext(): Promise<string> {
  try {
    const [oRes, sRes] = await Promise.all([
      fetch('/api/orders?limit=1000', { cache: 'no-store' }).then(r => r.json()),
      fetch('/api/supervisors', { cache: 'no-store' }).then(r => r.json()),
    ])
    const orders: any[] = oRes.data || []
    const supervisors: any[] = sRes.data || []

    const orderLines = orders.slice(0, 200).map((o: any) =>
      `  ${o.order_number} | ${o.party} | status:${o.status} | supervisor:${o.supervisors?.name || 'none'}`
    )
    const supNames = supervisors.map((s: any) => s.name).join(', ')

    return `VALID ORDER NUMBERS AND CURRENT STATE (showing ${Math.min(orders.length, 200)} of ${orders.length}):
${orderLines.join('\n') || '  none'}

VALID SUPERVISOR NAMES: ${supNames || 'none'}

COMMONLY USED STATUS VALUES: new, assigned, splitting, in-process, hold, done`
  } catch (err) {
    console.error('fetchActionsContext error:', err)
    return 'Actions context unavailable.'
  }
}

/** Prod. Scheduler tab — real per-machine batch queue with shade group, delivery date, faulty flags. */
export async function fetchSchedulerContext(): Promise<string> {
  try {
    const [mRes, bRes, oRes] = await Promise.all([
      fetch('/api/machines', { cache: 'no-store' }).then(r => r.json()),
      fetch('/api/batches?limit=2000', { cache: 'no-store' }).then(r => r.json()),
      fetch('/api/orders?limit=1000', { cache: 'no-store' }).then(r => r.json()),
    ])
    const machines: any[] = mRes.data || []
    const batches: any[] = (bRes.data || []).filter((b: any) => b.status !== 'done')
    const orders: any[] = oRes.data || []
    const orderMap: Record<string, any> = {}
    for (const o of orders) orderMap[o.id] = o

    const byMachine: Record<string, any[]> = {}
    for (const b of batches) {
      const mname = b.machines?.name || 'UNASSIGNED'
      if (!byMachine[mname]) byMachine[mname] = []
      byMachine[mname].push({ ...b, order: orderMap[b.order_id] || {} })
    }

    const machineBlocks = machines.map((m: any) => {
      const list = byMachine[m.name] || []
      const loadKg = list.reduce((s: number, b: any) => s + (parseFloat(b.kg) || 0), 0)
      const lines = list.map((b: any) =>
        `    ${b.batch_id} | ${b.order?.party || '-'} | shade:${b.order?.shade_group || '-'} | ${b.kg}kg | at:${b.current_process || '-'} | delivery:${b.order?.delivery_date || 'not set'}${b.is_faulty ? ' | FAULTY' : ''}`
      )
      return `  ${m.name} (capacity ${m.capacity ?? '?'}kg, loaded ${Math.round(loadKg)}kg):
${lines.join('\n') || '    (empty)'}`
    })

    const unassigned = byMachine['UNASSIGNED'] || []
    return `MACHINES AND THEIR CURRENT BATCH QUEUE:
${machineBlocks.join('\n\n')}

UNASSIGNED BATCHES (no machine): ${unassigned.length}
${unassigned.map((b: any) => `  ${b.batch_id} | ${b.order?.party || '-'} | ${b.kg}kg`).join('\n') || '  none'}`
  } catch (err) {
    console.error('fetchSchedulerContext error:', err)
    return 'Scheduler context unavailable.'
  }
}

/** Cost Estimator tab — real orders with process route length and qty, optionally filtered by order number. */
export async function fetchCostContext(orderFilter?: string): Promise<string> {
  try {
    const oRes = await fetch('/api/orders?limit=1000', { cache: 'no-store' }).then(r => r.json())
    let orders: any[] = (oRes.data || []).filter((o: any) => o.status !== 'done')

    if (orderFilter && orderFilter.trim()) {
      const f = orderFilter.trim().toUpperCase()
      orders = orders.filter((o: any) => o.order_number?.toUpperCase().includes(f))
    }
    orders = orders.slice(0, 50)

    const lines = orders.map((o: any) =>
      `  ${o.order_number} | ${o.party} | ${o.article} | ${o.qty_kg}kg | blend:${o.blend || '-'} | route:${(o.process_route || []).join('/')} (${(o.process_route || []).length} steps) | finish:${o.type_of_finish || '-'}`
    )

    return `ORDERS FOR COST ESTIMATION (${orders.length} shown):
${lines.join('\n') || '  none matching'}`
  } catch (err) {
    console.error('fetchCostContext error:', err)
    return 'Cost context unavailable.'
  }
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
