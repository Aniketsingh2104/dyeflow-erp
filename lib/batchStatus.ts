// A batch is FINISHED when it is done, or written off (a faulty batch that was
// closed without reprocessing — Section 7). Finished batches don't count as
// machine load, pending work or overdue, and they count toward the order's
// completion. Use this everywhere instead of `status !== 'done'`.
export const FINISHED_BATCH_STATUSES = ['done', 'written-off'] as const

export function isBatchFinished(b: { status?: string | null; is_done?: boolean | null } | null | undefined): boolean {
  if (!b) return false
  return b.status === 'done' || b.status === 'written-off' || b.is_done === true
}
