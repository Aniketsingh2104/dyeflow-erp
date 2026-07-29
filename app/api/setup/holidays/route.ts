import { NextRequest, NextResponse } from 'next/server'
import { dbSelect, dbInsert, dbDelete } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const type = searchParams.get('type')

  const query: Record<string, string> = { order: 'holiday_date.asc' }
  if (type) query['type'] = `eq.${type}`

  const { data, error } = await dbSelect('holidays', query,
    'id,holiday_date,name,type,machine_id,reason,created_at'
  )
  if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
  return NextResponse.json({ ok: true, data })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { action } = body

  if (action === 'add') {
    const { date, type, machine_id, reason } = body
    if (!date) return NextResponse.json({ ok: false, error: 'date required' }, { status: 400 })

    const row: Record<string, any> = {
      holiday_date: date,
      type:         type || 'global',
      name:         reason || (type === 'machine' ? 'Machine Holiday' : 'Holiday'),
      reason:       reason || null,
    }
    // Only include machine_id for machine holidays (and only if it's a valid UUID)
    if (type === 'machine' && machine_id) {
      row.machine_id = machine_id
    }

    const { error } = await dbInsert('holidays', row)
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (action === 'delete') {
    const { id } = body
    if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })
    const { error } = await dbDelete('holidays', { id })
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 })
}
