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

// (logAudit() — writing audit entries from the browser — was removed:
//  every audit entry is now written by the server when the change happens.)

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
