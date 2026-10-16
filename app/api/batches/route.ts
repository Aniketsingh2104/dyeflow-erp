import { NextRequest, NextResponse } from 'next/server'
import { dbSelect, dbInsert, dbUpdate, dbDelete, sb, auditLog } from '@/lib/supabase'
import { requireAdmin } from '@/lib/auth'
import { canonicalCode } from '@/lib/processCodes'
import { deriveMachineMap, primaryMachine } from '@/lib/machineMap'
import { refreshOrderStatus, refreshOrderStatusForBatch } from '@/lib/orderStatus'

// GET /api/batches
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const uuid_id    = searchParams.get('id')
    const order_id   = searchParams.get('order_id')
    const machine_id = searchParams.get('machine_id')
    const batch_id   = searchParams.get('batch_id')
    const status     = searchParams.get('status')
    const limit      = searchParams.get('limit')   // none = all batches

    const query: Record<string, string> = { order: 'batch_number.asc,id.asc' }
    if (limit) query.limit = limit
    if (uuid_id)    query['id']         = `eq.${uuid_id}`
    if (order_id)   query['order_id']   = `eq.${order_id}`
    if (machine_id) query['machine_id'] = `eq.${machine_id}`
    if (batch_id)   query['batch_id']   = `eq.${batch_id}`
    if (status)     query['status']     = `eq.${status}`

    const { data, error } = await dbSelect('batches', query,
      'id,batch_id,order_id,machine_id,batch_number,kg,mtr,taka,status,current_process,last_process,' +
      'is_done,is_faulty,planned_date,actual_date,notes,process_route,' +
      'date_calc_plan,dc_generated_once,dc_regenerate,process_machine_map,supervisor_id,' +
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

// ── Split helpers ────────────────────────────────────────────────────────────
// Splitting is ADDITIVE: existing batches of an order are never deleted here.
// Batch IDs are generated on the server so they always continue from the
// highest number the order already has (B1, B2 … even after deletes).
async function getSplitContext(order_id: string) {
  const { data: orderRows, error: orderErr } = await dbSelect('orders',
    { id: `eq.${order_id}`, limit: '1' }, 'id,order_number,qty_kg,qty_mtr,no_of_taka,process_machines,process_route')
  const order = orderRows?.[0]
  if (orderErr || !order) {
    return { order: null, nextNo: 0, allocatedKg: 0, error: orderErr || 'Order not found' }
  }
  if (!order.order_number) {
    return { order, nextNo: 0, allocatedKg: 0, error: 'This order has no order number — set one before splitting.' }
  }

  const { data: existing } = await dbSelect('batches',
    { order_id: `eq.${order_id}` }, 'id,batch_id,batch_number,kg')
  let maxNo = 0
  let allocatedKg = 0
  for (const b of existing || []) {
    allocatedKg += parseFloat(b.kg) || 0
    if (b.batch_number) maxNo = Math.max(maxNo, Number(b.batch_number) || 0)
    // Only plain "-B<n>" ids count here (repair ids like -B2-R / -B2-R-S1 don't)
    const m = String(b.batch_id || '').match(/-B(\d+)$/)
    if (m) maxNo = Math.max(maxNo, parseInt(m[1], 10))
  }
  return { order, nextNo: maxNo + 1, allocatedKg, error: null as string | null }
}

async function insertBatchProcesses(created: any[] | null | undefined, process_route: string[] | undefined) {
  if (!created?.length || !process_route?.length) return
  const bpRows: any[] = []
  for (const batch of created) {
    for (const code of process_route) {
      bpRows.push({ batch_id: batch.id, process_code: code, status: 'pending' })
    }
  }
  await sb('/batch_processes?on_conflict=batch_id,process_code', {
    method: 'POST', body: JSON.stringify(bpRows),
    headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
  })
}

// POST /api/batches
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { action, _user, ...payload } = body
    // One standard spelling for process codes (e.g. 'ADD' → 'Add', 'QA' → 'Qa')
    if (payload.process_code) payload.process_code = canonicalCode(payload.process_code)
    if (payload.next_process) payload.next_process = canonicalCode(payload.next_process)

    // ── Split: ADD new batches to an order (never deletes existing ones) ─────
    if (action === 'create_splits') {
      const { order_id, batches, process_route } = payload
      if (!order_id || !batches?.length) {
        return NextResponse.json({ ok: false, error: 'order_id and batches required' }, { status: 400 })
      }

      const ctx = await getSplitContext(order_id)
      if (ctx.error || !ctx.order) return NextResponse.json({ ok: false, error: ctx.error }, { status: 400 })

      const parts = batches.filter((b: any) => (parseFloat(b.kg) || 0) > 0)
      if (!parts.length) {
        return NextResponse.json({ ok: false, error: 'Every batch needs a quantity above 0 Kg' }, { status: 400 })
      }

      // Client-sent batch_id is ignored — the server numbers new batches
      // after the highest existing one so IDs never collide or restart.
      const route: string[] = process_route || ctx.order.process_route || []
      const rows = parts.map((b: any, idx: number) => {
        // Which machine runs each process of this batch (lib/machineMap.ts)
        const map = deriveMachineMap(route, ctx.order.process_machines, b.machine_id || null, b.process_machine_map)
        return {
        batch_id:      `${ctx.order.order_number}-B${ctx.nextNo + idx}`,
        order_id,
        machine_id:    b.machine_id || primaryMachine(route, map) || null,
        process_machine_map: map,
        batch_number:  ctx.nextNo + idx,
        kg:            parseFloat(b.kg) || 0,
        mtr:           parseFloat(b.mtr)  || null,
        taka:          parseInt(b.taka)   || null,
        status:        'pending',
        process_route: process_route || [],  // save route on batch so machine page shows correct process
      }})

      const { data: created, error } = await sb<any[]>('/batches', {
        method: 'POST', body: JSON.stringify(rows),
        headers: { 'Prefer': 'return=representation' },
      })
      if (error) return NextResponse.json({ ok: false, error }, { status: 500 })

      await dbUpdate('orders', { id: order_id }, { status: 'splitting' })
      await insertBatchProcesses(created, process_route)

      await auditLog({ username: _user, action: 'split', entity_type: 'order',
        entity_id: order_id,
        new_value: `${rows.length} batch(es) added: ${rows.map((r: any) => r.batch_id).join(', ')}` })

      await refreshOrderStatus(order_id)   // keep orders.status in step (lib/orderStatus.ts)
      return NextResponse.json({ ok: true, data: created })
    }

    if (action === 'update') {
      const { id, ...patch } = payload
      if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })
      const { error } = await dbUpdate('batches', { id }, { ...patch, updated_at: new Date().toISOString() })
      if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
      await refreshOrderStatusForBatch(id)   // keep orders.status in step (lib/orderStatus.ts)
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
      await refreshOrderStatusForBatch(batch_id)   // keep orders.status in step (lib/orderStatus.ts)
      return NextResponse.json({ ok: true })
    }

    if (action === 'mark_faulty') {
      const { batch_id, order_id, faulty_type, faulty_kg, process_code, order_number, party, color } = payload
      const now = new Date().toISOString()

      // 1. Update batch: faulty status + save last_process so FMS page keeps showing it
      await dbUpdate('batches', { id: batch_id }, {
        is_faulty:       true,
        status:          'faulty',
        current_process: null,
        last_process:    process_code,  // remember where it was faulty'd for FMS display
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
      await refreshOrderStatusForBatch(batch_id)   // keep orders.status in step (lib/orderStatus.ts)
      return NextResponse.json({ ok: true, data })
    }

    // ── Delete one batch and restore qty to order ────────────────────────────
    if (action === 'delete_batch') {
      // Delete — admin only (checked on the server — lib/auth.ts)
      { const deny = await requireAdmin(req); if (deny) return deny }
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

      await refreshOrderStatus(batch.order_id)   // keep orders.status in step (lib/orderStatus.ts)
      return NextResponse.json({ ok: true, restored_kg: batch.kg })
    }

    // ── Full split: everything still unsplit becomes ONE new batch ──────────
    // No batches yet  → one batch with the full order qty (B1).
    // Some batches    → one batch with the remaining qty (B<next>), with
    //                   mtr/taka in proportion. Existing batches are untouched.
    if (action === 'full_split') {
      const { order_id, machine_id, process_route } = payload
      if (!order_id) return NextResponse.json({ ok: false, error: 'order_id required' }, { status: 400 })

      const ctx = await getSplitContext(order_id)
      if (ctx.error || !ctx.order) return NextResponse.json({ ok: false, error: ctx.error }, { status: 400 })

      const totalKg   = parseFloat(ctx.order.qty_kg)     || 0
      const totalMtr  = parseFloat(ctx.order.qty_mtr)    || 0
      const totalTaka = parseInt(ctx.order.no_of_taka)   || 0
      const remainKg  = Math.round((totalKg - ctx.allocatedKg) * 100) / 100
      if (remainKg < 0.5) {
        return NextResponse.json({ ok: false, error: 'Order is already fully split — nothing left to split.' }, { status: 400 })
      }
      const ratio = totalKg > 0 ? remainKg / totalKg : 1
      const isFirst = ctx.allocatedKg <= 0

      const fsRoute: string[] = process_route || ctx.order.process_route || []
      const fsMap = deriveMachineMap(fsRoute, ctx.order.process_machines, machine_id || null)
      const batch = {
        batch_id:     `${ctx.order.order_number}-B${ctx.nextNo}`,
        order_id,
        machine_id:   machine_id || primaryMachine(fsRoute, fsMap) || null,
        process_machine_map: fsMap,
        batch_number: ctx.nextNo,
        kg:           remainKg,
        mtr:          totalMtr  ? (isFirst ? totalMtr  : Math.round(totalMtr  * ratio)) : null,
        taka:         totalTaka ? (isFirst ? totalTaka : Math.round(totalTaka * ratio)) : null,
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
      await insertBatchProcesses(created, process_route)

      await auditLog({ username: _user, action: 'full_split', entity_type: 'order',
        entity_id: order_id, new_value: `${batch.batch_id} · ${remainKg}kg` })

      await refreshOrderStatus(order_id)   // keep orders.status in step (lib/orderStatus.ts)
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
      await refreshOrderStatusForBatch(batch_id)   // keep orders.status in step (lib/orderStatus.ts)
      return NextResponse.json({ ok: true })
    }

    // ── Create single batch (for repair splits) ──────────────────────────────
    if (action === 'create') {
      const { batch_id, order_id, kg, mtr, taka, machine_id, process_route, status } = payload
      if (!order_id) return NextResponse.json({ ok: false, error: 'order_id required' }, { status: 400 })
      const { data, error } = await dbInsert('batches', {
        batch_id:      batch_id   || null,
        order_id:      order_id,
        kg:            kg         || 0,
        mtr:           mtr        || 0,
        taka:          taka       || 0,
        machine_id:    machine_id || null,
        process_route: process_route || [],
        status:        status     || 'pending',
        is_faulty:     false,
        is_done:       false,
      })
      if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
      await refreshOrderStatus(order_id)   // keep orders.status in step (lib/orderStatus.ts)
      return NextResponse.json({ ok: true, data })
    }

    return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 })
  } catch (err: any) {
    console.error('[/api/batches POST] Unexpected error:', err)
    return NextResponse.json({ ok: false, error: err.message || 'Server error' }, { status: 500 })
  }
}
