// Future Requirement (Colour Store IMS): how much of each colour / chemical
// the open orders still need.
//   recipe qty = kg per 1 kg of fabric ("0.005" = 5 g per kg; "0.5%" = 0.005;
//                "5 g" / "5 g/l" = 0.005)
//   requirement kg = Σ qty × remaining dyeing kg
// An order counts while its route has Dyeing (D) and that dyeing is not
// finished: order kg minus the kg of its batches that already passed D.
// Recipes come from the Recipe page (lab_recipes, by Lab No.) and from lab
// requests (fms_data.recipe, by Approved Lab No.).
import { dbSelectAll } from '@/lib/supabase'
import { canonicalCode } from '@/lib/processCodes'
import { isBatchFinished } from '@/lib/batchStatus'

export interface FutureLine { kg: number; orders: { order_number: string; kg: number; lab_no: string }[] }
export interface FutureResult {
  byName: Record<string, FutureLine>          // key: chemical name, trimmed lower-case
  unmatchedNames: string[]                    // recipe names not in the Colour Chemical Master
  unparsedQty: { lab_no: string; name: string; qty: string }[]
  orders: number                              // open dyeing orders with a recipe
}

/** kg of chemical per 1 kg of fabric: "0.005" → 0.005 · "0.5%" → 0.005 · "5 g" / "5 g/l" / "5gm" → 0.005 · "abc" → null */
export function perKg(qty: any): number | null {
  const s = String(qty ?? '').trim().toLowerCase()
  const m = s.match(/-?\d+(\.\d+)?/)
  if (!m) return null
  const n = parseFloat(m[0])
  if (!isFinite(n) || n < 0) return null
  if (/%/.test(s)) return n / 100
  if (/\d\s*(g|gm|gms|gram|grams)\b/.test(s) && !/\d\s*kg\b/.test(s)) return n / 1000
  return n
}

const key = (v: any) => String(v ?? '').trim().toLowerCase()
const labKey = (v: any) => String(v ?? '').replace(/\s+/g, ' ').trim().toUpperCase()

export async function computeFutureRequirement(masterNames: string[]): Promise<FutureResult> {
  const master = new Set(masterNames.map(key))
  const [recRes, reqRes, ordRes] = await Promise.all([
    dbSelectAll<any>('lab_recipes', {}, 'lab_no,recipe'),
    dbSelectAll<any>('lab_requests', { 'fms_data->>labDecision': 'eq.approved' }, 'id,fms_data'),
    dbSelectAll<any>('orders', { status: 'neq.done', lab_no: 'not.is.null', process_route: 'cs.{D}' }, 'id,order_number,qty_kg,lab_no,status'),
  ])
  // recipes by Lab No. (manual first; a lab-request recipe fills in only when there is no manual one)
  const recipes: Record<string, { name: string; qty: string }[]> = {}
  for (const r of recRes.data || []) if (r.lab_no && Array.isArray(r.recipe) && r.recipe.length) recipes[labKey(r.lab_no)] = r.recipe
  for (const r of reqRes.data || []) {
    const ln = labKey(r.fms_data?.approvedLabNumber), list = r.fms_data?.recipe
    if (ln && Array.isArray(list) && list.length && !recipes[ln]) recipes[ln] = list
  }
  const orders = (ordRes.data || []).filter((o: any) => recipes[labKey(o.lab_no)])
  const out: FutureResult = { byName: {}, unmatchedNames: [], unparsedQty: [], orders: 0 }
  if (!orders.length) return out

  // kg of each order that already passed Dyeing (batches with D done, or finished)
  const ids = orders.map((o: any) => o.id)
  const doneKg: Record<string, number> = {}
  for (let i = 0; i < ids.length; i += 100) {
    const { data: bs } = await dbSelectAll<any>('batches', { order_id: `in.(${ids.slice(i, i + 100).join(',')})` },
      'id,order_id,kg,status,is_done,batch_processes(process_code,status,done_at)')
    for (const b of bs || []) {
      const dDone = isBatchFinished(b) || (b.batch_processes || []).some((p: any) => canonicalCode(p.process_code) === 'D' && (p.status === 'done' || p.done_at))
      if (dDone) doneKg[b.order_id] = (doneKg[b.order_id] || 0) + (parseFloat(b.kg) || 0)
    }
  }
  const unmatched = new Set<string>(), unparsedSeen = new Set<string>()
  for (const o of orders) {
    const remaining = Math.max(0, (parseFloat(o.qty_kg) || 0) - (doneKg[o.id] || 0))
    if (remaining <= 0) continue
    out.orders++
    const ln = labKey(o.lab_no)
    for (const ing of recipes[ln]) {
      const name = String(ing?.name ?? '').trim()
      if (!name) continue
      const g = perKg(ing.qty)
      if (g == null) { const k = `${ln}|${name}`; if (!unparsedSeen.has(k)) { unparsedSeen.add(k); out.unparsedQty.push({ lab_no: ln, name, qty: String(ing.qty ?? '') }) }; continue }
      const nk = key(name)
      if (!master.has(nk)) { unmatched.add(name); continue }
      const kg = Math.round(g * remaining * 1000) / 1000
      const line = out.byName[nk] || (out.byName[nk] = { kg: 0, orders: [] })
      line.kg = Math.round((line.kg + kg) * 1000) / 1000
      line.orders.push({ order_number: o.order_number, kg: Math.round(remaining * 100) / 100, lab_no: ln })
    }
  }
  out.unmatchedNames = [...unmatched].sort()
  return out
}
