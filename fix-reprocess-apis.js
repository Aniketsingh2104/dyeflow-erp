const fs = require('fs')

// ── Shared reprocess logic helper (used in both faulty and fob APIs) ──────────
const REPROCESS_HELPER = `
// Helper: handle full or partial reprocess
async function handleReprocess({
  recordId, recordTable, batchId, orderId, faultyKg, processCode,
  processRoute, reprocessType, reprocessKg, reprocessMtr, reprocessTaka,
  reprocessReason, sourceType, dbUpdate, dbInsert,
}: {
  recordId: string; recordTable: string; batchId: string; orderId: string
  faultyKg: number; processCode: string; processRoute: string[]
  reprocessType: 'full'|'partial'
  reprocessKg?: number; reprocessMtr?: number; reprocessTaka?: number
  reprocessReason: string; sourceType: 'faulty'|'fob'
  dbUpdate: any; dbInsert: any
}) {
  const isPartial = reprocessType === 'partial'
  const repairKg  = isPartial ? (reprocessKg  || 0) : faultyKg
  const repairMtr = isPartial ? (reprocessMtr || 0) : undefined
  const repairTaka= isPartial ? (reprocessTaka|| 0) : undefined
  const remainKg  = isPartial ? Math.max(0, faultyKg - repairKg) : 0

  // Find next process for remaining batch (partial only)
  let nextProcess: string | null = null
  if (isPartial && remainKg > 0) {
    const idx = processRoute.findIndex((c: string) =>
      c.toUpperCase() === processCode.toUpperCase() || c === processCode
    )
    nextProcess = idx >= 0 && idx < processRoute.length - 1 ? processRoute[idx + 1] : null
  }

  // 1. Create repairing order
  await dbInsert('repairing_orders', {
    batch_id:       batchId,
    order_id:       orderId || null,
    repair_kg:      repairKg,
    repair_mtr:     repairMtr || null,
    repair_taka:    repairTaka || null,
    process_route:  processRoute,
    status:         'pending',
    notes:          reprocessReason,
    source_type:    sourceType,
    reprocess_type: reprocessType,
  })

  // 2a. Full reprocess → batch goes to repairing
  if (!isPartial || remainKg <= 0) {
    await dbUpdate('batches', { id: batchId }, {
      is_faulty:       false,
      status:          'repairing',
      current_process: null,
    })
  } else {
    // 2b. Partial → update batch kg to remaining, send to next process
    await dbUpdate('batches', { id: batchId }, {
      is_faulty:       false,
      kg:              remainKg,
      status:          nextProcess ? 'in-process' : 'done',
      current_process: nextProcess || null,
      sent_at:         new Date().toISOString(),
    })
  }

  return { repairKg, remainKg, nextProcess }
}
`

// ── Fix 1: /api/faulty route — update reprocess + add reprocess type ─────────
const faultyApiContent = `import { NextRequest, NextResponse } from 'next/server'
import { dbSelect, dbUpdate, dbInsert, sb, auditLog } from '@/lib/supabase'

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
        { id: \`in.(\${batchIds.join(',')})\`, limit: '2000' },
        'id,batch_id,kg,mtr,taka,sent_at,created_at,process_route,machines(id,name)'
      )
      for (const b of batches||[]) batchMap[b.id] = b
    }
    if (orderIds.length) {
      const { data: orders } = await dbSelect('orders',
        { id: \`in.(\${orderIds.join(',')})\`, limit: '2000' },
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

    // Create repairing order
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
      await dbUpdate('batches', { id: batch_id }, {
        is_faulty:false, kg:remainKg,
        status: nextProcess ? 'in-process' : 'done',
        current_process: nextProcess||null,
        sent_at: new Date().toISOString(),
      })
    }

    await auditLog({ action:'faulty_reprocess', entity_type:'faulty_record', entity_id:id, new_value:\`\${reprocess_type}:\${repairKg}kg\` })
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
    const { error } = await sb('/faulty_records', { method:'DELETE', params:{ id:\`eq.\${id}\` } })
    if (error) return NextResponse.json({ ok:false, error }, { status:500 })
    return NextResponse.json({ ok:true })
  }

  return NextResponse.json({ ok:false, error:'Unknown action' }, { status:400 })
}
`
fs.writeFileSync('app/api/faulty/route.ts', faultyApiContent, 'utf8')
console.log('✓ /api/faulty updated with full/partial reprocess')

// ── Fix 2: /api/fob route — add mark_sent, fob_approved, reprocess ────────────
const fobApiContent = `import { NextRequest, NextResponse } from 'next/server'
import { dbSelect, dbUpdate, dbInsert, sb, auditLog } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const type = searchParams.get('type')
    const query:Record<string,string> = { order:'created_at.desc', limit:'2000' }
    if (type && type !== 'all') query['fob_type'] = \`eq.\${type}\`

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
        { id:\`in.(\${batchIds.join(',')})\`, limit:'2000' },
        'id,batch_id,kg,mtr,taka,sent_at,created_at,process_route,machines(id,name)'
      )
      for (const b of batches||[]) batchMap[b.id] = b
    }
    if (orderIds.length) {
      const { data:orders } = await dbSelect('orders',
        { id:\`in.(\${orderIds.join(',')})\`, limit:'2000' },
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

    await dbInsert('repairing_orders', {
      batch_id, order_id: order_id||null,
      repair_kg: repairKg,
      repair_mtr:  isPartial ? (parseFloat(reprocess_mtr)||null) : null,
      repair_taka: isPartial ? (parseFloat(reprocess_taka)||null) : null,
      process_route: route, status:'pending',
      notes: reprocess_reason, source_type:'fob', reprocess_type,
    })

    if (!isPartial || remainKg <= 0) {
      await dbUpdate('batches', { id:batch_id }, {
        status:'repairing', current_process:null,
      })
    } else {
      await dbUpdate('batches', { id:batch_id }, {
        kg:remainKg,
        status: nextProcess ? 'in-process' : 'done',
        current_process: nextProcess||null,
        sent_at: new Date().toISOString(),
      })
    }

    await auditLog({ action:'fob_reprocess', entity_type:'fob_record', entity_id:id, new_value:\`\${reprocess_type}:\${repairKg}kg\` })
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
    const { error } = await sb('/fob_records', { method:'DELETE', params:{ id:\`eq.\${id}\` } })
    if (error) return NextResponse.json({ ok:false, error }, { status:500 })
    return NextResponse.json({ ok:true })
  }

  return NextResponse.json({ ok:false, error:'Unknown action' }, { status:400 })
}
`
fs.writeFileSync('app/api/fob/route.ts', fobApiContent, 'utf8')
console.log('✓ /api/fob updated with mark_sent, fob_approved, full/partial reprocess')
