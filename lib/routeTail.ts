// The END of every batch route is added by the system, never picked by hand:
//   [QA — only for articles that need it]  →  Packing  →  Dispatch
// People pick / see the short "work" route (H/D/F); orders and batches store
// the FULL route (H/D/F/Qa/Packing/Dispatch), so FMS, Done, the Date
// Calculator and reports keep working unchanged.
import { canonicalCode } from '@/lib/processCodes'

export const TAIL_CODES = ['Qa', 'Packing', 'Dispatch'] as const
const isTail = (c: string) => (TAIL_CODES as readonly string[]).includes(canonicalCode(c))

/** H/D/F/Qa/Packing/Dispatch → H/D/F (codes in standard spelling) */
export function workRoute(route: string[] | null | undefined): string[] {
  return (Array.isArray(route) ? route : []).map(c => canonicalCode(String(c).trim())).filter(c => c && !isTail(c))
}

/** does this (full) route go through QA? */
export function routeHasQa(route: string[] | null | undefined): boolean {
  return (Array.isArray(route) ? route : []).some(c => canonicalCode(String(c)) === 'Qa')
}

/** H/D/F + qa → H/D/F/Qa/Packing/Dispatch (an empty work route stays empty) */
export function fullRoute(work: string[], qa: boolean): string[] {
  const w = workRoute(work)
  if (!w.length) return []
  return [...w, ...(qa ? ['Qa'] : []), 'Packing', 'Dispatch']
}

/** Server safety net: whatever was sent, the route ends Qa? → Packing → Dispatch */
export function ensureTail(route: string[] | null | undefined): string[] {
  return fullRoute(workRoute(route), routeHasQa(route))
}
