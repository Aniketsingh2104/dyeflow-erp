/**
 * /api/article-routes
 * CRUD for article → process route mapping
 * Backed by article_process_routes table (migrated from settings.articleProcessMap)
 */
import { NextRequest, NextResponse } from 'next/server'
import { dbSelect, dbInsert, dbUpdate, dbDelete, sb } from '@/lib/supabase'

export async function GET(req: NextRequest) {
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
    const { error } = await sb('/article_process_routes', {
      method: 'POST',
      body: JSON.stringify(rows),
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
  if (action === 'sync_to_settings') {
    const { data } = await dbSelect('article_process_routes', { limit: '10000' }, 'article,route')
    if (!data) return NextResponse.json({ ok: false, error: 'No data' }, { status: 500 })
    const map: Record<string, string[]> = {}
    for (const row of data) map[row.article] = row.route
    const res = await fetch('/api/setup/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'articleProcessMap', value: map }),
    })
    const j = await res.json()
    return NextResponse.json({ ok: j.ok, synced: data.length })
  }

  return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 })
}
