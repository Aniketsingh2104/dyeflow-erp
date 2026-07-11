'use client'

import { useEffect, useState, useRef, useCallback } from 'react'

interface ProcessDef { id: string; code: string; name: string; is_enabled: boolean; display_order: number }

const persistMap = async (map: Record<string, string[]>) => {
  await fetch('/api/setup/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: 'articleProcessMap', value: map }),
  })
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem('dyeflow_db')
      const db  = raw ? JSON.parse(raw) : {}
      db.articleProcessMap = map
      localStorage.setItem('dyeflow_db', JSON.stringify(db))
    } catch {}
  }
}

export default function ProcessMachineMasterPage() {
  const [rules,        setRules]        = useState<Record<string, string[]>>({})
  const [processList,  setProcessList]  = useState<ProcessDef[]>([])
  const [articles,     setArticles]     = useState<string[]>([])
  const [loading,      setLoading]      = useState(true)
  const [showModal,    setShowModal]    = useState(false)
  const [editingArt,   setEditingArt]   = useState('')
  const [form,         setForm]         = useState({ article: '', processRoute: [] as string[] })
  const [importStatus, setImportStatus] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [mapRes, pRes, supRes] = await Promise.all([
      fetch('/api/setup/settings?key=articleProcessMap', { cache: 'no-store' }).then(r => r.json()),
      fetch('/api/processes', { cache: 'no-store' }).then(r => r.json()),
      fetch('/api/setup/settings?key=articleSupervisorMap', { cache: 'no-store' }).then(r => r.json()),
    ])
    const map = (mapRes.ok && mapRes.value && typeof mapRes.value === 'object') ? mapRes.value : {}
    setRules(map)
    setProcessList((pRes.data || []).filter((p: ProcessDef) => p.is_enabled).sort((a: ProcessDef, b: ProcessDef) => a.display_order - b.display_order))
    const supMap = (supRes.ok && supRes.value) ? supRes.value : {}
    setArticles([...new Set([...Object.keys(map), ...Object.keys(supMap)])])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const toggleProcess = (code: string) => {
    setForm(prev => ({
      ...prev,
      processRoute: prev.processRoute.includes(code)
        ? prev.processRoute.filter(c => c !== code)
        : [...prev.processRoute, code],
    }))
  }

  const openAdd = (art?: string) => {
    setEditingArt(art || '')
    const existing = art && rules[art] ? rules[art] : []
    setForm({ article: art || '', processRoute: Array.isArray(existing) ? existing : [] })
    setShowModal(true)
  }

  const save = async () => {
    if (!form.article.trim()) { alert('Enter article name.'); return }
    if (!form.processRoute.length) { alert('Select at least one process.'); return }
    const updated = { ...rules, [form.article.trim()]: form.processRoute }
    setRules(updated)
    await persistMap(updated)
    setShowModal(false)
    load()
  }

  const del = async (art: string) => {
    if (!confirm(`Remove process route for "${art}"?`)) return
    const updated = { ...rules }
    delete updated[art]
    setRules(updated)
    await persistMap(updated)
    load()
  }

  const handleJsonFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.name.endsWith('.json')) { setImportStatus('❌ Upload a .json file.'); return }
    setImportStatus('Reading…')
    const reader = new FileReader()
    reader.onload = async (ev) => {
      try {
        const json = JSON.parse(ev.target?.result as string)
        const updated = { ...rules }
        let added = 0, skipped = 0
        for (const [art, data] of Object.entries(json)) {
          if (!art || !data) { skipped++; continue }
          let route: string[] = []
          if (Array.isArray(data)) route = data.map(c => String(c).trim()).filter(Boolean)
          else if ((data as any).processRoute) route = (data as any).processRoute
          else if ((data as any).r || (data as any).route) {
            route = ((data as any).r || (data as any).route).split('/').map((c: string) => c.trim()).filter(Boolean)
          }
          if (route.length) { updated[art] = route; added++ } else skipped++
        }
        setRules(updated)
        await persistMap(updated)
        setImportStatus(`✅ Imported ${added}${skipped ? `, ${skipped} skipped` : ''}`)
        load()
        if (fileRef.current) fileRef.current.value = ''
        setTimeout(() => setImportStatus(''), 5000)
      } catch (err) {
        setImportStatus(`❌ Parse error: ${err}`)
        setTimeout(() => setImportStatus(''), 5000)
      }
    }
    reader.readAsText(file)
  }

  const ruleEntries = Object.entries(rules)

  return (
    <div className="content" style={{ padding: '16px 20px' }}>
      {/* Import */}
      <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: 10,
        padding: '14px 18px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>📄 Import Intelligence from JSON</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            Upload <code>article_process_routes.json</code> — format: <code>{'"Article": ["C", "D", "F"]'}</code>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
          {importStatus && (
            <span style={{ fontSize: 12, fontWeight: 500,
              color: importStatus.startsWith('✅') ? 'var(--success)' : 'var(--danger)' }}>{importStatus}</span>
          )}
          <input ref={fileRef} type="file" accept=".json" onChange={handleJsonFile} style={{ display: 'none' }} />
          <button style={{ background: '#137E43', color: '#fff', border: 'none', padding: '7px 14px',
            borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}
            onClick={() => fileRef.current?.click()}>📄 Upload JSON File</button>
        </div>
      </div>

      {/* Table */}
      <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: 10, overflow: 'hidden', marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '12px 16px', borderBottom: '1px solid var(--border-light)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 14, fontWeight: 700 }}>Article → Process Route Rules</span>
            <span style={{ fontSize: 11, background: 'var(--bg-secondary)', color: 'var(--text-tertiary)',
              padding: '2px 8px', borderRadius: 10, fontWeight: 600 }}>{ruleEntries.length} rules</span>
          </div>
          <button style={{ background: '#137E43', color: '#fff', border: 'none', padding: '7px 14px',
            borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: 'pointer' }} onClick={() => openAdd()}>
            + Add Rule
          </button>
        </div>
        <div style={{ overflowX: 'auto', maxHeight: 440, overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-secondary)', zIndex: 5 }}>
              <tr>
                {['Article','Default Process Route','Actions'].map(h => (
                  <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontSize: 10, fontWeight: 700,
                    color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em',
                    borderBottom: '1px solid var(--border-light)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={3} style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)' }}>Loading…</td></tr>
              ) : ruleEntries.length === 0 ? (
                <tr><td colSpan={3} style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)' }}>
                  No rules. Upload JSON or click "+ Add Rule".
                </td></tr>
              ) : (
                ruleEntries.map(([art, route], i) => (
                  <tr key={art} style={{ background: i%2===0 ? 'var(--bg-primary)' : 'var(--bg-secondary)',
                    borderBottom: '1px solid var(--border-light)' }}>
                    <td style={{ padding: '11px 14px', fontWeight: 500 }}>{art}</td>
                    <td style={{ padding: '11px 14px' }}>
                      {Array.isArray(route) && route.length > 0 ? (
                        <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
                          {route.map((code, ci) => (
                            <span key={ci} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <span style={{ background: '#E6F0FF', color: '#3366CC', padding: '2px 8px',
                                borderRadius: 4, fontSize: 11, fontWeight: 600 }}>{code}</span>
                              {ci < route.length - 1 && <span style={{ color: 'var(--text-tertiary)', fontSize: 10 }}>→</span>}
                            </span>
                          ))}
                        </div>
                      ) : <span style={{ color: 'var(--text-tertiary)' }}>-</span>}
                    </td>
                    <td style={{ padding: '11px 14px', whiteSpace: 'nowrap' }}>
                      <button className="xs" onClick={() => openAdd(art)} style={{ marginRight: 6 }}>Edit</button>
                      <button className="xs danger" onClick={() => del(art)}>Remove</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Quick setup pills */}
      {articles.length > 0 && (
        <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: 10, padding: '14px 16px' }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Quick Setup — All Known Articles</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {articles.map(art => {
              const rule = rules[art]
              const done = rule && Array.isArray(rule) && rule.length > 0
              return (
                <div key={art} onClick={() => openAdd(art)}
                  style={{ border: `1.5px solid ${done ? '#1D9E75' : 'var(--border-medium)'}`,
                    background: done ? '#EAF3DE' : 'var(--bg-secondary)', borderRadius: 6,
                    padding: '7px 12px', fontSize: 12, cursor: 'pointer' }}>
                  <div style={{ fontWeight: 600 }}>{art}</div>
                  <div style={{ fontSize: 11, marginTop: 2, color: done ? '#27500A' : 'var(--text-tertiary)' }}>
                    {done ? `✓ ${rule.length} steps` : 'Click to configure'}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Process Route → {editingArt || 'New Article'}</span>
              <button className="small" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className="form-group" style={{ marginBottom: 14 }}>
              <label>Article Name</label>
              <input value={form.article} onChange={e => setForm({ ...form, article: e.target.value })}
                placeholder="e.g. Georgette Plain" list="art-list" disabled={!!editingArt} />
              <datalist id="art-list">{articles.map(a => <option key={a} value={a} />)}</datalist>
            </div>
            <div className="form-group" style={{ marginBottom: 16 }}>
              <label>Default Process Route (select all that apply)</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: 10,
                border: '1px solid var(--border-medium)', borderRadius: 6, maxHeight: 280, overflowY: 'auto' }}>
                {processList.length === 0 ? (
                  <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>No processes. Go to Process Master first.</div>
                ) : (
                  processList.map(proc => (
                    <label key={proc.code} style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer',
                      padding: '5px 10px', border: `1px solid ${form.processRoute.includes(proc.code) ? 'var(--accent)' : 'var(--border-light)'}`,
                      borderRadius: 5, fontSize: 13, userSelect: 'none',
                      background: form.processRoute.includes(proc.code) ? 'var(--accent-light)' : 'transparent' }}>
                      <input type="checkbox" checked={form.processRoute.includes(proc.code)}
                        onChange={() => toggleProcess(proc.code)} style={{ width: 'auto' }} />
                      <strong>{proc.code}</strong>
                      <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>{proc.name}</span>
                    </label>
                  ))
                )}
              </div>
            </div>
            <button className="primary" onClick={save} style={{ width: '100%' }}>✓ Save Rule</button>
          </div>
        </div>
      )}
    </div>
  )
}
