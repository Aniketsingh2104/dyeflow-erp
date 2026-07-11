import { NextRequest, NextResponse } from 'next/server'
import { dbSelect, dbInsert, dbUpdate } from '@/lib/supabase'

export async function GET() {
  const { data, error } = await dbSelect(
    'repairing_orders',
    { order: 'created_at.desc' },
    'id,faulty_id,order_id,batch_id,repair_kg,process_route,status,machine_id,notes,created_at,updated_at,machines(id,name),orders(order_number,party)'
  )
  if (error) return NextResponse.json({ ok: false, error }, { status: 500 })

  // Flatten order info
  const enriched = (data || []).map((r: any) => ({
    ...r,
    order_number: r.orders?.order_number || '-',
    party:        r.orders?.party        || '-',
  }))

  return NextResponse.json({ ok: true, data: enriched })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { action, id, ...payload } = body

  if (action === 'create') {
    const { data, error } = await dbInsert('repairing_orders', {
      faulty_id:    payload.faulty_id    || null,
      order_id:     payload.order_id     || null,
      batch_id:     payload.batch_id     || null,
      repair_kg:    payload.repair_kg    || 0,
      process_route: payload.process_route || [],
      status:       payload.status       || 'pending',
      machine_id:   payload.machine_id   || null,
      notes:        payload.notes        || null,
    })
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    return NextResponse.json({ ok: true, data })
  }

  if (action === 'update') {
    if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })
    const patch: Record<string, any> = {}
    if (payload.status    !== undefined) patch.status    = payload.status
    if (payload.notes     !== undefined) patch.notes     = payload.notes
    if (payload.repair_kg !== undefined) patch.repair_kg = payload.repair_kg
    if (payload.machine_id !== undefined) patch.machine_id = payload.machine_id
    const { error } = await dbUpdate('repairing_orders', { id }, patch)
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 })
}
