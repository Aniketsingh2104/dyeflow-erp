import { NextRequest, NextResponse } from 'next/server'

// ── app/api/ollama-relay/[...path] — secret-gated proxy to local Ollama ─────
// Lets the LIVE Vercel deployment reach Ollama running on this PC, without
// ever exposing Ollama itself to the public internet.
//
// This route only does anything useful when reached via the Cloudflare
// tunnel (ollama.ginzaapp.in) while the app is running LOCALLY (npm run lan).
// The copy of this same route that gets deployed to Vercel is inert — Vercel
// can't reach localhost:11434 either, so it will always fail with "cannot
// reach local Ollama", which is expected and harmless.
//
// Security: every request must carry the exact OLLAMA_RELAY_SECRET value in
// the X-Ollama-Relay-Secret header, or it's rejected. If OLLAMA_RELAY_SECRET
// isn't set, this route refuses everything outright — it never silently
// runs as an open relay just because someone forgot to configure a secret.

const RELAY_SECRET = process.env.OLLAMA_RELAY_SECRET
const OLLAMA_LOCAL_URL = 'http://localhost:11434'

export async function POST(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  if (!RELAY_SECRET) {
    return NextResponse.json(
      { error: 'Relay not configured (OLLAMA_RELAY_SECRET not set) — refusing to run as an open relay' },
      { status: 503 }
    )
  }

  const provided = req.headers.get('x-ollama-relay-secret')
  if (provided !== RELAY_SECRET) {
    return NextResponse.json({ error: 'Invalid or missing relay secret' }, { status: 401 })
  }

  const { path } = await params
  const targetPath = '/' + (path || []).join('/')
  const body = await req.text()

  try {
    const res = await fetch(`${OLLAMA_LOCAL_URL}${targetPath}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    })
    const text = await res.text()
    return new NextResponse(text, {
      status: res.status,
      headers: { 'Content-Type': res.headers.get('Content-Type') || 'application/json' },
    })
  } catch (err: any) {
    return NextResponse.json({ error: `Cannot reach local Ollama: ${err?.message || String(err)}` }, { status: 503 })
  }
}
