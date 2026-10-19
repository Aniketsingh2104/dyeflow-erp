/**
 * lib/rateLimit.ts — counters kept in the database (df_rate_limits, see
 * dyeflow-section6.sql), so they work across every Vercel server instance.
 *
 *   rateHit(key, limit, windowSeconds)  → counts one hit; returns seconds to
 *                                          wait (0 = allowed)
 *   ratePeek(key, limit, windowSeconds) → same answer without counting
 *   rateClear(key)                      → forget (e.g. after a good login)
 *   rateUndo(key)                       → take one hit back
 *   unlockLogin(username)               → admin: clear that user's login locks
 *
 * If the counter can't be reached (database hiccup) the request is allowed —
 * a broken counter must never lock everybody out.
 */
import { NextRequest } from 'next/server'
import { sb } from '@/lib/supabase'

async function call(fn: string, args: Record<string, any>): Promise<number> {
  const r = await sb<number>(`/rpc/${fn}`, { method: 'POST', body: JSON.stringify(args) })
  if (r.error) { console.error(`[rateLimit] ${fn} failed:`, r.error); return 0 }
  return Number(r.data) || 0
}

export const rateHit = (key: string, limit: number, windowSeconds: number) =>
  call('df_rate_hit', { p_key: key, p_limit: limit, p_window_seconds: windowSeconds })

export const ratePeek = (key: string, limit: number, windowSeconds: number) =>
  call('df_rate_peek', { p_key: key, p_limit: limit, p_window_seconds: windowSeconds })

export async function rateClear(key: string) {
  await sb('/rpc/df_rate_clear', { method: 'POST', body: JSON.stringify({ p_key: key }), headers: { 'Prefer': 'return=minimal' } })
}

/** Take one hit back off a counter. */
export async function rateUndo(key: string) {
  await sb('/rpc/df_rate_undo', { method: 'POST', body: JSON.stringify({ p_key: key }), headers: { 'Prefer': 'return=minimal' } })
}

/** Admin "Unlock login": forget every login counter of this username. */
export async function unlockLogin(username: string): Promise<{ error: string | null }> {
  const r = await sb('/rpc/df_rate_clear_user', { method: 'POST', body: JSON.stringify({ p_username: username }) })
  return { error: r.error }
}

/**
 * The caller's IP address. On Vercel the platform sets x-forwarded-for /
 * x-real-ip itself (a browser can't fake them). On the factory PC copy the
 * Cloudflare tunnel's cf-connecting-ip is used when present.
 */
export function clientIp(req: NextRequest): string {
  const cf = process.env.VERCEL !== '1' ? req.headers.get('cf-connecting-ip') : null
  const fwd = req.headers.get('x-forwarded-for')
  const ip = (cf || req.headers.get('x-real-ip') || (fwd ? fwd.split(',')[0] : '') || '').trim()
  return ip || 'unknown'
}

/** "3 minutes" / "1 minute" / "40 seconds" */
export function waitText(seconds: number): string {
  if (seconds < 60) return `${seconds} seconds`
  const m = Math.ceil(seconds / 60)
  return `${m} minute${m === 1 ? '' : 's'}`
}
