import { NextRequest, NextResponse } from 'next/server'
import { dbSelect, dbInsert, dbUpdate, dbDelete, sb } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const supervisor = searchParams.get('supervisor')
  const article    = searchParams.get('article')

  const query: Record<string, string> = { order: 'article.asc', limit: '10000' }
  if (supervisor) query['supervisor'] = `eq.${supervisor}`
  if (article)    query['article']    = `ilike.*${article}*`

  const { data, error } = await dbSelect('article_supervisor_map', query, 'id,article,supervisor,updated_at')
  if (error) return NextResponse.json({ ok: false, error }, { status: 500 })

  // Also return as flat map { article: supervisor } for backward compat
  const map: Record<string, string> = {}
  for (const row of data) map[row.article] = row.supervisor

  return NextResponse.json({ ok: true, data, map, total: data.length })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { action } = body

  if (action === 'upsert') {
    const { article, supervisor } = body
    if (!article?.trim() || !supervisor?.trim()) {
      return NextResponse.json({ ok: false, error: 'article and supervisor required' }, { status: 400 })
    }
    const { data: existing } = await dbSelect('article_supervisor_map',
      { article: `eq.${article.trim()}` }, 'id')

    if (existing?.length) {
      const { error } = await dbUpdate('article_supervisor_map', { id: existing[0].id },
        { supervisor: supervisor.trim(), updated_at: new Date().toISOString() })
      if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    } else {
      const { error } = await dbInsert('article_supervisor_map',
        { article: article.trim(), supervisor: supervisor.trim() })
      if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  }

  if (action === 'bulk_upsert') {
    // [{ article, supervisor }]
    const { mappings } = body
    if (!Array.isArray(mappings) || !mappings.length) {
      return NextResponse.json({ ok: false, error: 'mappings[] required' }, { status: 400 })
    }
    const rows = mappings
      .filter(m => m.article?.trim() && m.supervisor?.trim())
      .map(m => ({ article: m.article.trim(), supervisor: m.supervisor.trim(), updated_at: new Date().toISOString() }))

    if (!rows.length) return NextResponse.json({ ok: false, error: 'No valid mappings' }, { status: 400 })

    const { error } = await sb('/article_supervisor_map', {
      method:  'POST',
      body:    JSON.stringify(rows),
      headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
    })
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    return NextResponse.json({ ok: true, upserted: rows.length })
  }

  if (action === 'delete') {
    const { id } = body
    if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })
    const { error } = await dbDelete('article_supervisor_map', { id })
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (action === 'delete_by_article') {
    const { article } = body
    if (!article) return NextResponse.json({ ok: false, error: 'article required' }, { status: 400 })
    const { data: existing } = await dbSelect('article_supervisor_map', { article: `eq.${article}` }, 'id')
    if (existing?.length) {
      const { error } = await dbDelete('article_supervisor_map', { id: existing[0].id })
      if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 })
}
