'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import * as XLSX from 'xlsx'

const SUP_PALETTE = ['#185FA5','#1D9E75','#D85A30','#7C3AED','#D97706','#BE185D','#0E7490','#059669']

function buildColors(names: string[]): Record<string, string> {
  const m: Record<string, string> = {}
  names.forEach((n, i) => { m[n] = SUP_PALETTE[i % SUP_PALETTE.length] })
  return m
}

const persist = async (map: Record<string, string>) => {
  await fetch('/api/setup/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: 'articleSupervisorMap', value: map }),
  })
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem('dyeflow_db')
      const db  = raw ? JSON.parse(raw) : {}
      db.articleSupervisorMap = map
      localStorage.setItem('dyeflow_db', JSON.stringify(db))
    } catch {}
  }
}

export default function ArticleMasterPage() {
  const [articleMap,  setArticleMap]  = useState<Record<string, string>>({})
  const [supervisors, setSupervisors] = useState<string[]>([])
  const [supColors,   setSupColors]   = useState<Record<string, string>>({})
  const [loading,     setLoading]     = useState(true)
  const [importStatus, setImportStatus] = useState('')
  const [showModal,   setShowModal]   = useState(false)
  const [prefill,     setPrefill]     = useState('')
  const [artInput,    setArtInput]    = useState('')
  const [supInput,    setSupInput]    = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [mapRes, supRes] = await Promise.all([
      fetch('/api/setup/settings?key=articleSupervisorMap', { cache: 'no-store' }).then(r => r.json()),
      fetch('/api/supervisors', { cache: 'no-store' }).then(r => r.json()),
    ])
    const map   = (mapRes.ok && mapRes.value && typeof mapRes.value === 'object') ? mapRes.value : {}
    const sups  = (supRes.ok ? supRes.data || [] : []).map((s: any) => s.name).filter(Boolean)
    setArticleMap(map)
    setSupervisors(sups)
    setSupColors(buildColors(sups))
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const saveMapping = async (art: string, sup: string) => {
    if (!art.trim() || !sup) return
    const updated = { ...articleMap, [art.trim()]: sup }
    setArticleMap(updated)
    await persist(updated)
    setShowModal(false)
    setPrefill(''); setArtInput(''); setSupInput('')
  }

  const deleteMapping = async (art: string) => {
    if (!confirm(`Remove mapping for "${art}"?`)) return
    const updated = { ...articleMap }
    delete updated[art]
    setArticleMap(updated)
    await persist(updated)
  }

  const processImport = async (rows: [string, string][]) => {
    const updated = { ...articleMap }
    let added = 0, skipped = 0
    for (const [art, sup] of rows) {
      const a = (art || '').trim(), s = (sup || '').trim()
      if (!a || !s) { skipped++; continue }
      const matched = supervisors.find(n => n.toLowerCase() === s.toLowerCase()) || s
      updated[a] = matched
      added++
    }
    setArticleMap(updated)
    await persist(updated)
    setImportStatus(`✅ Imported ${added} mappings${skipped ? `, ${skipped} skipped` : ''}`)
    if (fileRef.current) fileRef.current.value = ''
    setTimeout(() => setImportStatus(''), 5000)
  }

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImportStatus('Reading file…')
    if (file.name.endsWith('.csv')) {
      const reader = new FileReader()
      reader.onload = (ev) => {
        const lines = (ev.target?.result as string).split(/\r?\n/).map(l => l.trim()).filter(Boolean)
        processImport(lines.slice(1).map(line => {
          const p = line.split(',')
          return [p[0]?.replace(/"/g,'').trim(), p[1]?.replace(/"/g,'').trim()] as [string,string]
        }))
      }
      reader.readAsText(file)
    } else {
      const reader = new FileReader()
      reader.onload = (ev) => {
        const wb   = XLSX.read(new Uint8Array(ev.target?.result as ArrayBuffer), { type: 'array' })
        const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 }) as any[][]
        processImport(data.slice(1).map(row => [String(row[0]||'').trim(), String(row[1]||'').trim()] as [string,string]))
      }
      reader.readAsArrayBuffer(file)
    }
  }

  const entries   = Object.entries(articleMap)
  const articles  = entries.map(([a]) => a)

  return (
    <div className="content" style={{ padding: '16px 20px' }}>
      {/* Import */}
      <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: 10,
        padding: '14px 18px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>📄 Import Mapping from Excel / CSV</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            Two columns: <strong>Article</strong> | <strong>Master Name</strong> (supervisor)
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          {importStatus && (
            <span style={{ fontSize: 12, fontWeight: 500,
              color: importStatus.startsWith('✅') ? 'var(--success)' : 'var(--danger)' }}>
              {importStatus}
            </span>
          )}
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} style={{ display: 'none' }} />
          <button style={{ background: '#137E43', color: '#fff', border: 'none', padding: '7px 14px',
            borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}
            onClick={() => fileRef.current?.click()}>
            📄 Upload Excel / CSV
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        {/* Mapping table */}
        <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '12px 16px', borderBottom: '1px solid var(--border-light)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 14, fontWeight: 700 }}>Article → Supervisor Mapping</span>
              <span style={{ fontSize: 11, background: 'var(--bg-secondary)', color: 'var(--text-tertiary)',
                padding: '2px 8px', borderRadius: 10, fontWeight: 600 }}>{entries.length}</span>
            </div>
            <button style={{ background: '#137E43', color: '#fff', border: 'none', padding: '6px 12px',
              borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}
              onClick={() => { setPrefill(''); setArtInput(''); setSupInput(''); setShowModal(true) }}>
              + Add Mapping
            </button>
          </div>
          {loading ? (
            <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-tertiary)' }}>Loading…</div>
          ) : entries.length === 0 ? (
            <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>
              No mappings. Upload Excel or click "+ Add Mapping".
            </div>
          ) : (
            <div style={{ maxHeight: 400, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-secondary)', zIndex: 5 }}>
                  <tr>
                    {['Article','Supervisor','Action'].map(h => (
                      <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10, fontWeight: 700,
                        color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em',
                        borderBottom: '1px solid var(--border-light)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {entries.map(([art, sup], i) => {
                    const col = supColors[sup] || '#185FA5'
                    return (
                      <tr key={art} style={{ background: i%2===0 ? 'var(--bg-primary)' : 'var(--bg-secondary)',
                        borderBottom: '1px solid var(--border-light)' }}>
                        <td style={{ padding: '10px 12px', fontWeight: 500, wordBreak: 'break-word' }}>{art}</td>
                        <td style={{ padding: '10px 12px' }}>
                          <span style={{ background: `${col}18`, color: col, padding: '3px 10px',
                            borderRadius: 12, fontSize: 12, fontWeight: 600 }}>{sup}</span>
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <button onClick={() => deleteMapping(art)}
                            style={{ padding: '3px 10px', fontSize: 11, border: '1px solid #FCA5A5',
                              borderRadius: 4, background: '#FEF2F2', color: '#DC2626', cursor: 'pointer', fontWeight: 600 }}>
                            Remove
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Supervisor load summary */}
        <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-light)' }}>
            <span style={{ fontSize: 14, fontWeight: 700 }}>Supervisor Load Summary</span>
          </div>
          <div style={{ maxHeight: 420, overflowY: 'auto', padding: '0 16px 16px' }}>
            {supervisors.length === 0 ? (
              <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-tertiary)' }}>No supervisors configured.</div>
            ) : (
              supervisors.map((sup, i) => {
                const mapped = entries.filter(([,s]) => s === sup).map(([a]) => a)
                const col = supColors[sup] || '#185FA5'
                return (
                  <div key={sup} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 0',
                    borderBottom: i < supervisors.length - 1 ? '1px solid var(--border-light)' : 'none' }}>
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: `${col}18`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 13, fontWeight: 700, color: col, flexShrink: 0 }}>
                      {sup[0]}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 3 }}>{sup}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', wordBreak: 'break-word', lineHeight: 1.4 }}>
                        {mapped.length > 0 ? `Articles: ${mapped.join(', ')}` : 'No articles mapped'}
                      </div>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)', flexShrink: 0 }}>
                      {mapped.length} articles
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>

      {/* Quick setup pills */}
      {articles.length > 0 && (
        <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: 10, padding: '14px 16px' }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Mapped Articles</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {entries.map(([art, sup]) => {
              const col = supColors[sup] || '#185FA5'
              return (
                <div key={art} style={{ border: `1.5px solid ${col}40`, borderRadius: 6, padding: '6px 12px',
                  fontSize: 12, cursor: 'pointer', background: `${col}05`,
                  display: 'flex', alignItems: 'center', gap: 6 }}
                  onClick={() => { setPrefill(art); setArtInput(art); setSupInput(sup); setShowModal(true) }}>
                  <span style={{ fontWeight: 600 }}>{art}</span>
                  <span style={{ color: col }}>→</span>
                  <span style={{ color: col, fontWeight: 700, fontSize: 11 }}>{sup}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Add Article → Supervisor Mapping</span>
              <button className="small" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
              <div className="form-group">
                <label>Article Name</label>
                <input value={artInput} onChange={e => setArtInput(e.target.value)}
                  placeholder="e.g. Cotton 60s" list="art-list" autoFocus />
                <datalist id="art-list">
                  {articles.map(a => <option key={a} value={a} />)}
                </datalist>
              </div>
              <div className="form-group">
                <label>Supervisor</label>
                <select value={supInput} onChange={e => setSupInput(e.target.value)}>
                  <option value="">-- Select --</option>
                  {supervisors.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <button className="primary" onClick={() => saveMapping(artInput, supInput)} style={{ width: '100%' }}>
              ✓ Save Mapping
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
