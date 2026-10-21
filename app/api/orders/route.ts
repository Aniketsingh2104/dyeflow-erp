import { NextRequest, NextResponse } from 'next/server'
import { dbSelect, dbSelectAll, dbInsert, dbUpdate, dbDelete, sb, auditLog } from '@/lib/supabase'
import { requireAdmin } from '@/lib/auth'
import { refreshOrderStatus } from '@/lib/orderStatus'
import { guard } from '@/lib/access'
import { createOrder, cleanOrderFields, ORDER_STATUSES } from '@/lib/orderCreate'
import { canonicalCode } from '@/lib/processCodes'
import { deriveMachineMap } from '@/lib/machineMap'
import { rpc, rpcFail } from '@/lib/rpc'
import { ensureTail } from '@/lib/routeTail'

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

  // fields=lab_nos → just id + lab_no (Lab Recipe page suggestion list)
  if (searchParams.get('fields') === 'lab_nos') {
    const { data, error } = await dbSelect('orders', { ...query, lab_no: 'not.is.null' }, 'id,lab_no')
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    return NextResponse.json({ ok: true, data })
  }

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
    // a route always ends (Qa →) Packing → Dispatch — lib/routeTail.ts
    const newRoute = 'process_route' in patch ? ensureTail(routeOf(patch.process_route)) : routeOf(before.process_route)
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

    // Status is never typed in by hand: only Hold / Release Hold. Everything
    // else follows the batches (refreshOrderStatus below) — new ⇄ assigned
    // follows the supervisor while nothing is split yet.
    // (one exception: the supervisor confirming the route moves a new /
    // assigned order on to 'splitting' — Route Assignment)
    const confirmingRoute = patch.status === 'splitting' && patch.supervisor_confirmed === true
      && ['new', 'assigned'].includes(before.status)
    if (patch.status !== undefined && patch.status !== 'hold' && !confirmingRoute) delete patch.status
    if (patch.status === 'hold' && patch.hold_approval === undefined) patch.hold_approval = 'Hold'
    if ('supervisor_id' in patch && ['new', 'assigned'].includes(before.status) && !confirmingRoute) {
      patch.status = patch.supervisor_id ? 'assigned' : 'new'
    }
    // Hold: only "Hold" taken off in the edit form (or Release Hold) releases it
    const releasing = before.status === 'hold' && before.hold_approval === 'Hold'
      && 'hold_approval' in patch && patch.hold_approval !== 'Hold'
    if (patch.hold_approval === 'Hold') {
      patch.status = 'hold'
    } else if (releasing) {
      patch.status = (patch.supervisor_id ?? before.supervisor_id) ? 'assigned' : 'new'
      patch.hold_reason = null
    } else if (before.status === 'hold' && patch.status !== undefined) {
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

  // ── Priority drag (Orders page) ─────────────────────────────────────────
  // ids = the visible orders in their NEW order. They swap places among the
  // slots they already hold in the full list, so orders hidden by a filter
  // keep their place; then every order gets a clean 1…n and only rows whose
  // number really changed are written (one small PATCH each, no audit per row).
  if (action === 'reorder') {
    const ids: string[] = Array.isArray(payload.ids) ? [...new Set<string>(payload.ids.filter((x: any) => typeof x === 'string'))] : []
    if (!ids.length) return NextResponse.json({ ok: false, error: 'ids required' }, { status: 400 })
    // only orders still running are numbered (a done order's place doesn't matter)
    const { data: all, error } = await dbSelectAll<any>('orders', { status: 'neq.done', order: 'priority.asc,created_at.desc,id.asc' }, 'id,priority')
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    const known = new Set(all.map(o => o.id))
    const wanted = ids.filter(id => known.has(id))
    const moving = new Set(wanted)
    const slots: number[] = []
    all.forEach((o, i) => { if (moving.has(o.id)) slots.push(i) })
    const next = all.map(o => o.id)
    slots.forEach((slot, k) => { next[slot] = wanted[k] })
    const prio: Record<string, number> = Object.fromEntries(all.map(o => [o.id, o.priority]))
    const changes = next.map((id, i) => ({ id, p: i + 1 })).filter(c => prio[c.id] !== c.p)
    const errors: string[] = []
    for (let i = 0; i < changes.length; i += 10) {
      await Promise.all(changes.slice(i, i + 10).map(async c => {
        const { error: e } = await dbUpdate('orders', { id: c.id }, { priority: c.p })
        if (e) errors.push(e)
      }))
    }
    if (errors.length) return NextResponse.json({ ok: false, error: `${errors.length} order(s) not saved: ${errors[0]}` }, { status: 500 })
    await auditLog({ username: _user, action: 'edit', entity_type: 'order', field: 'priority',
      note: `Priority order changed (${changes.length} order number(s) updated)` })
    return NextResponse.json({ ok: true, changed: changes.length })
  }

  if (action === 'update_planned_dates') {
    const { updates } = payload
    if (!updates?.length) return NextResponse.json({ ok: false, error: 'updates array required' }, { status: 400 })
    if (!Array.isArray(updates) || updates.length > 5000) return NextResponse.json({ ok: false, error: 'updates must be a list (max 5000)' }, { status: 400 })
    // 10 at a time (was one after another — slow for hundreds of orders)
    const errors: string[] = []
    const now = new Date().toISOString()
    for (let i = 0; i < updates.length; i += 10) {
      await Promise.all(updates.slice(i, i + 10).map(async ({ id, planned_dates }: any) => {
        if (!id || !planned_dates || typeof planned_dates !== 'object' || Array.isArray(planned_dates)) { errors.push(`${id}: bad row`); return }
        const { error } = await dbUpdate('orders', { id }, { planned_dates, updated_at: now })
        if (error) errors.push(`${id}: ${error}`)
      }))
    }
    if (errors.length) return NextResponse.json({ ok: false, error: `${errors.length} of ${updates.length} not saved — ${errors.slice(0, 3).join('; ')}` }, { status: 500 })
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
    // By hand only Hold and Release Hold — every other status follows the
    // batches. status: 'hold' | 'release' (any other value on a held order is
    // read as a release, for older callers).
    const { id, status, hold_reason } = payload
    if (!id || !status) return NextResponse.json({ ok: false, error: 'id and status required' }, { status: 400 })
    const { data: cur } = await dbSelect('orders', { id: `eq.${id}`, limit: '1' }, 'id,status,hold_approval,supervisor_id')
    const before = cur?.[0]
    if (!before) return NextResponse.json({ ok: false, error: 'Order not found' }, { status: 404 })
    const wasHold = before.status === 'hold'
    let patch: Record<string, any>
    if (status === 'hold') {
      patch = { status: 'hold', hold_approval: 'Hold', ...(hold_reason !== undefined ? { hold_reason } : {}) }
    } else if (wasHold) {
      patch = { status: before.supervisor_id ? 'assigned' : 'new', hold_reason: hold_reason ?? null,
                ...(before.hold_approval === 'Hold' ? { hold_approval: null } : {}) }
    } else {
      return NextResponse.json({ ok: false, error: 'Only "Hold" and "Release Hold" can be set by hand — the other statuses follow the batches.' }, { status: 400 })
    }
    const { error } = await dbUpdate('orders', { id }, patch)
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    await auditLog({ username: _user, action: 'status_change', entity_type: 'order',
      entity_id: id, old_value: before.status, new_value: patch.status })
    // After a release the order goes straight to where its batches really are
    if (wasHold && patch.status !== 'hold') await refreshOrderStatus(id)
    return NextResponse.json({ ok: true })
  }

  if (action === 'bulk_update') {
    const { ids } = payload
    const patch: Record<string, any> = cleanOrderFields(payload.patch || {})
    // A route change must go through 'update' (it checks the batches)
    delete patch.process_route; delete patch.process_machines
    // by hand only Hold (Release Hold goes through update_status, one by one)
    if (patch.status !== undefined && patch.status !== 'hold') {
      return NextResponse.json({ ok: false, error: 'Only "Hold" can be set here — the other statuses follow the batches.' }, { status: 400 })
    }
    // a supervisor goes through assign_supervisor (it keeps each order's status right)
    delete patch.supervisor_id
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
