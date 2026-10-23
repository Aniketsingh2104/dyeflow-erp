'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import * as XLSX from 'xlsx'
import { usePagination, PaginationBar } from '@/components/Pagination'

interface ShadeRule { id: string; shade_name: string; shade_group: string; created_at: string }

const SHADE_GROUPS = ['Light', 'Medium', 'Dark']

const GRP: Record<string, { bg: string; color: string; border: string; dot: string; icon: string }> = {
  Light:  { bg: '#FFFBEB', color: '#92400E', border: '#FDE68A', dot: '#F59E0B', icon: '☀️' },
  Medium: { bg: '#EFF6FF', color: '#1E40AF', border: '#BFDBFE', dot: '#3B82F6', icon: '🌤' },
  Dark:   { bg: '#1E1B4B', color: '#C7D2FE', border: '#4338CA', dot: '#818CF8', icon: '🌑' },
}

export default function ShadeMasterPage() {
  const [rules,        setRules]        = useState<ShadeRule[]>([])
  const [loading,      setLoading]      = useState(true)
  const [saving,       setSaving]       = useState(false)
  const [showModal,    setShowModal]    = useState(false)
  const [editingId,    setEditingId]    = useState('')
  const [form,         setForm]         = useState({ shade_name: '', shade_group: 'Medium' })
  const [importStatus, setImportStatus] = useState('')
  const [toast,        setToast]        = useState('')
  const [search,       setSearch]       = useState('')
  const [filterGroup,  setFilterGroup]  = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async (showSpinner = false) => {
    if (showSpinner) setLoading(true)
    try {
      const res  = await fetch('/api/shade-master', { cache: 'no-store' })
      const data = await res.json()
      if (data.ok) setRules(data.data || [])
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load(true) }, [load])

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2500) }

  const save = async () => {
    if (!form.shade_name.trim()) { alert('Keyword required.'); return }
    const dup = rules.find(r =>
      r.shade_name.toLowerCase() === form.shade_name.trim().toLowerCase() && r.id !== editingId
    )
    if (dup) { alert('Keyword already exists.'); return }
    setSaving(true)
    const shade_name  = form.shade_name.trim()
    const shade_group = form.shade_group
    if (editingId) {
      setRules(prev => prev.map(r => r.id === editingId ? { ...r, shade_name, shade_group } : r))
    } else {
      setRules(prev => [...prev, { id: `tmp-${Date.now()}`, shade_name, shade_group, created_at: new Date().toISOString() }]
        .sort((a, b) => a.shade_name.localeCompare(b.shade_name)))
    }
    setShowModal(false)
    showToast('✓ Saved')
    try {
      const res  = await fetch('/api/shade-master', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: editingId ? 'update' : 'create', id: editingId || undefined, shade_name, shade_group }),
      })
      const data = await res.json()
      if (!data.ok) { showToast('⚠ Save failed — refreshing'); load(false) }
      else if (!editingId) load(false)
    } finally { setSaving(false) }
  }

  // Inline group change — no modal needed
  const changeGroup = async (r: ShadeRule, newGroup: string) => {
    setRules(prev => prev.map(x => x.id === r.id ? { ...x, shade_group: newGroup } : x))
    const res  = await fetch('/api/shade-master', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update', id: r.id, shade_name: r.shade_name, shade_group: newGroup }),
    })
    const data = await res.json()
    if (!data.ok) { showToast('⚠ Update failed'); load(false) }
  }

  const del = async (id: string, name: string) => {
    if (!confirm(`Delete "${name}"?`)) return
    setRules(prev => prev.filter(r => r.id !== id))
    showToast('✓ Deleted')
    const res  = await fetch('/api/shade-master', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', id }),
    })
    const data = await res.json()
    if (!data.ok) { showToast('⚠ Delete failed'); load(false) }
  }

  const processRows = async (rows: any[][]) => {
    if (rows.length < 2) { setImportStatus('❌ File is empty'); return }
    const headers = rows[0].map((h: any) => String(h || '').toLowerCase().trim())
    const keyIdx  = headers.findIndex(h => h.includes('keyword') || h.includes('name') || h.includes('colour') || h.includes('color') || h.includes('shade'))
    const grpIdx  = headers.findIndex(h => h.includes('group') || h.includes('type') || h.includes('category'))
    if (keyIdx < 0) { setImportStatus('❌ No keyword/name/colour column found'); return }
    const existing = new Set(rules.map(r => r.shade_name.toLowerCase()))
    const toAdd: { shade_name: string; shade_group: string }[] = []
    for (let i = 1; i < rows.length; i++) {
      const row   = rows[i]
      const name  = String(row[keyIdx] || '').trim()
      const group = grpIdx >= 0 ? String(row[grpIdx] || '').trim() : 'Medium'
      if (!name || existing.has(name.toLowerCase())) continue
      const validGroup = SHADE_GROUPS.includes(group) ? group : 'Medium'
      toAdd.push({ shade_name: name, shade_group: validGroup })
      existing.add(name.toLowerCase())
    }
    if (!toAdd.length) { setImportStatus('⚠ No new keywords found'); setTimeout(() => setImportStatus(''), 4000); return }
    setImportStatus(`⏳ Saving ${toAdd.length} rules…`)
    const res  = await fetch('/api/shade-master', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'bulk_insert', rules: toAdd }),
    })
    const data = await res.json()
    if (!data.ok) { setImportStatus(`❌ ${data.error}`); setTimeout(() => setImportStatus(''), 5000); return }
    setImportStatus(`✅ ${data.inserted} rules imported`)
    setTimeout(() => setImportStatus(''), 4000)
    if (fileRef.current) fileRef.current.value = ''
    load(false)
  }

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    setImportStatus('📂 Reading…')
    try {
      let rows: any[][]
      if (file.name.toLowerCase().endsWith('.csv')) {
        rows = (await file.text()).split(/\r?\n/).filter(l => l.trim())
          .map(l => l.split(',').map(c => c.replace(/^"|"$/g, '').trim()))
      } else {
        const buf = await file.arrayBuffer()
        const wb  = XLSX.read(new Uint8Array(buf), { type: 'array', raw: false })
        rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' }) as any[][]
      }
      await processRows(rows)
    } catch (err: any) { setImportStatus(`❌ ${err.message}`); setTimeout(() => setImportStatus(''), 5000) }
  }

  const groupCounts: Record<string, number> = {}
  rules.forEach(r => { groupCounts[r.shade_group] = (groupCounts[r.shade_group] || 0) + 1 })

  const filtered = rules.filter(r => {
    const matchSearch = !search.trim() || r.shade_name.toLowerCase().includes(search.toLowerCase())
    const matchGroup  = !filterGroup || r.shade_group === filterGroup
    return matchSearch && matchGroup
  })

  const pg = usePagination(filtered, 'dyeflow_pg_shade')
  useEffect(() => { pg.resetPage() }, [search, filterGroup]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="content" style={{ padding: '16px 20px' }}>

      {toast && (
        <div style={{ position: 'fixed', top: 16, right: 20, zIndex: 9999, background: toast.startsWith('⚠') ? '#FEF3C7' : '#D1FAE5', border: `1px solid ${toast.startsWith('⚠') ? '#FCD34D' : '#6EE7B7'}`, borderRadius: 10, padding: '10px 18px', fontSize: 13, fontWeight: 600, color: toast.startsWith('⚠') ? '#92400E' : '#065F46', boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }}>
          {toast}
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>Shade Rule Master</div>
          <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 2 }}>
            Which shade group (Light / Medium / Dark) a colour name belongs to · each keyword is matched anywhere in the colour name, ignoring case
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search keyword…"
            style={{ width: 260, padding: '9px 12px', fontSize: 14, border: '1px solid var(--border-medium)', borderRadius: 8, background: 'var(--bg-primary)', color: 'var(--text-primary)' }} />
          <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" onChange={handleFile} style={{ display: 'none' }} />
          <button onClick={() => fileRef.current?.click()} title="Columns: Keyword, Shade Group (Light / Medium / Dark)"
            style={{ padding: '9px 14px', fontSize: 14, fontWeight: 700, border: '1px solid var(--accent)', borderRadius: 8, background: 'var(--accent-light)', color: 'var(--accent-dark)', cursor: 'pointer' }}>
            📥 Import Excel / CSV
          </button>
          <button className="small" onClick={() => load(false)} title="Refresh" style={{ padding: '9px 12px', fontSize: 14 }}>↻</button>
          <button className="primary" onClick={() => { setEditingId(''); setForm({ shade_name: '', shade_group: 'Medium' }); setShowModal(true) }} style={{ padding: '9px 16px', fontSize: 14, fontWeight: 700 }}>+ New Rule</button>
        </div>
      </div>

      {importStatus && (
        <div style={{ marginBottom: 12, padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600,
          background: importStatus.startsWith('✅') ? '#D1FAE5' : importStatus.startsWith('❌') ? '#FEE2E2' : '#EFF6FF',
          color:      importStatus.startsWith('✅') ? '#065F46' : importStatus.startsWith('❌') ? '#991B1B' : '#1E40AF',
          border: `1px solid ${importStatus.startsWith('✅') ? '#6EE7B7' : importStatus.startsWith('❌') ? '#FCA5A5' : '#BFDBFE'}` }}>
          {importStatus}
        </div>
      )}

      {/* Count cards — click to filter */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <div onClick={() => setFilterGroup('')} style={{ background: 'var(--bg-primary)', border: `2px solid ${!filterGroup ? 'var(--accent)' : 'var(--border-light)'}`, borderRadius: 10, padding: '10px 16px', minWidth: 130, cursor: 'pointer' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>All rules</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--accent)' }}>{rules.length}</div>
        </div>
        {SHADE_GROUPS.map(g => {
          const cfg = GRP[g]; const count = groupCounts[g] || 0; const active = filterGroup === g
          return (
            <div key={g} onClick={() => setFilterGroup(active ? '' : g)}
              style={{ background: 'var(--bg-primary)', border: `2px solid ${active ? cfg.dot : 'var(--border-light)'}`, borderRadius: 10, padding: '10px 16px', minWidth: 130, cursor: 'pointer' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{cfg.icon} {g}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: cfg.dot }}>{count}</div>
            </div>
          )
        })}
      </div>

      {/* Table */}
      <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: 10, overflow: 'auto', maxHeight: 'calc(100vh - 250px)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', minWidth: 900 }}>
          <colgroup>
            <col style={{ width: 60 }} /><col /><col style={{ width: 150 }} /><col style={{ width: 300 }} /><col style={{ width: 120 }} />
          </colgroup>
          <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-secondary)' }}>
            <tr>
              {['#', 'Keyword', 'Shade group', 'Change group', 'Actions'].map(h => (
                <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '2px solid var(--border-light)', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 14 }}>Loading…</td></tr>
            ) : pg.rows.length === 0 ? (
              <tr><td colSpan={5} style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 14 }}>
                {rules.length === 0 ? 'No rules yet. Import an Excel file or click "+ New Rule".' : 'No results.'}
              </td></tr>
            ) : pg.rows.map((r, i) => {
              const cfg = GRP[r.shade_group] || GRP.Medium
              return (
                <tr key={r.id} style={{ borderBottom: '1px solid var(--border-light)', background: i % 2 === 0 ? 'var(--bg-primary)' : 'var(--bg-secondary)' }}>
                  <td style={{ padding: '12px 16px', color: 'var(--text-tertiary)', fontSize: 12 }}>{pg.start + i + 1}</td>
                  <td style={{ padding: '12px 16px', fontWeight: 700, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.shade_name}>{r.shade_name}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`, padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700 }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: cfg.dot, display: 'inline-block' }} />{r.shade_group}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {SHADE_GROUPS.map(g => (
                        <button key={g} onClick={() => r.shade_group !== g && changeGroup(r, g)}
                          style={{ padding: '5px 12px', fontSize: 12, fontWeight: 700, border: `1.5px solid ${r.shade_group === g ? GRP[g].border : 'var(--border-light)'}`, borderRadius: 6, background: r.shade_group === g ? GRP[g].bg : 'var(--bg-primary)', color: r.shade_group === g ? GRP[g].color : 'var(--text-tertiary)', cursor: r.shade_group === g ? 'default' : 'pointer' }}>
                          {g}
                        </button>
                      ))}
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <button className="small danger" onClick={() => del(r.id, r.shade_name)}>Remove</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <PaginationBar {...pg} rowsShown={pg.rows.length} />
      </div>

      {/* ── Modal ── */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title" style={{ fontSize: 16, fontWeight: 700 }}>
                {editingId ? '✏️ Edit Shade Rule' : '+ New Shade Rule'}
              </span>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--text-tertiary)', padding: 4 }}>✕</button>
            </div>

            <div className="form-group" style={{ marginBottom: 18 }}>
              <label style={{ fontWeight: 600, fontSize: 12, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Keyword *</label>
              <input value={form.shade_name} onChange={e => setForm({ ...form, shade_name: e.target.value })}
                placeholder="e.g. navy blue, red, off white" autoFocus
                onKeyDown={e => { if (e.key === 'Enter') save() }}
                style={{ marginTop: 6, fontSize: 14, padding: '10px 12px', fontFamily: 'monospace' }} />
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 5 }}>
                Matched as a substring of the colour name (case-insensitive)
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: 20 }}>
              <label style={{ fontWeight: 600, fontSize: 12, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Shade Group *</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 8 }}>
                {SHADE_GROUPS.map(g => {
                  const cfg    = GRP[g]
                  const active = form.shade_group === g
                  return (
                    <button key={g} onClick={() => setForm({ ...form, shade_group: g })}
                      style={{ padding: '14px 10px', border: `2px solid ${active ? cfg.dot : 'var(--border-light)'}`, borderRadius: 10, background: active ? cfg.bg : 'var(--bg-secondary)', cursor: 'pointer', transition: 'all 0.15s', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 22 }}>{cfg.icon}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: cfg.color }}>{g}</span>
                      <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{groupCounts[g] || 0} rules</span>
                    </button>
                  )
                })}
              </div>
            </div>

            <button onClick={save} disabled={saving || !form.shade_name.trim()}
              style={{ width: '100%', padding: '12px', fontSize: 14, fontWeight: 700, border: 'none', borderRadius: 8, background: saving || !form.shade_name.trim() ? 'var(--bg-secondary)' : '#185FA5', color: saving || !form.shade_name.trim() ? 'var(--text-tertiary)' : '#fff', cursor: saving || !form.shade_name.trim() ? 'not-allowed' : 'pointer' }}>
              {saving ? '⏳ Saving…' : editingId ? '✓ Update Rule' : '✓ Add Rule'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

