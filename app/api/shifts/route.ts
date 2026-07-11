import { NextRequest, NextResponse } from 'next/server'
import { dbSelect, dbInsert, dbDelete, dbUpdate } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const date = searchParams.get('date')
  const query: Record<string, string> = { order: 'shift_date.desc,shift.asc', limit: '200' }
  if (date) query.shift_date = `eq.${date}`

  const { data, error } = await dbSelect('shift_logs', query)
  if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
  return NextResponse.json({ ok: true, data })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { action } = body

  if (action === 'create') {
    // Delete existing entry for same date + shift (overwrite)
    await dbDelete('shift_logs', {} as any)
    // Actually do a selective delete
    const { data: existing } = await dbSelect('shift_logs', {
      shift_date: `eq.${body.shift_date}`,
      shift: `eq.${body.shift}`,
    }, 'id')
    for (const e of existing || []) {
      await dbDelete('shift_logs', { id: e.id })
    }

    const { data, error } = await dbInsert('shift_logs', {
      id:                 body.id || undefined,
      shift_date:         body.shift_date,
      shift:              body.shift,
      supervisor_name:    body.supervisor_name,
      machine_ids:        body.machine_ids || [],
      notes:              body.notes || null,
      handover_notes:     body.handover_notes || null,
      batches_completed:  body.batches_completed || 0,
    })
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    return NextResponse.json({ ok: true, data })
  }

  if (action === 'delete') {
    const { error } = await dbDelete('shift_logs', { id: body.id })
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 })
}
