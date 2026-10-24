/**
 * lib/workdays.ts — ONE working-day rule for the Date Calculator and the
 * machine sheets (they used to disagree about Sundays).
 *
 * Non-working days = Holiday Master dates, plus every Sunday when Factory
 * Settings → "Sunday is a holiday" is on (the default). To work a single
 * Sunday, turn that off and list the Sundays off in Holiday Master instead.
 */
import { addDaysYMD } from '@/lib/istDate'

const isSundayYMD = (ymd: string) => new Date(ymd + 'T00:00:00Z').getUTCDay() === 0

/**
 * The set of non-working days ('YYYY-MM-DD'): the holidays given, plus all
 * Sundays from 2024 to 2032 when sundayOff is true.
 */
export function buildHolidaySet(holidays: any[], sundayOff = true): Set<string> {
  const s = new Set<string>()
  for (const h of holidays || []) {
    const raw = typeof h === 'string' ? h : (h?.holiday_date || h?.date)
    if (raw) s.add(String(raw).slice(0, 10))
  }
  if (sundayOff) {
    let d = '2024-01-07'                       // a Sunday
    while (d < '2033-01-01') { s.add(d); d = addDaysYMD(d, 7) }
  }
  return s
}

export const isWorkingDay = (ymd: string, holidaySet: Set<string>) => !holidaySet.has(ymd)

/** The date `n` working days after `ymd` (n = 0 → ymd itself). */
export function addWorkingDays(ymd: string, n: number, holidaySet: Set<string>): string {
  if (!ymd || n < 0) return ymd
  let d = ymd, added = 0
  for (let guard = 0; added < n && guard < 5000; guard++) {
    d = addDaysYMD(d, 1)
    if (!holidaySet.has(d)) added++
  }
  return d
}

/**
 * Simple planned date of a plan number: `perDay` numbers per working day,
 * starting the working day after the machine's numbering base date
 * (#1–3 → day 1, #4–6 → day 2 …). Kept as a fallback; machine sheets now
 * use scheduleDates() below (hours per process).
 */
export function plannedDateForNumber(planNumber: number, baseYMD: string, holidaySet: Set<string>, perDay = 3): string {
  if (!planNumber || planNumber < 1 || !baseYMD) return ''
  return addWorkingDays(baseYMD, Math.floor((planNumber - 1) / perDay) + 1, holidaySet)
}

/** Factory Settings → "Sunday is a holiday" (on unless switched off). */
export const sundayOffFrom = (factorySettings: any) => factorySettings?.sundayHoliday !== false

export { isSundayYMD }

// ── Hours-based day planning ───────────────────────────────────────────────
// Machine sheet plan numbers fill each working day by HOURS: every process
// takes Process Master → Hours per batch (blank = Factory Settings default),
// rows run one after another in number order, and a row's planned date is the
// working day on which it starts (base date + day + 1). With 24 h/day and
// 8 h per batch this is the old "3 per day"; D 8 h + S 4 h → #1 D, #2 D,
// #3 S, #4 S on day 1, #5 D on day 2.
export interface HoursSettings { hoursPerDay: number; defaultBatchHours: number; hoursByCode: Record<string, number> }
export const DEFAULT_HOURS: HoursSettings = { hoursPerDay: 24, defaultBatchHours: 8, hoursByCode: {} }

export function hoursSettingsFrom(factory: any, processes: { code: string; hours_per_batch?: any }[] | null | undefined): HoursSettings {
  const num = (v: any, d: number) => { const n = parseFloat(v); return isFinite(n) && n > 0 ? n : d }
  const hoursByCode: Record<string, number> = {}
  for (const p of processes || []) { const h = parseFloat(p.hours_per_batch); if (isFinite(h) && h > 0) hoursByCode[String(p.code)] = h }
  return { hoursPerDay: num(factory?.hoursPerDay, 24), defaultBatchHours: num(factory?.defaultBatchHours, 8), hoursByCode }
}

export const hoursForCode = (code: string | null | undefined, hs: HoursSettings) => (code && hs.hoursByCode[code]) || hs.defaultBatchHours

/**
 * Planned date for every numbered row on one machine.
 * items: [{ num, code }] (any order, duplicates of a number share its slot) → Map num → YYYY-MM-DD
 */
export function scheduleDates(items: { num: number; code: string }[], baseYMD: string, holidaySet: Set<string>, hs: HoursSettings = DEFAULT_HOURS): Map<number, string> {
  const out = new Map<number, string>()
  if (!baseYMD) return out
  const byNum = new Map<number, string>()
  for (const i of items) if (i.num > 0 && !byNum.has(i.num)) byNum.set(i.num, i.code)
  const nums = Array.from(byNum.keys()).sort((a, b) => a - b)
  let cum = 0, day = 0, dayDate = addWorkingDays(baseYMD, 1, holidaySet)
  for (const n of nums) {
    const startDay = Math.floor(cum / hs.hoursPerDay + 1e-9)
    while (day < startDay) { dayDate = addWorkingDays(dayDate, 1, holidaySet); day++ }
    out.set(n, dayDate)
    cum += hoursForCode(byNum.get(n), hs)
  }
  return out
}
