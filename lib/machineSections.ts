// Machine sections — the Supervisor sheet lists only the machines of the
// section(s) picked (default: the supervisor's own sections, Supervisor Master).
export const SECTIONS = ['LongJet', 'UJET', 'Beam', 'Cotton', 'Others'] as const
export type Section = typeof SECTIONS[number]

/** machine.section, else worked out from its type (as the SQL pre-fill does) */
export function sectionOf(m: { section?: string | null; machine_type?: string | null } | null | undefined): Section {
  const s = String(m?.section || '')
  if ((SECTIONS as readonly string[]).includes(s)) return s as Section
  const t = String(m?.machine_type || '').toLowerCase()
  if (t === 'ljet') return 'LongJet'
  if (t === 'ujet') return 'UJET'
  if (t === 'beam') return 'Beam'
  if (['athena', 'op', 'then'].includes(t)) return 'Cotton'
  return 'Others'
}

/** keep only known section names (no duplicates, in the standard order) */
export function cleanSections(v: any): Section[] {
  const arr = Array.isArray(v) ? v.map(String) : []
  return SECTIONS.filter(s => arr.includes(s))
}
