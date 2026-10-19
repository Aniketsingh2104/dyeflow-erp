import { NextRequest, NextResponse } from 'next/server'
import { guard } from '@/lib/access'
import { dbSelect, dbInsert, dbDelete, dbUpdate } from '@/lib/supabase'
import { requireAdmin } from '@/lib/auth'

export async function GET(req: NextRequest) {
  { const g = await guard(req, 'shifts', 'GET'); if (g.deny) return g.deny }
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
  { const g = await guard(req, 'shifts', (body as any)?.action); if (g.deny) return g.deny }
  const { action } = body

  if (action === 'create') {
    // Replace only the existing entry for the SAME date + shift (overwrite).
    // (Never delete without a filter — that would wipe every shift log.)
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
    // Delete — admin only (checked on the server — lib/auth.ts)
    { const deny = await requireAdmin(req); if (deny) return deny }
    const { error } = await dbDelete('shift_logs', { id: body.id })
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 })
}
