/**
 * SINGLE SOURCE OF TRUTH for process codes and names.
 * All pages must import from here — never hardcode PROCESS_MAP locally.
 */

export interface ProcessDef {
  code: string
  name: string
  enabled: boolean
  order: number
  defaultDays?: number
  allowFaulty?: boolean
  allowFOB?: boolean
  // Supabase columns (snake_case aliases)
  is_enabled?: boolean
  display_order?: number
  default_days?: number
  allow_faulty?: boolean
  allow_fob?: boolean
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
  if (runtimeList && runtimeList.length > 0) {
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
    enabled:     row.is_enabled ?? row.enabled ?? true,
    order:       row.display_order ?? row.order ?? 99,
    defaultDays: row.default_days  ?? row.defaultDays ?? 1,
    allowFaulty: row.allow_faulty  ?? row.allowFaulty ?? true,
    allowFOB:    row.allow_fob     ?? row.allowFOB    ?? false,
  }
}

/**
 * Async: Fetch process list from Supabase via /api/processes.
 * Falls back to localStorage, then DEFAULT_PROCESSES.
 */
export async function fetchProcessList(): Promise<ProcessDef[]> {
  try {
    const res  = await fetch('/api/processes', { cache: 'no-store' })
    const data = await res.json()
    if (data.ok && Array.isArray(data.data) && data.data.length > 0) {
      return data.data.map(normaliseFromDb).sort((a, b) => a.order - b.order)
    }
  } catch {}
  return loadOrSeedProcessList()
}

/**
 * Sync: Read from localStorage. Seeds defaults if absent.
 * Only call inside client-side useEffect or event handlers.
 */
export function loadOrSeedProcessList(): ProcessDef[] {
  if (typeof window === 'undefined') return DEFAULT_PROCESSES
  try {
    const raw = localStorage.getItem('dyeflow_db')
    const db = raw ? JSON.parse(raw) : {}
    if (!db.processList || !Array.isArray(db.processList) || db.processList.length === 0) {
      db.processList = DEFAULT_PROCESSES
      localStorage.setItem('dyeflow_db', JSON.stringify(db))
    }
    return db.processList as ProcessDef[]
  } catch {
    return DEFAULT_PROCESSES
  }
}
