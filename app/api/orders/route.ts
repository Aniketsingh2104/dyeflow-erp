import { NextRequest, NextResponse } from 'next/server'
import { dbSelect, dbInsert, dbUpdate, dbDelete, sb, auditLog } from '@/lib/supabase'

// GET /api/orders
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const status       = searchParams.get('status')
  const supervisorId = searchParams.get('supervisor_id')
  const party        = searchParams.get('party')
  const limit        = searchParams.get('limit') || '500'

  const query: Record<string, string> = { order: 'priority.asc,created_at.desc', limit }
  if (status)       query['status']        = `eq.${status}`
  if (supervisorId) query['supervisor_id'] = `eq.${supervisorId}`
  if (party)        query['party']         = `ilike.*${party}*`

  const { data, error } = await dbSelect(
    'orders', query,
    'id,order_number,challan_no,party,article,color,shade_group,blend,' +
    'qty_kg,status,supervisor_id,machine_id,process_route,planned_dates,hold_reason,' +
    'hold_approval,remarks,priority,dyeing_fob,rolling_fob,' +
    'created_at,updated_at,supervisors(id,name),machines(id,name,capacity)'
  )
  if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
  return NextResponse.json({ ok: true, data })
}

// POST /api/orders
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { action, _user, ...payload } = body

  if (action === 'create') {
    const { data, error } = await dbInsert('orders', payload)
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })

    if (payload.process_route?.length && data?.id) {
      const rows = payload.process_route.map((code: string) => ({
        order_id: data.id, process_code: code,
      }))
      await sb('/planned_dates', {
        method: 'POST', body: JSON.stringify(rows),
        headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
      })
    }

    await auditLog({ username: _user, action: 'create', entity_type: 'order',
      entity_id: data?.order_number,
      new_value: `${payload.party} · ${payload.article} · ${payload.qty_kg}kg` })

    return NextResponse.json({ ok: true, data })
  }

  if (action === 'update') {
    const { id, ...patch } = payload
    if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })
    const { error } = await dbUpdate('orders', { id }, patch)
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    await auditLog({ username: _user, action: 'edit', entity_type: 'order', entity_id: id })
    return NextResponse.json({ ok: true })
  }

  // ── Batch-update planned_dates for multiple orders at once ────────────────
  if (action === 'update_planned_dates') {
    // updates: [{ id, planned_dates: Record<string, string> }]
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
    const { id } = payload
    if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })
    const { error } = await dbDelete('orders', { id })
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (action === 'assign_supervisor') {
    const { id, supervisor_id } = payload
    if (!id || !supervisor_id) {
      return NextResponse.json({ ok: false, error: 'id and supervisor_id required' }, { status: 400 })
    }
    const { error } = await dbUpdate('orders', { id }, { supervisor_id, status: 'assigned' })
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    await auditLog({ username: _user, action: 'assign', entity_type: 'order',
      entity_id: id, field: 'supervisor_id', new_value: supervisor_id })
    return NextResponse.json({ ok: true })
  }

  if (action === 'update_status') {
    const { id, status, hold_reason } = payload
    if (!id || !status) {
      return NextResponse.json({ ok: false, error: 'id and status required' }, { status: 400 })
    }
    const patch: Record<string, any> = { status }
    if (hold_reason !== undefined) patch.hold_reason = hold_reason
    const { error } = await dbUpdate('orders', { id }, patch)
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    await auditLog({ username: _user, action: 'status_change', entity_type: 'order',
      entity_id: id, new_value: status })
    return NextResponse.json({ ok: true })
  }

  if (action === 'bulk_update') {
    const { ids, patch } = payload
    if (!ids?.length) return NextResponse.json({ ok: false, error: 'ids required' }, { status: 400 })
    const errors: string[] = []
    for (const id of ids) {
      const { error } = await dbUpdate('orders', { id }, patch)
      if (error) errors.push(error)
    }
    if (errors.length) return NextResponse.json({ ok: false, error: errors.join(', ') }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 })
}
