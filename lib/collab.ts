/**
 * lib/collab.ts — Shared "collab batch" detection for DyeFlow.
 *
 * "Collab" batches are same-colour batches grouped together during machine
 * numbering (Run Numbering \u2192 same-colour bin-packing to fill machine
 * capacity \u2014 see app/machines/[machineId]/page.tsx, search for `type: 'collab'`).
 * There's no separate table recording this relationship \u2014 it's entirely
 * implicit: two batches are collab partners for a given process if they
 * share the same machine_id AND the same plan number for that process
 * (batches.date_calc_plan.byProcess[processCode]).
 *
 * Physically, collab'd batches run together in the same machine load, so
 * they should move through a process stage together. This helper answers
 * "who else is in this batch's collab group for this process, and have they
 * all arrived here yet" \u2014 used to show an informational badge (First
 * Process page) or to block an action (FMS pages: Done/Faulty/FOB/Rollback)
 * when a batch's collab partners haven't caught up to the same stage.
 *
 * Sending a batch FORWARD is never blocked by this \u2014 only actions taken
 * once a batch has already arrived at a stage (Done/Faulty/FOB/Rollback)
 * check that its collab partners are there too.
 */

export interface CollabPartner {
  id: string
  batchId: string
  currentProcess: string | null
  arrived: boolean
}

export interface CollabInfo {
  hasCollab: boolean
  partners: CollabPartner[]
  allArrived: boolean
}

interface BatchLike {
  id: string
  batch_id?: string
  machine_id?: string | null
  date_calc_plan?: any
  current_process?: string | null
}

/**
 * Finds `batch`'s collab partners for `processCode`, and whether they've all
 * "arrived" (current_process === processCode) at that stage.
 *
 * `allBatches` MUST be the full, unfiltered batch list for the system (or at
 * least for this machine) \u2014 not a page's already process-filtered display
 * rows \u2014 since a partner that hasn't arrived yet won't be present in a
 * process-specific filtered view, and its absence is exactly the signal
 * we're checking for.
 */
export function getCollabInfo(
  batch: BatchLike,
  processCode: string,
  allBatches: BatchLike[]
): CollabInfo {
  const planNumber = batch.date_calc_plan?.byProcess?.[processCode]
  if (planNumber == null || !batch.machine_id) {
    return { hasCollab: false, partners: [], allArrived: true }
  }

  const partners = allBatches
    .filter(
      (b) =>
        b.id !== batch.id &&
        b.machine_id === batch.machine_id &&
        b.date_calc_plan?.byProcess?.[processCode] === planNumber
    )
    .map((b) => ({
      id: b.id,
      batchId: b.batch_id || b.id,
      currentProcess: b.current_process || null,
      arrived: (b.current_process || '').toUpperCase() === processCode.toUpperCase(),
    }))

  return {
    hasCollab: partners.length > 0,
    partners,
    allArrived: partners.every((p) => p.arrived),
  }
}

/** Human-readable block message for a gated FMS action, or null if the action is allowed to proceed. */
export function collabBlockMessage(batch: BatchLike, processCode: string, allBatches: BatchLike[]): string | null {
  const info = getCollabInfo(batch, processCode, allBatches)
  if (!info.hasCollab || info.allArrived) return null
  const notArrived = info.partners.filter((p) => !p.arrived)
  const names = notArrived.map((p) => `${p.batchId} (${p.currentProcess || 'not sent yet'})`).join(', ')
  return `Collab partner${notArrived.length > 1 ? 's' : ''} not received yet at ${processCode}: ${names}. Cannot proceed until they arrive too.`
}
