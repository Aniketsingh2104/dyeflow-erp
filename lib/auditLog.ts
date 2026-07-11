/**
 * Audit Trail — logs every meaningful change to Supabase audit_log table.
 * Also writes to localStorage for backward compatibility with local libs.
 */

export interface AuditEntry {
  id: string
  timestamp: string        // ISO string (maps to created_at)
  user: string
  action: string
  entityType: string
  entityId: string
  field?: string
  oldValue?: string
  newValue?: string
  note?: string
}

/**
 * Log an audit entry. Writes to Supabase via API (fire-and-forget).
 * Also keeps localStorage copy for local context builders.
 */
export function logAudit(entry: Omit<AuditEntry, 'id' | 'timestamp' | 'user'>): void {
  if (typeof window === 'undefined') return
  try {
    const raw = localStorage.getItem('dyeflow_db')
    const db  = raw ? JSON.parse(raw) : {}
    const activeUser: string = db.activeUser || db.currentUser || 'System'

    const id = `AL-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`
    const timestamp = new Date().toISOString()

    const newEntry: AuditEntry = {
      id, timestamp, user: activeUser, ...entry,
    }

    // ── Write to localStorage (for dbContext / local AI tools) ──────────────
    if (!Array.isArray(db.auditLog)) db.auditLog = []
    db.auditLog.unshift(newEntry)
    if (db.auditLog.length > 2000) db.auditLog = db.auditLog.slice(0, 2000)
    localStorage.setItem('dyeflow_db', JSON.stringify(db))

    // ── Write to Supabase (fire-and-forget) ──────────────────────────────────
    fetch('/api/audit', {
      method: 'POST',
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

/** Read audit log from Supabase. Falls back to localStorage. */
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
  return readAuditLog(limit) // fallback
}

/** Synchronous read from localStorage (used by legacy code). */
export function readAuditLog(limit = 200): AuditEntry[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem('dyeflow_db')
    if (!raw) return []
    const db = JSON.parse(raw)
    return (db.auditLog || []).slice(0, limit) as AuditEntry[]
  } catch {
    return []
  }
}
