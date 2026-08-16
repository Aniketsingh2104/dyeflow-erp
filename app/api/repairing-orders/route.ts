import { NextRequest, NextResponse } from 'next/server'
import { dbSelect, dbInsert, dbUpdate } from '@/lib/supabase'

export async function GET() {
  try {
    // Select only columns that exist in repairing_orders
    const { data: records, error } = await dbSelect('repairing_orders',
      { order: 'created_at.desc', limit: '1000' },
      'id,batch_id,order_id,faulty_id,repair_kg,repair_mtr,repair_taka,process_route,status,notes,source_type,reprocess_type,created_at,updated_at'
    )
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })

    // Enrich with batch and order details via UUID joins
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
        batch_id_str:    batch.batch_id         || '-',
        machine:         batch.machines?.name   || '-',
        order_number:    order.order_number     || '-',
        party:           order.party            || '-',
        sub_party:       order.sub_party        || '-',
        article:         order.article          || '-',
        blend:           order.blend            || '-',
        gsm:             order.gsm              || '-',
        color:           order.color            || '-',
        lab_no:          order.lab_no           || '-',
        challan_no:      order.challan_no       || '-',
        type_of_finish:  order.type_of_finish   || '-',
        type_of_packing: order.type_of_packing  || '-',
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

  if (action === 'create') {
    const { data, error } = await dbInsert('repairing_orders', {
      faulty_id:      payload.faulty_id      || null,
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

  return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 })
}
