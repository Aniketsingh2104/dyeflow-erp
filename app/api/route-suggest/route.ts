// POST /api/route-suggest  { articles: string[] }
// For each article: the process route to pre-fill on the Supervisor page and
// machines to suggest.
//   route:  Master (same article) → Master (article code at the start) →
//           history (the route this article ran most often before) → none
//   machines (by process): from history — "LJET-22" is matched to the
//           machine "Long Tube Jet No. 22" (same type, same number)
// Read-only, staff.
import { NextRequest, NextResponse } from 'next/server'
import { guard } from '@/lib/access'
import { dbSelect, dbSelectAll } from '@/lib/supabase'
import { articleKey, matchMaster, MasterRule } from '@/lib/articleMatch'
import { canonicalCode } from '@/lib/processCodes'
import { workRoute, routeHasQa } from '@/lib/routeTail'

let masterCache: { at: number; rules: Map<string, MasterRule> } | null = null
async function masterRules(): Promise<Map<string, MasterRule>> {
  if (masterCache && Date.now() - masterCache.at < 60_000) return masterCache.rules
  const { data, error } = await dbSelectAll<any>('article_process_routes', { order: 'updated_at.desc' }, 'article,route,qa_required')
  if (error) throw new Error(error)
  const rules = new Map<string, MasterRule>()
  for (const r of data || []) {
    const raw = Array.isArray(r.route) ? r.route : String(r.route || '').split('/')
    const route = workRoute(raw)
    const k = articleKey(r.article)
    if (k && route.length && !rules.has(k)) rules.set(k, { article: r.article, route, qa: !!r.qa_required || routeHasQa(raw) })   // newest first
  }
  masterCache = { at: Date.now(), rules }
  return rules
}

const histCache = new Map<string, { at: number; v: any }>()
async function history(article: string) {
  const key = String(article || '').trim().toLowerCase()
  const hit = histCache.get(key)
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.v
  // same article, any capitals (the "*" wildcard of PostgREST is taken out)
  const { data } = await dbSelect<any>('historical_batches',
    { article: `ilike.${String(article).trim().replace(/\*/g, '_')}`, order: 'created_at.desc', limit: '500' },
    'process_route,dyeing_machine,scq_machine')
  const rows = data || []
  const top = (vals: string[]) => {
    const n: Record<string, number> = {}
    for (const v of vals) if (v) n[v] = (n[v] || 0) + 1
    const best = Object.entries(n).sort((a, b) => b[1] - a[1])[0]
    return best ? { value: best[0], count: best[1] } : null
  }
  const route = top(rows.map((r: any) => String(r.process_route || '').trim()))
  const v = {
    route: route ? { codes: workRoute(route.value.split('/')), count: route.count } : null,
    dyeing: top(rows.map((r: any) => String(r.dyeing_machine || '').trim()))?.value || null,
    scq:    top(rows.map((r: any) => String(r.scq_machine || '').trim()))?.value || null,
  }
  histCache.set(key, { at: Date.now(), v })
  return v
}

// "LJET-22" / "Athena - 1 (500kg)" / "Krishna-1" → the machine of that type and number
function resolveMachine(name: string | null, machines: any[]): string | null {
  if (!name) return null
  const clean = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()
  const exact = machines.find(m => clean(m.name || '') === clean(name))
  if (exact) return exact.name
  const m = name.match(/^\s*([a-z]+)\s*-?\s*(\d+)/i)
  if (!m) return null
  const type = m[1].toLowerCase(), num = parseInt(m[2], 10)
  const firstNum = (s: string) => { const x = s.replace(/\([^)]*\)/g, '').match(/(\d+)/); return x ? parseInt(x[1], 10) : NaN }
  const hit = machines.find(mc => String(mc.machine_type || '').toLowerCase() === type && firstNum(mc.name || '') === num)
  return hit?.name || null
}

export async function POST(req: NextRequest) {
  { const g = await guard(req, 'route-suggest', 'POST'); if (g.deny) return g.deny }
  const body = await req.json().catch(() => ({}))
  const articles: string[] = [...new Set<string>((Array.isArray(body?.articles) ? body.articles : [])
    .filter((a: any) => typeof a === 'string' && a.trim()).map((a: string) => a.trim()))].slice(0, 400)
  if (!articles.length) return NextResponse.json({ ok: true, data: {} })
  try {
    const rules = await masterRules()
    const { data: machines } = await dbSelect<any>('machines', { order: 'name.asc' }, 'id,name,machine_type,is_active')
    const active = (machines || []).filter((m: any) => m.is_active !== false)
    const out: Record<string, any> = {}
    for (let i = 0; i < articles.length; i += 10) {
      await Promise.all(articles.slice(i, i + 10).map(async a => {
        const hist = await history(a)
        const m = matchMaster(a, rules)
        const machinesBy: Record<string, string> = {}
        const d = resolveMachine(hist.dyeing, active); if (d) machinesBy.D = d
        const s = resolveMachine(hist.scq, active); if (s) { machinesBy.S = s; machinesBy.S2 = s }
        out[a] = m
          ? { route: m.rule.route, qa: !!m.rule.qa, source: m.how, matched: m.rule.article, count: 0, machines: machinesBy }
          : hist.route?.codes.length
            ? { route: hist.route.codes, qa: false, source: 'history', matched: a, count: hist.route.count, machines: machinesBy }
            : { route: null, qa: false, source: null, matched: null, count: 0, machines: machinesBy }
      }))
    }
    return NextResponse.json({ ok: true, data: out })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message || 'Could not work out the routes' }, { status: 500 })
  }
}
