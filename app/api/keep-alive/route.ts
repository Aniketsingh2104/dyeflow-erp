/**
 * GET /api/keep-alive — called by the Vercel cron in vercel.json so the
 * Supabase project never sits idle long enough to be paused (free projects
 * pause after ~7 days without activity).
 *
 * Not behind login (proxy.ts lets it through). If CRON_SECRET is set on
 * Vercel, Vercel's scheduler sends it as "Authorization: Bearer <secret>" and
 * anything else is refused. The route only reads one row, so it is harmless.
 */
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { dbSelect } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

function authorised(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return true
  const given = Buffer.from(req.headers.get('authorization') || '')
  const want  = Buffer.from(`Bearer ${secret}`)
  return given.length === want.length && crypto.timingSafeEqual(given, want)
}

export async function GET(req: NextRequest) {
  if (!authorised(req)) return NextResponse.json({ ok: false, error: 'Unauthorised' }, { status: 401 })
  const started = Date.now()
  const { error } = await dbSelect('process_list', { limit: '1' }, 'id')
  if (error) return NextResponse.json({ ok: false, error }, { status: 503 })
  return NextResponse.json({ ok: true, db: 'awake', ms: Date.now() - started, at: new Date().toISOString() })
}
