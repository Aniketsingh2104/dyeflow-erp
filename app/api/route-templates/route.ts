/**
 * /api/route-templates
 * CRUD for process route templates
 * Backed by process_route_templates table (migrated from settings.processRouteMaster)
 */
import { NextRequest, NextResponse } from 'next/server'
import { guard } from '@/lib/access'
import { dbSelect, dbInsert, dbUpdate, dbDelete } from '@/lib/supabase'
import { requireAdmin } from '@/lib/auth'

export async function GET(req: NextRequest) {
  { const g = await guard(req, 'route-templates', 'GET'); if (g.deny) return g.deny }
  const { data, error } = await dbSelect(
    'process_route_templates', { order: 'created_at.asc' },
    'id,name,route,steps,created_at,updated_at'
  )
  if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
  return NextResponse.json({ ok: true, data, total: data.length })
}

export async function POST(req: NextRequest) {
  // Setup master — admin only (checked on the server — lib/auth.ts)
  { const deny = await requireAdmin(req); if (deny) return deny }
  const body = await req.json()
  const { action } = body

  if (action === 'create') {
    const { name, route, steps } = body
    if (!name?.trim() || !Array.isArray(route) || !route.length) {
      return NextResponse.json({ ok: false, error: 'name and route[] required' }, { status: 400 })
    }
    const { data, error } = await dbInsert('process_route_templates', {
      id:    `rt-${Date.now()}`,
      name:  name.trim(),
      route,
      steps: steps || route.map((code: string) => ({ processCode: code, name: code })),
    })
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    return NextResponse.json({ ok: true, data })
  }

  if (action === 'update') {
    const { id, name, route, steps } = body
    if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })
    const { error } = await dbUpdate('process_route_templates', { id }, {
      name:       name?.trim(),
      route,
      steps:      steps || route?.map((code: string) => ({ processCode: code, name: code })),
      updated_at: new Date().toISOString(),
    })
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (action === 'delete') {
    const { id } = body
    if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })
    const { error } = await dbDelete('process_route_templates', { id })
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 })
}
