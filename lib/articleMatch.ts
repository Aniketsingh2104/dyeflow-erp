// Matching an order's article to the Article → Route Master.
// Orders often carry notes the Master doesn't have — capitals, extra spaces,
// quote marks, "(DO NOT TAKE PCS NO:-7,9,10)", "(100%POLYESTER)/P" — so both
// sides are compared in a cleaned form:
//   "A-1599E/P-72 (DO NOT TAKE PCS NO:-7,9,10)" → "a-1599e/p-72"
//   "TR-1 / NS / 85''"                          → "tr-1/ns/85"
export function articleKey(s: string | null | undefined): string {
  return String(s || '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')          // (notes in brackets)
    .replace(/\(.*$/, ' ')               // an unclosed "(" … to the end
    .replace(/['"’‘”“`]/g, '')           // quote marks (85'' / 58")
    .replace(/\s*([/,-])\s*/g, '$1')     // spaces around / , -
    .replace(/\s+/g, ' ')
    .trim()
}

/** The article as it is saved into the Master (brackets dropped, tidy spaces) */
export function articleForMaster(s: string | null | undefined): string {
  return String(s || '').replace(/\([^)]*\)/g, ' ').replace(/\(.*$/, ' ').replace(/\s+/g, ' ').trim()
}

export interface MasterRule { article: string; route: string[]; qa?: boolean }

/**
 * 1. same article (cleaned)              → 'master'
 * 2. a Master article WITH A NUMBER that the order's article starts with
 *    ("c-679" for "C-679 (100%POLYESTER)/P") → 'master-code'
 *    (a vague name without a number, like "gpo dull", never matches this way)
 */
export function matchMaster(article: string, rules: Map<string, MasterRule>): { rule: MasterRule; how: 'master' | 'master-code' } | null {
  const k = articleKey(article)
  if (!k) return null
  const exact = rules.get(k)
  if (exact) return { rule: exact, how: 'master' }
  let best: MasterRule | null = null, bestLen = 0
  for (const [mk, rule] of rules) {
    if (mk.length < 4 || mk.length <= bestLen || !/\d/.test(mk)) continue
    if (k.startsWith(mk) && (k.length === mk.length || k[mk.length] === ' ' || k[mk.length] === '/')) { best = rule; bestLen = mk.length }
  }
  return best ? { rule: best, how: 'master-code' } : null
}
