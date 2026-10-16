/**
 * lib/machineMap.ts — which machine runs each process of a batch
 * (safe for server and browser).
 *
 * Stored per batch in batches.process_machine_map, e.g. { S: <M1 id>, D: <M3 id> }.
 * Before this, a batch only had ONE machine_id, so a process that ran on a
 * different machine (D on M3 while the batch "belonged" to M1) never showed
 * on that machine's sheet and never got a plan number or date.
 *
 * Rule for each process in the route that has machines set on the order
 * (orders.process_machines = { code: [machineId, machineId?] }):
 *   1. a machine chosen on the split screen (when there are two options)
 *   2. else the batch's own machine, if it is one of the options
 *   3. else the only option (one machine) / the first option (two machines)
 * Machine processes with no machines on the order fall back to the batch's
 * own machine.
 */
import { canonicalCode, canonicalKeys } from '@/lib/processCodes'

export const MACHINE_REQUIRED = ['S', 'D', 'S2', 'Add', 'Lev', 'Fix', 'Wash', 'Rc']

export function deriveMachineMap(
  route: string[] | null | undefined,
  orderProcessMachines: Record<string, string[]> | null | undefined,
  batchMachineId?: string | null,
  chosen?: Record<string, string> | null,
): Record<string, string> {
  const pm = canonicalKeys(orderProcessMachines || {}) as Record<string, string[]>
  const pick = canonicalKeys(chosen || {}) as Record<string, string>
  const codes = new Set<string>([
    ...(route || []).map(c => canonicalCode(c)),
    ...Object.keys(pm),
  ])
  const out: Record<string, string> = {}
  for (const code of codes) {
    const options = (pm[code] || []).filter(Boolean)
    if (options.length) {
      if (pick[code] && options.includes(pick[code])) out[code] = pick[code]
      else if (batchMachineId && options.includes(batchMachineId)) out[code] = batchMachineId
      else out[code] = options[0]
    } else if (MACHINE_REQUIRED.includes(code) && batchMachineId && (route || []).some(c => canonicalCode(c) === code)) {
      out[code] = batchMachineId
    }
  }
  return out
}

/** The batch's map: stored one first, gaps filled by the rule above. */
export function batchMachineMap(batch: any, order?: any): Record<string, string> {
  const route = batch?.process_route?.length ? batch.process_route : (order?.process_route || [])
  const derived = deriveMachineMap(route, order?.process_machines, batch?.machine_id)
  const stored = canonicalKeys(batch?.process_machine_map || {}) as Record<string, string>
  return { ...derived, ...stored }
}

/** Machine for one process of a batch (falls back to the batch's machine). */
export function machineForProcess(batch: any, code: string, order?: any): string | null {
  return batchMachineMap(batch, order)[canonicalCode(code)] || batch?.machine_id || null
}

/** First machine in route order — used as the batch's "main" machine_id. */
export function primaryMachine(route: string[] | null | undefined, map: Record<string, string>, fallback?: string | null) {
  for (const c of route || []) {
    const m = map[canonicalCode(c)]
    if (m) return m
  }
  return Object.values(map)[0] || fallback || null
}
