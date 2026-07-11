'use client'

import { useEffect, useState, useCallback, useRef } from 'react'

// ── Options ───────────────────────────────────────────────────────────────────
export const LAB_UNIT_OPTIONS    = ['UDHNA','CKU','EMB','EYEHOOK','WWF','VAU','Others (external)']
export const LAB_ORDER_STATUS    = ['Order in System','Order Pending','Self Development','Self Approval']
export const LAB_LIGHT_SOURCE    = ['D-65','TL-84','CWF','Other']
export const LAB_BRANCHES        = ['Delhi','Mumbai','Ludhiana','Ulhasnagar','Bangalore','Tirupur','Udhna','KDC','Kolkatta','EMB','Ahmedabad','Sadar Bazar','Tirupur Showroom','Other']
export const LAB_FASTNESS_TYPES  = ['Normal','High']

// ── API helpers ───────────────────────────────────────────────────────────────
export async function labApi(params?: Record<string, string>) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : ''
  const res = await fetch(`/api/lab${qs}`, { cache: 'no-store' })
  return res.json()
}

export async function labPost(body: Record<string, any>) {
  const res = await fetch('/api/lab', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res.json()
}

// ── Compact Stat Card ─────────────────────────────────────────────────────────
export function StatCard({ label, value, color = '#137E43', badge, borderColor }: {
  label: string; value: number | string; color?: string; badge?: string; borderColor?: string
}) {
  return (
    <div style={{ background: 'var(--bg-primary)', borderRadius: 10, padding: '14px 16px',
      border: `1px solid ${borderColor || 'var(--border-light)'}`,
      flex: '1 1 140px', minWidth: 140 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)',
        textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
      {badge && <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 4 }}>{badge}</div>}
    </div>
  )
}

// ── ID generators ─────────────────────────────────────────────────────────────
export function genIndentId(indents: any[]) {
  if (!indents.length) return 'LAB-IND-001'
  const nums = indents.map(x => parseInt(x.id?.replace(/\D/g,'') || '0')).filter(Boolean)
  return 'LAB-IND-' + String(Math.max(0,...nums) + 1).padStart(3, '0')
}

export function genRequestId(requests: any[]) {
  if (!requests.length) return 'LR-0001'
  const nums = requests.map(x => parseInt(x.id?.replace(/\D/g,'') || '0')).filter(Boolean)
  return 'LR-' + String(Math.max(0,...nums) + 1).padStart(4, '0')
}

export function genIssueId(issues: any[]) {
  if (!issues.length) return 'ISSUE-0001'
  const nums = issues.map(x => parseInt(x.id?.replace(/\D/g,'') || '0')).filter(Boolean)
  return 'ISSUE-' + String(Math.max(0,...nums) + 1).padStart(4, '0')
}

// ── Format ────────────────────────────────────────────────────────────────────
export function fmtDateTime(d: any) {
  if (!d) return '-'
  try { return new Date(d).toLocaleString('en-GB') } catch { return String(d) }
}

export function fmtDate(d: any) {
  if (!d) return '-'
  try { return new Date(d).toLocaleDateString('en-GB') } catch { return String(d) }
}

// ── Issue badge ───────────────────────────────────────────────────────────────
export function IssueBadge({ count }: { count: number }) {
  return (
    <span style={{ padding: '3px 9px', borderRadius: 4, fontSize: 11, fontWeight: 600,
      background: count > 0 ? 'var(--warning-light)' : 'var(--success-light)',
      color: count > 0 ? 'var(--warning)' : 'var(--success)' }}>
      {count > 0 ? `${count} Open` : 'No Issues'}
    </span>
  )
}

// ── Issues modal ──────────────────────────────────────────────────────────────
export function IssuesModal({ requestId, onClose, allIssues, onToggle, onAdd }: {
  requestId: string
  onClose: () => void
  allIssues: any[]
  onToggle: (id: string) => void
  onAdd: (desc: string, priority: string) => void
}) {
  const issues = allIssues.filter(i => i.request_id === requestId)
  const [desc, setDesc] = useState('')
  const [priority, setPriority] = useState('Medium')

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">Issues for {requestId}</span>
          <button className="small" onClick={onClose}>✕</button>
        </div>
        {issues.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-tertiary)', fontSize: 13 }}>
            No issues yet for this request.
          </div>
        ) : (
          <div style={{ maxHeight: 300, overflowY: 'auto', marginBottom: 16 }}>
            {issues.map(issue => (
              <div key={issue.id} style={{ background: issue.solved ? 'var(--success-light)' : 'var(--bg-secondary)',
                border: `1px solid ${issue.solved ? 'var(--success)' : 'var(--border-light)'}`,
                borderRadius: 8, padding: '10px 14px', marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)' }}>{issue.id}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4,
                      background: issue.priority === 'High' ? 'var(--danger-light)' : 'var(--warning-light)',
                      color: issue.priority === 'High' ? 'var(--danger)' : 'var(--warning)' }}>
                      {issue.priority}
                    </span>
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12 }}>
                    <input type="checkbox" checked={issue.solved}
                      onChange={() => onToggle(issue.id)}
                      style={{ accentColor: 'var(--success)', cursor: 'pointer' }} />
                    {issue.solved ? 'Solved' : 'Mark Solved'}
                  </label>
                </div>
                <div style={{ fontSize: 13 }}>{issue.description}</div>
                <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 4 }}>
                  {fmtDateTime(issue.created_at)}
                  {issue.solved_at && <span style={{ color: 'var(--success)', marginLeft: 8 }}>Solved: {fmtDate(issue.solved_at)}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
        <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Raise New Issue</div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            {['Normal','Medium','High'].map(p => (
              <button key={p} onClick={() => setPriority(p)}
                style={{ fontSize: 11, padding: '3px 10px', borderRadius: 4, cursor: 'pointer',
                  border: 'none', fontWeight: priority === p ? 700 : 400,
                  background: priority === p ? 'var(--accent)' : 'var(--bg-secondary)',
                  color: priority === p ? '#fff' : 'var(--text-secondary)' }}>
                {p}
              </button>
            ))}
          </div>
          <textarea value={desc} rows={2} onChange={e => setDesc(e.target.value)}
            placeholder="Describe the issue…"
            style={{ width: '100%', padding: '8px 10px', fontSize: 13,
              border: '1px solid var(--border-medium)', borderRadius: 6,
              background: 'var(--bg-primary)', color: 'var(--text-primary)',
              marginBottom: 8, resize: 'vertical', boxSizing: 'border-box' }} />
          <button className="primary" onClick={() => { if (desc.trim()) { onAdd(desc, priority); setDesc('') } }}>
            Raise Issue
          </button>
        </div>
      </div>
    </div>
  )
}
