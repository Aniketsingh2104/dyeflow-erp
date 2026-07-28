'use client'

import { useEffect, useState, useCallback, useRef } from 'react'

interface Mapping { id: string; article: string; supervisor: string; updated_at: string }

export default function ArticleMasterPage() {
  const [mappings,    setMappings]    = useState<Mapping[]>([])
  const [supervisors, setSupervisors] = useState<string[]>([])
  const [loading,     setLoading]     = useState(true)
  const [saving,      setSaving]      = useState(false)
  const [search,      setSearch]      = useState('')
  const [filterSup,   setFilterSup]   = useState('')
  const [showModal,   setShowModal]   = useState(false)
  const [editing,     setEditing]     = useState<Mapping | null>(null)
  const [formArticle, setFormArticle] = useState('')
  const [formSup,     setFormSup]     = useState('')
  const [importStatus,setImportStatus]= useState('')
  const [saved,       setSaved]       = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [mapRes, supRes] = await Promise.all([
      fetch('/api/article-supervisor-map', { cache: 'no-store' }).then(r => r.json()),
      fetch('/api/supervisors',            { cache: 'no-store' }).then(r => r.json()),
    ])
    setMappings(mapRes.data || [])
    setSupervisors((supRes.data || []).map((s: any) => s.name).filter(Boolean))
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const flash = (msg = '') => {
    setSaved(true); setImportStatus(msg)
    setTimeout(() => { setSaved(false); setImportStatus('') }, 3000)
  }

  const openAdd = () => {
    setEditing(null); setFormArticle(''); setFormSup(supervisors[0] || '')
    setShowModal(true)
  }
  const openEdit = (m: Mapping) => {
    setEditing(m); setFormArticle(m.article); setFormSup(m.supervisor)
    setShowModal(true)
  }

  const saveMapping = async () => {
    if (!formArticle.trim()) { alert('Article name required.'); return }
    if (!formSup.trim())     { alert('Select a supervisor.'); return }
    setSaving(true)
    try {
      const res  = await fetch('/api/article-supervisor-map', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ action: 'upsert', article: formArticle.trim(), supervisor: formSup.trim() }),
      })
      const data = await res.json()
      if (!data.ok) { alert('Save failed: ' + data.error); return }
      setShowModal(false)
      flash('✓ Saved to Supabase')
      await load()
    } finally { setSaving(false) }
  }

  const deleteMapping = async (m: Mapping) => {
    if (!confirm(`Remove mapping for "${m.article}"?`)) return
    await fetch('/api/article-supervisor-map', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ action: 'delete', id: m.id }),
    })
    await load()
  }

  // Excel / JSON import
  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    setImportStatus('📂 Reading file…')
    try {
      let mappings: { article: string; supervisor: string }[] = []

      if (file.name.endsWith('.json')) {
        const json = JSON.parse(await file.text())
        // Accept { article: supervisor } or [{ article, supervisor }]
        if (Array.isArray(json)) {
          mappings = json.filter(r => r.article && r.supervisor)
        } else {
          mappings = Object.entries(json)
            .filter(([, v]) => typeof v === 'string' && v.trim())
            .map(([article, supervisor]) => ({ article, supervisor: supervisor as string }))
        }
      } else {
        // Excel/CSV
        const XLSX = await loadXLSX()
        const buf  = await file.arrayBuffer()
        const wb   = XLSX.read(new Uint8Array(buf), { type: 'array' })
        const rows: any[][] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' })
        if (rows.length < 2) { setImportStatus('❌ File is empty'); return }
        const headers = rows[0].map((h: any) => String(h || '').toLowerCase().trim())
        const artIdx  = headers.findIndex((h: string) => h.includes('article') || h.includes('name'))
        const supIdx  = headers.findIndex((h: string) => h.includes('supervisor') || h.includes('sup'))
        if (artIdx < 0 || supIdx < 0) { setImportStatus('❌ Need "Article" and "Supervisor" columns'); return }
        for (let i = 1; i < rows.length; i++) {
          const art = String(rows[i][artIdx] || '').trim()
          const sup = String(rows[i][supIdx] || '').trim()
          if (art && sup) mappings.push({ article: art, supervisor: sup })
        }
      }

      if (!mappings.length) { setImportStatus('❌ No valid mappings found'); return }
      setImportStatus(`⏳ Importing ${mappings.length} mappings…`)

      const res  = await fetch('/api/article-supervisor-map', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ action: 'bulk_upsert', mappings }),
      })
      const data = await res.json()
      if (!data.ok) { setImportStatus('❌ Import failed: ' + data.error); return }
      flash(`✅ ${data.upserted} mappings imported to Supabase`)
      await load()
    } catch (err: any) {
      setImportStatus('❌ Error: ' + err.message)
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const loadXLSX = (): Promise<any> => new Promise((res, rej) => {
    if ((window as any).XLSX) { res((window as any).XLSX); return }
    const s = document.createElement('script')
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
    s.onload = () => res((window as any).XLSX)
    s.onerror = () => rej(new Error('Failed to load xlsx'))
    document.head.appendChild(s)
  })

  const exportJson = () => {
    const map: Record<string, string> = {}
    mappings.forEach(m => { map[m.article] = m.supervisor })
    const blob = new Blob([JSON.stringify(map, null, 2)], { type: 'application/json' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
    a.download = 'article_supervisor_map.json'; a.click()
  }

  const filtered = mappings.filter(m => {
    const matchSearch = !search.trim() || m.article.toLowerCase().includes(search.toLowerCase())
    const matchSup    = !filterSup || m.supervisor === filterSup
    return matchSearch && matchSup
  })

  // Group by supervisor for summary
  const supCounts: Record<string, number> = {}
  mappings.forEach(m => { supCounts[m.supervisor] = (supCounts[m.supervisor] || 0) + 1 })

  const SUP_COLORS: Record<string, string> = {
    'Gyaneshwar M.': '#185FA5', 'Kundan M.': '#7C3AED',
    'Nandlal M.': '#059669',    'Arpit M.':  '#D97706',
    'Urvesh M.': '#DC2626',     'Jitesh M.': '#0891B2',
    'Ajay M.':   '#65A30D',
  }
  const supColor = (name: string) => SUP_COLORS[name] || '#6B7280'

  return (
    <div className="content" style={{ maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>Article → Supervisor Map</div>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>
            Stored in <code style={{ fontSize: 11, background: 'var(--bg-secondary)', padding: '1px 6px', borderRadius: 4 }}>article_supervisor_map</code> table · {mappings.length} mappings
          </div>
        </div>
      </div>

      {saved && (
        <div style={{ background: '#D1FAE5', border: '1px solid #6EE7B7', borderRadius: 8, padding: '8px 14px', marginBottom: 12, fontSize: 12, fontWeight: 600, color: '#065F46' }}>
          {importStatus || '✓ Saved to Supabase'}
        </div>
      )}
      {importStatus && !saved && (
        <div style={{ background: importStatus.startsWith('❌') ? '#FEE2E2' : '#EFF6FF', border: `1px solid ${importStatus.startsWith('❌') ? '#FCA5A5' : '#BFDBFE'}`, borderRadius: 8, padding: '8px 14px', marginBottom: 12, fontSize: 12, fontWeight: 600, color: importStatus.startsWith('❌') ? '#991B1B' : '#1E40AF' }}>
          {importStatus}
        </div>
      )}

      {/* Supervisor summary chips */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        <button onClick={() => setFilterSup('')}
          style={{ padding: '5px 12px', fontSize: 12, fontWeight: 600, border: `2px solid ${!filterSup ? 'var(--accent)' : 'var(--border-light)'}`, borderRadius: 20, background: !filterSup ? 'var(--accent)' : 'var(--bg-primary)', color: !filterSup ? '#fff' : 'var(--text-secondary)', cursor: 'pointer' }}>
          All ({mappings.length})
        </button>
        {Object.entries(supCounts).sort((a, b) => b[1] - a[1]).map(([sup, count]) => (
          <button key={sup} onClick={() => setFilterSup(filterSup === sup ? '' : sup)}
            style={{ padding: '5px 12px', fontSize: 12, fontWeight: 600, border: `2px solid ${filterSup === sup ? supColor(sup) : 'var(--border-light)'}`, borderRadius: 20, background: filterSup === sup ? supColor(sup) : 'var(--bg-primary)', color: filterSup === sup ? '#fff' : 'var(--text-secondary)', cursor: 'pointer' }}>
            {sup} ({count})
          </button>
        ))}
      </div>

      {/* Action bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <button className="primary" onClick={openAdd}>+ Add Mapping</button>
        <label style={{ cursor: 'pointer' }}>
          <input ref={fileRef} type="file" accept=".json,.xlsx,.xls,.csv" onChange={handleImport}
            style={{ position: 'absolute', opacity: 0, width: 1, height: 1, overflow: 'hidden' }} />
          <span style={{ padding: '7px 14px', fontSize: 13, fontWeight: 600, border: '1px solid var(--accent)', borderRadius: 6, background: 'var(--accent-light)', color: 'var(--accent-dark)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            📥 Import JSON / Excel
          </span>
        </label>
        <button className="small" onClick={exportJson} disabled={!mappings.length}>📤 Export JSON</button>
        <button className="small" onClick={load} disabled={loading}>{loading ? '…' : '↻'}</button>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search article…"
          style={{ marginLeft: 'auto', width: 220, fontSize: 12 }} />
        <span style={{ fontSize: 12, color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
          {filtered.length} / {mappings.length}
        </span>
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-tertiary)' }}>Loading from Supabase…</div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <div style={{ overflowX: 'auto', maxHeight: 'calc(100vh - 300px)', overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-secondary)' }}>
                <tr>
                  {['#', 'ARTICLE', 'SUPERVISOR', 'ACTIONS'].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '2px solid var(--border-light)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={4} style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)' }}>
                    {search ? `No articles matching "${search}"` : 'No mappings yet.'}
                  </td></tr>
                ) : filtered.map((m, i) => (
                  <tr key={m.id} style={{ background: i % 2 === 0 ? 'var(--bg-primary)' : 'var(--bg-secondary)', borderBottom: '1px solid var(--border-light)' }}>
                    <td style={{ padding: '8px 14px', color: 'var(--text-tertiary)', fontSize: 11, width: 48 }}>{i + 1}</td>
                    <td style={{ padding: '8px 14px', fontWeight: 500, maxWidth: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={m.article}>{m.article}</td>
                    <td style={{ padding: '8px 14px' }}>
                      <span style={{ background: supColor(m.supervisor) + '18', color: supColor(m.supervisor), padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>
                        {m.supervisor}
                      </span>
                    </td>
                    <td style={{ padding: '8px 14px', whiteSpace: 'nowrap' }}>
                      <button className="xs" onClick={() => openEdit(m)} style={{ marginRight: 6 }}>Edit</button>
                      <button className="xs danger" onClick={() => deleteMapping(m)}>Remove</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ padding: '8px 14px', borderTop: '1px solid var(--border-light)', fontSize: 11, color: 'var(--text-tertiary)' }}>
            {filtered.length} mappings · <strong>article_supervisor_map</strong> table · Supabase
          </div>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">{editing ? 'Edit Mapping' : 'Add Mapping'}</span>
              <button className="small" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className="form-group" style={{ marginBottom: 14 }}>
              <label>Article Name *</label>
              <input value={formArticle} onChange={e => setFormArticle(e.target.value)}
                placeholder="e.g. cotton-58" autoFocus
                disabled={!!editing} />
              {editing && <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 3 }}>Article name cannot be changed.</div>}
            </div>
            <div className="form-group" style={{ marginBottom: 16 }}>
              <label>Supervisor *</label>
              <select value={formSup} onChange={e => setFormSup(e.target.value)}>
                <option value="">— Select supervisor —</option>
                {supervisors.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowModal(false)}>Cancel</button>
              <button className="primary" onClick={saveMapping}
                disabled={saving || !formArticle.trim() || !formSup.trim()}>
                {saving ? '⏳ Saving…' : editing ? '✓ Update' : '✓ Add Mapping'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
