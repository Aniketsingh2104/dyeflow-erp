/**
 * Audit Trail — logs every meaningful change to db.auditLog[]
 *
 * Each entry records: who, what changed, old value, new value, when, and which entity.
 * Call logAudit() anywhere a status/value change is saved to localStorage.
 */

export interface AuditEntry {
  id: string
  timestamp: string        // ISO string
  user: string             // from db.activeUser or 'System'
  action: string           // e.g. 'status_change', 'edit', 'approve', 'faulty_mark'
  entityType: string       // 'order' | 'batch' | 'supervisor' | 'process' | 'machine'
  entityId: string         // orderNumber, batchId, etc.
  field?: string           // which field changed (optional)
  oldValue?: string        // previous value (optional)
  newValue?: string        // new value
  note?: string            // free-text context
}

/**
 * Append one audit entry to db.auditLog[].
 * Keeps the last 2000 entries to prevent unbounded growth.
 * Call only from client-side code (useEffect / event handlers).
 */
export function logAudit(entry: Omit<AuditEntry, 'id' | 'timestamp' | 'user'>): void {
  if (typeof window === 'undefined') return
  try {
    const raw = localStorage.getItem('dyeflow_db')
    const db = raw ? JSON.parse(raw) : {}

    // Resolve current user
    const activeUser: string = db.activeUser || db.currentUser || 'System'

    if (!Array.isArray(db.auditLog)) db.auditLog = []

    const newEntry: AuditEntry = {
      id: `AL-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      timestamp: new Date().toISOString(),
      user: activeUser,
      ...entry,
    }

    db.auditLog.unshift(newEntry)          // newest first
    if (db.auditLog.length > 2000) db.auditLog = db.auditLog.slice(0, 2000)

    localStorage.setItem('dyeflow_db', JSON.stringify(db))
  } catch {
    // Never throw — audit logging must never crash the app
  }
}

/** Read the audit log (newest first). Safe to call even if log is missing. */
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
