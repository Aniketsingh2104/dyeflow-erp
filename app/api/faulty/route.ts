import { NextRequest, NextResponse } from 'next/server'
import { dbSelect, dbUpdate, dbInsert, sb, auditLog } from '@/lib/supabase'
import { startReprocess } from '@/lib/repair'
import { requireAdmin } from '@/lib/auth'


export async function GET() {
  try {
    const { data: records, error } = await dbSelect('faulty_records',
      { order: 'created_at.desc', limit: '2000' },
      'id,batch_id,order_id,order_number,party,color,faulty_type,faulty_kg,process_code,status,if_ok,notes,reported_by,resolved_at,reprocess_type,reprocess_kg,reprocess_mtr,reprocess_taka,next_process,created_at,updated_at'
    )
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })

    const batchIds = [...new Set((records||[]).map((r:any)=>r.batch_id).filter(Boolean))]
    const orderIds = [...new Set((records||[]).map((r:any)=>r.order_id).filter(Boolean))]
    let batchMap: Record<string,any> = {}
    let orderMap: Record<string,any> = {}

    if (batchIds.length) {
      const { data: batches } = await dbSelect('batches',
        { id: `in.(${batchIds.join(',')})`, limit: '2000' },
        'id,batch_id,kg,mtr,taka,sent_at,created_at,process_route,machines(id,name)'
      )
      for (const b of batches||[]) batchMap[b.id] = b
    }
    if (orderIds.length) {
      const { data: orders } = await dbSelect('orders',
        { id: `in.(${orderIds.join(',')})`, limit: '2000' },
        'id,order_number,party,sub_party,article,blend,width,gsm,color,lab_no,lot_no,challan_no,qty_kg,qty_mtr,no_of_taka,type_of_finish,type_of_packing,remarks,supervisors(id,name)'
      )
      for (const o of orders||[]) orderMap[o.id] = o
    }

    const enriched = (records||[]).map((r:any) => {
      const batch = batchMap[r.batch_id] || {}
      const order = orderMap[r.order_id] || {}
      return {
        ...r,
        batch_id_str: batch.batch_id || r.batch_id,
        batch_uuid:   r.batch_id,
        process_route: batch.process_route || [],
        kg:           batch.kg || r.faulty_kg,
        qty_mtr:      batch.mtr || order.qty_mtr || '-',
        no_of_taka:   batch.taka || order.no_of_taka || '-',
        machine:      batch.machines?.name || '-',
        sent_at:      batch.sent_at || batch.created_at,
        order_number: order.order_number || r.order_number,
        party:        order.party || r.party,
        sub_party:    order.sub_party || '-',
        article:      order.article || '-',
        blend:        order.blend || '-',
        width:        order.width || '-',
        gsm:          order.gsm || '-',
        color:        order.color || r.color || '-',
        lab_no:       order.lab_no || '-',
        lot_no:       order.lot_no || '-',
        challan_no:   order.challan_no || '-',
        type_of_finish:  order.type_of_finish || '-',
        type_of_packing: order.type_of_packing || '-',
        remarks:      order.remarks || '-',
        supervisor:   order.supervisors?.name || '-',
      }
    })
    return NextResponse.json({ ok: true, data: enriched })
  } catch (err:any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { action, id, ...payload } = body

  // ── Mark OK ───────────────────────────────────────────────────────────────
  if (action === 'mark_ok') {
    const { batch_id, process_code, process_route } = payload
    const route: string[] = process_route || []
    const idx = route.findIndex((c:string) => c.toUpperCase() === (process_code||'').toUpperCase() || c === process_code)
    const nextProcess = idx >= 0 && idx < route.length - 1 ? route[idx+1] : null

    await dbUpdate('faulty_records', { id }, {
      status: 'resolved', if_ok: true, resolved_at: new Date().toISOString(),
      notes: payload.notes || 'Marked OK — sent to next process',
    })
    await dbUpdate('batches', { id: batch_id }, {
      is_faulty: false,
      status: nextProcess ? 'in-process' : 'done',
      current_process: nextProcess || null,
      sent_at: new Date().toISOString(),
    })
    await auditLog({ action:'faulty_ok', entity_type:'faulty_record', entity_id:id, new_value: nextProcess || 'completed' })
    return NextResponse.json({ ok: true, next_process: nextProcess })
  }

  // ── Reprocess (Full or Partial) — shared logic in lib/repair.ts ─────────
  // Partial reprocess now creates a SEPARATE batch row for the repair part,
  // so the remaining qty that carries on is never touched by the repair flow.
  if (action === 'reprocess') {
    const { batch_id, order_id, faulty_kg, process_code, process_route,
            reprocess_type, reprocess_kg, reprocess_mtr, reprocess_taka,
            reprocess_reason } = payload
    if (!reprocess_reason?.trim()) return NextResponse.json({ ok: false, error: 'Reason required' }, { status: 400 })
    if (!batch_id) return NextResponse.json({ ok: false, error: 'batch_id required' }, { status: 400 })

    const r = await startReprocess({
      source: 'faulty', recordId: id, batch_id, order_id,
      sourceKg: parseFloat(faulty_kg) || 0, process_code, process_route: process_route || [],
      reprocess_type, reprocess_kg, reprocess_mtr, reprocess_taka, reason: reprocess_reason,
    })
    if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: r.status || 500 })

    await auditLog({ action:'faulty_reprocess', entity_type:'faulty_record', entity_id:id,
      new_value:`${reprocess_type}:${r.repair_kg}kg → ${r.repair_batch_id}` })
    return NextResponse.json({ ok:true, repair_kg:r.repair_kg, remain_kg:r.remain_kg, next_process:r.next_process, repair_batch_id:r.repair_batch_id })
  }

  // ── Standard update ───────────────────────────────────────────────────────
  if (action === 'update') {
    const patch:Record<string,any> = {}
    if (payload.status !== undefined) patch.status = payload.status
    if (payload.notes  !== undefined) patch.notes  = payload.notes
    if (payload.if_ok  !== undefined) patch.if_ok  = payload.if_ok
    if (payload.status === 'resolved') patch.resolved_at = new Date().toISOString()
    const { error } = await dbUpdate('faulty_records', { id }, patch)
    if (error) return NextResponse.json({ ok:false, error }, { status:500 })
    return NextResponse.json({ ok:true })
  }

  if (action === 'delete') {
    // Delete — admin only (checked on the server — lib/auth.ts)
    { const deny = await requireAdmin(req); if (deny) return deny }
    const { error } = await sb('/faulty_records', { method:'DELETE', params:{ id:`eq.${id}` } })
    if (error) return NextResponse.json({ ok:false, error }, { status:500 })
    return NextResponse.json({ ok:true })
  }

  return NextResponse.json({ ok:false, error:'Unknown action' }, { status:400 })
}
