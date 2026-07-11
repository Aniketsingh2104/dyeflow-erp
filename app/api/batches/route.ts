import { NextRequest, NextResponse } from 'next/server'
import { dbSelect, dbInsert, dbUpdate, dbDelete, sb, auditLog } from '@/lib/supabase'

// GET /api/batches
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const order_id   = searchParams.get('order_id')
  const machine_id = searchParams.get('machine_id')
  const batch_id   = searchParams.get('batch_id')
  const status     = searchParams.get('status')

  const query: Record<string, string> = { order: 'batch_number.asc' }
  if (order_id)   query['order_id']   = `eq.${order_id}`
  if (machine_id) query['machine_id'] = `eq.${machine_id}`
  if (batch_id)   query['batch_id']   = `eq.${batch_id}`
  if (status)     query['status']     = `eq.${status}`

  const { data, error } = await dbSelect('batches', query,
    'id,batch_id,order_id,machine_id,batch_number,kg,status,current_process,' +
    'is_done,is_faulty,planned_date,actual_date,notes,created_at,updated_at,' +
    'machines(id,name,capacity),' +
    'batch_processes(id,process_code,status,sent_at,received_at,done_at)'
  )
  if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
  return NextResponse.json({ ok: true, data })
}

// POST /api/batches
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { action, _user, ...payload } = body

  if (action === 'create_splits') {
    const { order_id, batches, process_route } = payload
    if (!order_id || !batches?.length) {
      return NextResponse.json({ ok: false, error: 'order_id and batches required' }, { status: 400 })
    }

    // Delete existing batches
    await dbDelete('batches', { order_id })

    // Insert new batches
    const rows = batches.map((b: any, idx: number) => ({
      batch_id:     b.batch_id,
      order_id,
      machine_id:   b.machine_id || null,
      batch_number: idx + 1,
      kg:           b.kg,
      status:       'pending',
    }))

    const { data: created, error } = await sb<any[]>('/batches', {
      method: 'POST', body: JSON.stringify(rows),
      headers: { 'Prefer': 'return=representation' },
    })
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })

    // Update order status
    await dbUpdate('orders', { id: order_id }, { status: 'splitting' })

    // Auto-create batch_processes rows
    if (created?.length && process_route?.length) {
      const bpRows: any[] = []
      for (const batch of created) {
        for (const code of process_route) {
          bpRows.push({ batch_id: batch.id, process_code: code, status: 'pending' })
        }
      }
      await sb('/batch_processes', {
        method: 'POST', body: JSON.stringify(bpRows),
        headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
      })
    }

    await auditLog({ username: _user, action: 'split', entity_type: 'order',
      entity_id: order_id, new_value: `${batches.length} batches` })

    return NextResponse.json({ ok: true, data: created })
  }

  if (action === 'update') {
    const { id, ...patch } = payload
    if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })
    const { error } = await dbUpdate('batches', { id }, patch)
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (action === 'process_done') {
    const { batch_id, process_code, next_process } = payload
    if (!batch_id || !process_code) {
      return NextResponse.json({ ok: false, error: 'batch_id and process_code required' }, { status: 400 })
    }
    await sb('/batch_processes', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'done', done_at: new Date().toISOString() }),
      params: { batch_id: `eq.${batch_id}`, process_code: `eq.${process_code}` },
      headers: { 'Prefer': 'return=minimal' },
    })
    const batchPatch: Record<string, any> = { current_process: next_process || null }
    if (!next_process) { batchPatch.is_done = true; batchPatch.status = 'done' }
    await dbUpdate('batches', { id: batch_id }, batchPatch)
    await auditLog({ username: _user, action: 'process_done', entity_type: 'batch',
      entity_id: batch_id, old_value: process_code, new_value: next_process || 'completed' })
    return NextResponse.json({ ok: true })
  }

  if (action === 'mark_faulty') {
    const { batch_id, order_id, faulty_type, faulty_kg, process_code, order_number, party } = payload
    await dbUpdate('batches', { id: batch_id }, { is_faulty: true, status: 'faulty' })
    const { data, error } = await dbInsert('faulty_records', {
      batch_id, order_id, order_number, party,
      faulty_type, faulty_kg, process_code, status: 'open',
    })
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    await auditLog({ username: _user, action: 'faulty_mark', entity_type: 'batch',
      entity_id: batch_id, new_value: faulty_type })
    return NextResponse.json({ ok: true, data })
  }

  return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 })
}
