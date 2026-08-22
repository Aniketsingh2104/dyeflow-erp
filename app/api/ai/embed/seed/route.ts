import { NextRequest, NextResponse } from 'next/server'
import { embedTexts, OllamaError, OLLAMA_BASE_URL, EMBED_MODEL } from '@/lib/rag/ollama'
import { dbUpsert } from '@/lib/supabase'
import knowledgeChunksJson from '@/lib/rag/knowledge_chunks.json'

// ── app/api/ai/embed/seed — one-time knowledge base seeding job ─────────────
// Embeds every chunk in lib/rag/knowledge_chunks.json via Ollama
// (nomic-embed-text) and upserts them into Supabase `knowledge_chunks`
// (on_conflict = source), so it's safe to re-run any time the JSON changes.
//
// Run locally (Ollama must be reachable from this machine):
//   npm run dev
//   then visit http://localhost:2903/api/ai/embed/seed in a browser,
//   or:  curl -X POST http://localhost:2903/api/ai/embed/seed
//
// This does NOT work from the live Vercel deployment — see lib/rag/ollama.ts
// for why (Ollama is local-only unless tunneled).

type Chunk = { category: string; source: string; content: string }

interface SeedResult {
  source: string
  status: 'ok' | 'error'
  error?: string
}

async function runSeed(): Promise<SeedResult[]> {
  const chunks = knowledgeChunksJson as Chunk[]
  const BATCH_SIZE = 10
  const results: SeedResult[] = []

  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE)

    // If Ollama itself is unreachable, embedTexts throws — let it propagate
    // rather than recording every remaining chunk as a separate failure.
    const vectors = await embedTexts(batch.map((c) => c.content))

    for (let j = 0; j < batch.length; j++) {
      const chunk = batch[j]
      const vector = vectors[j]
      // pgvector text input format is exactly "[v1,v2,...]" — sending it as a
      // JSON *string* (not a raw JSON array) ensures Postgres binds it as
      // unknown/text and casts it via vector_in() on the target column.
      const embeddingLiteral = `[${vector.join(',')}]`

      const { error } = await dbUpsert(
        'knowledge_chunks',
        {
          category: chunk.category,
          source: chunk.source,
          content: chunk.content,
          embedding: embeddingLiteral,
        },
        'source'
      )
      results.push({ source: chunk.source, status: error ? 'error' : 'ok', error: error || undefined })
    }
  }

  return results
}

function ollamaErrorResponse(err: OllamaError) {
  return NextResponse.json(
    {
      error: err.message,
      hint: err.hint === '__NOT_FOUND__' ? undefined : err.hint,
      ollama_url: OLLAMA_BASE_URL,
      setup: [
        '1. Install Ollama: https://ollama.com',
        '2. Start it (usually runs automatically, or: ollama serve)',
        `3. Pull the embedding model: ollama pull ${EMBED_MODEL}`,
      ],
    },
    { status: 503 }
  )
}

export async function POST(_req: NextRequest) {
  try {
    const results = await runSeed()
    const failed = results.filter((r) => r.status === 'error')
    return NextResponse.json(
      {
        total: results.length,
        succeeded: results.length - failed.length,
        failed: failed.length,
        failures: failed.length > 0 ? failed : undefined,
      },
      { status: failed.length > 0 ? 207 : 200 }
    )
  } catch (err: any) {
    if (err instanceof OllamaError) return ollamaErrorResponse(err)
    return NextResponse.json({ error: `Server error: ${err?.message || String(err)}` }, { status: 500 })
  }
}

// Allow triggering with a plain browser visit too — this is a manual/dev-only
// maintenance action, not a public API endpoint.
export async function GET(req: NextRequest) {
  return POST(req)
}
