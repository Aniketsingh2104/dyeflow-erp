import { NextRequest, NextResponse } from 'next/server'

// Use service key if available, fall back to anon key
// Service key bypasses RLS — required for upsert on dyeflow_db table
// Anon key works for reads if RLS SELECT policy allows it
const SUPABASE_URL = process.env.SUPABASE_URL || ''
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY && process.env.SUPABASE_SERVICE_KEY !== 'YOUR_SERVICE_ROLE_KEY_HERE'
  ? process.env.SUPABASE_SERVICE_KEY
  : (process.env.SUPABASE_ANON_KEY || '')

export async function GET() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return NextResponse.json({ ok: false, error: 'Supabase not configured' }, { status: 503 })
  }

  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/dyeflow_db?id=eq.main&select=data,updated_at`,
      {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
        },
        cache: 'no-store',
      }
    )

    if (!res.ok) {
      const errText = await res.text()
      return NextResponse.json({ ok: false, error: errText }, { status: res.status })
    }

    const rows = await res.json()
    const row = rows?.[0]
    return NextResponse.json({
      ok: true,
      data: row?.data ?? {},
      updated_at: row?.updated_at ?? null,
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return NextResponse.json({ ok: false, error: 'Supabase not configured' }, { status: 503 })
  }

  try {
    const body = await req.json()
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ ok: false, error: 'Invalid body' }, { status: 400 })
    }

    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/dyeflow_db`,
      {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates',
        },
        body: JSON.stringify({ id: 'main', data: body }),
      }
    )

    if (!res.ok) {
      const errText = await res.text()
      return NextResponse.json({ ok: false, error: errText }, { status: res.status })
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
