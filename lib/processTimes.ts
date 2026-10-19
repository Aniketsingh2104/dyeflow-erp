/**
 * lib/processTimes.ts — records WHEN a batch arrives at each process (server only).
 *
 * batches.fms_enter_at = { S: '2026-10-19T04:45:00Z', D: '2026-10-20T06:10:00Z', … }
 * Filled every time a batch moves to a process (sent from First Process,
 * marked Done, FOB approved, faulty marked OK, rolled back, partial reprocess).
 * Used by: FMS TIMESTAMP column, dashboard "stuck batch" panel, AI delay
 * predictor and the Report Agent's stuck-batch query.
 */
import { dbSelect, dbUpdate, sb } from '@/lib/supabase'
import { canonicalCode, sameCode } from '@/lib/processCodes'

export async function markProcessEntered(batchId: string | null | undefined, code: string | null | undefined, at?: string) {
  if (!batchId || !code) return
  try {
    const when = at || new Date().toISOString()
    const proc = canonicalCode(code)
    const { data } = await dbSelect('batches', { id: `eq.${batchId}`, limit: '1' }, 'fms_enter_at')
    const current = (data?.[0]?.fms_enter_at && typeof data[0].fms_enter_at === 'object') ? data[0].fms_enter_at : {}
    await dbUpdate('batches', { id: batchId }, { fms_enter_at: { ...current, [proc]: when } })
    // Also stamp the process row with the arrival time (older rows may spell
    // the code differently, e.g. 'LEVEL' for 'Lev', so match the standard code)
    const { data: bps } = await dbSelect('batch_processes', { batch_id: `eq.${batchId}` }, 'id,process_code')
    for (const bp of bps || []) {
      if (!sameCode(bp.process_code, proc)) continue
      await sb('/batch_processes', {
        method: 'PATCH',
        body: JSON.stringify({ sent_at: when }),
        params: { id: `eq.${bp.id}` },
        headers: { 'Prefer': 'return=minimal' },
      })
    }
  } catch {
    // timing info must never break the action that moved the batch
  }
}
