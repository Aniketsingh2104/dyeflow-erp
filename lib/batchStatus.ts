// A batch is FINISHED when it is done, written off (a faulty batch that was
// closed without reprocessing — Section 7), or reprocessed (its whole fabric
// went on as a new -R repair batch; the original stays as a stopped record). Finished batches don't count as
// machine load, pending work or overdue, and they count toward the order's
// completion. Use this everywhere instead of `status !== 'done'`.
export const FINISHED_BATCH_STATUSES = ['done', 'written-off', 'reprocessed'] as const

export function isBatchFinished(b: { status?: string | null; is_done?: boolean | null } | null | undefined): boolean {
  if (!b) return false
  return b.status === 'done' || b.status === 'written-off' || b.status === 'reprocessed' || b.is_done === true
}

/** Does this batch's kg count towards the order quantity (split / allocated kg)?
 *  A 'reprocessed' batch does not — its whole fabric continues as the -R batch,
 *  which is counted instead (otherwise the kg would be counted twice). */
export function countsTowardOrderQty(b: { status?: string | null } | null | undefined): boolean {
  return !!b && b.status !== 'reprocessed'
}
