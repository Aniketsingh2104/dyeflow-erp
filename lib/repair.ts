/**
 * lib/repair.ts — Shared server-side reprocess logic for Faulty and FOB.
 * Server only (imports lib/supabase). Used by app/api/faulty and app/api/fob.
 *
 * FULL reprocess    → the whole batch goes to repair. The SAME batch row is
 *                     renamed (B2 → B2-R) and set to status 'repairing'.
 *
 * PARTIAL reprocess → the repair part gets its OWN new batch row:
 *                       B2 (500 kg), 100 kg faulty at D →
 *                         B2   = 400 kg, carries on to the next process
 *                         B2-R = 100 kg, status 'repairing', linked to the
 *                                repair order (and the faulty/FOB record)
 *                     So the 400 kg that keeps running is never dragged back
 *                     when the repair is later split or rolled back.
 */
import { dbSelect, dbUpdate, dbInsert, sb } from '@/lib/supabase'

// B2 → B2-R → B2-RR (repair of a repair)
export function getRepairingBatchId(currentBatchId: string): string {
  if (!currentBatchId) return currentBatchId
  const match = currentBatchId.match(/^(.+?)(-R+)$/)
  if (match) return match[1] + match[2] + 'R'
  return currentBatchId + '-R'
}

// First free id: B2-R, then B2-R2, B2-R3 … (batch_id is UNIQUE in the DB)
async function freeBatchId(candidate: string): Promise<string> {
  const base = candidate
  for (let n = 1; n < 50; n++) {
    const id = n === 1 ? base : `${base}${n}`
    const { data } = await dbSelect('batches', { batch_id: `eq.${id}`, limit: '1' }, 'id')
    if (!data?.length) return id
  }
  return `${base}-${Date.now()}`
}

function sameCode(a?: string | null, b?: string | null) {
  return !!a && !!b && a.toUpperCase() === b.toUpperCase()
}

/** Make sure a batch has pending batch_processes rows for its whole route. */
export async function ensureBatchProcesses(batchUuid: string, route: string[]) {
  if (!batchUuid || !route?.length) return
  const rows = route.map(code => ({ batch_id: batchUuid, process_code: code, status: 'pending' }))
  // ignore-duplicates: never overwrite an existing done/faulty/fob row
  await sb('/batch_processes?on_conflict=batch_id,process_code', {
    method: 'POST', body: JSON.stringify(rows),
    headers: { 'Prefer': 'resolution=ignore-duplicates,return=minimal' },
  })
}

export interface ReprocessInput {
  source: 'faulty' | 'fob'
  recordId: string
  batch_id: string            // batch uuid
  order_id?: string | null
  sourceKg: number            // faulty_kg / fob_kg sent by the page (batch kg)
  process_code: string
  process_route: string[]
  reprocess_type: 'full' | 'partial' | string
  reprocess_kg?: any
  reprocess_mtr?: any
  reprocess_taka?: any
  reason: string
}

export async function startReprocess(p: ReprocessInput) {
  const table = p.source === 'faulty' ? 'faulty_records' : 'fob_records'

  const { data: bRows, error: bErr } = await dbSelect('batches', { id: `eq.${p.batch_id}`, limit: '1' },
    'id,batch_id,order_id,kg,mtr,taka,machine_id,supervisor_id,process_route,status')
  const batch = bRows?.[0]
  if (bErr || !batch) return { ok: false, error: bErr || 'Batch not found', status: 404 }

  const totalKg   = parseFloat(batch.kg) || Number(p.sourceKg) || 0
  const totalMtr  = parseFloat(batch.mtr)  || 0
  const totalTaka = parseInt(batch.taka)   || 0
  const route: string[] = (p.process_route?.length ? p.process_route : batch.process_route) || []
  const idx = route.findIndex(c => sameCode(c, p.process_code))
  const nextProcess = idx >= 0 && idx < route.length - 1 ? route[idx + 1] : null

  let repairKg = p.reprocess_type === 'partial' ? (parseFloat(p.reprocess_kg) || 0) : totalKg
  if (repairKg <= 0) return { ok: false, error: 'Repair quantity must be above 0 Kg', status: 400 }
  if (repairKg > totalKg + 0.01) return { ok: false, error: `Repair quantity (${repairKg} Kg) is more than the batch (${totalKg} Kg)`, status: 400 }
  // A "partial" that takes everything is really a full reprocess
  const isPartial = p.reprocess_type === 'partial' && repairKg < totalKg - 0.01
  if (!isPartial) repairKg = totalKg
  const remainKg = Math.round((totalKg - repairKg) * 100) / 100
  const now = new Date().toISOString()

  if (!isPartial) {
    // ── FULL: same row becomes the repair batch ──────────────────────────────
    const newBatchId = await freeBatchId(getRepairingBatchId(batch.batch_id || ''))
    const { error: upErr } = await dbUpdate('batches', { id: batch.id }, {
      batch_id: newBatchId, is_faulty: false, status: 'repairing', current_process: null,
      last_process: p.process_code, kg: repairKg, updated_at: now,
    })
    if (upErr) return { ok: false, error: upErr, status: 500 }

    const { error: roErr } = await dbInsert('repairing_orders', {
      batch_id: batch.id,
      ...(p.source === 'faulty' ? { faulty_id: p.recordId } : { fob_id: p.recordId }),
      order_id: p.order_id || batch.order_id || null,
      repair_kg: repairKg,
      repair_mtr: totalMtr || null, repair_taka: totalTaka || null,
      process_route: route, status: 'pending',
      notes: p.reason, source_type: p.source, reprocess_type: 'full',
    })
    if (roErr) return { ok: false, error: roErr, status: 500 }

    await dbUpdate(table, { id: p.recordId }, {
      status: 'repairing', notes: p.reason, reprocess_type: 'full',
      reprocess_kg: null, reprocess_mtr: null, reprocess_taka: null, next_process: null,
    })
    return { ok: true, repair_kg: repairKg, remain_kg: 0, next_process: null, repair_batch_id: newBatchId }
  }

  // ── PARTIAL: new row for the repair part, original keeps running ───────────
  const ratio      = totalKg > 0 ? repairKg / totalKg : 0
  const repairMtr  = parseFloat(p.reprocess_mtr)  > 0 ? parseFloat(p.reprocess_mtr)  : (totalMtr  ? Math.round(totalMtr  * ratio * 10) / 10 : null)
  const repairTaka = parseInt(p.reprocess_taka)   > 0 ? parseInt(p.reprocess_taka)   : (totalTaka ? Math.round(totalTaka * ratio) : null)
  const remainMtr  = totalMtr  ? Math.max(0, Math.round((totalMtr  - (repairMtr  || 0)) * 10) / 10) : null
  const remainTaka = totalTaka ? Math.max(0, totalTaka - (repairTaka || 0)) : null

  const repairBatchId = await freeBatchId(getRepairingBatchId(batch.batch_id || ''))
  const { data: repairRow, error: insErr } = await dbInsert('batches', {
    batch_id:      repairBatchId,
    order_id:      batch.order_id,
    machine_id:    batch.machine_id || null,
    supervisor_id: batch.supervisor_id || null,
    kg:            repairKg,
    mtr:           repairMtr,
    taka:          repairTaka,
    process_route: route,
    status:        'repairing',
    current_process: null,
    last_process:  p.process_code,
    is_faulty:     false,
    is_done:       false,
  })
  if (insErr || !repairRow) return { ok: false, error: insErr || 'Could not create repair batch', status: 500 }

  // Original batch: keeps the remaining qty and moves on to the next process
  const { error: upErr } = await dbUpdate('batches', { id: batch.id }, {
    is_faulty: false,
    kg: remainKg,
    ...(remainMtr  !== null ? { mtr:  remainMtr  } : {}),
    ...(remainTaka !== null ? { taka: remainTaka } : {}),
    status:          nextProcess ? 'in-process' : 'done',
    is_done:         !nextProcess,
    current_process: nextProcess,
    sent_at:         now,
    updated_at:      now,
  })
  if (upErr) return { ok: false, error: upErr, status: 500 }

  const { error: roErr } = await dbInsert('repairing_orders', {
    batch_id: repairRow.id,
    ...(p.source === 'faulty' ? { faulty_id: p.recordId } : { fob_id: p.recordId }),
    order_id: p.order_id || batch.order_id || null,
    repair_kg: repairKg, repair_mtr: repairMtr, repair_taka: repairTaka,
    process_route: route, status: 'pending',
    notes: p.reason, source_type: p.source, reprocess_type: 'partial',
  })
  if (roErr) return { ok: false, error: roErr, status: 500 }

  // The faulty/FOB record now follows the repair fabric (B2-R)
  await dbUpdate(table, { id: p.recordId }, {
    batch_id: repairRow.id,
    status: 'repairing', notes: p.reason, reprocess_type: 'partial',
    reprocess_kg: repairKg, reprocess_mtr: repairMtr, reprocess_taka: repairTaka,
    next_process: nextProcess,
  })

  return { ok: true, repair_kg: repairKg, remain_kg: remainKg, next_process: nextProcess, repair_batch_id: repairBatchId }
}
