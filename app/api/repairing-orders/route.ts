import { NextRequest, NextResponse } from 'next/server'
import { dbSelect, dbInsert, dbUpdate, sb } from '@/lib/supabase'

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
        'id,batch_id,kg,mtr,taka,machines(id,name)'
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

  // ── Delete / Rollback ─────────────────────────────────────────────────────
  if (action === 'delete') {
    if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })

    // 1. Fetch the repairing order
    const { data: roData } = await dbSelect('repairing_orders',
      { id: `eq.${id}` },
      'id,batch_id,faulty_id,fob_id,source_type,reprocess_type,repair_kg,repair_mtr,repair_taka'
    )
    const ro = roData?.[0]
    if (!ro) return NextResponse.json({ ok: false, error: 'Repairing order not found' }, { status: 404 })

    // 2. Fetch current batch to get current batch_id string
    const { data: batchData } = await dbSelect('batches',
      { id: `eq.${ro.batch_id}` },
      'id,batch_id,kg,mtr,taka,status'
    )
    const batch = batchData?.[0]
    if (!batch) return NextResponse.json({ ok: false, error: 'Batch not found' }, { status: 404 })

    // 3. Revert batch ID (remove one R)
    const revertedBatchId = revertBatchId(batch.batch_id)

    // 4. Update batch — revert ID and set back to faulty status
    await dbUpdate('batches', { id: ro.batch_id }, {
      batch_id:        revertedBatchId,
      status:          'faulty',
      current_process: null,
      is_faulty:       true,
    })

    // 5. Reopen the source record (faulty or fob) with the repair kg
    if (ro.source_type === 'faulty' && ro.faulty_id) {
      // Reopen faulty record — set status back to open with repair kg
      await dbUpdate('faulty_records', { id: ro.faulty_id }, {
        status:    'open',
        faulty_kg: ro.repair_kg,  // restore repair qty (full or partial)
        notes:     'Returned from Repairing — reopened',
        resolved_at: null,
        reprocess_type: null,
        reprocess_kg:   null,
        reprocess_mtr:  null,
        reprocess_taka: null,
        next_process:   null,
      })
    } else if (ro.source_type === 'fob' && ro.fob_id) {
      // Reopen FOB record
      await dbUpdate('fob_records', { id: ro.fob_id }, {
        status:      'open',
        fob_kg:      ro.repair_kg,
        notes:       'Returned from Repairing — reopened',
        approved_at: null,
        reprocess_type: null,
        reprocess_kg:   null,
        reprocess_mtr:  null,
        reprocess_taka: null,
        next_process:   null,
      })
    } else {
      // No source record linked — just reopen as faulty
      await dbUpdate('batches', { id: ro.batch_id }, {
        status:    'faulty',
        is_faulty: true,
      })
    }

    // 6. Delete the repairing order
    const { error } = await sb('/repairing_orders', {
      method: 'DELETE',
      params: { id: `eq.${id}` },
    })
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })

    return NextResponse.json({
      ok: true,
      reverted_batch_id: revertedBatchId,
      source_type: ro.source_type,
    })
  }

  return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 })
}
