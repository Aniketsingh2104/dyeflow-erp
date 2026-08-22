import { NextRequest, NextResponse } from 'next/server'
import { embedText, chatOllama, OllamaError, OLLAMA_BASE_URL, EMBED_MODEL, CHAT_MODEL } from '@/lib/rag/ollama'
import { sb } from '@/lib/supabase'
import { getLiveSnapshot, getTargetedContext } from '@/lib/rag/liveContext'

// ── app/api/ai/rag — RAG-powered DyeFlow AI Assistant query route ───────────
// POST { question: string, history?: {role:'user'|'assistant', content:string}[] }
// → { content: [{type:'text', text}], sources: [...], model, embed_model }
//
// Pipeline:
//   1. Embed the question (Ollama nomic-embed-text)
//   2. Vector-search lib/rag knowledge_chunks via the match_knowledge_chunks RPC
//   3. Pull live Supabase data — a compact always-on snapshot, plus a
//      question-aware targeted deep dive (order lookup, faulty/fob/repair
//      detail, delay detection — see lib/rag/liveContext.ts)
//   4. Build a grounded prompt and call chatOllama() (llama3.2 / mistral)
//
// Requires Ollama running with both models pulled:
//   ollama pull nomic-embed-text
//   ollama pull llama3.2        (or: ollama pull mistral, then set
//                                 OLLAMA_CHAT_MODEL=mistral in .env.local)

const SYSTEM_PROMPT = `You are the DyeFlow ERP AI Assistant, embedded in a textile dyeing factory's management system.

Ground every answer in the KNOWLEDGE BASE and LIVE FACTORY DATA sections provided in the prompt — both are authoritative and current as of right now. Do not invent process codes, table names, order numbers, statuses, or rules that aren't in them.

If the live data doesn't contain what's needed to answer precisely, say so plainly rather than guessing. Keep answers concise and factory-floor practical — this is read by supervisors and staff, not developers. When you reference a specific order or batch, use its exact code from the data provided.`

interface RagChunk {
  id: string
  content: string
  category: string
  source: string
  similarity: number
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
        `3. Pull the models: ollama pull ${EMBED_MODEL}  and  ollama pull ${CHAT_MODEL}`,
      ],
    },
    { status: 503 }
  )
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const question: string = (body?.question ?? body?.message ?? '').toString()
    const history: { role: 'user' | 'assistant'; content: string }[] = Array.isArray(body?.history) ? body.history : []

    if (!question.trim()) {
      return NextResponse.json({ error: 'question (string) is required' }, { status: 400 })
    }

    // 1) Embed the question
    const questionVector = await embedText(question)
    const embeddingLiteral = `[${questionVector.join(',')}]`

    // 2) Vector search the static knowledge base (graceful degradation if it fails)
    const { data: rpcChunks, error: rpcError } = await sb<RagChunk[]>('/rpc/match_knowledge_chunks', {
      method: 'POST',
      body: JSON.stringify({
        query_embedding: embeddingLiteral,
        match_threshold: 0.3,
        match_count: 6,
        filter_category: null,
      }),
    })
    const knowledgeChunks = rpcChunks || []

    // 3) Live Supabase data — always a compact snapshot, plus a question-aware deep dive
    const [snapshot, targeted] = await Promise.all([getLiveSnapshot(), getTargetedContext(question)])

    // 4) Build the grounded prompt
    const knowledgeBlock =
      knowledgeChunks.length > 0
        ? knowledgeChunks.map((c) => `[${c.source}] (similarity ${c.similarity.toFixed(2)})\n${c.content}`).join('\n\n')
        : '(no closely matching knowledge base entries found)'

    const historyBlock =
      history.length > 0
        ? '\n\nPREVIOUS CONVERSATION:\n' + history.map((h) => `${h.role === 'user' ? 'User' : 'Assistant'}: ${h.content}`).join('\n')
        : ''

    const prompt = `KNOWLEDGE BASE (DyeFlow process/rules reference):
${knowledgeBlock}

LIVE FACTORY DATA:
${snapshot}${targeted ? '\n\n' + targeted : ''}${historyBlock}

QUESTION: ${question}`

    // 5) Call Ollama
    const answer = await chatOllama({ system: SYSTEM_PROMPT, prompt, temperature: 0.25 })

    return NextResponse.json({
      content: [{ type: 'text', text: answer || '(no response)' }],
      sources: knowledgeChunks.map((c) => ({ source: c.source, category: c.category, similarity: c.similarity })),
      model: CHAT_MODEL,
      embed_model: EMBED_MODEL,
      knowledge_rpc_error: rpcError || undefined,
    })
  } catch (err: any) {
    if (err instanceof OllamaError) return ollamaErrorResponse(err)
    return NextResponse.json({ error: `Server error: ${err?.message || String(err)}` }, { status: 500 })
  }
}
