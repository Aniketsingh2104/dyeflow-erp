import { NextRequest, NextResponse } from 'next/server'
import { dbSelect, dbUpdate, dbInsert, sb, auditLog, dbSelectIn } from '@/lib/supabase'
import { canonicalCode } from '@/lib/processCodes'
import { refreshOrderStatus } from '@/lib/orderStatus'
import { guard } from '@/lib/access'
import { rpc, rpcFail } from '@/lib/rpc'


export async function GET(req: NextRequest) {
  const g = await guard(req, 'faulty', 'GET')
  if (g.deny) return g.deny
  try {
    const { data: records, error } = await dbSelect('faulty_records',
      // every open / repairing record, plus the closed ones of the last 180 days
      { order: 'created_at.desc', or: `(status.in.(open,repairing),created_at.gte.${new Date(Date.now() - 180 * 86_400_000).toISOString()})` },
      'id,batch_id,order_id,order_number,party,color,faulty_type,faulty_kg,process_code,status,if_ok,notes,reported_by,resolved_at,reprocess_type,reprocess_kg,reprocess_mtr,reprocess_taka,next_process,created_at,updated_at'
    )
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })

    const batchIds = [...new Set((records||[]).map((r:any)=>r.batch_id).filter(Boolean))]
    const orderIds = [...new Set((records||[]).map((r:any)=>r.order_id).filter(Boolean))]
    let batchMap: Record<string,any> = {}
    let orderMap: Record<string,any> = {}

    if (batchIds.length) {
      const { data: batches } = await dbSelectIn('batches', 'id', batchIds, 'id,batch_id,kg,mtr,taka,sent_at,created_at,process_route,machines(id,name)'
      )
      for (const b of batches||[]) batchMap[b.id] = b
    }
    if (orderIds.length) {
      const { data: orders } = await dbSelectIn('orders', 'id', orderIds, 'id,order_number,party,sub_party,article,blend,width,gsm,color,lab_no,lot_no,challan_no,qty_kg,qty_mtr,no_of_taka,type_of_finish,type_of_packing,remarks,supervisors(id,name)'
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
  const body = await req.json().catch(() => ({}))
  const g = await guard(req, 'faulty', body.action)
  if (g.deny) return g.deny
  const { action, id, ...payload } = body
  if (payload.process_code) payload.process_code = canonicalCode(payload.process_code)

  const num = (v: any) => (v === undefined || v === null || v === '' || isNaN(Number(v)) ? null : Number(v))

  // ── Mark OK — one all-or-nothing database step (df_faulty_ok): refuses if
  // the record is no longer open or the batch moved; the next process comes
  // from the batch's own route in the database, never from the browser.
  if (action === 'mark_ok') {
    if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })
    const r = await rpc<any>('df_faulty_ok', { p_record: id, p_notes: payload.notes || null })
    if (r.error) return rpcFail(r)
    await refreshOrderStatus(r.data?.order_id)   // keep orders.status in step
    return NextResponse.json({ ok: true, next_process: r.data?.next_process ?? null })
  }

  // ── Reprocess (Full or Partial) — one all-or-nothing database step
  // (df_reprocess): a partial reprocess splits the repair part into its own
  // batch; quantities are checked against the batch in the database.
  if (action === 'reprocess') {
    const { reprocess_type, reprocess_kg, reprocess_mtr, reprocess_taka, reprocess_reason } = payload
    if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })
    if (!String(reprocess_reason || '').trim()) return NextResponse.json({ ok: false, error: 'Reason required' }, { status: 400 })
    const taka = num(reprocess_taka)
    const r = await rpc<any>('df_reprocess', {
      p_source: 'faulty', p_record: id, p_type: reprocess_type || 'full',
      p_kg: num(reprocess_kg), p_mtr: num(reprocess_mtr), p_taka: taka === null ? null : Math.round(taka),
      p_reason: String(reprocess_reason).trim(),
    })
    if (r.error) return rpcFail(r)
    await refreshOrderStatus(r.data?.order_id)   // keep orders.status in step
    return NextResponse.json({ ok: true, repair_kg: r.data?.repair_kg, remain_kg: r.data?.remain_kg,
      next_process: r.data?.next_process ?? null, repair_batch_id: r.data?.repair_batch_id })
  }

  // ── Standard update: notes, or Write Off ─────────────────────────────────
  // By hand a record can only be WRITTEN OFF (Open → Resolved goes through
  // "Mark OK", → Repairing through "Reprocess"). Writing off is one database
  // step (df_faulty_write_off): the record closes and its batch is finished
  // as 'written-off', so the order can still reach Done.
  if (action === 'update') {
    if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })
    if (payload.status !== undefined) {
      const { data: cur } = await dbSelect('faulty_records', { id: `eq.${id}`, limit: '1' }, 'status')
      const was = cur?.[0]?.status
      if (payload.status !== was) {
        if (payload.status !== 'written-off') {
          return NextResponse.json({ ok:false, error:`Use "Mark OK" or "Reprocess" to change the status — only "Written Off" can be set here.` }, { status:400 })
        }
        const r = await rpc<any>('df_faulty_write_off', { p_record: id, p_notes: payload.notes ?? null })
        if (r.error) return rpcFail(r)
        return NextResponse.json({ ok: true })
      }
    }
    if (payload.notes === undefined) return NextResponse.json({ ok:true })
    const { error } = await dbUpdate('faulty_records', { id }, { notes: payload.notes })
    if (error) return NextResponse.json({ ok:false, error }, { status:500 })
    return NextResponse.json({ ok:true })
  }

  if (action === 'delete') {
    // Delete — admin only (POLICY in lib/access.ts), and only a CLOSED record:
    // deleting an open one would leave its batch faulty with nothing to clear it.
    const { data, error } = await sb<any[]>('/faulty_records', {
      method: 'DELETE', params: { id: `eq.${id}`, status: 'in.(resolved,written-off)' },
    })
    if (error) return NextResponse.json({ ok:false, error }, { status:500 })
    if (!Array.isArray(data) || !data.length) {
      return NextResponse.json({ ok:false, stale:true, error:'Only a resolved or written-off record can be deleted — Mark OK, Reprocess or Write Off it first.' }, { status:409 })
    }
    return NextResponse.json({ ok:true })
  }

  return NextResponse.json({ ok:false, error:'Unknown action' }, { status:400 })
}
