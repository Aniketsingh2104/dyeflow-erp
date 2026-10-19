import { NextRequest, NextResponse } from 'next/server'
import { guard } from '@/lib/access'
import { embedText, embedTexts, OllamaError, EMBED_MODEL } from '@/lib/rag/ollama'
import { EMBED_MAX_TEXTS, EMBED_MAX_CHARS } from '@/lib/aiGuard'

// ── app/api/ai/embed — generic Ollama embedding endpoint ────────────────────
// POST { text: string }    → { embedding: number[], model, dims }
// POST { texts: string[] } → { embeddings: number[][], model, dims }
// GET                      → health check (is Ollama reachable + model pulled)
//
// Used by app/api/ai/rag/route.ts to embed the user's question before vector
// search, and can be called directly for one-off embedding needs.
//
// Requires Ollama running locally with the embedding model pulled:
//   ollama pull nomic-embed-text
// (override model via OLLAMA_EMBED_MODEL, and endpoint via OLLAMA_BASE_URL
// in .env.local if not using the defaults)

function ollamaErrorResponse(err: OllamaError) {
  return NextResponse.json(
    {
      error: err.message,
      hint: err.hint === '__NOT_FOUND__' ? undefined : err.hint,
      setup: [
        '1. Install Ollama: https://ollama.com',
        '2. Start it (usually runs automatically, or: ollama serve)',
        `3. Pull the embedding model: ollama pull ${EMBED_MODEL}`,
      ],
    },
    { status: 503 }
  )
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    { const g = await guard(req, 'ai-embed', 'POST'); if (g.deny) return g.deny }

    if (Array.isArray(body?.texts)) {
      const texts: string[] = body.texts.filter((t: any) => typeof t === 'string' && t.trim())
      if (texts.length === 0) {
        return NextResponse.json({ error: 'texts must be a non-empty array of strings' }, { status: 400 })
      }
      if (texts.length > EMBED_MAX_TEXTS || texts.some(t => t.length > EMBED_MAX_CHARS)) {
        return NextResponse.json({ error: `At most ${EMBED_MAX_TEXTS} texts of ${EMBED_MAX_CHARS} characters each.` }, { status: 413 })
      }
      const embeddings = await embedTexts(texts)
      return NextResponse.json({ embeddings, model: EMBED_MODEL, dims: embeddings[0]?.length ?? 0 })
    }

    const text = body?.text
    if (typeof text !== 'string' || !text.trim()) {
      return NextResponse.json({ error: 'text (string) is required' }, { status: 400 })
    }
    if (text.length > EMBED_MAX_CHARS) {
      return NextResponse.json({ error: `Text is longer than ${EMBED_MAX_CHARS} characters.` }, { status: 413 })
    }
    const embedding = await embedText(text)
    return NextResponse.json({ embedding, model: EMBED_MODEL, dims: embedding.length })
  } catch (err: any) {
    if (err instanceof OllamaError) return ollamaErrorResponse(err)
    console.error('[/api/ai/embed] error:', err)
    return NextResponse.json({ error: 'Embedding failed — try again.' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  { const g = await guard(req, 'ai-embed', 'GET'); if (g.deny) return g.deny }
  try {
    const embedding = await embedText('healthcheck')
    return NextResponse.json({ ok: true, model: EMBED_MODEL, dims: embedding.length })
  } catch (err: any) {
    if (err instanceof OllamaError) {
      const res = ollamaErrorResponse(err)
      const json = await res.json()
      return NextResponse.json({ ok: false, ...json }, { status: 503 })
    }
    console.error('[/api/ai/embed] health check error:', err)
    return NextResponse.json({ ok: false, error: 'Embedding service check failed.' }, { status: 500 })
  }
}
