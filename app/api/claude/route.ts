import { NextRequest, NextResponse } from 'next/server'

// ── Server-side proxy for Anthropic API ──────────────────────────────────────
// This runs on the Next.js server, never in the browser.
// - No CORS issues (server-to-server call)
// - API key is kept server-side and never exposed to the client
// - Set ANTHROPIC_API_KEY in .env.local

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY

    if (!apiKey) {
      return NextResponse.json(
        { error: 'ANTHROPIC_API_KEY is not set. Add it to .env.local as:\nANTHROPIC_API_KEY=sk-ant-...' },
        { status: 500 }
      )
    }

    const body = await req.json()

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':            'application/json',
        'x-api-key':               apiKey,
        'anthropic-version':       '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(body),
    })

    const data = await response.json()

    if (!response.ok) {
      return NextResponse.json(
        { error: `Anthropic API error ${response.status}: ${JSON.stringify(data)}` },
        { status: response.status }
      )
    }

    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json(
      { error: `Server error: ${err?.message || String(err)}` },
      { status: 500 }
    )
  }
}
