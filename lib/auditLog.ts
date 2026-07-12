/**
 * Audit Trail — logs every meaningful change to Supabase audit_log table.
 * Phase 12: localStorage dual-write removed. All reads and writes go to Supabase.
 */

export interface AuditEntry {
  id: string
  timestamp: string
  user: string
  action: string
  entityType: string
  entityId: string
  field?: string
  oldValue?: string
  newValue?: string
  note?: string
}

/** Get current logged-in username from session (Supabase-backed since Phase 11) */
function getActiveUsername(): string {
  if (typeof window === 'undefined') return 'System'
  try {
    const raw = localStorage.getItem('dyeflow_session')
    if (!raw) return 'System'
    return JSON.parse(raw)?.username || 'System'
  } catch { return 'System' }
}

/**
 * Log an audit entry to Supabase via /api/audit (fire-and-forget).
 * Never throws — audit failures must not crash the app.
 */
export function logAudit(entry: Omit<AuditEntry, 'id' | 'timestamp' | 'user'>): void {
  if (typeof window === 'undefined') return
  try {
    const id         = `AL-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`
    const activeUser = getActiveUsername()

    fetch('/api/audit', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action:      'log',
        id,
        user:        activeUser,
        action_type: entry.action,
        entity_type: entry.entityType,
        entity_id:   entry.entityId,
        field:       entry.field,
        old_value:   entry.oldValue,
        new_value:   entry.newValue,
        note:        entry.note,
      }),
    }).catch(() => {}) // never throw

  } catch {
    // Never crash the app on audit failure
  }
}

/** Read audit log from Supabase. */
export async function readAuditLogAsync(limit = 500): Promise<AuditEntry[]> {
  try {
    const res  = await fetch(`/api/audit?limit=${limit}`, { cache: 'no-store' })
    const data = await res.json()
    if (data.ok && Array.isArray(data.data)) {
      return data.data.map((e: any) => ({
        id:         e.id,
        timestamp:  e.created_at,
        user:       e.user,
        action:     e.action,
        entityType: e.entity_type,
        entityId:   e.entity_id,
        field:      e.field,
        oldValue:   e.old_value,
        newValue:   e.new_value,
        note:       e.note,
      }))
    }
  } catch {}
  return []
}

/**
 * Synchronous read — kept for any legacy callers.
 * Returns empty array since localStorage is no longer written.
 */
export function readAuditLog(_limit = 200): AuditEntry[] {
  return []
}
