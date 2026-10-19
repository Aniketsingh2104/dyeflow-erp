/**
 * /api/order-sheets — the list of party order sheets.
 *   GET            → admin / office staff: every sheet; party users and
 *                    other staff: only the sheets ticked for them in
 *                    User Management (allowedSheets)
 *   create / update_rows / toggle_status / delete → admin only
 * Access rules: lib/access.ts
 */
import { NextRequest, NextResponse } from 'next/server'
import { dbSelect, dbInsert, dbUpdate, sb, auditLog } from '@/lib/supabase'
import { guard, canUseSheet } from '@/lib/access'

export async function GET(req: NextRequest) {
  const g = await guard(req, 'order-sheets', 'GET')
  if (g.deny) return g.deny
  const user = g.user!
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')

  if (id) {
    if (!canUseSheet(user, id)) {
      return NextResponse.json({ ok: false, error: "You don't have access to this sheet." }, { status: 403 })
    }
    const { data, error } = await dbSelect('order_sheets', { id: `eq.${id}` })
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    return NextResponse.json({ ok: true, data: data[0] || null })
  }

  const { data, error } = await dbSelect('order_sheets', { order: 'created_at.desc' })
  if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
  return NextResponse.json({ ok: true, data: (data || []).filter((s: any) => canUseSheet(user, s.id)) })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { action, ...payload } = body
  const g = await guard(req, 'order-sheets', action)
  if (g.deny) return g.deny

  if (action === 'create') {
    if (!String(payload.title || '').trim()) return NextResponse.json({ ok: false, error: 'Title required' }, { status: 400 })
    const { data, error } = await dbInsert('order_sheets', {
      title:       String(payload.title).trim(),
      assigned_to: payload.assignedTo || null,
      status:      'Active',
      rows:        Array.isArray(payload.rows) ? payload.rows : [],
    })
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    await auditLog({ action: 'sheet_create', entity_type: 'order_sheet', entity_id: data?.id, new_value: payload.title })
    return NextResponse.json({ ok: true, data })
  }

  if (action === 'update_rows') {
    const { id, rows } = payload
    if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })
    const { error } = await dbUpdate('order_sheets', { id }, { rows })
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (action === 'toggle_status') {
    const { id, status } = payload
    if (!id || !['Active', 'Closed'].includes(status)) {
      return NextResponse.json({ ok: false, error: 'id and status (Active/Closed) required' }, { status: 400 })
    }
    const { error } = await dbUpdate('order_sheets', { id }, { status })
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (action === 'delete') {
    if (!payload.id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })
    const { error } = await sb('/order_sheets', {
      method: 'DELETE',
      params: { id: `eq.${payload.id}` },
    })
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    await auditLog({ action: 'sheet_delete', entity_type: 'order_sheet', entity_id: payload.id })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 })
}
