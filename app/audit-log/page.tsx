'use client'

import { useEffect, useState } from 'react'
import { AuditEntry, readAuditLog } from '@/lib/auditLog'

const ACTION_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  status_change:  { label: 'Status Change',  color: '#185FA5', bg: '#E6F1FB' },
  edit:           { label: 'Edit',            color: '#3C3489', bg: '#EEEDFE' },
  approve:        { label: 'Approved',        color: '#1D9E75', bg: '#E1F5EE' },
  reject:         { label: 'Rejected',        color: '#A32D2D', bg: '#FCEBEB' },
  faulty_mark:    { label: 'Faulty Marked',   color: '#633806', bg: '#FAEEDA' },
  faulty_resolve: { label: 'Faulty Resolved', color: '#1D9E75', bg: '#E1F5EE' },
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
    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 12, background: cfg.bg, color: cfg.color, whiteSpace: 'nowrap' }}>
      {cfg.label}
    </span>
  )
}

function formatTs(ts: string) {
  if (!ts) return '-'
  const d = new Date(ts)
  if (isNaN(d.getTime())) return ts
  return d.toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export default function AuditLogPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [search, setSearch] = useState('')
  const [filterAction, setFilterAction] = useState('all')
  const [filterEntity, setFilterEntity] = useState('all')

  useEffect(() => { load() }, [])

  const load = () => setEntries(readAuditLog(2000))

  const filtered = entries.filter(e => {
    if (filterAction !== 'all' && e.action !== filterAction) return false
    if (filterEntity !== 'all' && e.entityType !== filterEntity) return false
    if (search.trim()) {
      const s = search.toLowerCase()
      return (
        (e.entityId || '').toLowerCase().includes(s) ||
        (e.user || '').toLowerCase().includes(s) ||
        (e.note || '').toLowerCase().includes(s) ||
        (e.newValue || '').toLowerCase().includes(s) ||
        (e.oldValue || '').toLowerCase().includes(s) ||
        (e.field || '').toLowerCase().includes(s)
      )
    }
    return true
  })

  const uniqueActions = [...new Set(entries.map(e => e.action))]
  const uniqueEntities = [...new Set(entries.map(e => e.entityType))]

  const clearLog = () => {
    if (!confirm('Clear the entire audit log? This cannot be undone.')) return
    const raw = localStorage.getItem('dyeflow_db')
    if (!raw) return
    const db = JSON.parse(raw)
    db.auditLog = []
    localStorage.setItem('dyeflow_db', JSON.stringify(db))
    load()
  }

  return (
    <div className="content" style={{ maxWidth: 1200, margin: '0 auto' }}>
      <div className="topbar">
        <div className="topbar-title">Audit Log</div>
        <div className="topbar-actions">
          <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
            {filtered.length} of {entries.length} entries
          </span>
          <button onClick={load} className="small">↻ Refresh</button>
          <button onClick={clearLog} className="small danger">Clear Log</button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <input type="text" placeholder="Search by order, batch, user, value…" value={search} onChange={e => setSearch(e.target.value)} style={{ flex: '1 1 200px', maxWidth: 320 }} />
        <select value={filterAction} onChange={e => setFilterAction(e.target.value)} style={{ width: 160 }}>
          <option value="all">All Actions</option>
          {uniqueActions.map(a => <option key={a} value={a}>{ACTION_LABELS[a]?.label || a}</option>)}
        </select>
        <select value={filterEntity} onChange={e => setFilterEntity(e.target.value)} style={{ width: 140 }}>
          <option value="all">All Entities</option>
          {uniqueEntities.map(e => <option key={e} value={e}>{e}</option>)}
        </select>
      </div>

      {entries.length === 0 ? (
        <div className="card">
          <div className="empty-state" style={{ padding: '60px 20px' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>No audit entries yet</div>
            <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
              Audit entries are created automatically when orders change status, batches are processed, or faulty items are logged.
            </div>
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrap">
            <table style={{ minWidth: 900 }}>
              <thead>
                <tr>
                  <th style={{ width: 140 }}>TIMESTAMP</th>
                  <th style={{ width: 100 }}>USER</th>
                  <th style={{ width: 130 }}>ACTION</th>
                  <th style={{ width: 90 }}>ENTITY</th>
                  <th style={{ width: 130 }}>ID</th>
                  <th style={{ width: 110 }}>FIELD</th>
                  <th>OLD VALUE</th>
                  <th>NEW VALUE</th>
                  <th>NOTE</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={9} className="empty-state">No entries match your filters.</td></tr>
                ) : (
                  filtered.map(e => (
                    <tr key={e.id}>
                      <td style={{ fontSize: 11, color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>{formatTs(e.timestamp)}</td>
                      <td style={{ fontWeight: 500, fontSize: 12 }}>{e.user}</td>
                      <td><ActionBadge action={e.action} /></td>
                      <td style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'capitalize' }}>{e.entityType}</td>
                      <td style={{ fontWeight: 600, color: 'var(--accent)', fontSize: 12 }}>{e.entityId}</td>
                      <td style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{e.field || '-'}</td>
                      <td style={{ fontSize: 11, color: 'var(--danger)', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={e.oldValue}>{e.oldValue || '-'}</td>
                      <td style={{ fontSize: 11, color: 'var(--success)', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={e.newValue}>{e.newValue || '-'}</td>
                      <td style={{ fontSize: 11, color: 'var(--text-secondary)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={e.note}>{e.note || '-'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
