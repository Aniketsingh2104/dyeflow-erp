import { NextRequest, NextResponse } from 'next/server'
import { dbSelect, dbUpdate, dbInsert, sb, auditLog } from '@/lib/supabase'

// Generate new batch ID for repairing: B2 → B2-R → B2-RR → B2-RRR
function getRepairingBatchId(currentBatchId: string): string {
  if (!currentBatchId) return currentBatchId
  const match = currentBatchId.match(/^(.+?)(-R+)$/)
  if (match) return match[1] + match[2] + 'R'
  return currentBatchId + '-R'
}

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

  // ── Reprocess (Full or Partial) ───────────────────────────────────────────
  if (action === 'reprocess') {
    const { batch_id, order_id, faulty_kg, process_code, process_route,
            reprocess_type, reprocess_kg, reprocess_mtr, reprocess_taka,
            reprocess_reason } = payload
    if (!reprocess_reason?.trim()) return NextResponse.json({ ok: false, error: 'Reason required' }, { status: 400 })

    const isPartial  = reprocess_type === 'partial'
    const repairKg   = isPartial ? (parseFloat(reprocess_kg)||0) : (parseFloat(faulty_kg)||0)
    const remainKg   = isPartial ? Math.max(0, (parseFloat(faulty_kg)||0) - repairKg) : 0
    const route: string[] = process_route || []
    const idx = route.findIndex((c:string) => c.toUpperCase() === (process_code||'').toUpperCase() || c === process_code)
    const nextProcess = isPartial && remainKg > 0 && idx >= 0 && idx < route.length-1 ? route[idx+1] : null

    // Update faulty record
    await dbUpdate('faulty_records', { id }, {
      status: 'repairing',
      notes: reprocess_reason,
      reprocess_type,
      reprocess_kg:   isPartial ? repairKg : null,
      reprocess_mtr:  isPartial ? (parseFloat(reprocess_mtr)||0) : null,
      reprocess_taka: isPartial ? (parseFloat(reprocess_taka)||0) : null,
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

    // Create repairing order with new batch ID
    await dbInsert('repairing_orders', {
      batch_id, order_id: order_id||null,
      repair_kg: repairKg,
      repair_mtr:  isPartial ? (parseFloat(reprocess_mtr)||null) : null,
      repair_taka: isPartial ? (parseFloat(reprocess_taka)||null) : null,
      process_route: route, status:'pending',
      notes: reprocess_reason, source_type:'faulty', reprocess_type,
    })

    // Update batch
    if (!isPartial || remainKg <= 0) {
      await dbUpdate('batches', { id: batch_id }, {
        is_faulty:false, status:'repairing', current_process:null,
      })
    } else {
      // For partial: calculate remaining mtr and taka proportionally
      const totalKg = parseFloat(faulty_kg) || 0
      const ratio = totalKg > 0 ? remainKg / totalKg : 0
      // Use already fetched batch data
      const remainMtr  = currentBatch.mtr  ? Math.round(currentBatch.mtr  * ratio * 10) / 10 : null
      const remainTaka = currentBatch.taka ? Math.round(currentBatch.taka * ratio) : null
      await dbUpdate('batches', { id: batch_id }, {
        is_faulty:false, kg:remainKg,
        ...(remainMtr  !== null ? { mtr:  remainMtr  } : {}),
        ...(remainTaka !== null ? { taka: remainTaka } : {}),
        status: nextProcess ? 'in-process' : 'done',
        current_process: nextProcess||null,
        sent_at: new Date().toISOString(),
      })
    }

    await auditLog({ action:'faulty_reprocess', entity_type:'faulty_record', entity_id:id, new_value:`${reprocess_type}:${repairKg}kg` })
    return NextResponse.json({ ok:true, repair_kg:repairKg, remain_kg:remainKg, next_process:nextProcess })
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
    const { error } = await sb('/faulty_records', { method:'DELETE', params:{ id:`eq.${id}` } })
    if (error) return NextResponse.json({ ok:false, error }, { status:500 })
    return NextResponse.json({ ok:true })
  }

  return NextResponse.json({ ok:false, error:'Unknown action' }, { status:400 })
}
