import { NextRequest, NextResponse } from 'next/server'
import { dbSelect, dbUpdate, sb, auditLog } from '@/lib/supabase'

export async function GET() {
  try {
    // Fetch faulty records with batch and order details via join
    const { data: records, error } = await dbSelect(
      'faulty_records',
      { order: 'created_at.desc', limit: '2000' },
      'id,batch_id,order_id,order_number,party,color,faulty_type,faulty_kg,process_code,status,if_ok,notes,reported_by,resolved_at,created_at,updated_at'
    )
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })

    // Enrich with batch and order details
    const batchIds = [...new Set((records || []).map((r: any) => r.batch_id).filter(Boolean))]
    const orderIds = [...new Set((records || []).map((r: any) => r.order_id).filter(Boolean))]

    let batchMap: Record<string, any> = {}
    let orderMap: Record<string, any> = {}

    if (batchIds.length) {
      const { data: batches } = await dbSelect('batches',
        { id: `in.(${batchIds.join(',')})`, limit: '2000' },
        'id,batch_id,kg,mtr,taka,sent_at,created_at,machines(id,name)'
      )
      for (const b of batches || []) batchMap[b.id] = b
    }

    if (orderIds.length) {
      const { data: orders } = await dbSelect('orders',
        { id: `in.(${orderIds.join(',')})`, limit: '2000' },
        'id,order_number,party,sub_party,article,blend,width,gsm,color,lab_no,lot_no,challan_no,qty_kg,qty_mtr,no_of_taka,type_of_finish,type_of_packing,remarks,supervisors(id,name)'
      )
      for (const o of orders || []) orderMap[o.id] = o
    }

    const enriched = (records || []).map((r: any) => {
      const batch = batchMap[r.batch_id] || {}
      const order = orderMap[r.order_id] || {}
      return {
        ...r,
        // Batch fields
        batch_id_str:    batch.batch_id || r.batch_id,  // human-readable ID
        batch_uuid:      r.batch_id,
        kg:              batch.kg || r.faulty_kg,
        qty_mtr:         batch.mtr || order.qty_mtr || '-',
        no_of_taka:      batch.taka || order.no_of_taka || '-',
        machine:         batch.machines?.name || '-',
        sent_at:         batch.sent_at || batch.created_at,
        // Order fields
        order_number:    order.order_number || r.order_number,
        party:           order.party        || r.party,
        sub_party:       order.sub_party    || '-',
        article:         order.article      || '-',
        blend:           order.blend        || '-',
        width:           order.width        || '-',
        gsm:             order.gsm          || '-',
        color:           order.color || r.color || '-',
        lab_no:          order.lab_no       || '-',
        lot_no:          order.lot_no       || '-',
        challan_no:      order.challan_no   || '-',
        type_of_finish:  order.type_of_finish  || '-',
        type_of_packing: order.type_of_packing || '-',
        remarks:         order.remarks      || '-',
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

  if (action === 'update') {
    if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })
    const patch: Record<string, any> = {}
    if (payload.status !== undefined) patch.status = payload.status
    if (payload.notes  !== undefined) patch.notes  = payload.notes
    if (payload.if_ok  !== undefined) patch.if_ok  = payload.if_ok
    if (payload.status === 'resolved') patch.resolved_at = new Date().toISOString()
    const { error } = await dbUpdate('faulty_records', { id }, patch)
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    await auditLog({ action: 'faulty_update', entity_type: 'faulty_record', entity_id: id, new_value: payload.status })
    return NextResponse.json({ ok: true })
  }

  if (action === 'delete') {
    if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })
    const { error } = await sb('/faulty_records', { method: 'DELETE', params: { id: `eq.${id}` } })
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 })
}
