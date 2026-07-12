/**
 * lib/processMap.ts
 * Single source of truth for process codes and names.
 * Phase 12: loadOrSeedProcessList() no longer writes to localStorage.
 *           It is now a pure read-only fallback returning DEFAULT_PROCESSES.
 *           All dynamic data comes from Supabase via fetchProcessList().
 */

export interface ProcessDef {
  code: string
  name: string
  enabled: boolean
  order: number
  defaultDays?: number
  allowFaulty?: boolean
  allowFOB?: boolean
  // Supabase column aliases
  is_enabled?:    boolean
  display_order?: number
  default_days?:  number
  allow_faulty?:  boolean
  allow_fob?:     boolean
}

export const DEFAULT_PROCESSES: ProcessDef[] = [
  { code: 'C',        name: 'CBR',       enabled: true, order: 1,  defaultDays: 1, allowFaulty: true,  allowFOB: false },
  { code: 'S',        name: 'SCQ',       enabled: true, order: 2,  defaultDays: 1, allowFaulty: true,  allowFOB: false },
  { code: 'H',        name: 'Heat-Set',  enabled: true, order: 3,  defaultDays: 1, allowFaulty: true,  allowFOB: false },
  { code: 'D',        name: 'Dyeing',    enabled: true, order: 4,  defaultDays: 1, allowFaulty: true,  allowFOB: true  },
  { code: 'S2',       name: 'SCQ2',      enabled: true, order: 5,  defaultDays: 1, allowFaulty: true,  allowFOB: false },
  { code: 'Rx',       name: 'Relax',     enabled: true, order: 6,  defaultDays: 1, allowFaulty: true,  allowFOB: false },
  { code: 'O',        name: 'Opener',    enabled: true, order: 7,  defaultDays: 1, allowFaulty: true,  allowFOB: false },
  { code: 'G',        name: 'Ghanti',    enabled: true, order: 8,  defaultDays: 1, allowFaulty: true,  allowFOB: false },
  { code: 'F',        name: 'Finish',    enabled: true, order: 9,  defaultDays: 1, allowFaulty: true,  allowFOB: true  },
  { code: 'Co',       name: 'Compactor', enabled: true, order: 10, defaultDays: 1, allowFaulty: true,  allowFOB: false },
  { code: 'Tu',       name: 'Tubler',    enabled: true, order: 11, defaultDays: 1, allowFaulty: true,  allowFOB: false },
  { code: 'Add',      name: 'Addition',  enabled: true, order: 12, defaultDays: 1, allowFaulty: true,  allowFOB: false },
  { code: 'Lev',      name: 'Levelling', enabled: true, order: 13, defaultDays: 1, allowFaulty: true,  allowFOB: false },
  { code: 'Rc',       name: 'RC',        enabled: true, order: 14, defaultDays: 1, allowFaulty: true,  allowFOB: false },
  { code: 'Fix',      name: 'Fixing',    enabled: true, order: 15, defaultDays: 1, allowFaulty: true,  allowFOB: false },
  { code: 'Wash',     name: 'Washing',   enabled: true, order: 16, defaultDays: 1, allowFaulty: true,  allowFOB: false },
  { code: 'Dry',      name: 'Dry',       enabled: true, order: 17, defaultDays: 1, allowFaulty: false, allowFOB: false },
  { code: 'B',        name: 'Brushing',  enabled: true, order: 18, defaultDays: 1, allowFaulty: false, allowFOB: false },
  { code: 'R',        name: 'Raising',   enabled: true, order: 19, defaultDays: 1, allowFaulty: false, allowFOB: false },
  { code: 'K',        name: 'Kundi',     enabled: true, order: 20, defaultDays: 1, allowFaulty: false, allowFOB: false },
  { code: 'Qa',       name: 'QA',        enabled: true, order: 21, defaultDays: 1, allowFaulty: false, allowFOB: false },
  { code: 'Packing',  name: 'Packing',   enabled: true, order: 22, defaultDays: 1, allowFaulty: false, allowFOB: false },
  { code: 'Dispatch', name: 'Dispatch',  enabled: true, order: 23, defaultDays: 1, allowFaulty: false, allowFOB: false },
]

export function buildProcessMap(list: ProcessDef[]): Record<string, string> {
  const map: Record<string, string> = {}
  list.forEach(p => {
    map[p.code] = p.name
    map[p.code.toUpperCase()] = p.name
  })
  return map
}

export const PROCESS_MAP: Record<string, string> = buildProcessMap(DEFAULT_PROCESSES)

export function getProcessName(code: string, runtimeList?: ProcessDef[]): string {
  if (runtimeList?.length) {
    const found = runtimeList.find(p => p.code.toUpperCase() === code.toUpperCase())
    if (found) return found.name
  }
  return PROCESS_MAP[code] ?? PROCESS_MAP[code.toUpperCase()] ?? code
}

/** Normalise a Supabase process_list row to ProcessDef */
function normaliseFromDb(row: any): ProcessDef {
  return {
    code:        row.code,
    name:        row.name,
    enabled:     row.is_enabled    ?? row.enabled    ?? true,
    order:       row.display_order ?? row.order       ?? 99,
    defaultDays: row.default_days  ?? row.defaultDays ?? 1,
    allowFaulty: row.allow_faulty  ?? row.allowFaulty ?? true,
    allowFOB:    row.allow_fob     ?? row.allowFOB    ?? false,
  }
}

/**
 * Async — fetch from Supabase via /api/processes.
 * Falls back to DEFAULT_PROCESSES on error. Always prefer this.
 */
export async function fetchProcessList(): Promise<ProcessDef[]> {
  try {
    const res  = await fetch('/api/processes', { cache: 'no-store' })
    const data = await res.json()
    if (data.ok && Array.isArray(data.data) && data.data.length > 0) {
      return data.data.map(normaliseFromDb).sort((a, b) => a.order - b.order)
    }
  } catch {}
  return [...DEFAULT_PROCESSES]
}

/**
 * Sync fallback — returns DEFAULT_PROCESSES.
 * Phase 12: no longer reads or writes localStorage.
 * Use only when an async call is impossible (e.g. inside a sync event handler).
 */
export function loadOrSeedProcessList(): ProcessDef[] {
  return [...DEFAULT_PROCESSES]
}
