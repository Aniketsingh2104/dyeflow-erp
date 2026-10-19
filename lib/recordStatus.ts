/**
 * lib/recordStatus.ts — what each Faulty / FOB status means (server and browser).
 *
 * faulty_records.status
 *   open       reported on an FMS page, waiting for a decision      → OPEN
 *   repairing  sent for reprocess (a repair batch exists)            → IN REPAIR
 *   resolved   marked OK, batch went on to its next process          → CLOSED
 *   written-off fabric written off (set by hand on the Faulty page)  → CLOSED
 *
 * fob_records.status
 *   open       reported, sample not sent yet                         → OPEN
 *   sent       sample sent to the party, waiting for approval        → OPEN
 *   repairing  sent for reprocess                                    → IN REPAIR
 *   approved   party approved, batch went on                         → CLOSED
 */
export const FAULTY_OPEN      = ['open']
export const FAULTY_REPAIRING = ['repairing']
export const FAULTY_CLOSED    = ['resolved', 'written-off']

export const FOB_OPEN      = ['open', 'sent']
export const FOB_REPAIRING = ['repairing']
export const FOB_CLOSED    = ['approved']

const st = (r: any) => String(r?.status || 'open').toLowerCase()

export const isFaultyOpen      = (r: any) => FAULTY_OPEN.includes(st(r))
export const isFaultyRepairing = (r: any) => FAULTY_REPAIRING.includes(st(r))
export const isFaultyClosed    = (r: any) => FAULTY_CLOSED.includes(st(r))
/** Not closed yet (open or in repair) */
export const isFaultyPending   = (r: any) => !isFaultyClosed(r)

export const isFobOpen      = (r: any) => FOB_OPEN.includes(st(r))
export const isFobRepairing = (r: any) => FOB_REPAIRING.includes(st(r))
export const isFobClosed    = (r: any) => FOB_CLOSED.includes(st(r))
export const isFobPending   = (r: any) => !isFobClosed(r)

/** PostgREST filter for "not closed yet" */
export const FAULTY_PENDING_FILTER = `in.(${[...FAULTY_OPEN, ...FAULTY_REPAIRING].join(',')})`
export const FOB_PENDING_FILTER    = `in.(${[...FOB_OPEN, ...FOB_REPAIRING].join(',')})`
