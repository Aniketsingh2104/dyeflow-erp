import { NextRequest, NextResponse } from 'next/server'
import { guard } from '@/lib/access'
import { dbUpsert, dbSelect } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  { const g = await guard(req, 'settings', 'GET'); if (g.deny) return g.deny }
  const { searchParams } = new URL(req.url)
  const key = searchParams.get('key') || 'factory'

  const { data, error } = await dbSelect('settings', { key: `eq.${key}` })
  if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
  const row = data?.[0]
  return NextResponse.json({ ok: true, value: row?.value ?? null })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { key, value } = body
  if (!key) return NextResponse.json({ ok: false, error: 'key required' }, { status: 400 })

  // Settings are admin only, except the process durations the Date
  // Calculator page saves (Edit on /date-calculator) — POLICY in lib/access.ts
  { const g = await guard(req, 'settings', key === 'processDurations' ? 'processDurations' : 'POST'); if (g.deny) return g.deny }

  const { error } = await dbUpsert('settings', {
    key, value, updated_at: new Date().toISOString(),
  }, 'key')
  if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
  return NextResponse.json({ ok: true })
}
