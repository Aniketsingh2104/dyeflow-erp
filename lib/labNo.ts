// Lab No. matching: "L-1850", "L1850", "l-1850/", "L--1850", "L 1850" are the
// same number — only letters and digits count, case does not. "L-1850A" or
// "L-18501" is a different number.
export function labNoKey(v: any): string {
  return String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}
export function sameLabNo(a: any, b: any): boolean {
  const x = labNoKey(a)
  return !!x && x === labNoKey(b)
}
