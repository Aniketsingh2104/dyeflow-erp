'use client'

import { useEffect, useState, useCallback } from 'react'

interface AuditEntry {
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

const ACTION_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  status_change:  { label: 'Status Change',  color: '#185FA5', bg: '#E6F1FB' },
  edit:           { label: 'Edit',            color: '#3C3489', bg: '#EEEDFE' },
  approve:        { label: 'Approved',        color: '#1D9E75', bg: '#E1F5EE' },
  reject:         { label: 'Rejected',        color: '#A32D2D', bg: '#FCEBEB' },
  faulty_mark:    { label: 'Faulty Marked',   color: '#633806', bg: '#FAEEDA' },
  faulty_resolve: { label: 'Faulty Resolved', color: '#1D9E75', bg: '#E1F5EE' },
  faulty_update:  { label: 'Faulty Update',   color: '#633806', bg: '#FAEEDA' },
  delete:         { label: 'Deleted',         color: '#A32D2D', bg: '#FCEBEB' },
  create:         { label: 'Created',         color: '#1D9E75', bg: '#E1F5EE' },
  import:         { label: 'Imported',        color: '#3C3489', bg: '#EEEDFE' },
  assign:         { label: 'Assigned',        color: '#185FA5', bg: '#E6F1FB' },
  split:          { label: 'Split',           color: '#3C3489', bg: '#EEEDFE' },
  process_done:   { label: 'Process Done',    color: '#1D9E75', bg: '#E1F5EE' },
  default:        { label: 'Action',          color: '#888780', bg: '#F1EFE8' },
}

function ActionBadge({ action }: { action: string }) {
  const cfg = ACTION_LABELS[action] || ACTION_LABELS.default
  return (
    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 12,
      background: cfg.bg, color: cfg.color, whiteSpace: 'nowrap' }}>
      {cfg.label}
    </span>
  )
}

function fmtTs(ts: string) {
  if (!ts) return '-'
  try {
    return new Date(ts).toLocaleString('en-GB', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    })
  } catch { return ts }
}

export default function AuditLogPage() {
  const [entries,      setEntries]      = useState<AuditEntry[]>([])
  const [loading,      setLoading]      = useState(true)
  const [search,       setSearch]       = useState('')
  const [filterAction, setFilterAction] = useState('all')
  const [filterEntity, setFilterEntity] = useState('all')
  const [clearing,     setClearing]     = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await fetch('/api/audit?limit=2000', { cache: 'no-store' })
      const data = await res.json()
      if (data.ok) {
        setEntries(data.data.map((e: any) => ({
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
        })))
      }
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = entries.filter(e => {
    if (filterAction !== 'all' && e.action !== filterAction) return false
    if (filterEntity !== 'all' && e.entityType !== filterEntity) return false
    if (search.trim()) {
      const s = search.toLowerCase()
      return (
        (e.entityId  || '').toLowerCase().includes(s) ||
        (e.user      || '').toLowerCase().includes(s) ||
        (e.note      || '').toLowerCase().includes(s) ||
        (e.newValue  || '').toLowerCase().includes(s) ||
        (e.oldValue  || '').toLowerCase().includes(s) ||
        (e.field     || '').toLowerCase().includes(s)
      )
    }
    return true
  })

  const uniqueActions  = [...new Set(entries.map(e => e.action))]
  const uniqueEntities = [...new Set(entries.map(e => e.entityType))]

  const clearLog = async () => {
    if (!confirm('Clear the entire audit log? This cannot be undone.')) return
    setClearing(true)
    try {
      await fetch('/api/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'clear' }),
      })
      setEntries([])
    } finally { setClearing(false) }
  }

  return (
    <div className="content" style={{ padding: '16px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div>
          <span style={{ fontSize: 16, fontWeight: 700 }}>Audit Log</span>
          <span style={{ fontSize: 12, color: 'var(--text-tertiary)', marginLeft: 10 }}>
            {filtered.length} of {entries.length} entries
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="small" onClick={load} disabled={loading}>
            {loading ? '…' : '⟳ Refresh'}
          </button>
          <button className="small danger" onClick={clearLog} disabled={clearing}>
            {clearing ? 'Clearing…' : 'Clear Log'}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <input type="text" placeholder="Search by entity, user, value…"
          value={search} onChange={e => setSearch(e.target.value)}
          style={{ flex: '1 1 200px', maxWidth: 320, padding: '6px 10px', fontSize: 12,
            border: '1px solid var(--border-medium)', borderRadius: 5,
            background: 'var(--bg-primary)', color: 'var(--text-primary)' }} />
        <select value={filterAction} onChange={e => setFilterAction(e.target.value)}
          style={{ padding: '6px 10px', fontSize: 12, border: '1px solid var(--border-medium)',
            borderRadius: 5, background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
          <option value="all">All Actions</option>
          {uniqueActions.map(a => (
            <option key={a} value={a}>{ACTION_LABELS[a]?.label || a}</option>
          ))}
        </select>
        <select value={filterEntity} onChange={e => setFilterEntity(e.target.value)}
          style={{ padding: '6px 10px', fontSize: 12, border: '1px solid var(--border-medium)',
            borderRadius: 5, background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
          <option value="all">All Entities</option>
          {uniqueEntities.map(e => <option key={e} value={e}>{e}</option>)}
        </select>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-tertiary)', fontSize: 14 }}>
          Loading audit log…
        </div>
      ) : entries.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>📋</div>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>No audit entries yet</div>
          <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
            Audit entries are created automatically when orders change status, batches are processed, or faulty items are logged.
          </div>
        </div>
      ) : (
        <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)',
          borderRadius: 10, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
            <thead style={{ background: 'var(--bg-secondary)', position: 'sticky', top: 0, zIndex: 5 }}>
              <tr>
                {['Timestamp','User','Action','Entity','ID','Field','Old Value','New Value','Note'].map(h => (
                  <th key={h} style={{ padding: '9px 10px', textAlign: 'left', fontSize: 10,
                    fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase',
                    letterSpacing: '0.05em', borderBottom: '1px solid var(--border-light)',
                    whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={9} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-tertiary)' }}>
                  No entries match your filters.
                </td></tr>
              ) : (
                filtered.map((e, i) => (
                  <tr key={e.id} style={{
                    background: i % 2 === 0 ? 'var(--bg-primary)' : 'var(--bg-secondary)',
                    borderBottom: '1px solid var(--border-light)' }}>
                    <td style={{ ...td, fontSize: 10, color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>{fmtTs(e.timestamp)}</td>
                    <td style={{ ...td, fontWeight: 500 }}>{e.user}</td>
                    <td style={td}><ActionBadge action={e.action} /></td>
                    <td style={{ ...td, fontSize: 11, color: 'var(--text-secondary)', textTransform: 'capitalize' }}>{e.entityType}</td>
                    <td style={{ ...td, fontWeight: 600, color: 'var(--accent)' }}>{e.entityId}</td>
                    <td style={{ ...td, fontSize: 11, color: 'var(--text-tertiary)' }}>{e.field || '-'}</td>
                    <td style={{ ...td, fontSize: 11, color: 'var(--danger)', maxWidth: 140,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      title={e.oldValue}>{e.oldValue || '-'}</td>
                    <td style={{ ...td, fontSize: 11, color: 'var(--success)', maxWidth: 140,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      title={e.newValue}>{e.newValue || '-'}</td>
                    <td style={{ ...td, fontSize: 11, color: 'var(--text-secondary)', maxWidth: 200,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      title={e.note}>{e.note || '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

const td: React.CSSProperties = { padding: '9px 10px', fontSize: 12, color: 'var(--text-primary)' }
