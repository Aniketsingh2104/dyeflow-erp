/**
 * lib/predictiveStats.ts — Live, statistics-based predictions for DyeFlow.
 *
 * NOT a trained ML model. Every function below queries current Supabase
 * data directly on each call and computes simple averages/rates/frequency
 * counts, with shrinkage toward a wider average when the specific sample
 * size is small. This means:
 *   - No training pipeline, no stored model file, nothing to retrain.
 *   - Predictions automatically improve as more real work gets logged —
 *     there's nothing to "re-run", the next call just sees more rows.
 *   - Every result reports its own sample size and a confidence label, so
 *     nothing is ever presented as more certain than the data supports.
 *
 * Data sources:
 *   - audit_log (action='process_done') — the only place batch/process
 *     transition timestamps are actually recorded live. batch_processes.
 *     sent_at/received_at and batches.fms_enter_at are NOT populated by the
 *     current FMS pages — do not use them here.
 *   - faulty_records / fob_records — structured live exception events.
 *   - batches / orders / process_list — article, machine, and default
 *     fallback duration lookups.
 *   - historical_batches / historical_faulty / historical_fob — imported
 *     from the pre-DyeFlow Excel history (40k+ batches spanning ~2 years).
 *     This is the primary signal for machine/route recommendation and for
 *     faulty/FOB risk, since live volume is still small. Kept in its own
 *     tables (see scripts/import-historical-data.js), joined in here by
 *     article/colour, never merged into the live orders/batches tables.
 *
 * KNOWN LIMITATION — machine naming mismatch: live `machines.name` uses
 * full names ("Long Tube Jet No. 24"), historical data uses short codes
 * ("LJET-24"). These are not string-matchable without a mapping table, so
 * getRecommendedMachine() draws on historical data only for now — live
 * machine assignments aren't blended in. Same caveat for process routes:
 * live orders.process_route is an array of codes (['O','D','H']), historical
 * process_route is a slash-joined string ("D/F") — different formats, not
 * blended.
 */
import { dbSelect } from '@/lib/supabase'

export interface DurationEstimate {
  processCode: string
  article: string | null
  estimatedDays: number
  sampleSize: number
  confidence: 'learned' | 'shrunk' | 'default'
  basis: string
}

export interface RiskEstimate {
  article: string | null
  colour: string | null
  riskRate: number // 0–1
  sampleSize: number
  factoryAverageRate: number
  confidence: 'learned' | 'shrunk' | 'default'
  basis: string
  topReasons: { value: string; count: number }[]
}

export interface MachineRecommendation {
  article: string
  colour: string | null
  recommendedMachine: string | null
  sampleSize: number
  confidence: 'learned' | 'shrunk' | 'default'
  basis: string
  alternatives: { value: string; count: number }[]
}

export interface RouteRecommendation {
  article: string
  colour: string | null
  recommendedRoute: string | null
  sampleSize: number
  confidence: 'learned' | 'shrunk' | 'default'
  basis: string
  alternatives: { value: string; count: number }[]
}

const MIN_SAMPLES_FOR_CONFIDENT = 5
const MIN_SAMPLES_FOR_SHRUNK = 2
const DEDUP_WINDOW_MS = 60 * 60 * 1000 // collapse re-logged duplicate audit_log entries within 1h
const MAX_SANE_DURATION_DAYS = 60 // guard against bad/backdated data producing absurd durations

/** Case-insensitive frequency count over free-text values, keeping a readable display casing. */
function topByFrequency(values: (string | null | undefined)[], limit = 3): { value: string; count: number }[] {
  const counts: Record<string, { display: string; count: number }> = {}
  for (const v of values) {
    if (!v) continue
    const trimmed = v.trim()
    if (!trimmed) continue
    const key = trimmed.toUpperCase()
    if (!counts[key]) counts[key] = { display: trimmed, count: 0 }
    counts[key].count++
  }
  return Object.values(counts)
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
    .map((x) => ({ value: x.display, count: x.count }))
}

interface DurationSample {
  batchId: string
  processCode: string
  days: number
  article: string | null
}

/**
 * Reconstructs per-process durations from audit_log's process_done events.
 * Each process_done row means "batch left old_value and entered new_value at
 * created_at" — so the duration of old_value = this event's time minus the
 * time of the batch's previous transition (or batches.created_at if it's the
 * batch's first logged transition). The live FMS UI has been observed to log
 * the same transition multiple times within minutes (re-clicks/reloads), so
 * near-duplicate consecutive events for the same batch are collapsed first.
 */
async function collectDurationSamples(): Promise<DurationSample[]> {
  const { data: events } = await dbSelect(
    'audit_log',
    { action: 'eq.process_done', entity_type: 'eq.batch', order: 'entity_id.asc,created_at.asc', limit: '5000' },
    'entity_id,old_value,new_value,created_at'
  )
  if (!events || events.length === 0) return []

  const { data: batches } = await dbSelect('batches', { limit: '2000' }, 'id,order_id,created_at')
  const batchStart: Record<string, string> = {}
  const batchOrder: Record<string, string> = {}
  for (const b of (batches || []) as any[]) {
    batchStart[b.id] = b.created_at
    batchOrder[b.id] = b.order_id
  }

  const { data: orders } = await dbSelect('orders', { limit: '1000' }, 'id,article')
  const orderArticle: Record<string, string> = {}
  for (const o of (orders || []) as any[]) orderArticle[o.id] = o.article

  const byBatch: Record<string, { old_value: string; new_value: string; created_at: string }[]> = {}
  for (const e of events as any[]) {
    if (!e.old_value) continue
    if (!byBatch[e.entity_id]) byBatch[e.entity_id] = []
    byBatch[e.entity_id].push(e)
  }

  const samples: DurationSample[] = []
  for (const [batchId, evts] of Object.entries(byBatch)) {
    const deduped: typeof evts = []
    for (const e of evts) {
      const last = deduped[deduped.length - 1]
      if (
        last &&
        last.old_value === e.old_value &&
        last.new_value === e.new_value &&
        Math.abs(new Date(e.created_at).getTime() - new Date(last.created_at).getTime()) < DEDUP_WINDOW_MS
      ) {
        continue
      }
      deduped.push(e)
    }

    let prevTime = batchStart[batchId] ? new Date(batchStart[batchId]).getTime() : null
    for (const e of deduped) {
      const doneTime = new Date(e.created_at).getTime()
      if (prevTime != null) {
        const days = (doneTime - prevTime) / 86400000
        if (days > 0 && days < MAX_SANE_DURATION_DAYS) {
          samples.push({ batchId, processCode: e.old_value, days, article: orderArticle[batchOrder[batchId]] || null })
        }
      }
      prevTime = doneTime
    }
  }
  return samples
}

const avgDays = (arr: DurationSample[]) => arr.reduce((s, x) => s + x.days, 0) / arr.length

/** Pure computation from an already-fetched sample set — shared by the single
 *  and batch entry points so batch callers don't refetch audit_log/batches/
 *  orders once per pair. */
function computeDurationEstimate(
  processCode: string,
  article: string | undefined,
  samples: DurationSample[],
  defaultDays: number
): DurationEstimate {
  const forProcess = samples.filter((s) => s.processCode === processCode)
  const forProcessArticle = article ? forProcess.filter((s) => s.article === article) : []

  if (article && forProcessArticle.length >= MIN_SAMPLES_FOR_CONFIDENT) {
    return {
      processCode,
      article,
      estimatedDays: Math.round(avgDays(forProcessArticle) * 10) / 10,
      sampleSize: forProcessArticle.length,
      confidence: 'learned',
      basis: `Learned from ${forProcessArticle.length} completed ${processCode} stages on article ${article}.`,
    }
  }
  if (forProcess.length >= MIN_SAMPLES_FOR_CONFIDENT) {
    return {
      processCode,
      article: article || null,
      estimatedDays: Math.round(avgDays(forProcess) * 10) / 10,
      sampleSize: forProcess.length,
      confidence: article ? 'shrunk' : 'learned',
      basis: article
        ? `Not enough article-specific history (${forProcessArticle.length} samples) for ${article} — using the factory-wide average for ${processCode} (${forProcess.length} samples) instead.`
        : `Learned from ${forProcess.length} completed ${processCode} stages across all articles.`,
    }
  }
  if (forProcess.length >= MIN_SAMPLES_FOR_SHRUNK) {
    const blended =
      (avgDays(forProcess) * forProcess.length + defaultDays * MIN_SAMPLES_FOR_CONFIDENT) /
      (forProcess.length + MIN_SAMPLES_FOR_CONFIDENT)
    return {
      processCode,
      article: article || null,
      estimatedDays: Math.round(blended * 10) / 10,
      sampleSize: forProcess.length,
      confidence: 'shrunk',
      basis: `Only ${forProcess.length} historical sample(s) for ${processCode} — blended with the factory default (${defaultDays}d) rather than trusting a thin sample.`,
    }
  }
  return {
    processCode,
    article: article || null,
    estimatedDays: defaultDays,
    sampleSize: forProcess.length,
    confidence: 'default',
    basis: `No usable historical duration data yet for ${processCode} — using the factory default of ${defaultDays} day(s).`,
  }
}

/** Learned duration for a process code, optionally narrowed to one article. */
export async function getLearnedDuration(processCode: string, article?: string): Promise<DurationEstimate> {
  const samples = await collectDurationSamples()
  const { data: procRows } = await dbSelect('process_list', { code: `eq.${processCode}` }, 'default_days')
  const defaultDays = (procRows?.[0] as any)?.default_days ?? 1
  return computeDurationEstimate(processCode, article, samples, defaultDays)
}

/** Batched version — computes MANY duration estimates from ONE sample fetch
 *  instead of one fetch per pair. Use this whenever you need several
 *  estimates at once (e.g. Delay Predictor estimating remaining time across
 *  every active order) to avoid redundant full-table Supabase reloads. */
export async function getLearnedDurationBatch(
  pairs: { processCode: string; article?: string }[]
): Promise<DurationEstimate[]> {
  if (pairs.length === 0) return []
  const [samples, procRes] = await Promise.all([
    collectDurationSamples(),
    dbSelect('process_list', {}, 'code,default_days'),
  ])
  const defaultDaysMap: Record<string, number> = {}
  for (const p of (procRes.data || []) as any[]) defaultDaysMap[p.code] = p.default_days || 1
  return pairs.map(({ processCode, article }) => computeDurationEstimate(processCode, article, samples, defaultDaysMap[processCode] ?? 1))
}

// ── Faulty/FOB risk ── shared pool loader + pure compute, same reasoning as above:
// getFaultyRisk/getFobRisk each used to refetch live+historical data (up to
// ~57k rows) on every call. The *Batch variants let Faulty Analyzer compute
// risk for a dozen+ articles from ONE fetch instead of a dozen+ full reloads.

interface RiskPool {
  kind: 'faulty' | 'fob'
  liveAll: any[]
  liveFlaggedIds: Set<string>
  articleByOrderId: Record<string, string>
  colourByOrderId: Record<string, string>
  histAll: any[]
  histFlaggedNos: Set<string>
  histReasons: { article: string | null; colour: string | null; reason: string | null }[]
  totalBatches: number
  totalFlagged: number
  factoryAverageRate: number
}

async function loadRiskPool(kind: 'faulty' | 'fob'): Promise<RiskPool> {
  const liveTable = kind === 'faulty' ? 'faulty_records' : 'fob_records'
  const histTable = kind === 'faulty' ? 'historical_faulty' : 'historical_fob'
  const histCols = kind === 'faulty' ? 'batch_no,article,colour,faulty_type,faulty_remark' : 'batch_no,article,colour,fob_reason'

  const [{ data: liveFlaggedRows }, { data: liveBatches }, { data: liveOrders }, { data: histBatches }, { data: histRows }] =
    await Promise.all([
      dbSelect(liveTable, { limit: '2000' }, 'batch_id'),
      dbSelect('batches', { limit: '2000' }, 'id,order_id'),
      dbSelect('orders', { limit: '1000' }, 'id,article,color'),
      dbSelect('historical_batches', { limit: '50000' }, 'batch_no,article,colour'),
      dbSelect(histTable, { limit: '5000' }, histCols),
    ])

  const articleByOrderId: Record<string, string> = {}
  const colourByOrderId: Record<string, string> = {}
  for (const o of (liveOrders || []) as any[]) {
    articleByOrderId[o.id] = o.article
    colourByOrderId[o.id] = o.color
  }
  const liveFlaggedIds = new Set((liveFlaggedRows || []).map((r: any) => r.batch_id).filter(Boolean))
  const liveAll = (liveBatches || []) as any[]

  const histAll = (histBatches || []) as any[]
  const histFlaggedNos = new Set((histRows || []).map((r: any) => r.batch_no).filter(Boolean))
  const histReasons = (histRows || []).map((r: any) => ({
    article: r.article || null,
    colour: r.colour || null,
    reason: kind === 'faulty' ? (r.faulty_remark || r.faulty_type || null) : (r.fob_reason || null),
  }))

  const totalBatches = liveAll.length + histAll.length
  const totalFlagged = liveFlaggedIds.size + histFlaggedNos.size
  const factoryAverageRate = totalBatches > 0 ? totalFlagged / totalBatches : 0

  return { kind, liveAll, liveFlaggedIds, articleByOrderId, colourByOrderId, histAll, histFlaggedNos, histReasons, totalBatches, totalFlagged, factoryAverageRate }
}

function computeRiskFromPool(pool: RiskPool, article?: string, colour?: string): RiskEstimate {
  const label = pool.kind === 'faulty' ? 'faulty' : 'FOB'
  const everLabel = pool.kind === 'faulty' ? 'ever faulty' : 'ever sent to FOB'

  const liveSegment = pool.liveAll.filter((b) => {
    if (article && pool.articleByOrderId[b.order_id] !== article) return false
    if (colour && pool.colourByOrderId[b.order_id] !== colour) return false
    return true
  })
  const liveFlaggedInSegment = liveSegment.filter((b) => pool.liveFlaggedIds.has(b.id)).length

  const histSegment = pool.histAll.filter((b: any) => {
    if (article && b.article !== article) return false
    if (colour && b.colour !== colour) return false
    return true
  })
  const histFlaggedInSegment = histSegment.filter((b: any) => pool.histFlaggedNos.has(b.batch_no)).length

  const segmentSize = liveSegment.length + histSegment.length
  const segmentFlaggedCount = liveFlaggedInSegment + histFlaggedInSegment
  const rawRate = segmentSize > 0 ? segmentFlaggedCount / segmentSize : 0

  const reasonPool = pool.histReasons
    .filter((r) => (!article || r.article === article) && (!colour || r.colour === colour))
    .map((r) => r.reason)
  const topReasons = topByFrequency(reasonPool, 3)

  const base = { article: article || null, colour: colour || null, factoryAverageRate: Math.round(pool.factoryAverageRate * 1000) / 1000, topReasons }

  if (segmentSize >= MIN_SAMPLES_FOR_CONFIDENT) {
    return {
      ...base,
      riskRate: Math.round(rawRate * 1000) / 1000,
      sampleSize: segmentSize,
      confidence: 'learned',
      basis: `Learned from ${segmentSize} batches matching this segment (${liveSegment.length} live, ${histSegment.length} historical).`,
    }
  }
  if (segmentSize >= MIN_SAMPLES_FOR_SHRUNK) {
    const blended = (rawRate * segmentSize + pool.factoryAverageRate * MIN_SAMPLES_FOR_CONFIDENT) / (segmentSize + MIN_SAMPLES_FOR_CONFIDENT)
    return {
      ...base,
      riskRate: Math.round(blended * 1000) / 1000,
      sampleSize: segmentSize,
      confidence: 'shrunk',
      basis: `Only ${segmentSize} batch(es) for this segment — blended with the factory-wide ${label} rate rather than trusting a thin sample.`,
    }
  }
  return {
    ...base,
    riskRate: Math.round(pool.factoryAverageRate * 1000) / 1000,
    sampleSize: segmentSize,
    confidence: 'default',
    basis: `No usable data yet for this specific segment — using the factory-wide ${label} rate (${pool.totalBatches} batches, ${pool.totalFlagged} ${everLabel}).`,
  }
}

/** Faulty-risk rate for an article (optionally + colour), blending live faulty_records with imported historical_faulty. */
export async function getFaultyRisk(article?: string, colour?: string): Promise<RiskEstimate> {
  const pool = await loadRiskPool('faulty')
  return computeRiskFromPool(pool, article, colour)
}

/** Batched version — one pool fetch covering many (article, colour) segments at once. */
export async function getFaultyRiskBatch(segments: { article?: string; colour?: string }[]): Promise<RiskEstimate[]> {
  if (segments.length === 0) return []
  const pool = await loadRiskPool('faulty')
  return segments.map((s) => computeRiskFromPool(pool, s.article, s.colour))
}

/** FOB-risk rate for an article (optionally + colour), blending live fob_records with imported historical_fob. */
export async function getFobRisk(article?: string, colour?: string): Promise<RiskEstimate> {
  const pool = await loadRiskPool('fob')
  return computeRiskFromPool(pool, article, colour)
}

/** Batched version — one pool fetch covering many (article, colour) segments at once. */
export async function getFobRiskBatch(segments: { article?: string; colour?: string }[]): Promise<RiskEstimate[]> {
  if (segments.length === 0) return []
  const pool = await loadRiskPool('fob')
  return segments.map((s) => computeRiskFromPool(pool, s.article, s.colour))
}

/** Recommended dyeing machine for a batch type (article, optionally + colour). Historical data only — see file header on the machine-naming mismatch. */
export async function getRecommendedMachine(article: string, colour?: string): Promise<MachineRecommendation> {
  const { data: articleRows } = await dbSelect(
    'historical_batches',
    { article: `eq.${article}` },
    'colour,dyeing_machine'
  )
  const rows = (articleRows || []) as any[]
  const withColour = colour ? rows.filter((r) => r.colour === colour).map((r) => r.dyeing_machine) : []
  const articleOnly = rows.map((r) => r.dyeing_machine)

  const build = (arr: string[], conf: MachineRecommendation['confidence'], basis: string): MachineRecommendation => {
    const top = topByFrequency(arr, 3)
    return { article, colour: colour || null, recommendedMachine: top[0]?.value || null, sampleSize: arr.length, confidence: conf, basis, alternatives: top }
  }

  if (colour && withColour.filter(Boolean).length >= MIN_SAMPLES_FOR_CONFIDENT) {
    return build(withColour, 'learned', `Learned from ${withColour.filter(Boolean).length} historical batches of ${article} in ${colour}.`)
  }
  const articleFilled = articleOnly.filter(Boolean)
  if (articleFilled.length >= MIN_SAMPLES_FOR_CONFIDENT) {
    return build(
      articleOnly,
      colour ? 'shrunk' : 'learned',
      colour
        ? `Not enough ${colour}-specific history — using all ${article} batches (${articleFilled.length} samples) regardless of colour.`
        : `Learned from ${articleFilled.length} historical batches of ${article}.`
    )
  }
  if (articleFilled.length >= MIN_SAMPLES_FOR_SHRUNK) {
    return build(articleOnly, 'shrunk', `Only ${articleFilled.length} historical sample(s) for ${article} — treat this as a rough lead, not a confident recommendation.`)
  }
  return {
    article, colour: colour || null, recommendedMachine: null, sampleSize: articleFilled.length, confidence: 'default',
    basis: `No historical machine-assignment data found for article "${article}".`,
    alternatives: [],
  }
}

/** Recommended process route for a batch type (article, optionally + colour). Historical data only — see file header on the route-format mismatch. */
export async function getRecommendedRoute(article: string, colour?: string): Promise<RouteRecommendation> {
  const { data: articleRows } = await dbSelect(
    'historical_batches',
    { article: `eq.${article}` },
    'colour,process_route'
  )
  const rows = (articleRows || []) as any[]
  const withColour = colour ? rows.filter((r) => r.colour === colour).map((r) => r.process_route) : []
  const articleOnly = rows.map((r) => r.process_route)

  const build = (arr: string[], conf: RouteRecommendation['confidence'], basis: string): RouteRecommendation => {
    const top = topByFrequency(arr, 3)
    return { article, colour: colour || null, recommendedRoute: top[0]?.value || null, sampleSize: arr.length, confidence: conf, basis, alternatives: top }
  }

  if (colour && withColour.filter(Boolean).length >= MIN_SAMPLES_FOR_CONFIDENT) {
    return build(withColour, 'learned', `Learned from ${withColour.filter(Boolean).length} historical batches of ${article} in ${colour}.`)
  }
  const articleFilled = articleOnly.filter(Boolean)
  if (articleFilled.length >= MIN_SAMPLES_FOR_CONFIDENT) {
    return build(
      articleOnly,
      colour ? 'shrunk' : 'learned',
      colour
        ? `Not enough ${colour}-specific history — using all ${article} batches (${articleFilled.length} samples) regardless of colour.`
        : `Learned from ${articleFilled.length} historical batches of ${article}.`
    )
  }
  if (articleFilled.length >= MIN_SAMPLES_FOR_SHRUNK) {
    return build(articleOnly, 'shrunk', `Only ${articleFilled.length} historical sample(s) for ${article} — treat this as a rough lead, not a confident recommendation.`)
  }
  return {
    article, colour: colour || null, recommendedRoute: null, sampleSize: articleFilled.length, confidence: 'default',
    basis: `No historical route data found for article "${article}".`,
    alternatives: [],
  }
}
