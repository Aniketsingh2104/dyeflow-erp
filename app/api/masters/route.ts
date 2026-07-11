import { NextRequest, NextResponse } from 'next/server'
import { dbSelect, dbUpdate, dbDelete, dbUpsert } from '@/lib/supabase'

const ALLOWED = [
  'process_list', 'process_routes', 'customers', 'articles',
  'shade_master', 'colour_chemicals', 'holidays', 'factory_settings'
]

// GET /api/masters?table=process_list
export async function GET(req: NextRequest) {
  const table = new URL(req.url).searchParams.get('table') || ''
  if (!ALLOWED.includes(table)) {
    return NextResponse.json({ ok: false, error: 'Unknown table' }, { status: 400 })
  }
  const orderMap: Record<string, string> = {
    process_list: 'display_order.asc',
    customers:    'name.asc',
    articles:     'name.asc',
    holidays:     'holiday_date.asc',
  }
  const { data, error } = await dbSelect(table, { order: orderMap[table] || 'created_at.asc' })
  if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
  return NextResponse.json({ ok: true, data })
}

// POST /api/masters
export async function POST(req: NextRequest) {
  const { table, action, ...payload } = await req.json()
  if (!ALLOWED.includes(table)) {
    return NextResponse.json({ ok: false, error: 'Unknown table' }, { status: 400 })
  }

  if (action === 'upsert') {
    const { data, error } = await dbUpsert(table, payload)
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    return NextResponse.json({ ok: true, data })
  }

  if (action === 'update') {
    const { id, key, ...patch } = payload
    const filter = id ? { id } : key ? { key } : null
    if (!filter) return NextResponse.json({ ok: false, error: 'id or key required' }, { status: 400 })
    const { error } = await dbUpdate(table, filter, patch)
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (action === 'delete') {
    const { error } = await dbDelete(table, { id: payload.id })
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 })
}
