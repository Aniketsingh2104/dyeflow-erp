import { NextRequest, NextResponse } from 'next/server'
import { dbSelect, dbInsert, dbUpdate, dbDelete, dbUpsert } from '@/lib/supabase'

export async function GET() {
  const { data, error } = await dbSelect('process_list', { order: 'display_order.asc,name.asc' },
    'id,code,name,display_order,default_days,allow_faulty,allow_fob,is_enabled,created_at')
  if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
  return NextResponse.json({ ok: true, data })
}

export async function POST(req: NextRequest) {
  const { action, ...payload } = await req.json()

  if (action === 'create') {
    const { data, error } = await dbInsert('process_list', {
      code:          payload.code,
      name:          payload.name,
      display_order: payload.display_order ?? 99,
      default_days:  payload.default_days  ?? 1,
      allow_faulty:  payload.allow_faulty  ?? true,
      allow_fob:     payload.allow_fob     ?? false,
      is_enabled:    payload.is_enabled    ?? true,
    })
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    return NextResponse.json({ ok: true, data })
  }

  if (action === 'update') {
    const { id, ...patch } = payload
    if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })
    const { error } = await dbUpdate('process_list', { id }, patch)
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (action === 'reorder') {
    // payload.items = [{id, display_order}, ...]
    const items: {id: string; display_order: number}[] = payload.items || []
    for (const item of items) {
      await dbUpdate('process_list', { id: item.id }, { display_order: item.display_order })
    }
    return NextResponse.json({ ok: true })
  }

  if (action === 'delete') {
    const { error } = await dbDelete('process_list', { id: payload.id })
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 })
}
