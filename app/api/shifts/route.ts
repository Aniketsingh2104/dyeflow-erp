import { NextRequest, NextResponse } from 'next/server'
import { guard } from '@/lib/access'
import { dbSelect, dbInsert, dbDelete, dbUpdate, sb } from '@/lib/supabase'
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
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(body.shift_date || '')) || !['morning', 'evening', 'night'].includes(body.shift)) {
      return NextResponse.json({ ok: false, error: 'A valid date and shift are required' }, { status: 400 })
    }
    // The new entry REPLACES the one for the same date + shift: it is saved
    // first, then every OLDER entry for that date + shift is removed — so two
    // saves at once still leave exactly one (the newest), and a failed save
    // leaves the old one in place.
    const { data, error } = await dbInsert<any>('shift_logs', {
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
    const row = Array.isArray(data) ? data[0] : data
    if (row?.id && row?.created_at) {
      const { error: delErr } = await sb('/shift_logs', { method: 'DELETE', params: {
        shift_date: `eq.${body.shift_date}`, shift: `eq.${body.shift}`,
        or: `(created_at.lt.${row.created_at},and(created_at.eq.${row.created_at},id.lt.${row.id}))`,
      } })
      if (delErr) return NextResponse.json({ ok: false, error: 'Saved, but the older entry for this shift could not be removed: ' + delErr }, { status: 500 })
    }
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
