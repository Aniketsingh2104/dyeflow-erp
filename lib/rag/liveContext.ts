/**
 * lib/rag/liveContext.ts — Live Supabase data for the RAG query route.
 * Server-side only. Two layers:
 *   getLiveSnapshot()    — always-included compact factory overview.
 *   getTargetedContext() — question-aware deep dive (order lookup, faulty/fob/
 *                          repair detail, delay detection) based on keywords
 *                          and patterns found in the user's question.
 *
 * Table/column names here match the verified live schema (see
 * lib/rag/knowledge_chunks.json, category "schema", for the full reference) —
 * not the (buggy) names used in app/api/context and app/api/snapshot.
 */
import { dbSelect } from '@/lib/supabase'
import { getLearnedDuration, getFaultyRisk, getFobRisk, getRecommendedMachine, getRecommendedRoute } from '@/lib/predictiveStats'

// Process code/name pairs from the live process_list (kept in sync manually —
// see knowledge_chunks.json glossary#process_codes for the fuller reference).
// Sorted longest-name-first so multi-word names match before shorter overlaps.
const PROCESS_CODES: { code: string; name: string }[] = [
  { code: 'C', name: 'CBR' }, { code: 'S', name: 'SCQ' }, { code: 'H', name: 'Heat-Set' },
  { code: 'D', name: 'Dyeing' }, { code: 'S2', name: 'SCQ2' }, { code: 'Rx', name: 'Relax' },
  { code: 'O', name: 'Opener' }, { code: 'G', name: 'Ghanti' }, { code: 'F', name: 'Finish' },
  { code: 'Co', name: 'Compactor' }, { code: 'Tu', name: 'Tubler' }, { code: 'Add', name: 'Addition' },
  { code: 'Lev', name: 'Levelling' }, { code: 'Rc', name: 'RC' }, { code: 'Fix', name: 'Fixing' },
  { code: 'Wash', name: 'Washing' }, { code: 'Dry', name: 'Dry' }, { code: 'B', name: 'Brushing' },
  { code: 'R', name: 'Raising' }, { code: 'K', name: 'Kundi' }, { code: 'Qa', name: 'QA' },
  { code: 'Packing', name: 'Packing' }, { code: 'Dispatch', name: 'Dispatch' }, { code: 'FD', name: 'Fix Dispatch' },
].sort((a, b) => b.name.length - a.name.length)

/** Finds a process code mentioned in free text, by name (preferred) or exact-case standalone code. */
function findProcessCode(question: string): string | null {
  for (const p of PROCESS_CODES) {
    if (new RegExp(`\\b${p.name.replace('-', '-?')}\\b`, 'i').test(question)) return p.code
  }
  for (const p of PROCESS_CODES) {
    if (new RegExp(`\\b${p.code}\\b`).test(question)) return p.code // case-sensitive: avoid 'a'/'i' false hits
  }
  return null
}

/** Finds an article code mentioned in free text, e.g. "A-1599", "A-1105/P-65", "C-672-76".
 * Captures compound codes with repeated -/ segments, not just the first prefix — without
 * this, "A-1105/P-65" would extract only "A-1105" and never exact-match the stored value.
 * NOTE: historical article text has heavy real-world variation (separators, smart quotes,
 * trailing notes like "(HARD FINISH)") — this only catches the clean-code case; see
 * lib/predictiveStats.ts and scripts/import-historical-data.js for the normalization gap. */
function findArticle(question: string): string | null {
  const m = question.match(/\b[A-Z]{1,3}-\d{3,5}[A-Z]?(?:[-\/][A-Z0-9]+)*\b/i)
  return m ? m[0].toUpperCase() : null
}

function today(): string {
  return new Date().toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
}

/** Always-included compact snapshot: counts, machine loads, supervisor loads, open faulty/fob. */
export async function getLiveSnapshot(): Promise<string> {
  const [ordersRes, batchesRes, machinesRes, supervisorsRes, faultyRes, fobRes, procRes] = await Promise.all([
    dbSelect(
      'orders',
      { order: 'created_at.desc', limit: '300' },
      'id,order_number,party,article,color,qty_kg,qty_mtr,status,hold_reason,hold_approval,supervisors(name),machines(name)'
    ),
    dbSelect(
      'batches',
      { order: 'created_at.desc', limit: '800' },
      'id,batch_id,order_id,kg,status,current_process,is_faulty,machines(name)'
    ),
    dbSelect('machines', { order: 'name.asc' }, 'id,name,capacity,status'),
    dbSelect('supervisors', { order: 'name.asc' }, 'id,name'),
    dbSelect(
      'faulty_records',
      { status: 'eq.repairing', order: 'created_at.desc', limit: '15' },
      'batch_id,order_number,party,faulty_type,faulty_kg,process_code,created_at'
    ),
    dbSelect(
      'fob_records',
      { status: 'eq.open', order: 'created_at.desc', limit: '15' },
      'batch_id,order_number,party,fob_type,fob_kg,process_code,created_at'
    ),
    dbSelect('process_list', { order: 'display_order.asc', limit: '50' }, 'code,name'),
  ])

  const orders: any[] = ordersRes.data || []
  const batches: any[] = batchesRes.data || []
  const machines: any[] = machinesRes.data || []
  const supervisors: any[] = supervisorsRes.data || []
  const faultyOpen: any[] = faultyRes.data || []
  const fobOpen: any[] = fobRes.data || []
  const processes: any[] = procRes.data || []

  const statusGroups: Record<string, number> = {}
  orders.forEach((o) => {
    statusGroups[o.status || 'unknown'] = (statusGroups[o.status || 'unknown'] || 0) + 1
  })

  const machineLoad: Record<string, { kg: number; count: number }> = {}
  for (const b of batches) {
    if (b.status === 'done') continue
    const mname = b.machines?.name || 'unassigned'
    if (!machineLoad[mname]) machineLoad[mname] = { kg: 0, count: 0 }
    machineLoad[mname].kg += parseFloat(b.kg) || 0
    machineLoad[mname].count++
  }
  const machineLines = machines.map((m) => {
    const load = machineLoad[m.name] || { kg: 0, count: 0 }
    const pct = m.capacity ? Math.min(100, Math.round((load.kg / m.capacity) * 100)) : 0
    return `  ${m.name}: capacity ${m.capacity ?? '?'}kg, currently ${Math.round(load.kg)}kg (${pct}%), ${load.count} active batch(es), status:${m.status || 'idle'}`
  })

  const supLoad: Record<string, number> = {}
  for (const o of orders) {
    if (o.status === 'done') continue
    const sup = o.supervisors?.name || 'Unassigned'
    supLoad[sup] = (supLoad[sup] || 0) + 1
  }
  const supLines = supervisors.map((s) => `  ${s.name}: ${supLoad[s.name] || 0} active order(s)`)

  // Per-order detail for everything still active — this is what lets the model
  // answer questions about a SPECIFIC order (color, qty, hold reason, etc.)
  // without the question needing to match an order-number regex. Capped at 50
  // most recent; getTargetedContext()'s hold-keyword handler covers the rest
  // at scale.
  const activeOrders = orders.filter((o) => o.status !== 'done').slice(0, 50)
  const orderLines = activeOrders.map((o) => {
    const holdInfo = o.status === 'hold' || o.hold_approval
      ? ` | ON HOLD (reason: ${o.hold_reason || 'not specified'}, approval: ${o.hold_approval || '-'})`
      : ''
    return `  ${o.order_number}: ${o.party} | ${o.article || '-'} | color:${o.color || '-'} | ${o.qty_kg ?? '-'}kg${o.qty_mtr ? '/' + o.qty_mtr + 'mtr' : ''} | status:${o.status} | supervisor:${o.supervisors?.name || '-'} | machine:${o.machines?.name || '-'}${holdInfo}`
  })

  return `TODAY: ${today()}
LIVE FACTORY SNAPSHOT (from Supabase, just now)
Orders: ${orders.length} total — ${Object.entries(statusGroups).map(([s, n]) => `${s}:${n}`).join(', ') || 'none'}
Batches: ${batches.length} total, ${batches.filter((b) => b.is_faulty).length} flagged faulty
Process codes in use: ${processes.map((p) => p.code).join(', ') || 'unknown'}

Machines (${machines.length}):
${machineLines.join('\n') || '  none configured'}

Supervisors (${supervisors.length}):
${supLines.join('\n') || '  none configured'}

ACTIVE ORDERS (${orders.filter((o) => o.status !== 'done').length} active, showing ${activeOrders.length} most recent):
${orderLines.join('\n') || '  none active'}

Open faulty records (${faultyOpen.length} shown, most recent):
${faultyOpen.map((r) => `  ${r.batch_id} — order ${r.order_number} (${r.party}) — ${r.faulty_type || 'unspecified'} at ${r.process_code}`).join('\n') || '  none open'}

Open FOB records (${fobOpen.length} shown, most recent):
${fobOpen.map((r) => `  ${r.batch_id} — order ${r.order_number} (${r.party}) — ${r.fob_type || 'unspecified'} at ${r.process_code}`).join('\n') || '  none open'}`
}

/** Keyword/pattern-driven targeted deep-dive based on what the question is actually asking about. */
export async function getTargetedContext(question: string): Promise<string> {
  const q = question.toLowerCase()
  const sections: string[] = []

  // 1) Specific order/batch number mentioned, e.g. DYE26-0001 or DYE26-0001-B1-R
  const orderMatch = question.match(/[A-Z]{2,8}\d{2}-\d{3,6}(-B\d+(-R)?)?/i)
  if (orderMatch) {
    const orderNumber = orderMatch[0].toUpperCase().split('-B')[0]
    const { data: orders } = await dbSelect(
      'orders',
      { order_number: `eq.${orderNumber}` },
      'id,order_number,party,article,color,shade_group,qty_kg,qty_mtr,status,process_route,delivery_date,hold_reason,supervisors(name),machines(name)'
    )
    const order = orders?.[0] as any
    if (order) {
      const { data: batches } = await dbSelect(
        'batches',
        { order_id: `eq.${order.id}` },
        'batch_id,kg,status,current_process,is_faulty,machines(name)'
      )
      sections.push(`ORDER ${order.order_number} (matched from question):
  Party: ${order.party} | Article: ${order.article} | Color: ${order.color} | Shade: ${order.shade_group || '-'}
  Qty: ${order.qty_kg}kg${order.qty_mtr ? ` / ${order.qty_mtr}mtr` : ''} | Status: ${order.status}
  Route: ${(order.process_route || []).join(' → ') || '-'}
  Supervisor: ${order.supervisors?.name || '-'} | Machine: ${order.machines?.name || '-'}
  Delivery date: ${order.delivery_date || '-'} | Hold: ${order.hold_reason || 'none'}
  Batches (${(batches || []).length}):
${(batches || []).map((b: any) => `    ${b.batch_id}: ${b.kg}kg, status:${b.status}, at:${b.current_process || '-'}, machine:${b.machines?.name || '-'}${b.is_faulty ? ', FAULTY' : ''}`).join('\n') || '    none split yet'}`)
    } else {
      sections.push(`ORDER ${orderNumber} was mentioned in the question but no matching order was found in the live database — double check the order number.`)
    }
  }

  // 2) Faulty detail
  if (/faulty|defect/.test(q)) {
    const { data } = await dbSelect(
      'faulty_records',
      { order: 'created_at.desc', limit: '20' },
      'batch_id,order_number,party,faulty_type,faulty_kg,process_code,status,reprocess_type,next_process,created_at'
    )
    sections.push(`FAULTY RECORDS (most recent ${(data || []).length}):
${(data || []).map((r: any) => `  ${r.batch_id} | ${r.order_number} | ${r.party} | type:${r.faulty_type || '-'} | ${r.faulty_kg}kg at ${r.process_code} | status:${r.status} | reprocess:${r.reprocess_type || '-'}→${r.next_process || '-'}`).join('\n') || '  none'}`)
  }

  // 3) FOB detail
  if (/\bfob\b/.test(q)) {
    const { data } = await dbSelect(
      'fob_records',
      { order: 'created_at.desc', limit: '20' },
      'batch_id,order_number,party,fob_type,fob_kg,process_code,status,approved_at,reprocess_type,next_process,created_at'
    )
    sections.push(`FOB RECORDS (most recent ${(data || []).length}):
${(data || []).map((r: any) => `  ${r.batch_id} | ${r.order_number} | ${r.party} | type:${r.fob_type || '-'} | ${r.fob_kg}kg at ${r.process_code} | status:${r.status} | approved:${r.approved_at || 'no'} | reprocess:${r.reprocess_type || '-'}→${r.next_process || '-'}`).join('\n') || '  none'}`)
  }

  // 4) Repair detail
  if (/repair/.test(q)) {
    const { data } = await dbSelect(
      'repairing_orders',
      { order: 'created_at.desc', limit: '20' },
      'batch_id,order_id,repair_kg,status,source_type,machine_id,created_at'
    )
    sections.push(`REPAIRING ORDERS (most recent ${(data || []).length}):
${(data || []).map((r: any) => `  batch:${r.batch_id || '-'} | ${r.repair_kg}kg | status:${r.status} | source:${r.source_type || '-'}`).join('\n') || '  none'}`)
  }

  // 4b) Hold orders — uncapped, precise query (the snapshot's ACTIVE ORDERS
  // section already shows hold info per-order, but is capped at 50; this
  // covers the exact question at any scale).
  if (/\bhold\b/.test(q)) {
    const { data } = await dbSelect(
      'orders',
      { order: 'created_at.desc', limit: '100' },
      'order_number,party,article,color,qty_kg,qty_mtr,status,hold_reason,hold_approval,supervisors(name)'
    )
    const held = (data || []).filter((o: any) => o.status === 'hold' || o.hold_approval)
    sections.push(`ORDERS ON HOLD (${held.length}):
${held.map((o: any) => `  ${o.order_number} | ${o.party} | ${o.article || '-'} | color:${o.color || '-'} | ${o.qty_kg ?? '-'}kg${o.qty_mtr ? '/' + o.qty_mtr + 'mtr' : ''} | reason:${o.hold_reason || 'not specified'} | approval:${o.hold_approval || '-'} | supervisor:${o.supervisors?.name || '-'}`).join('\n') || '  none currently on hold'}`)
  }

  // 5) Delay / overdue / stuck detection — batches past their process's default_days
  if (/overdue|delay|late|stuck|behind/.test(q)) {
    const [{ data: batches }, { data: orders }, { data: procs }] = await Promise.all([
      dbSelect('batches', { status: 'neq.done', limit: '1000' }, 'id,batch_id,order_id,status,current_process,fms_enter_at'),
      dbSelect('orders', { limit: '1000' }, 'id,order_number,party,supervisors(name)'),
      dbSelect('process_list', {}, 'code,default_days'),
    ])
    const orderMap: Record<string, any> = {}
    for (const o of orders || []) orderMap[(o as any).id] = o
    const defaultDays: Record<string, number> = {}
    for (const p of procs || []) defaultDays[(p as any).code] = (p as any).default_days || 1

    const now = Date.now()
    const stuck = (batches || [])
      .map((b: any) => {
        const proc = b.current_process
        if (!proc) return null
        const enterAt = (b.fms_enter_at || {})[proc]
        if (!enterAt) return null
        const daysStuck = Math.floor((now - new Date(enterAt).getTime()) / 86400000)
        const expected = defaultDays[proc] || 1
        if (daysStuck <= expected) return null
        const order = orderMap[b.order_id] || {}
        return { batchId: b.batch_id, proc, daysStuck, expected, orderNo: order.order_number, party: order.party, supervisor: order.supervisors?.name }
      })
      .filter(Boolean)
      .sort((a: any, b: any) => b.daysStuck - a.daysStuck)
      .slice(0, 15)

    sections.push(`DELAY / STUCK-BATCH CHECK (batches past expected time at their current process):
${stuck.map((s: any) => `  ${s.batchId} stuck at ${s.proc} for ${s.daysStuck}d (expected ${s.expected}d) — order ${s.orderNo}, ${s.party}, supervisor ${s.supervisor || '-'}`).join('\n') || '  none currently overdue at their process stage'}`)
  }

  // 6) Learned duration prediction — "how long", "eta", "predict"/"estimate" + a process
  if (/how long|predict|estimate|eta\b/.test(q)) {
    const processCode = findProcessCode(question)
    if (processCode) {
      const article = findArticle(question) || undefined
      const est = await getLearnedDuration(processCode, article)
      sections.push(`LEARNED DURATION PREDICTION for process ${est.processCode}${est.article ? ` (article ${est.article})` : ''}:
  Estimate: ${est.estimatedDays} day(s) | confidence: ${est.confidence} | sample size: ${est.sampleSize}
  ${est.basis}
  (This is a live statistical estimate from real completed batches, not a fixed rule — treat 'default' confidence as "we don't have enough history yet", not as a guarantee.)`)
    }
  }

  // 7) Faulty-risk prediction — "risk", "likely to"/"chance of" + faulty/defect
  if ((/\brisk\b|likely.*(faulty|defect|fail)|chance of (faulty|defect)/.test(q)) && !/\bfob\b/.test(q)) {
    const article = findArticle(question) || undefined
    const risk = await getFaultyRisk(article)
    const reasonLine = risk.topReasons.length > 0
      ? `  Most common historical reasons: ${risk.topReasons.map((r) => `"${r.value}" (${r.count}x)`).join(', ')}`
      : '  No historical reason data available for this segment.'
    sections.push(`FAULTY-RISK PREDICTION${risk.article ? ` for article ${risk.article}` : ' (factory-wide)'}:
  Estimated risk: ${(risk.riskRate * 100).toFixed(1)}% | factory-wide average: ${(risk.factoryAverageRate * 100).toFixed(1)}% | confidence: ${risk.confidence} | sample size: ${risk.sampleSize}
${reasonLine}
  ${risk.basis}
  (This is a live statistical estimate, not a fixed rule — treat 'default' confidence as "we don't have enough history yet" for this specific segment.)`)
  }

  // 8) FOB-risk prediction — "risk"/"likely" + fob
  if (/\bfob\b/.test(q) && (/\brisk\b|likely|chance/.test(q))) {
    const article = findArticle(question) || undefined
    const risk = await getFobRisk(article)
    const reasonLine = risk.topReasons.length > 0
      ? `  Most common historical reasons: ${risk.topReasons.map((r) => `"${r.value}" (${r.count}x)`).join(', ')}`
      : '  No historical reason data available for this segment.'
    sections.push(`FOB-RISK PREDICTION${risk.article ? ` for article ${risk.article}` : ' (factory-wide)'}:
  Estimated risk: ${(risk.riskRate * 100).toFixed(1)}% | factory-wide average: ${(risk.factoryAverageRate * 100).toFixed(1)}% | confidence: ${risk.confidence} | sample size: ${risk.sampleSize}
${reasonLine}
  ${risk.basis}
  (This is a live statistical estimate, not a fixed rule — treat 'default' confidence as "we don't have enough history yet" for this specific segment.)`)
  }

  // 9) Machine recommendation — "which machine", "recommend" + machine, "typical machine"
  if (/which machine|recommend.*machine|typical machine|usual machine|best machine/.test(q)) {
    const article = findArticle(question)
    if (article) {
      const rec = await getRecommendedMachine(article)
      sections.push(`MACHINE RECOMMENDATION for article ${rec.article}:
  Recommended: ${rec.recommendedMachine || 'no historical data'} | confidence: ${rec.confidence} | sample size: ${rec.sampleSize}
  Alternatives seen historically: ${rec.alternatives.map((a) => `${a.value} (${a.count}x)`).join(', ') || 'none'}
  ${rec.basis}
  (Based on the imported historical dataset only — live machine-assignment data isn't blended in yet due to a naming-convention mismatch between live and historical machine names.)`)
    }
  }

  // 10) Route recommendation — "which route", "recommend" + route, "typical route"
  if (/which (process )?route|recommend.*route|typical route|usual route/.test(q)) {
    const article = findArticle(question)
    if (article) {
      const rec = await getRecommendedRoute(article)
      sections.push(`PROCESS ROUTE RECOMMENDATION for article ${rec.article}:
  Recommended: ${rec.recommendedRoute || 'no historical data'} | confidence: ${rec.confidence} | sample size: ${rec.sampleSize}
  Alternatives seen historically: ${rec.alternatives.map((a) => `${a.value} (${a.count}x)`).join(', ') || 'none'}
  ${rec.basis}
  (Based on the imported historical dataset only, using its own short-code notation, e.g. 'D/F' — not blended with live process_route data.)`)
    }
  }

  return sections.join('\n\n')
}
