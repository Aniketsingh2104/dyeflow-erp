import { NextRequest, NextResponse } from 'next/server'
import { guard } from '@/lib/access'
import { dbSelect, dbInsert, dbUpdate, dbDelete, sb } from '@/lib/supabase'
import { requireAdmin } from '@/lib/auth'
import { lastByKey } from '@/lib/dedupe'

export async function GET(req: NextRequest) {
  { const g = await guard(req, 'customers', 'GET'); if (g.deny) return g.deny }
  const { data, error } = await dbSelect('customers',
    { order: 'name.asc', limit: '2000', is_active: 'eq.true' },
    'id,name,contact,phone,created_at'
  )
  if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
  return NextResponse.json({ ok: true, data })
}

export async function POST(req: NextRequest) {
  // Setup master — admin only (checked on the server — lib/auth.ts)
  { const deny = await requireAdmin(req); if (deny) return deny }
  const body = await req.json()
  const { action } = body

  if (action === 'upsert') {
    const { name, contact, phone } = body
    if (!name?.trim()) return NextResponse.json({ ok: false, error: 'name required' }, { status: 400 })

    // Check if exists
    const { data: existing } = await dbSelect('customers',
      { name: `ilike.${name.trim()}`, limit: '1' }, 'id'
    )

    if (existing?.length) {
      const { error } = await dbUpdate('customers', { id: existing[0].id }, {
        contact: contact || null,
        phone:   phone   || null,
        is_active: true,
      })
      if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    } else {
      const { error } = await dbInsert('customers', {
        name:    name.trim(),
        contact: contact || null,
        phone:   phone   || null,
        is_active: true,
      })
      if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  }

  if (action === 'update') {
    const { id, name, contact, phone } = body
    if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })
    const { error } = await dbUpdate('customers', { id }, {
      name:    name?.trim(),
      contact: contact || null,
      phone:   phone   || null,
    })
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (action === 'bulk_upsert') {
    // For Excel import — batch insert all at once
    const { customers } = body
    if (!Array.isArray(customers) || !customers.length) {
      return NextResponse.json({ ok: false, error: 'customers[] required' }, { status: 400 })
    }
    const rows = customers
      .filter(c => c.name?.trim())
      .map(c => ({
        name:      c.name.trim(),
        contact:   c.contact || null,
        phone:     c.phone   || null,
        is_active: true,
      }))
    if (!rows.length) return NextResponse.json({ ok: false, error: 'No valid rows' }, { status: 400 })

    const { error } = await sb('/customers?on_conflict=name', {
      method:  'POST',
      body: JSON.stringify(lastByKey(rows, 'name')),
      headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
    })
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    return NextResponse.json({ ok: true, inserted: rows.length })
  }

  if (action === 'delete') {
    const { id } = body
    if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })
    const { error } = await dbDelete('customers', { id })
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 })
}
