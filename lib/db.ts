/**
 * lib/db.ts — Compatibility stub (Phase 12)
 * All operations proxy through API routes to Supabase.
 */

export { dbSelect, dbInsert, dbUpdate, dbDelete, sb } from '@/lib/supabase'

// ── Orders ─────────────────────────────────────────────────────────────────

export async function getOrders(opts?: { limit?: number; status?: string }): Promise<{ data: any[]; error: string | null }> {
  try {
    let url = `/api/orders?limit=${opts?.limit || 500}`
    if (opts?.status) url += `&status=${opts.status}`
    const res  = await fetch(url, { cache: 'no-store' })
    const data = await res.json()
    return { data: data.data || [], error: data.error || null }
  } catch (e: any) { return { data: [], error: e.message } }
}

export async function createOrder(order: Record<string, any>): Promise<{ data: any; error: string | null }> {
  try {
    const res  = await fetch('/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'create', ...order }) })
    const data = await res.json()
    return { data: data.data || null, error: data.error || null }
  } catch (e: any) { return { data: null, error: e.message } }
}

export async function updateOrder(id: string, patch: Record<string, any>): Promise<{ error: string | null }> {
  try {
    const res  = await fetch('/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'update', id, ...patch }) })
    const data = await res.json()
    return { error: data.error || null }
  } catch (e: any) { return { error: e.message } }
}

export async function deleteOrder(id: string): Promise<{ error: string | null }> {
  try {
    const res  = await fetch('/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete', id }) })
    const data = await res.json()
    return { error: data.error || null }
  } catch (e: any) { return { error: e.message } }
}

export async function bulkUpdateOrders(ids: string[], patch: Record<string, any>): Promise<{ error: string | null }> {
  try {
    const res  = await fetch('/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'bulk_update', ids, patch }) })
    const data = await res.json()
    return { error: data.error || null }
  } catch (e: any) { return { error: e.message } }
}

export async function updateOrderStatus(id: string, status: string, holdReason?: string): Promise<{ error: string | null }> {
  try {
    const res  = await fetch('/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'update_status', id, status, hold_reason: holdReason }) })
    const data = await res.json()
    return { error: data.error || null }
  } catch (e: any) { return { error: e.message } }
}

export async function assignSupervisor(orderId: string, supervisorId: string): Promise<{ error: string | null }> {
  try {
    const res  = await fetch('/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'assign_supervisor', id: orderId, supervisor_id: supervisorId }) })
    const data = await res.json()
    return { error: data.error || null }
  } catch (e: any) { return { error: e.message } }
}

// ── Batches ────────────────────────────────────────────────────────────────

// Accepts either a string orderId or an options object
export async function getBatches(optsOrId?: string | { orderId?: string; status?: string; limit?: number }): Promise<{ data: any[]; error: string | null }> {
  try {
    let url = '/api/batches?limit=5000'
    if (typeof optsOrId === 'string') {
      url = `/api/batches?order_id=${optsOrId}`
    } else if (optsOrId && typeof optsOrId === 'object') {
      const params = new URLSearchParams()
      if (optsOrId.orderId) params.set('order_id', optsOrId.orderId)
      if (optsOrId.status)  params.set('status',   optsOrId.status)
      params.set('limit', String(optsOrId.limit || 5000))
      url = `/api/batches?${params.toString()}`
    }
    const res  = await fetch(url, { cache: 'no-store' })
    const data = await res.json()
    return { data: data.data || [], error: data.error || null }
  } catch (e: any) { return { data: [], error: e.message } }
}

export async function createSplits(orderId: string, batches: any[], processRoute: string[]): Promise<{ data: any; error: string | null }> {
  try {
    const res  = await fetch('/api/batches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'create_splits', order_id: orderId, batches, process_route: processRoute }) })
    const data = await res.json()
    return { data: data.data || null, error: data.error || null }
  } catch (e: any) { return { data: null, error: e.message } }
}

export async function markProcessDone(batchId: string, processCode: string, nextProcess?: string): Promise<{ error: string | null }> {
  try {
    const res  = await fetch('/api/batches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'process_done', batch_id: batchId, process_code: processCode, next_process: nextProcess }) })
    const data = await res.json()
    return { error: data.error || null }
  } catch (e: any) { return { error: e.message } }
}

export async function markBatchFaulty(payload: {
  batch_id: string; order_id: string; order_number: string; party: string;
  faulty_type: string; faulty_kg: number; process_code: string;
}): Promise<{ error: string | null }> {
  try {
    const res  = await fetch('/api/batches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'mark_faulty', ...payload }) })
    const data = await res.json()
    return { error: data.error || null }
  } catch (e: any) { return { error: e.message } }
}

// ── Supervisors ────────────────────────────────────────────────────────────

export async function getSupervisors(): Promise<{ data: any[]; error: string | null }> {
  try {
    const res  = await fetch('/api/supervisors', { cache: 'no-store' })
    const data = await res.json()
    return { data: data.data || [], error: data.error || null }
  } catch (e: any) { return { data: [], error: e.message } }
}

// ── Machines ───────────────────────────────────────────────────────────────

export async function getMachines(): Promise<{ data: any[]; error: string | null }> {
  try {
    const res  = await fetch('/api/machines', { cache: 'no-store' })
    const data = await res.json()
    return { data: data.data || [], error: data.error || null }
  } catch (e: any) { return { data: [], error: e.message } }
}

// ── Customers ──────────────────────────────────────────────────────────────

export async function getCustomers(): Promise<{ data: any[]; error: string | null }> {
  try {
    const res  = await fetch('/api/customers', { cache: 'no-store' })
    const data = await res.json()
    return { data: data.data || [], error: data.error || null }
  } catch (e: any) { return { data: [], error: e.message } }
}

// ── Process list ───────────────────────────────────────────────────────────

export async function getProcessList(): Promise<{ data: any[]; error: string | null }> {
  try {
    const res  = await fetch('/api/processes', { cache: 'no-store' })
    const data = await res.json()
    return { data: data.data || [], error: data.error || null }
  } catch (e: any) { return { data: [], error: e.message } }
}

// ── Auth / session ─────────────────────────────────────────────────────────

export function getCurrentUser(): { username: string; role: string } | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem('dyeflow_session')
    if (!raw) return null
    const s = JSON.parse(raw)
    return s?.username ? { username: s.username, role: s.role || 'admin' } : null
  } catch { return null }
}

// ── Legacy stubs ───────────────────────────────────────────────────────────

export function getDb(): Record<string, any> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = localStorage.getItem('dyeflow_db')
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}

export function saveDb(_db: Record<string, any>): void {
  // No-op: Supabase is the source of truth
}
