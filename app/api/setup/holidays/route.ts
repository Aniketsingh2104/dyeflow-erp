import { NextRequest, NextResponse } from 'next/server'
import { dbSelect, dbInsert, dbDelete } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const { data, error } = await dbSelect('holidays', { order: 'holiday_date.asc' })
  if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
  return NextResponse.json({ ok: true, data })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { action } = body

  if (action === 'add') {
    const { error } = await dbInsert('holidays', {
      id:           body.id || crypto.randomUUID(),
      holiday_date: body.date,
      type:         body.type || 'global',
      machine_id:   body.machine_id || null,
      reason:       body.reason || null,
    })
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (action === 'delete') {
    const { error } = await dbDelete('holidays', { id: body.id })
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 })
}
