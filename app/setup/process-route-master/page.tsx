'use client'

import { useEffect, useState, useCallback } from 'react'
import { workRoute, TAIL_CODES } from '@/lib/routeTail'

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
  const [search,      setSearch]      = useState('')

  const load = useCallback(async (showSpinner = false) => {
    if (showSpinner) setLoading(true)
    const [tRes, pRes, aRes] = await Promise.all([
      fetch('/api/route-templates', { cache: 'no-store' }).then(r => r.json()),
      fetch('/api/processes',       { cache: 'no-store' }).then(r => r.json()),
      fetch('/api/article-routes',  { cache: 'no-store' }).then(r => r.json()),
    ])
    setTemplates((tRes.data || []).map((t: RouteTemplate) => ({ ...t, route: workRoute(t.route || t.steps?.map((s: any) => s.processCode) || []) })))
    setProcessList(
      (pRes.data || [])
        // QA / Packing / Dispatch are added by the system — not picked in a template
        .filter((p: ProcessDef) => p.is_enabled && !(TAIL_CODES as readonly string[]).includes(p.code))
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
    setFormRoute(workRoute(t.route || t.steps?.map((s: any) => s.processCode) || []))
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
    const route  = workRoute(formRoute)
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

  const q = search.trim().toLowerCase()
  const filtered = templates.filter(t => !q || t.name.toLowerCase().includes(q)
    || (t.route || []).some(c => c.toLowerCase().includes(q) || (procNameMap[c] || '').toLowerCase().includes(q)))

  const StepBadge = ({ code, name }: { code: string; name: string }) => (
    <span title={name} style={{ background: '#E6F0FF', color: '#3366CC', padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>{code}</span>
  )

  return (
    <div className="content" style={{ padding: '16px 20px' }}>

      {toast && (
        <div style={{ position: 'fixed', top: 16, right: 20, zIndex: 9999, background: toast.startsWith('⚠') ? '#FEF3C7' : '#D1FAE5', border: `1px solid ${toast.startsWith('⚠') ? '#FCD34D' : '#6EE7B7'}`, borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, color: toast.startsWith('⚠') ? '#92400E' : '#065F46', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
          {toast}
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>Process Route Master</div>
          <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 2 }}>
            Ready-made process routes shown in the Route dropdown on supervisor sheets · {templates.length} templates
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search template or process…"
            style={{ width: 280, padding: '9px 12px', fontSize: 14, border: '1px solid var(--border-medium)', borderRadius: 8,
              background: 'var(--bg-primary)', color: 'var(--text-primary)' }} />
          <button onClick={importFromArticleMap} style={{ padding: '9px 14px', fontSize: 14, fontWeight: 700, border: '1px solid var(--accent)', borderRadius: 8, background: 'var(--accent-light)', color: 'var(--accent-dark)', cursor: 'pointer' }}>
            ↓ Import from Article Map ({Object.keys(articleMap).length})
          </button>
          <button className="small" onClick={() => load(false)} title="Refresh" style={{ padding: '9px 12px', fontSize: 14 }}>↻</button>
          <button className="primary" onClick={openNew} style={{ padding: '9px 16px', fontSize: 14, fontWeight: 700 }}>+ New Template</button>
        </div>
      </div>

      {/* Count cards */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        {[['Templates', templates.length, 'var(--accent)'],
          ['Processes available', processList.length, '#3366CC'],
          ['Article routes', Object.keys(articleMap).length, 'var(--text-tertiary)'],
          ['Longest route', templates.reduce((m, t) => Math.max(m, (t.route || []).length), 0) + ' steps', '#B45309']].map(([label, value, color]) => (
          <div key={String(label)} style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: 10, padding: '10px 16px', minWidth: 140 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: String(color) }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: 10, overflow: 'auto', maxHeight: 'calc(100vh - 250px)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', minWidth: 900 }}>
          <colgroup>
            <col style={{ width: 60 }} /><col style={{ width: '26%' }} /><col /><col style={{ width: 90 }} /><col style={{ width: 170 }} />
          </colgroup>
          <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-secondary)' }}>
            <tr>
              {['#', 'Template Name', 'Route (in order)', 'Steps', 'Actions'].map(h => (
                <th key={h} style={{ padding: '12px 16px', textAlign: h === 'Steps' ? 'center' : 'left', fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '2px solid var(--border-light)', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 14 }}>Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={5} style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 14 }}>
                {templates.length === 0 ? 'No route templates yet. Click "+ New Template" or import from the Article Map.' : 'No results.'}
              </td></tr>
            ) : filtered.map((t, i) => {
              const route = t.route || t.steps?.map((s: any) => s.processCode) || []
              const steps = t.steps || route.map((c: string) => ({ processCode: c, name: procNameMap[c] || c }))
              return (
                <tr key={t.id} style={{ background: i % 2 === 0 ? 'var(--bg-primary)' : 'var(--bg-secondary)', borderBottom: '1px solid var(--border-light)' }}>
                  <td style={{ padding: '12px 16px', color: 'var(--text-tertiary)', fontSize: 12 }}>{i + 1}</td>
                  <td style={{ padding: '12px 16px', fontWeight: 700, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={t.name}>{t.name}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
                      {steps.map((s: any, si: number) => (
                        <span key={si} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <StepBadge code={s.processCode} name={s.name} />
                          {si < steps.length - 1 && <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>→</span>}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 700, color: 'var(--text-secondary)' }}>{steps.length}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="small" onClick={() => openEdit(t)}>Edit</button>
                      <button className="small danger" onClick={() => deleteTemplate(t.id, t.name)}>Remove</button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <div style={{ padding: '8px 16px', borderTop: '1px solid var(--border-light)', fontSize: 12, color: 'var(--text-tertiary)', position: 'sticky', bottom: 0, background: 'var(--bg-primary)' }}>
          Showing {filtered.length} of {templates.length}
        </div>
      </div>

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
