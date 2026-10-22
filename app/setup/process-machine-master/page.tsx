'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { workRoute, routeHasQa, TAIL_CODES } from '@/lib/routeTail'
import { usePagination, PaginationBar } from '@/components/Pagination'

interface ProcessDef { id: string; code: string; name: string; is_enabled: boolean; display_order: number }

// Article → route rules live in the article_process_routes table (the same
// place Route Assignment reads its suggestions from). Article names are kept
// lower-case there, so "Cotton 40s" and "COTTON 40S" are one rule.
const post = (body: any) => fetch('/api/article-routes', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
}).then(r => r.json()).catch(() => ({ ok: false, error: 'Network error' }))

export default function ProcessMachineMasterPage() {
  const [rules,        setRules]        = useState<Record<string, string[]>>({})
  const [ruleIds,      setRuleIds]      = useState<Record<string, string>>({})
  // QA needed for this article? (QA → Packing → Dispatch are added on Confirm)
  const [qaMap,        setQaMap]        = useState<Record<string, boolean>>({})
  const [processList,  setProcessList]  = useState<ProcessDef[]>([])
  const [articles,     setArticles]     = useState<string[]>([])
  const [loading,      setLoading]      = useState(true)
  const [showModal,    setShowModal]    = useState(false)
  const [editingArt,   setEditingArt]   = useState('')
  const [form,         setForm]         = useState({ article: '', processRoute: [] as string[], qa: false })
  const [importStatus, setImportStatus] = useState('')
  const [search,       setSearch]       = useState('')
  const [qaFilter,     setQaFilter]     = useState<'all' | 'qa' | 'noqa'>('all')
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [mapRes, pRes, supRes] = await Promise.all([
      fetch('/api/article-routes', { cache: 'no-store' }).then(r => r.json()),
      fetch('/api/processes', { cache: 'no-store' }).then(r => r.json()),
      fetch('/api/setup/settings?key=articleSupervisorMap', { cache: 'no-store' }).then(r => r.json()),
    ])
    if (!mapRes.ok) { alert('Could not load the rules: ' + (mapRes.error || 'Unknown error')) }
    const map: Record<string, string[]> = {}
    const ids: Record<string, string> = {}
    const qas: Record<string, boolean> = {}
    for (const r of (mapRes.data || [])) { map[r.article] = workRoute(r.route || []); ids[r.article] = r.id; qas[r.article] = !!r.qa_required || routeHasQa(r.route) }
    setRules(map)
    setRuleIds(ids)
    setQaMap(qas)
    // QA / Packing / Dispatch are not picked here — the system adds them
    setProcessList((pRes.data || []).filter((p: ProcessDef) => p.is_enabled && !(TAIL_CODES as readonly string[]).includes(p.code)).sort((a: ProcessDef, b: ProcessDef) => a.display_order - b.display_order))
    const supMap = (supRes.ok && supRes.value) ? supRes.value : {}
    setArticles([...new Set([...Object.keys(map), ...Object.keys(supMap).map(a => a.trim().toLowerCase())])])
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
    const key = (art || '').trim().toLowerCase()
    const existing = art && rules[key] ? rules[key] : []
    setForm({ article: art || '', processRoute: Array.isArray(existing) ? existing : [], qa: !!qaMap[key] })
    setShowModal(true)
  }

  const save = async () => {
    if (!form.article.trim()) { alert('Enter article name.'); return }
    if (!form.processRoute.length) { alert('Select at least one process.'); return }
    const res = await post({ action: 'upsert', article: form.article.trim(), route: form.processRoute, qa_required: form.qa })
    if (!res.ok) { alert('Not saved: ' + (res.error || 'Unknown error')); return }
    setShowModal(false)
    load()
  }

  const del = async (art: string) => {
    if (!confirm(`Remove process route for "${art}"?`)) return
    const id = ruleIds[art]
    if (!id) { load(); return }
    const res = await post({ action: 'delete', id })
    if (!res.ok) { alert('Not removed: ' + (res.error || 'Unknown error')); return }
    load()
  }

  const toggleQa = async (art: string) => {
    const id = ruleIds[art]; if (!id) return
    const next = !qaMap[art]
    setQaMap(prev => ({ ...prev, [art]: next }))       // shows straight away
    const res = await post({ action: 'set_qa', id, qa_required: next })
    if (!res.ok) { setQaMap(prev => ({ ...prev, [art]: !next })); alert('QA not saved: ' + (res.error || 'Unknown error')) }
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
        const list: { article: string; route: string[]; qa_required?: boolean }[] = []
        let added = 0, skipped = 0
        for (const [art, data] of Object.entries(json)) {
          if (!art || !data) { skipped++; continue }
          let route: string[] = []
          if (Array.isArray(data)) route = data.map(c => String(c).trim()).filter(Boolean)
          else if ((data as any).processRoute) route = (data as any).processRoute
          else if ((data as any).r || (data as any).route) {
            route = ((data as any).r || (data as any).route).split('/').map((c: string) => c.trim()).filter(Boolean)
          }
          // QA: "qa": true in the file, or QA inside the route
          const qaGiven = typeof (data as any)?.qa === 'boolean' ? (data as any).qa : typeof (data as any)?.qaRequired === 'boolean' ? (data as any).qaRequired : undefined
          if (workRoute(route).length) { list.push({ article: art, route, ...(qaGiven !== undefined ? { qa_required: qaGiven } : {}) }); added++ } else skipped++
        }
        if (!list.length) { setImportStatus('❌ No rules found in the file.'); return }
        const res = await post({ action: 'bulk_upsert', rules: list })
        if (!res.ok) { setImportStatus('❌ Not imported: ' + (res.error || 'Unknown error')); return }
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

  const q = search.trim().toLowerCase()
  const ruleEntries = Object.entries(rules)
    .filter(([art, route]) => (!q || art.includes(q) || route.join('/').toLowerCase().includes(q))
      && (qaFilter === 'all' || (qaFilter === 'qa') === !!qaMap[art]))
    .sort((x, y) => x[0].localeCompare(y[0]))
  const total = Object.keys(rules).length
  const qaCount = Object.keys(rules).filter(a => qaMap[a]).length
  const routeCount = new Set(Object.values(rules).map(r => r.join('/'))).size
  const pg = usePagination(ruleEntries, 'dyeflow_pg_article_route')
  useEffect(() => { pg.resetPage() }, [search, qaFilter]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="content" style={{ padding: '16px 20px' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>Article → Process Route Rule</div>
          <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 2 }}>
            Default route suggested when an order of this article is assigned · QA → Packing → Dispatch are added by the system
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search article or route…"
            style={{ width: 280, padding: '9px 12px', fontSize: 14, border: '1px solid var(--border-medium)', borderRadius: 8,
              background: 'var(--bg-primary)', color: 'var(--text-primary)' }} />
          <input ref={fileRef} type="file" accept=".json" onChange={handleJsonFile} style={{ display: 'none' }} />
          <button onClick={() => fileRef.current?.click()} title='JSON format: "Article": { "r": "D/F", "qa": true }  or  "Article": ["D","F"]'
            style={{ padding: '9px 14px', fontSize: 14, fontWeight: 700, border: '1px solid var(--accent)', borderRadius: 8, background: 'var(--accent-light)', color: 'var(--accent-dark)', cursor: 'pointer' }}>
            📥 Upload JSON
          </button>
          <button className="small" onClick={() => load()} title="Refresh" style={{ padding: '9px 12px', fontSize: 14 }}>↻</button>
          <button className="primary" onClick={() => openAdd()} style={{ padding: '9px 16px', fontSize: 14, fontWeight: 700 }}>+ Add Rule</button>
        </div>
      </div>

      {importStatus && (
        <div style={{ background: importStatus.startsWith('❌') ? '#FEE2E2' : importStatus.startsWith('✅') ? '#D1FAE5' : '#EFF6FF', border: `1px solid ${importStatus.startsWith('❌') ? '#FCA5A5' : importStatus.startsWith('✅') ? '#6EE7B7' : '#BFDBFE'}`, borderRadius: 8, padding: '8px 14px', marginBottom: 12, fontSize: 13, fontWeight: 600, color: importStatus.startsWith('❌') ? '#991B1B' : importStatus.startsWith('✅') ? '#065F46' : '#1E40AF' }}>
          {importStatus}
        </div>
      )}

      {/* Count cards — click to filter */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        {([['all', 'All rules', total, 'var(--accent)'], ['qa', 'With QA', qaCount, '#B45309'], ['noqa', 'Without QA', total - qaCount, '#3366CC']] as const).map(([k, label, value, color]) => (
          <div key={k} onClick={() => setQaFilter(k)} style={{ background: 'var(--bg-primary)', border: `2px solid ${qaFilter === k ? color : 'var(--border-light)'}`, borderRadius: 10, padding: '10px 16px', minWidth: 130, cursor: 'pointer' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color }}>{value}</div>
          </div>
        ))}
        <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: 10, padding: '10px 16px', minWidth: 130 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Different routes</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-secondary)' }}>{routeCount}</div>
        </div>
      </div>

      {/* Table */}
      <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: 10, overflow: 'auto', maxHeight: 'calc(100vh - 250px)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', minWidth: 900 }}>
          <colgroup>
            <col style={{ width: 60 }} /><col style={{ width: '38%' }} /><col /><col style={{ width: 90 }} /><col style={{ width: 170 }} />
          </colgroup>
          <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-secondary)' }}>
            <tr>
              {['#', 'Article', 'Default Process Route', 'QA', 'Actions'].map(h => (
                <th key={h} style={{ padding: '12px 16px', textAlign: h === 'QA' ? 'center' : 'left', fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '2px solid var(--border-light)', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 14 }}>Loading…</td></tr>
            ) : ruleEntries.length === 0 ? (
              <tr><td colSpan={5} style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 14 }}>
                {total === 0 ? 'No rules yet. Upload a JSON file or click "+ Add Rule".' : 'No results.'}
              </td></tr>
            ) : pg.rows.map(([art, route], i) => (
              <tr key={art} style={{ background: i % 2 === 0 ? 'var(--bg-primary)' : 'var(--bg-secondary)', borderBottom: '1px solid var(--border-light)' }}>
                <td style={{ padding: '12px 16px', color: 'var(--text-tertiary)', fontSize: 12 }}>{pg.start + i + 1}</td>
                <td style={{ padding: '12px 16px', fontWeight: 700, fontSize: 15, textTransform: 'uppercase', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={art}>{art}</td>
                <td style={{ padding: '12px 16px' }}>
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
                    {route.map((code, ci) => (
                      <span key={ci} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ background: '#E6F0FF', color: '#3366CC', padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 700 }}>{code}</span>
                        {ci < route.length - 1 && <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>→</span>}
                      </span>
                    ))}
                    {qaMap[art] && <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>→</span>
                      <span style={{ background: '#FEF3C7', color: '#B45309', padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 700 }}>QA</span>
                    </span>}
                  </div>
                </td>
                <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                  <input type="checkbox" checked={!!qaMap[art]} onChange={() => toggleQa(art)}
                    title="This article needs QA (QA → Packing → Dispatch)" style={{ width: 18, height: 18, cursor: 'pointer', accentColor: '#B45309' }} />
                </td>
                <td style={{ padding: '12px 16px' }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="small" onClick={() => openAdd(art)}>Edit</button>
                    <button className="small danger" onClick={() => del(art)}>Remove</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <PaginationBar {...pg} rowsShown={pg.rows.length} />
      </div>

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
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
              <input type="checkbox" checked={form.qa} onChange={e => setForm({ ...form, qa: e.target.checked })} style={{ width: 'auto' }} />
              This article needs QA
            </label>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 14 }}>
              Every batch ends {form.qa ? 'QA → ' : ''}Packing → Dispatch — added automatically, don't pick them above.
            </div>
            <button className="primary" onClick={save} style={{ width: '100%' }}>✓ Save Rule</button>
          </div>
        </div>
      )}
    </div>
  )
}
