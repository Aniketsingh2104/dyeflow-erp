// Machine loading — the "Machine calculation sheet" in code.
//   Mtr/Kg          = 39370 ÷ Width(") ÷ GSM
//   Hot length      = Mtr/Kg × (1 + elongation %)          (elongation 14 %, Factory Settings)
//   Batch range     = machine size × min load % … size × max load %   (60 % … 80 %, Factory Settings)
//   Batches         = the fewest equal batches that each fall in the range; when no
//                     equal split fits, the split closest to the range (ties → fewer batches)
//   Loading Std Qty = cycle time × reel speed × nozzles ÷ hot length   (information only —
//                     used for the range only when the machine has no size)
//   Cycle needed    = (load ÷ nozzles) × hot length ÷ reel speed   (red above the nozzle table's
//                     upper cycle, e.g. 2.0 of "1.5-2.0")
// Example: 405 Kg on a 250 Kg machine → range 150–200 Kg → 2 batches 202 + 203
// (3 × 135 would be 15 Kg under the range, 2 × 202.5 only 2.5 Kg over).

export interface LoadingSettings { elongationPct: number; cycleTimeMin: number; minLoadPct: number; maxLoadPct: number }
export const DEFAULT_LOADING: LoadingSettings = { elongationPct: 14, cycleTimeMin: 1.7, minLoadPct: 60, maxLoadPct: 80 }

export function loadingSettingsFrom(factory: any): LoadingSettings {
  const num = (v: any, d: number) => { const n = parseFloat(v); return isFinite(n) && n > 0 ? n : d }
  return {
    elongationPct: num(factory?.elongationPct, DEFAULT_LOADING.elongationPct),
    cycleTimeMin:  num(factory?.cycleTimeMin,  DEFAULT_LOADING.cycleTimeMin),
    minLoadPct:    num(factory?.minLoadPct,    DEFAULT_LOADING.minLoadPct),
    maxLoadPct:    num(factory?.maxLoadPct,    DEFAULT_LOADING.maxLoadPct),
  }
}

/** Nozzle / pump table by GSM (Sheet2 of the calculation sheet) */
export interface NozzleRow { gsmFrom: number; gsmTo: number; nozzle: number; pumpRpm: number; cycle: string; pressure: string }
export const DEFAULT_NOZZLE_TABLE: NozzleRow[] = [
  { gsmFrom: 0,   gsmTo: 50,  nozzle: 70,  pumpRpm: 750,  cycle: '1.5-2.0', pressure: '0.7-1.2' },
  { gsmFrom: 51,  gsmTo: 110, nozzle: 80,  pumpRpm: 825,  cycle: '1.5-2.0', pressure: '0.7-1.2' },
  { gsmFrom: 111, gsmTo: 150, nozzle: 80,  pumpRpm: 900,  cycle: '1.5-2.0', pressure: '0.7-1.2' },
  { gsmFrom: 151, gsmTo: 180, nozzle: 90,  pumpRpm: 900,  cycle: '1.5-2.0', pressure: '0.7-1.2' },
  { gsmFrom: 181, gsmTo: 220, nozzle: 90,  pumpRpm: 975,  cycle: '1.5-2.0', pressure: '0.7-1.2' },
  { gsmFrom: 221, gsmTo: 260, nozzle: 90,  pumpRpm: 1000, cycle: '1.5-2.0', pressure: '0.7-1.2' },
  { gsmFrom: 261, gsmTo: 320, nozzle: 90,  pumpRpm: 1075, cycle: '1.5-2.0', pressure: '0.7-1.2' },
  { gsmFrom: 320, gsmTo: 350, nozzle: 124, pumpRpm: 1100, cycle: '1.5-2.0', pressure: '0.7-1.2' },
]
export function nozzleFor(gsm: number, table: NozzleRow[] = DEFAULT_NOZZLE_TABLE): NozzleRow | null {
  return table.find(r => gsm >= r.gsmFrom && gsm <= r.gsmTo) || null   // first match (320 → 261-320 row, as the sheet)
}

/** "58-59''" → 58, "130-135" → 130, '60"' → 60, "APC" / "-" → null (a range uses the LOWER value — safe side) */
export function lowerNumber(v: any): number | null {
  const nums = String(v ?? '').match(/\d+(\.\d+)?/g)
  if (!nums) return null
  const n = Math.min(...nums.map(Number))
  return isFinite(n) && n > 0 ? n : null
}

export interface MachineLoadData { id: string; name: string; capacity?: any; nozzles?: any; reel_speed?: any }

export interface LoadingResult {
  ok: boolean
  error?: string
  width?: number; gsm?: number
  mtrPerKg?: number; hotLength?: number
  stdLoad?: number | null          // by reel speed × nozzles — information (null: machine has no reel speed / nozzles)
  sizeMin?: number | null          // machine size × min load %
  sizeLimit?: number | null        // machine size × max load %
  minPerBatch?: number | null      // bottom of the batch range (null: machine has no size)
  maxPerBatch?: number             // top of the batch range
  basis?: 'size' | 'reel'
  note?: string
  nozzle?: NozzleRow | null
}

export function machineLoading(widthRaw: any, gsmRaw: any, m: MachineLoadData, s: LoadingSettings = DEFAULT_LOADING): LoadingResult {
  const width = lowerNumber(widthRaw), gsm = lowerNumber(gsmRaw)
  if (!width || width < 20 || width > 150) return { ok: false, error: `Width "${widthRaw ?? ''}" isn't a width in inches — split by hand or correct the order.` }
  if (!gsm || gsm < 20 || gsm > 800) return { ok: false, error: `GSM "${gsmRaw ?? ''}" isn't a GSM — split by hand or correct the order.` }
  const mtrPerKg = 39370 / width / gsm
  const hotLength = mtrPerKg * (1 + s.elongationPct / 100)
  const nozzles = parseFloat(m.nozzles) || 0, reel = parseFloat(m.reel_speed) || 0, size = parseFloat(m.capacity) || 0
  const stdLoad = nozzles > 0 && reel > 0 ? (s.cycleTimeMin * reel * nozzles) / hotLength : null
  const sizeLimit = size > 0 ? size * s.maxLoadPct / 100 : null
  if (stdLoad === null && sizeLimit === null) {
    return { ok: false, error: `${m.name} has no size and no reel speed / nozzles — fill them in Setup → Machine Master.` }
  }
  // the machine size decides; the reel speed decides only when there is no size
  const sizeMin = size > 0 ? size * s.minLoadPct / 100 : null
  const maxPerBatch = sizeLimit ?? (stdLoad as number)
  const minPerBatch = sizeMin
  const basis = sizeLimit !== null ? 'size' : 'reel'
  return {
    ok: true, width, gsm, mtrPerKg, hotLength, stdLoad, sizeMin, sizeLimit, minPerBatch, maxPerBatch, basis,
    note: sizeLimit === null ? 'no machine size — the batch limit is the reel speed only' : stdLoad === null ? 'no reel speed / nozzles — the cycle time can\'t be checked' : undefined,
    nozzle: nozzleFor(gsm),
  }
}

/** Upper cycle time of the nozzle row ("1.5-2.0" → 2.0); 2.0 when unknown */
export function maxCycleOf(row: NozzleRow | null | undefined): number {
  const nums = String(row?.cycle ?? '').match(/\d+(\.\d+)?/g)
  const n = nums ? Math.max(...nums.map(Number)) : NaN
  return isFinite(n) && n > 0 ? n : 2
}

/** cycle time (min) a load needs on this machine at its full reel speed */
export function cycleNeeded(kg: number, hotLength: number, nozzles: number, reelSpeed: number): number | null {
  if (!(nozzles > 0) || !(hotLength > 0) || !(reelSpeed > 0) || !(kg > 0)) return null
  return (kg / nozzles) * hotLength / reelSpeed
}

/** reel speed (m/min) a load needs on this machine */
export function reelSpeedNeeded(kg: number, hotLength: number, nozzles: number, s: LoadingSettings = DEFAULT_LOADING): number | null {
  if (!(nozzles > 0) || !(hotLength > 0)) return null
  return (kg / nozzles) * hotLength / s.cycleTimeMin
}

/** n equal batches, whole kg, the last one takes the remainder.  650 kg, 4 → 162, 162, 162, 164 */
export function splitInto(totalKg: number, n: number): number[] {
  if (!(totalKg > 0) || !(n >= 1)) return []
  const each = Math.floor(totalKg / n)
  const out = Array(n).fill(each)
  out[n - 1] = Math.round((totalKg - each * (n - 1)) * 100) / 100
  return out
}

/** Equal batches no heavier than maxPerBatch (no range).  650 kg, max 203 → 162, 162, 162, 164 */
export function equalBatches(totalKg: number, maxPerBatch: number): number[] {
  if (!(totalKg > 0) || !(maxPerBatch > 0)) return []
  return splitInto(totalKg, Math.max(1, Math.ceil(totalKg / maxPerBatch - 1e-9)))
}

/** The fewest equal batches that each fall in min…max; when none fits, the
 *  number of batches whose size is closest to the range (a tie → fewer batches).
 *  405 kg, 150–200 → 2 (202, 203);  600 → 3 × 200;  650 → 4 (162…164);  120 → 1 × 120 */
export function rangeBatches(totalKg: number, minPerBatch: number | null | undefined, maxPerBatch: number): number[] {
  if (!(totalKg > 0) || !(maxPerBatch > 0)) return []
  const min = minPerBatch && minPerBatch > 0 && minPerBatch <= maxPerBatch ? minPerBatch : 0
  if (!min) return equalBatches(totalKg, maxPerBatch)
  let best = 1, bestGap = Infinity
  const upTo = Math.min(500, Math.ceil(totalKg / min) + 1)
  for (let n = 1; n <= upTo; n++) {
    const each = totalKg / n
    const gap = each > maxPerBatch ? each - maxPerBatch : each < min ? min - each : 0
    if (gap < bestGap - 1e-9) { best = n; bestGap = gap }
    if (gap === 0) break
  }
  return splitInto(totalKg, best)
}
