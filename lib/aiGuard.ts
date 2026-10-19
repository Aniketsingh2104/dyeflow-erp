/**
 * lib/aiGuard.ts — limits on the AI routes (server only), so nobody can run
 * up the Groq / Gemini bill or flood the Ollama PC.
 *
 *   • 60 AI requests per user per hour (all AI routes together)
 *   • answers capped at 2,000 tokens
 *   • at most 40,000 characters of text sent in one request
 *   • embedding: at most 100 texts of 8,000 characters each
 */
import { NextResponse } from 'next/server'
import { rateHit, waitText } from '@/lib/rateLimit'

export const AI_REQUESTS_PER_HOUR = 60
export const AI_MAX_TOKENS = 2000
export const AI_MAX_CHARS = 40_000
export const EMBED_MAX_TEXTS = 100
export const EMBED_MAX_CHARS = 8_000

/** Count one AI request for this user; returns a 429 response when over the limit. */
export async function aiLimit(userId: string | null | undefined): Promise<NextResponse | null> {
  const wait = await rateHit(`ai:user:${userId || 'unknown'}`, AI_REQUESTS_PER_HOUR, 3600)
  if (wait > 0) {
    return NextResponse.json({ ok: false, error: `AI limit reached (${AI_REQUESTS_PER_HOUR} requests an hour) — try again in ${waitText(wait)}.` },
      { status: 429, headers: { 'Retry-After': String(wait) } })
  }
  return null
}

export function tooLong(what = 'This request') {
  return NextResponse.json({ ok: false, error: `${what} is too long for the AI (max ${AI_MAX_CHARS.toLocaleString('en-IN')} characters).` }, { status: 413 })
}

/** Answer length the client asked for, kept within the cap. */
export function capTokens(asked: any, fallback = 1000): number {
  const n = Math.floor(Number(asked) || fallback)
  return Math.max(1, Math.min(n, AI_MAX_TOKENS))
}

export const textOf = (c: any) => (typeof c === 'string' ? c : JSON.stringify(c ?? ''))
