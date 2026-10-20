/**
 * /api/route-templates
 * CRUD for process route templates
 * Backed by process_route_templates table (migrated from settings.processRouteMaster)
 */
import { NextRequest, NextResponse } from 'next/server'
import { guard } from '@/lib/access'
import { dbSelect, dbInsert, dbUpdate, dbDelete } from '@/lib/supabase'
import { requireAdmin } from '@/lib/auth'
import { workRoute } from '@/lib/routeTail'
import { canonicalCode } from '@/lib/processCodes'

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
    const { name } = body
    // templates hold the work route only — QA / Packing / Dispatch are added
    // by the system when a route is confirmed (lib/routeTail.ts)
    const route = workRoute(body.route)
    if (!name?.trim() || !route.length) {
      return NextResponse.json({ ok: false, error: 'name and route[] required (QA / Packing / Dispatch are added automatically)' }, { status: 400 })
    }
    const steps = (Array.isArray(body.steps) ? body.steps : []).filter((s: any) => route.includes(canonicalCode(s?.processCode)))
    const { data, error } = await dbInsert('process_route_templates', {
      id:    `rt-${Date.now()}`,
      name:  name.trim(),
      route,
      steps: steps.length === route.length ? steps : route.map((code: string) => ({ processCode: code, name: code })),
    })
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    return NextResponse.json({ ok: true, data })
  }

  if (action === 'update') {
    const { id, name } = body
    if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })
    const route = body.route !== undefined ? workRoute(body.route) : undefined
    if (route && !route.length) return NextResponse.json({ ok: false, error: 'Select at least one process (QA / Packing / Dispatch are added automatically)' }, { status: 400 })
    const steps = route ? (Array.isArray(body.steps) ? body.steps : []).filter((s: any) => route.includes(canonicalCode(s?.processCode))) : undefined
    const { error } = await dbUpdate('process_route_templates', { id }, {
      name:       name?.trim(),
      route,
      steps:      route ? (steps && steps.length === route.length ? steps : route.map((code: string) => ({ processCode: code, name: code }))) : undefined,
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
