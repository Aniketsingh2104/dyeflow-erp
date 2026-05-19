/**
 * SINGLE SOURCE OF TRUTH for process codes and names.
 * All pages must import from here — never hardcode PROCESS_MAP locally.
 *
 * At runtime, pages prefer db.processList[] (user-managed via Process Master).
 * This file is the fallback seed so the app works before any user configuration.
 */

export interface ProcessDef {
  code: string      // e.g. "D"
  name: string      // e.g. "Dyeing"
  enabled: boolean
  order: number     // display/nav order
  defaultDays?: number  // default duration for date calculator (optional)
  allowFaulty?: boolean // show Faulty button on this process's FMS page
  allowFOB?: boolean    // show FOB button on this process's FMS page
}

/** Default process list — used as seed when db.processList is empty */
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

/**
 * Build a flat code->name lookup from a ProcessDef array.
 * Stores both original-case and UPPERCASE keys for resilient lookup.
 */
export function buildProcessMap(list: ProcessDef[]): Record<string, string> {
  const map: Record<string, string> = {}
  list.forEach(p => {
    map[p.code] = p.name
    map[p.code.toUpperCase()] = p.name
  })
  return map
}

/** Built-in fallback map — safe to import in any file (no localStorage) */
export const PROCESS_MAP: Record<string, string> = buildProcessMap(DEFAULT_PROCESSES)

/**
 * Resolve a process code to its display name.
 * Pass runtimeList (from db.processList) when available for user-defined names.
 */
export function getProcessName(code: string, runtimeList?: ProcessDef[]): string {
  if (runtimeList && runtimeList.length > 0) {
    const found = runtimeList.find(
      p => p.code.toUpperCase() === code.toUpperCase()
    )
    if (found) return found.name
  }
  return PROCESS_MAP[code] ?? PROCESS_MAP[code.toUpperCase()] ?? code
}

/**
 * Load db.processList from localStorage, seeding DEFAULT_PROCESSES if missing.
 * Returns the full list (always non-empty).
 * Only call this inside client-side useEffect or event handlers.
 */
export function loadOrSeedProcessList(): ProcessDef[] {
  if (typeof window === 'undefined') return DEFAULT_PROCESSES

  const raw = localStorage.getItem('dyeflow_db')
  const db = raw ? JSON.parse(raw) : {}

  if (!db.processList || !Array.isArray(db.processList) || db.processList.length === 0) {
    db.processList = DEFAULT_PROCESSES
    localStorage.setItem('dyeflow_db', JSON.stringify(db))
  }

  return db.processList as ProcessDef[]
}
