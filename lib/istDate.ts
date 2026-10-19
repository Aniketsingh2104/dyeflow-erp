/**
 * lib/istDate.ts — dates as the factory sees them (India, UTC+5:30), on the
 * server (which runs in UTC) and in the browser alike.
 *
 *   todayIST()            → '2026-10-20' (the date in India right now)
 *   ymdIST(ts)            → the India date of a timestamp
 *   daysBetween(a, b)     → whole days from date a to date b ('YYYY-MM-DD')
 *   daysUntil(ymd)        → 0 = today, 1 = tomorrow, -1 = yesterday (overdue)
 *   addDaysYMD(ymd, n)
 *
 * Plain 'YYYY-MM-DD' strings are compared as dates — never turned into a
 * time of day, so an order due today is "due today" all day long.
 */
const IST = 'Asia/Kolkata'
const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: IST, year: 'numeric', month: '2-digit', day: '2-digit' })

export function ymdIST(d: Date | string | number = new Date()): string {
  const dt = d instanceof Date ? d : new Date(d)
  return isNaN(dt.getTime()) ? '' : fmt.format(dt)
}

export const todayIST = () => ymdIST(new Date())

const utcOf = (ymd: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd || '')
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : NaN
}

/** A date-only value ('2026-10-20', '2026-10-20T…', or a timestamp) as 'YYYY-MM-DD' (India date for timestamps). */
export function toYMD(v: string | null | undefined): string {
  if (!v) return ''
  const s = String(v)
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  if (/^\d{4}-\d{2}-\d{2}T/.test(s) && /[zZ]|[+-]\d{2}:?\d{2}$/.test(s)) return ymdIST(s)   // a real timestamp
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  return ymdIST(s)
}

export function daysBetween(fromYMD: string, toYMDv: string): number {
  const a = utcOf(fromYMD), b = utcOf(toYMDv)
  return isNaN(a) || isNaN(b) ? NaN : Math.round((b - a) / 86_400_000)
}

/** Days from today (India) until the date; NaN if not a date. */
export const daysUntil = (v: string | null | undefined) => daysBetween(todayIST(), toYMD(v))

export function addDaysYMD(ymd: string, n: number): string {
  const t = utcOf(ymd)
  return isNaN(t) ? '' : new Date(t + n * 86_400_000).toISOString().slice(0, 10)
}
