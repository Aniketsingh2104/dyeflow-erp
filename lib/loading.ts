// Machine loading — the "Machine calculation sheet" in code.
//   Mtr/Kg          = 39370 ÷ Width(") ÷ GSM
//   Hot length      = Mtr/Kg × (1 + elongation %)          (elongation 14 %, Factory Settings)
//   Loading Std Qty = cycle time × reel speed × nozzles ÷ hot length   (cycle 1.7 min)
//   Max per batch   = the lower of Loading Std Qty and machine size × max load % (90 %)
//   Reel speed needed for a load = (load ÷ nozzles) × hot length ÷ cycle time
// Example: 58", 165 GSM, LJET-30 (280 m/min, 2 nozzles, 500 kg) → 4.11 m/kg,
// hot 4.69, std 203 kg, size limit 450 → 203 kg per batch.

export interface LoadingSettings { elongationPct: number; cycleTimeMin: number; maxLoadPct: number }
export const DEFAULT_LOADING: LoadingSettings = { elongationPct: 14, cycleTimeMin: 1.7, maxLoadPct: 90 }

export function loadingSettingsFrom(factory: any): LoadingSettings {
  const num = (v: any, d: number) => { const n = parseFloat(v); return isFinite(n) && n > 0 ? n : d }
  return {
    elongationPct: num(factory?.elongationPct, DEFAULT_LOADING.elongationPct),
    cycleTimeMin:  num(factory?.cycleTimeMin,  DEFAULT_LOADING.cycleTimeMin),
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
  stdLoad?: number | null          // by reel speed × nozzles (null: machine has no reel speed / nozzles)
  sizeLimit?: number | null        // machine size × max load %
  maxPerBatch?: number
  basis?: 'reel' | 'size' | 'both'
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
  const maxPerBatch = Math.min(...[stdLoad, sizeLimit].filter((x): x is number => x !== null))
  const basis = stdLoad !== null && sizeLimit !== null ? (stdLoad <= sizeLimit ? 'reel' : 'size') : stdLoad !== null ? 'reel' : 'size'
  return {
    ok: true, width, gsm, mtrPerKg, hotLength, stdLoad, sizeLimit, maxPerBatch, basis,
    note: stdLoad === null ? 'no reel speed / nozzles — machine size only' : sizeLimit === null ? 'no machine size — reel speed only' : undefined,
    nozzle: nozzleFor(gsm),
  }
}

/** reel speed (m/min) a load needs on this machine */
export function reelSpeedNeeded(kg: number, hotLength: number, nozzles: number, s: LoadingSettings = DEFAULT_LOADING): number | null {
  if (!(nozzles > 0) || !(hotLength > 0)) return null
  return (kg / nozzles) * hotLength / s.cycleTimeMin
}

/** Equal batches, whole kg, the last one takes the remainder.
 *  650 kg, max 203 → 4 batches: 162, 162, 162, 164 */
export function equalBatches(totalKg: number, maxPerBatch: number): number[] {
  if (!(totalKg > 0) || !(maxPerBatch > 0)) return []
  const n = Math.max(1, Math.ceil(totalKg / maxPerBatch - 1e-9))
  const each = Math.floor(totalKg / n)
  const out = Array(n).fill(each)
  out[n - 1] = Math.round((totalKg - each * (n - 1)) * 100) / 100
  return out
}
