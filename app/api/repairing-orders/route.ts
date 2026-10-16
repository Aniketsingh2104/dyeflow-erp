import { NextRequest, NextResponse } from 'next/server'
import { dbSelect, dbInsert, dbUpdate, sb, auditLog } from '@/lib/supabase'
import { ensureBatchProcesses } from '@/lib/repair'

// Revert batch ID: DYE26-0001-B1-R → DYE26-0001-B1, DYE26-0001-B1-RR → DYE26-0001-B1-R
function revertBatchId(batchId: string): string {
  if (!batchId) return batchId
  // Has -RR or more: remove one R from end
  if (batchId.match(/-R{2,}$/)) return batchId.slice(0, -1)
  // Has exactly -R: remove it
  if (batchId.endsWith('-R')) return batchId.slice(0, -2)
  return batchId
}

export async function GET() {
  try {
    const { data: records, error } = await dbSelect('repairing_orders',
      { order: 'created_at.desc', limit: '1000' },
      'id,batch_id,order_id,faulty_id,fob_id,repair_kg,repair_mtr,repair_taka,process_route,status,notes,source_type,reprocess_type,created_at,updated_at'
    )
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })

    const batchIds = [...new Set((records || []).map((r: any) => r.batch_id).filter(Boolean))]
    const orderIds = [...new Set((records || []).map((r: any) => r.order_id).filter(Boolean))]
    const batchMap: Record<string, any> = {}
    const orderMap: Record<string, any> = {}

    if (batchIds.length) {
      const { data: batches } = await dbSelect('batches',
        { id: `in.(${batchIds.join(',')})`, limit: '2000' },
        'id,batch_id,kg,mtr,taka,status,machine_id,process_route,machines(id,name)'
      )
      for (const b of batches || []) batchMap[b.id] = b
    }

    if (orderIds.length) {
      const { data: orders } = await dbSelect('orders',
        { id: `in.(${orderIds.join(',')})`, limit: '2000' },
        'id,order_number,party,sub_party,article,blend,width,gsm,color,lab_no,lot_no,challan_no,type_of_finish,type_of_packing,supervisors(id,name)'
      )
      for (const o of orders || []) orderMap[o.id] = o
    }

    const enriched = (records || []).map((r: any) => {
      const batch = batchMap[r.batch_id] || {}
      const order = orderMap[r.order_id] || {}
      return {
        ...r,
        batch_id_str:    batch.batch_id          || '-',
        batch_status:    batch.status            || null,   // 'repairing' = still waiting to be split
        batch_kg:        batch.kg                ?? null,
        machine_id:      batch.machine_id        || null,
        batch_route:     batch.process_route     || [],
        machine:         batch.machines?.name    || '-',
        order_number:    order.order_number      || '-',
        party:           order.party             || '-',
        sub_party:       order.sub_party         || '-',
        article:         order.article           || '-',
        blend:           order.blend             || '-',
        gsm:             order.gsm               || '-',
        color:           order.color             || '-',
        lab_no:          order.lab_no            || '-',
        challan_no:      order.challan_no        || '-',
        type_of_finish:  order.type_of_finish    || '-',
        type_of_packing: order.type_of_packing   || '-',
        supervisor:      order.supervisors?.name || '-',
      }
    })

    return NextResponse.json({ ok: true, data: enriched })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { action, id, ...payload } = body

  // ── Create ────────────────────────────────────────────────────────────────
  if (action === 'create') {
    const { data, error } = await dbInsert('repairing_orders', {
      faulty_id:      payload.faulty_id      || null,
      fob_id:         payload.fob_id         || null,
      order_id:       payload.order_id       || null,
      batch_id:       payload.batch_id       || null,
      repair_kg:      payload.repair_kg      || 0,
      repair_mtr:     payload.repair_mtr     || null,
      repair_taka:    payload.repair_taka    || null,
      process_route:  payload.process_route  || [],
      status:         payload.status         || 'pending',
      notes:          payload.notes          || null,
      source_type:    payload.source_type    || null,
      reprocess_type: payload.reprocess_type || null,
    })
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    return NextResponse.json({ ok: true, data })
  }

  // ── Update ────────────────────────────────────────────────────────────────
  if (action === 'update') {
    if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })
    const patch: Record<string, any> = {}
    if (payload.status    !== undefined) patch.status    = payload.status
    if (payload.notes     !== undefined) patch.notes     = payload.notes
    if (payload.repair_kg !== undefined) patch.repair_kg = payload.repair_kg
    const { error } = await dbUpdate('repairing_orders', { id }, patch)
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  // ── Split / Full Split a repair batch (server-side, one safe path) ─────────
  // Used by the Repairing Order page AND the supervisor Repair Queue.
  //   full_split → the repair batch itself becomes 'pending' (ready for numbering)
  //   split      → part 1 stays on the repair batch, parts 2..n become new
  //                batches <repairId>-S1, -S2 …  Total must equal the repair qty.
  // Every resulting batch gets fresh 'pending' process rows for its route and
  // its old schedule (date_calc_plan / batch_date_plans) is cleared so it is
  // numbered and dated again like a new batch.
  if (action === 'split' || action === 'full_split') {
    if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })
    const { data: roData } = await dbSelect('repairing_orders', { id: `eq.${id}`, limit: '1' },
      'id,batch_id,order_id,process_route,status')
    const ro = roData?.[0]
    if (!ro) return NextResponse.json({ ok: false, error: 'Repairing order not found' }, { status: 404 })

    const { data: bData } = await dbSelect('batches', { id: `eq.${ro.batch_id}`, limit: '1' },
      'id,batch_id,order_id,kg,mtr,taka,status,machine_id,supervisor_id,process_route')
    const batch = bData?.[0]
    if (!batch) return NextResponse.json({ ok: false, error: 'Repair batch not found' }, { status: 404 })
    if (batch.status !== 'repairing') {
      return NextResponse.json({ ok: false, error: `${batch.batch_id} is already split (status: ${batch.status}).` }, { status: 400 })
    }

    const route: string[] = (payload.process_route?.length ? payload.process_route
      : batch.process_route?.length ? batch.process_route : ro.process_route) || []
    if (!route.length) return NextResponse.json({ ok: false, error: 'Assign a process route first.' }, { status: 400 })

    const now = new Date().toISOString()
    const freshFields = {
      status: 'pending', current_process: null, is_faulty: false, is_done: false,
      process_route: route, sent_at: null,
      date_calc_plan: null, dc_generated_once: false, dc_regenerate: false,
      updated_at: now,
    }

    const parts: any[] = action === 'split' ? (payload.parts || []) : []
    const created: any[] = []

    if (parts.length > 1) {
      const totalKg = parseFloat(batch.kg) || 0
      const sumKg = parts.reduce((s: number, p: any) => s + (parseFloat(p.kg) || 0), 0)
      if (parts.some((p: any) => !(parseFloat(p.kg) > 0))) {
        return NextResponse.json({ ok: false, error: 'Every part needs a quantity above 0 Kg' }, { status: 400 })
      }
      if (Math.abs(sumKg - totalKg) > 0.5) {
        return NextResponse.json({ ok: false,
          error: `Parts add up to ${sumKg.toFixed(2)} Kg but the repair batch is ${totalKg} Kg — they must match.` }, { status: 400 })
      }

      // Next free -S number for this repair batch
      const { data: sibs } = await dbSelect('batches',
        { batch_id: `like.${batch.batch_id}-S*` }, 'batch_id')
      let maxS = 0
      for (const s2 of sibs || []) {
        const m = String(s2.batch_id).match(/-S(\d+)$/)
        if (m) maxS = Math.max(maxS, parseInt(m[1], 10))
      }

      const p0 = parts[0]
      const { error: u0 } = await dbUpdate('batches', { id: batch.id }, {
        ...freshFields,
        kg:   parseFloat(p0.kg) || 0,
        mtr:  parseFloat(p0.mtr)  || null,
        taka: parseInt(p0.taka)   || null,
        machine_id: p0.machine_id || batch.machine_id || null,
      })
      if (u0) return NextResponse.json({ ok: false, error: u0 }, { status: 500 })

      for (let i = 1; i < parts.length; i++) {
        const p = parts[i]
        const { data: row, error: insErr } = await dbInsert('batches', {
          batch_id:      `${batch.batch_id}-S${maxS + i}`,
          order_id:      batch.order_id,
          supervisor_id: batch.supervisor_id || null,
          machine_id:    p.machine_id || batch.machine_id || null,
          kg:   parseFloat(p.kg) || 0,
          mtr:  parseFloat(p.mtr)  || null,
          taka: parseInt(p.taka)   || null,
          ...freshFields,
        })
        if (insErr) return NextResponse.json({ ok: false, error: `Part ${i + 1}: ${insErr}` }, { status: 500 })
        created.push(row)
      }
    } else {
      const { error: u0 } = await dbUpdate('batches', { id: batch.id }, freshFields)
      if (u0) return NextResponse.json({ ok: false, error: u0 }, { status: 500 })
    }

    // Fresh process rows (reset the repair batch's rows for the new route)
    await sb('/batch_processes?on_conflict=batch_id,process_code', {
      method: 'POST',
      body: JSON.stringify(route.map(code => ({
        batch_id: batch.id, process_code: code, status: 'pending', done_at: null, sent_at: null, received_at: null,
      }))),
      headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
    })
    for (const row of created) {
      if (row?.id) await ensureBatchProcesses(row.id, route)
    }
    // Old schedule no longer applies
    await sb('/batch_date_plans', { method: 'DELETE', params: { batch_id: `eq.${batch.id}` } })

    await dbUpdate('repairing_orders', { id }, { status: 'completed', process_route: route, updated_at: now })
    await auditLog({ action: action === 'split' ? 'repair_split' : 'repair_full_split', entity_type: 'batch',
      entity_id: batch.batch_id, new_value: `${1 + created.length} batch(es)` })

    return NextResponse.json({ ok: true, batches: [batch.batch_id, ...created.map(c => c?.batch_id)] })
  }

  // ── Delete / Rollback ─────────────────────────────────────────────────────
  // Only allowed while the repair batch is still waiting (status 'repairing').
  // Once it has been split / sent on, rolling back would corrupt live batches.
  //   FULL    → batch renamed back (B2-R → B2) and returned to where it was:
  //             faulty source → status 'faulty'
  //             FOB source    → back 'in-process' at the FOB process (FOB reopened)
  //   PARTIAL → the separate repair batch (B2-R) stays as its OWN batch:
  //             faulty source → 'faulty' with the faulty record reopened on it
  //             FOB source    → 'in-process' at the FOB process, FOB reopened on it
  //             The original batch (B2) is never touched.
  if (action === 'delete') {
    if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })

    const { data: roData } = await dbSelect('repairing_orders',
      { id: `eq.${id}` },
      'id,batch_id,faulty_id,fob_id,source_type,reprocess_type,repair_kg,repair_mtr,repair_taka,process_route'
    )
    const ro = roData?.[0]
    if (!ro) return NextResponse.json({ ok: false, error: 'Repairing order not found' }, { status: 404 })

    const { data: batchData } = await dbSelect('batches',
      { id: `eq.${ro.batch_id}` },
      'id,batch_id,kg,mtr,taka,status,process_route,last_process'
    )
    const batch = batchData?.[0]
    if (!batch) return NextResponse.json({ ok: false, error: 'Batch not found' }, { status: 404 })

    if (batch.status !== 'repairing') {
      return NextResponse.json({ ok: false,
        error: `Cannot roll back: ${batch.batch_id} has already been split / sent on (status: ${batch.status}).` },
        { status: 400 })
    }

    const isPartial = ro.reprocess_type === 'partial'
    const isFob     = ro.source_type === 'fob' && !!ro.fob_id

    // Where was it reported? (needed to put a FOB batch back at that process)
    let srcProcess: string | null = batch.last_process || null
    if (isFob) {
      const { data: f } = await dbSelect('fob_records', { id: `eq.${ro.fob_id}`, limit: '1' }, 'id,process_code')
      srcProcess = f?.[0]?.process_code || srcProcess
    } else if (ro.faulty_id) {
      const { data: f } = await dbSelect('faulty_records', { id: `eq.${ro.faulty_id}`, limit: '1' }, 'id,process_code')
      srcProcess = f?.[0]?.process_code || srcProcess
    }

    // Partial repair batches keep their own name; full ones get the -R removed
    const newBatchId = isPartial ? batch.batch_id : revertBatchId(batch.batch_id)

    const batchPatch: Record<string, any> = {
      batch_id:   newBatchId,
      updated_at: new Date().toISOString(),
    }
    if (isFob) {
      Object.assign(batchPatch, { status: 'in-process', current_process: srcProcess, is_faulty: false, last_process: srcProcess })
    } else {
      Object.assign(batchPatch, { status: 'faulty', current_process: null, is_faulty: true, last_process: srcProcess })
    }
    const { error: bErr } = await dbUpdate('batches', { id: batch.id }, batchPatch)
    if (bErr) return NextResponse.json({ ok: false, error: bErr }, { status: 500 })

    // A partial repair batch is a new row — give it process rows so FMS works
    if (isPartial) {
      const route: string[] = batch.process_route || ro.process_route || []
      await ensureBatchProcesses(batch.id, route)
      if (srcProcess) {
        await sb('/batch_processes', {
          method: 'PATCH',
          body: JSON.stringify({ status: isFob ? 'fob' : 'faulty', done_at: new Date().toISOString() }),
          params: { batch_id: `eq.${batch.id}`, process_code: `eq.${srcProcess}` },
          headers: { 'Prefer': 'return=minimal' },
        })
      }
    }

    const reopen = {
      status: 'open',
      batch_id: batch.id,
      notes: 'Returned from Repairing — reopened',
      reprocess_type: null, reprocess_kg: null, reprocess_mtr: null, reprocess_taka: null, next_process: null,
    }
    if (isFob) {
      await dbUpdate('fob_records', { id: ro.fob_id }, { ...reopen, fob_kg: ro.repair_kg, approved_at: null })
    } else if (ro.faulty_id) {
      await dbUpdate('faulty_records', { id: ro.faulty_id }, { ...reopen, faulty_kg: ro.repair_kg, resolved_at: null })
    }

    const { error } = await sb('/repairing_orders', {
      method: 'DELETE',
      params: { id: `eq.${id}` },
    })
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })

    return NextResponse.json({
      ok: true,
      reverted_batch_id: newBatchId,
      source_type: ro.source_type,
    })
  }

  return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 })
}
