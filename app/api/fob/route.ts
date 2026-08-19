import { NextRequest, NextResponse } from 'next/server'
import { dbSelect, dbUpdate, dbInsert, sb, auditLog } from '@/lib/supabase'

// Generate new batch ID for repairing: B2 → B2-R → B2-RR → B2-RRR
function getRepairingBatchId(currentBatchId: string): string {
  if (!currentBatchId) return currentBatchId
  const match = currentBatchId.match(/^(.+?)(-R+)$/)
  if (match) return match[1] + match[2] + 'R'
  return currentBatchId + '-R'
}

export async function GET(req: NextRequest) {
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
      const { data:batches } = await dbSelect('batches',
        { id:`in.(${batchIds.join(',')})`, limit:'2000' },
        'id,batch_id,kg,mtr,taka,sent_at,created_at,process_route,machines(id,name)'
      )
      for (const b of batches||[]) batchMap[b.id] = b
    }
    if (orderIds.length) {
      const { data:orders } = await dbSelect('orders',
        { id:`in.(${orderIds.join(',')})`, limit:'2000' },
        'id,order_number,party,sub_party,article,blend,width,gsm,color,lab_no,lot_no,challan_no,qty_kg,qty_mtr,no_of_taka,type_of_finish,type_of_packing,remarks,supervisors(id,name)'
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
  const body = await req.json()
  const { action, id, ...payload } = body

  // ── Create FOB ────────────────────────────────────────────────────────────
  if (action === 'create') {
    const { data, error } = await dbInsert('fob_records', {
      batch_id:     payload.batch_id,
      order_id:     payload.order_id,
      order_number: payload.order_number,
      party:        payload.party,
      fob_kg:       payload.fob_kg || 0,
      process_code: payload.process_code,
      fob_type:     payload.fob_type || 'dyeing',
      status:       'open',
      notes:        payload.notes || '',
    })
    if (error) return NextResponse.json({ ok:false, error }, { status:500 })

    // Upsert batch_processes: mark this process as 'fob' with done_at timestamp
    // Use upsert because repair batches may not have batch_processes rows yet
    const now = new Date().toISOString()
    await sb('/batch_processes', {
      method: 'POST',
      body: JSON.stringify({
        batch_id:     payload.batch_id,
        process_code: payload.process_code,
        status:       'fob',
        done_at:      now,
      }),
      headers: {
        'Prefer': 'resolution=merge-duplicates,return=minimal',
      },
    })

    // Also save last_process on batch so FMS can show FOB badge even after current_process changes
    await dbUpdate('batches', { id: payload.batch_id }, {
      last_process: payload.process_code,
    })

    return NextResponse.json({ ok:true, data })
  }

  // ── Mark FOB Sent ─────────────────────────────────────────────────────────
  if (action === 'mark_sent') {
    const now = new Date().toISOString()
    const { error } = await dbUpdate('fob_records', { id }, {
      status: 'sent', sent_at: now,
    })
    if (error) return NextResponse.json({ ok:false, error }, { status:500 })
    await auditLog({ action:'fob_sent', entity_type:'fob_record', entity_id:id, new_value:'sent' })
    return NextResponse.json({ ok:true, sent_at:now })
  }

  // ── FOB Approved → batch goes to next process ─────────────────────────────
  if (action === 'fob_approved') {
    const { batch_id, process_code, process_route } = payload
    const route:string[] = process_route || []
    const idx = route.findIndex((c:string) => c.toUpperCase() === (process_code||'').toUpperCase() || c === process_code)
    const nextProcess = idx >= 0 && idx < route.length-1 ? route[idx+1] : null
    const now = new Date().toISOString()

    await dbUpdate('fob_records', { id }, {
      status: 'approved', approved_at: now,
    })
    await dbUpdate('batches', { id: batch_id }, {
      status: nextProcess ? 'in-process' : 'done',
      current_process: nextProcess || null,
      sent_at: now,
    })
    await auditLog({ action:'fob_approved', entity_type:'fob_record', entity_id:id, new_value: nextProcess||'completed' })
    return NextResponse.json({ ok:true, next_process:nextProcess })
  }

  // ── Reprocess (Full or Partial) ───────────────────────────────────────────
  if (action === 'reprocess') {
    const { batch_id, order_id, fob_kg, process_code, process_route,
            reprocess_type, reprocess_kg, reprocess_mtr, reprocess_taka,
            reprocess_reason } = payload
    if (!reprocess_reason?.trim()) return NextResponse.json({ ok:false, error:'Reason required' }, { status:400 })

    const isPartial = reprocess_type === 'partial'
    const repairKg  = isPartial ? (parseFloat(reprocess_kg)||0) : (parseFloat(fob_kg)||0)
    const remainKg  = isPartial ? Math.max(0, (parseFloat(fob_kg)||0) - repairKg) : 0
    const route:string[] = process_route || []
    const idx = route.findIndex((c:string) => c.toUpperCase() === (process_code||'').toUpperCase() || c === process_code)
    const nextProcess = isPartial && remainKg > 0 && idx >= 0 && idx < route.length-1 ? route[idx+1] : null

    await dbUpdate('fob_records', { id }, {
      status: 'repairing',
      notes: reprocess_reason,
      reprocess_type,
      reprocess_kg:   isPartial ? repairKg : null,
      reprocess_mtr:  isPartial ? (parseFloat(reprocess_mtr)||null) : null,
      reprocess_taka: isPartial ? (parseFloat(reprocess_taka)||null) : null,
      next_process:   nextProcess,
    })

    // Get current batch ID and generate new repairing batch ID
    const { data: batchForId } = await dbSelect('batches', { id: `eq.${batch_id}` }, 'id,batch_id,mtr,taka')
    const currentBatch = batchForId?.[0] || {}
    const newBatchId = getRepairingBatchId(currentBatch.batch_id || '')

    // Update batch_id to repairing ID (e.g. DYE26-0003-B2 → DYE26-0003-B2-R)
    if (newBatchId) {
      await dbUpdate('batches', { id: batch_id }, { batch_id: newBatchId })
    }

    await dbInsert('repairing_orders', {
      batch_id,
      fob_id:      id,            // link to fob_record for rollback
      order_id:    order_id||null,
      repair_kg:   repairKg,
      repair_mtr:  isPartial ? (parseFloat(reprocess_mtr)||null) : null,
      repair_taka: isPartial ? (parseFloat(reprocess_taka)||null) : null,
      process_route: route, status:'pending',
      notes: reprocess_reason, source_type:'fob', reprocess_type,
    })

    if (!isPartial || remainKg <= 0) {
      await dbUpdate('batches', { id:batch_id }, {
        status:'repairing', current_process:null,
        kg: repairKg,  // set to exact repair kg
      })
    } else {
      // Proportional mtr/taka for remaining batch
      const totalKg = parseFloat(fob_kg) || 0
      const ratio   = totalKg > 0 ? remainKg / totalKg : 0
      const remainMtr  = currentBatch.mtr  ? Math.round(currentBatch.mtr  * ratio * 10) / 10 : null
      const remainTaka = currentBatch.taka ? Math.round(currentBatch.taka * ratio) : null
      await dbUpdate('batches', { id:batch_id }, {
        kg:remainKg,
        ...(remainMtr  !== null ? { mtr:  remainMtr  } : {}),
        ...(remainTaka !== null ? { taka: remainTaka } : {}),
        status: nextProcess ? 'in-process' : 'done',
        current_process: nextProcess||null,
        sent_at: new Date().toISOString(),
      })
    }

    await auditLog({ action:'fob_reprocess', entity_type:'fob_record', entity_id:id, new_value:`${reprocess_type}:${repairKg}kg` })
    return NextResponse.json({ ok:true, repair_kg:repairKg, remain_kg:remainKg, next_process:nextProcess })
  }

  // ── Standard update ───────────────────────────────────────────────────────
  if (action === 'update') {
    const patch:Record<string,any> = {}
    if (payload.status !== undefined) patch.status = payload.status
    if (payload.notes  !== undefined) patch.notes  = payload.notes
    const { error } = await dbUpdate('fob_records', { id }, patch)
    if (error) return NextResponse.json({ ok:false, error }, { status:500 })
    return NextResponse.json({ ok:true })
  }

  if (action === 'delete') {
    const { error } = await sb('/fob_records', { method:'DELETE', params:{ id:`eq.${id}` } })
    if (error) return NextResponse.json({ ok:false, error }, { status:500 })
    return NextResponse.json({ ok:true })
  }

  return NextResponse.json({ ok:false, error:'Unknown action' }, { status:400 })
}
