/**
 * lib/db.ts — Compatibility stub (Phase 12)
 * 
 * This file was the original localStorage database helper.
 * It has been replaced by lib/supabase.ts for all server-side operations.
 * 
 * Many pages still import from @/lib/db — this stub provides the same
 * function signatures so the build doesn't break while pages are updated
 * to use their respective /api/* routes directly.
 * 
 * DO NOT add new code here. Pages should import from @/lib/supabase.ts
 * or call API routes directly.
 */

// Re-export Supabase helpers so existing imports don't break
export { dbSelect, dbInsert, dbUpdate, dbDelete, sb } from '@/lib/supabase'

// ── Legacy function stubs ──────────────────────────────────────────────────
// These were localStorage-based. They now return empty data.
// Pages that call these should be updated to use /api/* routes instead.

export function getDb(): Record<string, any> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = localStorage.getItem('dyeflow_db')
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}

export function saveDb(_db: Record<string, any>): void {
  // No-op: Supabase is the source of truth now
  console.warn('[lib/db] saveDb() called — this is a no-op. Use API routes instead.')
}

// ── Entity helpers (stubs — pages should use /api/* routes) ───────────────

export async function getOrders(): Promise<any[]> {
  try {
    const res  = await fetch('/api/orders?limit=500', { cache: 'no-store' })
    const data = await res.json()
    return data.data || []
  } catch { return [] }
}

export async function getSupervisors(): Promise<any[]> {
  try {
    const res  = await fetch('/api/supervisors', { cache: 'no-store' })
    const data = await res.json()
    return data.data || []
  } catch { return [] }
}

export async function getMachines(): Promise<any[]> {
  try {
    const res  = await fetch('/api/machines', { cache: 'no-store' })
    const data = await res.json()
    return data.data || []
  } catch { return [] }
}

export async function getBatches(orderId?: string): Promise<any[]> {
  try {
    const url  = orderId ? `/api/batches?order_id=${orderId}` : '/api/batches?limit=5000'
    const res  = await fetch(url, { cache: 'no-store' })
    const data = await res.json()
    return data.data || []
  } catch { return [] }
}

export async function assignSupervisor(orderId: string, supervisorId: string): Promise<boolean> {
  try {
    const res  = await fetch('/api/orders', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ action: 'assign_supervisor', id: orderId, supervisor_id: supervisorId }),
    })
    const data = await res.json()
    return data.ok === true
  } catch { return false }
}

export async function updateOrderStatus(orderId: string, status: string, holdReason?: string): Promise<boolean> {
  try {
    const res  = await fetch('/api/orders', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ action: 'update_status', id: orderId, status, hold_reason: holdReason }),
    })
    const data = await res.json()
    return data.ok === true
  } catch { return false }
}

export async function createOrder(order: Record<string, any>): Promise<any | null> {
  try {
    const res  = await fetch('/api/orders', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ action: 'create', ...order }),
    })
    const data = await res.json()
    return data.ok ? data.data : null
  } catch { return null }
}

export async function updateOrder(id: string, patch: Record<string, any>): Promise<boolean> {
  try {
    const res  = await fetch('/api/orders', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ action: 'update', id, ...patch }),
    })
    const data = await res.json()
    return data.ok === true
  } catch { return false }
}

export async function deleteOrder(id: string): Promise<boolean> {
  try {
    const res  = await fetch('/api/orders', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ action: 'delete', id }),
    })
    const data = await res.json()
    return data.ok === true
  } catch { return false }
}
