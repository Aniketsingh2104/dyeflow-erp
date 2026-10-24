/**
 * lib/supervisorAssign.ts — Article → Supervisor Map lookups (server only).
 *
 * The map stores the supervisor NAME per article. Matching ignores case,
 * spaces and symbols (lib/labNo.ts rule) after dropping bracket notes, so
 * "30 CT X 40 LY S/J" on an order matches "30CT X 40LY S/J" in the map.
 *
 * assignUnassignedOrders() back-fills open orders that have no supervisor —
 * run after a mapping is saved / imported, and from the Orders page button.
 * It never changes an order that already has a supervisor.
 */
import { dbSelect, dbSelectAll, dbUpdate, auditLog } from '@/lib/supabase'
import { articleForMaster } from '@/lib/articleMatch'
import { labNoKey } from '@/lib/labNo'

/** loose key: bracket notes dropped, then letters + digits only, upper-case */
export function supMapKey(article: string | null | undefined): string {
  return labNoKey(articleForMaster(article))
}

/** { looseKey → supervisor name } for the whole map (exact spelling wins over a loose match) */
export async function loadSupervisorMap(): Promise<{ exact: Map<string, string>; loose: Map<string, string> }> {
  const { data } = await dbSelectAll('article_supervisor_map', { order: 'article.asc' }, 'article,supervisor')
  const exact = new Map<string, string>(), loose = new Map<string, string>()
  for (const r of (data || []) as any[]) {
    const sup = String(r.supervisor || '').trim(); if (!sup) continue
    exact.set(String(r.article || '').trim().toLowerCase(), sup)
    const k = supMapKey(r.article); if (k && !loose.has(k)) loose.set(k, sup)
  }
  return { exact, loose }
}

export function supervisorNameFor(article: string | null | undefined, map: { exact: Map<string, string>; loose: Map<string, string> }): string | null {
  const a = String(article || '').trim(); if (!a) return null
  return map.exact.get(a.toLowerCase()) || map.loose.get(supMapKey(a)) || null
}

/** supervisors.name → id */
export async function loadSupervisorIds(): Promise<Map<string, string>> {
  const { data } = await dbSelectAll('supervisors', {}, 'id,name')
  const m = new Map<string, string>()
  for (const s of (data || []) as any[]) m.set(String(s.name || '').trim().toLowerCase(), s.id)
  return m
}

/** supervisor UUID for an article, or null */
export async function lookupSupervisorId(article: string): Promise<string | null> {
  if (!article) return null
  try {
    const map = await loadSupervisorMap()
    const name = supervisorNameFor(article, map); if (!name) return null
    const ids = await loadSupervisorIds()
    return ids.get(name.toLowerCase()) || null
  } catch { return null }
}

export interface AssignResult { assigned: number; checked: number; noMatch: number; unknownSupervisor: string[]; orders: { order_number: string; article: string; supervisor: string }[] }

/**
 * Give every open order without a supervisor the one from the map.
 * status 'new' → 'assigned' (same as at order creation); hold / other statuses keep their status.
 * onlyArticles: limit to these articles (loose keys) — used right after one mapping is saved.
 */
export async function assignUnassignedOrders(opts: { onlyArticles?: string[]; note?: string } = {}): Promise<AssignResult> {
  const res: AssignResult = { assigned: 0, checked: 0, noMatch: 0, unknownSupervisor: [], orders: [] }
  const [map, ids, ordersRes] = await Promise.all([
    loadSupervisorMap(), loadSupervisorIds(),
    dbSelectAll('orders', { supervisor_id: 'is.null', status: 'neq.done', order: 'created_at.asc' }, 'id,order_number,article,status'),
  ])
  const only = opts.onlyArticles?.length ? new Set(opts.onlyArticles.map(supMapKey).filter(Boolean)) : null
  const missing = new Set<string>()
  for (const o of (ordersRes.data || []) as any[]) {
    if (only && !only.has(supMapKey(o.article))) continue
    res.checked++
    const name = supervisorNameFor(o.article, map)
    if (!name) { res.noMatch++; continue }
    const supId = ids.get(name.toLowerCase())
    if (!supId) { missing.add(name); continue }
    const patch: Record<string, any> = { supervisor_id: supId }
    if (!o.status || o.status === 'new') patch.status = 'assigned'
    const { error } = await dbUpdate('orders', { id: o.id }, patch)
    if (error) continue
    res.assigned++
    res.orders.push({ order_number: o.order_number, article: o.article, supervisor: name })
    await auditLog({ action: 'assign', entity_type: 'order', entity_id: o.id, field: 'supervisor_id', new_value: supId,
      note: opts.note || `supervisor set from Article → Supervisor Map (${name})` })
  }
  res.unknownSupervisor = Array.from(missing)
  return res
}
