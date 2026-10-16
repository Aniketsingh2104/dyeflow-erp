/**
 * lib/processCodes.ts — ONE standard for process codes (safe for server and browser).
 *
 * The codes in Process Master are the standard: C, S, H, D, S2, Rx, O, G, F,
 * Co, Tu, Add, Lev, Rc, Fix, Wash, Dry, B, R, K, Qa, Packing, Dispatch, FD.
 * Older code used 'Level' / 'QA' and the FMS pages upper-cased codes
 * ('ADD', 'LEV'), so dates, anchors and faulty/reset updates were silently lost.
 *
 *   canonicalCode('add')   → 'Add'
 *   canonicalCode('LEVEL') → 'Lev'
 *   canonicalCode('QA')    → 'Qa'
 *   dateColFor('Lev')      → 'd_level'   (batch_date_plans column)
 *   anchorColFor('Lev')    → 'anchor_lev'
 */

export const STANDARD_CODES = [
  'C', 'S', 'H', 'D', 'S2', 'Rx', 'O', 'G', 'F', 'Co', 'Tu', 'Add', 'Lev', 'Rc', 'Fix', 'Wash',
  'Dry', 'B', 'R', 'K', 'Qa', 'Packing', 'Dispatch', 'FD', 'FinalDispatch',
]

// Old spellings → standard code (keys upper-case)
const ALIASES: Record<string, string> = {
  LEVEL: 'Lev', LEVELLING: 'Lev', LEVELING: 'Lev',
  QA: 'Qa',
  FINAL_DISPATCH: 'FinalDispatch',
}

/**
 * Standard spelling of a process code. Matches case-insensitively against
 * `known` (e.g. the live Process Master list) first, then the built-in list,
 * then old aliases. Unknown codes are returned unchanged (trimmed).
 */
export function canonicalCode(code: string | null | undefined, known?: string[]): string {
  const raw = String(code ?? '').trim()
  if (!raw) return raw
  const up = raw.toUpperCase()
  if (ALIASES[up]) return ALIASES[up]
  const hit = (known && known.find(k => k.toUpperCase() === up))
    || STANDARD_CODES.find(k => k.toUpperCase() === up)
  return hit || raw
}

export function sameCode(a?: string | null, b?: string | null): boolean {
  return !!a && !!b && canonicalCode(a) === canonicalCode(b)
}

/** batch_date_plans "d_*" column for each standard code */
export const DATE_COL: Record<string, string> = {
  C: 'd_c', S: 'd_s', H: 'd_h', D: 'd_d', S2: 'd_s2', Rx: 'd_rx', O: 'd_o',
  G: 'd_g', F: 'd_f', Co: 'd_co', Tu: 'd_tu', Add: 'd_add', Lev: 'd_level',
  Rc: 'd_rc', Fix: 'd_fix', Wash: 'd_wash', Dry: 'd_dry', B: 'd_b', R: 'd_r',
  K: 'd_k', Qa: 'd_qa', Packing: 'd_packing', Dispatch: 'd_dispatch',
  FinalDispatch: 'd_finaldispatch',
}

/** batch_date_plans "anchor_*" column for each machine process */
export const ANCHOR_COL: Record<string, string> = {
  S: 'anchor_s', D: 'anchor_d', S2: 'anchor_s2', Add: 'anchor_add',
  Lev: 'anchor_lev', Fix: 'anchor_fix', Wash: 'anchor_wash', Rc: 'anchor_rc',
}

export function dateColFor(code: string | null | undefined): string | undefined {
  return DATE_COL[canonicalCode(code)]
}

export function anchorColFor(code: string | null | undefined): string | undefined {
  return ANCHOR_COL[canonicalCode(code)]
}

/** Re-key an object whose keys are process codes to the standard spelling. */
export function canonicalKeys<T>(obj: Record<string, T> | null | undefined): Record<string, T> {
  const out: Record<string, T> = {}
  for (const [k, v] of Object.entries(obj || {})) out[canonicalCode(k)] = v
  return out
}
