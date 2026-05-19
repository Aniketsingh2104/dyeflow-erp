import { NextRequest, NextResponse } from 'next/server'

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
    return NextResponse.json(
      { error: `Server error: ${err?.message || String(err)}` },
      { status: 500 }
    )
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
      max_tokens: body.max_tokens || 1000,
      temperature: 0.7,
    }),
  })

  const data = await response.json()

  if (!response.ok) {
    const errMsg = data?.error?.message || JSON.stringify(data)
    return NextResponse.json(
      { error: `Groq API error ${response.status}: ${errMsg}` },
      { status: response.status }
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
      maxOutputTokens: body.max_tokens || 1000,
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
    const errMsg = data?.error?.message || JSON.stringify(data)
    return NextResponse.json(
      { error: `Gemini API error ${response.status}: ${errMsg}` },
      { status: response.status }
    )
  }

  const text =
    data?.candidates?.[0]?.content?.parts?.[0]?.text ||
    data?.candidates?.[0]?.output ||
    '(no response)'

  return NextResponse.json({ content: [{ type: 'text', text }] })
}
