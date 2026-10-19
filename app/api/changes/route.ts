/**
 * GET /api/changes — tiny "has anything changed?" signature for the 30-second
 * change-watch in components/DbProvider.tsx (replaces Supabase Realtime).
 *
 * For each watched table: row count + latest updated_at. Inserts, updates and
 * deletes all change the signature. Requires sign-in (proxy.ts).
 */
import { NextRequest, NextResponse } from 'next/server'
import { guard } from '@/lib/access'
import { SUPABASE_URL, SUPABASE_API_KEY } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const TABLES = ['orders', 'batches', 'batch_processes', 'faulty_records', 'fob_records', 'repairing_orders', 'machines']

async function tableSig(table: string): Promise<string> {
  const url = `${SUPABASE_URL}/rest/v1/${table}?select=updated_at&order=updated_at.desc.nullslast&limit=1`
  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_API_KEY,
      Authorization: `Bearer ${SUPABASE_API_KEY}`,
      Prefer: 'count=exact',
    },
    cache: 'no-store',
  })
  if (!res.ok) return `${table}:?`
  const total = (res.headers.get('content-range') || '').split('/')[1] || '?'
  const rows = await res.json().catch(() => [])
  return `${table}:${total}:${rows?.[0]?.updated_at || ''}`
}

export async function GET(req: NextRequest) {
  { const g = await guard(req, 'changes', 'GET'); if (g.deny) return g.deny }
  try {
    const parts = await Promise.all(TABLES.map(tableSig))
    return NextResponse.json({ ok: true, sig: parts.join('|') })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
