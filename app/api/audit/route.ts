import { NextRequest, NextResponse } from 'next/server'
import { guard } from '@/lib/access'
import { dbSelect, sb } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const g = await guard(req, 'audit', 'GET')
  if (g.deny) return g.deny
  const { searchParams } = new URL(req.url)
  const limit  = parseInt(searchParams.get('limit')  || '500')
  const action = searchParams.get('action')
  const entity = searchParams.get('entity')
  const entityIds = (searchParams.get('entity_id') || '').split(',').map(s => s.trim()).filter(Boolean)
  // The full log is admin only; staff may read the history of one record
  // (e.g. a batch's trace page asks for its own ids).
  if (!g.user?.isAdmin && !entityIds.length) {
    return NextResponse.json({ ok: false, error: 'Only an admin can open the full audit log.' }, { status: 403 })
  }

  const query: Record<string, string> = {
    order: 'created_at.desc,id.desc',
    limit: String(Math.min(limit, 2000)),
  }
  // "Load older": entries before this time (the oldest one already shown)
  const before = searchParams.get('before')
  // (passed on exactly — toISOString would cut the microseconds and skip rows)
  // with before_id, rows sharing that exact time (one transaction) aren't skipped
  const beforeId = searchParams.get('before_id')
  if (before && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?(Z|[+-]\d\d:\d\d)?$/.test(before) && !isNaN(Date.parse(before))) {
    if (beforeId && /^[0-9a-f-]{36}$/i.test(beforeId)) query['or'] = `(created_at.lt.${before},and(created_at.eq.${before},id.lt.${beforeId}))`
    else query['created_at'] = `lt.${before}`
  }
  if (action) query['action']      = `eq.${action}`
  if (entity) query['entity_type'] = `eq.${entity}`
  // one or more ids, e.g. a batch's uuid and its text id
  if (entityIds.length) query['entity_id'] = `in.(${entityIds.map(v => `"${v.replace(/"/g, '')}"`).join(',')})`

  const { data, error } = await dbSelect('audit_log', query)
  if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
  return NextResponse.json({ ok: true, data })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  { const g = await guard(req, 'audit', (body as any)?.action); if (g.deny) return g.deny }
  const { action } = body

  // (The old 'log' action — any user writing their own entries — is gone:
  //  audit entries are only written by the server itself.)

  if (action === 'clear') {
    // Clearing the audit log — admin only (POLICY in lib/access.ts)
    const { error } = await sb('/audit_log', {
      method: 'DELETE',
      // everything except the process history (process_done / batch_move),
      // which the predictions and Batch Trace are built from
      params: { action: 'not.in.(process_done,batch_move)' },
    })
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 })
}
