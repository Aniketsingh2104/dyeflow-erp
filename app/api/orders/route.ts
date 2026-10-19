import { NextRequest, NextResponse } from 'next/server'
import { dbSelect, dbInsert, dbUpdate, dbDelete, sb, auditLog } from '@/lib/supabase'
import { requireAdmin } from '@/lib/auth'
import { refreshOrderStatus } from '@/lib/orderStatus'
import { guard } from '@/lib/access'
import { createOrder, cleanOrderFields, ORDER_STATUSES } from '@/lib/orderCreate'
import { canonicalCode } from '@/lib/processCodes'
import { deriveMachineMap } from '@/lib/machineMap'
import { rpc, rpcFail } from '@/lib/rpc'

const sameJson = (a: any, b: any) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)


// GET /api/orders
export async function GET(req: NextRequest) {
  const g = await guard(req, 'orders', 'GET')
  if (g.deny) return g.deny
  const { searchParams } = new URL(req.url)
  const status       = searchParams.get('status')
  const supervisorId = searchParams.get('supervisor_id')
  const party        = searchParams.get('party')
  const orderId      = searchParams.get('id')
  const orderNumber  = searchParams.get('order_number')
  const limit        = searchParams.get('limit')   // none = all orders

  const query: Record<string, string> = { order: 'priority.asc,created_at.desc,id.asc' }
  if (limit) query.limit = limit
  if (status)       query['status']        = `eq.${status}`
  // active=1 → only orders not done yet
  else if (searchParams.get('active') === '1') query['status'] = 'neq.done'
  if (supervisorId) query['supervisor_id'] = `eq.${supervisorId}`
  if (party)        query['party']         = `ilike.*${party}*`
  if (orderId)      query['id']            = `eq.${orderId}`
  if (orderNumber)  query['order_number']  = `eq.${orderNumber}`

  const { data, error } = await dbSelect(
    'orders', query,
    'id,order_number,challan_no,party,article,color,shade_group,blend,' +
    'qty_kg,qty_mtr,no_of_taka,gsm,width,lab_no,lot_no,sub_party,sales_person,' +
    'type_of_finish,type_of_packing,delivery_date,' +
    'status,supervisor_id,machine_id,process_route,planned_dates,hold_reason,' +
    'hold_approval,remarks,priority,dyeing_fob,rolling_fob,' +
    'supervisor_confirmed,supervisor_confirmed_at,process_machines,' +
    'lab_recheck,lab_recheck_at,lab_receive,lab_receive_at,greige_check,greige_check_at,greige_recheck_fail_reason,' +
    'created_at,updated_at,supervisors(id,name),machines(id,name,capacity)'
  )
  if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
  return NextResponse.json({ ok: true, data })
}

// POST /api/orders — who may do what: lib/access.ts (POLICY.orders)
export async function POST(req: NextRequest) {
  const body = await req.json()
  // The browser's "_user" label is ignored: the audit log always records the
  // signed-in user (lib/supabase.ts auditLog).
  const { action, _user: _ignored, ...payload } = body
  const _user = undefined
  const g = await guard(req, 'orders', action)
  if (g.deny) return g.deny

  if (action === 'create') {
    const { data, error } = await createOrder(payload)
    if (error) return NextResponse.json({ ok: false, error }, { status: error.includes('required') || error.startsWith('Unknown') ? 400 : 500 })
    return NextResponse.json({ ok: true, data })
  }

  if (action === 'update') {
    const { id } = payload
    if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })
    // Only known order columns are written (order number, ids, dates … are never taken from the browser)
    const patch: Record<string, any> = cleanOrderFields(payload)
    if (patch.status !== undefined && !ORDER_STATUSES.includes(patch.status)) {
      return NextResponse.json({ ok: false, error: `Unknown status "${patch.status}"` }, { status: 400 })
    }
    if (!Object.keys(patch).length) return NextResponse.json({ ok: false, error: 'Nothing to update' }, { status: 400 })
    const { data: cur } = await dbSelect('orders', { id: `eq.${id}`, limit: '1' },
      'id,status,supervisor_id,hold_approval,process_route,process_machines')
    const before = cur?.[0]
    if (!before) return NextResponse.json({ ok: false, error: 'Order not found' }, { status: 404 })

    // Route / machines changed after the order was split: allowed only while
    // none of its batches has started — then the batches follow the new route
    // (df_change_route, all-or-nothing). Once one has started it is locked.
    // An empty route and "no route" count as the same.
    const routeOf = (r: any): string[] => Array.isArray(r) ? r.map((c: string) => canonicalCode(c)).filter(Boolean) : []
    const machinesOf = (m: any) => (m && typeof m === 'object' && Object.keys(m).length ? m : null)
    const newRoute = 'process_route' in patch ? routeOf(patch.process_route) : routeOf(before.process_route)
    const newMachines = 'process_machines' in patch ? machinesOf(patch.process_machines) : machinesOf(before.process_machines)
    const routeChanged = !sameJson(newRoute, routeOf(before.process_route))
    const machinesChanged = !sameJson(newMachines, machinesOf(before.process_machines))
    delete patch.process_route; delete patch.process_machines
    if (routeChanged || machinesChanged) {
      const { data: bs, error: bErr } = await dbSelect('batches', { order_id: `eq.${id}` }, 'id,machine_id')
      if (bErr) return NextResponse.json({ ok: false, error: bErr }, { status: 500 })
      if (bs?.length) {
        const maps: Record<string, any> = {}
        for (const b of bs) maps[b.id] = deriveMachineMap(newRoute, newMachines, b.machine_id || null)
        const r = await rpc<any>('df_change_route', { p_order: id, p_route: newRoute, p_machines: newMachines, p_maps: maps })
        if (r.error) return rpcFail(r)
      } else {
        patch.process_route = newRoute
        patch.process_machines = newMachines
      }
    }

    // Hold: only "Hold" taken off in the edit form (or Update Status) releases it
    const releasing = before.status === 'hold' && before.hold_approval === 'Hold'
      && 'hold_approval' in patch && patch.hold_approval !== 'Hold'
    if (patch.hold_approval === 'Hold') {
      patch.status = 'hold'
    } else if (releasing) {
      patch.status = (patch.supervisor_id ?? before.supervisor_id) ? 'assigned' : 'new'
      patch.hold_reason = null
    } else if (before.status === 'hold' && patch.status !== undefined && patch.status !== 'hold') {
      patch.status = 'hold'   // anything else keeps a held order on hold
    }
    if (Object.keys(patch).length) {
      const { error } = await dbUpdate('orders', { id }, patch)
      if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    }

    await auditLog({ username: _user, action: 'edit', entity_type: 'order', entity_id: id,
      ...(before && patch.status && patch.status !== before.status ? { field: 'status', old_value: before.status, new_value: patch.status } : {}) })
    // The form may hold an old status (batches moved since it opened) — work it out again
    await refreshOrderStatus(id)
    return NextResponse.json({ ok: true })
  }

  if (action === 'update_planned_dates') {
    const { updates } = payload
    if (!updates?.length) return NextResponse.json({ ok: false, error: 'updates array required' }, { status: 400 })
    const errors: string[] = []
    for (const { id, planned_dates } of updates) {
      const { error } = await dbUpdate('orders', { id }, { planned_dates, updated_at: new Date().toISOString() })
      if (error) errors.push(`${id}: ${error}`)
    }
    if (errors.length) return NextResponse.json({ ok: false, error: errors.join('; ') }, { status: 500 })
    await auditLog({ username: _user, action: 'edit', entity_type: 'order',
      note: `Planned dates updated for ${updates.length} orders` })
    return NextResponse.json({ ok: true, updated: updates.length })
  }

  if (action === 'delete') {
    // Delete — admin only (checked on the server — lib/auth.ts)
    { const deny = await requireAdmin(req); if (deny) return deny }
    const { id } = payload
    if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })
    // one database step (df_delete_order): refused once any batch has started
    // or has faulty / FOB / repair records; waiting batches go with the order
    const r = await rpc<any>('df_delete_order', { p_order: id })
    if (r.error) return rpcFail(r)
    return NextResponse.json({ ok: true, batches: r.data?.batches ?? 0 })
  }

  if (action === 'assign_supervisor') {
    const { id, supervisor_id } = payload
    if (!id || !supervisor_id) return NextResponse.json({ ok: false, error: 'id and supervisor_id required' }, { status: 400 })
    // Only a NEW order becomes 'assigned' — a held / split / running order keeps its status
    const { data: cur } = await dbSelect('orders', { id: `eq.${id}`, limit: '1' }, 'status')
    const st = cur?.[0]?.status
    const { error } = await dbUpdate('orders', { id }, { supervisor_id, ...(!st || st === 'new' || st === 'assigned' ? { status: 'assigned' } : {}) })
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    await auditLog({ username: _user, action: 'assign', entity_type: 'order',
      entity_id: id, field: 'supervisor_id', new_value: supervisor_id })
    return NextResponse.json({ ok: true })
  }

  if (action === 'update_status') {
    const { id, status, hold_reason } = payload
    if (!id || !status) return NextResponse.json({ ok: false, error: 'id and status required' }, { status: 400 })
    if (!ORDER_STATUSES.includes(status)) return NextResponse.json({ ok: false, error: `Unknown status "${status}"` }, { status: 400 })
    const patch: Record<string, any> = { status }
    if (hold_reason !== undefined) patch.hold_reason = hold_reason
    if (status === 'hold') patch.hold_approval = 'Hold'
    const { data: cur } = await dbSelect('orders', { id: `eq.${id}`, limit: '1' }, 'id,status,hold_approval')
    const wasHold = cur?.[0]?.status === 'hold'
    if (wasHold && status !== 'hold') {
      // Releasing a hold clears the hold mark and remark too
      if (cur?.[0]?.hold_approval === 'Hold') patch.hold_approval = null
      if (hold_reason === undefined) patch.hold_reason = null
    }
    const { error } = await dbUpdate('orders', { id }, patch)
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    await auditLog({ username: _user, action: 'status_change', entity_type: 'order',
      entity_id: id, old_value: cur?.[0]?.status, new_value: status })
    // After a release the order goes straight to where its batches really are
    if (wasHold && status !== 'hold') await refreshOrderStatus(id)
    return NextResponse.json({ ok: true })
  }

  if (action === 'bulk_update') {
    const { ids } = payload
    const patch: Record<string, any> = cleanOrderFields(payload.patch || {})
    // A route change must go through 'update' (it checks the batches)
    delete patch.process_route; delete patch.process_machines
    if (patch.status !== undefined && !ORDER_STATUSES.includes(patch.status)) {
      return NextResponse.json({ ok: false, error: `Unknown status "${patch.status}"` }, { status: 400 })
    }
    if (!Object.keys(patch).length) return NextResponse.json({ ok: false, error: 'Nothing to update' }, { status: 400 })
    if (!ids?.length) return NextResponse.json({ ok: false, error: 'ids required' }, { status: 400 })
    const errors: string[] = []
    if (patch?.status === 'hold') patch.hold_approval = 'Hold'
    for (const id of ids) {
      const p: Record<string, any> = { ...patch }
      if (patch?.status && patch.status !== 'hold') {
        // Moving an order OFF hold also clears its hold mark
        const { data: cur } = await dbSelect('orders', { id: `eq.${id}`, limit: '1' }, 'status,hold_approval')
        if (cur?.[0]?.status === 'hold' && cur?.[0]?.hold_approval === 'Hold') p.hold_approval = null
      }
      const { error } = await dbUpdate('orders', { id }, p)
      if (error) errors.push(error)
    }
    if (errors.length) return NextResponse.json({ ok: false, error: errors.join(', ') }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 })
}
