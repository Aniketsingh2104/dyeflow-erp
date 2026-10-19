/**
 * /api/article-routes
 * CRUD for article → process route mapping
 * Backed by article_process_routes table (migrated from settings.articleProcessMap)
 */
import { NextRequest, NextResponse } from 'next/server'
import { guard } from '@/lib/access'
import { dbSelect, dbInsert, dbUpdate, dbDelete, sb } from '@/lib/supabase'
import { requireAdmin } from '@/lib/auth'
import { lastByKey } from '@/lib/dedupe'

export async function GET(req: NextRequest) {
  { const g = await guard(req, 'article-routes', 'GET'); if (g.deny) return g.deny }
  const { searchParams } = new URL(req.url)
  const article = searchParams.get('article')

  const query: Record<string, string> = { order: 'article.asc', limit: '5000' }
  if (article) query['article'] = `ilike.${article}`

  const { data, error } = await dbSelect('article_process_routes', query, 'id,article,route,updated_at')
  if (error) return NextResponse.json({ ok: false, error }, { status: 500 })

  // Also return as a flat map { article: route[] } for backward compat
  const map: Record<string, string[]> = {}
  for (const row of data) map[row.article] = row.route

  return NextResponse.json({ ok: true, data, map, total: data.length })
}

export async function POST(req: NextRequest) {
  // Setup master — admin only (checked on the server — lib/auth.ts)
  { const deny = await requireAdmin(req); if (deny) return deny }
  const body = await req.json()
  const { action } = body

  // ── Upsert one rule ──────────────────────────────────────────────────────
  if (action === 'upsert') {
    const { article, route } = body
    if (!article?.trim() || !Array.isArray(route) || !route.length) {
      return NextResponse.json({ ok: false, error: 'article and route[] required' }, { status: 400 })
    }

    // Check if exists
    const { data: existing } = await dbSelect('article_process_routes',
      { article: `eq.${article.trim().toLowerCase()}` }, 'id')

    if (existing?.length) {
      const { error } = await dbUpdate(
        'article_process_routes',
        { id: existing[0].id },
        { route, updated_at: new Date().toISOString() }
      )
      if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    } else {
      const { error } = await dbInsert('article_process_routes', {
        article: article.trim().toLowerCase(),
        route,
      })
      if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  }

  // ── Bulk upsert (from JSON import) ───────────────────────────────────────
  if (action === 'bulk_upsert') {
    const { rules } = body // [{ article, route }]
    if (!Array.isArray(rules) || !rules.length) {
      return NextResponse.json({ ok: false, error: 'rules[] required' }, { status: 400 })
    }

    const rows = rules
      .filter(r => r.article && Array.isArray(r.route) && r.route.length)
      .map(r => ({
        article:    String(r.article).trim().toLowerCase(),
        route:      r.route,
        updated_at: new Date().toISOString(),
      }))

    if (!rows.length) return NextResponse.json({ ok: false, error: 'No valid rules found' }, { status: 400 })

    // Batch upsert via PostgREST
    const { error } = await sb('/article_process_routes?on_conflict=article', {
      method: 'POST',
      body: JSON.stringify(lastByKey(rows, 'article')),
      headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
    })
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    return NextResponse.json({ ok: true, upserted: rows.length })
  }

  // ── Delete one rule ──────────────────────────────────────────────────────
  if (action === 'delete') {
    const { id } = body
    if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })
    const { error } = await dbDelete('article_process_routes', { id })
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  // ── Sync entire map back to settings.articleProcessMap (backward compat) ─
  // ('sync_to_settings' removed — it could never work on the server and nothing calls it)

  return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 })
}
