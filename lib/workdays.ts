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
 * Machine-sheet planned date of a plan number: 3 numbers per working day,
 * starting the working day after the machine's numbering base date
 * (#1–3 → day 1, #4–6 → day 2 …).
 */
export function plannedDateForNumber(planNumber: number, baseYMD: string, holidaySet: Set<string>, perDay = 3): string {
  if (!planNumber || planNumber < 1 || !baseYMD) return ''
  return addWorkingDays(baseYMD, Math.floor((planNumber - 1) / perDay) + 1, holidaySet)
}

/** Factory Settings → "Sunday is a holiday" (on unless switched off). */
export const sundayOffFrom = (factorySettings: any) => factorySettings?.sundayHoliday !== false

export { isSundayYMD }
