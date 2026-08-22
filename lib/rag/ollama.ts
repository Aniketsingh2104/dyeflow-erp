/**
 * lib/rag/ollama.ts — Shared Ollama client for DyeFlow RAG.
 * Server-side only (uses fetch to a locally-running Ollama instance).
 * Import only in app/api/** routes — never in client components.
 *
 * Two deployment modes, both handled by the same code:
 *   - LOCAL (npm run dev/lan): OLLAMA_BASE_URL defaults to localhost:11434,
 *     calls go straight to Ollama.
 *   - VERCEL (live site): OLLAMA_BASE_URL is set in Vercel's env vars to
 *     https://ollama.ginzaapp.in/api/ollama-relay — a secret-gated proxy
 *     (app/api/ollama-relay/[...path]/route.ts) running locally, reached via
 *     Cloudflare Tunnel, which forwards to localhost:11434 on your PC.
 *     Requires OLLAMA_RELAY_SECRET set to the SAME value in both .env.local
 *     (so the relay can verify requests) and Vercel's env vars (so outgoing
 *     requests carry the right secret). Ollama itself is never exposed
 *     publicly — only this app's own relay route is, and only to holders
 *     of the secret.
 */

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434'
const EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text'
const CHAT_MODEL = process.env.OLLAMA_CHAT_MODEL || 'llama3.2'
const RELAY_SECRET = process.env.OLLAMA_RELAY_SECRET

export class OllamaError extends Error {
  hint?: string
  constructor(message: string, hint?: string) {
    super(message)
    this.name = 'OllamaError'
    this.hint = hint
  }
}

const UNREACHABLE_HINT =
  'Is Ollama running? Start it with `ollama serve` (or open the Ollama app). ' +
  'If OLLAMA_BASE_URL points at the relay (Vercel), check that the local app ' +
  'is running (`npm run lan`) and the ollama.ginzaapp.in tunnel is up.'

async function ollamaPost(path: string, body: any): Promise<any> {
  let res: Response
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (RELAY_SECRET) headers['X-Ollama-Relay-Secret'] = RELAY_SECRET
    res = await fetch(`${OLLAMA_BASE_URL}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      cache: 'no-store',
    })
  } catch {
    throw new OllamaError(`Cannot reach Ollama at ${OLLAMA_BASE_URL}${path}`, UNREACHABLE_HINT)
  }

  // Ollama returns 404 for two very different reasons, so read the raw body
  // first and only treat it as "route doesn't exist" if it ISN'T JSON —
  // a real Ollama error (e.g. missing model) always comes back as JSON.
  const rawText = await res.text()
  let json: any = null
  try { json = JSON.parse(rawText) } catch { /* not JSON */ }

  if (res.status === 404 && !json) {
    // Non-JSON 404 body (Go's default "404 page not found") — this route
    // doesn't exist on this Ollama version. Signal callers to fall back.
    throw new OllamaError(`404 at ${path}`, '__NOT_FOUND__')
  }

  if (!res.ok) {
    const msg = (json && (json.error || json.message)) || rawText || `Ollama HTTP ${res.status}`
    const missingModel = typeof msg === 'string' && /not found|no such model/i.test(msg)
    throw new OllamaError(
      msg,
      missingModel ? `Model not pulled yet. Run: ollama pull ${body.model}` : undefined
    )
  }
  return json
}

/** Embed a single string with nomic-embed-text. Returns a 768-dim vector. */
export async function embedText(text: string): Promise<number[]> {
  const [vec] = await embedTexts([text])
  return vec
}

/**
 * Embed multiple strings. Tries the modern batched /api/embed endpoint first
 * (input: string[] → embeddings: number[][]); falls back to looping the
 * older /api/embeddings endpoint (prompt: string → embedding: number[])
 * for Ollama installs that predate the batched API.
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return []

  try {
    const json = await ollamaPost('/api/embed', { model: EMBED_MODEL, input: texts })
    const embeddings = json?.embeddings
    if (!Array.isArray(embeddings) || embeddings.length !== texts.length) {
      throw new OllamaError(
        'Unexpected /api/embed response shape from Ollama',
        `Expected ${texts.length} vectors, got ${Array.isArray(embeddings) ? embeddings.length : 'none'}. ` +
          `Check that "${EMBED_MODEL}" is pulled: ollama pull ${EMBED_MODEL}`
      )
    }
    return embeddings
  } catch (err) {
    if (!(err instanceof OllamaError) || err.hint !== '__NOT_FOUND__') throw err
  }

  // Fallback: older Ollama without /api/embed — call /api/embeddings per text.
  const results: number[][] = []
  for (const text of texts) {
    const json = await ollamaPost('/api/embeddings', { model: EMBED_MODEL, prompt: text })
    const vec = json?.embedding
    if (!Array.isArray(vec)) {
      throw new OllamaError(
        'Unexpected /api/embeddings response shape from Ollama',
        `Check that "${EMBED_MODEL}" is pulled: ollama pull ${EMBED_MODEL}`
      )
    }
    results.push(vec)
  }
  return results
}

/** Non-streaming chat/completion via Ollama (used by the RAG query route, Step 3). */
export async function chatOllama(params: {
  system?: string
  prompt: string
  temperature?: number
}): Promise<string> {
  const json = await ollamaPost('/api/generate', {
    model: CHAT_MODEL,
    prompt: params.prompt,
    system: params.system,
    stream: false,
    options: { temperature: params.temperature ?? 0.3 },
  })
  return json?.response ?? ''
}

export { OLLAMA_BASE_URL, EMBED_MODEL, CHAT_MODEL }
