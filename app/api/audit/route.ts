import { NextRequest, NextResponse } from 'next/server'
import { dbSelect, dbInsert, sb, currentUsername } from '@/lib/supabase'
import { requireAdmin } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const limit  = parseInt(searchParams.get('limit')  || '500')
  const action = searchParams.get('action')
  const entity = searchParams.get('entity')

  const query: Record<string, string> = {
    order: 'created_at.desc',
    limit: String(Math.min(limit, 2000)),
  }
  if (action) query['action']      = `eq.${action}`
  if (entity) query['entity_type'] = `eq.${entity}`

  const { data, error } = await dbSelect('audit_log', query)
  if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
  return NextResponse.json({ ok: true, data })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { action } = body

  if (action === 'log') {
    // username comes from the signed-in session, not from the browser
    const { error } = await dbInsert('audit_log', {
      username:    (await currentUsername()) || 'System',
      action:      body.action_type,
      entity_type: body.entity_type,
      entity_id:   body.entity_id,
      field:       body.field       || null,
      old_value:   body.old_value   || null,
      new_value:   body.new_value   || null,
      note:        body.note        || null,
    })
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (action === 'clear') {
    // Clearing the audit log — admin only (checked on the server — lib/auth.ts)
    { const deny = await requireAdmin(req); if (deny) return deny }
    const { error } = await sb('/audit_log', {
      method: 'DELETE',
      params: { id: 'neq.never' }, // delete all rows
    })
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 })
}
