'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'

interface RouteStep { processCode: string; name: string }
interface RouteTemplate { id: string; name: string; steps: RouteStep[] }
interface ProcessDef { id: string; code: string; name: string; is_enabled: boolean; display_order: number }

const persistTemplates = async (templates: RouteTemplate[]) => {
  await fetch('/api/setup/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: 'processRouteMaster', value: templates }),
  })
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem('dyeflow_db')
      const db  = raw ? JSON.parse(raw) : {}
      db.processRouteMaster = templates
      localStorage.setItem('dyeflow_db', JSON.stringify(db))
    } catch {}
  }
}

export default function ProcessRouteMasterPage() {
  const [templates,    setTemplates]    = useState<RouteTemplate[]>([])
  const [processList,  setProcessList]  = useState<ProcessDef[]>([])
  const [articleMap,   setArticleMap]   = useState<Record<string, string[]>>({})
  const [loading,      setLoading]      = useState(true)
  const [showModal,    setShowModal]    = useState(false)
  const [editingId,    setEditingId]    = useState<string|null>(null)
  const [formName,     setFormName]     = useState('')
  const [formRoute,    setFormRoute]    = useState<string[]>([])
  const [saved,        setSaved]        = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [tRes, pRes, aRes] = await Promise.all([
      fetch('/api/setup/settings?key=processRouteMaster', { cache: 'no-store' }).then(r => r.json()),
      fetch('/api/processes', { cache: 'no-store' }).then(r => r.json()),
      fetch('/api/setup/settings?key=articleSupervisorMap', { cache: 'no-store' }).then(r => r.json()),
    ])
    setTemplates(Array.isArray(tRes.value) ? tRes.value : [])
    setProcessList((pRes.data || []).filter((p: ProcessDef) => p.is_enabled).sort((a: ProcessDef, b: ProcessDef) => a.display_order - b.display_order))
    // For article→process map: load from articleProcessMap setting key
    const amRes = await fetch('/api/setup/settings?key=articleProcessMap', { cache: 'no-store' }).then(r => r.json())
    setArticleMap((amRes.ok && amRes.value && typeof amRes.value === 'object') ? amRes.value : {})
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const flash = () => { setSaved(true); setTimeout(() => setSaved(false), 1500) }

  const openNew = () => { setEditingId(null); setFormName(''); setFormRoute([]); setShowModal(true) }

  const openEdit = (t: RouteTemplate) => {
    setEditingId(t.id)
    setFormName(t.name)
    setFormRoute((t.steps || []).map(s => s.processCode))
    setShowModal(true)
  }

  const toggleProcess = (code: string) => {
    setFormRoute(prev => prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code])
  }

  const saveTemplate = async () => {
    if (!formName.trim()) { alert('Enter template name.'); return }
    if (formRoute.length === 0) { alert('Select at least one process.'); return }
    const procNameMap: Record<string, string> = {}
    processList.forEach(p => { procNameMap[p.code] = p.name })
    const steps = formRoute.map(code => ({ processCode: code, name: procNameMap[code] || code }))
    const updated = editingId
      ? templates.map(t => t.id === editingId ? { ...t, name: formName.trim(), steps } : t)
      : [...templates, { id: `rt-${Date.now()}`, name: formName.trim(), steps }]
    await persistTemplates(updated)
    setTemplates(updated)
    setShowModal(false)
    flash()
  }

  const deleteTemplate = async (id: string) => {
    if (!confirm('Remove this route template?')) return
    const updated = templates.filter(t => t.id !== id)
    await persistTemplates(updated)
    setTemplates(updated)
  }

  const importFromArticleMap = async () => {
    if (Object.keys(articleMap).length === 0) { alert('No article routes found.'); return }
    const procNameMap: Record<string, string> = {}
    processList.forEach(p => { procNameMap[p.code] = p.name })
    const existing = new Set(templates.map(t => (t.steps||[]).map(s => s.processCode).join('/')))
    let added = 0
    const next = [...templates]
    for (const [, codes] of Object.entries(articleMap)) {
      if (!Array.isArray(codes) || !codes.length) continue
      const key = codes.join('/')
      if (existing.has(key)) continue
      existing.add(key)
      next.push({ id: `rt-${Date.now()}-${added}`, name: key,
        steps: codes.map(c => ({ processCode: c, name: procNameMap[c] || c })) })
      added++
    }
    if (!added) { alert('All routes already exist.'); return }
    await persistTemplates(next)
    setTemplates(next)
    flash()
    alert(`✓ Imported ${added} template${added > 1 ? 's' : ''}`)
  }

  const StepBadge = ({ code, name }: { code: string; name: string }) => (
    <span title={name} style={{ background: '#E6F0FF', color: '#3366CC', padding: '3px 9px',
      borderRadius: 4, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>{code}</span>
  )

  return (
    <div className="content" style={{ maxWidth: 900, margin: '0 auto', padding: '16px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>🛤 Process Route Master</div>
          <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 2 }}>
            Create named route templates that supervisors select from a dropdown when assigning orders.
          </div>
        </div>
        <Link href="/setup"><button className="small">← Setup</button></Link>
      </div>

      {saved && (
        <div style={{ background: 'var(--success-light)', color: 'var(--success)', border: '1px solid #6EE7B7',
          borderRadius: 8, padding: '8px 14px', marginBottom: 14, fontSize: 12, fontWeight: 600 }}>✓ Saved to Supabase</div>
      )}

      <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 10, padding: '12px 16px', marginBottom: 16, fontSize: 12, color: '#1E40AF' }}>
        <strong>How it works:</strong> Templates created here appear in the Route Template dropdown on supervisor inbox pages.
        Import from Article Map to auto-create templates from existing article routes.
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <button onClick={openNew}
          style={{ padding: '9px 18px', fontSize: 13, fontWeight: 700, border: 'none', borderRadius: 7,
            background: '#185FA5', color: '#fff', cursor: 'pointer' }}>
          + New Template
        </button>
        <button onClick={importFromArticleMap}
          style={{ padding: '9px 18px', fontSize: 13, fontWeight: 600, border: '1px solid #185FA5',
            borderRadius: 7, background: '#EFF6FF', color: '#185FA5', cursor: 'pointer' }}>
          ↓ Import from Article Map ({Object.keys(articleMap).length} articles)
        </button>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-tertiary)', alignSelf: 'center' }}>
          {templates.length} template{templates.length !== 1 ? 's' : ''}
        </span>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-tertiary)' }}>Loading…</div>
      ) : templates.length === 0 ? (
        <div style={{ background: 'var(--bg-primary)', border: '2px dashed var(--border-medium)', borderRadius: 12,
          padding: 48, textAlign: 'center' }}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>🛤</div>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>No route templates yet</div>
          <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
            Click "+ New Template" to create one or import from Article Map.
          </div>
        </div>
      ) : (
        <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: 10, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead style={{ background: 'var(--bg-secondary)' }}>
              <tr>
                {['#','Template Name','Route (in order)','Steps','Actions'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 10, fontWeight: 700,
                    color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em',
                    borderBottom: '1px solid var(--border-light)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {templates.map((t, i) => (
                <tr key={t.id} style={{ background: i%2===0 ? 'var(--bg-primary)' : 'var(--bg-secondary)',
                  borderBottom: '1px solid var(--border-light)' }}>
                  <td style={{ padding: '10px 14px', color: 'var(--text-tertiary)', fontWeight: 600 }}>{i + 1}</td>
                  <td style={{ padding: '10px 14px', fontWeight: 700 }}>{t.name}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
                      {(t.steps||[]).map((s, si) => (
                        <span key={si} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <StepBadge code={s.processCode} name={s.name} />
                          {si < (t.steps||[]).length - 1 && <span style={{ color: 'var(--text-tertiary)', fontSize: 10 }}>→</span>}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'center', color: 'var(--text-secondary)' }}>{(t.steps||[]).length}</td>
                  <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                    <button onClick={() => openEdit(t)} className="xs" style={{ marginRight: 6 }}>Edit</button>
                    <button onClick={() => deleteTemplate(t.id)} className="xs danger">Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">{editingId ? 'Edit Template' : 'New Route Template'}</span>
              <button className="small" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className="form-group" style={{ marginBottom: 14 }}>
              <label>Template Name *</label>
              <input value={formName} onChange={e => setFormName(e.target.value)}
                placeholder="e.g. C/H/D/F or Dyeing + Finishing" autoFocus />
              {formRoute.length > 0 && (
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
                  Route: {formRoute.join(' → ')}
                </div>
              )}
            </div>
            <div className="form-group" style={{ marginBottom: 16 }}>
              <label>Select Processes (in order) *</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: 10,
                border: '1px solid var(--border-medium)', borderRadius: 6, maxHeight: 260, overflowY: 'auto' }}>
                {processList.length === 0 ? (
                  <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
                    No processes. Go to <Link href="/setup/process-master" style={{ color: 'var(--accent)' }}>Process Master</Link> first.
                  </div>
                ) : (
                  processList.map(proc => {
                    const checked = formRoute.includes(proc.code)
                    const pos = formRoute.indexOf(proc.code)
                    return (
                      <label key={proc.code} style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer',
                        padding: '5px 10px', border: `1px solid ${checked ? 'var(--accent)' : 'var(--border-light)'}`,
                        borderRadius: 5, fontSize: 13, userSelect: 'none',
                        background: checked ? 'var(--accent-light)' : 'transparent', position: 'relative' }}>
                        {checked && <span style={{ position: 'absolute', top: -6, right: -4, background: 'var(--accent)',
                          color: '#fff', borderRadius: '50%', width: 14, height: 14, fontSize: 9,
                          display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>{pos + 1}</span>}
                        <input type="checkbox" checked={checked} onChange={() => toggleProcess(proc.code)} style={{ width: 'auto' }} />
                        <strong>{proc.code}</strong>
                        <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>{proc.name}</span>
                      </label>
                    )
                  })
                )}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowModal(false)}>Cancel</button>
              <button className="primary" onClick={saveTemplate}
                disabled={!formName.trim() || formRoute.length === 0}>
                {editingId ? 'Save Changes' : 'Create Template'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
