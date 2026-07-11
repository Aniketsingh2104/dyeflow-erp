/**
 * lib/db.ts — Typed client helpers for DyeFlow API routes
 * Use these in page components instead of direct localStorage reads.
 *
 * Every function returns { data, error } — never throws.
 */

// ── Generic fetcher ─────────────────────────────────────────────────────────

async function api<T = any>(
  path: string,
  body?: Record<string, any>
): Promise<{ data: T | null; error: string | null }> {
  try {
    const res = await fetch(path, {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    })
    const json = await res.json()
    if (!json.ok) return { data: null, error: json.error || `HTTP ${res.status}` }
    return { data: json.data ?? null, error: null }
  } catch (err: any) {
    return { data: null, error: err?.message || 'Network error' }
  }
}

// ── Current user ─────────────────────────────────────────────────────────────

export function getCurrentUser(): { id: string; username: string; role: string } | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem('dyeflow_session')
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

// ── Orders ───────────────────────────────────────────────────────────────────

export async function getOrders(params: {
  status?: string; supervisor_id?: string; party?: string; limit?: number
} = {}) {
  const qs = new URLSearchParams()
  if (params.status)        qs.set('status', params.status)
  if (params.supervisor_id) qs.set('supervisor_id', params.supervisor_id)
  if (params.party)         qs.set('party', params.party)
  if (params.limit)         qs.set('limit', String(params.limit))
  return api(`/api/orders${qs.toString() ? '?' + qs : ''}`)
}

export async function createOrder(order: Record<string, any>) {
  const user = getCurrentUser()
  return api('/api/orders', { action: 'create', _user: user?.username, ...order })
}

export async function updateOrder(id: string, patch: Record<string, any>) {
  const user = getCurrentUser()
  return api('/api/orders', { action: 'update', _user: user?.username, id, ...patch })
}

export async function deleteOrder(id: string) {
  return api('/api/orders', { action: 'delete', id })
}

export async function assignSupervisor(orderId: string, supervisorId: string) {
  const user = getCurrentUser()
  return api('/api/orders', {
    action: 'assign_supervisor', _user: user?.username,
    id: orderId, supervisor_id: supervisorId,
  })
}

export async function updateOrderStatus(
  orderId: string, status: string, holdReason?: string
) {
  const user = getCurrentUser()
  return api('/api/orders', {
    action: 'update_status', _user: user?.username,
    id: orderId, status, hold_reason: holdReason,
  })
}

export async function bulkUpdateOrders(ids: string[], patch: Record<string, any>) {
  const user = getCurrentUser()
  return api('/api/orders', { action: 'bulk_update', _user: user?.username, ids, patch })
}

// ── Batches ──────────────────────────────────────────────────────────────────

export async function getBatches(params: {
  order_id?: string; machine_id?: string; batch_id?: string; status?: string
} = {}) {
  const qs = new URLSearchParams()
  if (params.order_id)   qs.set('order_id',   params.order_id)
  if (params.machine_id) qs.set('machine_id', params.machine_id)
  if (params.batch_id)   qs.set('batch_id',   params.batch_id)
  if (params.status)     qs.set('status',     params.status)
  return api(`/api/batches${qs.toString() ? '?' + qs : ''}`)
}

export async function createSplits(
  orderId: string,
  batches: Array<{ batch_id: string; kg: number; machine_id?: string }>,
  processRoute: string[]
) {
  const user = getCurrentUser()
  return api('/api/batches', {
    action: 'create_splits', _user: user?.username,
    order_id: orderId, batches, process_route: processRoute,
  })
}

export async function updateBatch(id: string, patch: Record<string, any>) {
  const user = getCurrentUser()
  return api('/api/batches', { action: 'update', _user: user?.username, id, ...patch })
}

export async function markProcessDone(
  batchId: string, processCode: string, nextProcess?: string
) {
  const user = getCurrentUser()
  return api('/api/batches', {
    action: 'process_done', _user: user?.username,
    batch_id: batchId, process_code: processCode, next_process: nextProcess,
  })
}

export async function markBatchFaulty(params: {
  batch_id: string; order_id: string; order_number: string; party: string;
  faulty_type: string; faulty_kg: number; process_code: string
}) {
  const user = getCurrentUser()
  return api('/api/batches', { action: 'mark_faulty', _user: user?.username, ...params })
}

// ── Machines ─────────────────────────────────────────────────────────────────

export async function getMachines() {
  return api('/api/machines')
}

export async function createMachine(machine: Record<string, any>) {
  return api('/api/machines', { action: 'create', ...machine })
}

export async function updateMachine(id: string, patch: Record<string, any>) {
  return api('/api/machines', { action: 'update', id, ...patch })
}

export async function deleteMachine(id: string) {
  return api('/api/machines', { action: 'delete', id })
}

// ── Supervisors ──────────────────────────────────────────────────────────────

export async function getSupervisors() {
  return api('/api/supervisors')
}

export async function createSupervisor(sup: Record<string, any>) {
  return api('/api/supervisors', { action: 'create', ...sup })
}

export async function updateSupervisor(id: string, patch: Record<string, any>) {
  return api('/api/supervisors', { action: 'update', id, ...patch })
}

export async function deleteSupervisor(id: string) {
  return api('/api/supervisors', { action: 'delete', id })
}

// ── Masters ──────────────────────────────────────────────────────────────────

export async function getMasterTable(table: string) {
  return api(`/api/masters?table=${table}`)
}

export async function upsertMasterRow(table: string, row: Record<string, any>) {
  return api('/api/masters', { table, action: 'upsert', ...row })
}

export async function updateMasterRow(table: string, idOrKey: string, patch: Record<string, any>) {
  const isKey = table === 'factory_settings'
  return api('/api/masters', {
    table, action: 'update',
    ...(isKey ? { key: idOrKey } : { id: idOrKey }),
    ...patch,
  })
}

export async function deleteMasterRow(table: string, id: string) {
  return api('/api/masters', { table, action: 'delete', id })
}

// ── Process list ─────────────────────────────────────────────────────────────

export async function getProcessList() {
  return getMasterTable('process_list')
}

// ── Customers ────────────────────────────────────────────────────────────────

export async function getCustomers() {
  return getMasterTable('customers')
}

// ── Holidays ─────────────────────────────────────────────────────────────────

export async function getHolidays() {
  return getMasterTable('holidays')
}
