import { NextRequest, NextResponse } from 'next/server'
import { dbUpsert, dbSelect } from '@/lib/supabase'

export async function GET(req: NextRequest) {
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

  const { error } = await dbUpsert('settings', {
    key, value, updated_at: new Date().toISOString(),
  })
  if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
  return NextResponse.json({ ok: true })
}
