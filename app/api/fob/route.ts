import { NextRequest, NextResponse } from 'next/server'
import { dbSelect, dbUpdate, sb, auditLog, dbSelectIn } from '@/lib/supabase'
import { canonicalCode } from '@/lib/processCodes'
import { refreshOrderStatus } from '@/lib/orderStatus'
import { guard, canWorkProcess } from '@/lib/access'
import { rpc, rpcFail } from '@/lib/rpc'


export async function GET(req: NextRequest) {
  const g = await guard(req, 'fob', 'GET')
  if (g.deny) return g.deny
  try {
    const { searchParams } = new URL(req.url)
    const type = searchParams.get('type')
    const query:Record<string,string> = { order:'created_at.desc', limit:'2000' }
    if (type && type !== 'all') query['fob_type'] = `eq.${type}`

    const { data:records, error } = await dbSelect('fob_records', query,
      'id,batch_id,order_id,order_number,party,fob_kg,process_code,fob_type,status,notes,reported_by,sent_at,approved_at,reprocess_type,reprocess_kg,reprocess_mtr,reprocess_taka,next_process,created_at,updated_at'
    )
    if (error) return NextResponse.json({ ok:false, error }, { status:500 })

    const batchIds = [...new Set((records||[]).map((r:any)=>r.batch_id).filter(Boolean))]
    const orderIds = [...new Set((records||[]).map((r:any)=>r.order_id).filter(Boolean))]
    let batchMap:Record<string,any> = {}
    let orderMap:Record<string,any> = {}

    if (batchIds.length) {
      const { data:batches } = await dbSelectIn('batches', 'id', batchIds, 'id,batch_id,kg,mtr,taka,sent_at,created_at,process_route,machines(id,name)'
      )
      for (const b of batches||[]) batchMap[b.id] = b
    }
    if (orderIds.length) {
      const { data:orders } = await dbSelectIn('orders', 'id', orderIds, 'id,order_number,party,sub_party,article,blend,width,gsm,color,lab_no,lot_no,challan_no,qty_kg,qty_mtr,no_of_taka,type_of_finish,type_of_packing,remarks,supervisors(id,name)'
      )
      for (const o of orders||[]) orderMap[o.id] = o
    }

    const enriched = (records||[]).map((r:any) => {
      const batch = batchMap[r.batch_id] || {}
      const order = orderMap[r.order_id] || {}
      return {
        ...r,
        batch_id_str:  batch.batch_id || r.batch_id,
        batch_uuid:    r.batch_id,
        process_route: batch.process_route || [],
        kg:            batch.kg || r.fob_kg,
        qty_mtr:       batch.mtr || order.qty_mtr || '-',
        no_of_taka:    batch.taka || order.no_of_taka || '-',
        machine:       batch.machines?.name || '-',
        batch_sent_at: batch.sent_at || batch.created_at,
        order_number:  order.order_number || r.order_number,
        party:         order.party || r.party,
        sub_party:     order.sub_party || '-',
        article:       order.article || '-',
        blend:         order.blend || '-',
        width:         order.width || '-',
        gsm:           order.gsm || '-',
        color:         order.color || '-',
        lab_no:        order.lab_no || '-',
        lot_no:        order.lot_no || '-',
        challan_no:    order.challan_no || '-',
        type_of_finish:  order.type_of_finish || '-',
        type_of_packing: order.type_of_packing || '-',
        remarks:       order.remarks || '-',
        supervisor:    order.supervisors?.name || '-',
      }
    })
    return NextResponse.json({ ok:true, data:enriched })
  } catch (err:any) {
    return NextResponse.json({ ok:false, error:err.message }, { status:500 })
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const g = await guard(req, 'fob', body.action)
  if (g.deny) return g.deny
  const { action, id, ...payload } = body
  if (payload.process_code) payload.process_code = canonicalCode(payload.process_code)

  const num = (v: any) => (v === undefined || v === null || v === '' || isNaN(Number(v)) ? null : Number(v))

  // ── Create FOB — one all-or-nothing database step (df_fob_create): refuses
  // if the batch is no longer at this process or already has an open FOB here.
  if (action === 'create') {
    if (!payload.batch_id || !payload.process_code) {
      return NextResponse.json({ ok: false, error: 'batch_id and process_code required' }, { status: 400 })
    }
    if (!canWorkProcess(g.user!, payload.process_code)) {
      return NextResponse.json({ ok: false, error: `You don't have Edit permission on FMS — ${payload.process_code}.` }, { status: 403 })
    }
    const r = await rpc<any>('df_fob_create', {
      p_batch: payload.batch_id, p_code: payload.process_code, p_kg: num(payload.fob_kg),
      p_type: payload.fob_type || 'dyeing', p_notes: payload.notes || '',
    })
    if (r.error) return rpcFail(r)
    return NextResponse.json({ ok: true, data: [{ id: r.data?.id }] })
  }

  // ── Mark FOB Sent (only an open FOB) ──────────────────────────────────────
  if (action === 'mark_sent') {
    if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })
    const now = new Date().toISOString()
    const { data, error } = await sb<any[]>('/fob_records', {
      method: 'PATCH', params: { id: `eq.${id}`, status: 'eq.open' },
      body: JSON.stringify({ status: 'sent', sent_at: now }),
    })
    if (error) return NextResponse.json({ ok:false, error }, { status:500 })
    if (!Array.isArray(data) || !data.length) {
      return NextResponse.json({ ok: false, stale: true, error: 'This FOB is no longer open. Refresh the page.' }, { status: 409 })
    }
    await auditLog({ action:'fob_sent', entity_type:'fob_record', entity_id:id, new_value:'sent' })
    return NextResponse.json({ ok:true, sent_at:now })
  }

  // ── FOB Approved → batch goes to next process — one all-or-nothing
  // database step (df_fob_approve); next process from the batch's own route.
  if (action === 'fob_approved') {
    if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })
    const r = await rpc<any>('df_fob_approve', { p_record: id })
    if (r.error) return rpcFail(r)
    await refreshOrderStatus(r.data?.order_id)   // keep orders.status in step
    return NextResponse.json({ ok: true, next_process: r.data?.next_process ?? null })
  }

  // ── Reprocess (Full or Partial) — one all-or-nothing database step (df_reprocess)
  if (action === 'reprocess') {
    const { reprocess_type, reprocess_kg, reprocess_mtr, reprocess_taka, reprocess_reason } = payload
    if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })
    if (!String(reprocess_reason || '').trim()) return NextResponse.json({ ok: false, error: 'Reason required' }, { status: 400 })
    const taka = num(reprocess_taka)
    const r = await rpc<any>('df_reprocess', {
      p_source: 'fob', p_record: id, p_type: reprocess_type || 'full',
      p_kg: num(reprocess_kg), p_mtr: num(reprocess_mtr), p_taka: taka === null ? null : Math.round(taka),
      p_reason: String(reprocess_reason).trim(),
    })
    if (r.error) return rpcFail(r)
    await refreshOrderStatus(r.data?.order_id)   // keep orders.status in step
    return NextResponse.json({ ok: true, repair_kg: r.data?.repair_kg, remain_kg: r.data?.remain_kg,
      next_process: r.data?.next_process ?? null, repair_batch_id: r.data?.repair_batch_id })
  }

  // ── Standard update ───────────────────────────────────────────────────────
  if (action === 'update') {
    // Only notes can be edited here. Status changes go through Mark Sent /
    // Approved / Reprocess, which also move the batch — changing the status
    // alone would leave the batch stuck.
    const patch:Record<string,any> = {}
    if (payload.notes  !== undefined) patch.notes  = payload.notes
    if (!Object.keys(patch).length) return NextResponse.json({ ok:false, error:'Nothing to update' }, { status:400 })
    const { error } = await dbUpdate('fob_records', { id }, patch)
    if (error) return NextResponse.json({ ok:false, error }, { status:500 })
    return NextResponse.json({ ok:true })
  }

  if (action === 'delete') {
    // Delete — admin only (POLICY in lib/access.ts)
    const { error } = await sb('/fob_records', { method:'DELETE', params:{ id:`eq.${id}` } })
    if (error) return NextResponse.json({ ok:false, error }, { status:500 })
    return NextResponse.json({ ok:true })
  }

  return NextResponse.json({ ok:false, error:'Unknown action' }, { status:400 })
}
