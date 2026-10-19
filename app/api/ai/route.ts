import { NextRequest, NextResponse } from 'next/server'
import { guard } from '@/lib/access'
import { aiLimit, tooLong, capTokens, textOf, AI_MAX_CHARS } from '@/lib/aiGuard'

// ── Server-side AI proxy — supports Gemini OR Groq ───────────────────────────
// Set ONE of these in .env.local and restart the server:
//
//   GEMINI_API_KEY=AIza...    (free at https://aistudio.google.com)
//   GROQ_API_KEY=gsk_...      (free at https://console.groq.com)
//
// Groq is recommended if Gemini quota gives errors.

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const g = await guard(req, 'ai', 'POST')
    if (g.deny) return g.deny
    // size + rate limits (lib/aiGuard.ts). A long chat keeps its newest
    // messages: the oldest ones are dropped until the text fits.
    const msgs: any[] = Array.isArray(body?.messages) ? [...body.messages] : []
    const size = () => textOf(body?.system).length + msgs.reduce((n: number, m: any) => n + textOf(m?.content).length, 0)
    while (msgs.length > 1 && size() > AI_MAX_CHARS) msgs.shift()
    if (size() > AI_MAX_CHARS) return tooLong()
    body.messages = msgs
    const limited = await aiLimit(g.user?.id)
    if (limited) return limited

    // ── Try Groq first if key is set ─────────────────────────────────────────
    const groqKey = process.env.GROQ_API_KEY
    if (groqKey && groqKey !== 'your-groq-api-key-here') {
      return await callGroq(body, groqKey)
    }

    // ── Fall back to Gemini ──────────────────────────────────────────────────
    const geminiKey = process.env.GEMINI_API_KEY
    if (geminiKey && geminiKey !== 'your-gemini-api-key-here') {
      return await callGemini(body, geminiKey)
    }

    // ── No key found ─────────────────────────────────────────────────────────
    return NextResponse.json(
      {
        error:
          'No API key configured.\n\n' +
          'OPTION A — Groq (free, easiest):\n' +
          '  1. Go to https://console.groq.com\n' +
          '  2. Sign up free → API Keys → Create API Key\n' +
          '  3. Add to .env.local:  GROQ_API_KEY=gsk_...\n' +
          '  4. Restart: Ctrl+C then npm run dev\n\n' +
          'OPTION B — Gemini (free):\n' +
          '  1. Go to https://aistudio.google.com/apikey\n' +
          '  2. Create API Key in a NEW project\n' +
          '  3. Add to .env.local:  GEMINI_API_KEY=AIza...\n' +
          '  4. Restart: Ctrl+C then npm run dev',
      },
      { status: 500 }
    )
  } catch (err: any) {
    console.error('[/api/ai] error:', err)
    return NextResponse.json({ error: 'AI request failed — try again.' }, { status: 500 })
  }
}

// ── Groq ─────────────────────────────────────────────────────────────────────

async function callGroq(body: any, apiKey: string) {
  // Convert Anthropic-style messages → OpenAI-compatible (Groq uses OpenAI format)
  const messages: any[] = []

  if (body.system) {
    messages.push({ role: 'system', content: body.system })
  }

  for (const m of (body.messages || [])) {
    messages.push({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
    })
  }

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',   // Free, fast, very capable
      messages,
      max_tokens: capTokens(body.max_tokens),
      temperature: 0.7,
    }),
  })

  const data = await response.json()

  if (!response.ok) {
    // the provider's own error text stays in the server log
    console.error('[/api/ai] Groq error', response.status, data?.error?.message || JSON.stringify(data))
    return NextResponse.json(
      { error: response.status === 429 ? 'The AI service is busy (rate limit) — try again in a minute.' : `AI service error (${response.status}) — try again.` },
      { status: response.status === 429 ? 429 : 502 }
    )
  }

  // Convert OpenAI response → Anthropic-style so client code stays unchanged
  const text = data?.choices?.[0]?.message?.content || '(no response)'
  return NextResponse.json({ content: [{ type: 'text', text }] })
}

// ── Gemini ────────────────────────────────────────────────────────────────────

async function callGemini(body: any, apiKey: string) {
  const GEMINI_MODEL = 'gemini-2.0-flash'
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`

  const contents = (body.messages || []).map((m: any) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }],
  }))

  const geminiBody: any = {
    contents,
    generationConfig: {
      maxOutputTokens: capTokens(body.max_tokens),
      temperature: 0.7,
    },
  }

  if (body.system) {
    geminiBody.system_instruction = { parts: [{ text: body.system }] }
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(geminiBody),
  })

  const data = await response.json()

  if (!response.ok) {
    console.error('[/api/ai] Gemini error', response.status, data?.error?.message || JSON.stringify(data))
    return NextResponse.json(
      { error: response.status === 429 ? 'The AI service is busy (rate limit) — try again in a minute.' : `AI service error (${response.status}) — try again.` },
      { status: response.status === 429 ? 429 : 502 }
    )
  }

  const text =
    data?.candidates?.[0]?.content?.parts?.[0]?.text ||
    data?.candidates?.[0]?.output ||
    '(no response)'

  return NextResponse.json({ content: [{ type: 'text', text }] })
}
