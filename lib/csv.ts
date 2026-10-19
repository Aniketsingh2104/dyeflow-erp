/**
 * lib/csv.ts — build CSV text for downloads (browser or server).
 *
 * Every cell is quoted. A text cell that starts with = + - @ or a tab /
 * carriage return gets a leading ' so Excel shows it as text instead of
 * running it as a formula (e.g. a party typing =HYPERLINK(...) in Remarks).
 * Plain numbers such as -2.5 are left as numbers.
 */
const FORMULA_START = /^[=+\-@\t\r]/
const PLAIN_NUMBER = /^-?\d+(\.\d+)?$/

export function csvCell(v: unknown): string {
  let s = v === null || v === undefined ? '' : String(v)
  if (typeof v !== 'number' && s !== '-' && FORMULA_START.test(s) && !PLAIN_NUMBER.test(s)) s = `'${s}`
  return `"${s.replace(/"/g, '""')}"`
}

export function toCsv(rows: unknown[][]): string {
  return rows.map(r => r.map(csvCell).join(',')).join('\n')
}
