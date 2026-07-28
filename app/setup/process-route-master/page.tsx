'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'

interface RouteTemplate { id: string; name: string; route: string[]; steps: any[]; updated_at: string }
interface ProcessDef    { id: string; code: string; name: string; is_enabled: boolean; display_order: number }

export default function ProcessRouteMasterPage() {
  const [templates,   setTemplates]   = useState<RouteTemplate[]>([])
  const [processList, setProcessList] = useState<ProcessDef[]>([])
  const [articleMap,  setArticleMap]  = useState<Record<string, string[]>>({})
  const [loading,     setLoading]     = useState(true)
  const [saving,      setSaving]      = useState(false)
  const [showModal,   setShowModal]   = useState(false)
  const [editingId,   setEditingId]   = useState<string | null>(null)
  const [formName,    setFormName]    = useState('')
  const [formRoute,   setFormRoute]   = useState<string[]>([])
  const [toast,       setToast]       = useState('')

  const load = useCallback(async (showSpinner = false) => {
    if (showSpinner) setLoading(true)
    const [tRes, pRes, aRes] = await Promise.all([
      fetch('/api/route-templates', { cache: 'no-store' }).then(r => r.json()),
      fetch('/api/processes',       { cache: 'no-store' }).then(r => r.json()),
      fetch('/api/article-routes',  { cache: 'no-store' }).then(r => r.json()),
    ])
    setTemplates(tRes.data || [])
    setProcessList(
      (pRes.data || [])
        .filter((p: ProcessDef) => p.is_enabled)
        .sort((a: ProcessDef, b: ProcessDef) => a.display_order - b.display_order)
    )
    setArticleMap(aRes.map || {})
    setLoading(false)
  }, [])

  useEffect(() => { load(true) }, [load])

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2500) }

  const procNameMap: Record<string, string> = {}
  processList.forEach(p => { procNameMap[p.code] = p.name })

  const openNew = () => { setEditingId(null); setFormName(''); setFormRoute([]); setShowModal(true) }
  const openEdit = (t: RouteTemplate) => {
    setEditingId(t.id)
    setFormName(t.name)
    setFormRoute(t.route || t.steps?.map((s: any) => s.processCode) || [])
    setShowModal(true)
  }

  const toggleProcess = (code: string) =>
    setFormRoute(prev => prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code])

  // ── Save with optimistic update ──────────────────────────────────────────
  const saveTemplate = async () => {
    if (!formName.trim())  { alert('Enter a template name.'); return }
    if (!formRoute.length) { alert('Select at least one process.'); return }
    setSaving(true)

    const name   = formName.trim()
    const route  = formRoute
    const steps  = route.map(code => ({ processCode: code, name: procNameMap[code] || code }))
    const isEdit = !!editingId

    // Optimistic update — no blink
    if (isEdit) {
      setTemplates(prev => prev.map(t =>
        t.id === editingId ? { ...t, name, route, steps } : t
      ))
    } else {
      const tmpId = `tmp-${Date.now()}`
      setTemplates(prev => [...prev, { id: tmpId, name, route, steps, updated_at: new Date().toISOString() }])
    }

    setShowModal(false)
    showToast('✓ Saved')

    try {
      const res  = await fetch('/api/route-templates', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ action: isEdit ? 'update' : 'create', id: editingId, name, route, steps }),
      })
      const data = await res.json()
      if (!data.ok) {
        showToast('⚠ Save failed — refreshing')
        load(false)
      } else if (!isEdit) {
        load(false) // get real id for new item
      }
    } finally { setSaving(false) }
  }

  // ── Delete with optimistic update ────────────────────────────────────────
  const deleteTemplate = async (id: string, name: string) => {
    if (!confirm(`Remove template "${name}"?`)) return

    setTemplates(prev => prev.filter(t => t.id !== id))
    showToast('✓ Removed')

    const res  = await fetch('/api/route-templates', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ action: 'delete', id }),
    })
    const data = await res.json()
    if (!data.ok) { showToast('⚠ Delete failed — refreshing'); load(false) }
  }

  const importFromArticleMap = async () => {
    if (!Object.keys(articleMap).length) { alert('No article routes found.'); return }
    const existingKeys = new Set(templates.map(t => (t.route || []).join('/')))
    const toAdd: RouteTemplate[] = []
    for (const codes of Object.values(articleMap)) {
      if (!Array.isArray(codes) || !codes.length) continue
      const key = codes.join('/')
      if (existingKeys.has(key)) continue
      existingKeys.add(key)
      toAdd.push({
        id: `rt-${Date.now()}-${toAdd.length}`, name: codes.join('/'), route: codes,
        steps: codes.map(c => ({ processCode: c, name: procNameMap[c] || c })),
        updated_at: new Date().toISOString(),
      })
    }
    if (!toAdd.length) { alert('All routes already exist as templates.'); return }
    if (!confirm(`Import ${toAdd.length} new route template(s)?`)) return
    let done = 0
    for (const t of toAdd) {
      const res = await fetch('/api/route-templates', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create', ...t }),
      })
      if ((await res.json()).ok) done++
    }
    showToast(`✓ Imported ${done} templates`)
    load(false)
  }

  const StepBadge = ({ code, name }: { code: string; name: string }) => (
    <span title={name} style={{ background: '#E6F0FF', color: '#3366CC', padding: '3px 9px', borderRadius: 4, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>{code}</span>
  )

  return (
    <div className="content" style={{ maxWidth: 900, margin: '0 auto', padding: '16px 20px' }}>

      {toast && (
        <div style={{ position: 'fixed', top: 16, right: 20, zIndex: 9999, background: toast.startsWith('⚠') ? '#FEF3C7' : '#D1FAE5', border: `1px solid ${toast.startsWith('⚠') ? '#FCD34D' : '#6EE7B7'}`, borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, color: toast.startsWith('⚠') ? '#92400E' : '#065F46', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
          {toast}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>🛤 Process Route Master</div>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>
            <code style={{ fontSize: 11, background: 'var(--bg-secondary)', padding: '1px 6px', borderRadius: 4 }}>process_route_templates</code> · {templates.length} templates
          </div>
        </div>
        <Link href="/setup"><button className="small">← Setup</button></Link>
      </div>

      <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 12, color: '#1E40AF' }}>
        <strong>How it works:</strong> Templates appear in the Route dropdown on supervisor inbox pages.
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <button onClick={openNew} style={{ padding: '9px 18px', fontSize: 13, fontWeight: 700, border: 'none', borderRadius: 7, background: '#185FA5', color: '#fff', cursor: 'pointer' }}>
          + New Template
        </button>
        <button onClick={importFromArticleMap} style={{ padding: '9px 18px', fontSize: 13, fontWeight: 600, border: '1px solid #185FA5', borderRadius: 7, background: '#EFF6FF', color: '#185FA5', cursor: 'pointer' }}>
          ↓ Import from Article Map ({Object.keys(articleMap).length} articles)
        </button>
        <button className="small" onClick={() => load(false)}>↻</button>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-tertiary)', alignSelf: 'center' }}>
          {templates.length} templates
        </span>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-tertiary)' }}>Loading…</div>
      ) : templates.length === 0 ? (
        <div style={{ background: 'var(--bg-primary)', border: '2px dashed var(--border-medium)', borderRadius: 12, padding: 48, textAlign: 'center' }}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>🛤</div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>No route templates yet</div>
        </div>
      ) : (
        <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: 10, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead style={{ background: 'var(--bg-secondary)' }}>
              <tr>
                {['#', 'Template Name', 'Route (in order)', 'Steps', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border-light)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {templates.map((t, i) => {
                const route = t.route || t.steps?.map((s: any) => s.processCode) || []
                const steps = t.steps || route.map((c: string) => ({ processCode: c, name: procNameMap[c] || c }))
                return (
                  <tr key={t.id} style={{ background: i % 2 === 0 ? 'var(--bg-primary)' : 'var(--bg-secondary)', borderBottom: '1px solid var(--border-light)' }}>
                    <td style={{ padding: '10px 14px', color: 'var(--text-tertiary)', fontWeight: 600 }}>{i + 1}</td>
                    <td style={{ padding: '10px 14px', fontWeight: 700 }}>{t.name}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
                        {steps.map((s: any, si: number) => (
                          <span key={si} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <StepBadge code={s.processCode} name={s.name} />
                            {si < steps.length - 1 && <span style={{ color: 'var(--text-tertiary)', fontSize: 10 }}>→</span>}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'center', color: 'var(--text-secondary)' }}>{steps.length}</td>
                    <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                      <button className="xs" style={{ marginRight: 6 }} onClick={() => openEdit(t)}>Edit</button>
                      <button className="xs danger" onClick={() => deleteTemplate(t.id, t.name)}>Remove</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div style={{ padding: '8px 14px', borderTop: '1px solid var(--border-light)', fontSize: 11, color: 'var(--text-tertiary)' }}>
            {templates.length} templates · process_route_templates · Supabase
          </div>
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
              <input value={formName} onChange={e => setFormName(e.target.value)} placeholder="e.g. C/H/D/F" autoFocus />
              {formRoute.length > 0 && <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>Route: {formRoute.join(' → ')}</div>}
            </div>
            <div className="form-group" style={{ marginBottom: 16 }}>
              <label>Select Processes (in order) *</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: 10, border: '1px solid var(--border-medium)', borderRadius: 6, maxHeight: 260, overflowY: 'auto' }}>
                {processList.map(proc => {
                  const checked = formRoute.includes(proc.code)
                  const pos     = formRoute.indexOf(proc.code)
                  return (
                    <label key={proc.code} style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', padding: '5px 10px', border: `1px solid ${checked ? 'var(--accent)' : 'var(--border-light)'}`, borderRadius: 5, fontSize: 13, userSelect: 'none', background: checked ? 'var(--accent-light)' : 'transparent', position: 'relative' }}>
                      {checked && <span style={{ position: 'absolute', top: -6, right: -4, background: 'var(--accent)', color: '#fff', borderRadius: '50%', width: 14, height: 14, fontSize: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>{pos + 1}</span>}
                      <input type="checkbox" checked={checked} onChange={() => toggleProcess(proc.code)} style={{ width: 'auto' }} />
                      <strong>{proc.code}</strong>
                      <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>{proc.name}</span>
                    </label>
                  )
                })}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowModal(false)}>Cancel</button>
              <button className="primary" onClick={saveTemplate} disabled={saving || !formName.trim() || !formRoute.length}>
                {saving ? '⏳ Saving…' : editingId ? 'Save Changes' : 'Create Template'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
