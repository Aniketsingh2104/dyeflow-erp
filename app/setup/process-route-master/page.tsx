'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { loadOrSeedProcessList, ProcessDef } from '@/lib/processMap'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface RouteStep {
  processCode: string
  name: string
}

interface RouteTemplate {
  id: string
  name: string           // human label, e.g. "Dyeing + Finishing"
  steps: RouteStep[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function loadTemplates(): RouteTemplate[] {
  try {
    const raw = localStorage.getItem('dyeflow_db')
    if (!raw) return []
    const db = JSON.parse(raw)
    return Array.isArray(db.processRouteMaster) ? db.processRouteMaster : []
  } catch { return [] }
}

function saveTemplates(templates: RouteTemplate[]) {
  const raw = localStorage.getItem('dyeflow_db')
  const db = raw ? JSON.parse(raw) : {}
  db.processRouteMaster = templates
  localStorage.setItem('dyeflow_db', JSON.stringify(db))
  window.dispatchEvent(new Event('dyeflow-db-updated'))
}

function loadArticleProcessMap(): Record<string, string[]> {
  try {
    const raw = localStorage.getItem('dyeflow_db')
    if (!raw) return {}
    const db = JSON.parse(raw)
    return db.articleProcessMap || {}
  } catch { return {} }
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function ProcessRouteMasterPage() {
  const [templates, setTemplates] = useState<RouteTemplate[]>([])
  const [processList, setProcessList] = useState<ProcessDef[]>([])
  const [articleMap, setArticleMap] = useState<Record<string, string[]>>({})

  // Modal state
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formName, setFormName] = useState('')
  const [formRoute, setFormRoute] = useState<string[]>([])

  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setTemplates(loadTemplates())
    setProcessList(loadOrSeedProcessList().filter(p => p.enabled).sort((a, b) => a.order - b.order))
    setArticleMap(loadArticleProcessMap())
  }, [])

  const flash = () => { setSaved(true); setTimeout(() => setSaved(false), 1500) }

  // ── CRUD ───────────────────────────────────────────────────────────────────

  const openNew = () => {
    setEditingId(null)
    setFormName('')
    setFormRoute([])
    setShowModal(true)
  }

  const openEdit = (t: RouteTemplate) => {
    setEditingId(t.id)
    setFormName(t.name)
    setFormRoute((t.steps || []).map(s => s.processCode))
    setShowModal(true)
  }

  const closeModal = () => { setShowModal(false); setEditingId(null) }

  const toggleProcess = (code: string) => {
    setFormRoute(prev =>
      prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]
    )
  }

  const saveTemplate = () => {
    if (!formName.trim()) { alert('Please enter a template name.'); return }
    if (formRoute.length === 0) { alert('Please select at least one process.'); return }

    const procNameMap: Record<string, string> = {}
    processList.forEach(p => { procNameMap[p.code] = p.name })

    const steps: RouteStep[] = formRoute.map(code => ({
      processCode: code,
      name: procNameMap[code] || code,
    }))

    const next = editingId
      ? templates.map(t => t.id === editingId ? { ...t, name: formName.trim(), steps } : t)
      : [...templates, { id: `rt-${Date.now()}`, name: formName.trim(), steps }]

    setTemplates(next)
    saveTemplates(next)
    closeModal()
    flash()
  }

  const deleteTemplate = (id: string) => {
    if (!confirm('Remove this route template?')) return
    const next = templates.filter(t => t.id !== id)
    setTemplates(next)
    saveTemplates(next)
  }

  // Import routes from articleProcessMap as named templates
  const importFromArticleMap = () => {
    if (Object.keys(articleMap).length === 0) {
      alert('No article routes found. Go to Setup → Process & Machine Map to add routes first.')
      return
    }

    const procNameMap: Record<string, string> = {}
    processList.forEach(p => { procNameMap[p.code] = p.name })

    const existing = new Set(templates.map(t => (t.steps || []).map(s => s.processCode).join('/')))
    let added = 0

    const next = [...templates]
    for (const [article, codes] of Object.entries(articleMap)) {
      if (!Array.isArray(codes) || codes.length === 0) continue
      const key = codes.join('/')
      if (existing.has(key)) continue
      existing.add(key)
      next.push({
        id: `rt-${Date.now()}-${added}`,
        name: key,   // use route string as name; user can rename
        steps: codes.map(code => ({ processCode: code, name: procNameMap[code] || code })),
      })
      added++
    }

    if (added === 0) {
      alert('All article routes already exist as templates.')
      return
    }

    setTemplates(next)
    saveTemplates(next)
    flash()
    alert(`✓ Imported ${added} route template${added > 1 ? 's' : ''} from Article Process Map.`)
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const StepBadge = ({ code, name }: { code: string; name: string }) => (
    <span title={name} style={{
      background: '#E6F0FF', color: '#3366CC', padding: '3px 9px', borderRadius: 4,
      fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
    }}>{code}</span>
  )

  return (
    <div className="content" style={{ maxWidth: 900, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)' }}>🛤 Process Route Master</div>
          <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 2 }}>
            Create named route templates (e.g. C/H/D/F) that supervisors select from a dropdown when assigning orders.
          </div>
        </div>
        <Link href="/setup"><button className="small">← Setup</button></Link>
      </div>

      {saved && (
        <div style={{ background: '#D1FAE5', color: '#065F46', border: '1px solid #6EE7B7', borderRadius: 8, padding: '8px 14px', marginBottom: 14, fontSize: 12, fontWeight: 600 }}>
          ✓ Templates saved
        </div>
      )}

      {/* Info banner */}
      <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 10, padding: '12px 16px', marginBottom: 18, fontSize: 12, color: '#1E40AF' }}>
        <strong>How it works:</strong> Templates created here appear in the <strong>Route Template dropdown</strong> on each supervisor's inbox page (under "ROUTE TEMPLATE &amp; MACHINES" column). If you already have routes in <strong>Process &amp; Machine Map</strong>, click "Import from Article Map" to auto-create templates from them — supervisors will then see those routes in the dropdown immediately.
      </div>

      {/* Action bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <button
          onClick={openNew}
          style={{ padding: '9px 18px', fontSize: 13, fontWeight: 700, border: 'none', borderRadius: 7, background: '#185FA5', color: '#fff', cursor: 'pointer' }}
        >
          + New Template
        </button>
        <button
          onClick={importFromArticleMap}
          style={{ padding: '9px 18px', fontSize: 13, fontWeight: 600, border: '1px solid #185FA5', borderRadius: 7, background: '#EFF6FF', color: '#185FA5', cursor: 'pointer' }}
          title="Import unique routes from Process & Machine Map as templates"
        >
          ↓ Import from Article Map ({Object.keys(articleMap).length} articles)
        </button>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-tertiary)', alignSelf: 'center' }}>
          {templates.length} template{templates.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Templates list */}
      {templates.length === 0 ? (
        <div style={{ background: 'var(--bg-primary)', border: '2px dashed var(--border-medium)', borderRadius: 12, padding: '48px', textAlign: 'center' }}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>🛤</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>No route templates yet</div>
          <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 16 }}>
            Click "+ New Template" to create one, or use "Import from Article Map" to pull in existing routes.
          </div>
          {Object.keys(articleMap).length > 0 && (
            <button onClick={importFromArticleMap}
              style={{ padding: '8px 20px', fontSize: 13, fontWeight: 600, border: 'none', borderRadius: 7, background: '#185FA5', color: '#fff', cursor: 'pointer' }}>
              ↓ Import {Object.keys(articleMap).length} routes from Article Map
            </button>
          )}
        </div>
      ) : (
        <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--bg-secondary)' }}>
                {['#', 'Template Name', 'Route (processes in order)', 'Steps', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border-light)', whiteSpace: 'nowrap' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {templates.map((t, i) => (
                <tr key={t.id} style={{ borderBottom: i < templates.length - 1 ? '1px solid var(--border-light)' : 'none', background: i % 2 === 0 ? 'var(--bg-primary)' : 'var(--bg-secondary)' }}>
                  <td style={{ padding: '10px 14px', color: 'var(--text-tertiary)', fontWeight: 600 }}>{i + 1}</td>
                  <td style={{ padding: '10px 14px', fontWeight: 700, color: 'var(--text-primary)' }}>{t.name}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
                      {(t.steps || []).map((s, si) => (
                        <span key={si} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <StepBadge code={s.processCode} name={s.name} />
                          {si < (t.steps || []).length - 1 && <span style={{ color: 'var(--text-tertiary)', fontSize: 10 }}>→</span>}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td style={{ padding: '10px 14px', color: 'var(--text-secondary)', textAlign: 'center' }}>{(t.steps || []).length}</td>
                  <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                    <button onClick={() => openEdit(t)} style={{ padding: '4px 12px', fontSize: 11, border: '1px solid var(--border-medium)', borderRadius: 4, background: 'var(--bg-primary)', cursor: 'pointer', marginRight: 6 }}>Edit</button>
                    <button onClick={() => deleteTemplate(t.id)} style={{ padding: '4px 12px', fontSize: 11, border: '1px solid #FCA5A5', borderRadius: 4, background: '#FEF2F2', color: '#DC2626', cursor: 'pointer', fontWeight: 600 }}>Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">{editingId ? 'Edit Template' : 'New Route Template'}</span>
              <button className="small" onClick={closeModal}>✕</button>
            </div>

            <div className="form-group" style={{ marginBottom: 14 }}>
              <label>Template Name *</label>
              <input
                value={formName}
                onChange={e => setFormName(e.target.value)}
                placeholder="e.g. C/H/D/F or Dyeing + Finishing"
                autoFocus
              />
              {formRoute.length > 0 && (
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
                  Route: {formRoute.join(' → ')}
                </div>
              )}
            </div>

            <div className="form-group" style={{ marginBottom: 16 }}>
              <label>Select Processes (in order) *</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '10px', border: '1px solid var(--border-medium)', borderRadius: 6, maxHeight: 280, overflowY: 'auto' }}>
                {processList.length === 0 ? (
                  <div style={{ fontSize: 13, color: 'var(--text-tertiary)', padding: '8px' }}>
                    No processes configured. Go to{' '}
                    <Link href="/setup/process-master" style={{ color: 'var(--accent)' }}>Process Master</Link> first.
                  </div>
                ) : (
                  processList.map(proc => {
                    const checked = formRoute.includes(proc.code)
                    const pos = formRoute.indexOf(proc.code)
                    return (
                      <label key={proc.code} style={{
                        display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer',
                        padding: '5px 10px', border: `1px solid ${checked ? 'var(--accent)' : 'var(--border-light)'}`,
                        borderRadius: 5, fontSize: 13, userSelect: 'none',
                        background: checked ? 'var(--accent-light)' : 'transparent',
                        position: 'relative',
                      }}>
                        {checked && pos >= 0 && (
                          <span style={{ position: 'absolute', top: -6, right: -4, background: 'var(--accent)', color: '#fff', borderRadius: '50%', width: 14, height: 14, fontSize: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
                            {pos + 1}
                          </span>
                        )}
                        <input type="checkbox" checked={checked} onChange={() => toggleProcess(proc.code)} style={{ width: 'auto' }} />
                        <strong>{proc.code}</strong>
                        <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>{proc.name}</span>
                      </label>
                    )
                  })
                )}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 6 }}>
                Numbers show the order. To reorder: uncheck and re-check in the desired sequence.
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={closeModal}>Cancel</button>
              <button
                className="primary"
                onClick={saveTemplate}
                disabled={!formName.trim() || formRoute.length === 0}
              >
                {editingId ? 'Save Changes' : 'Create Template'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
