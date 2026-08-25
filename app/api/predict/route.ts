import { NextRequest, NextResponse } from 'next/server'
import {
  getLearnedDuration, getLearnedDurationBatch,
  getFaultyRisk, getFaultyRiskBatch,
  getFobRisk, getFobRiskBatch,
  getRecommendedMachine, getRecommendedRoute, getRecommendedSupervisor,
} from '@/lib/predictiveStats'

// ── app/api/predict — live statistics-based predictions (not trained ML) ────
// GET ?type=duration&processCode=D&article=A-1599
// GET ?type=faulty_risk&article=A-1599&colour=BLACK&supervisor=Kundan%20M.
// GET ?type=fob_risk&article=A-1599&colour=BLACK&supervisor=Kundan%20M.
//   -> RiskEstimate: { article, colour, riskRate, sampleSize, factoryAverageRate, confidence, basis, topReasons }
// GET ?type=machine&article=A-1599&colour=BLACK      (article required)
// GET ?type=route&article=A-1599&colour=BLACK        (article required)
// GET ?type=supervisor&article=A-1599&colour=BLACK   (article required)
//
// POST { type: 'duration_batch', pairs: [{processCode, article?}, ...] }
// POST { type: 'faulty_risk_batch', segments: [{article?, colour?, supervisor?}, ...] }
// POST { type: 'fob_risk_batch', segments: [{article?, colour?, supervisor?}, ...] }
//   -> batch variants: ONE Supabase fetch covering every pair/segment, not
//      one fetch each. Use these instead of looping the GET endpoints when
//      you need many estimates at once (e.g. Delay Predictor across every
//      active order, Faulty Analyzer across a dozen articles).
//
// See lib/predictiveStats.ts for how these are computed — live queries with
// shrinkage toward a wider average when the specific sample is thin, not a
// stored/trained model. machine/route recommendations draw on the imported
// historical_* tables only (see that file's header for why) — supervisor
// blends live + historical since names match cleanly between the two.

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const type = searchParams.get('type')
    const article = searchParams.get('article') || undefined
    const colour = searchParams.get('colour') || undefined
    const supervisor = searchParams.get('supervisor') || undefined

    if (type === 'duration') {
      const processCode = searchParams.get('processCode')
      if (!processCode) {
        return NextResponse.json({ error: 'processCode is required for type=duration' }, { status: 400 })
      }
      const result = await getLearnedDuration(processCode, article)
      return NextResponse.json(result)
    }

    if (type === 'faulty_risk') {
      const result = await getFaultyRisk(article, colour, supervisor)
      return NextResponse.json(result)
    }

    if (type === 'fob_risk') {
      const result = await getFobRisk(article, colour, supervisor)
      return NextResponse.json(result)
    }

    if (type === 'machine') {
      if (!article) return NextResponse.json({ error: 'article is required for type=machine' }, { status: 400 })
      const result = await getRecommendedMachine(article, colour)
      return NextResponse.json(result)
    }

    if (type === 'route') {
      if (!article) return NextResponse.json({ error: 'article is required for type=route' }, { status: 400 })
      const result = await getRecommendedRoute(article, colour)
      return NextResponse.json(result)
    }

    if (type === 'supervisor') {
      if (!article) return NextResponse.json({ error: 'article is required for type=supervisor' }, { status: 400 })
      const result = await getRecommendedSupervisor(article, colour)
      return NextResponse.json(result)
    }

    return NextResponse.json({ error: "type must be one of 'duration', 'faulty_risk', 'fob_risk', 'machine', 'route', 'supervisor'" }, { status: 400 })
  } catch (err: any) {
    return NextResponse.json({ error: `Server error: ${err?.message || String(err)}` }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const type = body?.type

    if (type === 'duration_batch') {
      const pairs = Array.isArray(body.pairs) ? body.pairs : []
      const results = await getLearnedDurationBatch(pairs)
      return NextResponse.json({ results })
    }

    if (type === 'faulty_risk_batch') {
      const segments = Array.isArray(body.segments) ? body.segments : []
      const results = await getFaultyRiskBatch(segments)
      return NextResponse.json({ results })
    }

    if (type === 'fob_risk_batch') {
      const segments = Array.isArray(body.segments) ? body.segments : []
      const results = await getFobRiskBatch(segments)
      return NextResponse.json({ results })
    }

    return NextResponse.json({ error: "type must be one of 'duration_batch', 'faulty_risk_batch', 'fob_risk_batch'" }, { status: 400 })
  } catch (err: any) {
    return NextResponse.json({ error: `Server error: ${err?.message || String(err)}` }, { status: 500 })
  }
}
