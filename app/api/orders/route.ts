import { NextRequest, NextResponse } from 'next/server'
import { dbSelect, dbInsert, dbUpdate, dbDelete, sb, auditLog } from '@/lib/supabase'
import { requireAdmin } from '@/lib/auth'
import { refreshOrderStatus } from '@/lib/orderStatus'

// GET /api/orders
export async function GET(req: NextRequest) {
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

// ── Auto-assign supervisor from article_supervisor_map ──────────────────────
// article_supervisor_map.supervisor stores the NAME; we resolve to UUID here
async function lookupSupervisor(article: string): Promise<string | null> {
  if (!article) return null
  try {
    const { data: mapRows } = await dbSelect(
      'article_supervisor_map',
      { article: `eq.${article}`, limit: '1' },
      'supervisor'
    )
    const supervisorName = mapRows?.[0]?.supervisor
    if (!supervisorName) return null

    const { data: supRows } = await dbSelect(
      'supervisors',
      { name: `eq.${supervisorName}`, limit: '1' },
      'id'
    )
    return supRows?.[0]?.id || null
  } catch {
    return null
  }
}

// POST /api/orders
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { action, _user, ...payload } = body

  if (action === 'create') {
    // Auto-assign supervisor if not already provided
    let supervisorId: string | null = payload.supervisor_id || null
    if (!supervisorId && payload.article) {
      supervisorId = await lookupSupervisor(payload.article)
    }

    // Order number always comes from the database counter (one format,
    // DYE<yy>-<0001>, never duplicated even when two people save at once).
    // Any number sent by the browser is ignored.
    const { data: nextNo, error: noErr } = await sb<string>('/rpc/next_order_number', {
      method: 'POST', body: '{}',
    })
    if (noErr || !nextNo) {
      return NextResponse.json({ ok: false, error: 'Could not get the next order number: ' + (noErr || 'empty') }, { status: 500 })
    }

    const insertPayload = {
      ...payload,
      order_number: nextNo,
      supervisor_id: supervisorId || null,
      // Hold always wins; otherwise 'assigned' if a supervisor was found, else 'new'
      status: payload.status === 'hold' || payload.hold_approval === 'Hold' ? 'hold'
            : supervisorId ? 'assigned' : (payload.status || 'new'),
    }

    const { data, error } = await dbInsert('orders', insertPayload)
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })

    if (payload.process_route?.length && data?.id) {
      const rows = payload.process_route.map((code: string) => ({
        order_id: data.id, process_code: code,
      }))
      await sb('/planned_dates?on_conflict=order_id,process_code', {
        method: 'POST', body: JSON.stringify(rows),
        headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
      })
    }

    await auditLog({
      username: _user, action: 'create', entity_type: 'order',
      entity_id: data?.order_number,
      new_value: `${payload.party} · ${payload.article} · ${payload.qty_kg}kg · supervisor: ${supervisorId || 'none'}`,
    })

    return NextResponse.json({ ok: true, data })
  }

  if (action === 'update') {
    const { id, ...patch } = payload
    if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })
    // Never write fields that are worked out elsewhere / can't be edited
    delete patch.order_number; delete patch.created_at; delete patch.updated_at
    const { data: cur } = await dbSelect('orders', { id: `eq.${id}`, limit: '1' }, 'id,status,supervisor_id,hold_approval')
    const before = cur?.[0]
    if (patch.hold_approval === 'Hold') {
      patch.status = 'hold'
    } else if (before?.status === 'hold' && before?.hold_approval === 'Hold' && 'hold_approval' in patch
               && patch.hold_approval !== 'Hold' && patch.status !== 'hold') {
      // Hold taken off in the edit form → release it
      patch.status = (patch.supervisor_id ?? before.supervisor_id) ? 'assigned' : 'new'
      patch.hold_reason = null
    } else if (before?.status === 'hold' && patch.status !== undefined && patch.status !== 'hold' && before?.hold_approval !== 'Hold') {
      // Edit form sent a non-hold status for a held order without touching Hold → stay on hold
      patch.status = 'hold'
    }
    const { error } = await dbUpdate('orders', { id }, patch)
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
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
    const { error } = await dbDelete('orders', { id })
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    return NextResponse.json({ ok: true })
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
    const { ids, patch } = payload
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
