import { NextRequest, NextResponse } from 'next/server'
import { dbSelect, dbInsert, dbUpdate, dbDelete, sb, auditLog } from '@/lib/supabase'

// GET /api/batches
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const uuid_id    = searchParams.get('id')
    const order_id   = searchParams.get('order_id')
    const machine_id = searchParams.get('machine_id')
    const batch_id   = searchParams.get('batch_id')
    const status     = searchParams.get('status')
    const limit      = searchParams.get('limit') || '5000'

    const query: Record<string, string> = { order: 'batch_number.asc', limit }
    if (uuid_id)    query['id']         = `eq.${uuid_id}`
    if (uuid_id)    query['id']         = `eq.${uuid_id}`
    if (uuid_id)    query['id']         = `eq.${uuid_id}`
    if (order_id)   query['order_id']   = `eq.${order_id}`
    if (machine_id) query['machine_id'] = `eq.${machine_id}`
    if (batch_id)   query['batch_id']   = `eq.${batch_id}`
    if (status)     query['status']     = `eq.${status}`

    const { data, error } = await dbSelect('batches', query,
      'id,batch_id,order_id,machine_id,batch_number,kg,mtr,taka,status,current_process,' +
      'is_done,is_faulty,planned_date,actual_date,notes,process_route,' +
      'date_calc_plan,dc_generated_once,dc_regenerate,' +
      'fms_enter_at,fms_actual_dates,sent_at,' +
      'created_at,updated_at,' +
      'machines(id,name,capacity),' +
      'batch_processes(id,process_code,status,sent_at,received_at,done_at)'
    )
    if (error) {
      console.error('[/api/batches GET] Supabase error:', error)
      return NextResponse.json({ ok: false, error }, { status: 500 })
    }
    return NextResponse.json({ ok: true, data })
  } catch (err: any) {
    console.error('[/api/batches GET] Unexpected error:', err)
    return NextResponse.json({ ok: false, error: err.message || 'Server error' }, { status: 500 })
  }
}

// POST /api/batches
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { action, _user, ...payload } = body

    if (action === 'create_splits') {
      const { order_id, batches, process_route } = payload
      if (!order_id || !batches?.length) {
        return NextResponse.json({ ok: false, error: 'order_id and batches required' }, { status: 400 })
      }

      await dbDelete('batches', { order_id })

      const rows = batches.map((b: any, idx: number) => ({
        batch_id:      b.batch_id,
        order_id,
        machine_id:    b.machine_id || null,
        batch_number:  idx + 1,
        kg:            b.kg,
        mtr:           b.mtr  || null,
        taka:          b.taka || null,
        status:        'pending',
        process_route: process_route || [],  // save route on batch so machine page shows correct process
      }))

      const { data: created, error } = await sb<any[]>('/batches', {
        method: 'POST', body: JSON.stringify(rows),
        headers: { 'Prefer': 'return=representation' },
      })
      if (error) return NextResponse.json({ ok: false, error }, { status: 500 })

      await dbUpdate('orders', { id: order_id }, { status: 'splitting' })

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
      const { error } = await dbUpdate('batches', { id }, { ...patch, updated_at: new Date().toISOString() })
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
      const { batch_id, order_id, faulty_type, faulty_kg, process_code, order_number, party, color } = payload
      const now = new Date().toISOString()

      // 1. Update batch: faulty status + clear current_process so it leaves FMS page
      await dbUpdate('batches', { id: batch_id }, {
        is_faulty:       true,
        status:          'faulty',
        current_process: null,
      })

      // 2. Set done_at on batch_processes using RPC (reliable composite key update)
      await sb('/rpc/mark_process_faulty', {
        method: 'POST',
        body: JSON.stringify({ p_batch_id: batch_id, p_process_code: process_code, p_done_at: now }),
      })

      // 3. Create faulty record with color
      const { data, error } = await dbInsert('faulty_records', {
        batch_id, order_id, order_number, party, color: color || null,
        faulty_type, faulty_kg, process_code,
        status: 'open',
      })
      if (error) return NextResponse.json({ ok: false, error }, { status: 500 })

      await auditLog({ username: _user, action: 'faulty_mark', entity_type: 'batch',
        entity_id: batch_id, new_value: faulty_type })
      return NextResponse.json({ ok: true, data })
    }

    // ── Delete one batch and restore qty to order ────────────────────────────
    if (action === 'delete_batch') {
      const { id, order_id } = payload
      if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })

      // Get the batch to know its kg before deleting
      const { data: batchRows } = await dbSelect('batches', { id: `eq.${id}`, limit: '1' }, 'id,kg,mtr,taka,status,is_done,batch_id,order_id')
      const batch = batchRows?.[0]
      if (!batch) return NextResponse.json({ ok: false, error: 'Batch not found' }, { status: 404 })

      // Safety check — cannot delete if in-process or done
      if (batch.is_done || batch.status === 'done' || batch.status === 'in-process') {
        return NextResponse.json({ ok: false, error: 'Cannot delete a batch that is in-process or done' }, { status: 400 })
      }

      // Delete batch_processes first, then the batch
      await sb('/batch_processes', {
        method: 'DELETE',
        params: { batch_id: `eq.${batch.id}` },
        headers: { 'Prefer': 'return=minimal' },
      })
      const { error: delError } = await dbDelete('batches', { id })
      if (delError) return NextResponse.json({ ok: false, error: delError }, { status: 500 })

      // Check if this order has any remaining batches
      const { data: remaining } = await dbSelect('batches', { order_id: `eq.${batch.order_id}`, limit: '1' }, 'id')
      if (!remaining?.length) {
        // No batches left — revert order status back to splitting so supervisor can re-split
        await dbUpdate('orders', { id: batch.order_id }, { status: 'splitting' })
      }

      await auditLog({ username: _user, action: 'delete_batch', entity_type: 'batch',
        entity_id: batch.batch_id, note: `Deleted ${batch.kg} Kg` })

      return NextResponse.json({ ok: true, restored_kg: batch.kg })
    }

    // ── Full split: entire order qty as one single batch ────────────────────
    if (action === 'full_split') {
      const { order_id, order_number, qty_kg, qty_mtr, no_of_taka, machine_id, process_route } = payload
      if (!order_id) return NextResponse.json({ ok: false, error: 'order_id required' }, { status: 400 })

      // Check if already has batches
      const { data: existing } = await dbSelect('batches', { order_id: `eq.${order_id}`, limit: '1' }, 'id,kg')
      if (existing?.length) {
        return NextResponse.json({ ok: false, error: 'Order already has batches. Use Split to add more.' }, { status: 400 })
      }

      const batch = {
        batch_id:     `${order_number}-B1`,
        order_id,
        machine_id:   machine_id || null,
        batch_number: 1,
        kg:           parseFloat(qty_kg)    || 0,
        mtr:          parseFloat(qty_mtr)   || null,
        taka:         parseInt(no_of_taka)  || null,
        status:       'pending',
        process_route: process_route || [],
      }

      const { data: created, error } = await sb<any[]>('/batches', {
        method: 'POST', body: JSON.stringify([batch]),
        headers: { 'Prefer': 'return=representation' },
      })
      if (error) return NextResponse.json({ ok: false, error }, { status: 500 })

      // Update order status to splitting
      await dbUpdate('orders', { id: order_id }, { status: 'splitting' })

      // Create batch_processes
      if (created?.length && process_route?.length) {
        const bpRows = process_route.map((code: string) => ({
          batch_id: created[0].id, process_code: code, status: 'pending'
        }))
        await sb('/batch_processes', {
          method: 'POST', body: JSON.stringify(bpRows),
          headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
        })
      }

      await auditLog({ username: _user, action: 'full_split', entity_type: 'order',
        entity_id: order_id, new_value: `1 batch · ${qty_kg}kg` })

      return NextResponse.json({ ok: true, data: created })
    }

    // ── Reset a process step so batch can be marked done again ─────────────
    if (action === 'reset_process') {
      const { batch_id, process_code } = payload
      if (!batch_id || !process_code) {
        return NextResponse.json({ ok: false, error: 'batch_id and process_code required' }, { status: 400 })
      }
      // Use Supabase RPC for reliable composite key update
      const { error } = await sb('/rpc/reset_batch_process', {
        method: 'POST',
        body: JSON.stringify({ p_batch_id: batch_id, p_process_code: process_code }),
      })
      if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 })
  } catch (err: any) {
    console.error('[/api/batches POST] Unexpected error:', err)
    return NextResponse.json({ ok: false, error: err.message || 'Server error' }, { status: 500 })
  }
}
