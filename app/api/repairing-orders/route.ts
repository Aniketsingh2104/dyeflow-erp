import { NextRequest, NextResponse } from 'next/server'
import { dbSelect, dbInsert, dbUpdate, dbSelectIn } from '@/lib/supabase'
import { deriveMachineMap } from '@/lib/machineMap'
import { canonicalCode } from '@/lib/processCodes'
import { refreshOrderStatus } from '@/lib/orderStatus'
import { guard } from '@/lib/access'
import { rpc, rpcFail } from '@/lib/rpc'

// 'completed' is set only by Split / Full Split (df_repair_split)
const RO_STATUSES = ['pending', 'In Repair']

export async function GET(req: NextRequest) {
  const g = await guard(req, 'repairing-orders', 'GET')
  if (g.deny) return g.deny
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
      const { data: batches } = await dbSelectIn('batches', 'id', batchIds, 'id,batch_id,sub_prod_no,kg,mtr,taka,status,machine_id,process_route,machines(id,name)'
      )
      for (const b of batches || []) batchMap[b.id] = b
    }

    if (orderIds.length) {
      const { data: orders } = await dbSelectIn('orders', 'id', orderIds, 'id,order_number,party,sub_party,article,blend,width,gsm,color,lab_no,lot_no,challan_no,type_of_finish,type_of_packing,supervisors(id,name)'
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
        sub_prod_no:     batch.sub_prod_no       || null,
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
  const body = await req.json().catch(() => ({}))
  const g = await guard(req, 'repairing-orders', body.action)
  if (g.deny) return g.deny
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
    if (payload.status    !== undefined) {
      if (!RO_STATUSES.includes(payload.status)) {
        return NextResponse.json({ ok: false, error: `Unknown status "${payload.status}"` }, { status: 400 })
      }
      patch.status = payload.status
    }
    if (payload.notes     !== undefined) patch.notes     = payload.notes
    if (payload.repair_kg !== undefined) patch.repair_kg = payload.repair_kg
    const { error } = await dbUpdate('repairing_orders', { id }, patch)
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  // ── Split / Full Split a repair batch — one all-or-nothing database step
  // (df_repair_split). Used by the Repairing Order page AND the supervisor
  // Repair Queue.
  //   full_split → the repair batch itself becomes 'pending' (ready for numbering)
  //   split      → part 1 stays on the repair batch, parts 2..n become new
  //                batches <repairId>-S1, -S2 …  Total must equal the repair qty.
  // Every resulting batch gets fresh 'pending' process rows for its route and
  // its old schedule is cleared. A second click / stale page gets 409.
  if (action === 'split' || action === 'full_split') {
    if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })
    // Read the current route + machine only to work out each part's
    // machine map; the database function re-checks everything under a lock.
    const { data: roData } = await dbSelect('repairing_orders', { id: `eq.${id}`, limit: '1' }, 'id,batch_id,process_route')
    const ro = roData?.[0]
    if (!ro) return NextResponse.json({ ok: false, error: 'Repairing order not found' }, { status: 404 })
    const { data: bData } = await dbSelect('batches', { id: `eq.${ro.batch_id}`, limit: '1' }, 'id,machine_id,process_route')
    const batch = bData?.[0]
    if (!batch) return NextResponse.json({ ok: false, error: 'Repair batch not found' }, { status: 404 })

    const rawRoute: string[] = (payload.process_route?.length ? payload.process_route
      : batch.process_route?.length ? batch.process_route : ro.process_route) || []
    const route = rawRoute.map((c: string) => canonicalCode(c)).filter(Boolean)
    if (!route.length) return NextResponse.json({ ok: false, error: 'Assign a process route first.' }, { status: 400 })

    const rawParts: any[] = action === 'split' && Array.isArray(payload.parts) && payload.parts.length > 1 ? payload.parts : []
    const num = (v: any) => (v === undefined || v === null || v === '' || isNaN(Number(v)) ? null : Number(v))
    const parts = rawParts.map((p: any) => {
      const machine = p.machine_id || batch.machine_id || null
      return {
        kg: num(p.kg) ?? 0, mtr: num(p.mtr), taka: num(p.taka) === null ? null : Math.round(Number(p.taka)),
        machine_id: machine, map: deriveMachineMap(route, null, machine),
      }
    })
    if (!parts.length) {
      // full split: keep the repair batch's machine, fresh map for the route
      parts.push({ kg: 0, mtr: null, taka: null, machine_id: batch.machine_id || null,
                   map: deriveMachineMap(route, null, batch.machine_id || null) })
    }

    const r = await rpc<any>('df_repair_split', { p_repair: id, p_route: route, p_parts: parts })
    if (r.error) return rpcFail(r)
    await refreshOrderStatus(r.data?.order_id)   // keep orders.status in step
    return NextResponse.json({ ok: true, batches: r.data?.batches || [] })
  }

  // ── Delete / Rollback — one all-or-nothing database step (df_repair_rollback)
  // Only allowed while the repair batch is still waiting (status 'repairing').
  //   FULL    → batch renamed back (B2-R → B2) and returned to where it was:
  //             faulty source → status 'faulty'
  //             FOB source    → back 'in-process' at the FOB process (FOB reopened)
  //   PARTIAL → the separate repair batch (B2-R) stays as its OWN batch:
  //             faulty source → 'faulty' with the faulty record reopened on it
  //             FOB source    → 'in-process' at the FOB process, FOB reopened on it
  //             The original batch (B2) is never touched.
  if (action === 'delete') {
    // admin only (POLICY in lib/access.ts)
    if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })
    const r = await rpc<any>('df_repair_rollback', { p_repair: id })
    if (r.error) return rpcFail(r)
    await refreshOrderStatus(r.data?.order_id)   // keep orders.status in step
    return NextResponse.json({ ok: true, reverted_batch_id: r.data?.reverted_batch_id, source_type: r.data?.source_type })
  }

  return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 })
}
